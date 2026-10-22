"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { errMsg, fmtDate } from "@/lib/format";
import { useToast } from "@/lib/toast";
import { useFetch } from "@/lib/use-fetch";
import type { StockItem } from "@/lib/types";
import { Button, Card, Empty, Grid, PageHead, Pill, Table, TextField, Td } from "@/components/ui";

const blank = { medicineName: "", form: "", strength: "", batchNo: "", expiryDate: "", quantity: "", unit: "", reorderLevel: "", supplier: "", location: "" };

export default function PharmacyPage() {
  const toast = useToast();
  const { can } = useAuth();
  const [f, setF] = useState(blank);
  const [editing, setEditing] = useState<string | null>(null);
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
      toast(editing ? "Stock updated" : "Stock saved centrally");
      reload();
    } catch (e) {
      toast(errMsg(e));
    }
  }

  function startEdit(x: StockItem) {
    setEditing(x.stock_id);
    setF({
      medicineName: x.medicine_name, form: x.form ?? "", strength: x.strength ?? "", batchNo: x.batch_no ?? "", expiryDate: x.expiry_date ?? "",
      quantity: String(x.quantity), unit: x.unit ?? "", reorderLevel: String(x.reorder_level), supplier: x.supplier ?? "", location: x.location ?? "",
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

  return (
    <>
      <PageHead title="Pharmacy Stock" subtitle={can("pharmacy.write") ? "Add, edit and remove stock. Low-stock and expiring items are flagged on the dashboard." : "Central stock database (read-only for your role)."} />
      {can("pharmacy.write") && (
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
        <Grid cols={2}>
          <TextField label="Supplier" value={f.supplier} onChange={set("supplier")} />
          <TextField label="Location" value={f.location} onChange={set("location")} />
        </Grid>
        <div className="flex gap-2">
          <Button variant="primary" onClick={save}>{editing ? "Update stock" : "Save stock"}</Button>
          {editing && <Button onClick={() => { setEditing(null); setF(blank); }}>Cancel</Button>}
        </div>
      </Card>
      )}
      <Card title="Current stock">
        {error ? <Empty>Could not load stock: {error}</Empty> : stock === null ? <Empty>Loading…</Empty> : stock.length ? (
          <Table head={can("pharmacy.write") ? ["Medicine", "Form", "Batch", "Expiry", "Qty", "Unit", "Reorder", ""] : ["Medicine", "Form", "Batch", "Expiry", "Qty", "Unit", "Reorder"]}>
            {stock.map(x => (
              <tr key={x.stock_id}>
                <Td>{x.medicine_name}</Td><Td>{x.form || "—"}</Td><Td>{x.batch_no || "—"}</Td><Td>{fmtDate(x.expiry_date)}</Td>
                <Td>{x.quantity}{x.low_stock && <span className="ml-2"><Pill tone="amber">Low</Pill></span>}</Td><Td>{x.unit || "—"}</Td><Td>{x.reorder_level}</Td>
                {can("pharmacy.write") && <Td><span className="flex gap-1.5"><Button onClick={() => startEdit(x)}>Edit</Button><Button variant="danger" onClick={() => remove(x)}>Remove</Button></span></Td>}
              </tr>
            ))}
          </Table>
        ) : <Empty>No stock recorded.</Empty>}
      </Card>
    </>
  );
}
