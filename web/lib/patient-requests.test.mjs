import test from 'node:test';
import assert from 'node:assert/strict';
import { PatientRequests } from './patient-requests.ts';

test('only the last patient selection can complete, including A to B to A', () => {
  const requests = new PatientRequests();
  const first = requests.select('A');
  const second = requests.select('B');
  const third = requests.select('A');
  assert.equal(first(), false);
  assert.equal(second(), false);
  assert.equal(third(), true);
});
test('close invalidates restoration, selection and refresh', () => {
  const requests = new PatientRequests();
  const open = requests.select('A');
  const refresh = requests.refresh('A');
  requests.select(null);
  assert.equal(open(), false);
  assert.equal(refresh(), false);
});
test('old chart refresh cannot overwrite a new chart, and latest refresh wins', () => {
  const requests = new PatientRequests();
  requests.select('A');
  const old = requests.refresh('A');
  requests.select('B');
  const first = requests.refresh('B');
  const latest = requests.refresh('B');
  assert.equal(old(), false);
  assert.equal(first(), false);
  assert.equal(latest(), true);
  assert.equal(requests.refresh('A')(), false);
});
