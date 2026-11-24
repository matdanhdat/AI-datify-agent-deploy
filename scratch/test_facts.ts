
import { buildBusinessFactsTable } from './src/core/narrative/factsBuilder';
import { readBusinessCsv } from './src/core/validator/readCsv';
import { cleanBusinessData } from './src/core/cleaner/businessCleaner';
import { analyzeBusinessData } from './src/core/metrics/businessAnalyzer';
import { computeSelected } from './src/core/metrics/businessComputeSelected';
import fs from 'fs';

const csv = fs.readFileSync('public/samples/business_sample.csv', 'utf-8');
const parsed = readBusinessCsv(csv);
const cleaned = cleanBusinessData(parsed.rows, parsed.columns);
const analyzed = analyzeBusinessData(cleaned.rows);
const factsTable = buildBusinessFactsTable(analyzed);
console.log('Facts count:', factsTable.facts.length);
factsTable.facts.slice(0, 15).forEach(f => console.log(f.id, f.category, f.label_vi, ':', f.display));
