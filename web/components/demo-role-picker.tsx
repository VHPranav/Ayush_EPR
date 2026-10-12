"use client";
import { useState } from "react";
import { Avatar } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { DEMO_USERS } from "@/lib/demo/data";
import { roleLabel } from "@/lib/roles";

/** One-click role switcher for the static demo: shows how menus and dashboards change per role. */
export default function DemoRolePicker() {
  const { login } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);

  async function enter(username: string) {
    setBusy(username);
    try { await login(username, "demo"); } finally { setBusy(null); }
  }

  return (
    <section className="mt-8 border-t border-line pt-6" aria-label="Demo accounts">
      <h2 className="m-0 text-sm font-semibold text-ink">Explore the demo as…</h2>
      <p className="mb-3 mt-1 text-xs text-muted">Each role sees different menus and dashboards. Sample data only. Everything is view-only. Password for any account: <b className="font-semibold text-ink-2">demo</b>.</p>
      <div className="grid grid-cols-2 gap-2">
        {DEMO_USERS.map(u => (
          <button
            key={u.username}
            type="button"
            onClick={() => enter(u.username)}
            disabled={busy !== null}
            className="flex items-center gap-2.5 rounded-xl border border-line bg-white p-2.5 text-left transition-colors hover:border-brand-ring hover:bg-brand-soft disabled:opacity-60"
          >
            <Avatar name={u.name} size={30} />
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold text-ink">{roleLabel(u.roles[0])}</span>
              <span className="block truncate text-[11px] text-muted">{busy === u.username ? "Signing in…" : u.blurb}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
