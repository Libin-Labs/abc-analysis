import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { abcAnalysis, AbcError } from '../dist/esm/index.js';

const items = (...values) => values.map((value, i) => ({ id: `i${i + 1}`, value }));
const classes = (result) => result.rows.map((r) => `${r.id}:${r.class}`).join(' ');

test('classic Pareto split: the item crossing a cutoff belongs to the higher class', () => {
  // total 100; shares 50, 30, 10, 5, 3, 2 -> cumulative before: 0, 50, 80, 90, 95, 98
  const r = abcAnalysis(items(50, 30, 10, 5, 3, 2));
  assert.equal(classes(r), 'i1:A i2:A i3:B i4:B i5:C i6:C');
  assert.deepEqual(
    r.rows.map((x) => x.cumulativeBps),
    [5000n, 8000n, 9000n, 9500n, 9800n, 10000n],
  );
  assert.deepEqual(r.classes.A, { count: 2, total: 80n, shareBps: 8000n });
  assert.deepEqual(r.classes.B, { count: 2, total: 15n, shareBps: 1500n });
  assert.equal(r.classes.C.count, 2);
  assert.equal(r.total, 100n);
});

test('input order does not matter and ranks are by descending value', () => {
  const r = abcAnalysis([
    { id: 'small', value: 1n },
    { id: 'huge', value: 1000n },
    { id: 'mid', value: 50n },
  ]);
  assert.deepEqual(
    r.rows.map((x) => x.id),
    ['huge', 'mid', 'small'],
  );
  assert.deepEqual(
    r.rows.map((x) => x.rank),
    [1, 2, 3],
  );
  assert.equal(r.rows[0].class, 'A');
  assert.equal(r.rows[2].class, 'C');
});

test('tie policy and tie grouping are explicit', () => {
  const list = [
    { id: 'z', value: 25 },
    { id: 'a', value: 25 },
    { id: 'm', value: 25 },
    { id: 'big', value: 25 },
  ];
  assert.deepEqual(
    abcAnalysis(list).rows.map((x) => x.id),
    ['z', 'a', 'm', 'big'],
  );
  assert.deepEqual(
    abcAnalysis(list, { ties: 'id' }).rows.map((x) => x.id),
    ['a', 'big', 'm', 'z'],
  );
  // all equal: grouped means they share the class of the group start (A); ungrouped splits them
  assert.equal(classes(abcAnalysis(list, { ties: 'id' })), 'a:A big:A m:A z:A');
  assert.equal(
    classes(abcAnalysis(list, { ties: 'id', groupTies: false, cutoffsBps: { a: 5000, b: 7500 } })),
    'a:A big:A m:B z:C',
  );
  assert.equal(
    classes(abcAnalysis(list, { ties: 'id', cutoffsBps: { a: 5000, b: 7500 } })),
    'a:A big:A m:A z:A',
  );
});

test('zero and negative values follow the chosen policy', () => {
  const list = items(100, 0, -20, 50);
  assert.throws(
    () => abcAnalysis(list),
    (e) => e instanceof AbcError && e.code === 'negative-value',
  );
  const zero = abcAnalysis(list, { negative: 'zero' });
  assert.equal(zero.total, 150n);
  assert.equal(zero.rows.find((x) => x.id === 'i3').value, -20n);
  assert.equal(zero.rows.find((x) => x.id === 'i3').counted, 0n);
  assert.equal(zero.rows.find((x) => x.id === 'i3').class, 'C');
  assert.equal(zero.rows.find((x) => x.id === 'i2').class, 'C');
  const exclude = abcAnalysis(list, { negative: 'exclude' });
  assert.deepEqual(exclude.excluded, ['i3']);
  assert.equal(exclude.rows.length, 3);
  const all0 = abcAnalysis(items(0, 0));
  assert.equal(all0.total, 0n);
  assert.deepEqual(
    all0.rows.map((x) => [x.class, x.cumulativeBps, x.shareBps]),
    [
      ['C', 0n, 0n],
      ['C', 0n, 0n],
    ],
  );
  assert.deepEqual(abcAnalysis([]).rows, []);
});

test('custom cutoffs and boundaries are exact integer comparisons', () => {
  // before-shares 0, 70, 90: cutoff a=7000 means before 7000 is NOT < 7000 -> B
  const r = abcAnalysis(items(70, 20, 10), { cutoffsBps: { a: 7000, b: 9000 } });
  assert.equal(classes(r), 'i1:A i2:B i3:C');
  const finest = abcAnalysis(items(1, 1_000_000_000_000_000_000_000n), {
    cutoffsBps: { a: 9999, b: 10000 },
  });
  assert.equal(finest.rows[0].class, 'A');
  assert.equal(finest.rows[1].class, 'B'); // share before is 9999.99.. bps: not below 9999, below 10000
});

test('invalid options and items are rejected', () => {
  for (const options of [
    { cutoffsBps: { a: 0, b: 50 } },
    { cutoffsBps: { a: 50, b: 50 } },
    { cutoffsBps: { a: 50, b: 10001 } },
    { cutoffsBps: { a: 50.5, b: 80 } },
    { ties: 'random' },
    { negative: 'ignore' },
  ]) {
    assert.throws(() => abcAnalysis(items(1, 2), options), AbcError, JSON.stringify(options));
  }
  for (const bad of [
    [{ id: '', value: 1 }],
    [
      { id: 'a', value: 1 },
      { id: 'a', value: 2 },
    ],
    [{ id: 'a', value: 1.5 }],
    [{ id: 'a', value: NaN }],
    [{ id: 'a', value: '5' }],
    [null],
    'items',
  ]) {
    assert.throws(() => abcAnalysis(bad), AbcError);
  }
});

test('large values stay exact and CJS agrees; shares add up', () => {
  const big = abcAnalysis([
    { id: 'a', value: 10n ** 40n },
    { id: 'b', value: 3n },
  ]);
  assert.equal(big.rows[0].class, 'A');
  assert.equal(big.classes.A.total + big.classes.B.total + big.classes.C.total, big.total);
  const many = abcAnalysis(
    Array.from({ length: 500 }, (_, i) => ({ id: `k${i}`, value: 1000 - i * 2 })),
  );
  assert.equal(many.classes.A.count + many.classes.B.count + many.classes.C.count, 500);
  assert.ok(many.classes.A.shareBps >= 8000n && many.classes.A.shareBps < 8500n);
  assert.equal(
    createRequire(import.meta.url)('@lp-labs/abc-analysis').abcAnalysis(items(5)).rows[0].class,
    'A',
  );
});
