import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_ROLES, PERMISSIONS, permissionsFor } from './permissions.js';

const has = (role, perm) => permissionsFor([role]).includes(perm);

test('super admin holds every permission', () => {
  assert.deepEqual(new Set(permissionsFor(['SUPER_ADMIN'])), new Set(Object.keys(PERMISSIONS)));
});

test('every role named in the matrix is a known role', () => {
  for (const [perm, roles] of Object.entries(PERMISSIONS))
    for (const r of roles) assert.ok(ALL_ROLES.includes(r), `${perm}: unknown role ${r}`);
});

test('reception cannot read the clinical chart or prescriptions', () => {
  for (const p of ['clinical.read', 'clinical.write', 'prescriptions.read', 'prescriptions.write', 'pharmacy.read'])
    assert.equal(has('RECEPTION', p), false, p);
  for (const p of ['patients.register', 'appointments.write', 'billing.write', 'allergies.read']) assert.equal(has('RECEPTION', p), true, p);
});

test('pharmacist: stock + prescriptions/allergies/med-rec read, no clinical notes', () => {
  assert.equal(has('PHARMACIST', 'pharmacy.write'), true);
  for (const p of ['prescriptions.read', 'allergies.read', 'medrec.read']) assert.equal(has('PHARMACIST', p), true, p);
  for (const p of ['clinical.read', 'prescriptions.write', 'billing.read']) assert.equal(has('PHARMACIST', p), false, p);
});

test('only doctors prescribe; nurses and therapists do not', () => {
  for (const r of ['DOCTOR', 'AYURVEDA_PHYSICIAN', 'MODERN_MEDICAL_CONSULTANT']) assert.equal(has(r, 'prescriptions.write'), true, r);
  for (const r of ['NURSE', 'PANCHAKARMA_THERAPIST', 'YOGA_THERAPIST', 'PHYSIOTHERAPIST', 'DIETITIAN', 'MEDICAL_DIRECTOR'])
    assert.equal(has(r, 'prescriptions.write'), false, r);
});

test('medical director oversees: reads chart and audit, writes nothing clinical', () => {
  for (const p of ['clinical.read', 'audit.read']) assert.equal(has('MEDICAL_DIRECTOR', p), true, p);
  for (const p of ['clinical.write', 'chart.write', 'prescriptions.write', 'sessions.write']) assert.equal(has('MEDICAL_DIRECTOR', p), false, p);
});

test('auditor sees the audit log only (no patient registry or chart)', () => {
  assert.deepEqual(permissionsFor(['AUDITOR']), ['audit.read']);
});

test('finance handles billing but not clinical data', () => {
  for (const p of ['billing.read', 'billing.write', 'patients.view']) assert.equal(has('FINANCE', p), true, p);
  assert.equal(has('FINANCE', 'clinical.read'), false);
});

test('only super admin can manage users', () => {
  for (const r of ALL_ROLES.filter(r => r !== 'SUPER_ADMIN')) assert.equal(has(r, 'users.manage'), false, r);
  assert.equal(has('SUPER_ADMIN', 'users.manage'), true);
});

test('multiple roles combine; unknown/empty roles grant nothing', () => {
  assert.equal(has('NURSE', 'billing.read'), false);
  assert.equal(permissionsFor(['NURSE', 'FINANCE']).includes('billing.read'), true);
  assert.deepEqual(permissionsFor([null, 'NOPE']), []);
});
