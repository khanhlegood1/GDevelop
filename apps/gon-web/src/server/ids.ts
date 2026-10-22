import { randomBytes } from "node:crypto";

export type IdPrefix =
  | "usr"
  | "prj"
  | "art"
  | "srch"
  | "job"
  | "mod"
  | "modv"
  | "cset"
  | "cand"
  | "rank"
  | "arena"
  | "jrn"
  | "att"
  | "proof"
  | "rpt"
  | "evt"
  | "game"
  | "req"
  | "case"
  | "commit"
  | "xp"
  | "age"
  | "inv"
  | "data";

export function createId(prefix: IdPrefix): string {
  const timestamp = Date.now().toString(36).padStart(8, "0");
  const random = randomBytes(12).toString("base64url").replace(/[-_]/g, "x").slice(0, 16);
  return `${prefix}_${timestamp}${random}`;
}

export function createOpaqueToken(byteLength = 32): string {
  return randomBytes(byteLength).toString("base64url");
}
