"use client";
import { fmtDateTime } from "@/lib/format";
import { useFetch } from "@/lib/use-fetch";
import type { AuditEntry } from "@/lib/types";
import { Button, Card, Empty, PageHead, Table, Td } from "@/components/ui";

export default function AuditPage() {
  const { data: log, error, reload } = useFetch<AuditEntry[]>("/api/audit");
  return (
    <>
      <PageHead title="Audit" subtitle="Management/auditor access." />
      <Card>
        <p className="mb-3">Audit records are append-only in PostgreSQL. This screen is intentionally restricted by server role.</p>
        <Button onClick={reload}>Refresh</Button>
        <div className="mt-3">
          {error ? <Empty>Audit access is restricted or route is unavailable.</Empty> : log === null ? <Empty>Loading…</Empty> : (
            <Table head={["Time", "Action", "Table", "Record"]}>
              {log.map((x, i) => (
                <tr key={i}><Td>{fmtDateTime(x.event_time)}</Td><Td>{x.action}</Td><Td>{x.table_name}</Td><Td>{x.record_id}</Td></tr>
              ))}
            </Table>
          )}
        </div>
      </Card>
    </>
  );
}
