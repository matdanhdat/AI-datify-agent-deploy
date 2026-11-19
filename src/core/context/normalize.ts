/**
 * Context normalization and validation module (Prompt D3).
 * Pure TypeScript, zero external dependencies, 100% deterministic canonical hashing.
 */

import type { BusinessContext } from '../schemas';

export interface NormalizeContextResult {
  ok: boolean;
  data?: BusinessContext;
  hash?: string;
  error?: string;
}

/**
 * Standard synchronous SHA-256 implementation (FIPS 180-2).
 * Works identically across Node.js, Web Workers, and all Browser environments.
 */
export function sha256Sync(asciiOrUtf8: string): string {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }

  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let i: number, j: number;
  let result = '';

  const words: number[] = [];

  // Initial hash values: first 32 bits of the fractional parts of the square roots of the first 8 primes
  let hash: number[] = [];
  // Round constants: first 32 bits of the fractional parts of the cube roots of the first 64 primes
  const k: number[] = [];
  let primeCounter = 0;

  const isComposite: Record<number, boolean> = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) {
        isComposite[i] = true;
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }

  hash = hash.slice(0, 8);

  const utf8Bytes: number[] = [];
  for (i = 0; i < asciiOrUtf8.length; i++) {
    let charcode = asciiOrUtf8.charCodeAt(i);
    if (charcode < 0x80) utf8Bytes.push(charcode);
    else if (charcode < 0x800) {
      utf8Bytes.push(0xc0 | (charcode >> 6), 0x80 | (charcode & 0x3f));
    } else if (charcode < 0xd800 || charcode >= 0xe000) {
      utf8Bytes.push(0xe0 | (charcode >> 12), 0x80 | ((charcode >> 6) & 0x3f), 0x80 | (charcode & 0x3f));
    } else {
      // surrogate pair
      i++;
      charcode = 0x10000 + (((charcode & 0x3ff) << 10) | (asciiOrUtf8.charCodeAt(i) & 0x3ff));
      utf8Bytes.push(
        0xf0 | (charcode >> 18),
        0x80 | ((charcode >> 12) & 0x3f),
        0x80 | ((charcode >> 6) & 0x3f),
        0x80 | (charcode & 0x3f)
      );
    }
  }

  const byteLength = utf8Bytes.length;
  const bitLength = byteLength * 8;

  for (i = 0; i < byteLength; i++) {
    words[i >> 2] |= utf8Bytes[i] << ((3 - (i % 4)) * 8);
  }
  words[byteLength >> 2] |= 0x80 << ((3 - (byteLength % 4)) * 8);
  words[(((byteLength + 8) >> 6) << 4) + 15] = bitLength;

  const w: number[] = [];
  for (i = 0; i < words.length; i += 16) {
    let a = hash[0],
      b = hash[1],
      c = hash[2],
      d = hash[3],
      e = hash[4],
      f = hash[5],
      g = hash[6],
      h = hash[7];

    for (j = 0; j < 64; j++) {
      if (j < 16) w[j] = words[i + j] | 0;
      else {
        const s0 = rightRotate(w[j - 15], 7) ^ rightRotate(w[j - 15], 18) ^ (w[j - 15] >>> 3);
        const s1 = rightRotate(w[j - 2], 17) ^ rightRotate(w[j - 2], 19) ^ (w[j - 2] >>> 10);
        w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
      }

      const s1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + k[j] + w[j]) | 0;
      const s0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    hash[0] = (hash[0] + a) | 0;
    hash[1] = (hash[1] + b) | 0;
    hash[2] = (hash[2] + c) | 0;
    hash[3] = (hash[3] + d) | 0;
    hash[4] = (hash[4] + e) | 0;
    hash[5] = (hash[5] + f) | 0;
    hash[6] = (hash[6] + g) | 0;
    hash[7] = (hash[7] + h) | 0;
  }

  for (i = 0; i < 8; i++) {
    for (j = 3; j >= 0; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }

  return result;
}

/**
 * Computes canonical SHA-256 hash for BusinessContext object.
 * Keys are strictly sorted: analysis_questions, company_name, extra_info, role.
 */
export function computeContextHash(ctx: BusinessContext): string {
  const canonical = {
    analysis_questions: ctx.analysis_questions,
    company_name: ctx.company_name || '',
    extra_info: ctx.extra_info || '',
    role: ctx.role || '',
  };
  return sha256Sync(JSON.stringify(canonical));
}

/**
 * Sanitizes and validates business context and user questions.
 */
export function normalizeContext(input: unknown): NormalizeContextResult {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Dữ liệu bối cảnh không hợp lệ.' };
  }

  const raw = input as Record<string, unknown>;

  const cleanStr = (val: unknown): string => {
    if (typeof val !== 'string') return '';
    return val
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/[\x00-\x1F\x7F]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const company_name = cleanStr(raw.company_name);
  if (company_name.length > 80) {
    return { ok: false, error: 'Tên doanh nghiệp tối đa 80 ký tự.' };
  }

  const role = cleanStr(raw.role);
  if (role.length > 60) {
    return { ok: false, error: 'Chức vụ tối đa 60 ký tự.' };
  }

  const extra_info = cleanStr(raw.extra_info);
  if (extra_info.length > 2000) {
    return { ok: false, error: 'Thông tin bổ sung tối đa 2.000 ký tự.' };
  }

  let rawQuestions: string[] = [];
  if (Array.isArray(raw.analysis_questions)) {
    rawQuestions = raw.analysis_questions.map(String);
  } else if (typeof raw.analysis_questions === 'string') {
    rawQuestions = raw.analysis_questions.split('\n');
  }

  const cleanedQuestions: string[] = [];
  const seen = new Set<string>();

  for (const q of rawQuestions) {
    const cleaned = cleanStr(q);
    if (!cleaned) continue; // skip blank line
    const lower = cleaned.toLowerCase();
    if (seen.has(lower)) continue; // skip duplicate case-insensitively
    seen.add(lower);
    cleanedQuestions.push(cleaned);
  }

  if (cleanedQuestions.length === 0) {
    return { ok: false, error: 'Bạn cần nhập ít nhất một yêu cầu phân tích.' };
  }

  if (cleanedQuestions.length > 8) {
    return { ok: false, error: `Tối đa 8 câu hỏi, hiện có ${cleanedQuestions.length}.` };
  }

  for (let i = 0; i < cleanedQuestions.length; i++) {
    const q = cleanedQuestions[i];
    if (q.length < 5) {
      return { ok: false, error: `Câu thứ ${i + 1} quá ngắn (cần ít nhất 5 ký tự).` };
    }
    if (q.length > 200) {
      return { ok: false, error: `Câu thứ ${i + 1} quá dài (tối đa 200 ký tự).` };
    }
  }

  const data: BusinessContext = {
    company_name: company_name || undefined,
    role: role || undefined,
    extra_info: extra_info || undefined,
    analysis_questions: cleanedQuestions,
  };

  const hash = computeContextHash(data);

  return {
    ok: true,
    data,
    hash,
  };
}
