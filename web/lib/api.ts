/** Static demo build: no server. `NEXT_PUBLIC_DEMO` is inlined at build time, so real builds carry none of the demo code. */
export const DEMO = process.env.NEXT_PUBLIC_DEMO === "1";

const TOKEN_KEY = "AYUSH_TOKEN";
const USER_KEY = "AYUSH_USER";
export const PATIENT_KEY = "AYUSH_PATIENT";
/** Set when a session ends on its own (expiry, deactivation): holds the page the user was on, so login can explain and return there. */
export const EXPIRED_KEY = "AYUSH_EXPIRED";

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

function read(key: string): string | null {
  try { return sessionStorage.getItem(key); } catch { return null; }
}

const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

export const session = {
  getToken: () => read(TOKEN_KEY) ?? "",
  /** Raw stored user JSON (a stable string, so it can back useSyncExternalStore). Null when signed out. */
  getUserRaw: () => (read(TOKEN_KEY) ? read(USER_KEY) : null),
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  save(token: string, user: unknown) {
    try {
      sessionStorage.removeItem(PATIENT_KEY); // a new sign-in must never inherit the previous user's open patient
      sessionStorage.setItem(TOKEN_KEY, token);
      sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch {}
    emit();
  },
  clear() {
    try { sessionStorage.clear(); } catch {}
    emit();
  },
};

// Fired on any 401 from an authenticated call so the app shell can send the user to /login.
export const UNAUTHORIZED_EVENT = "ayush:unauthorized";

function authHeaders(): Record<string, string> {
  const t = session.getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function parse<T>(r: Response): Promise<T> {
  let data: unknown = {};
  try { data = await r.json(); } catch {}
  if (!r.ok) {
    if (r.status === 401 && session.getToken()) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw new ApiError((data as { error?: string })?.error || "Request failed", r.status);
  }
  return data as T;
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  if (DEMO) {
    const { demoRequest } = await import("./demo/handler");
    try {
      return await demoRequest<T>(path, opts.method ?? (opts.body !== undefined ? "POST" : "GET"), opts.body);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401 && session.getToken()) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
      throw e;
    }
  }
  const r = await fetch(path, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  return parse<T>(r);
}

export async function upload<T = unknown>(path: string, form: FormData): Promise<T> {
  if (DEMO) throw new ApiError("Demo mode: uploads are disabled in this read-only preview.", 400);
  const r = await fetch(path, { method: "POST", headers: authHeaders(), body: form });
  return parse<T>(r);
}

// Downloads need the Bearer token, so a plain <a href> cannot be used; fetch the blob instead.
export async function download(path: string, fileName: string) {
  if (DEMO) throw new ApiError("Demo mode: downloads are disabled in this read-only preview.", 400);
  const r = await fetch(path, { headers: authHeaders() });
  if (!r.ok) {
    if (r.status === 401) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw new ApiError(r.status === 404 ? "File not found" : "Download failed", r.status);
  }
  const url = URL.createObjectURL(await r.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Server/database health for the login page. The static demo has no server, so it is always "up". */
export async function checkHealth(): Promise<"online" | "db-down" | "offline"> {
  if (DEMO) return "online";
  try {
    const d = await fetch("/api/health").then(r => r.json());
    return d.ok ? "online" : "db-down";
  } catch {
    return "offline";
  }
}
