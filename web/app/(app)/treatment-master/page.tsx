"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { errMsg } from "@/lib/format";
import { useToast } from "@/lib/toast";
import { useFetch } from "@/lib/use-fetch";
import type { TreatmentMaster } from "@/lib/types";
import { AreaField, Button, Card, Empty, Grid, PageHead, Table, TextField, Td } from "@/components/ui";

const blank = { name: "", category: "", frequency: "", duration: "", instructions: "" };

export default function TreatmentMasterPage() {
  const toast = useToast();
  const { can } = useAuth();
  const [f, setF] = useState(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const { data: list, error, reload } = useFetch<TreatmentMaster[]>("/api/treatment-master");
  const set = (k: keyof typeof blank) => (v: string) => setF(s => ({ ...s, [k]: v }));

  async function save() {
    if (!f.name.trim()) return toast("Name is required");
    try {
      if (editing) await api(`/api/treatment-master/${editing}`, { method: "PUT", body: f });
      else await api("/api/treatment-master", { body: f });
      setF(blank);
      setEditing(null);
      toast(editing ? "Treatment updated" : "Treatment added");
      reload();
    } catch (e) {
      toast(errMsg(e));
    }
  }

  function startEdit(x: TreatmentMaster) {
    setEditing(x.treatment_id);
    setF({ name: x.name, category: x.category ?? "", frequency: x.default_frequency ?? "", duration: x.default_duration ?? "", instructions: x.instructions ?? "" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function remove(x: TreatmentMaster) {
    if (!window.confirm(`Remove "${x.name}" from the catalogue? Existing prescriptions keep it.`)) return;
    try {
      await api(`/api/treatment-master/${x.treatment_id}`, { method: "DELETE" });
      toast("Treatment removed");
      reload();
    } catch (e) {
      toast(errMsg(e));
    }
  }

  const canEdit = can("treatments.write");
  const canDelete = can("treatments.delete");

  return (
    <>
      <PageHead title="Treatment Master" subtitle="Central catalogue used by prescription." />
      {can("treatments.write") && (
      <Card title={editing ? "Edit treatment" : "Add treatment"}>
        <Grid cols={4}>
          <TextField label="Name*" value={f.name} onChange={set("name")} />
          <TextField label="Category" value={f.category} onChange={set("category")} />
          <TextField label="Default frequency" value={f.frequency} onChange={set("frequency")} />
          <TextField label="Default duration" value={f.duration} onChange={set("duration")} />
        </Grid>
        <AreaField label="Description/instructions" value={f.instructions} onChange={set("instructions")} />
        <div className="flex gap-2">
          <Button variant="primary" onClick={save}>{editing ? "Update treatment" : "Add treatment"}</Button>
          {editing && <Button onClick={() => { setEditing(null); setF(blank); }}>Cancel</Button>}
        </div>
      </Card>
      )}
      <Card>
        {error ? <Empty>Could not load: {error}</Empty> : list === null ? <Empty>Loading…</Empty> : list.length ? (
          <Table head={canEdit ? ["Name", "Category", "Frequency", "Duration", ""] : ["Name", "Category", "Frequency", "Duration"]}>
            {list.map(x => (
              <tr key={x.treatment_id}>
                <Td>{x.name}</Td><Td>{x.category || "—"}</Td><Td>{x.default_frequency || "—"}</Td><Td>{x.default_duration || "—"}</Td>
                {canEdit && <Td><span className="flex gap-1.5"><Button onClick={() => startEdit(x)}>Edit</Button>{canDelete && <Button variant="danger" onClick={() => remove(x)}>Remove</Button>}</span></Td>}
              </tr>
            ))}
          </Table>
        ) : <Empty>No treatments in master catalogue.</Empty>}
      </Card>
    </>
  );
}
