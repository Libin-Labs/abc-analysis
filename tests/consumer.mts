import { abcAnalysis, type AbcClass, type AbcResult } from '@lp-labs/abc-analysis';

const result: AbcResult = abcAnalysis(
  [
    { id: 'x', value: 10n },
    { id: 'y', value: 1 },
  ],
  { ties: 'id', negative: 'zero' },
);
const first: AbcClass | undefined = result.rows[0]?.class;
void first;
