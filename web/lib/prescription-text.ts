// Turns structured prescription lines into the sentences the clinic writes on its prescriptions, in English or
// Montenegrin, e.g. "Oral administration of herbal elixir: Take 30 ml of herbal elixir ( 3(1) + 14(1) + 15(3) ), 4 times a day …".
// The doctor picks form, formula, dose, timing and (optionally) what it is mixed with; free-text instructions
// are printed as written. Each sentence is built from segments so the printout can highlight the dose, formula
// and times (yellow, bold) the way the clinic's own prescriptions do, while screens use the plain text.
import type { Prescription, RxMedicine, RxTreatment } from "./types";

export type Lang = "en" | "me";
type Bi = Record<Lang, string>;

/** A piece of printed text: plain, or marked (hl = yellow bold, hlu = yellow bold underlined, bu = bold underlined, b = bold, red = red bold). */
export type Seg = string | { t: string; k: "hl" | "hlu" | "bu" | "b" | "red" };
const esc = (v: string) => v.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export const segText = (s: Seg[]) => s.map(x => (typeof x === "string" ? x : x.t)).join("").replace(/\s+/g, " ").replace(/ ([.,])/g, "$1").trim();
export const segHtml = (s: Seg[]) => s.map(x => (typeof x === "string" ? esc(x) : `<span class="${x.k}">${esc(x.t)}</span>`)).join("");

/** Stored in prescription_medicines.form. `mixed` is the heading when the line is mixed with something else. */
export const FORMS: { key: string; short: string; label: Bi; mixed?: Bi; oral: boolean }[] = [
  { key: "ELIXIR", short: "Herbal elixir", label: { en: "Oral administration of herbal elixir", me: "Oralna upotreba biljnog eliksira" }, mixed: { en: "Oral administration of herbal powder/elixir", me: "Oralna upotreba biljnog praha/eliksira" }, oral: true },
  { key: "POWDER", short: "Herbal powder", label: { en: "Oral administration of herbal powder", me: "Oralna upotreba biljnog praha" }, oral: true },
  { key: "CAPSULE", short: "Herbal capsules", label: { en: "Oral administration of herbal powder/capsules", me: "Oralna upotreba biljnog praha/kapsula" }, oral: true },
  { key: "OIL_CAPSULE", short: "Herbal oil capsules", label: { en: "Oral administration of herbal oil capsules", me: "Oralna upotreba kapsula biljnog ulja" }, oral: true },
  { key: "OIL", short: "Herbal oil", label: { en: "Use of herbal oil", me: "Upotreba biljnog ulja" }, oral: false },
  { key: "OTHER", short: "Other", label: { en: "Use", me: "Upotreba" }, oral: true },
];
export const formOf = (key: string | null | undefined) => FORMS.find(f => f.key === key) ?? FORMS[FORMS.length - 1];

/** Stored in prescription_medicines.timing; the English text also goes into frequency (required, and readable everywhere else). */
export const TIMINGS: { key: string; text: Bi }[] = [
  { key: "4X", text: { en: "4 times a day at 7:00, 11:00, 15:00 and 19:00", me: "4 puta dnevno sa razmakom od najmanje 4 sata (primjer: 7.00, 11.00, 15.00 i 19.00h)" } },
  { key: "3X", text: { en: "3 times a day", me: "3 puta dnevno" } },
  { key: "2X", text: { en: "in the am and in the pm", me: "ujutru i uveče" } },
  { key: "1X_AM", text: { en: "once a day in the morning", me: "jednom dnevno ujutru" } },
  { key: "NIGHT", text: { en: "every night at 20:00", me: "svako veče u 20.00h" } },
  { key: "CUSTOM", text: { en: "other (write it)", me: "drugo" } },
];

/** Dose units; Montenegrin forms after "Uzeti" for 1 / 2-4 / 5+. */
export const UNITS: { key: string; en: [string, string]; me: [string, string, string] }[] = [
  { key: "ml", en: ["ml", "ml"], me: ["ml", "ml", "ml"] },
  { key: "gr", en: ["gr", "gr"], me: ["gr", "gr", "gr"] },
  { key: "capsule", en: ["capsule", "capsules"], me: ["kapsulu", "kapsule", "kapsula"] },
  { key: "drop", en: ["drop", "drops"], me: ["kap", "kapi", "kapi"] },
  { key: "tablet", en: ["tablet", "tablets"], me: ["tabletu", "tablete", "tableta"] },
  { key: "teaspoon", en: ["teaspoon", "teaspoons"], me: ["kašičicu", "kašičice", "kašičica"] },
];

/** "30 ml" / "2 capsules" -> amount and unit key (unknown units are kept as written). */
export function parseDose(dose: string | null | undefined): { amount: string; unit: string } {
  const m = /^\s*([\d.,/½]+)\s*(.*)$/.exec(dose ?? "");
  if (!m) return { amount: "", unit: (dose ?? "").trim() };
  const word = m[2].trim().toLowerCase();
  const u = UNITS.find(x => x.key === word || x.en.includes(word) || x.me.includes(word) || (x.key === "capsule" && word === "kapsula"));
  return { amount: m[1], unit: u?.key ?? m[2].trim() };
}

export function doseText(dose: string | null | undefined, lang: Lang) {
  const { amount, unit } = parseDose(dose);
  const u = UNITS.find(x => x.key === unit);
  if (!u) return [amount, unit].filter(Boolean).join(" ");
  const n = Number(amount.replace(",", "."));
  if (lang === "en") return `${amount} ${n === 1 ? u.en[0] : u.en[1]}`;
  const i = n === 1 ? 0 : n >= 2 && n <= 4 && Number.isInteger(n) ? 1 : 2;
  return `${amount} ${u.me[i]}`;
}

/** Saves "30 ml" in English so pharmacy and other screens read naturally. */
export const doseValue = (amount: string, unit: string) => {
  const u = UNITS.find(x => x.key === unit);
  const n = Number(amount.replace(",", "."));
  return `${amount.trim()} ${u ? (n === 1 ? u.en[0] : u.en[1]) : unit}`.trim();
};

export function timingText(m: Pick<RxMedicine, "timing" | "frequency">, lang: Lang) {
  const t = TIMINGS.find(x => x.key === m.timing && x.key !== "CUSTOM");
  return t ? t.text[lang] : (m.frequency ?? "");
}

/** The timing as printed; morning / evening repeats the dose: "in the am and 2 capsules in the pm". */
function timingSegs(m: RxMedicine, dose: string, lang: Lang): Seg[] {
  if (m.timing === "2X") {
    return lang === "en"
      ? ["in the ", { t: "am", k: "hl" }, " and ", { t: dose, k: "hlu" }, " in the ", { t: "pm", k: "hl" }]
      : [{ t: "ujutru", k: "hl" }, " i ", { t: dose, k: "hlu" }, " ", { t: "uveče", k: "hl" }];
  }
  const when = timingText(m, lang);
  return when ? [when] : [];
}

/** One therapy line as the clinic writes it: heading, plain text and printable segments. */
export function medicineSentence(m: RxMedicine, lang: Lang): { heading: string; text: string; segs: Seg[] } {
  const f = formOf(m.form);
  const dose = doseText(m.dose, lang);
  const name = m.medicine_name.trim();
  const mix = m.anupana?.trim();
  const when = timingSegs(m, dose, lang);
  const what = (lang === "en"
    ? { ELIXIR: "of herbal elixir", POWDER: "of herbal powder", CAPSULE: "of herbal powder", OIL_CAPSULE: "of herbal oil capsules", OIL: "of herbal oil", OTHER: "" }
    : { ELIXIR: "biljne tečnosti", POWDER: "biljnog praha", CAPSULE: "biljnog praha", OIL_CAPSULE: "biljnog ulja", OIL: "biljnog ulja", OTHER: "" })[f.key] ?? "";
  const formula: Seg = { t: `( ${name} )`, k: "hl" };
  let segs: Seg[];
  if (f.key === "OIL") {
    segs = [{ t: name, k: "hl" }, lang === "en" ? ": apply " : ": nanijeti ", { t: dose, k: "hlu" }, ...(when.length ? [", ", ...when] : []), "."];
  } else {
    segs = [lang === "en" ? "Take " : "Uzeti ", { t: dose, k: "hlu" }, ` ${what} `, formula,
      ...(mix ? [lang === "en" ? " and mix with " : " pomiješati sa ", { t: mix, k: "hl" } as Seg] : []),
      ...(when.length ? [", ", ...when] : []), "."];
  }
  if (m.instructions?.trim()) segs.push(" ", m.instructions.trim());
  const heading = (mix && f.mixed ? f.mixed : f.label)[lang];
  return { heading, text: segText(segs), segs };
}

const TR_FREQ: Record<string, string> = { "Once daily": "jednom dnevno", "Twice daily": "dva puta dnevno", "Thrice daily": "tri puta dnevno", "As required": "po potrebi" };
export function treatmentSentence(t: RxTreatment, lang: Lang) {
  if (lang === "en") return { heading: "Therapy", text: `${t.treatment_name}: ${[t.frequency, t.duration && `for ${t.duration}`].filter(Boolean).join(", ")}.` };
  const days = /^(\d+) days?$/.exec(t.duration ?? "");
  const dur = days ? `${days[1]} ${days[1] === "1" ? "dan" : "dana"}` : t.duration;
  return { heading: "Terapija", text: `${t.treatment_name}: ${[TR_FREQ[t.frequency ?? ""] ?? t.frequency, dur && `u trajanju od ${dur}`].filter(Boolean).join(", ")}.` };
}

/** Header labels as on the clinic's prescriptions (the English one also says PAT IME / REGN NO). */
export const LABELS = {
  en: { name: "PAT IME", reg: "REGN NO", diagnosis: "Diagnosis", date: "DATE", advice: "ADVICE", changes: "Changes to existing medications:", diet: "Dietary recommendations:", none: "None.", page: "Page" },
  me: { name: "PAT IME", reg: "REGN NO", diagnosis: "DIJAGNOZA", date: "DATE", advice: "SAVJETI", changes: "Promjene u postojećim ljekovima:", diet: "Preporuka za ishranu:", none: "Nema.", page: "Page" },
} as const;

/** One numbered item: a bold heading (inline, or on its own line with the text indented below) and its text. */
export interface RxItem { heading?: string; segs: Seg[]; block?: boolean; tight?: boolean }

/** "5 min" / "5 minutes" in the breathing note, bold and underlined as on the clinic's prescriptions. */
const noteSegs = (s: string): Seg[] => s.split(/(\d+\s*(?:minutes|minuta|min)\b)/).filter(Boolean).map((p, i) => (i % 2 ? { t: p, k: "bu" } : p));
/** The standing advice; in English the email and phone are red, as on the English prescription. */
const adviceSegs = (s: string, lang: Lang): Seg[] => lang === "me" ? [s]
  : s.split(/([\w.+-]+@[\w-]+\.[\w.]+|\+\d[\d ]{7,}\d)/).filter(Boolean).map((p, i) => (i % 2 ? { t: p, k: "red" } : p));

/**
 * Every numbered item of the prescription, in the clinic's order: therapies, then the first advice line
 * (hydration, its text before ":" in bold), changes to medicines, diet, then the rest of the advice.
 */
export function prescriptionItems(rx: Prescription, lang: Lang, oralNote: string, advice: string): RxItem[] {
  const L = LABELS[lang];
  const items: RxItem[] = [];
  let noted = false;
  for (const m of rx.medicines ?? []) {
    const s = medicineSentence(m, lang);
    const segs = [...s.segs];
    // The breathing / fasting note follows the first oral therapy.
    if (!noted && formOf(m.form).oral && oralNote.trim()) { segs.push(" ", ...noteSegs(oralNote.trim())); noted = true; }
    items.push({ heading: s.heading, segs });
  }
  for (const t of rx.treatments ?? []) { const s = treatmentSentence(t, lang); items.push({ heading: s.heading, segs: [s.text] }); }
  const [first, ...rest] = advice.split("\n").map(x => x.trim()).filter(Boolean);
  if (first) {
    const c = first.indexOf(":");
    items.push(c > 0 && c < 120 ? { heading: first.slice(0, c), segs: adviceSegs(first.slice(c + 1).trim(), lang) } : { segs: adviceSegs(first, lang) });
  }
  items.push({ heading: L.changes, segs: [rx.medication_changes?.trim() || L.none], block: true });
  items.push({ heading: L.diet, segs: [rx.diet?.trim() || L.none], block: true });
  for (const line of rest) items.push({ segs: adviceSegs(line, lang), tight: true });
  return items;
}
