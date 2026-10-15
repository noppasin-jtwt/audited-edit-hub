import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { FileSpreadsheet, History, Lock as LockIcon, Pencil, Plus, Power, Save, Search, Upload, X, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AppShell } from "@/components/mdm/AppShell";
import { HistoryDialog } from "@/components/mdm/HistoryDialog";
import { SortHead, useGridFilter } from "@/components/mdm/DataGrid";
import { StatusBadge, fmtDate } from "@/components/mdm/bits";
import { acquireLock, getTable, releaseLocks, saveChanges } from "@/lib/mdm/api.functions";
import { useAuth } from "@/lib/mdm/auth";
import { downloadTemplate, readImport } from "@/lib/mdm/excel";
import { TABLES, TABLE_KEYS, isLockedByOther, normalizeValues, validateRow, type MasterRow, type TableKey } from "@/lib/mdm/schema";

export const Route = createFileRoute("/maintenance")({
  head: () => ({
    meta: [
      { title: "Master Maintenance · Production Master Data Management" },
      { name: "description", content: "Edit, add and activate/deactivate HERUTU master records with locking and audit." },
      { property: "og:title", content: "MDM Master Maintenance" },
      { property: "og:description", content: "Editor workspace for production master data." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <AppShell editorOnly><Maintenance /></AppShell>,
});

function Maintenance() {
  return (
    <div className="space-y-4">
      <div><p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">Editor</p><h1 className="text-2xl font-semibold tracking-tight">Master Maintenance</h1></div>
      <Tabs defaultValue="HERUTU_S04">
        <TabsList>{TABLE_KEYS.map((t) => <TabsTrigger key={t} value={t} className="font-mono">{t}</TabsTrigger>)}</TabsList>
        {TABLE_KEYS.map((t) => <TabsContent key={t} value={t}><EditGrid table={t} /></TabsContent>)}
      </Tabs>
    </div>
  );
}

type Vals = Record<string, string | number | null>;
interface ImportPlan { inserts: Vals[]; updates: { id: string; values: Vals }[]; errors: string[]; total: number }

function EditGrid({ table }: { table: TableKey }) {
  const { token, user } = useAuth();
  const qc = useQueryClient();
  const getFn = useServerFn(getTable), lockFn = useServerFn(acquireLock), relFn = useServerFn(releaseLocks), saveFn = useServerFn(saveChanges);
  const q = useQuery({ queryKey: ["table", table], queryFn: () => getFn({ data: { token: token!, table } }), refetchInterval: 15_000 });
  const cols = TABLES[table].columns;
  const rows = q.data?.rows ?? [];
  const [edits, setEdits] = useState<Record<string, Vals>>({});
  const [news, setNews] = useState<(Vals & { _k: string })[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [hist, setHist] = useState<MasterRow | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const keys = useMemo(() => [...cols.map((c) => c.key), "status", "ModifiedBy"], [cols]);
  const { q: s, setQ, sort, toggleSort, filtered } = useGridFilter(rows, keys);
  const editIds = Object.keys(edits);
  const dirty = editIds.length > 0 || news.length > 0;

  // keep locks alive while editing; release on unmount
  const editRef = useRef(editIds); editRef.current = editIds;
  useEffect(() => {
    if (!editIds.length) return;
    const t = setInterval(() => editRef.current.forEach((id) => lockFn({ data: { token: token!, table, id } })), 120_000);
    return () => clearInterval(t);
  }, [editIds.length, lockFn, table, token]);
  useEffect(() => () => { if (editRef.current.length) relFn({ data: { token: token!, table, ids: editRef.current } }); }, [relFn, table, token]);

  async function startEdit(r: MasterRow) {
    const res = await lockFn({ data: { token: token!, table, id: r.id } });
    if (!res.ok) { toast.error(`Locked — ${res.lockedBy} is editing ${r.model_code}`); return; }
    setEdits((e) => ({ ...e, [r.id]: Object.fromEntries([...cols.map((c) => [c.key, (r[c.key] ?? null) as string | number | null]), ["status", r.status]]) }));
    qc.invalidateQueries({ queryKey: ["table", table] });
  }
  async function cancel() {
    if (editIds.length) await relFn({ data: { token: token!, table, ids: editIds } });
    setEdits({}); setNews([]); setConfirm(false);
    qc.invalidateQueries({ queryKey: ["table", table] });
  }
  const changedFields = (id: string) => {
    const r = rows.find((x) => x.id === id); const e = edits[id];
    return r && e ? Object.keys(e).filter((k) => String(e[k] ?? "") !== String(r[k] ?? "")) : [];
  };
  const updateCount = editIds.filter((id) => changedFields(id).length).length;

  // client-side pre-validation (server validates again)
  const clientErrors = useMemo(() => {
    const errs: string[] = [];
    const codes = new Map(rows.map((r) => [r.id, String(edits[r.id]?.model_code ?? r.model_code).toLowerCase()]));
    news.forEach((n) => codes.set(n._k, String(n.model_code ?? "").toLowerCase()));
    const check = (id: string, v: Vals) => {
      const others = new Set([...codes].filter(([k]) => k !== id).map(([, c]) => c));
      const e = validateRow(table, normalizeValues(table, v), others);
      if (e.length) errs.push(`${v.model_code || "(new row)"}: ${e.join(", ")}`);
    };
    editIds.forEach((id) => check(id, edits[id]!));
    news.forEach((n) => check(n._k, n));
    return errs;
  }, [edits, news, rows, table, editIds]);

  async function doSave(p?: ImportPlan) {
    const payload = p
      ? { inserts: p.inserts, updates: p.updates, source: "IMPORT" as const }
      : { inserts: news.map(({ _k, ...v }) => v), updates: editIds.filter((id) => changedFields(id).length).map((id) => ({ id, values: edits[id]! })), source: "MANUAL" as const };
    const res = await saveFn({ data: { token: token!, table, ...payload } });
    if (!res.ok) { toast.error("Save rejected", { description: res.errors.slice(0, 5).join("\n") }); return; }
    toast.success(`Saved ${res.changed} record(s) to database`);
    if (!p) { const unchanged = editIds.filter((id) => !changedFields(id).length); if (unchanged.length) await relFn({ data: { token: token!, table, ids: unchanged } }); setEdits({}); setNews([]); }
    setConfirm(false); setPlan(null);
    qc.invalidateQueries({ queryKey: ["table", table] }); qc.invalidateQueries({ queryKey: ["dashboard"] });
  }

  async function onFile(f: File) {
    try {
      const raw = await readImport(f);
      const expected = cols.map((c) => c.key);
      const missing = expected.filter((k) => !(raw[0] && k in raw[0]));
      if (!raw.length || missing.length) { toast.error("Template mismatch", { description: missing.length ? `Missing columns: ${missing.join(", ")}` : "File is empty" }); return; }
      const byCode = new Map(rows.map((r) => [String(r.model_code).toLowerCase(), r]));
      const locks = q.data?.locks ?? [];
      const plan: ImportPlan = { inserts: [], updates: [], errors: [], total: raw.length };
      const seen = new Set<string>();
      raw.forEach((r, i) => {
        const v = normalizeValues(table, r) as Vals;
        const code = String(v.model_code ?? "").toLowerCase();
        const line = `Row ${i + 2}`;
        if (seen.has(code)) return void plan.errors.push(`${line}: duplicate model_code in file`);
        seen.add(code);
        const existing = byCode.get(code);
        const others = new Set([...byCode.keys()].filter((c) => c !== code));
        const errs = validateRow(table, v, others);
        if (errs.length) return void plan.errors.push(`${line}: ${errs.join(", ")}`);
        if (existing) {
          if (isLockedByOther(locks.find((l) => l.id === existing.id), user!.uid)) return void plan.errors.push(`${line}: ${existing.model_code} is being edited by another user`);
          plan.updates.push({ id: existing.id, values: v });
        } else plan.inserts.push(v);
      });
      setPlan(plan);
    } catch { toast.error("Could not read the Excel file"); }
    if (fileRef.current) fileRef.current.value = "";
  }

  const cell = (id: string, k: string, isNew: boolean) => {
    const src = isNew ? news.find((n) => n._k === id)! : edits[id]!;
    const set = (v: string) => isNew ? setNews((ns) => ns.map((n) => n._k === id ? { ...n, [k]: v } : n)) : setEdits((e) => ({ ...e, [id]: { ...e[id]!, [k]: v } }));
    const changed = !isNew && changedFields(id).includes(k);
    return <input value={String(src[k] ?? "")} onChange={(e) => set(e.target.value)} className={`grid-input ${changed ? "grid-input-changed" : ""}`} />;
  };

  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b bg-toolbar px-3 py-2">
        <div className="relative w-full max-w-xs"><Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={s} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="h-8 bg-background pl-8" /></div>
        <Button size="sm" onClick={() => setNews((n) => [...n, { _k: crypto.randomUUID(), status: "ACTIVE" }])}><Plus className="size-4" />Add New Row</Button>
        <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}><Upload className="size-4" />Import Excel</Button>
        <Button size="sm" variant="ghost" onClick={() => downloadTemplate(table)}><FileDown className="size-4" />Template</Button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        <div className="ml-auto flex items-center gap-2">
          {dirty && <span className="text-xs text-warning-foreground"><b>{updateCount + news.length}</b> unsaved change(s)</span>}
          <Button size="sm" variant="outline" disabled={!dirty} onClick={cancel}><X className="size-4" />Cancel</Button>
          <Button size="sm" disabled={!dirty} onClick={() => setConfirm(true)}><Save className="size-4" />Save</Button>
        </div>
      </div>
      <div className="max-h-[620px] overflow-auto">
        <table className="grid-table">
          <thead><tr>
            <th className="w-24" />
            {cols.map((c) => <th key={c.key}><SortHead k={c.key} sort={sort} onSort={toggleSort}>{c.label}</SortHead></th>)}
            <th><SortHead k="status" sort={sort} onSort={toggleSort}>status</SortHead></th>
            <th>ModifiedBy</th><th>ModifiedDate</th><th />
          </tr></thead>
          <tbody>
            {news.map((n) => (
              <tr key={n._k} className="row-new">
                <td><button onClick={() => setNews((ns) => ns.filter((x) => x._k !== n._k))} className="text-xs text-muted-foreground hover:text-destructive">Discard</button></td>
                {cols.map((c) => <td key={c.key}>{cell(n._k, c.key, true)}</td>)}
                <td><StatusBadge status="ACTIVE" /></td><td colSpan={3} className="text-xs text-success">New row</td>
              </tr>
            ))}
            {filtered.map((r) => {
              const lock = q.data?.locks.find((l) => l.id === r.id);
              const other = isLockedByOther(lock, user!.uid);
              const e = edits[r.id];
              return (
                <tr key={r.id} className={e ? "row-editing" : r.status === "INACTIVE" ? "opacity-60" : ""}>
                  <td>
                    {other ? <span className="inline-flex items-center gap-1 text-xs text-warning-foreground" title="Row locked"><LockIcon className="size-3" />{lock!.username}</span>
                      : e ? <span className="text-xs font-semibold text-primary">Editing</span>
                      : <Button size="sm" variant="ghost" className="h-7" onClick={() => startEdit(r)}><Pencil className="size-3.5" />Edit</Button>}
                  </td>
                  {cols.map((c) => <td key={c.key} className={!e && c.type === "number" ? "text-right font-mono tabular-nums" : !e && c.key === "model_code" ? "font-mono font-semibold text-primary" : ""}>{e ? cell(r.id, c.key, false) : String(r[c.key] ?? "—")}</td>)}
                  <td>
                    {e ? (
                      <button onClick={() => setEdits((x) => ({ ...x, [r.id]: { ...e, status: e.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" } }))} className="inline-flex items-center gap-1" title="Toggle Active/Inactive">
                        <StatusBadge status={e.status as "ACTIVE" | "INACTIVE"} /><Power className="size-3 text-muted-foreground" />
                      </button>
                    ) : <StatusBadge status={r.status} />}
                  </td>
                  <td>{r.ModifiedBy ?? "—"}</td><td className="text-muted-foreground">{fmtDate(r.ModifiedDate)}</td>
                  <td><Button size="sm" variant="ghost" className="h-7" onClick={() => setHist(r)}><History className="size-3.5" />View History</Button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader><DialogTitle>Save changes to database?</DialogTitle>
            <DialogDescription>{updateCount} updated · {news.length} new record(s) in {table}. Old and new values will be written to the audit log.</DialogDescription>
          </DialogHeader>
          <div className="max-h-60 space-y-1 overflow-auto text-sm">
            {editIds.filter((id) => changedFields(id).length).map((id) => {
              const r = rows.find((x) => x.id === id)!;
              return <div key={id}><span className="font-mono font-semibold">{String(r.model_code)}</span>: {changedFields(id).map((k) => `${k} ${r[k] ?? "—"} → ${edits[id]![k] ?? "—"}`).join(", ")}</div>;
            })}
            {news.map((n) => <div key={n._k} className="text-success">+ {String(n.model_code || "(new row)")}</div>)}
            {clientErrors.length > 0 && <div className="mt-2 rounded bg-destructive/10 p-2 text-destructive">{clientErrors.map((e) => <div key={e}>{e}</div>)}</div>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setConfirm(false)}>Back</Button><Button disabled={clientErrors.length > 0} onClick={() => doSave()}>Confirm & Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!plan} onOpenChange={(o) => !o && setPlan(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="size-5 text-primary" />Import validation</DialogTitle>
            <DialogDescription>{plan?.total} rows read · {plan?.inserts.length} new · {plan?.updates.length} updates · {plan?.errors.length} errors</DialogDescription>
          </DialogHeader>
          {plan?.errors.length ? (
            <div className="max-h-60 overflow-auto rounded bg-destructive/10 p-2 text-sm text-destructive">{plan.errors.map((e) => <div key={e}>{e}</div>)}<p className="mt-2 font-medium">Fix these rows in the file and import again.</p></div>
          ) : <p className="text-sm text-success">All rows passed validation.</p>}
          <DialogFooter><Button variant="outline" onClick={() => setPlan(null)}>Cancel</Button><Button disabled={!plan || plan.errors.length > 0 || !(plan.inserts.length + plan.updates.length)} onClick={() => doSave(plan!)}>Confirm & Import</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      {hist && <HistoryDialog table={table} row={hist} onClose={() => setHist(null)} />}
    </div>
  );
}
