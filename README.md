# Aleya

Windows desktop wallpaper studio: photos, GIF, and local video — one at a time, by playlist or time slot. Native wallpaper uses Explorer **WorkerW** (Progman `0x052C` → `SetParent`), not a fake fullscreen window.

The studio shows what is playing, which slot is active, quality/FPS, mute, and a **Set as desktop wallpaper** action. Stop (K) detaches immediately. Closing the window hides Aleya in the tray.

## Clone on Windows 10/11

Git: [git-scm.com/download/win](https://git-scm.com/download/win)  
Also: Node.js 22+, Rust (`rustup`), MSVC **Desktop development with C++**.

```bat
cd C:\Users\SUBHAJIT\Music
ren Aleya Aleya-old
git clone https://github.com/Subhajit-S289865/Aleya.git Aleya
cd Aleya
rmdir /s /q src-tauri\target
npm install
npm run tauri:dev
```

Already cloned? Pull the latest (UI polish + Windows spawn/HWND/EBUSY fixes):

```bat
cd C:\Users\SUBHAJIT\Music\Aleya
git pull
npm install
npm run tauri:dev
```

If you want your old media and icons back:

```bat
xcopy C:\Users\SUBHAJIT\Music\Aleya-old\public C:\Users\SUBHAJIT\Music\Aleya\public /E /Y
xcopy C:\Users\SUBHAJIT\Music\Aleya-old\src-tauri\icons C:\Users\SUBHAJIT\Music\Aleya\src-tauri\icons /E /Y
```

Then Engine → **Set as desktop wallpaper**.

Windows notes: [WINDOWS.md](WINDOWS.md).
