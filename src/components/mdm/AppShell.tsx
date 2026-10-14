import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Factory, LayoutDashboard, LogOut, Wrench, ScrollText, ShieldCheck, Eye } from "lucide-react";
import { useAuth } from "@/lib/mdm/auth";
import { canEdit } from "@/lib/mdm/schema";

export function AppShell({ children, editorOnly }: { children: ReactNode; editorOnly?: boolean }) {
  const { ready, user, demo, signOut } = useAuth();
  const nav = useNavigate();
  useEffect(() => {
    if (ready && !user) nav({ to: "/", replace: true });
    else if (ready && user && editorOnly && !canEdit(user.role)) nav({ to: "/dashboard", replace: true });
  }, [ready, user, editorOnly, nav]);
  if (!ready || !user || (editorOnly && !canEdit(user.role))) return null;

  const item = "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-header-foreground/80 hover:bg-header-foreground/10 hover:text-header-foreground";
  const active = { className: "bg-header-foreground/15 text-header-foreground" };
  return (
    <div className="min-h-screen bg-muted/40">
      <header className="sticky top-0 z-30 bg-header text-header-foreground shadow-md">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-6 px-4">
          <div className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid size-8 place-items-center rounded bg-primary"><Factory className="size-4" /></span>
            <span className="hidden sm:inline">MDM · Production</span>
          </div>
          <nav className="flex flex-1 items-center gap-1">
            <Link to="/dashboard" className={item} activeProps={active}><LayoutDashboard className="size-4" /><span className="hidden md:inline">Dashboard</span></Link>
            {canEdit(user.role) && (
              <Link to="/maintenance" className={item} activeProps={active}><Wrench className="size-4" /><span className="hidden md:inline">Master Maintenance</span></Link>
            )}
            <Link to="/audit" className={item} activeProps={active}><ScrollText className="size-4" /><span className="hidden md:inline">Audit Log</span></Link>
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden items-center gap-1.5 sm:flex">
              {canEdit(user.role) ? <ShieldCheck className="size-4" /> : <Eye className="size-4" />}
              <b>{user.username}</b>
              <span className="rounded bg-header-foreground/15 px-1.5 py-0.5 font-mono text-[10px]">{user.role}</span>
            </span>
            <button onClick={() => { signOut(); nav({ to: "/", replace: true }); }} className={item}>
              <LogOut className="size-4" /><span className="hidden md:inline">Logout</span>
            </button>
          </div>
        </div>
        {demo && (
          <div className="bg-warning px-4 py-1 text-center text-xs font-medium text-warning-foreground">
            Demo data — not connected to SQL Server yet. Changes reset when the server restarts.
          </div>
        )}
      </header>
      <main className="mx-auto max-w-[1600px] px-4 py-6">{children}</main>
    </div>
  );
}
