// Postgres DATE columns arrive as "YYYY-MM-DD" (see db.js); build the Date from parts so the
// browser's timezone can never shift the calendar day.
export const fmtDate = (v: string | null | undefined) => {
  if (!v) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  return (m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(v)).toLocaleDateString();
};
export const fmtDateTime = (v: string | null | undefined) => (v ? new Date(v).toLocaleString() : "—");
export const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");
