"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { AUDIT_ACTIONS, actionLabel, detailText } from "@/lib/audit-labels";
import { errMsg, fmtDateTime } from "@/lib/format";
import { useToast } from "@/lib/toast";
import { useFetch } from "@/lib/use-fetch";
import type { AuditEntry } from "@/lib/types";
import { Button, Card, Empty, Input, PageHead, Pill, Select, Table, Td } from "@/components/ui";

const csvCell = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;

export default function AuditPage() {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  useEffect(() => { const t = setTimeout(() => setTerm(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const qs = `q=${encodeURIComponent(term)}&action=${encodeURIComponent(action)}&from=${from}&to=${to}`;
  const { data: log, error, reload } = useFetch<AuditEntry[]>(`/api/audit?${qs}`);

  async function exportCsv() {
    try {
      const rows = await api<AuditEntry[]>(`/api/audit?${qs}&limit=5000`);
      const head = ["Time", "User", "Action code", "Action", "Table", "Record", "Details", "IP address"];
      const body = rows.map(x => [x.event_time, x.username ?? "", x.action, actionLabel(x.action), x.table_name ?? "", x.record_id ?? "", detailText(x.details), x.ip_address ?? ""]);
      const csv = [head, ...body].map(r => r.map(csvCell).join(",")).join("\r\n");
      const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast(`Exported ${rows.length} entries`);
    } catch (e) {
      toast(errMsg(e));
    }
  }

  const filtered = !!(term || action || from || to);
  return (
    <>
      <PageHead title="Audit log" subtitle="Who did what, and when. Entries are append-only and cannot be edited or deleted." actions={<Button onClick={exportCsv}>Export CSV</Button>} />
      <Card>
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search user, action or record" aria-label="Search" />
          <Select aria-label="Action" value={action} onChange={e => setAction(e.target.value)}>
            <option value="">All actions</option>
            {Object.entries(AUDIT_ACTIONS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </Select>
          <label className="flex items-center gap-2 text-sm text-ink-2">From <Input type="date" aria-label="From date" value={from} onChange={e => setFrom(e.target.value)} /></label>
          <label className="flex items-center gap-2 text-sm text-ink-2">To <Input type="date" aria-label="To date" value={to} onChange={e => setTo(e.target.value)} /></label>
        </div>
        <div className="mb-2 flex flex-wrap items-center gap-3 text-sm text-muted">
          <span>{log ? `${log.length}${log.length >= 500 ? "+ (latest 500 shown; export for more)" : ""} entries` : ""}</span>
          {filtered && <Button onClick={() => { setQ(""); setAction(""); setFrom(""); setTo(""); }}>Clear filters</Button>}
          <Button onClick={reload}>Refresh</Button>
        </div>
        {error ? <Empty>Audit access is restricted or the log is unavailable.</Empty> : log === null ? <Empty>Loading…</Empty> : !log.length ? <Empty>No entries match.</Empty> : (
          <Table head={["Time", "User", "Action", "Details"]}>
            {log.map(x => (
              <tr key={x.audit_id ?? `${x.event_time}${x.action}${x.record_id}`}>
                <Td>{fmtDateTime(x.event_time)}</Td>
                <Td>{x.username || "—"}</Td>
                <Td><span className="flex flex-wrap items-center gap-1.5">{actionLabel(x.action)}{x.action === "LOGIN_FAILURE" && <Pill tone="red">check</Pill>}</span></Td>
                <Td><span className="text-xs text-muted">{detailText(x.details) || (x.table_name ? `${x.table_name}${x.record_id ? ` · ${x.record_id.slice(0, 8)}…` : ""}` : "")}</span></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
