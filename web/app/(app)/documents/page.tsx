"use client";
import { useState } from "react";
import { download, upload } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { errMsg, fmtDateTime } from "@/lib/format";
import { usePatient } from "@/lib/patient";
import { usePatientData } from "@/lib/use-patient-data";
import { useToast } from "@/lib/toast";
import type { PatientDocument } from "@/lib/types";
import { Button, Card, DataList, Grid, Input, PageHead, Pill, RequirePatient, Select } from "@/components/ui";

const TYPES = ["MRI", "CT", "X-RAY", "LAB", "DISCHARGE", "REFERRAL", "CONSENT", "PHOTO", "OTHER"];

export default function DocumentsPage() {
  return (
    <>
      <PageHead title="Documents" subtitle="Documents are stored on the server, not in browser storage." />
      <RequirePatient><Documents /></RequirePatient>
    </>
  );
}

function Documents() {
  const { patient } = usePatient();
  const toast = useToast();
  const { can } = useAuth();
  const { data, loading, error, reload } = usePatientData<PatientDocument[]>("documents");
  const [type, setType] = useState(TYPES[0]);
  const [file, setFile] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!file) return toast("Choose a file");
    const fd = new FormData();
    fd.append("documentType", type);
    fd.append("file", file);
    setBusy(true);
    try {
      await upload(`/api/patients/${patient!.patient_id}/documents`, fd);
      toast("Document uploaded");
      setFile(null);
      setInputKey(k => k + 1);
      await reload();
    } catch (e) {
      toast(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {can("documents.write") && (
      <Card>
        <div className="space-y-2">
          <Grid cols={2}>
            <Select aria-label="Document type" value={type} onChange={e => setType(e.target.value)}>{TYPES.map(o => <option key={o}>{o}</option>)}</Select>
            <Input key={inputKey} type="file" aria-label="File" onChange={e => setFile(e.target.files?.[0] ?? null)} />
          </Grid>
          <Button variant="primary" onClick={send} disabled={busy}>{busy ? "Uploading…" : "Upload to central server"}</Button>
        </div>
      </Card>
      )}
      <Card>
        <DataList items={data} loading={loading} error={error} empty="No documents." render={x => (
          <p key={x.id} className="my-2 flex flex-wrap items-center gap-2">
            <b>{x.file_name}</b> <Pill>{x.document_type}</Pill> — {fmtDateTime(x.uploaded_at)}
            <Button onClick={() => download(`/api/documents/${x.id}/download`, x.file_name).catch(e => toast(errMsg(e)))}>Download</Button>
          </p>
        )} />
      </Card>
    </>
  );
}
