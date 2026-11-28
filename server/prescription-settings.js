// Text printed on prescriptions, per language (en / me): letterhead, the doctor block, the note added to oral
// therapies and the standing advice that closes every prescription. Defaults are taken from the clinic's own
// prescriptions; a Super Administrator edits them under Prescription > Prescription settings.
import { requirePerm } from './permissions.js';
import { transactional } from './transaction.js';

export const DEFAULT_PRESCRIPTION_SETTINGS = {
  en: {
    letterhead: 'DATHATHREYA AYURVEDA & YOGA CENTER\nDATHA AYURYOGA INTERNATIONAL HEALTH INSTITUTE D.O.O\n109, Nikšićki ulica, Gornja Gorica, Podgorica 81000, Montenegro\nMobile: +382 (0)6933 0057; Email: dathahealthinstitute@gmail.com; Web: www.dathathreya.com',
    doctor: 'Vaidyaratnam\nDr. RAGHAVAN RAMANKUTTY\nMBBS, Pg. Dip. (Diabetology), Dip. (Acupuncture), BSc Chemistry, MA, LLB\nDISCIPLE OF SWAMI DATHATHREYA\nMODERN MEDICINE LICENCE # 11367',
    title: 'CG PRESCRIPTION - DETAILED ENGLISH',
    oralNote: 'Breathe deeply for 5 minutes before and 5 minutes after taking this therapy. Do not eat or drink for half an hour before and after each dose.',
    advice: [
      'Proper hydration and breathing are very important for early recovery: Drink water throughout the day, sip by sip. Drink at least 2 litres of warm water (or an amount equivalent to 5% of your body weight), half an hour after each dose.',
      'Inform us immediately in the event of a high fever, infection or vomiting.',
      'Allow a 30-minute interval between meals, drinking water and taking oral doses.',
      'Keep a detailed daily record of changes in your health status.',
      'For weekly health updates, contact us by email at dathahealthinstitute@gmail.com, by phone, or via Viber/WhatsApp at +382 69 33 00 57.',
    ].join('\n'),
  },
  me: {
    letterhead: 'DATATREJA AJURVEDA TRETMANI I JOGA CENTAR\nDATA AJURJOGA MEĐUNARODNA ZDRAVSTVENA INSTITUCIJA D.O.O.\n109, Nikšićki ulica, Gornja Gorica, Podgorica 81000, Montenegro\nMob: +382 (0)6933 0057; Email: dathahealthinstitute@gmail.com; Web: www.dathathreya.com',
    doctor: 'Vaidyaratnam (Ajurveda) i Doktor (moderna medicina)\nRAGHAVAN RAMANKUTY\nMBBS, Pg Dip. (Diabetology), Dip.(Acupuncture), BSc (Chemistry), MA, LLB\nUČENIK SVAMIJA DATATREJA\nModern Medicine License # 11367 (India)',
    title: 'CG PRESCRIPTION - DETAILED',
    oralNote: 'Duboko dišite 5 min prije i 5 min nakon uzimanja ove terapije. Ne jesti i ne piti pola sata prije i poslije svake doze.',
    advice: [
      'Pravilna hidratacija i disanje je vrlo važno za rani oporavak: Pijte vodu dnevno, gutljaj po gutljaj. Popijte makar 2 litra tople vode (ili 5% vaše tjelesne težine).',
      'Odmah nas obavijestite u slučaju visoke temperature, infekcije ili povraćanja.',
      'Dozvolite pauzu od 1/2 sata vremena između obroka i uzimanja vode i uzimanja oralnih doza.',
      'Održite detaljan dnevnik u promjenama Vašeg zdravstvenog statusa.',
      'Za nedeljno ažuriranje Vašeg zdravlja koristite email cg@dathathreya.com, telefon ili Viber/WhatsApp +382 69 33 00 57',
    ].join('\n'),
  },
};
const KEYS = ['letterhead', 'doctor', 'title', 'oralNote', 'advice'];

export async function prescriptionSettings(db) {
  const saved = (await db.query("SELECT value FROM app_settings WHERE key='prescription'")).rows[0]?.value ?? {};
  const out = {};
  for (const lang of ['en', 'me']) out[lang] = { ...DEFAULT_PRESCRIPTION_SETTINGS[lang], ...(saved[lang] ?? {}) };
  return out;
}

export function registerPrescriptionSettings({ app, pool, auth, audit }) {
  app.get('/api/settings/prescription', auth, requirePerm('prescriptions.read'), async (_req, res) => res.json(await prescriptionSettings(pool)));

  app.put('/api/settings/prescription', auth, requirePerm('users.manage'), transactional(pool, async (req, res, c) => {
    const value = {};
    for (const lang of ['en', 'me']) {
      const src = req.body?.[lang];
      if (!src || typeof src !== 'object') return res.status(400).json({ error: `Settings for ${lang} are required` });
      value[lang] = {};
      for (const k of KEYS) {
        const v = src[k];
        if (typeof v !== 'string' || v.length > 6000) return res.status(400).json({ error: `${lang}.${k}: enter text (up to 6000 characters)` });
        value[lang][k] = v.replace(/\r\n/g, '\n').trim();
      }
    }
    await c.query(`INSERT INTO app_settings(key,value,updated_by,updated_at) VALUES('prescription',$1,$2,now())
      ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_by=EXCLUDED.updated_by, updated_at=now()`, [JSON.stringify(value), req.auth.user_id]);
    await audit(c, { userId: req.auth.user_id, sessionId: req.auth.session_id, action: 'UPDATE_PRESCRIPTION_SETTINGS', tableName: 'app_settings', recordId: 'prescription', req });
    res.json(value);
  }));
}
