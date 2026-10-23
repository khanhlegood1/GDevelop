import type { JobRecord, QuotaReservationRecord } from "./types";

/**
 * Targeted guardrail queries (P05-R1.6).
 *
 * These access paths deliberately bypass the identity-map load-all: the
 * PostgreSQL Unit of Work binds this port to targeted SQL on the transaction
 * executor (window sums, conditional reservation inserts and fingerprint
 * lookups run as single statements against indexed columns), while the memory
 * adapter binds it to a transactional map. Same-transaction visibility holds
 * in both bindings: PostgreSQL statements see their own earlier writes in the
 * transaction, and the memory map is cloned per Unit of Work.
 *
 * Quota semantics (R1.6 decision):
 * - Windows are fixed buckets: UTC hour for `search_per_hour`, UTC day for
 *   `*_per_day` keys. Fixed windows keep distributed enforcement exact under
 *   the serializable Unit of Work.
 * - Active units in a window = `reservedUnits - refundedUnits`.
 * - `mode: "consume"` records usage immediately (count quotas); `mode:
 *   "reserve"` holds budget until `settleQuotaReservation`/`refundQuotaReservation`
 *   (AI cost budgets).
 */
export interface QuotaReserveInput {
  userId: string;
  quotaKey: string;
  windowStart: string;
  windowEnd: string;
  units: number;
  limit: number;
  mode: "consume" | "reserve";
  jobId?: string | null;
  createdAt: string;
}

export interface QuotaReserveResult {
  reserved: boolean;
  usedUnitsBefore: number;
  usedUnitsAfter: number;
  limit: number;
  reservationId: string | null;
}

export interface QuotaWindowInput {
  userId: string;
  quotaKey: string;
  windowStart: string;
  windowEnd: string;
}

export interface QuotaSettleInput {
  reservationId: string;
  /** Units actually consumed; the remainder is refunded on settle. */
  consumedUnits: number;
  at: string;
}

export interface QuotaRefundInput {
  reservationId: string;
  refundedUnits: number;
  at: string;
}

export interface JobFingerprintInput {
  userId: string;
  jobType: string;
  fingerprint: string;
  statuses: readonly string[];
}

export interface TargetedQueriesPort {
  reserveQuotaUnits(input: QuotaReserveInput): Promise<QuotaReserveResult>;
  settleQuotaReservation(input: QuotaSettleInput): Promise<QuotaReservationRecord | null>;
  refundQuotaReservation(input: QuotaRefundInput): Promise<QuotaReservationRecord | null>;
  sumActiveQuotaUnits(input: QuotaWindowInput): Promise<number>;
  findReservationsByJobId(jobId: string): Promise<QuotaReservationRecord[]>;
  findJobByInputFingerprint(input: JobFingerprintInput): Promise<JobRecord | null>;
}

/** Fixed UTC hour bucket: [HH:00, HH+1:00). */
export function utcHourWindow(at: Date): { windowStart: string; windowEnd: string } {
  const start = new Date(at.getTime());
  start.setUTCMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return { windowStart: start.toISOString(), windowEnd: end.toISOString() };
}

/** Fixed UTC day bucket: [00:00, +1d). */
export function utcDayWindow(at: Date): { windowStart: string; windowEnd: string } {
  const start = new Date(at.getTime());
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { windowStart: start.toISOString(), windowEnd: end.toISOString() };
}

export function activeQuotaUnits(record: QuotaReservationRecord): number {
  return record.reservedUnits - record.refundedUnits;
}

export function isQuotaWindowActive(record: QuotaReservationRecord): boolean {
  return record.status === "reserved" || record.status === "consumed" || record.status === "partially_refunded";
}
