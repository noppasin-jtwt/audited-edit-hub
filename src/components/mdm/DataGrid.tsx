import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Download, History, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TABLES, type MasterRow, type TableKey } from "@/lib/mdm/schema";
import { exportTable } from "@/lib/mdm/excel";
import { StatusBadge, fmtDate } from "./bits";

export function useGridFilter(rows: MasterRow[], keys: string[]) {
  const [q, setQ] = useState("");
  const [colF, setColF] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const filtered = useMemo(() => {
    const g = q.trim().toLowerCase();
    let r = rows.filter((row) =>
      (!g || keys.some((k) => String(row[k] ?? "").toLowerCase().includes(g))) &&
      Object.entries(colF).every(([k, v]) => !v || String(row[k] ?? "").toLowerCase().includes(v.toLowerCase())));
    if (sort) r = [...r].sort((a, b) => {
      const x = a[sort.key] ?? "", y = b[sort.key] ?? "";
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * sort.dir;
    });
    return r;
  }, [rows, keys, q, colF, sort]);
  const toggleSort = (key: string) => setSort((s) => (s?.key !== key ? { key, dir: 1 } : s.dir === 1 ? { key, dir: -1 } : null));
  return { q, setQ, colF, setColF, sort, toggleSort, filtered };
}

export function SortHead({ k, sort, onSort, children }: { k: string; sort: { key: string; dir: 1 | -1 } | null; onSort: (k: string) => void; children: ReactNode }) {
  const I = sort?.key !== k ? ArrowUpDown : sort.dir === 1 ? ArrowUp : ArrowDown;
  return (
    <button onClick={() => onSort(k)} className="inline-flex items-center gap-1 whitespace-nowrap font-semibold hover:text-primary">
      {children}<I className={`size-3 ${sort?.key === k ? "text-primary" : "opacity-40"}`} />
    </button>
  );
}

export function DataGrid({ table, rows, onHistory }: { table: TableKey; rows: MasterRow[]; onHistory: (r: MasterRow) => void }) {
  const cols = TABLES[table].columns;
  const keys = useMemo(() => [...cols.map((c) => c.key), "status", "CreatedBy", "ModifiedBy"], [cols]);
  const { q, setQ, colF, setColF, sort, toggleSort, filtered } = useGridFilter(rows, keys);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(10);
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const p = Math.min(page, pages - 1);
  const view = filtered.slice(p * size, p * size + size);
  const meta = ["status", "CreatedBy", "CreatedDate", "ModifiedBy", "ModifiedDate"];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b bg-toolbar px-3 py-2">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Search all columns…" className="h-8 bg-background pl-8" />
        </div>
        <span className="text-xs text-muted-foreground"><b className="text-foreground">{filtered.length}</b> of {rows.length} rows</span>
        <div className="ml-auto"><Button size="sm" variant="outline" onClick={() => exportTable(table, filtered)}><Download className="size-4" />Export to Excel</Button></div>
      </div>
      <div className="max-h-[520px] overflow-auto">
        <table className="grid-table">
          <thead>
            <tr>
              {cols.map((c) => <th key={c.key}><SortHead k={c.key} sort={sort} onSort={toggleSort}>{c.label}</SortHead></th>)}
              {meta.map((k) => <th key={k}><SortHead k={k} sort={sort} onSort={toggleSort}>{k}</SortHead></th>)}
              <th />
            </tr>
            <tr className="filter-row">
              {[...cols.map((c) => c.key), ...meta].map((k) => (
                <th key={k}><input value={colF[k] ?? ""} onChange={(e) => { setColF({ ...colF, [k]: e.target.value }); setPage(0); }} placeholder="Filter" className="grid-filter" /></th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {view.map((r) => (
              <tr key={r.id} className={r.status === "INACTIVE" ? "opacity-60" : ""}>
                {cols.map((c) => <td key={c.key} className={c.type === "number" ? "text-right font-mono tabular-nums" : c.key === "model_code" ? "font-mono font-semibold text-primary" : ""}>{String(r[c.key] ?? "—")}</td>)}
                <td><StatusBadge status={r.status} /></td>
                <td>{r.CreatedBy}</td><td className="text-muted-foreground">{fmtDate(r.CreatedDate)}</td>
                <td>{r.ModifiedBy ?? "—"}</td><td className="text-muted-foreground">{fmtDate(r.ModifiedDate)}</td>
                <td><Button size="sm" variant="ghost" className="h-7" onClick={() => onHistory(r)}><History className="size-3.5" />History</Button></td>
              </tr>
            ))}
            {!view.length && <tr><td colSpan={cols.length + 6} className="py-10 text-center text-muted-foreground">No matching records</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
        <label className="flex items-center gap-1">Rows per page
          <select value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(0); }} className="rounded border bg-background px-1 py-0.5">
            {[10, 25, 50, 100].map((n) => <option key={n}>{n}</option>)}
          </select>
        </label>
        <div className="flex items-center gap-2">
          <span>Page {p + 1} / {pages}</span>
          <Button size="icon" variant="outline" className="size-7" disabled={p === 0} onClick={() => setPage(p - 1)}><ChevronLeft className="size-4" /></Button>
          <Button size="icon" variant="outline" className="size-7" disabled={p >= pages - 1} onClick={() => setPage(p + 1)}><ChevronRight className="size-4" /></Button>
        </div>
      </div>
    </div>
  );
}
