import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('P7 Launcher Scripts Quality & Standards Tests (A6)', () => {
  const root = path.resolve(__dirname, '..');

  it('start.bat contains strictly ASCII bytes (0x20..0x7E, 0x0D, 0x0A, 0x09) and CRLF line endings', () => {
    const batPath = path.join(root, 'start.bat');
    expect(fs.existsSync(batPath)).toBe(true);

    const buf = fs.readFileSync(batPath);
    let nonAscii = 0;
    for (let i = 0; i < buf.length; i++) {
      const b = buf[i];
      if ((b < 0x20 && b !== 10 && b !== 13 && b !== 9) || b > 0x7E) {
        nonAscii++;
      }
    }
    expect(nonAscii).toBe(0);

    const raw = buf.toString('binary');
    const bareLf = (raw.match(/[^\r]\n/g) || []).length;
    expect(bareLf).toBe(0);
    expect(raw.includes('\r\n')).toBe(true);
  });

  it('start.sh contains purely LF line endings with zero CRLF for Unix compatibility', () => {
    const shPath = path.join(root, 'start.sh');
    expect(fs.existsSync(shPath)).toBe(true);

    const buf = fs.readFileSync(shPath);
    const raw = buf.toString('binary');
    const crlf = (raw.match(/\r\n/g) || []).length;
    expect(crlf).toBe(0);
  });

  it('.gitattributes enforces CRLF for .bat/.cmd and LF for .sh', () => {
    const gitAttrPath = path.join(root, '.gitattributes');
    expect(fs.existsSync(gitAttrPath)).toBe(true);

    const text = fs.readFileSync(gitAttrPath, 'utf-8');
    expect(text).toContain('*.bat text eol=crlf');
    expect(text).toContain('*.cmd text eol=crlf');
    expect(text).toContain('*.sh text eol=lf');
  });
});

