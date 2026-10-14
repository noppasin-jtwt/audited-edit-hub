import type { Role } from "./schema";

const enc = new TextEncoder();
const b64 = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64url = (s: string) => s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s: string) => s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);

/** Format: pbkdf2$<iterations>$<saltBase64>$<hashBase64> (PBKDF2-SHA256). */
export async function hashPassword(password: string, iterations = 100_000) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, iterations);
  return `pbkdf2$${iterations}$${b64(salt)}$${b64(hash)}`;
}

async function derive(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
}

export async function verifyPassword(password: string, stored: string) {
  const [alg, it, salt, hash] = stored.split("$");
  if (alg !== "pbkdf2" || !it || !salt || !hash) return false;
  const got = b64(await derive(password, unb64(salt), Number(it)));
  if (got.length !== hash.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}

export interface SessionUser {
  uid: number;
  username: string;
  role: Role;
  exp: number;
}

function secret() {
  return process.env["SESSION_SECRET"] || "dev-only-session-secret-change-me";
}

async function hmac(data: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(b64(await crypto.subtle.sign("HMAC", key, enc.encode(data))));
}

export async function signToken(u: Omit<SessionUser, "exp">, ttlMs = 8 * 3600_000) {
  const body = b64url(btoa(JSON.stringify({ ...u, exp: Date.now() + ttlMs })));
  return `${body}.${await hmac(body)}`;
}

export async function verifyToken(token: string): Promise<SessionUser> {
  const [body, sig] = (token || "").split(".");
  if (!body || !sig || (await hmac(body)) !== sig) throw new Error("Session invalid. Please sign in again.");
  const u = JSON.parse(atob(unb64url(body))) as SessionUser;
  if (u.exp < Date.now()) throw new Error("Session expired. Please sign in again.");
  return u;
}
