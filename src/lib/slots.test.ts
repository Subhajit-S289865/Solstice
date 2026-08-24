import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { migrateSlotClips, migrateSlotMap, slotContains, uniqueWallpaperIds } from "./slots.ts";
import { TIME_SLOTS } from "./types.ts";

describe("slotContains wrap", () => {
  const looner = TIME_SLOTS.find((s) => s.id === "looner")!;
  it("covers late night and early morning", () => {
    assert.equal(slotContains(looner, 22 * 60 + 45), true);
    assert.equal(slotContains(looner, 2 * 60), true);
    assert.equal(slotContains(looner, 4 * 60), false);
  });
});

describe("migrateSlotMap", () => {
  it("maps legacy evening to corebeat", () => {
    const next = migrateSlotMap({ evening: ["a"], night: ["b"] });
    assert.deepEqual(next.corebeat, ["a"]);
    assert.deepEqual(next.looner, ["b"]);
  });
});

describe("migrateSlotClips", () => {
  it("promotes string ids to clips", () => {
    const next = migrateSlotClips(undefined, { morning: ["feat-alpine", "feat-alpine"] });
    assert.equal(next.morning?.length, 2);
    assert.equal(next.morning?.[0]?.wallpaperId, "feat-alpine");
    assert.notEqual(next.morning?.[0]?.clipId, next.morning?.[1]?.clipId);
  });

  it("keeps trim fields", () => {
    const next = migrateSlotClips({
      snacks: [{ clipId: "c1", wallpaperId: "v1", inSec: 1.5, outSec: 9, holdMs: null }],
    });
    assert.equal(next.snacks?.[0]?.inSec, 1.5);
    assert.equal(next.snacks?.[0]?.outSec, 9);
  });

  it("uniqueWallpaperIds drops duplicates", () => {
    const clips = migrateSlotClips(undefined, { morning: ["a", "b", "a"] }).morning ?? [];
    assert.deepEqual(uniqueWallpaperIds(clips), ["a", "b"]);
  });
});
