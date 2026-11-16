"use client";
// Reports and documents for the open patient. Photos of paper reports can be taken straight from the tablet camera;
// every image and PDF is shown on the page (thumbnail grid, tap to open large) instead of only being downloadable.
import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, ChevronLeft, ChevronRight, Download, FileText, ImageIcon, Upload, X } from "lucide-react";
import { download, upload, viewUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { errMsg, fmtDate, fmtDateTime } from "@/lib/format";
import { usePatient } from "@/lib/patient";
import { usePatientData } from "@/lib/use-patient-data";
import { useToast } from "@/lib/toast";
import type { PatientDocument } from "@/lib/types";
import { Button, Card, Empty, Field, Input, Modal, PageHead, Pill, RequirePatient, Select } from "@/components/ui";

const TYPES = ["LAB", "MRI", "CT", "X-RAY", "ULTRASOUND", "ECG", "DISCHARGE", "REFERRAL", "PRESCRIPTION", "CONSENT", "SHIPPING", "PHOTO", "OTHER"];
const ACCEPT = ".pdf,.png,.jpg,.jpeg,.gif,.webp,.txt,.csv,image/*,application/pdf";
const MAX_SIDE = 2400; // camera photos are scaled down to this before upload: still sharp for reading, far smaller

const isImage = (d: { mime_type?: string | null; file_name: string }) => (d.mime_type ?? "").startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(d.file_name);
const isPdf = (d: { mime_type?: string | null; file_name: string }) => d.mime_type === "application/pdf" || /\.pdf$/i.test(d.file_name);
const fileUrl = (id: string) => `/api/documents/${id}/download?view=1`;

/** Large camera photos are re-encoded as JPEG at MAX_SIDE; anything else is sent as it is. */
async function shrink(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = MAX_SIDE / Math.max(bmp.width, bmp.height);
    if (scale >= 1 && file.size < 3e6) { bmp.close(); return file; }
    const w = Math.round(bmp.width * Math.min(1, scale)), h = Math.round(bmp.height * Math.min(1, scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, "image/jpeg", 0.85));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file; // the browser could not decode it (e.g. HEIC on some devices): upload the original
  }
}

export default function DocumentsPage() {
  return (
    <>
      <PageHead title="Documents & reports" subtitle="Take a photo of a report or upload a PDF. Everything is stored on the server and opens right here." />
      <RequirePatient><Documents /></RequirePatient>
    </>
  );
}

function Documents() {
  const { can } = useAuth();
  const { data, loading, error, reload } = usePatientData<PatientDocument[]>("documents");
  const [filter, setFilter] = useState("ALL");
  const [open, setOpen] = useState<number | null>(null);
  const shown = useMemo(() => (data ?? []).filter(d => filter === "ALL" || d.document_type === filter), [data, filter]);
  const types = useMemo(() => [...new Set((data ?? []).map(d => d.document_type))], [data]);

  return (
    <>
      {can("documents.write") && <UploadCard onUploaded={reload} />}
      <Card title="Reports" aside={data?.length ? <Pill tone="gray">{data.length}</Pill> : undefined}>
        {types.length > 1 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {["ALL", ...types].map(t => (
              <button key={t} type="button" onClick={() => setFilter(t)} aria-pressed={filter === t}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${filter === t ? "bg-brand text-white" : "bg-subtle text-ink-2 hover:bg-hover"}`}>
                {t === "ALL" ? "All" : t}
              </button>
            ))}
          </div>
        )}
        {error ? <Empty>Could not load: {error}</Empty> : loading ? <Empty>Loading…</Empty> : !shown.length ? <Empty>No documents yet.{can("documents.write") ? " Take a photo or upload a file above." : ""}</Empty> : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
            {shown.map((d, i) => <Tile key={d.id} doc={d} onOpen={() => setOpen(i)} />)}
          </div>
        )}
      </Card>
      <Viewer docs={shown} index={open} onIndex={setOpen} />
    </>
  );
}

// ── Upload ──────────────────────────────────────────────────────────────────

function UploadCard({ onUploaded }: { onUploaded: () => Promise<void> | void }) {
  const { patient } = usePatient();
  const toast = useToast();
  const [type, setType] = useState("LAB");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [files, setFiles] = useState<{ file: File; preview: string | null }[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  // Free the local previews of whatever is still pending when the card goes away.
  const pending = useRef(files);
  useEffect(() => { pending.current = files; }, [files]);
  useEffect(() => () => pending.current.forEach(f => f.preview && URL.revokeObjectURL(f.preview)), []);
  const drop = (keep: (i: number) => boolean) => setFiles(fs => fs.filter((f, i) => {
    if (!keep(i) && f.preview) URL.revokeObjectURL(f.preview);
    return keep(i);
  }));

  function add(list: FileList | null) {
    if (!list?.length) return;
    setFiles(fs => [...fs, ...[...list].map(file => ({ file, preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : null }))]);
  }

  async function send() {
    if (!files.length) return toast("Take a photo or choose a file first");
    let done = 0;
    try {
      for (const [i, { file }] of files.entries()) {
        setBusy(`Uploading ${i + 1} of ${files.length}…`);
        const fd = new FormData();
        fd.append("documentType", type);
        if (title.trim()) fd.append("title", files.length > 1 ? `${title.trim()} (${i + 1})` : title.trim());
        if (date) fd.append("reportDate", date);
        fd.append("file", await shrink(file));
        await upload(`/api/patients/${patient!.patient_id}/documents`, fd);
        done++;
      }
      toast(done === 1 ? "Report saved" : `${done} files saved`);
      drop(() => false);
      setTitle("");
      setDate("");
    } catch (e) {
      toast(`${done ? `${done} saved, then: ` : ""}${errMsg(e)}`);
      drop(i => i >= done); // keep the ones that did not make it, so they can be retried
    } finally {
      setBusy(null);
      await onUploaded();
    }
  }

  return (
    <Card title="Add a report">
      <div className="grid grid-cols-1 gap-x-4 md:grid-cols-3">
        <Field label="Type"><Select value={type} onChange={e => setType(e.target.value)}>{TYPES.map(o => <option key={o}>{o}</option>)}</Select></Field>
        <Field label="What is it? (optional)"><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Blood test, MRI lumbar spine" /></Field>
        <Field label="Date on the report (optional)"><Input type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={e => setDate(e.target.value)} /></Field>
      </div>

      {/* capture="environment" opens the rear camera on tablets and phones; on a computer it is a normal file picker. */}
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={e => { add(e.target.files); e.target.value = ""; }} />
      <input ref={picker} type="file" accept={ACCEPT} multiple hidden onChange={e => { add(e.target.files); e.target.value = ""; }} />
      <div className="mt-2 flex flex-wrap gap-3">
        <Button variant="primary" className="h-14 px-6 text-base" onClick={() => camera.current?.click()} disabled={!!busy}><Camera size={20} /> Take photo</Button>
        <Button className="h-14 px-6 text-base" onClick={() => picker.current?.click()} disabled={!!busy}><Upload size={20} /> Choose files</Button>
      </div>

      {files.length > 0 && (
        <div className="mt-4">
          <div className="flex flex-wrap gap-3">
            {files.map((f, i) => (
              <div key={i} className="relative h-28 w-28 overflow-hidden rounded-xl border border-line bg-subtle">
                {f.preview
                  // eslint-disable-next-line @next/next/no-img-element -- local object URL, not an optimisable asset
                  ? <img src={f.preview} alt={f.file.name} className="h-full w-full object-cover" />
                  : <div className="flex h-full flex-col items-center justify-center gap-1 p-2 text-center text-xs text-muted"><FileText size={28} /><span className="line-clamp-2 break-all">{f.file.name}</span></div>}
                <button type="button" aria-label={`Remove ${f.file.name}`} disabled={!!busy}
                  onClick={() => drop(j => j !== i)}
                  className="absolute right-1 top-1 rounded-full bg-ink/70 p-1 text-white hover:bg-ink"><X size={14} /></button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button variant="primary" onClick={send} disabled={!!busy}>{busy ?? `Save ${files.length} ${files.length === 1 ? "file" : "files"}`}</Button>
            <span className="text-sm text-muted">You can take several photos (e.g. each page) before saving.</span>
          </div>
        </div>
      )}
    </Card>
  );
}

// ── Gallery ─────────────────────────────────────────────────────────────────

/** Loads an authenticated file as an object URL while the component is mounted. */
function useFileUrl(id: string | null, enabled = true) {
  const [state, setState] = useState<{ id: string; url: string | null; error: string } | null>(null);
  useEffect(() => {
    if (!id || !enabled) return;
    let live = true, url: string | null = null;
    viewUrl(fileUrl(id))
      .then(u => { url = u; if (live) setState({ id, url: u, error: "" }); else URL.revokeObjectURL(u); })
      .catch(e => { if (live) setState({ id, url: null, error: errMsg(e) }); });
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
  }, [id, enabled]);
  return state?.id === id ? state : null;
}

function Tile({ doc, onOpen }: { doc: PatientDocument; onOpen: () => void }) {
  const img = isImage(doc);
  const file = useFileUrl(doc.id, img);
  return (
    <button type="button" onClick={onOpen} className="group overflow-hidden rounded-2xl border border-line bg-white text-left shadow-xs transition-shadow hover:shadow-card">
      <div className="flex aspect-4/3 items-center justify-center overflow-hidden bg-subtle">
        {img && file?.url
          // eslint-disable-next-line @next/next/no-img-element -- authenticated blob URL
          ? <img src={file.url} alt={doc.title || doc.file_name} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
          : <span className="flex flex-col items-center gap-1 text-muted">
              {img ? <ImageIcon size={36} /> : <FileText size={36} />}
              <span className="text-xs font-semibold">{img ? (file?.error ? "Preview unavailable" : "Loading…") : isPdf(doc) ? "PDF" : "File"}</span>
            </span>}
      </div>
      <div className="p-3">
        <div className="truncate text-sm font-semibold text-ink">{doc.title || doc.file_name}</div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <Pill tone="gray">{doc.document_type}</Pill>
          <span>{doc.report_date ? fmtDate(doc.report_date) : fmtDate(doc.uploaded_at.slice(0, 10))}</span>
        </div>
      </div>
    </button>
  );
}

function Viewer({ docs, index, onIndex }: { docs: PatientDocument[]; index: number | null; onIndex: (i: number | null) => void }) {
  const toast = useToast();
  const doc = index !== null ? docs[index] : null;
  const file = useFileUrl(doc?.id ?? null);
  const [zoom, setZoom] = useState(false);
  const step = (d: number) => { if (index === null) return; setZoom(false); onIndex((index + d + docs.length) % docs.length); };

  useEffect(() => {
    if (index === null) return;
    const key = (e: KeyboardEvent) => { if (e.key === "ArrowRight") step(1); if (e.key === "ArrowLeft") step(-1); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  return (
    <Modal
      open={doc !== null}
      onClose={() => { setZoom(false); onIndex(null); }}
      title={doc ? doc.title || doc.file_name : ""}
      description={doc ? `${doc.document_type}${doc.report_date ? ` · report date ${fmtDate(doc.report_date)}` : ""} · added ${fmtDateTime(doc.uploaded_at)}${doc.uploaded_by_name ? ` by ${doc.uploaded_by_name}` : ""}` : undefined}
      width="max-w-6xl"
      footer={doc && <>
        {docs.length > 1 && <Button onClick={() => step(-1)} aria-label="Previous"><ChevronLeft size={18} /></Button>}
        {docs.length > 1 && <span className="self-center text-sm text-muted">{index! + 1} / {docs.length}</span>}
        {docs.length > 1 && <Button onClick={() => step(1)} aria-label="Next"><ChevronRight size={18} /></Button>}
        <Button onClick={() => download(`/api/documents/${doc.id}/download`, doc.file_name).catch(e => toast(errMsg(e)))}><Download size={16} /> Download</Button>
      </>}
    >
      {doc && (
        !file ? <Empty>Loading…</Empty>
        : file.error ? <Empty>{file.error}</Empty>
        : isImage(doc) ? (
          <div className={`rounded-xl bg-subtle ${zoom ? "overflow-auto" : "flex justify-center"}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- authenticated blob URL */}
            <img src={file.url!} alt={doc.title || doc.file_name} onClick={() => setZoom(z => !z)}
              className={zoom ? "max-w-none cursor-zoom-out" : "max-h-[66vh] w-auto cursor-zoom-in object-contain"} />
          </div>
        ) : isPdf(doc) ? (
          <iframe src={file.url!} title={doc.file_name} className="h-[66vh] w-full rounded-xl border border-line" />
        ) : (
          <iframe src={file.url!} title={doc.file_name} className="h-[50vh] w-full rounded-xl border border-line bg-white" />
        )
      )}
      {doc && isImage(doc) && file?.url && <p className="mt-2 text-xs text-muted">Tap the image to {zoom ? "fit it to the screen" : "see it at full size"}. On a tablet you can also pinch to zoom.</p>}
    </Modal>
  );
}
