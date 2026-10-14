import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  LOCK_TTL_MS, TABLES, TABLE_KEYS, canEdit, diffRow, isLockedByOther, normalizeValues, validateRow,
  type AuditEntry, type MasterRow, type TableKey,
} from "./schema";

const tableZ = z.enum(["HERUTU_S04", "HERUTU_S25"]);
const tok = { token: z.string() };

async function ctx(token: string, needEditor = false) {
  const { verifyToken } = await import("./session.server");
  const { getBackend } = await import("./store.server");
  const user = await verifyToken(token);
  if (needEditor && !canEdit(user.role)) throw new Error("Only EDITOR users can change master data.");
  return { user, ...getBackend() };
}
const audit = (e: Omit<AuditEntry, "id" | "at">): AuditEntry => ({ id: crypto.randomUUID(), at: new Date().toISOString(), ...e });

export const login = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ username: z.string().min(1).max(50), password: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }) => {
    const { verifyPassword, signToken } = await import("./session.server");
    const { getBackend } = await import("./store.server");
    const { backend, demo } = getBackend();
    const u = await backend.findUser(data.username.trim());
    if (!u || !(await verifyPassword(data.password, u.PasswordHash)))
      return { ok: false as const, error: "Invalid username or password" };
    await backend.addAudit(audit({ user: u.Username, action: "LOGIN" }));
    const token = await signToken({ uid: u.UserID, username: u.Username, role: u.Role });
    return { ok: true as const, token, user: { uid: u.UserID, username: u.Username, role: u.Role }, demo };
  });

export const getDashboard = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object(tok).parse(d))
  .handler(async ({ data }) => {
    const { backend, demo } = await ctx(data.token);
    const tables = await Promise.all(TABLE_KEYS.map(async (t) => {
      const rows = await backend.list(t);
      await backend.addAudit(audit({ user: (await ctx(data.token)).user.username, action: "VIEW", table: t }));
      const last = rows.map((r) => r.ModifiedDate ?? r.CreatedDate).sort().pop() ?? null;
      return { table: t, rows, lastUpdate: last };
    }));
    const recent = (await backend.listAudit({ limit: 200 }))
      .filter((e) => e.action === "INSERT" || e.action === "UPDATE").slice(0, 8);
    return { tables, users: await backend.countUsers(), recent, demo };
  });

export const getTable = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ ...tok, table: tableZ }).parse(d))
  .handler(async ({ data }) => {
    const { backend } = await ctx(data.token);
    return { rows: await backend.list(data.table), locks: await backend.getLocks(data.table) };
  });

export const acquireLock = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ ...tok, table: tableZ, id: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const { backend, user } = await ctx(data.token, true);
    const lock = (await backend.getLocks(data.table)).find((l) => l.id === data.id);
    if (isLockedByOther(lock, user.uid)) return { ok: false as const, lockedBy: lock!.username };
    await backend.setLock({ table: data.table, id: data.id, userId: user.uid, username: user.username, expiresAt: Date.now() + LOCK_TTL_MS });
    return { ok: true as const };
  });

export const releaseLocks = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ ...tok, table: tableZ, ids: z.array(z.string()).max(1000) }).parse(d))
  .handler(async ({ data }) => {
    const { backend, user } = await ctx(data.token, true);
    for (const id of data.ids) await backend.clearLock(data.table, id, user.uid);
    return { ok: true };
  });

const valuesZ = z.record(z.union([z.string(), z.number(), z.null()]));

export const saveChanges = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    ...tok, table: tableZ, source: z.enum(["MANUAL", "IMPORT"]),
    inserts: z.array(valuesZ).max(5000),
    updates: z.array(z.object({ id: z.string(), values: valuesZ })).max(5000),
  }).parse(d))
  .handler(async ({ data }) => {
    const { backend, user } = await ctx(data.token, true);
    const t = data.table as TableKey;
    const rows = await backend.list(t);
    const locks = await backend.getLocks(t);
    const byId = new Map(rows.map((r) => [r.id, r]));
    const errors: string[] = [];
    const now = new Date().toISOString();
    const finalCodes = new Map(rows.map((r) => [r.id, String(r.model_code).toLowerCase()]));
    const planned: { kind: "u" | "i"; row: MasterRow; before?: MasterRow }[] = [];

    data.updates.forEach((u, i) => {
      const before = byId.get(u.id);
      if (!before) return errors.push(`Update ${i + 1}: record not found`);
      const lock = locks.find((l) => l.id === u.id);
      if (isLockedByOther(lock, user.uid)) return errors.push(`${before.model_code}: being edited by ${lock!.username}`);
      if (data.source === "MANUAL" && !lock) return errors.push(`${before.model_code}: your edit lock expired, reopen the row`);
      const vals = { ...normalizeValues(t, { ...before, ...u.values }) };
      finalCodes.set(u.id, String(vals.model_code ?? "").toLowerCase());
      planned.push({ kind: "u", before, row: { ...before, ...vals, ModifiedBy: user.username, ModifiedDate: now } });
    });
    data.inserts.forEach((v) => {
      const id = crypto.randomUUID();
      const vals = normalizeValues(t, v);
      finalCodes.set(id, String(vals.model_code ?? "").toLowerCase());
      planned.push({ kind: "i", row: { id, status: "ACTIVE", ...vals, CreatedBy: user.username, CreatedDate: now, ModifiedBy: null, ModifiedDate: null } as MasterRow });
    });
    for (const p of planned) {
      const others = new Set([...finalCodes].filter(([id]) => id !== p.row.id).map(([, c]) => c));
      const e = validateRow(t, p.row, others);
      if (e.length) errors.push(`${p.row.model_code || "(new row)"}: ${e.join(", ")}`);
    }
    if (errors.length) return { ok: false as const, errors };

    let changed = 0;
    for (const p of planned) {
      if (p.kind === "u") {
        const changes = diffRow(t, p.before!, p.row);
        if (!changes.length) continue;
        await backend.update(t, p.row);
        await backend.addAudit(audit({ user: user.username, action: "UPDATE", table: t, recordId: p.row.id, recordCode: String(p.row.model_code), changes, note: data.source === "IMPORT" ? "Excel import" : undefined }));
      } else {
        await backend.insert(t, p.row);
        const changes = TABLES[t].columns.map((c) => ({ field: c.key, old: null, new: p.row[c.key] ?? null }));
        await backend.addAudit(audit({ user: user.username, action: "INSERT", table: t, recordId: p.row.id, recordCode: String(p.row.model_code), changes, note: data.source === "IMPORT" ? "Excel import" : undefined }));
      }
      changed++;
    }
    for (const u of data.updates) await backend.clearLock(t, u.id, user.uid);
    return { ok: true as const, changed };
  });

export const getHistory = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ ...tok, table: tableZ, id: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const { backend } = await ctx(data.token);
    return backend.listAudit({ table: data.table, recordId: data.id, limit: 200 });
  });

export const getAudit = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object(tok).parse(d))
  .handler(async ({ data }) => {
    const { backend } = await ctx(data.token);
    return backend.listAudit({ limit: 1000 });
  });
