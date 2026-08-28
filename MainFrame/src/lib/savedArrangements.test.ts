// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect } from "vitest";
import { addArrangement, removeArrangement, type SavedArrangement } from "./savedArrangements";

describe("addArrangement", () => {
  it("appends a new entry with the given name and data", () => {
    const result = addArrangement<number[]>([], "My Design", [1, 2, 3]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("My Design");
    expect(result[0].data).toEqual([1, 2, 3]);
    expect(typeof result[0].id).toBe("string");
    expect(result[0].id.length).toBeGreaterThan(0);
    expect(() => new Date(result[0].savedAt).toISOString()).not.toThrow();
  });

  it("does not mutate the input list", () => {
    const list: SavedArrangement<number>[] = [];
    addArrangement(list, "Name", 1);
    expect(list).toHaveLength(0);
  });

  it("generates unique ids across multiple adds", () => {
    let list: SavedArrangement<number>[] = [];
    list = addArrangement(list, "A", 1);
    list = addArrangement(list, "B", 2);
    list = addArrangement(list, "C", 3);
    const ids = list.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(3);
  });

  it("preserves existing entries when appending", () => {
    const first = addArrangement<number>([], "A", 1);
    const second = addArrangement(first, "B", 2);
    expect(second).toHaveLength(2);
    expect(second[0].name).toBe("A");
    expect(second[1].name).toBe("B");
  });
});

describe("removeArrangement", () => {
  it("removes only the entry with the matching id", () => {
    let list: SavedArrangement<number>[] = [];
    list = addArrangement(list, "A", 1);
    list = addArrangement(list, "B", 2);
    const targetId = list[0].id;

    const result = removeArrangement(list, targetId);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("B");
  });

  it("is a no-op for an unknown id", () => {
    const list = addArrangement<number>([], "A", 1);
    const result = removeArrangement(list, "does-not-exist");
    expect(result).toEqual(list);
  });

  it("does not mutate the input list", () => {
    const list = addArrangement<number>([], "A", 1);
    removeArrangement(list, list[0].id);
    expect(list).toHaveLength(1);
  });
});
