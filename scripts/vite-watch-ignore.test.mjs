import assert from "node:assert/strict";
import { test } from "node:test";
import {
  VITE_WATCH_IGNORE_GLOBS,
  VITE_WATCH_IGNORE_REGEXPS,
  isViteWatchIgnored,
  viteWatchOptions,
} from "./vite-watch-ignore.mjs";

const WIN_SQLITE =
  "C:\\Users\\SUBHAJIT\\Music\\Solstice\\src-tauri\\target\\debug\\build\\libsqlite3-sys-c9c9304231228776\\out\\c877a2978823c39d-sqlite3.o";

test("ignores the exact Windows sqlite3.o path that caused EBUSY", () => {
  assert.equal(isViteWatchIgnored(WIN_SQLITE), true);
  assert.ok(VITE_WATCH_IGNORE_REGEXPS.some((re) => re.test(WIN_SQLITE)));
});

test("ignores src-tauri/target on both slash styles", () => {
  assert.equal(isViteWatchIgnored("src-tauri/target"), true);
  assert.equal(isViteWatchIgnored("src-tauri\\target"), true);
  assert.equal(isViteWatchIgnored("/workspace/src-tauri/target/debug/solstice.exe"), true);
  assert.equal(isViteWatchIgnored("C:/Users/me/Solstice/src-tauri/target"), true);
});

test("ignores the whole src-tauri crate (Cargo.lock, .rs, target)", () => {
  assert.equal(isViteWatchIgnored("src-tauri/Cargo.lock"), true);
  assert.equal(isViteWatchIgnored("src-tauri/src/lib.rs"), true);
  assert.equal(isViteWatchIgnored("src-tauri/tauri.conf.json"), true);
});

test("ignores node_modules, dist, dist-tauri, .git", () => {
  assert.equal(isViteWatchIgnored("node_modules/vite/bin/vite.js"), true);
  assert.equal(isViteWatchIgnored("dist/index.html"), true);
  assert.equal(isViteWatchIgnored("dist-tauri/client/index.html"), true);
  assert.equal(isViteWatchIgnored(".git/HEAD"), true);
});

test("does not ignore frontend source that must hot-reload", () => {
  assert.equal(isViteWatchIgnored("src/routes/index.tsx"), false);
  assert.equal(isViteWatchIgnored("src/components/app-shell.tsx"), false);
  assert.equal(isViteWatchIgnored("src/styles.css"), false);
  assert.equal(isViteWatchIgnored("src/lib/store.ts"), false);
  assert.equal(isViteWatchIgnored("public/wallpapers/studio.jpg"), false);
  assert.equal(isViteWatchIgnored("public/videos/rain.mp4"), false);
  assert.equal(isViteWatchIgnored("C:\\Users\\SUBHAJIT\\Music\\Solstice\\src\\lib\\native.ts"), false);
  assert.ok(!VITE_WATCH_IGNORE_REGEXPS.some((re) => re.test("src/lib/native.ts")));
});

test("watch options include function, regex, and Cargo target glob", () => {
  const opts = viteWatchOptions();
  assert.equal(opts.ignorePermissionErrors, true);
  assert.equal(opts.ignored[0], isViteWatchIgnored);
  assert.ok(VITE_WATCH_IGNORE_GLOBS.includes("**/src-tauri/target/**"));
  assert.ok(opts.ignored.includes("**/src-tauri/target/**"));
  assert.ok(opts.ignored.includes("**/src-tauri/**"));
  assert.ok(VITE_WATCH_IGNORE_REGEXPS.every((re) => opts.ignored.includes(re)));
});
