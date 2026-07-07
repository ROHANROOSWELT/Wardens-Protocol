// Backend unit tests (run: `bun test`). Covers the deterministic pieces the demo
// depends on: weighted aggregation, the LTV table, status tiers, and canonical
// evidence hashing. The full agent + on-chain loop is covered end-to-end by the
// demo scripts and the 12 Odra contract tests.
import { expect, test, describe } from "bun:test";
import { aggregateScore, ltvForScore, statusForScore } from "./services/scoreEngine.ts";
import { canonicalizeAndHash } from "./services/evidenceHasher.ts";

describe("scoreEngine", () => {
  test("weighting: fraud carries 0.50", () => {
    // healthy: 95*.25 + 95*.5 + 90*.25 = 93.75 -> 94
    expect(aggregateScore({ parser: 95, fraud: 95, registry: 90 })).toBe(94);
    // confirmed fraud (fraud=0) drives below 50 -> freeze territory
    expect(aggregateScore({ parser: 95, fraud: 0, registry: 90 })).toBe(46);
  });

  test("LTV table matches spec", () => {
    expect(ltvForScore(95)).toBe(75);
    expect(ltvForScore(90)).toBe(75);
    expect(ltvForScore(80)).toBe(60);
    expect(ltvForScore(65)).toBe(40);
    expect(ltvForScore(55)).toBe(20);
    expect(ltvForScore(49)).toBe(0);
  });

  test("status tiers", () => {
    expect(statusForScore(92)).toBe("Healthy");
    expect(statusForScore(75)).toBe("Active");
    expect(statusForScore(55)).toBe("Watchlist");
    expect(statusForScore(30)).toBe("Frozen");
  });
});

describe("evidenceHasher", () => {
  test("canonical: key order does not change the hash", () => {
    const a = canonicalizeAndHash({ b: 1, a: 2, nested: { y: 1, x: 2 } });
    const b = canonicalizeAndHash({ nested: { x: 2, y: 1 }, a: 2, b: 1 });
    expect(a).toBe(b);
  });
  test("different data yields different hash", () => {
    expect(canonicalizeAndHash({ a: 1 })).not.toBe(canonicalizeAndHash({ a: 2 }));
  });
  test("sha256 prefix", () => {
    expect(canonicalizeAndHash({ a: 1 }).startsWith("sha256:")).toBe(true);
  });
});
