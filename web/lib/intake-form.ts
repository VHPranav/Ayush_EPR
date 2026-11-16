// The clinic's bilingual (English / Montenegrin) patient intake form, SAGLASNOST.
// Keys must match SECTIONS in server/intake.js, which validates the answers and prints the PDF with the paper
// form's wording. The questions here are phrased for a patient filling them in on a tablet.

export type FieldKind = "text" | "long" | "yesno" | "date" | "email" | "tel" | "number";
export interface IntakeField {
  key: string;
  en: string;
  me: string;
  kind: FieldKind;
  /** Only shown (and kept) when this yes/no field is answered YES. */
  showIf?: string;
  placeholder?: string;
}
export interface IntakeStep { en: string; me: string; fields: IntakeField[] }

export const INTAKE_STEPS: IntakeStep[] = [
  {
    en: "Personal details", me: "Lični podaci",
    fields: [
      { key: "name", en: "Name and surname", me: "Ime i prezime", kind: "text" },
      { key: "dob", en: "Date of birth", me: "Datum rođenja", kind: "date" },
      { key: "phone", en: "Phone no.", me: "Broj telefona", kind: "tel", placeholder: "+382 …" },
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
      { key: "smokingAmount", en: "How much per day or month?", me: "Koliko dnevno ili mjesečno?", kind: "text", showIf: "smoking" },
      { key: "alcohol", en: "Do you drink alcohol?", me: "Da li konzumirate alkohol?", kind: "yesno" },
      { key: "alcoholAmount", en: "How much per day or month?", me: "Koliko dnevno ili mjesečno?", kind: "text", showIf: "alcohol" },
      { key: "drugs", en: "Do you take drugs?", me: "Da li konzumirate droge?", kind: "yesno" },
      { key: "drugsAmount", en: "How much per day or month?", me: "Koliko dnevno ili mjesečno?", kind: "text", showIf: "drugs" },
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
  thanks: ["Thank you!", "Hvala vam!"],
  thanksHint: ["Your form has been saved. Please return the tablet to our staff.", "Vaš upitnik je sačuvan. Molimo vratite tablet osoblju."],
  date: ["Date", "Datum"],
  signature: ["Signature", "Potpis"],
  empty: ["—", "—"],
} as const;
