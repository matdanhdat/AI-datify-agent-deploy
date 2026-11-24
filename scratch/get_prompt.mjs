import fs from 'fs';
import readline from 'readline';

async function findSections() {
  const fileStream = fs.createReadStream('C:/Users/ADMIN/.gemini/antigravity/brain/8e0499b6-534f-48ab-a416-6b5a26e6aacd/.system_generated/logs/transcript_full.jsonl');
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (line.includes('PROMPT 1U: CHỮ VÀ SỐ TRÊN GIAO DIỆN')) {
      const data = JSON.parse(line);
      const text = data.content;
      console.log('--- FOUND PROMPT ---');
      const matches = text.match(/PHẦN [A-Z]\..*/g);
      console.log('Sections:', matches);
      const lastSection = matches ? matches[matches.length - 1] : null;
      if (lastSection) {
        const idx = text.indexOf(lastSection);
        console.log(text.substring(idx));
      }
      break;
    }
  }
}
findSections();
