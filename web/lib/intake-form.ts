// The clinic's bilingual (English / Montenegrin) patient intake form, SAGLASNOST.
// Keys must match SECTIONS in server/intake.js, which validates the answers and prints the PDF with the paper
// form's wording. The questions here are phrased for a patient filling them in on a tablet.

export type FieldKind = "text" | "long" | "yesno" | "date" | "email" | "tel" | "number" | "amount";
export interface IntakeField {
  key: string;
  en: string;
  me: string;
  kind: FieldKind;
  /** Only shown (and kept) when this yes/no field is answered YES. */
  showIf?: string;
  placeholder?: string;
  /** kind "amount": the units the patient picks from, [English, Montenegrin]; the first is the default. */
  units?: (readonly [string, string])[];
  /** kind "amount": an optional "which?" box (e.g. which drugs). */
  note?: readonly [string, string];
}
export interface IntakeStep { en: string; me: string; fields: IntakeField[] }

export const INTAKE_STEPS: IntakeStep[] = [
  {
    en: "Personal details", me: "Lični podaci",
    fields: [
      { key: "name", en: "Name and surname", me: "Ime i prezime", kind: "text" },
      { key: "dob", en: "Date of birth", me: "Datum rođenja", kind: "date" },
      { key: "phone", en: "Phone no.", me: "Broj telefona", kind: "tel", placeholder: "69 123 456" },
      { key: "email", en: "Email", me: "Email", kind: "email" },
      { key: "address", en: "Address", me: "Adresa", kind: "text" },
      { key: "city", en: "City", me: "Grad", kind: "text" },
      { key: "weight", en: "Weight (kg)", me: "Kilaža (kg)", kind: "number" },
      { key: "referredBy", en: "Referred by", me: "Preporučeni od strane", kind: "text" },
    ],
  },
  {
    en: "Diagnosis and symptoms", me: "Dijagnoza i simptomi",
    fields: [
      { key: "diagnosis", en: "Diagnosis", me: "Dijagnoza", kind: "long" },
      { key: "symptoms", en: "Symptoms", me: "Simptomi", kind: "long" },
      { key: "additional", en: "Additional symptoms or diagnosis", me: "Dodatne tegobe ili dijagnoze", kind: "long" },
    ],
  },
  {
    en: "Medical history", me: "Anamneza (istorija bolesti)",
    fields: [
      { key: "history", en: "Medical history", me: "Anamneza", kind: "long" },
      { key: "surgeries", en: "Surgeries", me: "Operacije", kind: "long" },
      { key: "allergiesAny", en: "Do you have any allergies?", me: "Da li imate alergije?", kind: "yesno" },
      { key: "allergies", en: "Which allergies?", me: "Koje alergije?", kind: "long", showIf: "allergiesAny" },
      { key: "hereditary", en: "Hereditary diseases", me: "Nasljedne bolesti", kind: "long" },
    ],
  },
  {
    en: "Habits", me: "Navike",
    fields: [
      { key: "smoking", en: "Do you smoke cigarettes?", me: "Da li konzumirate cigarete?", kind: "yesno" },
      { key: "smokingAmount", en: "How much?", me: "Koliko?", kind: "amount", showIf: "smoking", units: [["cigarettes", "cigareta"], ["packs", "paklica"]] },
      { key: "alcohol", en: "Do you drink alcohol?", me: "Da li konzumirate alkohol?", kind: "yesno" },
      { key: "alcoholAmount", en: "How much?", me: "Koliko?", kind: "amount", showIf: "alcohol", units: [["glasses", "čaša"], ["bottles", "flaša"], ["ml", "ml"]], note: ["Which drink? (wine, beer, rakija …)", "Koje piće? (vino, pivo, rakija …)"] },
      { key: "drugs", en: "Do you take drugs?", me: "Da li konzumirate droge?", kind: "yesno" },
      { key: "drugsAmount", en: "How much?", me: "Koliko?", kind: "amount", showIf: "drugs", units: [["times", "puta"], ["grams", "grama"], ["pills", "tableta"]], note: ["Which drugs?", "Koje droge?"] },
      { key: "sleepHours", en: "How many hours of sleep do you get?", me: "Koliko sati sna imate?", kind: "number" },
      { key: "sleepInterrupted", en: "Is your sleep interrupted?", me: "Da li je san sa prekidima?", kind: "yesno" },
      { key: "bowelDaily", en: "Do you have daily bowel movements?", me: "Da li imate stolicu dnevno?", kind: "yesno" },
    ],
  },
  {
    en: "Therapies and supplements", me: "Terapije i suplementacija",
    fields: [
      { key: "therapies", en: "Present therapies in use", me: "Trenutne terapije koje koristite", kind: "long" },
      { key: "supplements", en: "Supplements", me: "Suplementacija", kind: "long" },
    ],
  },
];

export const INTAKE_FIELDS = INTAKE_STEPS.flatMap(s => s.fields);
export type IntakeAnswers = Record<string, string>;
export const blankAnswers = (): IntakeAnswers => Object.fromEntries(INTAKE_FIELDS.map(f => [f.key, ""]));

/** Answers with follow-up questions cleared when their yes/no is not YES (the server does the same). */
export function visibleAnswers(a: IntakeAnswers): IntakeAnswers {
  const out = { ...a };
  for (const f of INTAKE_FIELDS) if (f.showIf && a[f.showIf] !== "YES") out[f.key] = "";
  return out;
}

/** How often an amount is taken: stored in English ("per day"), shown in both languages. */
export const PERIODS: (readonly [string, string])[] = [["day", "dnevno"], ["week", "sedmično"], ["month", "mjesečno"]];

/** An amount answer is stored as readable English: "10 cigarettes per day" or "2 glasses per week (wine)". */
export interface Amount { n: string; unit: string; period: string; note: string }
export function parseAmount(v: string, f: IntakeField): Amount {
  const units = f.units ?? [];
  const m = /^([\d.,]+) (.+?) per (day|week|month)(?: \((.*)\))?$/.exec(v.trim());
  if (m && units.some(u => u[0] === m[2])) return { n: m[1], unit: m[2], period: m[3], note: m[4] ?? "" };
  // Anything else (e.g. typed on an older version of the form) is kept in the note so nothing is lost.
  return { n: "", unit: units[0]?.[0] ?? "", period: "day", note: v.trim() };
}
export const amountValue = (a: Amount) =>
  a.n.trim() ? `${a.n.trim()} ${a.unit} per ${a.period}${a.note.trim() ? ` (${a.note.trim()})` : ""}` : a.note.trim();

/** Country calling codes for the phone number; Montenegro first (the default), then the region, then the rest. */
export const COUNTRY_CODES: { code: string; en: string; me: string }[] = [
  { code: "+382", en: "Montenegro", me: "Crna Gora" },
  { code: "+381", en: "Serbia", me: "Srbija" },
  { code: "+387", en: "Bosnia and Herzegovina", me: "Bosna i Hercegovina" },
  { code: "+385", en: "Croatia", me: "Hrvatska" },
  { code: "+383", en: "Kosovo", me: "Kosovo" },
  { code: "+355", en: "Albania", me: "Albanija" },
  { code: "+389", en: "North Macedonia", me: "Sjeverna Makedonija" },
  { code: "+386", en: "Slovenia", me: "Slovenija" },
  { code: "+359", en: "Bulgaria", me: "Bugarska" },
  { code: "+40", en: "Romania", me: "Rumunija" },
  { code: "+30", en: "Greece", me: "Grčka" },
  { code: "+90", en: "Turkey", me: "Turska" },
  { code: "+39", en: "Italy", me: "Italija" },
  { code: "+49", en: "Germany", me: "Njemačka" },
  { code: "+43", en: "Austria", me: "Austrija" },
  { code: "+41", en: "Switzerland", me: "Švajcarska" },
  { code: "+33", en: "France", me: "Francuska" },
  { code: "+44", en: "United Kingdom", me: "Velika Britanija" },
  { code: "+31", en: "Netherlands", me: "Holandija" },
  { code: "+32", en: "Belgium", me: "Belgija" },
  { code: "+46", en: "Sweden", me: "Švedska" },
  { code: "+47", en: "Norway", me: "Norveška" },
  { code: "+45", en: "Denmark", me: "Danska" },
  { code: "+358", en: "Finland", me: "Finska" },
  { code: "+48", en: "Poland", me: "Poljska" },
  { code: "+420", en: "Czechia", me: "Češka" },
  { code: "+36", en: "Hungary", me: "Mađarska" },
  { code: "+380", en: "Ukraine", me: "Ukrajina" },
  { code: "+7", en: "Russia", me: "Rusija" },
  { code: "+34", en: "Spain", me: "Španija" },
  { code: "+351", en: "Portugal", me: "Portugal" },
  { code: "+353", en: "Ireland", me: "Irska" },
  { code: "+1", en: "USA / Canada", me: "SAD / Kanada" },
  { code: "+61", en: "Australia", me: "Australija" },
  { code: "+971", en: "United Arab Emirates", me: "Ujedinjeni Arapski Emirati" },
  { code: "+972", en: "Israel", me: "Izrael" },
  { code: "+91", en: "India", me: "Indija" },
  { code: "+86", en: "China", me: "Kina" },
];
export const DEFAULT_COUNTRY_CODE = "+382";

/** "+382 69123456" -> code and number; a number typed without a code (e.g. 069/123-456) keeps Montenegro. */
export function splitPhone(v: string): { code: string; number: string } {
  const t = v.trim();
  if (!t.startsWith("+")) return { code: DEFAULT_COUNTRY_CODE, number: t };
  const c = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length).find(x => t.startsWith(x.code));
  return c ? { code: c.code, number: t.slice(c.code.length).trim() } : { code: DEFAULT_COUNTRY_CODE, number: t };
}
/** The full number as saved: "+382 69123456" (a leading 0 of the local number is dropped after the code). */
export function joinPhone(code: string, number: string) {
  const n = number.trim();
  if (!n) return "";
  if (n.startsWith("+")) return n;
  return `${code} ${n.replace(/^0+/, "")}`;
}

export const MONTHS: [string, string][] = [
  ["January", "Januar"], ["February", "Februar"], ["March", "Mart"], ["April", "April"], ["May", "Maj"], ["June", "Jun"],
  ["July", "Jul"], ["August", "Avgust"], ["September", "Septembar"], ["October", "Oktobar"], ["November", "Novembar"], ["December", "Decembar"],
];

/** Interface text shown to the patient, English first. */
export const T = {
  title: ["Patient form", "Upitnik za pacijente"],
  step: ["Step", "Korak"],
  of: ["of", "od"],
  next: ["Next", "Dalje"],
  back: ["Back", "Nazad"],
  review: ["Check and sign", "Provjera i potpis"],
  reviewHint: ["Please check your answers. Tap a section to change it.", "Molimo provjerite odgovore. Dodirnite dio koji želite promijeniti."],
  edit: ["Change", "Izmijeni"],
  yes: ["Yes", "Da"],
  no: ["No", "Ne"],
  optional: ["Leave empty if it does not apply.", "Ostavite prazno ako se ne odnosi na vas."],
  day: ["Day", "Dan"],
  month: ["Month", "Mjesec"],
  year: ["Year", "Godina"],
  sign: ["Sign here with your finger", "Potpišite se ovdje prstom"],
  clear: ["Clear", "Obriši"],
  consent: ["I confirm that the information I have given is true and complete.", "Potvrđujem da su podaci koje sam naveo/la tačni i potpuni."],
  submit: ["Submit", "Pošalji"],
  sending: ["Sending…", "Slanje…"],
  needName: ["Please enter your name.", "Molimo unesite ime i prezime."],
  needSign: ["Please sign the form.", "Molimo potpišite upitnik."],
  needConsent: ["Please tick the confirmation.", "Molimo označite potvrdu."],
  badEmail: ["Please check the email address.", "Molimo provjerite email adresu."],
  badDate: ["Please choose the full date of birth.", "Molimo izaberite cijeli datum rođenja."],
  amount: ["Amount", "Količina"],
  per: ["per", ""],
  countryCode: ["Country code", "Pozivni broj"],
  phoneNumber: ["Phone number", "Broj telefona"],
  thanks: ["Thank you!", "Hvala vam!"],
  thanksHint: ["Your form has been saved. Please return the tablet to our staff.", "Vaš upitnik je sačuvan. Molimo vratite tablet osoblju."],
  date: ["Date", "Datum"],
  signature: ["Signature", "Potpis"],
  empty: ["—", "—"],
} as const;
