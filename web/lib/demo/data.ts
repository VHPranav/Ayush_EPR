// Fictional sample data for the static demo build (NEXT_PUBLIC_DEMO=1). No real people or records.
// Dates are generated relative to "now" so the dashboard always looks current.
import type {
  Allergy, AuditEntry, BillingAccount, CarePlan, ClinicalRecord, Discharge, FollowUp, Investigation, ManagedUser, MedRec,
  Outcome, Patient, PatientDocument, PatientSummary, Prescription, Problem, Referral, StockItem, TimelineEvent,
  TreatmentMaster, TreatmentSession,
} from "../types";

const DAY = 86_400_000;

interface Case {
  name: string; dob: string; sex: string; phone: string; nationality: string; city: string; daysAgo: number;
  problem: string; notes: string; prakriti: string; vikriti: string; agni: string; ama: string;
  complaint: string; hpi: string; modernDx: string; ayurDx: string;
  allergen: string; reaction: string; severity: string; med: string;
  test: string; result: string; domain: string; scale: string; score: number;
  refTo: string; refSpec: string; therapy: string; rx: string;
}

const CASES: Case[] = [
  { name: "Meera Nair", dob: "1979-04-12", sex: "Female", phone: "+44 7700 900101", nationality: "British", city: "London", daysAgo: 165,
    problem: "Lumbar spondylosis", notes: "Chronic lower back pain, worse in the morning.", prakriti: "Vata-Pitta", vikriti: "Vata", agni: "Vishama", ama: "Present",
    complaint: "Lower back pain for 8 months radiating to left leg", hpi: "Gradual onset, stiffness on waking, relieved by warmth. No red-flag symptoms.",
    modernDx: "Lumbar spondylosis L4-L5", ayurDx: "Kati graha (Vata predominant)", allergen: "Penicillin", reaction: "Rash", severity: "Moderate", med: "Paracetamol",
    test: "MRI lumbar spine", result: "Mild L4-L5 disc bulge, no cord compression.", domain: "Pain", scale: "VAS", score: 6.5,
    refTo: "Dr. A. Patel (Orthopaedics)", refSpec: "Orthopaedics", therapy: "Kati basti with Mahanarayana taila", rx: "Dashamoola kwatha" },
  { name: "Rohan Verma", dob: "1987-09-03", sex: "Male", phone: "+44 7700 900102", nationality: "British", city: "London", daysAgo: 150,
    problem: "Irritable bowel syndrome", notes: "Bloating and irregular stools for 2 years.", prakriti: "Pitta", vikriti: "Pitta-Vata", agni: "Tikshna", ama: "Present",
    complaint: "Abdominal bloating and alternating bowel habit", hpi: "Triggered by stress and irregular meals. Weight stable.",
    modernDx: "IBS (mixed type)", ayurDx: "Grahani roga", allergen: "Lactose", reaction: "Bloating", severity: "Mild", med: "Mebeverine",
    test: "Stool culture", result: "No growth. Calprotectin normal.", domain: "Digestion", scale: "IBS-SSS", score: 280,
    refTo: "Dr. L. Evans (Gastroenterology)", refSpec: "Gastroenterology", therapy: "Takradhara and Udvartana", rx: "Triphala churna" },
  { name: "Ananya Iyer", dob: "1996-01-22", sex: "Female", phone: "+91 98100 00103", nationality: "Indian", city: "Chennai", daysAgo: 120,
    problem: "PCOS", notes: "Irregular cycles, 45-60 day interval.", prakriti: "Kapha", vikriti: "Kapha-Vata", agni: "Manda", ama: "Present",
    complaint: "Irregular menstrual cycles and weight gain", hpi: "Cycle 45-60 days. Mild hirsutism. Sedentary work.",
    modernDx: "Polycystic ovary syndrome", ayurDx: "Artava kshaya / Kaphaja", allergen: "None known", reaction: "", severity: "Mild", med: "Metformin",
    test: "Pelvic ultrasound", result: "Bilateral polycystic ovarian morphology.", domain: "Cycle regularity", scale: "Cycle days", score: 52,
    refTo: "Dr. S. Rao (Gynaecology)", refSpec: "Gynaecology", therapy: "Udvartana and Vamana preparation", rx: "Kanchanar guggulu" },
  { name: "Karan Malhotra", dob: "1973-06-30", sex: "Male", phone: "+44 7700 900104", nationality: "British", city: "London", daysAgo: 98,
    problem: "Hypertension and insomnia", notes: "Work stress, sleeps 4-5 hours.", prakriti: "Vata", vikriti: "Vata-Pitta", agni: "Vishama", ama: "Absent",
    complaint: "Poor sleep and persistent tension headaches", hpi: "On amlodipine 5 mg. Home BP 145/92. High work stress.",
    modernDx: "Essential hypertension, insomnia", ayurDx: "Anidra with Rakta-gata vata", allergen: "None known", reaction: "", severity: "Mild", med: "Amlodipine",
    test: "ECG", result: "Sinus rhythm, no acute changes.", domain: "Sleep", scale: "PSQI", score: 12,
    refTo: "Dr. M. Brown (Cardiology)", refSpec: "Cardiology", therapy: "Shirodhara with Ksheerabala taila", rx: "Brahmi ghrita" },
  { name: "Sofia Petrović", dob: "1984-11-08", sex: "Female", phone: "+382 67 000 105", nationality: "Montenegrin", city: "Kotor", daysAgo: 75,
    problem: "Migraine", notes: "2-3 episodes per month with aura.", prakriti: "Pitta-Vata", vikriti: "Pitta", agni: "Tikshna", ama: "Absent",
    complaint: "Recurrent right-sided headaches with nausea", hpi: "Photophobia during attacks. Triggered by missed meals and heat.",
    modernDx: "Migraine with aura", ayurDx: "Ardhavabhedaka", allergen: "Sulfa drugs", reaction: "Hives", severity: "Moderate", med: "Sumatriptan PRN",
    test: "Blood panel", result: "Within normal limits.", domain: "Headache days", scale: "Days/month", score: 9,
    refTo: "Dr. N. Jovanović (Neurology)", refSpec: "Neurology", therapy: "Nasyam with Anu taila", rx: "Pathyadi kwatha" },
  { name: "James Whitfield", dob: "1966-02-17", sex: "Male", phone: "+44 7700 900106", nationality: "British", city: "London", daysAgo: 60,
    problem: "Knee osteoarthritis", notes: "Bilateral, right worse. Difficulty with stairs.", prakriti: "Vata-Kapha", vikriti: "Vata", agni: "Manda", ama: "Present",
    complaint: "Right knee pain and stiffness", hpi: "Gradual over 3 years, worse after rest and in cold weather.",
    modernDx: "Primary osteoarthritis, knee", ayurDx: "Janu sandhigata vata", allergen: "Ibuprofen", reaction: "GI upset", severity: "Mild", med: "Paracetamol",
    test: "X-ray knee", result: "Joint space narrowing, osteophytes.", domain: "Function", scale: "WOMAC", score: 48,
    refTo: "Dr. K. Shah (Rheumatology)", refSpec: "Rheumatology", therapy: "Janu basti and Pizhichil", rx: "Yogaraja guggulu" },
  { name: "Priya Menon", dob: "1991-07-25", sex: "Female", phone: "+91 98100 00107", nationality: "Indian", city: "Kochi", daysAgo: 44,
    problem: "Anxiety with sleep disturbance", notes: "Racing thoughts at night.", prakriti: "Vata", vikriti: "Vata", agni: "Vishama", ama: "Absent",
    complaint: "Anxiety, restlessness and light sleep", hpi: "Symptoms for 6 months after job change. No self-harm ideation.",
    modernDx: "Generalised anxiety (mild-moderate)", ayurDx: "Chittodvega", allergen: "None known", reaction: "", severity: "Mild", med: "None",
    test: "GAD-7", result: "Score 11 (moderate).", domain: "Anxiety", scale: "GAD-7", score: 11,
    refTo: "Dr. R. Das (Psychology)", refSpec: "Psychology", therapy: "Shirodhara and Abhyanga", rx: "Ashwagandha churna" },
  { name: "Daniel Hughes", dob: "1977-12-02", sex: "Male", phone: "+44 7700 900108", nationality: "British", city: "London", daysAgo: 30,
    problem: "Type 2 diabetes (lifestyle)", notes: "HbA1c 7.4%. Diet and exercise plan.", prakriti: "Kapha", vikriti: "Kapha", agni: "Manda", ama: "Present",
    complaint: "Fatigue and weight gain, seeking lifestyle support", hpi: "Diagnosed 2 years ago. Metformin 500 mg BD. Sedentary job.",
    modernDx: "Type 2 diabetes mellitus", ayurDx: "Madhumeha (Kaphaja)", allergen: "None known", reaction: "", severity: "Mild", med: "Metformin",
    test: "HbA1c", result: "7.4% (58 mmol/mol).", domain: "Glycaemic control", scale: "HbA1c %", score: 7.4,
    refTo: "Dr. P. Walker (Diabetology)", refSpec: "Diabetology", therapy: "Udvartana", rx: "Nisha amalaki" },
  { name: "Ivana Marković", dob: "1989-05-14", sex: "Female", phone: "+382 67 000 109", nationality: "Montenegrin", city: "Podgorica", daysAgo: 18,
    problem: "Plaque psoriasis", notes: "Scalp and elbows, flares with stress.", prakriti: "Pitta", vikriti: "Pitta-Kapha", agni: "Tikshna", ama: "Present",
    complaint: "Itchy scaly plaques on elbows and scalp", hpi: "Present 4 years, worse in winter. Topical steroids with partial relief.",
    modernDx: "Chronic plaque psoriasis", ayurDx: "Ekakushtha", allergen: "Nickel", reaction: "Contact dermatitis", severity: "Mild", med: "Betamethasone cream",
    test: "Skin assessment", result: "PASI 8.2.", domain: "Skin", scale: "PASI", score: 8.2,
    refTo: "Dr. T. Vuković (Dermatology)", refSpec: "Dermatology", therapy: "Takradhara", rx: "Mahatiktaka ghrita" },
  { name: "Arjun Reddy", dob: "1993-03-09", sex: "Male", phone: "+91 98100 00110", nationality: "Indian", city: "Hyderabad", daysAgo: 9,
    problem: "Cervical spondylosis", notes: "Desk worker, neck stiffness and tingling.", prakriti: "Vata", vikriti: "Vata", agni: "Vishama", ama: "Absent",
    complaint: "Neck pain with tingling in the right hand", hpi: "Worse after long screen hours. No weakness.",
    modernDx: "Cervical spondylosis C5-C6", ayurDx: "Manyastambha", allergen: "None known", reaction: "", severity: "Mild", med: "None",
    test: "MRI cervical spine", result: "C5-C6 osteophytes, mild foraminal narrowing.", domain: "Neck function", scale: "NDI", score: 24,
    refTo: "Dr. V. Kumar (Spine)", refSpec: "Spine surgery", therapy: "Greeva basti", rx: "Rasnadi guggulu" },
  { name: "Emily Clarke", dob: "1998-10-19", sex: "Female", phone: "+44 7700 900111", nationality: "British", city: "London", daysAgo: 4,
    problem: "Atopic eczema", notes: "Flexural eczema, dry skin.", prakriti: "Pitta", vikriti: "Pitta-Vata", agni: "Sama", ama: "Absent",
    complaint: "Itchy dry patches behind knees and elbows", hpi: "Since childhood, flares with stress and cold weather.",
    modernDx: "Atopic dermatitis", ayurDx: "Vicharchika", allergen: "House dust mite", reaction: "Rhinitis", severity: "Mild", med: "Emollients",
    test: "Allergy panel", result: "Raised specific IgE to dust mite.", domain: "Skin", scale: "POEM", score: 14,
    refTo: "Dr. H. Moore (Dermatology)", refSpec: "Dermatology", therapy: "Abhyanga", rx: "Nalpamaradi taila" },
  { name: "Vikram Joshi", dob: "1962-08-27", sex: "Male", phone: "+91 98100 00112", nationality: "Indian", city: "Pune", daysAgo: 1,
    problem: "Post-stroke rehabilitation", notes: "Left-sided weakness, 4 months post-stroke.", prakriti: "Vata-Kapha", vikriti: "Vata", agni: "Manda", ama: "Present",
    complaint: "Left arm weakness and reduced mobility", hpi: "Ischaemic stroke 4 months ago. Receiving physiotherapy. On antiplatelet.",
    modernDx: "Ischaemic stroke, hemiparesis", ayurDx: "Pakshaghata", allergen: "None known", reaction: "", severity: "Mild", med: "Clopidogrel",
    test: "Barthel Index", result: "Score 65/100.", domain: "Independence", scale: "Barthel", score: 65,
    refTo: "Dr. G. Singh (Neurology)", refSpec: "Neurology", therapy: "Pizhichil and Shashtika shali pinda sveda", rx: "Balaswagandha taila" },
];

export interface DemoDb {
  patients: Patient[];
  summaries: PatientSummary[];
  timeline: Record<string, TimelineEvent[]>;
  problems: Record<string, Problem[]>;
  allergies: Record<string, Allergy[]>;
  medrec: Record<string, MedRec[]>;
  outcomes: Record<string, Outcome[]>;
  investigations: Record<string, Investigation[]>;
  referrals: Record<string, Referral[]>;
  carePlans: Record<string, CarePlan[]>;
  sessions: Record<string, TreatmentSession[]>;
  documents: Record<string, PatientDocument[]>;
  billing: Record<string, BillingAccount[]>;
  discharge: Record<string, Discharge[]>;
  treatments: TreatmentMaster[];
  stock: StockItem[];
  followups: FollowUp[];
  audit: AuditEntry[];
  users: ManagedUser[];
}

export const DEMO_USERS = [
  { username: "admin", name: "Dr. Asha Menon", roles: ["SUPER_ADMIN"], blurb: "Everything, including users" },
  { username: "director", name: "Dr. Henry Lawson", roles: ["MEDICAL_DIRECTOR"], blurb: "Clinical oversight, read-only" },
  { username: "doctor", name: "Dr. Kavita Rao", roles: ["AYURVEDA_PHYSICIAN"], blurb: "Assess, prescribe, discharge" },
  { username: "nurse", name: "Nurse Olivia Grant", roles: ["NURSE"], blurb: "Observations and notes" },
  { username: "therapist", name: "Suresh Kumar", roles: ["PANCHAKARMA_THERAPIST"], blurb: "Therapy sessions" },
  { username: "pharmacist", name: "Marko Savić", roles: ["PHARMACIST"], blurb: "Dispensing and stock" },
  { username: "reception", name: "Lena Fischer", roles: ["RECEPTION"], blurb: "Registration and bookings" },
  { username: "finance", name: "Rahul Gupta", roles: ["FINANCE"], blurb: "Invoices and payments" },
  { username: "manager", name: "Sarah Mitchell", roles: ["MANAGER"], blurb: "Operations and reports" },
  { username: "auditor", name: "Tom Becker", roles: ["AUDITOR"], blurb: "Audit log only" },
] as const;

const TREATMENTS: [string, string, string, string][] = [
  ["Abhyanga", "Snehana", "Once daily", "7 days"], ["Shirodhara", "Panchakarma", "Once daily", "14 days"],
  ["Shirovasti", "Panchakarma", "Once daily", "7 days"], ["Vasti", "Panchakarma", "Once daily", "8 days"],
  ["Nasyam", "Panchakarma", "Once daily", "7 days"], ["Pizhichil", "Panchakarma", "Once daily", "14 days"],
  ["Kizhi", "Svedana", "Once daily", "7 days"], ["Talapothichil", "Panchakarma", "Once daily", "7 days"],
  ["Swedana", "Svedana", "Once daily", "3 days"],
];

export function buildDemo(now: number): DemoDb {
  const iso = (daysAgo: number, hour = 10) => new Date(now - daysAgo * DAY + (hour - 12) * 3_600_000).toISOString();
  const ymd = (offsetDays: number) => {
    const d = new Date(now + offsetDays * DAY);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const db: DemoDb = {
    patients: [], summaries: [], timeline: {}, problems: {}, allergies: {}, medrec: {}, outcomes: {}, investigations: {},
    referrals: {}, carePlans: {}, sessions: {}, documents: {}, billing: {}, discharge: {},
    treatments: TREATMENTS.map(([name, category, f, d], i) => ({ treatment_id: `demo-t${i + 1}`, name, category, default_frequency: f, default_duration: d })),
    stock: [], followups: [], audit: [], users: [],
  };

  CASES.forEach((c, i) => {
    const id = `demo-p${i + 1}`;
    const uhid = `AY-2026-${String(i + 1).padStart(5, "0")}`;
    const reg = iso(c.daysAgo);

    const assessment: ClinicalRecord = {
      record_id: `${id}-cr1`, section: "INTEGRATED_CLINICAL_ASSESSMENT", created_at: iso(c.daysAgo - 0.1),
      payload: {
        chiefComplaints: c.complaint, hpi: c.hpi, pastHistory: "No significant surgical history.", familyHistory: "Non-contributory; occasional stress at work.",
        vitals: { bp: "126/82", pulse: "74", temp: "36.7", spo2: "98", height: "168", weight: "68", bmi: "24.1", rr: "16" },
        modernDiagnosis: c.modernDx, prakriti: c.prakriti.includes("-") ? c.prakriti : c.prakriti, vikriti: c.vikriti, agni: c.agni, ama: c.ama,
        ashtavidha: "Nadi: Vata-Pitta gati. Mala: regular. Mutra: normal. Jihva: mild coating. Shabda: normal. Sparsha: dry. Drik: normal. Akriti: medium build.",
        ayurvedaDiagnosis: c.ayurDx, modernFindings: c.modernDx, ayurvedaFindings: c.ayurDx,
        correlation: `${c.modernDx} corresponds clinically to ${c.ayurDx}.`,
        integratedImpression: `Integrative plan: ${c.therapy}; ${c.rx}; diet and lifestyle advice; review in 4 weeks.`,
        goalsSafety: "Monitor symptoms at 2, 4 and 12 weeks. Continue conventional medication. Refer if red flags appear.",
      },
    };
    const note: ClinicalRecord = {
      record_id: `${id}-cr2`, section: "NOTE", created_at: iso(Math.max(c.daysAgo - 7, 0.5)),
      payload: { type: "Progress / SOAP", text: "S: Symptoms improving, sleeping better. O: Tolerated therapy well. A: Good early response. P: Continue plan, review next week." },
    };
    const rxs: Prescription[] = [
      { prescription_id: `${id}-rx1`, prescription_no: `RX-2026${String(i + 1).padStart(2, "0")}0001`, prescribed_at: iso(Math.max(c.daysAgo - 0.1, 0.4)), status: "ISSUED" },
    ];
    const appts = i % 2 === 0 ? [{ appointment_id: `${id}-a1`, appointment_at: new Date(now + (i / 2 + 1) * DAY).toISOString(), type: "FOLLOW-UP", reason: "Review", status: "SCHEDULED" }] : [];

    db.patients.push({
      patient_id: id, uhid, name: c.name, dob: c.dob, sex: c.sex, phone: c.phone, registered_at: reg, email: `${c.name.split(" ")[0].toLowerCase()}@example.com`,
      nationality: c.nationality, blood_group: ["A+", "B+", "O+", "AB+"][i % 4], insurance: i % 3 === 0 ? "Insurance" : "Self-pay",
      emergency_contact: "Family member (on file)", primary_physician: "Dr. Kavita Rao", address: `${c.city}`,
      clinicalRecords: [note, assessment], prescriptions: rxs, letters: [], discharges: [], appointments: appts,
    } as Patient);
    db.summaries.push({ patient_id: id, uhid, name: c.name, dob: c.dob, sex: c.sex, phone: c.phone, registered_at: reg });

    db.problems[id] = [{ id: `${id}-pr1`, problem: c.problem, status: "ACTIVE", notes: c.notes }];
    db.allergies[id] = c.allergen === "None known" ? [] : [{ id: `${id}-al1`, allergen: c.allergen, reaction: c.reaction, severity: c.severity }];
    db.medrec[id] = c.med === "None" ? [] : [{ id: `${id}-mr1`, medicine_name: c.med, dose: "As prescribed", route: "Oral", frequency: "Once daily" }];
    db.investigations[id] = [{ id: `${id}-iv1`, test_name: c.test, result_summary: c.result }];
    db.outcomes[id] = [
      { id: `${id}-oc1`, domain: c.domain, scale_name: c.scale, score: c.score, narrative: "Baseline assessment." },
      { id: `${id}-oc2`, domain: c.domain, scale_name: c.scale, score: +(c.score * 0.8).toFixed(1), narrative: "2-week review: early improvement." },
    ];
    db.referrals[id] = [{ id: `${id}-rf1`, specialty: c.refSpec, referred_to: c.refTo, status: i % 3 === 0 ? "COMPLETED" : "SENT", reason: "Specialist opinion to complement integrative care." }];
    db.carePlans[id] = [{ id: `${id}-cp1`, plan_type: "INTEGRATED", review_date: ymd(14 - i), status: "ACTIVE" }];
    db.sessions[id] = [3, 2, 1].map((k, n) => ({
      id: `${id}-s${n + 1}`, session_date: ymd(-(k * 2 + 1)), start_time: "10:00", end_time: "11:00",
      status: "COMPLETED", procedure_notes: `${c.therapy}. Tolerated well, no adverse events.`,
    }));
    db.documents[id] = [{ id: `${id}-d1`, document_type: i % 2 ? "LAB" : "MRI", file_name: `${c.test.replace(/\s+/g, "-").toLowerCase()}.pdf`, uploaded_at: iso(c.daysAgo - 0.2) }];
    db.billing[id] = [
      { id: `${id}-b1`, invoice_number: `INV-2026${String(i + 1).padStart(2, "0")}01`, total: 120 + i * 35, status: "PAID" },
      ...(i % 3 === 0 ? [{ id: `${id}-b2`, invoice_number: `INV-2026${String(i + 1).padStart(2, "0")}02`, total: 480 + i * 20, status: "OPEN" }] : []),
    ];
    db.discharge[id] = i % 4 === 0 ? [{ id: `${id}-ds1`, summary_date: ymd(-5), followup_plan: "Review in 4 weeks; continue home regimen." }] : [];

    db.timeline[id] = [
      { event_time: assessment.created_at, event_type: "NOTE", event_id: assessment.record_id, title: "Assessment", detail: c.complaint },
      { event_time: note.created_at, event_type: "NOTE", event_id: note.record_id, title: "Progress / SOAP", detail: "Symptoms improving, sleeping better." },
      { event_time: rxs[0].prescribed_at, event_type: "PRESCRIPTION", event_id: rxs[0].prescription_id, title: rxs[0].prescription_no, detail: "ISSUED" },
      { event_time: iso(c.daysAgo - 0.1), event_type: "PROBLEM", event_id: `${id}-pr1`, title: c.problem, detail: c.notes },
      { event_time: iso(c.daysAgo - 0.3), event_type: "REFERRAL", event_id: `${id}-rf1`, title: c.refSpec, detail: "Specialist opinion requested." },
      ...appts.map(a => ({ event_time: a.appointment_at, event_type: "APPOINTMENT", event_id: a.appointment_id, title: a.type, detail: a.reason })),
    ].sort((a, b) => +new Date(b.event_time) - +new Date(a.event_time));
  });
  db.summaries.reverse(); // newest first, like the API
  db.patients.reverse();

  // Appointments for the next two weeks
  const types = ["FOLLOW-UP", "THERAPY", "CONSULTATION", "REVIEW"];
  db.followups = CASES.slice(0, 9).map((c, i) => {
    const d = new Date(now + (i * 1.4 + 0.4) * DAY);
    d.setHours(9 + (i % 6), i % 2 ? 30 : 0, 0, 0);
    return { appointment_at: d.toISOString(), name: c.name, uhid: `AY-2026-${String(i + 1).padStart(5, "0")}`, type: types[i % 4], reason: i % 4 === 1 ? c.therapy.split(" with ")[0] : "Review progress" };
  }).sort((a, b) => +new Date(a.appointment_at) - +new Date(b.appointment_at));

  // Pharmacy stock (two low, one expiring soon, one already expired)
  const stock: [string, string, string, number, number, string, number][] = [
    ["Ashwagandha churna", "Powder", "AC-2412", 42, 20, "kg", 400], ["Triphala churna", "Powder", "TC-2409", 8, 15, "kg", 220],
    ["Brahmi ghrita", "Ghee", "BG-2503", 31, 12, "jar", 300], ["Dashamoola kwatha", "Decoction", "DK-2501", 5, 10, "bottle", 18],
    ["Mahanarayana taila", "Oil", "MT-2407", 24, 10, "bottle", 12], ["Dhanwantaram taila", "Oil", "DT-2411", 18, 8, "bottle", -3],
    ["Chyawanprash", "Paste", "CP-2506", 60, 25, "jar", 540], ["Arogyavardhini vati", "Tablet", "AV-2504", 120, 50, "strip", 380],
    ["Saraswatarishta", "Asava", "SA-2502", 14, 6, "bottle", 9], ["Kshirabala taila", "Oil", "KT-2410", 22, 8, "bottle", 260],
  ];
  db.stock = stock.map(([medicine_name, form, batch_no, quantity, reorder_level, unit, expDays], i) => ({
    stock_id: `demo-st${i + 1}`, medicine_name, form, batch_no, expiry_date: ymd(expDays), quantity, unit, reorder_level, low_stock: quantity <= reorder_level,
  }));

  // Audit trail (last ~36 hours)
  const actions: [string, string | null][] = [
    ["LOGIN_SUCCESS", "users"], ["VIEW_TIMELINE", "patients"], ["CREATE_CLINICAL_RECORD", "clinical_records"], ["ISSUE_PRESCRIPTION", "prescriptions"],
    ["CREATE_PATIENT", "patients"], ["UPLOAD_DOCUMENT", "documents"], ["SESSION_CREATED", "sessions"], ["DOWNLOAD_DOCUMENT", "documents"], ["LOGIN_FAILURE", "users"], ["LOGOUT", "sessions"],
  ];
  db.audit = Array.from({ length: 40 }, (_, i) => {
    const [action, table_name] = actions[(i * 7) % actions.length];
    return { event_time: new Date(now - (i * 0.9 + 0.2) * 3_600_000).toISOString(), action, table_name, record_id: `${(1000 + i * 37).toString(16)}-demo` };
  });

  db.users = DEMO_USERS.map((u, i) => ({
    user_id: `demo-u${i + 1}`, username: u.username, display_name: u.name, active: true, created_at: iso(200), roles: [...u.roles],
    last_login: new Date(now - (i * 2.5 + 1) * 3_600_000).toISOString(), legacy_password: false,
  }));

  return db;
}
