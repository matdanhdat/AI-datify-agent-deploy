import fs from 'node:fs';

const content = fs.readFileSync('samples/business/du-lieu-test-ban-le.csv', 'utf8');
const lines = content.split(/\r?\n/).filter(l => l.length > 0);
console.log('Total lines (including header):', lines.length);
console.log('Header:', lines[0]);

let blankRows = 0;
let paddedCells = 0;
let emptyDimensions = 0;
const idCounts = {};
const exactLines = {};

for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  exactLines[line] = (exactLines[line] || 0) + 1;
  const cells = line.split(',').map(c => {
    let raw = c;
    if (raw.startsWith('"') && raw.endsWith('"')) {
      raw = raw.slice(1, -1);
    }
    return raw;
  });

  if (cells.every(c => c.trim() === '')) {
    blankRows++;
    continue;
  }

  // Check padding
  cells.forEach((c, idx) => {
    if (c !== c.trim()) {
      paddedCells++;
      console.log(`Line ${i + 1} Col ${idx} padded: [${c}]`);
    }
  });

  // Check empty dimensions (col 3: Khu vuc, col 4: San pham)
  if (cells[3] === '') {
    emptyDimensions++;
    console.log(`Line ${i + 1} empty Khu vuc, ID: ${cells[0]}`);
  }
  if (cells[4] === '') {
    emptyDimensions++;
    console.log(`Line ${i + 1} empty San pham, ID: ${cells[0]}`);
  }

  const id = cells[0].trim();
  idCounts[id] = (idCounts[id] || 0) + 1;
}

console.log('--- SUMMARY ---');
console.log('Blank rows:', blankRows);
console.log('Content rows:', lines.length - 1 - blankRows);
console.log('Padded cells:', paddedCells);
console.log('Empty dimensions:', emptyDimensions);

const duplicateIds = Object.entries(idCounts).filter(([id, cnt]) => cnt > 1);
console.log('Duplicate IDs:', duplicateIds);

const exactDuplicates = Object.entries(exactLines).filter(([l, cnt]) => cnt > 1);
console.log('Exact duplicate lines count:', exactDuplicates.length);
