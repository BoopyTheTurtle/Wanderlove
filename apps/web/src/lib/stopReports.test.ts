import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("./supabase", () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }));

import {
  REPORTED_PLACES_TTL_MS,
  clearReportedPlaces,
  loadReportedPlaces,
  reportFailure,
  reportStop,
  surpriseRouteOptions,
} from "./stopReports";

const listed = [{ lat: 56.95, lng: 24.1 }];
const stop = {
  id: "s2",
  name: "Bench",
  lat: 56.9512,
  lng: 24.1134,
  start: { lat: 56.9, lng: 24.0 },
  path: [{ lat: 56.9, lng: 24.0 }],
};

beforeEach(() => {
  clearReportedPlaces();
  rpc.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("reportStop", () => {
  it("sends only the stop's position, the reason, and the note", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await reportStop(stop, "unsafe", "  Busy road, no pavement  ");
    expect(rpc).toHaveBeenCalledWith("report_stop", {
      p_lat: 56.9512,
      p_lng: 24.1134,
      p_reason: "unsafe",
      p_note: "Busy road, no pavement",
    });
  });

  it("leaves out an empty note", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await reportStop(stop, "unpleasant", "   ");
    expect(rpc).toHaveBeenCalledWith("report_stop", { p_lat: 56.9512, p_lng: 24.1134, p_reason: "unpleasant" });
  });

  it("throws the server's error", async () => {
    const error = { code: "P0001", message: "too_many_reports" };
    rpc.mockResolvedValue({ data: null, error });
    await expect(reportStop(stop, "unsafe", "")).rejects.toBe(error);
  });
});

describe("loadReportedPlaces", () => {
  it("downloads the list once and serves it from memory for ten minutes", async () => {
    rpc.mockResolvedValue({ data: listed, error: null });
    expect(await loadReportedPlaces(1000)).toEqual(listed);
    expect(await loadReportedPlaces(1000 + REPORTED_PLACES_TTL_MS - 1)).toEqual(listed);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("reported_places");
    await loadReportedPlaces(1000 + REPORTED_PLACES_TTL_MS);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("adds a stop the moment it is reported", async () => {
    rpc.mockResolvedValueOnce({ data: listed, error: null });
    await loadReportedPlaces(1000);
    rpc.mockResolvedValueOnce({ data: null, error: null });
    await reportStop(stop, "unsafe", "");
    expect(await loadReportedPlaces(2000)).toEqual([...listed, { lat: 56.9512, lng: 24.1134 }]);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("forgets the list on sign-out", async () => {
    rpc.mockResolvedValue({ data: listed, error: null });
    await loadReportedPlaces(1000);
    clearReportedPlaces();
    await loadReportedPlaces(2000);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("drops a download that finishes after sign-out", async () => {
    let finish: (v: unknown) => void = () => {};
    rpc.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    const pending = loadReportedPlaces(1000);
    clearReportedPlaces();
    finish({ data: listed, error: null });
    await pending;
    rpc.mockResolvedValueOnce({ data: [], error: null });
    expect(await loadReportedPlaces(2000)).toEqual([]);
  });
});

describe("surpriseRouteOptions", () => {
  it("passes the reported places as avoid", async () => {
    rpc.mockResolvedValue({ data: listed, error: null });
    expect(await surpriseRouteOptions(1500)).toEqual({ maxMeters: 1500, avoid: listed });
  });

  it("avoids nothing when the list fails to load", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "TypeError: Failed to fetch" } });
    expect(await surpriseRouteOptions()).toEqual({ maxMeters: undefined, avoid: [] });
  });

  it("still avoids this phone's own reports when the list fails to load", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    await reportStop(stop, "unsafe", "");
    rpc.mockResolvedValueOnce({ data: null, error: { message: "TypeError: Failed to fetch" } });
    expect((await surpriseRouteOptions()).avoid).toEqual([{ lat: 56.9512, lng: 24.1134 }]);
  });
});

describe("reportFailure", () => {
  it("names the daily limit", () => {
    expect(reportFailure({ code: "P0001", message: "too_many_reports" }, true)).toBe("tooMany");
  });

  it("names a missing connection", () => {
    expect(reportFailure({ message: "TypeError: Failed to fetch" }, true)).toBe("offline");
    expect(reportFailure({ code: "P0001", message: "position_invalid" }, false)).toBe("offline");
  });

  it("calls anything else a plain failure", () => {
    expect(reportFailure({ code: "P0001", message: "position_invalid" }, true)).toBe("other");
    expect(reportFailure(null, true)).toBe("other");
  });
});
