export const hasText = value => typeof value === 'string' && !!value.trim();
export const missing = value => value === undefined || value === null || value === '';
export const finiteNumber = value =>
  (typeof value === 'number' || (typeof value === 'string' && !!value.trim())) && Number.isFinite(Number(value));
export const nonNegative = value => missing(value) || (finiteNumber(value) && Number(value) >= 0);

export function prescriptionError(body) {
  for (const key of ['medicines', 'treatments']) {
    if (body[key] !== undefined && (!Array.isArray(body[key]) || body[key].length > 200))
      return `${key} must be a list of up to 200 items`;
  }
  if (!(body.medicines?.length || body.treatments?.length)) return 'Add at least one treatment or medicine';
  if (body.status !== undefined && body.status !== 'ISSUED') return 'New prescriptions must have ISSUED status';
  if ((body.medicines || []).some(m => !hasText(m?.name) || !hasText(m?.dose) || !hasText(m?.frequency)))
    return 'Every medicine needs a name, dose and frequency';
  if ((body.treatments || []).some(t => !hasText(t?.name) || !hasText(t?.frequency) || !hasText(t?.duration)))
    return 'Every treatment needs a name, frequency and duration';
  return null;
}

export const requiredText = (...fields) => (req, res, next) => {
  for (const field of fields) {
    if (!hasText(req.body?.[field])) return res.status(400).json({ error: `${field} is required` });
  }
  next();
};
