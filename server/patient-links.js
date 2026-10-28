const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Only fixed SQL identifiers live here; request values always use parameters.
const LINKS = {
  encounterId: 'SELECT 1 FROM encounters WHERE encounter_id=$1 AND patient_id=$2',
  amendedFrom: 'SELECT 1 FROM clinical_records WHERE record_id=$1 AND patient_id=$2',
  prescriptionTreatmentId: `SELECT 1 FROM prescription_treatments l JOIN prescriptions p USING(prescription_id)
    WHERE l.row_id=$1 AND p.patient_id=$2`,
  prescriptionMedicineId: `SELECT 1 FROM prescription_medicines l JOIN prescriptions p USING(prescription_id)
    WHERE l.row_id=$1 AND p.patient_id=$2`,
};

export function patientLinks(pool, ...fields) {
  for (const field of fields) if (!LINKS[field]) throw new Error(`Unknown patient link: ${field}`);
  return async (req, res, next) => {
    for (const field of fields) {
      const value = req.body?.[field];
      if (value === undefined || value === null || value === '') continue;
      if (typeof value !== 'string' || !UUID.test(value))
        return res.status(400).json({ error: `${field} must be a valid identifier` });
      const result = await pool.query(LINKS[field], [value, req.params.id]);
      // Do not reveal whether an identifier exists on another patient's chart.
      if (!result.rows.length) return res.status(404).json({ error: 'Linked record not found for this patient' });
    }
    next();
  };
}
