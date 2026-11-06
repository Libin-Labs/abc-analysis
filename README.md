# @lp-labs/abc-analysis

Deterministic ABC (Pareto) classification of items by value. Cumulative shares are computed with
`bigint` and exact integer comparisons; tie order, tie grouping, cutoffs, and the treatment of
negative and zero values are all explicit options.

## Install

```bash
npm install @lp-labs/abc-analysis
```

ES2022 ESM and CommonJS builds ship with TypeScript declarations. There are no runtime dependencies.

## Quickstart

```js
import { abcAnalysis } from '@lp-labs/abc-analysis';

const result = abcAnalysis([
  { id: 'bolts', value: 50 },
  { id: 'nuts', value: 30 },
  { id: 'washers', value: 10 },
  { id: 'clips', value: 5 },
  { id: 'tape', value: 3 },
  { id: 'labels', value: 2 },
]);
const summary = result.rows.map((row) => `${row.id}:${row.class}`).join(' ');
if (summary !== 'bolts:A nuts:A washers:B clips:B tape:C labels:C') throw new Error(summary);
console.log(result.classes.A);
```

## API

```ts
type AbcClass = 'A' | 'B' | 'C';
type TiePolicy = 'input-order' | 'id';
type NegativePolicy = 'reject' | 'zero' | 'exclude';
interface AbcItem {
  id: string;
  value: bigint | number;
}
interface AbcOptions {
  cutoffsBps?: { a: number; b: number };
  ties?: TiePolicy;
  groupTies?: boolean;
  negative?: NegativePolicy;
}
interface AbcRow {
  id: string;
  value: bigint;
  counted: bigint;
  rank: number;
  shareBps: bigint;
  cumulativeBps: bigint;
  class: AbcClass;
}
interface AbcClassSummary {
  count: number;
  total: bigint;
  shareBps: bigint;
}
interface AbcResult {
  total: bigint;
  rows: readonly AbcRow[];
  excluded: readonly string[];
  classes: Readonly<Record<AbcClass, AbcClassSummary>>;
}
type AbcErrorCode = 'invalid-input' | 'negative-value';
class AbcError extends Error {
  readonly code: AbcErrorCode;
}
const MAX_ITEMS: 100000;
function abcAnalysis(items: readonly AbcItem[], options?: AbcOptions): AbcResult;
```

### Rules

- Items are ranked by value, descending. Equal values keep input order (`ties: 'input-order'`, a stable
  sort) or sort by id in code-unit order (`ties: 'id'`).
- An item's class is decided by the cumulative share **before** it: `A` while that is below the
  `a` cutoff (default 80%), `B` while below `b` (default 95%), otherwise `C`. So the item whose
  value crosses a cutoff stays in the higher class, and a share exactly equal to a cutoff starts the
  next class. Comparisons are exact integers.
- With `groupTies` (default) all items of equal value use the cumulative share before the whole
  group, so equal items never land in different classes. Set it to `false` for strict item-by-item
  cutting.
- `negative: 'reject'` (default) throws; `'zero'` counts a negative as 0 (`counted`) while keeping the
  original `value`; `'exclude'` lists the id in `excluded` and removes it. Zero-valued items, and
  every item when the total is 0, are class `C`.
- `shareBps`, `cumulativeBps`, and class `shareBps` are floored basis points (10000 = 100%).

## Customization

Cutoffs are integers with `1 <= a < b <= 10000`. Values are whatever weight you choose (annual usage
cost, revenue, margin); no unit conversion happens.

## Errors

`AbcError`: bad cutoffs/policies, duplicate or empty ids, non-integer values, and negatives under the
default policy. At most 100,000 items.

## Performance

`O(n log n)` for the sort plus one linear pass.

## Honest scope

A classification method, not an inventory policy. Thresholds are conventions; XYZ analysis,
seasonality, and criticality are out of scope.

## Support

If this library is useful to you, consider supporting its maintenance with a [donation via PayPal](https://www.paypal.me/LibinPrasanth).

## Author

Created by [Libin Prasanth](https://www.linkedin.com/in/libinprasanth/). Connect on LinkedIn for updates and discussion.
