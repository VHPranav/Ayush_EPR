// Turns structured prescription lines into the sentences the clinic writes on its prescriptions, in English or
// Montenegrin, e.g. "Use Herbal Elixir: Take 30 ml of herbal elixir ( 3(1) + 14(1) + 15(3) ) 4 times a day at 7:00, …".
// The doctor picks form, formula, dose, timing and (optionally) what it is mixed with; free-text instructions
// are printed as written.
import type { Prescription, RxMedicine, RxTreatment } from "./types";

export type Lang = "en" | "me";
type Bi = Record<Lang, string>;

/** Stored in prescription_medicines.form. */
export const FORMS: { key: string; label: Bi; oral: boolean }[] = [
  { key: "ELIXIR", label: { en: "Use Herbal Elixir", me: "Oralna upotreba biljnog eliksira" }, oral: true },
  { key: "POWDER", label: { en: "Use Herbal Powder", me: "Oralna upotreba biljnog praha" }, oral: true },
  { key: "CAPSULE", label: { en: "Oral administration of herbal capsules", me: "Oralna upotreba biljnih kapsula" }, oral: true },
  { key: "OIL_CAPSULE", label: { en: "Oral administration of herbal oil capsules", me: "Oralna upotreba kapsula biljnog ulja" }, oral: true },
  { key: "OIL", label: { en: "Use Herbal Oil", me: "Upotreba biljnog ulja" }, oral: false },
  { key: "OTHER", label: { en: "Use", me: "Upotreba" }, oral: true },
];
export const formOf = (key: string | null | undefined) => FORMS.find(f => f.key === key) ?? FORMS[FORMS.length - 1];

/** Stored in prescription_medicines.timing; the English text also goes into frequency (required, and readable everywhere else). */
export const TIMINGS: { key: string; text: Bi }[] = [
  { key: "4X", text: { en: "4 times a day at 7:00, 11:00, 15:00 and 19:00", me: "4 puta dnevno sa razmakom od najmanje 4 sata (7.00, 11.00, 15.00 i 19.00h)" } },
  { key: "3X", text: { en: "3 times a day", me: "3 puta dnevno" } },
  { key: "2X", text: { en: "in the morning and in the evening", me: "ujutru i uveče" } },
  { key: "1X_AM", text: { en: "once a day in the morning", me: "jednom dnevno ujutru" } },
  { key: "NIGHT", text: { en: "every night at 20:00", me: "svako veče u 20.00h" } },
  { key: "CUSTOM", text: { en: "other (write it)", me: "drugo" } },
];

/** Dose units with Montenegrin grammar for 1 / 2-4 / 5+. */
export const UNITS: { key: string; en: [string, string]; me: [string, string, string] }[] = [
  { key: "ml", en: ["ml", "ml"], me: ["ml", "ml", "ml"] },
  { key: "gr", en: ["gr", "gr"], me: ["gr", "gr", "gr"] },
  { key: "capsule", en: ["capsule", "capsules"], me: ["kapsula", "kapsule", "kapsula"] },
  { key: "drop", en: ["drop", "drops"], me: ["kap", "kapi", "kapi"] },
  { key: "tablet", en: ["tablet", "tablets"], me: ["tableta", "tablete", "tableta"] },
  { key: "teaspoon", en: ["teaspoon", "teaspoons"], me: ["kašičica", "kašičice", "kašičica"] },
];

/** "30 ml" / "2 capsules" -> amount and unit key (unknown units are kept as written). */
export function parseDose(dose: string | null | undefined): { amount: string; unit: string } {
  const m = /^\s*([\d.,/½]+)\s*(.*)$/.exec(dose ?? "");
  if (!m) return { amount: "", unit: (dose ?? "").trim() };
  const word = m[2].trim().toLowerCase();
  const u = UNITS.find(x => x.key === word || x.en.includes(word) || x.me.includes(word));
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

/** One therapy line as the clinic writes it: heading and sentence. */
export function medicineSentence(m: RxMedicine, lang: Lang): { heading: string; text: string } {
  const f = formOf(m.form);
  const dose = doseText(m.dose, lang);
  const when = timingText(m, lang);
  const name = m.medicine_name.trim();
  const mix = m.anupana?.trim();
  let text: string;
  if (lang === "en") {
    const what = { ELIXIR: "of herbal elixir ", POWDER: "of herbal powder ", CAPSULE: "", OIL_CAPSULE: "", OIL: "of herbal oil ", OTHER: "" }[f.key] ?? "";
    text = f.key === "OIL"
      ? `${name}: apply ${dose}${when ? `, ${when}` : ""}.`
      : `Take ${dose} ${what}( ${name} )${mix ? ` and mix with ${mix}` : ""}${when ? ` ${when}` : ""}.`;
  } else {
    const what = { ELIXIR: "biljnog eliksira ", POWDER: "biljnog praha ", CAPSULE: "", OIL_CAPSULE: "", OIL: "biljnog ulja ", OTHER: "" }[f.key] ?? "";
    text = f.key === "OIL"
      ? `${name}: nanijeti ${dose}${when ? `, ${when}` : ""}.`
      : `Uzeti ${dose} ${what}( ${name} )${mix ? `, pomiješati sa ${mix}` : ""}${when ? `, ${when}` : ""}.`;
  }
  if (m.instructions?.trim()) text += ` ${m.instructions.trim()}`;
  return { heading: f.label[lang], text: text.replace(/\s+/g, " ").replace(" .", ".") };
}

const TR_FREQ: Record<string, string> = { "Once daily": "jednom dnevno", "Twice daily": "dva puta dnevno", "Thrice daily": "tri puta dnevno", "As required": "po potrebi" };
export function treatmentSentence(t: RxTreatment, lang: Lang) {
  if (lang === "en") return { heading: "Therapy", text: `${t.treatment_name}: ${[t.frequency, t.duration && `for ${t.duration}`].filter(Boolean).join(", ")}.` };
  const days = /^(\d+) days?$/.exec(t.duration ?? "");
  const dur = days ? `${days[1]} ${days[1] === "1" ? "dan" : "dana"}` : t.duration;
  return { heading: "Terapija", text: `${t.treatment_name}: ${[TR_FREQ[t.frequency ?? ""] ?? t.frequency, dur && `u trajanju od ${dur}`].filter(Boolean).join(", ")}.` };
}

export const LABELS = {
  en: { name: "Name", reg: "Registration #", diagnosis: "Diagnosis", date: "Date", advice: "ADVICE", changes: "Changes to existing medications:", diet: "Dietary recommendations:", none: "None.", page: "Page" },
  me: { name: "PAT IME", reg: "REGN NO", diagnosis: "DIJAGNOZA", date: "DATUM", advice: "SAVJETI", changes: "Promjene u postojećim ljekovima:", diet: "Preporuka za ishranu:", none: "Nema.", page: "Strana" },
} as const;

/** Every numbered item of the prescription, in print order. */
export function prescriptionItems(rx: Prescription, lang: Lang, oralNote: string, advice: string) {
  const L = LABELS[lang];
  const items: { heading?: string; text: string }[] = [];
  let noted = false;
  for (const m of rx.medicines ?? []) {
    const s = medicineSentence(m, lang);
    // The breathing / fasting note follows the first oral therapy, as on the clinic's prescriptions.
    if (!noted && formOf(m.form).oral && oralNote.trim()) { s.text += ` ${oralNote.trim()}`; noted = true; }
    items.push(s);
  }
  for (const t of rx.treatments ?? []) items.push(treatmentSentence(t, lang));
  items.push({ heading: L.changes, text: rx.medication_changes?.trim() || L.none });
  items.push({ heading: L.diet, text: rx.diet?.trim() || L.none });
  for (const line of advice.split("\n").map(x => x.trim()).filter(Boolean)) items.push({ text: line });
  return items;
}
