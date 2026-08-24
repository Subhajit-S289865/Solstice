# Solstice

Windows desktop wallpaper studio: photos, GIF, and local video — one at a time, by playlist or time slot. Native wallpaper uses Explorer **WorkerW** (Progman `0x052C` → `SetParent`), not a fake fullscreen window.

## Clone on Windows 10/11

Git: [git-scm.com/download/win](https://git-scm.com/download/win)  
Also: Node.js 22+, Rust (`rustup`), MSVC **Desktop development with C++**.

```bat
cd C:\Users\SUBHAJIT\Music
ren Solstice Solstice-old
git clone https://github.com/Subhajit-S289865/Solstice.git Solstice
cd Solstice
rmdir /s /q src-tauri\target
npm install
npm run tauri:dev
```

If you want your old media and icons back:

```bat
xcopy C:\Users\SUBHAJIT\Music\Solstice-old\public C:\Users\SUBHAJIT\Music\Solstice\public /E /Y
xcopy C:\Users\SUBHAJIT\Music\Solstice-old\src-tauri\icons C:\Users\SUBHAJIT\Music\Solstice\src-tauri\icons /E /Y
```

Then Engine → **Set as desktop wallpaper**.

Windows notes: [WINDOWS.md](WINDOWS.md).
