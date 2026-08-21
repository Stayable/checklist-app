import { afterEach, describe, expect, it } from "vitest";
import {
  acquirePosition,
  GPS_MAX_AGE_MS,
  GPS_TIMEOUT_MS,
  type GeoFailure,
} from "./image";

// Only the geolocation half of lib/image.ts is exercised here — compressImage
// needs canvas and belongs to a browser-env suite. These tests exist because
// the failure REASON is the whole point: production held four photos with no
// coordinates and no way to tell why (2026-08-20).

type Success = { coords: { latitude: number; longitude: number; accuracy: number } };

const originalNavigator = globalThis.navigator;

function stubGeolocation(
  impl: (
    ok: (p: Success) => void,
    fail: (e: { code: number; message: string }) => void,
    opts: PositionOptions | undefined,
  ) => void,
) {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { geolocation: { getCurrentPosition: impl } },
  });
}

function removeNavigator() {
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: undefined });
}

afterEach(() => {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: originalNavigator,
  });
});

describe("acquirePosition", () => {
  it("returns the fix with its accuracy on success", async () => {
    stubGeolocation((ok) =>
      ok({ coords: { latitude: 28.0918, longitude: -81.9498, accuracy: 39.5 } }),
    );
    const res = await acquirePosition();
    expect(res).toEqual({
      ok: true,
      position: { latitude: 28.0918, longitude: -81.9498, accuracy: 39.5 },
    });
  });

  // The three DOM error codes must map to distinguishable reasons — a single
  // opaque failure is what made the first production photos undiagnosable.
  const CODES: Array<[number, GeoFailure]> = [
    [1, "denied"],
    [2, "unavailable"],
    [3, "timeout"],
  ];
  for (const [code, reason] of CODES) {
    it(`maps error code ${code} to "${reason}"`, async () => {
      stubGeolocation((_ok, fail) => fail({ code, message: "stub" }));
      expect(await acquirePosition()).toEqual({ ok: false, reason });
    });
  }

  it("treats an unrecognised error code as a timeout rather than throwing", async () => {
    stubGeolocation((_ok, fail) => fail({ code: 99, message: "unknown" }));
    expect(await acquirePosition()).toEqual({ ok: false, reason: "timeout" });
  });

  it("reports unsupported when there is no geolocation, and never rejects", async () => {
    removeNavigator();
    // Resolving rather than rejecting is deliberate: every caller treats a
    // missing fix as informational, so a throw would only invite an empty catch
    // — which is exactly the bug being fixed here.
    await expect(acquirePosition()).resolves.toEqual({ ok: false, reason: "unsupported" });
  });

  it("asks for high accuracy, a real deadline, and permits a recent cached fix", async () => {
    let seen: PositionOptions | undefined;
    stubGeolocation((ok, _fail, opts) => {
      seen = opts;
      ok({ coords: { latitude: 0, longitude: 0, accuracy: 10 } });
    });
    await acquirePosition();
    // enableHighAccuracy stays true on purpose: the server derives the geofence
    // verdict from coordinates alone, so a kilometre-wide fix would produce a
    // confident wrong verdict instead of no verdict.
    expect(seen?.enableHighAccuracy).toBe(true);
    expect(seen?.timeout).toBe(GPS_TIMEOUT_MS);
    expect(seen?.maximumAge).toBe(GPS_MAX_AGE_MS);
  });

  it("keeps the deadline long enough for a cold receiver", () => {
    // Regression guard on the actual defect: the old 10s deadline expired
    // before a cold fix landed, while a warm one arrived ~26s into the session.
    expect(GPS_TIMEOUT_MS).toBeGreaterThanOrEqual(25_000);
    expect(GPS_MAX_AGE_MS).toBeGreaterThan(0);
  });

  it("honours explicit overrides", async () => {
    let seen: PositionOptions | undefined;
    stubGeolocation((ok, _fail, opts) => {
      seen = opts;
      ok({ coords: { latitude: 0, longitude: 0, accuracy: 1 } });
    });
    await acquirePosition(5_000, 0);
    expect(seen?.timeout).toBe(5_000);
    expect(seen?.maximumAge).toBe(0);
  });
});
