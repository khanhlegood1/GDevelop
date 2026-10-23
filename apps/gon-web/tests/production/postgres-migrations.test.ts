import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = path.resolve(import.meta.dirname, "../../db/migrations");
const migrationFiles = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort((a, b) => a.localeCompare(b));
const sql = migrationFiles
  .map((file) => readFileSync(path.join(migrationsDir, file), "utf8"))
  .join("\n")
  .toLowerCase()
  .replace(/\s+/g, " ");

describe("PostgreSQL migration contract (static, not executed)", () => {
  it("uses ordered unique SQL-first migration files", () => {
    expect(migrationFiles).toHaveLength(7);
    expect(new Set(migrationFiles.map((file) => file.slice(0, 4))).size).toBe(7);
    for (const file of migrationFiles) {
      expect(file).toMatch(/^\d{4}_[a-z0-9_]+\.sql$/i);
    }
  });

  it("keeps Auth.js tables separate from GON domain users", () => {
    for (const table of ["users", "accounts", "sessions", "verification_token", "gon_users", "identity_links"]) {
      expect(sql).toContain(`create table ${table} (`);
    }
    expect(sql).toContain('"provideraccountid"');
    expect(sql).toContain("primary key (provider, provider_subject)");
    expect(sql).toContain("method = 'self_attested_18_plus'");
  });

  it("locks the approved 768D embedding profile without mixing dimensions", () => {
    expect(sql).toContain("create extension if not exists vector");
    expect(sql).toContain("embedding vector(768) not null");
    expect(sql).toContain("dimensions integer not null check (dimensions = 768)");
    expect(sql).toContain("using hnsw (embedding vector_cosine_ops)");
    expect(sql).toContain("primary key (chunk_id, embedding_profile)");
  });

  it("protects core transactional invariants in the schema", () => {
    expect(sql).toContain("content_chunks_active_source_ordinal_unique_idx");
    expect(sql).toContain("async_jobs_active_fingerprint_unique_idx");
    expect(sql).toContain("learning_attempts_one_draft_per_node_idx");
    expect(sql).toContain("xp_ledger_user_sequence_unique");
    expect(sql).toContain("formula_version = 'gon-level-v1'");
    expect(sql).toContain("graph_schema_version = 'gon.module-graph/1.0'");
    expect(sql).toContain("outbox_events_publish_queue_idx");
    expect(sql).toContain("async_jobs_running_lease_idx");
    expect(sql).toContain("outbox_events_publishing_lease_idx");
  });

  it("marks historical records append-only and module graphs immutable", () => {
    for (const trigger of [
      "age_attestations_append_only",
      "branch_commits_append_only",
      "assessment_results_append_only",
      "xp_ledger_entries_append_only",
      "proof_verification_events_append_only",
      "audit_logs_append_only",
      "module_versions_graph_immutable",
    ]) {
      expect(sql).toContain(trigger);
    }
  });
});
