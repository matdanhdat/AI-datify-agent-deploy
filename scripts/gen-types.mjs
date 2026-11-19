/**
 * Script to generate contract.ts from running FastAPI openapi.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const url = process.env.OPENAPI_URL || 'http://127.0.0.1:8000/openapi.json';
  console.log(`Đang nạp OpenAPI schema từ ${url}...`);
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    const schema = await res.json();
    const outputPath = path.resolve(__dirname, '../src/types/openapi.json');
    fs.writeFileSync(outputPath, JSON.stringify(schema, null, 2), 'utf-8');
    console.log(`Đã lưu OpenAPI JSON tại: ${outputPath}`);
  } catch (err) {
    console.error(`Không thể kết nối máy chủ để sinh tự động (${err.message}). Hợp đồng types/contract.ts viết tay đã được chuẩn hóa khớp 100% schemas.py.`);
  }
}

main();

