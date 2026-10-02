import { describe, expect, it, vi } from "vitest";
import { trail } from "@wannadoo/core";
import { DecryptionError, generateRunKey } from "./crypto";
import { openJson, sealJson } from "./sealed";
import { fromRunDetails, fromRunSummary, toRunDetails, toRunSummary } from "./runSnapshot";
import { lockedTrail, sealedStartArgs, trailFromRow } from "./runs";

vi.mock("./supabase", () => ({ supabase: {} }));

const RUN = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

describe("sealJson and openJson", () => {
  it("round-trips a value for its run and purpose", async () => {
    const key = await generateRunKey();
    const sealed = await sealJson({ a: 1 }, key, RUN, "details");
    expect(await openJson(sealed, key, RUN, "details")).toEqual({ a: 1 });
  });

  it("refuses another run, another purpose, or another key", async () => {
    const key = await generateRunKey();
    const sealed = await sealJson({ a: 1 }, key, RUN, "details");
    await expect(openJson(sealed, key, OTHER, "details")).rejects.toBeInstanceOf(DecryptionError);
    await expect(openJson(sealed, key, RUN, "summary")).rejects.toBeInstanceOf(DecryptionError);
    await expect(openJson(sealed, await generateRunKey(), RUN, "details")).rejects.toBeInstanceOf(DecryptionError);
  });
});

describe("run details and summary", () => {
  it("names stops by position and keeps everything else of the trail", () => {
    const back = fromRunDetails(JSON.parse(JSON.stringify(toRunDetails(trail))));
    expect(back.id).toBe(trail.id);
    expect(back.stops.map((s) => s.id)).toEqual(trail.stops.map((_, i) => `s${i + 1}`));
    expect(back.stops.map((s) => s.name)).toEqual(trail.stops.map((s) => s.name));
    expect(back.stops[0].lat).toBe(trail.stops[0].lat);
    expect(back.stops[0].prompt).toBe(trail.stops[0].prompt);
  });

  it("never seals start or path in the details", () => {
    const routed = { ...trail, start: { lat: 56.95, lng: 24.1 }, path: [[56.95, 24.1]] as [number, number][] };
    const json = JSON.parse(JSON.stringify(toRunDetails(routed)));
    expect(json).not.toHaveProperty("start");
    expect(json).not.toHaveProperty("path");
  });

  it("keeps names but no place in the summary", () => {
    const summary = JSON.parse(JSON.stringify(toRunSummary(trail, new Date(2026, 8, 30, 10))));
    expect(summary.startedOn).toBe("2026-09-30");
    expect(JSON.stringify(summary)).not.toMatch(/lat|lng|image|prompt/);
    const back = fromRunSummary(summary);
    expect(back.name).toBe(trail.name);
    expect(back.id).toBe(trail.id);
    expect(back.stops.map((s) => [s.id, s.name, s.lat])).toEqual(trail.stops.map((s, i) => [`s${i + 1}`, s.name, 0]));
  });
});

describe("trailFromRow", () => {
  async function sealedRow(withDetails: boolean) {
    const key = await generateRunKey();
    const args = await sealedStartArgs(trail, key, RUN);
    return {
      key,
      args,
      row: {
        id: RUN,
        trail_id: "private",
        trail_snapshot: null,
        details_ciphertext: withDetails ? args.p_details : null,
        details_nonce: withDetails ? args.p_details_nonce : null,
        summary_ciphertext: args.p_summary,
        summary_nonce: args.p_summary_nonce,
      },
    };
  }

  it("opens the details of a private run", async () => {
    const { key, args, row } = await sealedRow(true);
    expect(args.p_trail_id).toBe("private");
    expect(args.p_stop_count).toBe(trail.stops.length);
    expect(args.p_details).not.toContain(trail.stops[0].name);
    const back = await trailFromRow(row, async () => key);
    expect(back.stops[0].prompt).toBe(trail.stops[0].prompt);
  });

  it("falls back to the summary once the trim dropped the details", async () => {
    const { key, row } = await sealedRow(false);
    const back = await trailFromRow(row, async () => key);
    expect(back.name).toBe(trail.name);
    expect(back.stops[0].lat).toBe(0);
  });

  it("refuses a private run without its key", async () => {
    const { row } = await sealedRow(true);
    await expect(trailFromRow(row, async () => null)).rejects.toThrow();
  });

  it("stands in a locked trail with the right number of stops", () => {
    expect(lockedTrail(4).stops).toHaveLength(4);
  });
});
