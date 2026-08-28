// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect } from "vitest";
import { ICON_HEIGHT, ICON_WIDTH, ICONS, getIcon } from "./matrixIcons";

describe("getIcon", () => {
  it("returns a defined icon with the correct pixel count", () => {
    const battery = getIcon("battery");
    expect(battery).toBeDefined();
    expect(battery?.pixels).toHaveLength(ICON_WIDTH * ICON_HEIGHT);
  });

  it("returns undefined for an unknown id", () => {
    expect(getIcon("nonexistent")).toBeUndefined();
  });
});

describe("ICONS", () => {
  it("is non-empty and every entry has the correct pixel count", () => {
    expect(ICONS.length).toBeGreaterThan(0);
    for (const icon of ICONS) {
      expect(icon.pixels).toHaveLength(ICON_WIDTH * ICON_HEIGHT);
    }
  });

  it("has unique ids", () => {
    const ids = ICONS.map((icon) => icon.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
