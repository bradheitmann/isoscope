import { afterEach, describe, expect, it } from "vitest";
import { dpIconMetric } from "../src/App";

describe("Desert Pants icon metrics", () => {
  afterEach(() => document.documentElement.removeAttribute("style"));

  it("reads the exact CSS token for an icon dimension or stroke", () => {
    document.documentElement.style.setProperty("--dp-icon-size-18", "18px");
    document.documentElement.style.setProperty("--dp-icon-stroke-regular", "2");
    expect(dpIconMetric("--dp-icon-size-18")).toBe(18);
    expect(dpIconMetric("--dp-icon-stroke-regular")).toBe(2);
  });

  it("fails clearly when an icon token is absent instead of picking a visual fallback", () => {
    expect(() => dpIconMetric("--dp-icon-size-18")).toThrow(/Missing Desert Pants icon metric/);
  });
});
