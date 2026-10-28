"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { errMsg, fmtDate } from "@/lib/format";
import { useToast } from "@/lib/toast";
import { useFetch } from "@/lib/use-fetch";
import type { StockItem } from "@/lib/types";
import { Button, Card, Empty, Grid, PageHead, Pill, Table, TextField, Td } from "@/components/ui";

const blank = { medicineName: "", form: "", strength: "", batchNo: "", expiryDate: "", quantity: "", unit: "", reorderLevel: "", supplier: "", location: "", salePrice: "" };

export default function PharmacyPage() {
  const toast = useToast();
  const { can } = useAuth();
  const [f, setF] = useState(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "low" | "expiring">("all");
  // Wall-clock time can't be read during prerender, so "now" is set once mounted.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { const t = setTimeout(() => setNow(Date.now()), 0); return () => clearTimeout(t); }, []);
  const daysLeft = (iso: string | null) => {
    const m = iso && now !== null && /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    return m && now !== null ? Math.ceil((new Date(+m[1], +m[2] - 1, +m[3]).getTime() - now) / 86_400_000) : Infinity;
  };
  const { data: stock, error, reload } = useFetch<StockItem[]>("/api/pharmacy/stock");
  const set = (k: keyof typeof blank) => (v: string) => setF(s => ({ ...s, [k]: v }));

  async function save() {
    if (!f.medicineName.trim()) return toast("Medicine name is required");
    if ([f.quantity, f.reorderLevel].some(v => v !== "" && Number(v) < 0)) return toast("Quantity and reorder level cannot be negative");
    try {
      if (editing) await api(`/api/pharmacy/stock/${editing}`, { method: "PUT", body: f });
      else await api("/api/pharmacy/stock", { body: f });
      setF(blank);
      setEditing(null);
      setShowForm(false);
      toast(editing ? "Stock updated" : "Stock saved centrally");
      reload();
    } catch (e) {
      toast(errMsg(e));
    }
  }

  function startEdit(x: StockItem) {
    setEditing(x.stock_id);
    setShowForm(true);
    setF({
      medicineName: x.medicine_name, form: x.form ?? "", strength: x.strength ?? "", batchNo: x.batch_no ?? "", expiryDate: x.expiry_date ?? "",
      quantity: String(x.quantity), unit: x.unit ?? "", reorderLevel: String(x.reorder_level), supplier: x.supplier ?? "", location: x.location ?? "",
      salePrice: x.sale_price == null ? "" : String(x.sale_price),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function remove(x: StockItem) {
    if (!window.confirm(`Remove ${x.medicine_name}${x.batch_no ? ` (batch ${x.batch_no})` : ""} from stock?`)) return;
    try {
      await api(`/api/pharmacy/stock/${x.stock_id}`, { method: "DELETE" });
      toast("Stock item removed");
      reload();
    } catch (e) {
      toast(errMsg(e));
    }
  }

  const shown = (stock ?? []).filter(x => {
    const text = `${x.medicine_name} ${x.batch_no ?? ""}`.toLowerCase();
    if (q.trim() && !text.includes(q.trim().toLowerCase())) return false;
    if (filter === "low") return !!x.low_stock;
    if (filter === "expiring") return daysLeft(x.expiry_date) <= 30;
    return true;
  });

  return (
    <>
      <PageHead
        title="Pharmacy Stock"
        subtitle={can("pharmacy.write") ? "Search, edit and remove stock. Low-stock and expiring items are flagged." : "Central stock database (read-only for your role)."}
        actions={can("pharmacy.write") && !showForm && !editing ? <Button variant="primary" onClick={() => setShowForm(true)}>+ Add stock</Button> : undefined}
      />
      {can("pharmacy.write") && (showForm || editing) && (
      <Card title={editing ? "Edit stock item" : "Add stock"}>
        <Grid cols={4}>
          <TextField label="Medicine name*" value={f.medicineName} onChange={set("medicineName")} />
          <TextField label="Form" value={f.form} onChange={set("form")} />
          <TextField label="Strength" value={f.strength} onChange={set("strength")} />
          <TextField label="Batch" value={f.batchNo} onChange={set("batchNo")} />
        </Grid>
        <Grid cols={4}>
          <TextField label="Expiry" type="date" value={f.expiryDate} onChange={set("expiryDate")} />
          <TextField label="Quantity" type="number" step="0.001" value={f.quantity} onChange={set("quantity")} />
          <TextField label="Unit" value={f.unit} onChange={set("unit")} />
          <TextField label="Reorder level" type="number" step="0.001" value={f.reorderLevel} onChange={set("reorderLevel")} />
        </Grid>
        <Grid cols={3}>
          <TextField label="Supplier" value={f.supplier} onChange={set("supplier")} />
          <TextField label="Location" value={f.location} onChange={set("location")} />
          <TextField label="Selling price per unit" type="number" min={0} step="0.01" value={f.salePrice} onChange={set("salePrice")} />
        </Grid>
        <div className="flex gap-2">
          <Button variant="primary" onClick={save}>{editing ? "Update stock" : "Save stock"}</Button>
          {editing && <Button onClick={() => { setEditing(null); setF(blank); setShowForm(false); }}>Cancel</Button>}
        </div>
      </Card>
      )}
      <Card
        title="Current stock"
        aside={<input value={q} onChange={e => setQ(e.target.value)} placeholder="Search medicine or batch" aria-label="Search stock" className="w-full max-w-[260px] rounded-xl border border-line-strong bg-white px-3.5 py-2 text-sm placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-ring" />}
      >
        <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Filter">
          {([["all", "All"], ["low", "Low stock"], ["expiring", "Expiring / expired"]] as const).map(([k, label]) => (
            <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${filter === k ? "bg-brand text-white" : "bg-hover text-ink-2 hover:text-ink"}`}>{label}</button>
          ))}
        </div>
        {error ? <Empty>Could not load stock: {error}</Empty> : stock === null ? <Empty>Loading…</Empty> : shown.length ? (
          <Table head={can("pharmacy.write") ? ["Medicine", "Form", "Batch", "Expiry", "Qty", "Unit", "Reorder", ""] : ["Medicine", "Form", "Batch", "Expiry", "Qty", "Unit", "Reorder"]}>
            {shown.map(x => (
              <tr key={x.stock_id}>
                <Td>{x.medicine_name}</Td><Td>{x.form || "—"}</Td><Td>{x.batch_no || "—"}</Td><Td>{fmtDate(x.expiry_date)}{daysLeft(x.expiry_date) <= 30 && <span className="ml-2"><Pill tone="red">{daysLeft(x.expiry_date) < 0 ? "Expired" : `${daysLeft(x.expiry_date)}d left`}</Pill></span>}</Td>
                <Td>{x.quantity}{x.low_stock && <span className="ml-2"><Pill tone="amber">Low</Pill></span>}</Td><Td>{x.unit || "—"}</Td><Td>{x.reorder_level}</Td>
                {can("pharmacy.write") && <Td><span className="flex gap-1.5"><Button onClick={() => startEdit(x)}>Edit</Button><Button variant="danger" onClick={() => remove(x)}>Remove</Button></span></Td>}
              </tr>
            ))}
          </Table>
        ) : <Empty>{stock.length ? "No stock matches your search or filter." : "No stock recorded."}</Empty>}
      </Card>
    </>
  );
}
