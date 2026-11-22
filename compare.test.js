import assert from 'node:assert/strict';
import test from 'node:test';
import { compare } from './compare.js';

const base = {
  expression: '30 2,14 * * *',
  zone: 'Europe/Luxembourg',
  start: '2026-10-24T22:00:00Z',
  end: '2026-10-25T22:00:00Z',
};

test('fall overlap aligns UTC times and preserves both offsets', () => {
  const report = compare(base);
  assert.deepEqual(report.utc.croner, [
    '2026-10-25T00:30:00.000Z', '2026-10-25T01:30:00.000Z', '2026-10-25T13:30:00.000Z',
  ]);
  assert.equal(report.rows.filter(row => row.match === 'croner').length, 1);
  assert.deepEqual(report.rows.filter(row => row.repeated.includes('croner')).map(row => row.offset), ['+02:00', '+01:00']);
});

test('spring difference and ordinary day', () => {
  const spring = compare({ ...base, start: '2026-03-28T23:00:00Z', end: '2026-03-29T22:00:00Z' });
  assert.ok(spring.rows.some(row => row.match === 'cronParser'));
  const ordinary = compare({ ...base, start: '2026-02-02T00:00:00Z', end: '2026-02-03T00:00:00Z' });
  assert.deepEqual(ordinary.utc.cronParser, ordinary.utc.croner);
});

test('start is exclusive, end inclusive, offsets accepted in New York', () => {
  const input = { ...base, zone: 'America/New_York', start: '2026-02-02T02:30:00-05:00', end: '2026-02-02T14:30:00-05:00' };
  assert.deepEqual(compare(input).rows.map(row => row.utc), ['2026-02-02T19:30:00.000Z']);
  assert.equal(compare({ ...input, end: '2026-02-02T14:29:59-05:00' }).rows.length, 0);
});

test('invalid input and incomplete enumeration fail closed', () => {
  for (const input of [
    { start: '2026-02-30T10:00:00Z' }, { start: '2026-10-24T22:00:00' },
    { zone: 'UTC' }, { expression: '0 0 1 * 1' }, { expression: '0 24 * * *' },
    { end: base.start }, { start: '2025-12-31T22:59:59Z' },
  ]) assert.throws(() => compare({ ...base, ...input }));
  assert.throws(() => compare({ ...base, expression: '* * * * *' }), /1000/);
});

test('a fractional start does not hide a trigger exactly at the end', () => {
  const report = compare({
    ...base, expression: '30 * * * *',
    start: '2026-02-02T13:29:59.999Z', end: '2026-02-02T13:30:00.000Z',
  });
  assert.deepEqual(report.utc.cronParser, ['2026-02-02T13:30:00.000Z']);
  assert.deepEqual(report.utc.croner, report.utc.cronParser);
});

test('shared wildcard step accepts the field cardinality', () => {
  const report = compare({ ...base, expression: '*/60 */24 * * */7' });
  assert.equal(report.input.expression, '*/60 */24 * * */7');
});
