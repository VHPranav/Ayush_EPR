"use client";
import { Copy, KeyRound, Pencil, Plus, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Avatar, Button, Card, Empty, Field, Input, Modal, PageHead, Pill, Table, Td } from "@/components/ui";

const ROLE_TONE: Record<string, "lavender" | "lime" | "rose" | "sky" | "gray" | "amber"> = {
  SUPER_ADMIN: "gray", MEDICAL_DIRECTOR: "lavender", DOCTOR: "lavender", AYURVEDA_PHYSICIAN: "lavender", MODERN_MEDICAL_CONSULTANT: "lavender",
  NURSE: "sky", PANCHAKARMA_THERAPIST: "lime", YOGA_THERAPIST: "lime", PHYSIOTHERAPIST: "lime", DIETITIAN: "lime",
  PHARMACIST: "amber", RECEPTION: "rose", FINANCE: "rose", MANAGER: "rose", AUDITOR: "gray",
};
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { errMsg, fmtDateTime } from "@/lib/format";
import { generatePassword, MIN_PASSWORD } from "@/lib/password";
import { ROLE_INFO, ROLE_ORDER, roleLabel } from "@/lib/roles";
import { useToast } from "@/lib/toast";
import type { ManagedUser } from "@/lib/types";
import { useFetch } from "@/lib/use-fetch";

type Dialog =
  | { kind: "create" }
  | { kind: "edit"; user: ManagedUser }
  | { kind: "password"; user: ManagedUser }
  | { kind: "status"; user: ManagedUser };

export default function UsersPage() {
  const { user: me } = useAuth();
  const { data, loading, error, reload } = useFetch<ManagedUser[]>("/api/users");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const close = () => setDialog(null);
  const done = () => { close(); reload(); };

  return (
    <>
      <PageHead
        title="Users"
        subtitle="Create staff accounts, assign roles, and control who can sign in."
        actions={<Button variant="primary" onClick={() => setDialog({ kind: "create" })}><Plus size={16} aria-hidden /> Add user</Button>}
      />
      <Card>
        {error ? <Empty>Could not load users: {error}</Empty> : loading ? <Empty>Loading…</Empty> : data?.length ? (
          <Table head={["User", "Roles", "Status", "Last sign-in", ""]}>
            {data.map(u => (
              <tr key={u.user_id}>
                <Td>
                  <div className="flex items-center gap-3">
                    <Avatar name={u.display_name} size={36} />
                    <div className="min-w-0">
                      <div className="font-semibold text-ink">{u.display_name}{u.user_id === me?.id && <span className="ml-2 text-xs font-normal text-muted">(you)</span>}</div>
                      <div className="text-xs font-normal text-muted">{u.username}</div>
                    </div>
                  </div>
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1.5">{u.roles.map(r => <Pill key={r} tone={ROLE_TONE[r] ?? "gray"}>{roleLabel(r)}</Pill>)}</div>
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1.5">
                    <Pill tone={u.active ? "green" : "gray"}>{u.active ? "Active" : "Deactivated"}</Pill>
                    {u.legacy_password && <span title="This account still uses the old password format (e.g. a seeded dev account). Reset its password."><Pill tone="amber">Reset password</Pill></span>}
                  </div>
                </Td>
                <Td><span className="whitespace-nowrap">{u.last_login ? fmtDateTime(u.last_login) : "Never"}</span></Td>
                <Td>
                  <div className="flex justify-end gap-1.5">
                    <Button className="!px-2.5 !py-1.5 text-xs" onClick={() => setDialog({ kind: "edit", user: u })} aria-label={`Edit ${u.username}`}><Pencil size={14} aria-hidden /> Edit</Button>
                    <Button className="!px-2.5 !py-1.5 text-xs" onClick={() => setDialog({ kind: "password", user: u })} aria-label={`Reset password for ${u.username}`}><KeyRound size={14} aria-hidden /> Password</Button>
                    <Button
                      variant={u.active ? "danger" : "default"}
                      className="!px-2.5 !py-1.5 text-xs"
                      disabled={u.active && u.user_id === me?.id}
                      title={u.active && u.user_id === me?.id ? "You can't deactivate your own account" : undefined}
                      onClick={() => setDialog({ kind: "status", user: u })}
                    >
                      {u.active ? "Deactivate" : "Activate"}
                    </Button>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        ) : <Empty>No users.</Empty>}
      </Card>

      <UserDialog dialog={dialog?.kind === "create" || dialog?.kind === "edit" ? dialog : null} onClose={close} onSaved={done} />
      <PasswordDialog user={dialog?.kind === "password" ? dialog.user : null} onClose={close} onSaved={done} />
      <StatusDialog user={dialog?.kind === "status" ? dialog.user : null} onClose={close} onSaved={done} />
    </>
  );
}

/** Password input with a generator and copy button. The admin sees the value once, here. */
function PasswordField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const toast = useToast();
  const [shown, setShown] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(value); toast("Password copied"); } catch { toast("Could not copy — select the text and copy it manually"); }
  }
  return (
    <Field label={label}>
      <div className="flex gap-2">
        <Input type={shown ? "text" : "password"} value={value} onChange={e => onChange(e.target.value)} autoComplete="new-password" spellCheck={false} />
        <Button onClick={() => { onChange(generatePassword()); setShown(true); }} title="Generate a strong password"><RefreshCw size={15} aria-hidden /> Generate</Button>
        <Button onClick={copy} disabled={!value} aria-label="Copy password"><Copy size={15} aria-hidden /></Button>
      </div>
      <div className="mt-1.5 flex items-center justify-between text-xs text-muted">
        <span>At least {MIN_PASSWORD} characters.</span>
        <button type="button" className="font-semibold text-brand hover:underline" onClick={() => setShown(s => !s)}>{shown ? "Hide" : "Show"}</button>
      </div>
    </Field>
  );
}

function UserDialog({ dialog, onClose, onSaved }: { dialog: Extract<Dialog, { kind: "create" | "edit" }> | null; onClose: () => void; onSaved: () => void }) {
  return (
    <Modal
      open={!!dialog}
      onClose={onClose}
      title={dialog?.kind === "edit" ? "Edit user" : "Add user"}
      description={dialog?.kind === "edit" ? `Change the name or roles for ${dialog.user.username}.` : "They will sign in with this username and password."}
      width="max-w-2xl"
    >
      {dialog && <UserForm key={dialog.kind === "edit" ? dialog.user.user_id : "new"} dialog={dialog} onClose={onClose} onSaved={onSaved} />}
    </Modal>
  );
}

function UserForm({ dialog, onClose, onSaved }: { dialog: Extract<Dialog, { kind: "create" | "edit" }>; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const editing = dialog.kind === "edit" ? dialog.user : null;
  const [username, setUsername] = useState("");
  const [name, setName] = useState(editing?.display_name ?? "");
  const [password, setPassword] = useState("");
  const [roles, setRoles] = useState<string[]>(editing?.roles ?? []);
  const [busy, setBusy] = useState(false);
  const toggle = (r: string) => setRoles(rs => (rs.includes(r) ? rs.filter(x => x !== r) : [...rs, r]));

  async function save() {
    if (!name.trim()) return toast("Full name is required");
    if (!roles.length) return toast("Choose at least one role");
    if (!editing && !/^[a-z0-9][a-z0-9._-]{2,31}$/i.test(username)) return toast("Username: 3–32 letters, numbers, dot, dash or underscore");
    if (!editing && password.length < MIN_PASSWORD) return toast(`Password must be at least ${MIN_PASSWORD} characters`);
    setBusy(true);
    try {
      if (editing) await api(`/api/users/${editing.user_id}`, { method: "PUT", body: { displayName: name, roles } });
      else await api("/api/users", { body: { username, displayName: name, password, roles } });
      toast(editing ? "User updated" : "User created");
      onSaved();
    } catch (e) {
      toast(errMsg(e));
      setBusy(false);
    }
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
        {editing ? (
          <Field label="Username"><Input value={editing.username} disabled /></Field>
        ) : (
          <Field label="Username"><Input value={username} onChange={e => setUsername(e.target.value)} autoComplete="off" autoFocus /></Field>
        )}
        <Field label="Full name"><Input value={name} onChange={e => setName(e.target.value)} /></Field>
      </div>
      {!editing && <PasswordField label="Password" value={password} onChange={setPassword} />}

      <fieldset className="mt-3 min-w-0 border-0 p-0">
        <legend className="mb-1.5 text-sm font-medium text-ink-2">Roles</legend>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {ROLE_ORDER.map(r => {
            const on = roles.includes(r);
            return (
              <label key={r} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${on ? "border-brand bg-brand-soft" : "border-line hover:bg-subtle"}`}>
                <input type="checkbox" checked={on} onChange={() => toggle(r)} className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink">{ROLE_INFO[r].label}</span>
                  <span className="block text-xs text-muted">{ROLE_INFO[r].blurb}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="sticky bottom-0 -mx-6 -mb-5 mt-5 flex justify-end gap-2 border-t border-line bg-white px-6 py-4">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={save} disabled={busy}>{busy ? "Saving…" : editing ? "Save changes" : "Create user"}</Button>
      </div>
    </>
  );
}

function PasswordDialog({ user, onClose, onSaved }: { user: ManagedUser | null; onClose: () => void; onSaved: () => void }) {
  return (
    <Modal open={!!user} onClose={onClose} title="Reset password" description={user ? `Set a new password for ${user.display_name} (${user.username}). They will be signed out everywhere.` : undefined}>
      {user && <PasswordForm key={user.user_id} user={user} onClose={onClose} onSaved={onSaved} />}
    </Modal>
  );
}

function PasswordForm({ user, onClose, onSaved }: { user: ManagedUser; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    if (password.length < MIN_PASSWORD) return toast(`Password must be at least ${MIN_PASSWORD} characters`);
    setBusy(true);
    try {
      await api(`/api/users/${user.user_id}/reset-password`, { body: { newPassword: password } });
      toast("Password updated");
      onSaved();
    } catch (e) {
      toast(errMsg(e));
      setBusy(false);
    }
  }
  return (
    <>
      <PasswordField label="New password" value={password} onChange={setPassword} />
      <p className="mt-2 text-xs text-muted">Copy it before saving — it can&apos;t be shown again.</p>
      <div className="sticky bottom-0 -mx-6 -mb-5 mt-5 flex justify-end gap-2 border-t border-line bg-white px-6 py-4">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Reset password"}</Button>
      </div>
    </>
  );
}

function StatusDialog({ user, onClose, onSaved }: { user: ManagedUser | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const activating = user ? !user.active : false;
  async function confirm() {
    if (!user) return;
    setBusy(true);
    try {
      await api(`/api/users/${user.user_id}`, { method: "PUT", body: { active: activating } });
      toast(activating ? "User activated" : "User deactivated");
      onSaved();
    } catch (e) {
      toast(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open={!!user}
      onClose={onClose}
      title={activating ? "Activate user?" : "Deactivate user?"}
      description={user ? (activating ? `${user.display_name} will be able to sign in again.` : `${user.display_name} will be signed out immediately and won't be able to sign in. Their records and audit history are kept.`) : undefined}
      width="max-w-md"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant={activating ? "primary" : "danger"} onClick={confirm} disabled={busy}>{activating ? "Activate" : "Deactivate"}</Button></>}
    >
      <p className="m-0 text-sm text-ink-2">{user?.username}</p>
    </Modal>
  );
}
