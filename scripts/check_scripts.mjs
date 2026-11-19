import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const errors = [];

// 1. Check start.bat
const batPath = path.join(REPO_ROOT, 'start.bat');
if (!fs.existsSync(batPath)) {
  errors.push('Tệp start.bat không tồn tại.');
} else {
  const buf = fs.readFileSync(batPath);
  let nonAscii = 0;
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    if ((b < 0x20 && b !== 10 && b !== 13 && b !== 9) || b > 0x7E) {
      nonAscii++;
    }
  }
  if (nonAscii > 0) {
    errors.push(`start.bat chứa ${nonAscii} byte ngoài chuẩn ASCII (yêu cầu 100% ASCII).`);
  }

  const raw = buf.toString('binary');
  const bareLf = (raw.match(/[^\r]\n/g) || []).length;
  if (bareLf > 0) {
    errors.push(`start.bat chứa ${bareLf} dòng có đuôi LF trần (yêu cầu 100% CRLF).`);
  }
}

// 2. Check start.sh
const shPath = path.join(REPO_ROOT, 'start.sh');
if (!fs.existsSync(shPath)) {
  errors.push('Tệp start.sh không tồn tại.');
} else {
  const buf = fs.readFileSync(shPath);
  const raw = buf.toString('binary');
  const crlfCount = (raw.match(/\r\n/g) || []).length;
  if (crlfCount > 0) {
    errors.push(`start.sh chứa ${crlfCount} ký tự CRLF (yêu cầu 100% LF cho môi trường Unix).`);
  }
}

// 3. Check .gitattributes
const gitAttrPath = path.join(REPO_ROOT, '.gitattributes');
if (!fs.existsSync(gitAttrPath)) {
  errors.push('Tệp .gitattributes không tồn tại.');
} else {
  const text = fs.readFileSync(gitAttrPath, 'utf-8');
  if (!text.includes('*.bat text eol=crlf')) {
    errors.push('.gitattributes thiếu cấu hình: *.bat text eol=crlf');
  }
  if (!text.includes('*.cmd text eol=crlf')) {
    errors.push('.gitattributes thiếu cấu hình: *.cmd text eol=crlf');
  }
  if (!text.includes('*.sh text eol=lf')) {
    errors.push('.gitattributes thiếu cấu hình: *.sh text eol=lf');
  }
}

console.log('--- KIỂM TRA SCRIPT KHỞI ĐỘNG (CHECK SCRIPTS) ---');
if (errors.length === 0) {
  console.log('✓ start.bat: 100% ASCII và kết thúc dòng CRLF.');
  console.log('✓ start.sh: Kết thúc dòng LF chuẩn Unix.');
  console.log('✓ .gitattributes: Đầy đủ quy tắc chuẩn hóa dòng.');
  process.exit(0);
} else {
  for (const err of errors) {
    console.error(`✕ ${err}`);
  }
  process.exit(1);
}

