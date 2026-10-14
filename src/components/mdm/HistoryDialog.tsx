import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { getHistory } from "@/lib/mdm/api.functions";
import { useAuth } from "@/lib/mdm/auth";
import type { MasterRow, TableKey } from "@/lib/mdm/schema";
import { ActionBadge, fmtDate } from "./bits";

export function HistoryDialog({ table, row, onClose }: { table: TableKey; row: MasterRow | null; onClose: () => void }) {
  const { token } = useAuth();
  const fn = useServerFn(getHistory);
  const q = useQuery({
    queryKey: ["history", table, row?.id],
    queryFn: () => fn({ data: { token: token!, table, id: row!.id } }),
    enabled: !!row && !!token,
  });
  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Change history · <span className="font-mono">{String(row?.model_code ?? "")}</span></DialogTitle>
          <DialogDescription>Created by {row?.CreatedBy} on {fmtDate(row?.CreatedDate)}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-3 overflow-auto">
          {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {q.data?.length === 0 && <p className="text-sm text-muted-foreground">No changes recorded since the audit log started.</p>}
          {q.data?.map((e) => (
            <div key={e.id} className="rounded-md border bg-card p-3">
              <div className="mb-2 flex items-center gap-2 text-sm">
                <ActionBadge action={e.action} /><b>{e.user}</b>
                <span className="text-muted-foreground">{fmtDate(e.at)}</span>
                {e.note && <span className="text-xs text-muted-foreground">· {e.note}</span>}
              </div>
              <table className="w-full text-xs">
                <thead><tr className="text-left text-muted-foreground"><th className="py-1">Field</th><th>Old value</th><th>New value</th></tr></thead>
                <tbody>
                  {e.changes?.map((c) => (
                    <tr key={c.field} className="border-t">
                      <td className="py-1 font-mono">{c.field}</td>
                      <td className="text-destructive line-through decoration-destructive/40">{String(c.old ?? "—")}</td>
                      <td className="font-medium text-success">{String(c.new ?? "—")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
