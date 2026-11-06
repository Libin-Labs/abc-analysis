export type AbcClass = 'A' | 'B' | 'C';
export type TiePolicy = 'input-order' | 'id';
export type NegativePolicy = 'reject' | 'zero' | 'exclude';

export interface AbcItem {
  readonly id: string;
  /** Annual usage value, revenue, or any non-negative weight, in integer units. */
  readonly value: bigint | number;
}

export interface AbcOptions {
  /** Cumulative-share cutoffs in basis points: A up to `a`, B up to `b`, rest C. Default 8000/9500. */
  readonly cutoffsBps?: { readonly a: number; readonly b: number };
  /** Order among equal values. Default `input-order` (stable). */
  readonly ties?: TiePolicy;
  /** When true (default) equal values always share one class, decided by the group's start. */
  readonly groupTies?: boolean;
  /** `reject` throws, `zero` counts negatives as 0, `exclude` drops them. Default `reject`. */
  readonly negative?: NegativePolicy;
}

export interface AbcRow {
  readonly id: string;
  readonly value: bigint;
  /** Value used in the analysis (0 for negatives under the `zero` policy). */
  readonly counted: bigint;
  readonly rank: number;
  readonly shareBps: bigint;
  /** Cumulative share including this item, rounded down. */
  readonly cumulativeBps: bigint;
  readonly class: AbcClass;
}

export interface AbcClassSummary {
  readonly count: number;
  readonly total: bigint;
  readonly shareBps: bigint;
}

export interface AbcResult {
  readonly total: bigint;
  readonly rows: readonly AbcRow[];
  readonly excluded: readonly string[];
  readonly classes: Readonly<Record<AbcClass, AbcClassSummary>>;
}

export type AbcErrorCode = 'invalid-input' | 'negative-value';

export class AbcError extends Error {
  readonly code: AbcErrorCode;
  constructor(code: AbcErrorCode, message: string) {
    super(message);
    this.name = 'AbcError';
    this.code = code;
  }
}

export const MAX_ITEMS = 100000;

function toBig(value: unknown, name: string): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
  throw new AbcError('invalid-input', `${name} must be a bigint or safe integer.`);
}

export function abcAnalysis(items: readonly AbcItem[], options: AbcOptions = {}): AbcResult {
  if (!Array.isArray(items) || items.length > MAX_ITEMS) {
    throw new AbcError('invalid-input', `items must be an array of at most ${MAX_ITEMS} entries.`);
  }
  const a = options.cutoffsBps?.a ?? 8000;
  const b = options.cutoffsBps?.b ?? 9500;
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || a >= b || b > 10000) {
    throw new AbcError('invalid-input', 'cutoffsBps must be integers with 1 <= a < b <= 10000.');
  }
  const ties = options.ties ?? 'input-order';
  const negative = options.negative ?? 'reject';
  if (ties !== 'input-order' && ties !== 'id')
    throw new AbcError('invalid-input', 'Unknown tie policy.');
  if (negative !== 'reject' && negative !== 'zero' && negative !== 'exclude') {
    throw new AbcError('invalid-input', 'Unknown negative policy.');
  }
  const group = options.groupTies ?? true;
  const seen = new Set<string>();
  const excluded: string[] = [];
  const entries: { id: string; value: bigint; counted: bigint; index: number }[] = [];
  items.forEach((item, index) => {
    if (typeof item?.id !== 'string' || item.id === '' || seen.has(item.id)) {
      throw new AbcError('invalid-input', 'Item ids must be unique non-empty strings.');
    }
    seen.add(item.id);
    const value = toBig(item.value, `${item.id}.value`);
    if (value < 0n) {
      if (negative === 'reject')
        throw new AbcError('negative-value', `${item.id} has a negative value.`);
      if (negative === 'exclude') {
        excluded.push(item.id);
        return;
      }
    }
    entries.push({ id: item.id, value, counted: value < 0n ? 0n : value, index });
  });
  entries.sort((x, y) => {
    if (x.counted !== y.counted) return x.counted > y.counted ? -1 : 1;
    if (ties === 'id' && x.id !== y.id) return x.id < y.id ? -1 : 1;
    return x.index - y.index;
  });
  const total = entries.reduce((sum, entry) => sum + entry.counted, 0n);
  const classify = (before: bigint, value: bigint): AbcClass => {
    if (value === 0n || total === 0n) return 'C';
    if (before * 10000n < BigInt(a) * total) return 'A';
    return before * 10000n < BigInt(b) * total ? 'B' : 'C';
  };
  const rows: AbcRow[] = [];
  let cumulative = 0n;
  let groupBefore = 0n;
  let groupValue: bigint | null = null;
  entries.forEach((entry, position) => {
    if (groupValue === null || entry.counted !== groupValue) {
      groupValue = entry.counted;
      groupBefore = cumulative;
    }
    const before = group ? groupBefore : cumulative;
    cumulative += entry.counted;
    rows.push(
      Object.freeze({
        id: entry.id,
        value: entry.value,
        counted: entry.counted,
        rank: position + 1,
        shareBps: total === 0n ? 0n : (entry.counted * 10000n) / total,
        cumulativeBps: total === 0n ? 0n : (cumulative * 10000n) / total,
        class: classify(before, entry.counted),
      }),
    );
  });
  const sums: Record<AbcClass, { count: number; total: bigint }> = {
    A: { count: 0, total: 0n },
    B: { count: 0, total: 0n },
    C: { count: 0, total: 0n },
  };
  for (const row of rows) {
    sums[row.class].count += 1;
    sums[row.class].total += row.counted;
  }
  const summary = (key: AbcClass): AbcClassSummary =>
    Object.freeze({
      count: sums[key].count,
      total: sums[key].total,
      shareBps: total === 0n ? 0n : (sums[key].total * 10000n) / total,
    });
  return Object.freeze({
    total,
    rows: Object.freeze(rows),
    excluded: Object.freeze(excluded),
    classes: Object.freeze({ A: summary('A'), B: summary('B'), C: summary('C') }),
  });
}
