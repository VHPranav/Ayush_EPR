"use client";
import { fmtDateTime } from "@/lib/format";
import { usePatientData } from "@/lib/use-patient-data";
import type { TimelineEvent } from "@/lib/types";
import { Card, Empty, PageHead, Pill, RequirePatient, Table, Td } from "@/components/ui";

export default function TimelinePage() {
  return (
    <>
      <PageHead title="Longitudinal Patient Timeline" subtitle="Single chronological view of the central patient record." />
      <RequirePatient><Timeline /></RequirePatient>
    </>
  );
}

function Timeline() {
  const { data, loading, error } = usePatientData<TimelineEvent[]>("timeline");
  return (
    <Card>
      {error ? <Empty>Could not load timeline: {error}</Empty> : loading ? <Empty>Loading…</Empty> : data?.length ? (
        <Table head={["Date/Time", "Type", "Title", "Detail"]}>
          {data.map((x, i) => (
            <tr key={x.event_id + i}>
              <Td>{fmtDateTime(x.event_time)}</Td><Td><Pill>{x.event_type}</Pill></Td><Td>{x.title}</Td><Td>{x.detail}</Td>
            </tr>
          ))}
        </Table>
      ) : <Empty>No timeline events recorded yet.</Empty>}
    </Card>
  );
}
