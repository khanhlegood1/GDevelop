import { validationError, type ValidationIssue } from "./errors";

export type JsonRecord = Record<string, unknown>;

export function ensureRecord(value: unknown, field = "body"): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw validationError("Nội dung yêu cầu phải là một đối tượng JSON.", [
      { field, code: "expected_object", message: "Phải là đối tượng JSON." },
    ]);
  }
  return value as JsonRecord;
}

export function requiredString(
  record: JsonRecord,
  field: string,
  options: { minLength?: number; maxLength?: number; trim?: boolean } = {},
): string {
  const raw = record[field];
  const value = typeof raw === "string" ? (options.trim === false ? raw : raw.trim()) : "";
  const minLength = options.minLength ?? 1;
  const maxLength = options.maxLength ?? 100_000;
  if (typeof raw !== "string" || value.length < minLength || value.length > maxLength) {
    throw validationError(`Trường ${field} chưa hợp lệ.`, [
      {
        field,
        code: "invalid_string",
        message: `Cần từ ${minLength} đến ${maxLength} ký tự.`,
      },
    ]);
  }
  return value;
}

export function optionalString(
  record: JsonRecord,
  field: string,
  options: { maxLength?: number; defaultValue?: string } = {},
): string | undefined {
  const raw = record[field];
  if (raw === undefined || raw === null) return options.defaultValue;
  if (typeof raw !== "string" || raw.length > (options.maxLength ?? 100_000)) {
    throw validationError(`Trường ${field} chưa hợp lệ.`, [
      { field, code: "invalid_string", message: "Giá trị văn bản vượt giới hạn hoặc sai kiểu." },
    ]);
  }
  const value = raw.trim();
  return value.length > 0 ? value : options.defaultValue;
}

export function requiredEnum<T extends string>(record: JsonRecord, field: string, allowed: readonly T[]): T {
  const value = record[field];
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw validationError(`Trường ${field} không thuộc danh sách cho phép.`, [
      { field, code: "invalid_enum", message: `Giá trị hợp lệ: ${allowed.join(", ")}.` },
    ]);
  }
  return value as T;
}

export function optionalEnum<T extends string>(
  record: JsonRecord,
  field: string,
  allowed: readonly T[],
  defaultValue: T,
): T {
  if (record[field] === undefined || record[field] === null) return defaultValue;
  return requiredEnum(record, field, allowed);
}

export function optionalInteger(
  record: JsonRecord,
  field: string,
  options: { min: number; max: number; defaultValue: number },
): number {
  const value = record[field];
  if (value === undefined || value === null) return options.defaultValue;
  if (!Number.isInteger(value) || (value as number) < options.min || (value as number) > options.max) {
    throw validationError(`Trường ${field} phải là số nguyên trong khoảng cho phép.`, [
      { field, code: "invalid_integer", message: `Khoảng ${options.min}–${options.max}.` },
    ]);
  }
  return value as number;
}

export function requiredBooleanTrue(record: JsonRecord, field: string): true {
  if (record[field] !== true) {
    throw validationError(`Trường ${field} phải được xác nhận.`, [
      { field, code: "must_be_true", message: "Giá trị phải là true." },
    ]);
  }
  return true;
}

export function stringArray(
  record: JsonRecord,
  field: string,
  options: { required?: boolean; maxItems?: number; maxLengthEach?: number } = {},
): string[] {
  const value = record[field];
  if (value === undefined || value === null) {
    if (options.required) {
      throw validationError(`Trường ${field} là bắt buộc.`, [
        { field, code: "required", message: "Cần cung cấp một danh sách." },
      ]);
    }
    return [];
  }
  if (!Array.isArray(value) || value.length > (options.maxItems ?? 100)) {
    throw validationError(`Trường ${field} chưa hợp lệ.`, [
      { field, code: "invalid_array", message: "Danh sách vượt giới hạn hoặc sai kiểu." },
    ]);
  }
  return value.map((item) => {
    if (typeof item !== "string" || item.trim().length === 0 || item.length > (options.maxLengthEach ?? 512)) {
      throw validationError(`Một phần tử trong ${field} chưa hợp lệ.`, [
        { field, code: "invalid_array_item", message: "Mỗi phần tử phải là chuỗi không rỗng." },
      ]);
    }
    return item.trim();
  });
}

export function optionalRecord(record: JsonRecord, field: string): JsonRecord {
  const value = record[field];
  if (value === undefined || value === null) return {};
  return ensureRecord(value, field);
}

export function paginationFromSearchParams(searchParams: URLSearchParams): { limit: number; cursor?: string } {
  const rawLimit = Number(searchParams.get("limit") ?? 20);
  const issues: ValidationIssue[] = [];
  if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 100) {
    issues.push({ field: "limit", code: "invalid_integer", message: "limit phải từ 1 đến 100." });
  }
  if (issues.length > 0) throw validationError("Tham số phân trang chưa hợp lệ.", issues);
  return { limit: rawLimit, cursor: searchParams.get("cursor") ?? undefined };
}
