import { abcAnalysis, AbcError } from '@lp-labs/abc-analysis';

const total: bigint = abcAnalysis([{ id: 'a', value: 5 }]).total;
const code: string = new AbcError('negative-value', 'x').code;
void [total, code];
