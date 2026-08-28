//! Native Windows desktop wallpaper layer.
//!
//! # Why WorkerW (not a fullscreen window, not IDesktopWallpaper)
//!
//! `IDesktopWallpaper` (Windows 8+) can only set **still images**. It cannot
//! host video, GIF, or a WebView. A normal always-on-bottom / fullscreen
//! window sits *above* desktop icons and steals focus — it is an app, not
//! wallpaper.
//!
//! Explorer's desktop is a well-known window stack:
//!
//! ```text
//! Progman ("Program Manager")
//!   SHELLDLL_DefView     ← desktop icons, desktop clicks
//! WorkerW                ← spawned behind the icon layer
//!   (our HWND)           ← photos / GIF / video
//! ```
//!
//! Sending the undocumented message `0x052C` to Progman asks Explorer to
//! create that WorkerW. Parenting our window to it places the surface
//! **behind icons and the taskbar, above the static wallpaper**. Other apps
//! paint above us. Clicks hit SHELLDLL_DefView, so we never take mouse or
//! keyboard focus.
//!
//! This is the same hierarchy used by Lively Wallpaper and similar players.
//! Windows 10 treats WorkerW as a *sibling* of Progman; Windows 11 24H2+
//! often creates it as a *child* of Progman. Both layouts are handled.
//!
//! If Explorer restarts, WorkerW is destroyed (and our child HWND with it).
//! `LAST_ATTACH` is the last live WorkerW we parented to. A non-zero value
//! means the user wants wallpaper on; `IsWindow` failing means we must
//! re-send 0x052C and recreate the webview. `clear_intent` is required on
//! Stop so the heartbeat does not glue the layer back on.

#![allow(non_snake_case)]

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct MonitorInfo {
    pub id: String,
    pub name: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub primary: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum CoverMode {
    Same,
    Independent,
    Span,
}

#[cfg(windows)]
mod win {
    use super::{CoverMode, MonitorInfo};
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    use std::mem::zeroed;
    use std::ptr;
    use std::sync::atomic::{AtomicIsize, Ordering};
    use std::time::Duration;
    use tauri::WebviewWindow;
    use windows_sys::Win32::Foundation::{BOOL, GetLastError, HWND, LPARAM, RECT, TRUE};
    use windows_sys::Win32::Graphics::Gdi::{
        EnumDisplayMonitors, GetMonitorInfoW, HDC, HMONITOR, MONITORINFO,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, FindWindowExW, FindWindowW, GetParent, IsWindow, IsChild, MoveWindow, GetWindowRect,
        SendMessageTimeoutW, SetParent, SetWindowPos, ShowWindow, GWL_EXSTYLE, GWL_STYLE,
        SMTO_NORMAL, SWP_NOACTIVATE, SWP_NOZORDER, SWP_SHOWWINDOW, SW_SHOWNOACTIVATE,
        WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_EX_TRANSPARENT, WS_CHILD, WS_POPUP, SWP_FRAMECHANGED,
    };
    #[cfg(not(any(target_arch = "x86_64", target_arch = "aarch64", target_arch = "arm64ec")))]
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetWindowLongW, SetWindowLongW};

    const SPAWN_WORKERW: u32 = 0x052C;
    static LAST_ATTACH: AtomicIsize = AtomicIsize::new(0);

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    #[inline]
    fn hwnd_null() -> HWND {
        ptr::null_mut()
    }

    #[inline]
    fn hdc_null() -> HDC {
        ptr::null_mut()
    }

    /// windows-sys 0.59 links GetWindowLongPtrW only on 64-bit Windows targets.
    #[inline]
    unsafe fn get_window_long_ptr(hwnd: HWND, index: i32) -> isize {
        #[cfg(any(target_arch = "x86_64", target_arch = "aarch64", target_arch = "arm64ec"))]
        {
            windows_sys::Win32::UI::WindowsAndMessaging::GetWindowLongPtrW(hwnd, index)
        }
        #[cfg(not(any(target_arch = "x86_64", target_arch = "aarch64", target_arch = "arm64ec")))]
        {
            GetWindowLongW(hwnd, index) as isize
        }
    }

    #[inline]
    unsafe fn set_window_long_ptr(hwnd: HWND, index: i32, value: isize) -> isize {
        #[cfg(any(target_arch = "x86_64", target_arch = "aarch64", target_arch = "arm64ec"))]
        {
            windows_sys::Win32::UI::WindowsAndMessaging::SetWindowLongPtrW(hwnd, index, value)
        }
        #[cfg(not(any(target_arch = "x86_64", target_arch = "aarch64", target_arch = "arm64ec")))]
        {
            SetWindowLongW(hwnd, index, value as i32) as isize
        }
    }

    pub fn hwnd_of(window: &WebviewWindow) -> Result<isize, String> {
        let handle = window
            .window_handle()
            .map_err(|e| format!("window handle: {e}"))?;
        match handle.as_raw() {
            RawWindowHandle::Win32(h) => Ok(h.hwnd.get() as isize),
            _ => Err("not a Win32 window".into()),
        }
    }

    unsafe fn spawn_workerw() {
        let progman = FindWindowW(wide("Progman").as_ptr(), ptr::null());
        if progman.is_null() {
            return;
        }
        let mut result: usize = 0;
        // Two variants: classic (0,0) and Win11 24H2 (0xD, 0/1).
        SendMessageTimeoutW(
            progman,
            SPAWN_WORKERW,
            0,
            0,
            SMTO_NORMAL,
            1000,
            &mut result,
        );
        SendMessageTimeoutW(
            progman,
            SPAWN_WORKERW,
            0xD,
            0,
            SMTO_NORMAL,
            1000,
            &mut result,
        );
        SendMessageTimeoutW(
            progman,
            SPAWN_WORKERW,
            0xD,
            1,
            SMTO_NORMAL,
            1000,
            &mut result,
        );
        std::thread::sleep(Duration::from_millis(80));
    }

    unsafe fn find_workerw() -> HWND {
        let progman = FindWindowW(wide("Progman").as_ptr(), ptr::null());
        let workerw = wide("WorkerW");
        let defview = wide("SHELLDLL_DefView");

        // Win11: WorkerW child of Progman that does NOT host the icon view.
        if !progman.is_null() {
            let mut child = FindWindowExW(progman, hwnd_null(), workerw.as_ptr(), ptr::null());
            while !child.is_null() {
                let def = FindWindowExW(child, hwnd_null(), defview.as_ptr(), ptr::null());
                if def.is_null() {
                    return child;
                }
                child = FindWindowExW(progman, child, workerw.as_ptr(), ptr::null());
            }
        }

        // Win10: WorkerW sibling after the window that contains SHELLDLL_DefView.
        let mut found: HWND = hwnd_null();
        unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
            let defview = wide("SHELLDLL_DefView");
            let workerw = wide("WorkerW");
            let def = FindWindowExW(hwnd, hwnd_null(), defview.as_ptr(), ptr::null());
            if !def.is_null() {
                let next = FindWindowExW(hwnd_null(), hwnd, workerw.as_ptr(), ptr::null());
                if !next.is_null() {
                    *(lparam as *mut HWND) = next;
                    return 0;
                }
            }
            TRUE
        }
        EnumWindows(Some(enum_proc), &mut found as *mut HWND as LPARAM);
        if !found.is_null() {
            return found;
        }
        hwnd_null()
    }

    fn virtual_screen() -> (i32, i32, i32, i32) {
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            GetSystemMetrics, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN,
            SM_YVIRTUALSCREEN,
        };
        unsafe {
            (
                GetSystemMetrics(SM_XVIRTUALSCREEN),
                GetSystemMetrics(SM_YVIRTUALSCREEN),
                GetSystemMetrics(SM_CXVIRTUALSCREEN),
                GetSystemMetrics(SM_CYVIRTUALSCREEN),
            )
        }
    }

    pub fn list_monitors() -> Vec<MonitorInfo> {
        struct Ctx {
            items: Vec<MonitorInfo>,
        }
        unsafe extern "system" fn proc(
            hmon: HMONITOR,
            _hdc: HDC,
            _lprc: *mut RECT,
            data: LPARAM,
        ) -> BOOL {
            let ctx = &mut *(data as *mut Ctx);
            let mut info: MONITORINFO = zeroed();
            info.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
            if GetMonitorInfoW(hmon, &mut info) == 0 {
                return TRUE;
            }
            let r = info.rcMonitor;
            let primary = (info.dwFlags & 1) != 0;
            ctx.items.push(MonitorInfo {
                id: format!("m{}", ctx.items.len()),
                name: format!("Display {}", ctx.items.len() + 1),
                x: r.left,
                y: r.top,
                width: r.right.saturating_sub(r.left) as u32,
                height: r.bottom.saturating_sub(r.top) as u32,
                primary,
            });
            TRUE
        }
        let mut ctx = Ctx { items: Vec::new() };
        unsafe {
            EnumDisplayMonitors(hdc_null(), ptr::null(), Some(proc), &mut ctx as *mut Ctx as LPARAM);
        }
        if ctx.items.is_empty() {
            let (x, y, w, h) = virtual_screen();
            ctx.items.push(MonitorInfo {
                id: "m0".into(),
                name: "Display".into(),
                x,
                y,
                width: w.max(1) as u32,
                height: h.max(1) as u32,
                primary: true,
            });
        }
        ctx.items
    }

    unsafe fn style_as_wallpaper(hwnd: HWND) {
        // Keep this as a top-level popup until SetParent succeeds. Changing to
        // WS_CHILD before parenting can make WebView2 stop painting on some
        // Windows builds.
        let ex = get_window_long_ptr(hwnd, GWL_EXSTYLE);
        set_window_long_ptr(
            hwnd,
            GWL_EXSTYLE,
            ex | WS_EX_NOACTIVATE as isize | WS_EX_TOOLWINDOW as isize | WS_EX_TRANSPARENT as isize,
        );
        SetWindowPos(hwnd, hwnd_null(), 0, 0, 0, 0,
            SWP_NOACTIVATE | SWP_NOZORDER | SWP_FRAMECHANGED);
    }

    unsafe fn finalize_child_style(hwnd: HWND) {
        let style = get_window_long_ptr(hwnd, GWL_STYLE);
        let child_style = (style | WS_CHILD as isize) & !(WS_POPUP as isize);
        set_window_long_ptr(hwnd, GWL_STYLE, child_style);
        SetWindowPos(hwnd, hwnd_null(), 0, 0, 0, 0,
            SWP_NOACTIVATE | SWP_NOZORDER | SWP_FRAMECHANGED);
    }

    pub fn attach(
        window: &WebviewWindow,
        mode: CoverMode,
        monitor: Option<&MonitorInfo>,
    ) -> Result<(), String> {
        // Keep the surface hidden until the frontend has painted its first frame.
        let _ = window.hide();
        let _ = window.set_ignore_cursor_events(true);
        let hwnd = hwnd_of_retry(window)? as HWND;
        unsafe {
            spawn_workerw();
            let mut worker = find_workerw();
            if worker.is_null() {
                spawn_workerw();
                worker = find_workerw();
            }
            if worker.is_null() {
                return Err("Explorer WorkerW was not created. Desktop wallpaper needs Windows Explorer.".into());
            }
            eprintln!("[Solstice] Wallpaper HWND={hwnd:p} WorkerW={worker:p}");
            style_as_wallpaper(hwnd);

            // Clear last-error before SetParent: NULL is also a valid previous
            // parent, so the parent after the call is the authoritative result.
            windows_sys::Win32::Foundation::SetLastError(0);
            let previous = SetParent(hwnd, worker);
            let last_error = GetLastError();

            // SetParent returning NULL is ambiguous only when GetLastError is non-zero.
            // Do not use GetParent alone while the window is still WS_POPUP: on WebView2
            // builds Windows can report NULL for a newly reparented popup until WS_CHILD is
            // applied. Convert the style first, then verify both APIs.
            if previous.is_null() && last_error != 0 {
                return Err(format!("SetParent to WorkerW failed: error={last_error}"));
            }
            finalize_child_style(hwnd);
            let current = GetParent(hwnd);
            let is_child = IsChild(worker, hwnd);
            eprintln!("[Solstice] SetParent previous={previous:p} current={current:p} worker={worker:p} isChild={is_child} error={last_error}");
            if current != worker && is_child == 0 {
                return Err(format!("SetParent verification failed: parent={current:p}, worker={worker:p}, isChild={is_child}, error={last_error}"));
            }
            let (x, y, w, h) = match (mode, monitor) {
                (CoverMode::Independent, Some(m)) => (m.x, m.y, m.width as i32, m.height as i32),
                _ => virtual_screen(),
            };
            // A child window is positioned in parent coordinates. WorkerW covers
            // the virtual desktop, so convert the monitor rectangle to that origin.
            let (vx, vy, _, _) = virtual_screen();
            let rx = x - vx;
            let ry = y - vy;
            if MoveWindow(hwnd, rx, ry, w.max(1), h.max(1), TRUE) == 0 {
                return Err(format!("MoveWindow failed: {}", GetLastError()));
            }
            SetWindowPos(hwnd, hwnd_null(), rx, ry, w.max(1), h.max(1),
                SWP_NOACTIVATE | SWP_NOZORDER);
            // Revealed later by wallpaper_ready after the frontend paints.

            let mut rect: RECT = zeroed();
            if GetWindowRect(hwnd, &mut rect) != 0 {
                eprintln!("[Solstice] Wallpaper visible rect=({}, {}) {}x{} parent={:p}",
                    rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top, GetParent(hwnd));
            } else {
                eprintln!("[Solstice] GetWindowRect failed: {}", GetLastError());
            }
            LAST_ATTACH.store(worker as isize, Ordering::SeqCst);
        }
        let _ = window.set_skip_taskbar(true);
        let _ = window.set_decorations(false);
        let _ = window.set_ignore_cursor_events(true);
        Ok(())
    }

    fn hwnd_of_retry(window: &WebviewWindow) -> Result<isize, String> {
        let mut last = "no window handle".to_string();
        for i in 0..12 {
            match hwnd_of(window) {
                Ok(h) => return Ok(h),
                Err(e) => {
                    last = e;
                    if i < 11 {
                        std::thread::sleep(Duration::from_millis(50));
                    }
                }
            }
        }
        Err(last)
    }

    pub fn detach(window: &WebviewWindow) -> Result<(), String> {
        let hwnd = match hwnd_of(window) {
            Ok(h) => h as HWND,
            Err(_) => return Ok(()),
        };
        unsafe {
            SetParent(hwnd, hwnd_null());
            ShowWindow(hwnd, 0); // SW_HIDE
        }
        let _ = window.hide();
        Ok(())
    }

    pub fn clear_intent() {
        LAST_ATTACH.store(0, Ordering::SeqCst);
    }

    pub fn heartbeat_needed() -> bool {
        let last = LAST_ATTACH.load(Ordering::SeqCst);
        if last == 0 {
            return false;
        }
        unsafe {
            if IsWindow(last as HWND) == 0 {
                return true;
            }
            let progman = FindWindowW(wide("Progman").as_ptr(), ptr::null());
            if progman.is_null() {
                return true;
            }
        }
        false
    }
}

#[cfg(not(windows))]
mod win {
    use super::{CoverMode, MonitorInfo};
    use tauri::WebviewWindow;

    pub fn list_monitors() -> Vec<MonitorInfo> {
        vec![MonitorInfo {
            id: "m0".into(),
            name: "Primary".into(),
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
            primary: true,
        }]
    }

    pub fn attach(
        _window: &WebviewWindow,
        _mode: CoverMode,
        _monitor: Option<&MonitorInfo>,
    ) -> Result<(), String> {
        Err("Desktop wallpaper is a Windows-only API (Progman/WorkerW).".into())
    }

    pub fn detach(window: &WebviewWindow) -> Result<(), String> {
        let _ = window.hide();
        Ok(())
    }

    pub fn clear_intent() {}

    pub fn heartbeat_needed() -> bool {
        false
    }
}

pub use win::{attach, clear_intent, detach, heartbeat_needed, list_monitors};
