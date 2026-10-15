import { describe, expect, it } from "vitest";
import { canEdit, diffRow, isLockedByOther, normalizeValues, validateRow, type MasterRow } from "@/lib/mdm/schema";

describe("master data rules", () => {
  it("only EDITOR can edit", () => {
    expect(canEdit("EDITOR")).toBe(true);
    expect(canEdit("VIEW_ONLY")).toBe(false);
  });
  it("a row locked by another user blocks editing until it expires", () => {
    const lock = { table: "HERUTU_S04" as const, id: "r1", userId: 1, username: "a", expiresAt: 2000 };
    expect(isLockedByOther(lock, 2, 1000)).toBe(true);
    expect(isLockedByOther(lock, 1, 1000)).toBe(false);
    expect(isLockedByOther(lock, 2, 3000)).toBe(false);
  });
  it("rejects duplicate model_code and non-numeric torque", () => {
    const v = normalizeValues("HERUTU_S04", { model_code: "X1", model_name: "n", T_BOF: "abc" });
    const errs = validateRow("HERUTU_S04", v, new Set(["x1"]));
    expect(errs).toContain('model_code "X1" already exists');
    expect(errs).toContain("T_BOF must be a number");
  });
  it("records old and new values for changed fields", () => {
    const before = { id: "1", model_code: "A", model_name: "n", T_BOF: 30, status: "ACTIVE" } as unknown as MasterRow;
    expect(diffRow("HERUTU_S04", before, { ...before, T_BOF: 32, status: "INACTIVE" })).toEqual([
      { field: "T_BOF", old: 30, new: 32 },
      { field: "status", old: "ACTIVE", new: "INACTIVE" },
    ]);
  });
});
