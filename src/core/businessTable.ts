/**
 * BusinessTable: Columnar typed-array representation for tabular business datasets (Prompt M1).
 * Supports dimensions, measures, time granularities (month/day), and row identifiers.
 * Designed for high-performance in-memory processing and zero-copy Worker transfer.
 */

export interface BusinessTable {
  kind: 'business';
  n: number; // số dòng có nội dung (đã bỏ dòng trống hoàn toàn)
  source_row: Int32Array; // số dòng gốc trong file (1-based physical row)
  columns: BusinessColumn[]; // theo đúng thứ tự cột trong file (trừ cột bị bỏ qua)
  skipped_blank_rows?: number; // số dòng trống vật lý đã bỏ qua ở bước đọc tệp
}

export type ColumnRole = 'id' | 'time' | 'dimension' | 'measure' | 'ignored';

export type BusinessColumn =
  | {
      role: 'id';
      key: string;
      label: string;
      values: string[];
    }
  | {
      role: 'time';
      key: string;
      label: string;
      granularity: 'month' | 'day';
      values: Int32Array; // month: months since 1970-01; day: days since 1970-01-01 (UTC)
      raw_labels?: string[];
    }
  | {
      role: 'dimension';
      key: string;
      label: string;
      categories: string[];
      codes: Uint16Array; // index into categories (0xFFFF for blank/missing)
      raw_labels?: string[];
    }
  | {
      role: 'measure';
      key: string;
      label: string;
      unit?: string;
      values: Float64Array; // NaN for missing
    };

export interface ColumnRoleMapping {
  file_header: string;
  key: string;
  role: ColumnRole;
  unit?: string;
  label?: string;
}
