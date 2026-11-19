/**
 * Single source of truth for column specifications, accepted names, and default limits.
 * Imported by both core validator and UI components ("Yêu cầu file" card).
 * Pure TypeScript - zero external runtime dependencies.
 */

export interface ColumnDefinition {
  key: string;
  label_vi: string;
  required: boolean;
  acceptedNames: string[];
  description_vi: string;
  example: string;
}

export interface ValidatorLimits {
  max_file_mb: number;
  max_rows: number;
  max_symbols: number;
  min_sessions: number;
  strict_mode: boolean;
}

export const DEFAULT_LIMITS: ValidatorLimits = {
  max_file_mb: 5,
  max_rows: 50000,
  max_symbols: 10,
  min_sessions: 30,
  strict_mode: true,
};

/**
 * Normalizes a column name for flexible comparison:
 * 1. Unicode NFC normalization
 * 2. Casefolding (lowercase)
 * 3. Stripping leading/trailing whitespace
 * 4. Condensing consecutive whitespaces to a single space
 * 5. Stripping Vietnamese diacritics (including đ/Đ -> d)
 */
export function normalizeColumnName(input: string): string {
  if (!input) return '';
  return input
    .normalize('NFC')
    .toLowerCase()
    .replace(/[đĐ]/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

export const REQUIRED_COLUMNS: ColumnDefinition[] = [
  {
    key: 'date',
    label_vi: 'Ngày',
    required: true,
    acceptedNames: ['Ngày', 'Date', 'Ngày giao dịch', 'Trading Date', 'Ngay', 'NgayGD'],
    description_vi: 'Ngày giao dịch (dd/mm/yyyy hoặc yyyy-mm-dd)',
    example: '14/11/2026',
  },
  {
    key: 'symbol',
    label_vi: 'Mã',
    required: true,
    acceptedNames: ['Mã', 'Symbol', 'Ticker', 'Mã CK', 'Ma', 'MaCK'],
    description_vi: 'Mã chứng khoán viết hoa (tối đa 12 ký tự)',
    example: 'TMA',
  },
  {
    key: 'open',
    label_vi: 'Giá mở',
    required: true,
    acceptedNames: ['Mở', 'Open', 'Giá mở', 'Giá mở cửa', 'Mo', 'GiaMo'],
    description_vi: 'Giá mở cửa phiên giao dịch (số dương)',
    example: '25.40',
  },
  {
    key: 'high',
    label_vi: 'Giá cao',
    required: true,
    acceptedNames: ['Cao', 'High', 'Giá cao', 'Giá cao nhất', 'GiaCao'],
    description_vi: 'Giá cao nhất phiên (>= Mở, Đóng, Thấp)',
    example: '26.10',
  },
  {
    key: 'low',
    label_vi: 'Giá thấp',
    required: true,
    acceptedNames: ['Thấp', 'Low', 'Giá thấp', 'Giá thấp nhất', 'Thap', 'GiaThap'],
    description_vi: 'Giá thấp nhất phiên (<= Mở, Đóng, Cao)',
    example: '25.20',
  },
  {
    key: 'close',
    label_vi: 'Giá đóng',
    required: true,
    acceptedNames: ['Đóng', 'Close', 'Giá đóng', 'Giá đóng cửa', 'Dong', 'GiaDong'],
    description_vi: 'Giá đóng cửa phiên giao dịch (số dương)',
    example: '25.80',
  },
  {
    key: 'volume',
    label_vi: 'Khối lượng',
    required: true,
    acceptedNames: ['Khối lượng', 'Volume', 'KL', 'KLGD', 'KhoiLuong', 'Khoi Luong', 'Vol'],
    description_vi: 'Tổng khối lượng khớp lệnh (số không âm)',
    example: '1500000',
  },
];

export const OPTIONAL_COLUMNS: ColumnDefinition[] = [
  {
    key: 'trade_value',
    label_vi: 'Giá trị GD',
    required: false,
    acceptedNames: ['Giá trị GD', 'Giá trị giao dịch', 'GiaTriGD', 'Trade Value'],
    description_vi: 'Tổng giá trị giao dịch trong phiên (VND)',
    example: '38700000000',
  },
  {
    key: 'sector',
    label_vi: 'Ngành',
    required: false,
    acceptedNames: ['Ngành', 'Sector', 'Industry'],
    description_vi: 'Nhóm ngành nghề kinh doanh của doanh nghiệp',
    example: 'Công nghệ',
  },
  {
    key: 'exchange',
    label_vi: 'Sàn',
    required: false,
    acceptedNames: ['Sàn', 'Exchange'],
    description_vi: 'Sàn niêm yết (HOSE, HNX, UPCOM)',
    example: 'HOSE',
  },
];

export const ALL_COLUMNS = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS];

/**
 * Pre-compiled map of normalized accepted names to column definitions.
 */
const ALIAS_MAP = new Map<string, ColumnDefinition>();
for (const col of ALL_COLUMNS) {
  for (const name of col.acceptedNames) {
    ALIAS_MAP.set(normalizeColumnName(name), col);
  }
}

/**
 * Resolves a raw header string to its internal ColumnDefinition, or null if unrecognized.
 */
export function matchColumn(rawName: string): ColumnDefinition | null {
  const norm = normalizeColumnName(rawName);
  return ALIAS_MAP.get(norm) || null;
}

