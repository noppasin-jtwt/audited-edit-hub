export type Role = "VIEW_ONLY" | "EDITOR";
export type TableKey = "HERUTU_S04" | "HERUTU_S25";
export type ColType = "text" | "number";
export interface ColumnDef {
  key: string;
  label: string;
  type: ColType;
  required?: boolean;
}
export interface TableDef {
  key: TableKey;
  title: string;
  columns: ColumnDef[];
}

const t = (key: string, type: ColType = "number"): ColumnDef => ({ key, label: key, type });

export const TABLES: Record<TableKey, TableDef> = {
  HERUTU_S04: {
    key: "HERUTU_S04",
    title: "HERUTU S04",
    columns: [
      { key: "model_code", label: "model_code", type: "text", required: true },
      { key: "model_name", label: "model_name", type: "text", required: true },
      t("T_WTP_M8"), t("T_WTP_M6"), t("T_C_GC"), t("T_BOF"), t("T_JP_34"),
      t("T_JP_22_5"), t("T_FlangeC"), t("Oil", "text"),
    ],
  },
  HERUTU_S25: {
    key: "HERUTU_S25",
    title: "HERUTU S25",
    columns: [
      { key: "model_code", label: "model_code", type: "text", required: true },
      { key: "model_name", label: "model_name", type: "text", required: true },
      t("T_Plug_5"), t("T_WTF_25"), t("T_WTF_10_5"), t("T_WTF_34_8"), t("T_Air_18"),
      t("Air", "text"),
    ],
  },
};
export const TABLE_KEYS = Object.keys(TABLES) as TableKey[];

export type Status = "ACTIVE" | "INACTIVE";
export interface MasterRow {
  id: string;
  status: Status;
  CreatedBy: string;
  CreatedDate: string;
  ModifiedBy: string | null;
  ModifiedDate: string | null;
  [k: string]: string | number | null;
}
export const META_COLS = ["status", "CreatedBy", "CreatedDate", "ModifiedBy", "ModifiedDate"] as const;

export interface Lock {
  table: TableKey;
  id: string;
  userId: number;
  username: string;
  expiresAt: number;
}
export const LOCK_TTL_MS = 5 * 60 * 1000;
export const INACTIVITY_MS = 15 * 60 * 1000;

export interface Change {
  field: string;
  old: string | number | null;
  new: string | number | null;
}
export type AuditAction = "VIEW" | "INSERT" | "UPDATE" | "DELETE" | "LOGIN";
export interface AuditEntry {
  id: string;
  at: string;
  user: string;
  action: AuditAction;
  table?: TableKey;
  recordId?: string;
  recordCode?: string;
  changes?: Change[];
  note?: string | undefined;
}

export const canEdit = (role: Role) => role === "EDITOR";

/** A lock blocks a user only if it belongs to someone else and has not expired. */
export function isLockedByOther(lock: Lock | undefined, userId: number, now = Date.now()) {
  return !!lock && lock.userId !== userId && lock.expiresAt > now;
}

/** Converts raw form/Excel values to typed values for a table. */
export function normalizeValues(table: TableKey, raw: Record<string, unknown>) {
  const out: Record<string, string | number | null> = {};
  for (const c of TABLES[table].columns) {
    const v = raw[c.key];
    if (v === undefined || v === null || String(v).trim() === "") out[c.key] = null;
    else if (c.type === "number") {
      const n = Number(String(v).trim());
      out[c.key] = Number.isFinite(n) ? n : String(v);
    } else out[c.key] = String(v).trim();
  }
  if (raw.status === "ACTIVE" || raw.status === "INACTIVE") out.status = raw.status;
  return out;
}

/** Returns human-readable errors; empty array means the row may be saved. */
export function validateRow(
  table: TableKey,
  values: Record<string, unknown>,
  otherCodes: Set<string>,
): string[] {
  const errors: string[] = [];
  for (const c of TABLES[table].columns) {
    const v = values[c.key];
    if (c.required && (v === null || v === undefined || v === "")) errors.push(`${c.key} is required`);
    if (c.type === "number" && v !== null && v !== undefined && typeof v !== "number")
      errors.push(`${c.key} must be a number`);
    if (typeof v === "number" && v < 0) errors.push(`${c.key} cannot be negative`);
    if (typeof v === "string" && v.length > 100) errors.push(`${c.key} is too long`);
  }
  const code = values.model_code;
  if (typeof code === "string" && otherCodes.has(code.toLowerCase()))
    errors.push(`model_code "${code}" already exists`);
  if (values.status !== undefined && values.status !== "ACTIVE" && values.status !== "INACTIVE")
    errors.push("status must be ACTIVE or INACTIVE");
  return errors;
}

export function diffRow(table: TableKey, before: MasterRow, after: Record<string, unknown>): Change[] {
  const keys = [...TABLES[table].columns.map((c) => c.key), "status"];
  return keys
    .filter((k) => k in after && (before[k] ?? null) !== (after[k] ?? null))
    .map((k) => ({ field: k, old: before[k] ?? null, new: after[k] ?? null }));
}
