"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { errMsg } from "@/lib/format";
import { useToast } from "@/lib/toast";
import { useFetch } from "@/lib/use-fetch";
import type { TreatmentMaster } from "@/lib/types";
import { AreaField, Button, Card, Empty, Grid, PageHead, Table, TextField, Td } from "@/components/ui";

const blank = { name: "", category: "", duration: "", instructions: "" };

export default function TreatmentMasterPage() {
  const toast = useToast();
  const { can } = useAuth();
  const [f, setF] = useState(blank);
  const { data: list, error, reload } = useFetch<TreatmentMaster[]>("/api/treatment-master");
  const set = (k: keyof typeof blank) => (v: string) => setF(s => ({ ...s, [k]: v }));

  async function save() {
    if (!f.name.trim()) return toast("Name is required");
    try {
      await api("/api/treatment-master", { body: f });
      setF(blank);
      toast("Treatment master saved");
      reload();
    } catch (e) {
      toast(errMsg(e));
    }
  }

  return (
    <>
      <PageHead title="Treatment Master" subtitle="Central catalogue used by prescription." />
      {can("treatments.write") && (
      <Card>
        <Grid cols={3}>
          <TextField label="Name*" value={f.name} onChange={set("name")} />
          <TextField label="Category" value={f.category} onChange={set("category")} />
          <TextField label="Default duration" value={f.duration} onChange={set("duration")} />
        </Grid>
        <AreaField label="Description/instructions" value={f.instructions} onChange={set("instructions")} />
        <Button variant="primary" onClick={save}>Add treatment</Button>
      </Card>
      )}
      <Card>
        {error ? <Empty>Could not load: {error}</Empty> : list === null ? <Empty>Loading…</Empty> : list.length ? (
          <Table head={["Name", "Category", "Frequency", "Duration"]}>
            {list.map(x => (
              <tr key={x.treatment_id}><Td>{x.name}</Td><Td>{x.category || "—"}</Td><Td>{x.default_frequency || "—"}</Td><Td>{x.default_duration || "—"}</Td></tr>
            ))}
          </Table>
        ) : <Empty>No treatments in master catalogue.</Empty>}
      </Card>
    </>
  );
}
