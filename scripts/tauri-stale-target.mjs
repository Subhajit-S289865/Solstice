#!/usr/bin/env node
/**
 * A workspace copied from Linux onto Windows still contains
 * `src-tauri/target` with `.so` artifacts. Cargo usually rebuilds, but
 * incremental fingerprints can fail in confusing ways. Wipe that cache
 * only when we are on Windows and Linux objects are present.
 */
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

function depsHave(dir, suffix) {
  try {
    return readdirSync(dir).some((f) => f.endsWith(suffix));
  } catch {
    return false;
  }
}

export function wipeStaleTarget(root) {
  if (process.platform !== "win32") return false;
  const target = join(root, "src-tauri", "target");
  if (!existsSync(target)) return false;

  const linuxMarkers = [
    join(target, "debug", "solstice"),
    join(target, "debug", "libsolstice_lib.so"),
    join(target, "release", "solstice"),
    join(target, "release", "libsolstice_lib.so"),
  ];
  const stale =
    linuxMarkers.some((p) => existsSync(p)) ||
    depsHave(join(target, "debug", "deps"), ".so") ||
    depsHave(join(target, "release", "deps"), ".so");

  if (!stale) return false;
  console.log(
    "[solstice] Removing src-tauri/target because it was compiled on another OS. Windows will rebuild.",
  );
  rmSync(target, { recursive: true, force: true });
  return true;
}
