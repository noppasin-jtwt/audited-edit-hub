import type { AuditAction, Status } from "@/lib/mdm/schema";

export const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleString(undefined, { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

export function StatusBadge({ status }: { status: Status }) {
  return status === "ACTIVE" ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-success/12 px-2 py-0.5 text-[11px] font-semibold text-success"><span className="size-1.5 rounded-full bg-success" />ACTIVE</span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground"><span className="size-1.5 rounded-full bg-muted-foreground" />INACTIVE</span>
  );
}

const actionCls: Record<AuditAction, string> = {
  INSERT: "bg-success/12 text-success",
  UPDATE: "bg-primary/10 text-primary",
  DELETE: "bg-destructive/10 text-destructive",
  VIEW: "bg-muted text-muted-foreground",
  LOGIN: "bg-muted text-muted-foreground",
};
export function ActionBadge({ action }: { action: AuditAction }) {
  return <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${actionCls[action]}`}>{action}</span>;
}
