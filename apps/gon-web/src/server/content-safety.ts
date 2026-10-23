import type { ArtifactKind } from "./types";

/**
 * Deterministic content-safety scanner (P05-R1.8, P03 §8): never executes
 * uploaded bytes, rejects executable/archive/malware signatures even when the
 * declared MIME type lies, and fails closed for unknown payloads that match a
 * dangerous signature. Remote malware-scanner integration can implement the
 * same port later; `needs_review` is reserved for that escalation path.
 */
export interface ContentSafetyVerdict {
  status: "allowed" | "blocked" | "needs_review";
  reasonCodes: string[];
}

export interface ContentSafetyScanInput {
  kind: ArtifactKind;
  bytes: Buffer | null;
  sourceText: string | null;
  originUri: string | null;
}

export interface ContentSafetyScanner {
  scan(input: ContentSafetyScanInput): ContentSafetyVerdict;
}

const EXECUTABLE_SIGNATURES: Array<{ code: string; bytes: Buffer }> = [
  { code: "SAFETY_PE_EXECUTABLE", bytes: Buffer.from("MZ") },
  { code: "SAFETY_ELF_EXECUTABLE", bytes: Buffer.from([0x7f, 0x45, 0x4c, 0x46]) },
  { code: "SAFETY_MACHO_EXECUTABLE", bytes: Buffer.from([0xca, 0xfe, 0xba, 0xbe]) },
  { code: "SAFETY_MACHO_EXECUTABLE", bytes: Buffer.from([0xcf, 0xfa, 0xed, 0xfe]) },
  { code: "SAFETY_MACHO_EXECUTABLE", bytes: Buffer.from([0xfe, 0xed, 0xfa, 0xce]) },
  { code: "SAFETY_ARCHIVE", bytes: Buffer.from([0x50, 0x4b, 0x03, 0x04]) },
  { code: "SAFETY_ARCHIVE", bytes: Buffer.from("Rar!") },
  { code: "SAFETY_ARCHIVE", bytes: Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]) },
  { code: "SAFETY_WASM_EXECUTABLE", bytes: Buffer.from([0x00, 0x61, 0x73, 0x6d]) },
];

const EICAR_SIGNATURE = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

function matchesSignature(bytes: Buffer, signature: Buffer): boolean {
  if (signature.length === 0 || bytes.length < signature.length) return false;
  return bytes.subarray(0, signature.length).equals(signature);
}

export class LocalContentSafetyScanner implements ContentSafetyScanner {
  scan(input: ContentSafetyScanInput): ContentSafetyVerdict {
    const reasonCodes: string[] = [];

    if (input.bytes && input.bytes.length > 0) {
      for (const signature of EXECUTABLE_SIGNATURES) {
        if (matchesSignature(input.bytes, signature.bytes)) {
          reasonCodes.push(signature.code);
          break;
        }
      }
      // Shebang scripts are executable content regardless of declared type.
      if (input.bytes.subarray(0, 2).toString("latin1") === "#!") {
        reasonCodes.push("SAFETY_SCRIPT_EXECUTABLE");
      }
      if (input.bytes.toString("latin1").includes(EICAR_SIGNATURE)) {
        reasonCodes.push("SAFETY_MALWARE_SIGNATURE");
      }
    }

    if (input.sourceText && input.sourceText.includes(EICAR_SIGNATURE)) {
      reasonCodes.push("SAFETY_MALWARE_SIGNATURE");
    }

    if (reasonCodes.length > 0) {
      return { status: "blocked", reasonCodes };
    }
    return { status: "allowed", reasonCodes: [] };
  }
}

export const defaultContentSafetyScanner: ContentSafetyScanner = new LocalContentSafetyScanner();
