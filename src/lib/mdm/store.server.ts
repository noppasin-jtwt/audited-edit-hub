import { hashPassword } from "./session.server";
import type { AuditEntry, Lock, MasterRow, Role, TableKey } from "./schema";

export interface UserRec {
  UserID: number;
  Username: string;
  PasswordHash: string;
  Role: Role;
}

/** Data access contract. The remote implementation forwards every call to the SQL Server API. */
export interface Backend {
  findUser(username: string): Promise<UserRec | null>;
  countUsers(): Promise<number>;
  list(table: TableKey): Promise<MasterRow[]>;
  insert(table: TableKey, row: MasterRow): Promise<void>;
  update(table: TableKey, row: MasterRow): Promise<void>;
  addAudit(e: AuditEntry): Promise<void>;
  listAudit(f: { table?: TableKey; recordId?: string; limit?: number }): Promise<AuditEntry[]>;
  getLocks(table: TableKey): Promise<Lock[]>;
  setLock(lock: Lock): Promise<void>;
  clearLock(table: TableKey, id: string, userId: number): Promise<void>;
}

class RemoteBackend implements Backend {
  constructor(private url: string, private key: string) {}
  private async rpc<T>(action: string, payload: unknown): Promise<T> {
    const res = await fetch(`${this.url.replace(/\/$/, "")}/rpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": this.key },
      body: JSON.stringify({ action, payload }),
    });
    if (!res.ok) throw new Error(`SQL Server API error [${res.status}]: ${await res.text()}`);
    return (await res.json()) as T;
  }
  findUser = (username: string) => this.rpc<UserRec | null>("findUser", { username });
  countUsers = () => this.rpc<number>("countUsers", {});
  list = (table: TableKey) => this.rpc<MasterRow[]>("list", { table });
  insert = (table: TableKey, row: MasterRow) => this.rpc<void>("insert", { table, row });
  update = (table: TableKey, row: MasterRow) => this.rpc<void>("update", { table, row });
  addAudit = (e: AuditEntry) => this.rpc<void>("addAudit", e);
  listAudit = (f: { table?: TableKey; recordId?: string; limit?: number }) => this.rpc<AuditEntry[]>("listAudit", f);
  getLocks = (table: TableKey) => this.rpc<Lock[]>("getLocks", { table });
  setLock = (lock: Lock) => this.rpc<void>("setLock", lock);
  clearLock = (table: TableKey, id: string, userId: number) => this.rpc<void>("clearLock", { table, id, userId });
}

/** Demo store used only while no SQL Server API is configured. Resets when the server restarts. */
class DemoBackend implements Backend {
  users: UserRec[] = [];
  tables: Record<TableKey, MasterRow[]> = { HERUTU_S04: [], HERUTU_S25: [] };
  audit: AuditEntry[] = [];
  locks: Lock[] = [];
  ready: Promise<void>;
  constructor() {
    this.ready = this.seed();
  }
  private async seed() {
    const mk = async (UserID: number, Username: string, pw: string, Role: Role) =>
      ({ UserID, Username, PasswordHash: await hashPassword(pw, 20_000), Role });
    this.users = await Promise.all([
      mk(1, "viewer", "viewer123", "VIEW_ONLY"),
      mk(2, "editor", "editor123", "EDITOR"),
      mk(3, "editor2", "editor123", "EDITOR"),
    ]);
    const d = (days: number) => new Date(Date.now() - days * 86400_000).toISOString();
    const base = (i: number, by: string) => ({
      id: crypto.randomUUID(), status: "ACTIVE" as const, CreatedBy: "system", CreatedDate: d(30 - i),
      ModifiedBy: i % 3 === 0 ? by : null, ModifiedDate: i % 3 === 0 ? d(i) : null,
    });
    const models = ["L3408", "L4508", "M7040", "B2420", "L5018", "MX5200", "M5-111", "L2501"];
    this.tables.HERUTU_S04 = models.map((m, i) => ({
      ...base(i, "editor"), model_code: `S04-${m}`, model_name: `Tractor ${m}`,
      T_WTP_M8: 24 + i, T_WTP_M6: 10 + (i % 3), T_C_GC: 45, T_BOF: 30 + i, T_JP_34: 120,
      T_JP_22_5: 85, T_FlangeC: 60 + i, Oil: i % 2 ? "SAE 10W-30" : "UDT",
    }));
    this.tables.HERUTU_S25 = models.slice(0, 6).map((m, i) => ({
      ...base(i, "editor2"), model_code: `S25-${m}`, model_name: `Engine ${m}`,
      T_Plug_5: 5 + i, T_WTF_25: 25, T_WTF_10_5: 10.5, T_WTF_34_8: 34.8, T_Air_18: 18, Air: i % 2 ? "Dry" : "Wet",
    }));
  }
  async findUser(u: string) {
    await this.ready;
    return this.users.find((x) => x.Username.toLowerCase() === u.toLowerCase()) ?? null;
  }
  async countUsers() { await this.ready; return this.users.length; }
  async list(t: TableKey) { await this.ready; return this.tables[t].map((r) => ({ ...r })); }
  async insert(t: TableKey, row: MasterRow) { this.tables[t].push({ ...row }); }
  async update(t: TableKey, row: MasterRow) {
    const i = this.tables[t].findIndex((r) => r.id === row.id);
    if (i >= 0) this.tables[t][i] = { ...row };
  }
  async addAudit(e: AuditEntry) { this.audit.unshift(e); if (this.audit.length > 5000) this.audit.pop(); }
  async listAudit(f: { table?: TableKey; recordId?: string; limit?: number }) {
    return this.audit
      .filter((e) => (!f.table || e.table === f.table) && (!f.recordId || e.recordId === f.recordId))
      .slice(0, f.limit ?? 500);
  }
  async getLocks(t: TableKey) { const now = Date.now(); return this.locks.filter((l) => l.table === t && l.expiresAt > now); }
  async setLock(lock: Lock) {
    this.locks = this.locks.filter((l) => !(l.table === lock.table && l.id === lock.id));
    this.locks.push(lock);
  }
  async clearLock(t: TableKey, id: string, userId: number) {
    this.locks = this.locks.filter((l) => !(l.table === t && l.id === id && l.userId === userId));
  }
}

const g = globalThis as unknown as { __mdmDemo?: DemoBackend };

export function getBackend(): { backend: Backend; demo: boolean } {
  const url = process.env["MDM_API_URL"];
  const key = process.env["MDM_API_KEY"];
  if (url && key) return { backend: new RemoteBackend(url, key), demo: false };
  g.__mdmDemo ??= new DemoBackend();
  return { backend: g.__mdmDemo, demo: true };
}
