import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateBytes } from '../src/core/validator/index.ts';
import { runBusinessCleanPipeline } from '../src/core/cleaner/businessCleaner.ts';
import { computeSelected } from '../src/core/metrics/businessComputeSelected.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const filePath = path.join(rootDir, 'samples', 'business', 'du-lieu-test-ban-le.csv');

const bytes = new Uint8Array(fs.readFileSync(filePath));
const val = await validateBytes('du-lieu-test-ban-le.csv', bytes);
const clean = runBusinessCleanPipeline(val.businessTable);
const res = computeSelected(clean.cleanTable, ['channel_product_matrix']);
console.log('Matrix Answer:', res.metrics.channel_product_matrix.answerText);
