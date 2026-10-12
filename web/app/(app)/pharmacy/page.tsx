"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { errMsg, fmtDate } from "@/lib/format";
import { useToast } from "@/lib/toast";
import { useFetch } from "@/lib/use-fetch";
import type { StockItem } from "@/lib/types";
import { Button, Card, Empty, Grid, PageHead, Table, TextField, Td } from "@/components/ui";

const blank = { medicineName: "", form: "", strength: "", batchNo: "", expiryDate: "", quantity: "", unit: "", reorderLevel: "", supplier: "", location: "" };

export default function PharmacyPage() {
  const toast = useToast();
  const { can } = useAuth();
  const [f, setF] = useState(blank);
  const { data: stock, error, reload } = useFetch<StockItem[]>("/api/pharmacy/stock");
  const set = (k: keyof typeof blank) => (v: string) => setF(s => ({ ...s, [k]: v }));

  async function save() {
    if (!f.medicineName.trim()) return toast("Medicine name is required");
    try {
      await api("/api/pharmacy/stock", { body: f });
      setF(blank);
      toast("Stock saved centrally");
      reload();
    } catch (e) {
      toast(errMsg(e));
    }
  }

  return (
    <>
      <PageHead title="Pharmacy Stock" subtitle={can("pharmacy.write") ? "Central stock database. Pharmacist role can add/update/delete." : "Central stock database (read-only for your role)."} />
      {can("pharmacy.write") && (
      <Card>
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
        <Button variant="primary" onClick={save}>Save stock</Button>
      </Card>
      )}
      <Card title="Current stock">
        {error ? <Empty>Could not load stock: {error}</Empty> : stock === null ? <Empty>Loading…</Empty> : stock.length ? (
          <Table head={["Medicine", "Form", "Batch", "Expiry", "Qty", "Unit", "Reorder"]}>
            {stock.map(x => (
              <tr key={x.stock_id}>
                <Td>{x.medicine_name}</Td><Td>{x.form || "—"}</Td><Td>{x.batch_no || "—"}</Td><Td>{fmtDate(x.expiry_date)}</Td>
                <Td>{x.quantity}</Td><Td>{x.unit || "—"}</Td><Td>{x.reorder_level}</Td>
              </tr>
            ))}
          </Table>
        ) : <Empty>No stock recorded.</Empty>}
      </Card>
    </>
  );
}
