/**
 * BusinessTable: Columnar typed-array representation for tabular business datasets (Prompt M1).
 * Supports dimensions, measures, time granularities (month/day), and row identifiers.
 * Designed for high-performance in-memory processing and zero-copy Worker transfer.
 */

export interface SheetInfo {
  name: string;
  rowCount: number;
  isHidden?: boolean;
  sameHeaderAsSelected?: boolean;
}

export interface BusinessTable {
  kind: 'business';
  n: number; // số dòng có nội dung (đã bỏ dòng trống hoàn toàn)
  source_row: Int32Array; // số dòng gốc trong file (1-based physical row)
  columns: BusinessColumn[]; // theo đúng thứ tự cột trong file (trừ cột bị bỏ qua)
  skipped_blank_rows?: number; // số dòng trống vật lý đã bỏ qua ở bước đọc tệp
  skipped_total_rows?: number; // số dòng tổng cộng đã loại bỏ ở bước nạp
  skipped_total_row_numbers?: number[]; // danh sách số dòng gốc (1-based) bị loại do là dòng tổng
  available_sheets?: SheetInfo[];
  selected_sheet?: string;
  raw_bytes?: Uint8Array;
  filename?: string;
  manual_column_roles?: Record<string, string>;
  cogs_exceeds_revenue_warning?: string;
}

export type ColumnRole = 'id' | 'time' | 'dimension' | 'measure' | 'ignored';

export type BusinessColumn =
  | {
      role: 'id';
      key: string;
      label: string;
      values: string[];
      userChosenRole?: string;
    }
  | {
      role: 'time';
      key: string;
      label: string;
      granularity: 'month' | 'day';
      values: Int32Array; // month: months since 1970-01; day: days since 1970-01-01 (UTC)
      raw_labels?: string[];
      userChosenRole?: string;
    }
  | {
      role: 'dimension';
      key: string;
      label: string;
      categories: string[];
      codes: Uint16Array; // index into categories (0xFFFF for blank/missing)
      raw_labels?: string[];
      userChosenRole?: string;
    }
  | {
      role: 'measure';
      key: string;
      label: string;
      unit?: string;
      values: Float64Array; // NaN for missing
      raw_values?: Float64Array; // Raw parsed values before unit scaling
      raw_strings?: string[]; // Original string cells from CSV/XLSX
      detectedUnit?: string;
      multiplier?: number;
      userUnit?: string;
      unitSource?: 'header' | 'mặc định' | 'người dùng xác nhận';
      unit_suspicious?: boolean;
      suspiciousReason?: string;
      ambiguous_separator?: boolean;
      sampleAmbiguous?: string;
      userDecimalConvention?: 'dot' | 'comma';
      initialDecimalConvention?: 'dot' | 'comma';
      userChosenRole?: string;
    }
  | {
      role: 'ignored';
      key: string;
      label: string;
      userChosenRole?: string;
      values?: any;
    };

export interface ColumnRoleMapping {
  file_header: string;
  key: string;
  role: ColumnRole;
  unit?: string;
  label?: string;
}
