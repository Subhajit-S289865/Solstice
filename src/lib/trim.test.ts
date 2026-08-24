import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MIN_SPAN,
  clampTrim,
  clipPlayMs,
  clipUsesMediaClock,
  formatTimecode,
  makeClip,
} from "./trim.ts";
import type { SlotClip } from "./types.ts";

describe("clampTrim", () => {
  it("keeps a valid in/out window", () => {
    const t = clampTrim(4, 12, 20);
    assert.equal(t.inSec, 4);
    assert.equal(t.outSec, 12);
  });

  it("forces a minimum span", () => {
    const t = clampTrim(5, 5.05, 20);
    assert.ok((t.outSec ?? 0) - t.inSec >= MIN_SPAN - 1e-6);
  });

  it("clamps past the duration", () => {
    const t = clampTrim(-2, 99, 10);
    assert.equal(t.inSec, 0);
    assert.equal(t.outSec, 10);
  });

  it("allows open-ended out", () => {
    const t = clampTrim(3, null, 10);
    assert.equal(t.inSec, 3);
    assert.equal(t.outSec, null);
  });
});

describe("formatTimecode", () => {
  it("formats minutes and tenths", () => {
    assert.equal(formatTimecode(0), "0:00");
    assert.equal(formatTimecode(65), "1:05");
    assert.equal(formatTimecode(12.4), "0:12.4");
    assert.equal(formatTimecode(3661), "1:01:01");
  });
});

describe("clipPlayMs", () => {
  const photo = { kind: "photo" as const, mime: "image/jpeg" };
  const live = { kind: "live" as const, mime: "video/mp4" };
  const clip = (patch: Partial<SlotClip> = {}): SlotClip => ({
    clipId: "c1",
    wallpaperId: "w1",
    inSec: 0,
    outSec: null,
    holdMs: null,
    ...patch,
  });

  it("uses interval for stills without a hold", () => {
    assert.equal(clipPlayMs(clip(), photo, 30_000), 30_000);
  });

  it("uses hold for stills", () => {
    assert.equal(clipPlayMs(clip({ holdMs: 10_000 }), photo, 30_000), 10_000);
  });

  it("uses in/out for video", () => {
    assert.equal(clipPlayMs(clip({ inSec: 2, outSec: 8 }), live, 30_000), 6000);
  });

  it("uses remaining duration when out is open", () => {
    assert.equal(clipPlayMs(clip({ inSec: 5 }), live, 30_000, 20), 15_000);
  });
});

describe("clipUsesMediaClock", () => {
  it("is true for unheld video", () => {
    assert.equal(
      clipUsesMediaClock(makeClip("v"), { kind: "live", mime: "video/mp4" }),
      true,
    );
  });
  it("is false when a hold is set", () => {
    assert.equal(
      clipUsesMediaClock(makeClip("v", { holdMs: 4000 }), { kind: "live", mime: "video/mp4" }),
      false,
    );
  });
});
