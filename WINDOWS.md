# Solstice for Windows

This is a **Windows 10/11 desktop app**. WorkerW wallpaper, WebView2, global hotkeys, tray, autostart, and the NSIS installer only exist on Windows.

Your machine is the success environment:

```bat
cd C:\Users\SUBHAJIT\Music\Solstice
npm install
npm run tauri:dev
```

That is `npm run tauri dev` through `scripts/with-app-env.mjs`. Do **not** use WSL, Git Bash (if paths break), or `npx vite` for the desktop app. Command Prompt or PowerShell.

---

## What was checked vs what only your PC can prove

This copy of Solstice was **not** compiled with MSVC, **not** launched in WebView2, and **not** attached to WorkerW. Do not treat anything below as “it ran on Windows.”

### Statically checked (source vs the crates Solstice actually uses)

| Item | Result |
| --- | --- |
| `windows-sys` **0.59** `HWND` / `HDC` / `HMONITOR` are `*mut c_void`, not integers | `wallpaper.rs` uses `hwnd_null()` / `hdc_null()` / `.is_null()`. Integer `HWND == 0` is gone. |
| `GetWindowLongPtrW` / `SetWindowLongPtrW` | Linked only on `x86_64` / `aarch64` / `arm64ec` (your laptop is x64). 32-bit uses `GetWindowLongW` / `SetWindowLongW`. Style is still **get → OR `WS_EX_*` → set**, not a get/set swap. |
| That Win32 module `cargo check --target x86_64-pc-windows-msvc` against `windows-sys 0.59` | **Passed** (isolated crate; Tauri/WebView2 stubbed). |
| `library.rs` rusqlite `stmt` lifetime (`query_map` collected, then `drop(stmt)`) | **Passed** `cargo check` with rusqlite 0.32 bundled. |
| `attach_desktop_later`: clone `AppHandle`, then borrow original for `run_on_main_thread` | **Passed** rustc borrow check. |
| `node scripts/with-app-env.mjs vite --version` | Resolves to `node.exe` + `vite.js`, not `spawn("vite")`. |
| Vite does not watch `src-tauri\target` (the EBUSY `sqlite3.o` path) | Ignore tests include `C:\Users\SUBHAJIT\Music\Solstice\src-tauri\target\...\sqlite3.o`. `src\lib\native.ts` is still watched. |

### You must prove on your Windows PC

- `npm install` && `npm run tauri:dev` with **Rust MSVC** + **Desktop C++** + **WebView2**
- Solstice studio window
- Engine → **Set as desktop wallpaper** (real Progman `0x052C` → WorkerW → `SetParent`)
- Global hotkeys Ctrl+Shift+K / R / arrows / S while another app is focused
- Kill Explorer.exe and wait ~3s for reattach
- `npm run tauri:build` → NSIS `Solstice_1.0.0_x64-setup.exe`

If `cargo` still prints `HWND == 0` or `GetWindowLongPtrW` not found, this folder was not replaced. Confirm `src-tauri\src\wallpaper.rs` contains `fn hwnd_null()` and `fn get_window_long_ptr`.

---

## Prerequisites

1. [Node.js 22+](https://nodejs.org/) (Node 24.18 is fine)
2. [Rust stable](https://rustup.rs/) (`rustup default stable`) — host triple `x86_64-pc-windows-msvc`
3. [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with **Desktop development with C++** and the Windows 10/11 SDK (`cl.exe`, `lib.exe`, `link.exe`)
4. WebView2 Runtime (the NSIS installer can download it)

Restart the terminal after installing Rust / C++ tools.

## Replace this folder

If you unzip a new copy over an old one, delete the compile cache first:

```bat
cd C:\Users\SUBHAJIT\Music\Solstice
rmdir /s /q src-tauri\target
```

Then:

```bat
npm install
npm run tauri:dev
```

`beforeDevCommand` is `node scripts/tauri-dev-frontend.mjs`. That starts Vite as:

```text
node.exe  node_modules\vite\bin\vite.js  dev --host 0.0.0.0 --port 8080
```

Windows never has to `spawn("vite")` (`node_modules\.bin\vite` is `vite.cmd`; Node will not exec `.cmd` without a shell).

You should see:

1. `Solstice frontend already running on 127.0.0.1:8080` **or** Vite compiling (`VITE v8… ready`)
2. Cargo compiling `solstice` (first run: several minutes; rusqlite builds bundled SQLite with MSVC)
3. A **Solstice** window (library, time slots, Engine, Desktop)

Then: Engine → **Set as desktop wallpaper**. Fill screen, trim, playlists, and kill/restart stay in the studio.

If Windows Firewall asks about Node, allow it.

Vite does **not** watch `src-tauri`. Cargo can compile SQLite while HMR reloads `src\`.

### If `spawn vite ENOENT` still appears

Old `scripts/with-app-env.mjs`. It must contain `resolveSpawn`, and `package.json` must have:

```text
"tauri:dev": "node scripts/with-app-env.mjs tauri dev"
```

Quick check (prints a Vite version, not ENOENT):

```bat
node scripts/with-app-env.mjs vite --version
```

### If `EBUSY` on `sqlite3.o` comes back

Old Vite config. `vite.config.ts` and `vite.tauri.config.ts` must call `viteWatchOptions()` and `viteWatchIgnorePlugin()`.

## Production installer

```bat
npm run tauri:build
```

Expected:

```
src-tauri\target\release\bundle\nsis\Solstice_1.0.0_x64-setup.exe
```

Rename to `Solstice-Setup.exe` if you want. Start Menu folder: **Solstice**. Closing the studio hides to the tray; **Quit** from the tray exits.

First production build can take 10–20 minutes (LTO + bundled SQLite).

## After install

1. Watch a folder of photos / GIFs / videos (Engine → Windows desktop).
2. Click a time slot, then click items in the library to insert them.
3. Set as desktop wallpaper.

Data: `%APPDATA%\app.solstice.wallpaper\` (`library.sqlite` + `desktop.json`).

Auth/accounts stay off. Time slots are named and empty until you fill them.
