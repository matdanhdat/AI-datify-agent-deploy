const fs = require('fs');
const readline = require('readline');

async function findC3() {
  const fileStream = fs.createReadStream('C:/Users/ADMIN/.gemini/antigravity/brain/8e0499b6-534f-48ab-a416-6b5a26e6aacd/.system_generated/logs/transcript_full.jsonl');
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (line.includes('PROMPT 1U: CHỮ VÀ SỐ TRÊN GIAO DIỆN')) {
      const data = JSON.parse(line);
      const text = data.content;
      console.log('--- FOUND PROMPT ---');
      const idx = text.indexOf('C3.');
      if (idx !== -1) {
        console.log(text.substring(idx, idx + 4000));
      }
      const idxT = text.indexOf('T2');
      if (idxT !== -1) {
        console.log('--- T2 SECTION ---');
        console.log(text.substring(idxT, idxT + 3000));
      }
      break;
    }
  }
}
findC3();
