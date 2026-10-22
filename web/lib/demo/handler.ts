// Answers /api/* calls from the in-memory sample data when the app is built with NEXT_PUBLIC_DEMO=1.
// It mirrors the real API's shapes and permission checks, but every write is refused: the demo is view-only.
import { ApiError, session } from "../api";
import type { Perm, SessionUser } from "../types";
import { buildDemo, DEMO_USERS, type DemoDb } from "./data";
import rolePermissions from "./permissions.json";

export const DEMO_WRITE_MESSAGE = "Demo mode: this is a read-only preview, so changes aren't saved.";

let db: DemoDb | null = null;
const getDb = () => (db ??= buildDemo(Date.now()));

const permsForRoles = (roles: readonly string[]): Perm[] =>
  [...new Set(roles.flatMap(r => (rolePermissions as Record<string, string[]>)[r] ?? []))] as Perm[];

const currentUser = (): SessionUser | null => {
  const raw = session.getUserRaw();
  try { return raw ? (JSON.parse(raw) as SessionUser) : null; } catch { return null; }
};

/** Permission required for each readable endpoint (same keys as server/permissions.js). */
const READ_PERMS: [RegExp, Perm][] = [
  [/^\/api\/patients$/, "patients.view"],
  [/^\/api\/patients\/[^/]+$/, "patients.view"],
  [/^\/api\/patients\/[^/]+\/(timeline|problems|outcomes|investigations|referrals|care-plans|treatment-sessions|discharge)$/, "clinical.read"],
  [/^\/api\/patients\/[^/]+\/allergies$/, "allergies.read"],
  [/^\/api\/patients\/[^/]+\/medication-reconciliation$/, "medrec.read"],
  [/^\/api\/patients\/[^/]+\/billing$/, "billing.read"],
  [/^\/api\/patients\/[^/]+\/documents$/, "documents.read"],
  [/^\/api\/pharmacy\/stock$/, "pharmacy.read"],
  [/^\/api\/treatment-master$/, "treatments.read"],
  [/^\/api\/reception\/followups$/, "appointments.read"],
  [/^\/api\/audit$/, "audit.read"],
  [/^\/api\/stats\/patients$/, "patients.view"],
  [/^\/api\/providers$/, "appointments.write"],
  [/^\/api\/pharmacy\/queue$/, "pharmacy.write"],
  [/^\/api\/users$/, "users.manage"],
];

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function demoRequest<T>(path: string, method: string, body: unknown): Promise<T> {
  await delay(90); // a touch of latency so loading states look natural
  const url = new URL(path, "http://demo.local");
  const route = url.pathname;

  if (route === "/api/health") return { ok: true, database: "demo", serverTime: new Date().toISOString() } as T;

  if (route === "/api/auth/login" && method === "POST") {
    const { username, password } = (body ?? {}) as { username?: string; password?: string };
    const u = DEMO_USERS.find(d => d.username === String(username ?? "").trim().toLowerCase());
    if (!u || password !== "demo") throw new ApiError("Invalid credentials", 401);
    const user: SessionUser = { id: `demo-${u.username}`, username: u.username, name: u.name, roles: [...u.roles], permissions: permsForRoles(u.roles) };
    return { token: "demo-token", expiresAt: new Date(Date.now() + 8 * 3_600_000).toISOString(), user } as T;
  }
  if (route === "/api/auth/logout") return { ok: true } as T;

  const user = currentUser();
  if (!user || !session.getToken()) throw new ApiError("Authentication required", 401);
  if (route === "/api/me") return user as T;

  if (method !== "GET") throw new ApiError(DEMO_WRITE_MESSAGE, 400);

  const rule = READ_PERMS.find(([re]) => re.test(route));
  if (!rule) throw new ApiError("API route not found", 404);
  if (!user.permissions.includes(rule[1])) throw new ApiError("Insufficient permission", 403);

  const d = getDb();
  const can = (p: Perm) => user.permissions.includes(p);

  if (route === "/api/patients") {
    const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    return d.summaries.filter(p => !q || [p.uhid, p.name, p.phone ?? ""].some(v => v.toLowerCase().includes(q))).slice(0, 100) as T;
  }
  if (route === "/api/providers" || route === "/api/pharmacy/queue") return [] as T;
  if (route === "/api/stats/patients") {
    const counts = new Map<string, number>();
    for (const p of d.summaries) {
      const k = new Date(p.registered_at);
      const key = `${k.getFullYear()}-${String(k.getMonth() + 1).padStart(2, "0")}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return { total: d.summaries.length, months: [...counts].sort().map(([month, n]) => ({ month, n })) } as T;
  }
  if (route === "/api/pharmacy/stock") return d.stock as T;
  if (route === "/api/treatment-master") return d.treatments as T;
  if (route === "/api/audit") return d.audit as T;
  if (route === "/api/users") return d.users as T;
  if (route === "/api/reception/followups") {
    const days = Math.min(Number(url.searchParams.get("days") ?? 30), 365);
    const end = Date.now() + days * 86_400_000;
    return d.followups.filter(a => new Date(a.appointment_at).getTime() <= end) as T;
  }

  const m = /^\/api\/patients\/([^/]+)(?:\/([a-z-]+))?$/.exec(route)!;
  const id = m[1], sub = m[2];
  const patient = d.patients.find(p => p.patient_id === id || p.uhid === id);
  if (!patient) throw new ApiError("Patient not found", 404);
  const pid = patient.patient_id;

  switch (sub) {
    case undefined: // chart sections are filtered by permission, exactly like the real API
      return {
        ...patient,
        allergies: can("allergies.read") ? d.allergies[pid] : [],
        clinicalRecords: can("clinical.read") ? patient.clinicalRecords : [],
        prescriptions: can("prescriptions.read") ? patient.prescriptions : [],
        letters: can("clinical.read") ? patient.letters : [],
        discharges: can("clinical.read") ? patient.discharges : [],
        appointments: can("appointments.read") ? patient.appointments : [],
      } as T;
    case "timeline": return d.timeline[pid] as T;
    case "problems": return d.problems[pid] as T;
    case "allergies": return d.allergies[pid] as T;
    case "medication-reconciliation": return d.medrec[pid] as T;
    case "outcomes": return d.outcomes[pid] as T;
    case "investigations": return d.investigations[pid] as T;
    case "referrals": return d.referrals[pid] as T;
    case "care-plans": return d.carePlans[pid] as T;
    case "treatment-sessions": return d.sessions[pid] as T;
    case "documents": return d.documents[pid] as T;
    case "billing": return { accounts: d.billing[pid], items: [] } as T;
    case "discharge": return d.discharge[pid] as T;
    default: throw new ApiError("API route not found", 404);
  }
}
