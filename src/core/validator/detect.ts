/**
 * Stage S1: File gate detection.
 * Inspects filename, size, and binary magic bytes to strictly identify file format and detect corruption/zip bombs.
 * Uses `fflate` for lightweight, safe zip catalog reading without decompressing contents.
 */
import { unzipSync } from 'fflate';
import type { ValidationIssue } from '../schemas';
import { formatValidatorMessage } from './messagesVi';
import type { ValidatorLimits } from './schemaSpec';

export interface FileDetectionResult {
  ok: boolean;
  format?: 'xlsx' | 'csv';
  issue?: ValidationIssue;
}

const MAX_UNCOMPRESSED_ZIP_BYTES = 200 * 1024 * 1024; // 200 MB zip bomb safety limit

/**
 * Checks magic bytes against known binary signatures.
 */
function checkMagicBytes(bytes: Uint8Array): {
  isZip: boolean;
  isOle2: boolean;
  isPdf: boolean;
  isPng: boolean;
  isJpeg: boolean;
} {
  const isZip =
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07) &&
    (bytes[3] === 0x04 || bytes[3] === 0x06 || bytes[3] === 0x08);

  const isOle2 =
    bytes.length >= 8 &&
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0 &&
    bytes[4] === 0xa1 &&
    bytes[5] === 0xb1 &&
    bytes[6] === 0x1a &&
    bytes[7] === 0xe1;

  const isPdf =
    bytes.length >= 4 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46; // %PDF

  const isPng =
    bytes.length >= 4 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47; // \x89PNG

  const isJpeg =
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff;

  return { isZip, isOle2, isPdf, isPng, isJpeg };
}

/**
 * Stage S1: Validates file existence, size, extension, and content magic bytes.
 */
export function detectFileFormat(
  filename: string,
  bytes: Uint8Array,
  limits: ValidatorLimits
): FileDetectionResult {
  if (!filename || filename.trim() === '') {
    const msg = formatValidatorMessage('UPLOAD_NO_FILE');
    return {
      ok: false,
      issue: {
        code: 'UPLOAD_NO_FILE',
        severity: 'error',
        message_vi: msg.message_vi,
        fix_vi: msg.fix_vi,
      },
    };
  }

  // 1. Check empty file (0 bytes)
  if (!bytes || bytes.length === 0) {
    const msg = formatValidatorMessage('UPLOAD_EMPTY', { filename });
    return {
      ok: false,
      issue: {
        code: 'UPLOAD_EMPTY',
        severity: 'error',
        message_vi: msg.message_vi,
        fix_vi: msg.fix_vi,
      },
    };
  }

  // 2. Check maximum file size
  const maxBytes = limits.max_file_mb * 1024 * 1024;
  if (bytes.length > maxBytes) {
    const sizeMb = (bytes.length / (1024 * 1024)).toFixed(1);
    const msg = formatValidatorMessage('UPLOAD_TOO_LARGE', {
      size_mb: sizeMb,
      max_mb: limits.max_file_mb,
    });
    return {
      ok: false,
      issue: {
        code: 'UPLOAD_TOO_LARGE',
        severity: 'error',
        message_vi: msg.message_vi,
        fix_vi: msg.fix_vi,
      },
    };
  }

  const cleanName = filename.trim().toLowerCase();
  const lastDot = cleanName.lastIndexOf('.');
  const ext = lastDot !== -1 ? cleanName.slice(lastDot) : '';

  const magic = checkMagicBytes(bytes);

  // 3. Inspect non-supported extensions
  if (ext === '.xls') {
    const msg = formatValidatorMessage('UPLOAD_XLS_LEGACY', { filename });
    return {
      ok: false,
      issue: {
        code: 'UPLOAD_XLS_LEGACY',
        severity: 'error',
        message_vi: msg.message_vi,
        fix_vi: msg.fix_vi,
      },
    };
  }

  if (ext !== '.xlsx' && ext !== '.csv') {
    let kindDesc = 'định dạng không xác định';
    let kind: 'word' | 'pdf' | 'image' | 'archive' | 'unknown' = 'unknown';

    if (ext === '.docx' || ext === '.doc') {
      kindDesc = 'tệp tài liệu Word';
      kind = 'word';
    } else if (ext === '.pdf') {
      kindDesc = 'tệp tài liệu PDF';
      kind = 'pdf';
    } else if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) {
      kindDesc = 'tệp hình ảnh';
      kind = 'image';
    } else if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext)) {
      kindDesc = 'tệp nén lưu trữ';
      kind = 'archive';
    }

    const msg = formatValidatorMessage('UPLOAD_EXTENSION_UNSUPPORTED', {
      filename,
      kind_desc: kindDesc,
    });
    return {
      ok: false,
      issue: {
        code: 'UPLOAD_EXTENSION_UNSUPPORTED',
        severity: 'error',
        message_vi: msg.message_vi,
        fix_vi: msg.fix_vi,
        details: { kind },
      },
    };
  }

  // 4. Handle .xlsx files
  if (ext === '.xlsx') {
    // Check if it's OLE2 (encrypted xlsx or old .xls renamed)
    if (magic.isOle2) {
      const msg = formatValidatorMessage('UPLOAD_PASSWORD_PROTECTED', { filename });
      return {
        ok: false,
        issue: {
          code: 'UPLOAD_PASSWORD_PROTECTED',
          severity: 'error',
          message_vi: msg.message_vi,
          fix_vi: msg.fix_vi,
        },
      };
    }

    // Check if it's PDF / Image renamed to .xlsx
    if (magic.isPdf) {
      const msg = formatValidatorMessage('UPLOAD_CONTENT_MISMATCH', {
        filename,
        actual_kind: 'tệp tài liệu PDF (.pdf)',
      });
      return {
        ok: false,
        issue: {
          code: 'UPLOAD_CONTENT_MISMATCH',
          severity: 'error',
          message_vi: msg.message_vi,
          fix_vi: msg.fix_vi,
        },
      };
    }

    if (magic.isPng || magic.isJpeg) {
      const msg = formatValidatorMessage('UPLOAD_CONTENT_MISMATCH', {
        filename,
        actual_kind: 'tệp hình ảnh (.png / .jpg)',
      });
      return {
        ok: false,
        issue: {
          code: 'UPLOAD_CONTENT_MISMATCH',
          severity: 'error',
          message_vi: msg.message_vi,
          fix_vi: msg.fix_vi,
        },
      };
    }

    // Must be a valid ZIP archive
    if (!magic.isZip) {
      const msg = formatValidatorMessage('UPLOAD_CORRUPT', {
        filename,
        detail: 'không phải tệp nén ZIP hợp lệ',
      });
      return {
        ok: false,
        issue: {
          code: 'UPLOAD_CORRUPT',
          severity: 'error',
          message_vi: msg.message_vi,
          fix_vi: msg.fix_vi,
        },
      };
    }

    // Inspect entries inside the zip using fflate without uncompressing
    const entryNames: string[] = [];
    let totalUncompressedSize = 0;

    try {
      unzipSync(bytes, {
        filter: (file) => {
          entryNames.push(file.name);
          totalUncompressedSize += file.originalSize || 0;
          return false; // Do not inflate data into memory
        },
      });
    } catch (_zipErr) {
      const msg = formatValidatorMessage('UPLOAD_CORRUPT', {
        filename,
        detail: 'tệp nén bị cắt cụt hoặc cấu trúc zip bị hỏng',
      });
      return {
        ok: false,
        issue: {
          code: 'UPLOAD_CORRUPT',
          severity: 'error',
          message_vi: msg.message_vi,
          fix_vi: msg.fix_vi,
        },
      };
    }

    // Zip bomb defense
    if (totalUncompressedSize > MAX_UNCOMPRESSED_ZIP_BYTES) {
      const msg = formatValidatorMessage('UPLOAD_CORRUPT', {
        filename,
        detail: `kích thước giải nén bất thường (> ${MAX_UNCOMPRESSED_ZIP_BYTES / (1024 * 1024)} MB), nghi ngờ tệp nén bom (zip bomb)`,
      });
      return {
        ok: false,
        issue: {
          code: 'UPLOAD_CORRUPT',
          severity: 'error',
          message_vi: msg.message_vi,
          fix_vi: msg.fix_vi,
          details: { reason: 'zip_bomb' },
        },
      };
    }

    // Check OpenXML workbook components
    const hasContentTypes = entryNames.some((n) => n === '[Content_Types].xml');
    const hasXlFolder = entryNames.some((n) => n.startsWith('xl/') || n === 'xl');
    const hasWordFolder = entryNames.some((n) => n.startsWith('word/'));

    if (hasWordFolder && !hasXlFolder) {
      const msg = formatValidatorMessage('UPLOAD_CONTENT_MISMATCH', {
        filename,
        actual_kind: 'tệp tài liệu Word (.docx)',
      });
      return {
        ok: false,
        issue: {
          code: 'UPLOAD_CONTENT_MISMATCH',
          severity: 'error',
          message_vi: msg.message_vi,
          fix_vi: msg.fix_vi,
        },
      };
    }

    if (!hasContentTypes || !hasXlFolder) {
      const msg = formatValidatorMessage('UPLOAD_CONTENT_MISMATCH', {
        filename,
        actual_kind: 'tệp nén ZIP thông thường',
      });
      return {
        ok: false,
        issue: {
          code: 'UPLOAD_CONTENT_MISMATCH',
          severity: 'error',
          message_vi: msg.message_vi,
          fix_vi: msg.fix_vi,
        },
      };
    }

    return { ok: true, format: 'xlsx' };
  }

  // 5. Handle .csv files
  if (ext === '.csv') {
    if (magic.isZip || magic.isOle2 || magic.isPdf || magic.isPng || magic.isJpeg) {
      let actualKind = 'tệp nhị phân không phải văn bản';
      if (magic.isZip) actualKind = 'tệp nén ZIP (.zip)';
      if (magic.isOle2) actualKind = 'tệp nhị phân OLE2';
      if (magic.isPdf) actualKind = 'tệp tài liệu PDF (.pdf)';
      if (magic.isPng || magic.isJpeg) actualKind = 'tệp hình ảnh (.png / .jpg)';

      const msg = formatValidatorMessage('UPLOAD_CONTENT_MISMATCH', {
        filename,
        actual_kind: actualKind,
      });
      return {
        ok: false,
        issue: {
          code: 'UPLOAD_CONTENT_MISMATCH',
          severity: 'error',
          message_vi: msg.message_vi,
          fix_vi: msg.fix_vi,
        },
      };
    }

    return { ok: true, format: 'csv' };
  }

  return { ok: true };
}

