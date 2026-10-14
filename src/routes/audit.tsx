import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { AppShell } from "@/components/mdm/AppShell";
import { ActionBadge, fmtDate } from "@/components/mdm/bits";
import { getAudit } from "@/lib/mdm/api.functions";
import { useAuth } from "@/lib/mdm/auth";

export const Route = createFileRoute("/audit")({
  head: () => ({
    meta: [
      { title: "Audit Log · Production Master Data Management" },
      { name: "description", content: "Read-only audit trail of every view, insert and update on master data." },
      { property: "og:title", content: "MDM Audit Log" },
      { property: "og:description", content: "Read-only audit trail for production master data." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <AppShell><AuditPage /></AppShell>,
});

function AuditPage() {
  const { token } = useAuth();
  const fn = useServerFn(getAudit);
  const q = useQuery({ queryKey: ["audit"], queryFn: () => fn({ data: { token: token! } }) });
  const [s, setS] = useState("");
  const [act, setAct] = useState("");
  const rows = useMemo(() => (q.data ?? []).filter((e) =>
    (!act || e.action === act) &&
    (!s || [e.user, e.table, e.recordCode, e.note, ...(e.changes ?? []).map((c) => c.field)].join(" ").toLowerCase().includes(s.toLowerCase()))), [q.data, s, act]);

  return (
    <div className="space-y-4">
      <div><p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">Read only</p><h1 className="text-2xl font-semibold tracking-tight">Audit Log</h1></div>
      <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b bg-toolbar px-3 py-2">
          <div className="relative w-full max-w-xs"><Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={s} onChange={(e) => setS(e.target.value)} placeholder="Search user, record, field…" className="h-8 bg-background pl-8" /></div>
          <select value={act} onChange={(e) => setAct(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-sm">
            <option value="">All actions</option>{["VIEW", "INSERT", "UPDATE", "DELETE", "LOGIN"].map((a) => <option key={a}>{a}</option>)}
          </select>
          <span className="text-xs text-muted-foreground"><b className="text-foreground">{rows.length}</b> entries</span>
        </div>
        <div className="max-h-[70vh] overflow-auto">
          <table className="grid-table">
            <thead><tr><th>DateTime</th><th>User</th><th>Action</th><th>Table</th><th>Record</th><th>Old → New</th></tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap text-muted-foreground">{fmtDate(e.at)}</td><td className="font-medium">{e.user}</td>
                  <td><ActionBadge action={e.action} /></td><td className="font-mono text-xs">{e.table ?? "—"}</td>
                  <td className="font-mono">{e.recordCode ?? "—"}</td>
                  <td className="text-xs">
                    {e.action === "UPDATE" ? e.changes?.map((c) => <div key={c.field}><span className="font-mono">{c.field}</span>: <span className="text-destructive">{String(c.old ?? "—")}</span> → <span className="text-success">{String(c.new ?? "—")}</span></div>) : e.note ?? ""}
                    {e.action === "UPDATE" && e.note && <div className="text-muted-foreground">{e.note}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
