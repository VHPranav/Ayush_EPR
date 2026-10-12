// Single source of truth for who may do what. The API enforces these (requirePerm); the same list
// is sent to the web app on login and by /api/me so menus, pages and dashboards cannot drift from it.
// SUPER_ADMIN is granted every permission.

const DOCTORS = ['DOCTOR', 'AYURVEDA_PHYSICIAN', 'MODERN_MEDICAL_CONSULTANT'];
const THERAPISTS = ['PANCHAKARMA_THERAPIST', 'YOGA_THERAPIST', 'PHYSIOTHERAPIST'];
const CLINICAL_STAFF = [...DOCTORS, 'NURSE', ...THERAPISTS, 'DIETITIAN'];
const CLINICAL_READERS = [...CLINICAL_STAFF, 'MEDICAL_DIRECTOR']; // director: oversight, read-only

export const ALL_ROLES = [
  'SUPER_ADMIN', 'MEDICAL_DIRECTOR', ...DOCTORS, 'NURSE', ...THERAPISTS, 'DIETITIAN',
  'PHARMACIST', 'RECEPTION', 'FINANCE', 'MANAGER', 'AUDITOR',
];

export const PERMISSIONS = {
  // registry
  'patients.view': ALL_ROLES.filter(r => r !== 'AUDITOR'),
  'patients.register': ['RECEPTION', ...DOCTORS],
  // chart
  'clinical.read': CLINICAL_READERS,
  'clinical.write': CLINICAL_STAFF,           // assessments and notes
  'chart.write': [...DOCTORS, 'NURSE'],       // problems, med-rec, investigations, exams, referrals, care plans, administrations
  'outcomes.write': CLINICAL_STAFF,
  'sessions.write': [...DOCTORS, 'NURSE', ...THERAPISTS],
  'allergies.read': [...CLINICAL_READERS, 'PHARMACIST', 'RECEPTION'],
  'allergies.write': [...DOCTORS, 'NURSE', 'RECEPTION'],
  'medrec.read': [...CLINICAL_READERS, 'PHARMACIST'],
  'prescriptions.read': [...CLINICAL_READERS, 'PHARMACIST'],
  'prescriptions.write': DOCTORS,
  'discharge.write': DOCTORS,
  'templates.write': DOCTORS,
  'documents.read': [...CLINICAL_READERS, 'RECEPTION'],
  'documents.write': [...DOCTORS, 'NURSE', 'RECEPTION'],
  // operations
  'appointments.read': ['RECEPTION', 'MANAGER', 'MEDICAL_DIRECTOR', ...CLINICAL_STAFF],
  'appointments.write': ['RECEPTION', ...DOCTORS],
  'billing.read': ['RECEPTION', 'MANAGER', 'FINANCE'],
  'billing.write': ['RECEPTION', 'MANAGER', 'FINANCE'],
  'contacts.read': ['RECEPTION', ...DOCTORS, 'NURSE'],
  'contacts.write': ['RECEPTION', ...DOCTORS, 'NURSE'],
  'pharmacy.read': ['PHARMACIST', ...DOCTORS, 'MANAGER', 'MEDICAL_DIRECTOR'],
  'pharmacy.write': ['PHARMACIST'],
  'treatments.read': [...CLINICAL_READERS, 'RECEPTION', 'MANAGER'],
  'treatments.write': DOCTORS,
  'treatments.delete': [],
  // administration (Super Admin only: it is granted every permission)
  'users.manage': [],
  // governance
  'audit.read': ['AUDITOR', 'MANAGER', 'MEDICAL_DIRECTOR'],
};

/** All permissions held by a set of role names. */
export function permissionsFor(roles) {
  const rs = new Set((roles || []).filter(Boolean));
  if (rs.has('SUPER_ADMIN')) return Object.keys(PERMISSIONS);
  return Object.entries(PERMISSIONS).filter(([, allowed]) => allowed.some(r => rs.has(r))).map(([p]) => p);
}

/** Express middleware: 403 unless the signed-in user holds `perm`. Must run after `auth`. */
export const requirePerm = perm => {
  if (!(perm in PERMISSIONS)) throw new Error(`Unknown permission: ${perm}`);
  return (req, res, next) => {
    if (req.auth?.permissions?.includes(perm)) return next();
    res.status(403).json({ error: 'Insufficient permission' });
  };
};
