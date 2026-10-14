import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Bell, ChevronDown, Clock, Database, HardDriveDownload, Users } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/mdm/AppShell";
import { DataGrid } from "@/components/mdm/DataGrid";
import { HistoryDialog } from "@/components/mdm/HistoryDialog";
import { ActionBadge, fmtDate } from "@/components/mdm/bits";
import { getAudit, getDashboard } from "@/lib/mdm/api.functions";
import { useAuth } from "@/lib/mdm/auth";
import { exportBackup } from "@/lib/mdm/excel";
import { TABLES, type MasterRow, type TableKey } from "@/lib/mdm/schema";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard · Production Master Data Management" },
      { name: "description", content: "Overview of HERUTU S04 and S25 master data, latest updates and editors." },
      { property: "og:title", content: "MDM Dashboard" },
      { property: "og:description", content: "Production master data overview with latest changes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <AppShell><Dashboard /></AppShell>,
});

function Stat({ icon: I, label, value, sub }: { icon: typeof Database; label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}<I className="size-4 text-primary" /></div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Dashboard() {
  const { token } = useAuth();
  const fn = useServerFn(getDashboard);
  const auditFn = useServerFn(getAudit);
  const q = useQuery({ queryKey: ["dashboard"], queryFn: () => fn({ data: { token: token! } }), refetchInterval: 30_000 });
  const [hist, setHist] = useState<{ table: TableKey; row: MasterRow } | null>(null);
  const d = q.data;
  const last = d?.tables.map((t) => t.lastUpdate).filter(Boolean).sort().pop();
  const latest = d?.recent[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">Home</p>
          <h1 className="text-2xl font-semibold tracking-tight">Production Master Data Management</h1>
        </div>
        <Button variant="outline" disabled={!d} onClick={async () => exportBackup(d!.tables, await auditFn({ data: { token: token! } }))}>
          <HardDriveDownload className="size-4" />Backup export (all data)
        </Button>
      </div>
      {q.error && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{(q.error as Error).message}</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Database} label="Records · S04" value={d?.tables[0]?.rows.length ?? "…"} sub={`${d?.tables[0]?.rows.filter((r) => r.status === "ACTIVE").length ?? 0} active`} />
        <Stat icon={Database} label="Records · S25" value={d?.tables[1]?.rows.length ?? "…"} sub={`${d?.tables[1]?.rows.filter((r) => r.status === "ACTIVE").length ?? 0} active`} />
        <Stat icon={Users} label="Total users" value={d?.users ?? "…"} />
        <Stat icon={Clock} label="Last update" value={last ? fmtDate(last) : "—"} sub={latest ? `by ${latest.user}` : undefined} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-4">
          {d?.tables.map((t) => (
            <Collapsible key={t.table} defaultOpen className="overflow-hidden rounded-lg border bg-card shadow-sm">
              <CollapsibleTrigger className="group flex w-full items-center gap-3 border-b bg-card px-4 py-3 text-left hover:bg-muted/50">
                <span className="h-6 w-1 rounded bg-primary" />
                <div className="flex-1">
                  <div className="font-semibold">{TABLES[t.table].title} <span className="ml-1 font-mono text-xs text-muted-foreground">{t.table}</span></div>
                  <div className="text-xs text-muted-foreground">{t.rows.length} records · last update {fmtDate(t.lastUpdate)}</div>
                </div>
                <ChevronDown className="size-4 transition-transform group-data-[state=closed]:-rotate-90" />
              </CollapsibleTrigger>
              <CollapsibleContent><DataGrid table={t.table} rows={t.rows} onHistory={(row) => setHist({ table: t.table, row })} /></CollapsibleContent>
            </Collapsible>
          ))}
          {q.isLoading && <div className="h-64 animate-pulse rounded-lg border bg-card" />}
        </div>
        <aside className="h-fit rounded-lg border bg-card shadow-sm">
          <div className="flex items-center gap-2 border-b px-4 py-3 font-semibold"><Bell className="size-4 text-primary" />Latest updates</div>
          {latest && <div className="border-b bg-primary/5 px-4 py-2 text-xs">Latest editor: <b className="text-primary">{latest.user}</b> · {fmtDate(latest.at)}</div>}
          <ul className="divide-y">
            {d?.recent.map((e) => (
              <li key={e.id} className="px-4 py-2.5 text-sm">
                <div className="flex items-center gap-2"><ActionBadge action={e.action} /><span className="font-mono font-medium">{e.recordCode}</span></div>
                <div className="mt-0.5 text-xs text-muted-foreground">{e.table} · {e.user} · {fmtDate(e.at)}</div>
                {e.action === "UPDATE" && <div className="mt-0.5 truncate text-xs">{e.changes?.map((c) => c.field).join(", ")}</div>}
              </li>
            ))}
            {d && !d.recent.length && <li className="px-4 py-6 text-center text-sm text-muted-foreground">No changes yet</li>}
          </ul>
        </aside>
      </div>
      {hist && <HistoryDialog table={hist.table} row={hist.row} onClose={() => setHist(null)} />}
    </div>
  );
}
