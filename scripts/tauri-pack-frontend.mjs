#!/usr/bin/env node
/** Flatten the TanStack Start SPA output so Tauri can serve index.html and /wallpaper. */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const client = join(root, "dist-tauri", "client");
const assets = join(client, "assets");
const css = readdirSync(assets).find((f) => f.endsWith(".css"));
const shell = join(client, "_shell.html");
let html = readFileSync(shell, "utf8");
if (css) {
  html = html.replace(/\/assets\/styles-[^"']+\.css/g, `/assets/${css}`);
}
writeFileSync(join(client, "index.html"), html);
mkdirSync(join(client, "wallpaper"), { recursive: true });
writeFileSync(join(client, "wallpaper", "index.html"), html);
console.log(`Packed Tauri frontend (css=${css ?? "none"})`);
