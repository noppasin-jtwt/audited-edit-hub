import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Factory, Lock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login } from "@/lib/mdm/api.functions";
import { useAuth } from "@/lib/mdm/auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sign in · Production Master Data Management" },
      { name: "description", content: "Secure sign-in for the plant's production master data management system." },
      { property: "og:title", content: "Production Master Data Management" },
      { property: "og:description", content: "Maintain HERUTU production master data with audit trail and role-based access." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { ready, user, signIn } = useAuth();
  const nav = useNavigate();
  const fn = useServerFn(login);
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (ready && user) nav({ to: "/dashboard", replace: true }); }, [ready, user, nav]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const r = await fn({ data: { username: u, password: p } });
      if (!r.ok) setErr(r.error);
      else { signIn(r.token, r.user, r.demo); nav({ to: "/dashboard" }); }
    } catch (e) { setErr(e instanceof Error ? e.message : "Sign-in failed"); }
    setBusy(false);
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-header p-10 text-header-foreground lg:flex">
        <div className="absolute inset-0 bg-grid opacity-20" />
        <div className="relative flex items-center gap-2 font-semibold"><span className="grid size-9 place-items-center rounded bg-primary"><Factory className="size-5" /></span>Plant Systems</div>
        <div className="relative">
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-header-foreground/60">MES · Master Data</p>
          <h1 className="text-4xl font-semibold leading-tight">Production Master<br />Data Management</h1>
          <p className="mt-4 max-w-md text-header-foreground/70">Single source of truth for torque, fluid and assembly parameters across HERUTU stations S04 and S25.</p>
        </div>
        <p className="relative text-xs text-header-foreground/50">Authorized personnel only. All activity is recorded.</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
            <p className="text-sm text-muted-foreground">Use your plant system account.</p>
          </div>
          <div className="space-y-2"><Label htmlFor="u">Username</Label><Input id="u" value={u} onChange={(e) => setU(e.target.value)} autoComplete="username" required /></div>
          <div className="space-y-2"><Label htmlFor="p">Password</Label><Input id="p" type="password" value={p} onChange={(e) => setP(e.target.value)} autoComplete="current-password" required /></div>
          {err && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{err}</p>}
          <Button type="submit" className="w-full" disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />}Sign in</Button>
          <p className="text-xs text-muted-foreground">Sessions end automatically after 15 minutes of inactivity.</p>
        </form>
      </div>
    </div>
  );
}
