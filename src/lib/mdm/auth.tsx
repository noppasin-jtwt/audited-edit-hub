import type React from "react";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { INACTIVITY_MS, type Role } from "./schema";

export interface ClientUser { uid: number; username: string; role: Role }
interface AuthState {
  ready: boolean;
  token: string | null;
  user: ClientUser | null;
  demo: boolean;
  signIn: (token: string, user: ClientUser, demo: boolean) => void;
  signOut: () => void;
}
const g = globalThis as unknown as { __mdmAuthCtx?: React.Context<AuthState | null> };
// Reuse one context across hot reloads so providers and consumers always match.
const Ctx = (g.__mdmAuthCtx ??= createContext<AuthState | null>(null));
const KEY = "mdm-session";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<{ token: string | null; user: ClientUser | null; demo: boolean }>({ token: null, user: null, demo: false });
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setS(JSON.parse(raw));
    } catch { /* ignore */ }
    setReady(true);
  }, []);
  const signIn = useCallback((token: string, user: ClientUser, demo: boolean) => {
    const v = { token, user, demo };
    localStorage.setItem(KEY, JSON.stringify(v));
    setS(v);
  }, []);
  const signOut = useCallback(() => {
    localStorage.removeItem(KEY);
    setS({ token: null, user: null, demo: false });
  }, []);

  useEffect(() => {
    if (!s.token) return;
    let timer = window.setTimeout(signOut, INACTIVITY_MS);
    const reset = () => { clearTimeout(timer); timer = window.setTimeout(signOut, INACTIVITY_MS); };
    const evs = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    evs.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => { clearTimeout(timer); evs.forEach((e) => window.removeEventListener(e, reset)); };
  }, [s.token, signOut]);

  return <Ctx.Provider value={{ ...s, ready, signIn, signOut }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside AuthProvider");
  return c;
}
