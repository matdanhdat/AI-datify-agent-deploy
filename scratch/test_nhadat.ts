import fs from 'node:fs';
import path from 'node:path';
import { validateBytes } from '../src/core/validator/index';

async function test() {
  const p = path.resolve('samples/business/nha-dat-ty-dong-cham-phay.csv');
  const b = fs.readFileSync(p);
  const res = await validateBytes('nha-dat-ty-dong-cham-phay.csv', new Uint8Array(b));
  console.log('validateBytes without options:', {
    ok: res.ok,
    errors: res.errors,
    warnings: res.warnings,
    metadata: res.metadata,
  });

  const res2 = await validateBytes('nha-dat-ty-dong-cham-phay.csv', new Uint8Array(b), { decimalConvention: 'comma' });
  console.log('validateBytes with decimalConvention=comma:', {
    ok: res2.ok,
    errors: res2.errors,
    warnings: res2.warnings,
  });
}

test();
