"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { api, session, UNAUTHORIZED_EVENT } from "./api";
import type { LoginResponse, Perm, SessionUser } from "./types";

interface AuthState {
  user: SessionUser | null;
  /** false until sessionStorage has been read on the client (avoids a flash of the login redirect). */
  ready: boolean;
  login: (username: string, password: string) => Promise<SessionUser>;
  logout: () => Promise<void>;
  hasRole: (...roles: string[]) => boolean;
  /** True when the signed-in user holds the permission (decided by the server, see server/permissions.js). */
  can: (perm: Perm) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

// undefined on the server / during hydration => "not ready"; string | null once sessionStorage is readable.
const serverSnapshot = (): string | null | undefined => undefined;

export function AuthProvider({ children }: { children: ReactNode }) {
  const raw = useSyncExternalStore<string | null | undefined>(session.subscribe, session.getUserRaw, serverSnapshot);
  const ready = raw !== undefined;
  const user = useMemo<SessionUser | null>(() => {
    if (!raw) return null;
    try {
      const u = JSON.parse(raw) as SessionUser;
      // A session stored before permissions existed has none: treat it as signed out so the user logs in again.
      return Array.isArray(u.permissions) ? u : null;
    } catch { return null; }
  }, [raw]);

  useEffect(() => {
    const onUnauthorized = () => session.clear();
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const d = await api<LoginResponse>("/api/auth/login", { body: { username, password } });
    session.save(d.token, d.user);
    return d.user;
  }, []);

  const logout = useCallback(async () => {
    try { await api("/api/auth/logout", { method: "POST", body: {} }); } catch {}
    session.clear();
  }, []);

  const hasRole = useCallback((...roles: string[]) => !!user?.roles.some(r => roles.includes(r)), [user]);

  const can = useCallback((perm: Perm) => !!user?.permissions.includes(perm), [user]);

  return <AuthContext.Provider value={{ user, ready, login, logout, hasRole, can }}>{children}</AuthContext.Provider>;
}
