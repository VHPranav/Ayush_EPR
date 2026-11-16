"use client";
// Herbal product catalogue: what goes on the DHL documents (declaration, MSDS, product info sheet).
// A code is one preparation ("15", "Chandra", "CNR-SO-M") or a whole formula ("3(1) + 14(1) + 15(3)").
import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { errMsg, fmtDateTime } from "@/lib/format";
import { useToast } from "@/lib/toast";
import { useFetch } from "@/lib/use-fetch";
import { FORMS } from "@/lib/prescription-text";
import { AreaField, Button, Card, Empty, Field, Input, Modal, PageHead, Pill, Select, Table, Td, TextField } from "@/components/ui";

interface HerbalProduct {
  id: string; code: string; name: string; product_type: string; ingredients: string; product_use: string; way_of_use: string;
  manufacturer: string; certificate: string; msds: Record<string, string>; updated_at: string;
}
interface Catalogue { products: HerbalProduct[]; msdsDefaults: Record<string, Record<string, string>> }

/** The MSDS values that differ between products; everything else uses the standard text for the product type. */
const MSDS_FIELDS: [string, string][] = [
  ["emergencyPhone", "Emergency telephone number"], ["physicalState", "Physical state"], ["color", "Colour"], ["odor", "Odour"],
  ["specificGravity", "Specific gravity (H2O = 1)"], ["solubility", "Solubility in water"], ["flashPoint", "Flash point"],
  ["boilingPoint", "Boiling point"], ["routes", "Routes of entry (hazards)"], ["stability", "Stability"],
];
const typeLabel = (t: string) => ({ ELIXIR: "Elixir", POWDER: "Powder", OIL: "Oil", CAPSULE: "Capsules", OIL_CAPSULE: "Oil capsules", OTHER: "Other" })[t] ?? t;

export default function ProductsPage() {
  const { can } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload } = useFetch<Catalogue>("/api/herbal-products");
  const [edit, setEdit] = useState<Partial<HerbalProduct> | null>(null);
  const [q, setQ] = useState("");
  const list = (data?.products ?? []).filter(p => !q.trim() || `${p.code} ${p.name} ${p.ingredients}`.toLowerCase().includes(q.trim().toLowerCase()));

  async function retire(p: HerbalProduct) {
    if (!window.confirm(`Remove ${p.code} from the catalogue? Documents already made keep their text.`)) return;
    try { await api(`/api/herbal-products/${p.id}`, { method: "DELETE" }); toast("Removed"); reload(); } catch (e) { toast(errMsg(e)); }
  }

  return (
    <>
      <PageHead title="Herbal products" subtitle="Ingredients, use, manufacturer and safety data for the DHL documents (product declaration, MSDS, product info)."
        actions={can("products.write") ? <Button variant="primary" onClick={() => setEdit({ product_type: "ELIXIR", msds: {} })}>Add product</Button> : undefined} />
      <Card aside={<input value={q} onChange={e => setQ(e.target.value)} placeholder="Search code, name or ingredient" aria-label="Search products" className="w-full max-w-[280px] rounded-xl border border-line-strong bg-white px-3.5 py-2 text-sm" />} title="Catalogue">
        <p className="mt-0 text-sm text-muted">
          A prescribed formula is looked up as a whole first (e.g. <b>3(1) + 14(1) + 15(3)</b>); if it is not in the catalogue, the ingredients of its parts (<b>3</b>, <b>14</b>, <b>15</b>) are combined.
        </p>
        {error ? <Empty>Could not load: {error}</Empty> : loading ? <Empty>Loading…</Empty> : !list.length ? <Empty>No products yet.</Empty> : (
          <Table head={["Code", "Name", "Type", "Ingredients", "Updated", ""]}>
            {list.map(p => (
              <tr key={p.id}>
                <Td>{p.code}</Td><Td>{p.name}</Td><Td><Pill tone="gray">{typeLabel(p.product_type)}</Pill></Td>
                <Td><span className="line-clamp-2 max-w-md">{p.ingredients || <span className="text-danger">no ingredients</span>}</span></Td>
                <Td>{fmtDateTime(p.updated_at)}</Td>
                <Td>{can("products.write") && <span className="flex gap-1.5"><Button onClick={() => setEdit(p)}>Edit</Button><Button variant="danger" onClick={() => retire(p)}>Remove</Button></span>}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <Modal open={edit !== null} onClose={() => setEdit(null)} title={edit?.id ? `Edit ${edit.code}` : "Add product"} width="max-w-3xl">
        {edit && data && <ProductForm key={edit.id ?? "new"} initial={edit} defaults={data.msdsDefaults} onDone={() => { setEdit(null); reload(); }} />}
      </Modal>
    </>
  );
}

function ProductForm({ initial, defaults, onDone }: { initial: Partial<HerbalProduct>; defaults: Catalogue["msdsDefaults"]; onDone: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({
    code: initial.code ?? "", name: initial.name ?? "", productType: initial.product_type ?? "ELIXIR", ingredients: initial.ingredients ?? "",
    productUse: initial.product_use ?? "Food supplements for general health", wayOfUse: initial.way_of_use ?? "", manufacturer: initial.manufacturer ?? "",
    certificate: initial.certificate ?? "", msds: { ...(initial.msds ?? {}) } as Record<string, string>,
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF(s => ({ ...s, [k]: v }));
  const typeDefaults = defaults[f.productType] ?? {};

  async function save() {
    setBusy(true);
    try {
      await api(initial.id ? `/api/herbal-products/${initial.id}` : "/api/herbal-products", { method: initial.id ? "PUT" : "POST", body: f });
      toast("Product saved");
      onDone();
    } catch (e) {
      toast(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-x-4 md:grid-cols-3">
        <TextField label="Code *" value={f.code} onChange={set("code")} placeholder="15  ·  Chandra  ·  3(1) + 14(1) + 15(3)" />
        <TextField label="Name *" value={f.name} onChange={set("name")} placeholder="Elixir herbal liquid" />
        <Field label="Type">
          <Select value={f.productType} onChange={e => set("productType")(e.target.value)}>
            {FORMS.map(x => <option key={x.key} value={x.key}>{typeLabel(x.key)}</option>)}
          </Select>
        </Field>
      </div>
      <AreaField label="Ingredients (comma separated)" value={f.ingredients} onChange={set("ingredients")} rows={4} placeholder="Actinidia deliciosa, Alpinia Galanga, Bacopa monnieri, …" />
      <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
        <TextField label="Use" value={f.productUse} onChange={set("productUse")} placeholder="Food supplements for general health / External use" />
        <TextField label="Way of use" value={f.wayOfUse} onChange={set("wayOfUse")} placeholder="Internal and external" />
        <AreaField label="Manufacturer (name and address)" value={f.manufacturer} onChange={set("manufacturer")} rows={3} />
        <AreaField label="Certificate" value={f.certificate} onChange={set("certificate")} rows={3} placeholder="GMP (Good Manufacturing Practice) …" />
      </div>
      <details className="mt-2 rounded-xl bg-subtle p-3">
        <summary className="cursor-pointer text-sm font-semibold">MSDS details (leave empty to use the standard text for {typeLabel(f.productType).toLowerCase()})</summary>
        <div className="mt-2 grid grid-cols-1 gap-x-4 md:grid-cols-2">
          {MSDS_FIELDS.map(([k, label]) => (
            <Field key={k} label={label}>
              <Input value={f.msds[k] ?? ""} placeholder={typeDefaults[k] ?? ""} onChange={e => setF(s => ({ ...s, msds: { ...s.msds, [k]: e.target.value } }))} />
            </Field>
          ))}
        </div>
      </details>
      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button variant="primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save product"}</Button>
      </div>
    </>
  );
}
