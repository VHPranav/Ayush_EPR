// Postgres DATE columns arrive as "YYYY-MM-DD" (see db.js); build the Date from parts so the
// browser's timezone can never shift the calendar day.
export const fmtDate = (v: string | null | undefined) => {
  if (!v) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  return (m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(v)).toLocaleDateString();
};
/** European / Montenegrin date as on the clinic's documents: "07.10.1988." (whatever the browser's language). */
export const fmtDateEU = (v: string | Date | null | undefined) => {
  if (!v) return "—";
  const m = typeof v === "string" ? /^(\d{4})-(\d{2})-(\d{2})/.exec(v) : null;
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}.`;
};
// 24-hour, no seconds, everywhere (the OS time picker may show 12-hour, but every list and confirmation reads the same).
export const fmtDateTime = (v: string | null | undefined) => (v ? new Date(v).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short", hour12: false }) : "—");
export const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

/** Currency symbol for invoices; set NEXT_PUBLIC_CURRENCY at build time (default €, the clinic is in Montenegro). */
export const CURRENCY = process.env.NEXT_PUBLIC_CURRENCY || "€";
/** Montenegrin style for euro: "1 225.00 €" (space between thousands, symbol after); other currencies keep "₹1225.00". */
export const money = (v: number | string | null | undefined) => {
  const n = Number(v ?? 0);
  if (CURRENCY !== "€") return `${CURRENCY}${n.toFixed(2)}`;
  const [int, dec] = Math.abs(n).toFixed(2).split(".");
  return `${n < 0 ? "−" : ""}${int.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}.${dec} €`;
};
