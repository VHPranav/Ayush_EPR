"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import {
  CalendarDays, ChevronsLeft, ChevronsRight, ClipboardList, FileCheck2, FileText, FolderOpen, History, LayoutDashboard, Leaf, ListChecks,
  LogOut, Package, Receipt, ShieldCheck, Stethoscope, UserPlus, UsersRound, X, type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { PatientProvider, usePatient } from "@/lib/patient";
import type { Perm } from "@/lib/types";
import { sidebarPref } from "@/lib/ui-prefs";
import { GlobalSearch } from "./global-search";
import { Avatar, Card, Empty } from "./ui";

/** `perm` is the permission needed to see the item and open the page (omitted = every signed-in user). */
interface NavItem { href: string; label: string; icon: LucideIcon; perm?: Perm }
const NAV: { section?: string; items: NavItem[] }[] = [
  { items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }] },
  {
    section: "Front desk",
    items: [
      { href: "/reception", label: "Reception", icon: UserPlus, perm: "patients.view" },
      { href: "/appointments", label: "Appointments", icon: CalendarDays, perm: "appointments.read" },
      { href: "/billing", label: "Billing", icon: Receipt, perm: "billing.read" },
      { href: "/documents", label: "Documents", icon: FolderOpen, perm: "documents.read" },
    ],
  },
  {
    section: "Clinical",
    items: [
      { href: "/doctor", label: "Doctor", icon: Stethoscope, perm: "clinical.read" },
      { href: "/prescription", label: "Prescription", icon: FileText, perm: "prescriptions.read" },
      { href: "/timeline", label: "Timeline", icon: History, perm: "clinical.read" },
      { href: "/clinical", label: "Clinical Modules", icon: ClipboardList, perm: "clinical.read" },
      { href: "/sessions", label: "Therapy Sessions", icon: Leaf, perm: "clinical.read" },
      { href: "/discharge", label: "Discharge", icon: FileCheck2, perm: "clinical.read" },
    ],
  },
  {
    section: "Pharmacy & catalogue",
    items: [
      { href: "/pharmacy", label: "Pharmacy", icon: Package, perm: "pharmacy.read" },
      { href: "/treatment-master", label: "Treatment Master", icon: ListChecks, perm: "treatments.read" },
    ],
  },
  {
    section: "Administration",
    items: [
      { href: "/users", label: "Users", icon: UsersRound, perm: "users.manage" },
      { href: "/audit", label: "Audit", icon: ShieldCheck, perm: "audit.read" },
    ],
  },
];

const visibleNav = (can: (p: Perm) => boolean) =>
  NAV.map(g => ({ ...g, items: g.items.filter(i => !i.perm || can(i.perm)) })).filter(g => g.items.length);

const ROUTE_PERMS = new Map(NAV.flatMap(g => g.items).map(i => [i.href, i.perm] as const));

function NoAccess() {
  return (
    <Card>
      <Empty>
        <div className="mb-1 text-base font-semibold text-ink">You don&apos;t have access to this page</div>
        Your role isn&apos;t permitted to use it. Ask an administrator if you think this is a mistake.
      </Empty>
    </Card>
  );
}

function Sidebar() {
  const { logout, can } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const collapsed = useSyncExternalStore(sidebarPref.subscribe, sidebarPref.get, sidebarPref.getServer);
  // Phones always show the icon rail; the toggle only applies from md up.
  const label = collapsed ? "hidden" : "hidden md:inline";

  return (
    <aside className={`flex shrink-0 flex-col transition-[width] duration-200 ${collapsed ? "w-[84px]" : "w-[84px] md:w-[272px]"}`}>
      <div className={`flex gap-3 px-5 pb-4 pt-6 ${collapsed ? "flex-col items-center" : "items-center justify-center md:justify-between"}`}>
        <div className="flex min-w-0 items-center gap-3">
          <Image src="/logo.png" alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-xl object-contain" />
          <div className={`min-w-0 ${collapsed ? "hidden" : "hidden md:block"}`}>
            <div className="truncate text-base font-semibold leading-tight text-ink">Ayush EPR</div>
            <div className="truncate text-xs text-muted">Ayurveda &amp; Yoga Centre</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => sidebarPref.toggle()}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="hidden rounded-lg p-1.5 text-muted hover:bg-hover hover:text-ink md:block"
        >
          {collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3.5 pb-3" aria-label="Main">
        {visibleNav(can).map((g, gi) => (
          <div key={gi} className="mb-2">
            {g.section && <div className={`px-3 pb-1.5 pt-4 text-xs font-medium uppercase tracking-wider text-muted ${collapsed ? "hidden" : "hidden md:block"}`}>{g.section}</div>}
            {!g.section && gi > 0 && <div className="my-2 border-t border-line" />}
            {g.section && <div className={`mx-3 my-2 border-t border-line ${collapsed ? "block" : "block md:hidden"}`} />}
            {g.items.map(n => {
              const active = pathname === n.href;
              const Icon = n.icon;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  title={n.label}
                  aria-current={active ? "page" : undefined}
                  className={`my-0.5 flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors ${collapsed ? "justify-center" : "justify-center md:justify-start"} ${active ? "bg-brand text-white shadow-xs" : "text-ink-2 hover:bg-hover hover:text-ink"}`}
                >
                  <Icon size={20} className={active ? "text-white" : "text-muted"} aria-hidden />
                  <span className={label}>{n.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-line px-3.5 py-3">
        <button
          type="button"
          title="Log out"
          onClick={async () => { await logout(); router.replace("/login"); }}
          className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-ink-2 transition-colors hover:bg-danger-soft hover:text-danger ${collapsed ? "justify-center" : "justify-center md:justify-start"}`}
        >
          <LogOut size={20} className="text-muted" aria-hidden />
          <span className={label}>Log out</span>
        </button>
      </div>
    </aside>
  );
}

function TopBar() {
  const { user } = useAuth();
  const { patient, close } = usePatient();
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 pb-3 pt-4 md:px-8 md:pt-6">
      <GlobalSearch />
      <div className="ml-auto flex items-center gap-3">
        {patient && (
          <div className="flex items-center gap-2.5 rounded-xl bg-white py-1.5 pl-1.5 pr-2 shadow-card">
            <Avatar name={patient.name} size={30} />
            <Link href="/timeline" className="hidden min-w-0 sm:block" title="Open timeline">
              <span className="block max-w-[160px] truncate text-sm font-semibold leading-tight text-ink">{patient.name}</span>
              <span className="block text-xs leading-tight text-muted">{patient.uhid}</span>
            </Link>
            <button type="button" onClick={close} aria-label="Close patient" className="rounded-md p-1 text-muted hover:bg-hover hover:text-ink"><X size={15} /></button>
          </div>
        )}
        {user && (
          <div className="flex items-center gap-2.5">
            <Avatar name={user.name} size={38} />
            <div className="hidden min-w-0 lg:block">
              <div className="truncate text-sm font-semibold leading-tight text-ink">{user.name}</div>
              <div className="truncate text-xs leading-tight text-muted">{user.roles.join(", ").replaceAll("_", " ").toLowerCase()}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, ready, can } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [ready, user, router]);

  // Until sessionStorage has been read (server render + hydration) render the full shell so page
  // segments are part of the prerendered tree; once we know the user is signed out, render nothing
  // while the redirect to /login happens.
  if (ready && !user) return null;

  return (
    <PatientProvider>
      {/* Full-bleed app frame: fills the whole window, no outer margin. */}
      <div className="relative flex h-screen w-full overflow-hidden bg-white">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col bg-panel">
          <TopBar />
          <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-3 md:px-8">
            <div className="mx-auto max-w-[1400px]">
              {/* Once the user is known, a page they lack permission for is not rendered at all (so it makes no API calls). */}
              {ready && user && ROUTE_PERMS.get(pathname) && !can(ROUTE_PERMS.get(pathname)!) ? <NoAccess /> : children}
            </div>
          </main>
        </div>
      </div>
    </PatientProvider>
  );
}
