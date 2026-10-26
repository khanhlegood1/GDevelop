#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(scriptDir, "..", "db", "migrations");

const requiredTables = [
  "users",
  "accounts",
  "sessions",
  "verification_token",
  "gon_users",
  "identity_links",
  "invites",
  "age_attestations",
  "consents",
  "learning_projects",
  "source_artifacts",
  "artifact_upload_sessions",
  "content_chunks",
  "chunk_embeddings",
  "async_jobs",
  "search_attempts",
  "search_results",
  "brew_jobs",
  "modules",
  "module_versions",
  "candidate_sets",
  "output_candidates",
  "ranking_snapshots",
  "arena_matches",
  "arena_votes",
  "game_sessions",
  "game_events",
  "journeys",
  "branch_commits",
  "learning_attempts",
  "assessment_results",
  "mastery_states",
  "xp_ledger_entries",
  "xp_projections",
  "proofs",
  "reports",
  "moderation_cases",
  "outbox_events",
  "audit_logs",
  "idempotency_records",
  "ai_runs",
  "quota_reservations",
  "feature_flags",
];

const requiredSnippets = [
  "create extension if not exists vector",
  "embedding vector(768) not null",
  "dimensions integer not null check (dimensions = 768)",
  "using hnsw (embedding vector_cosine_ops)",
  "primary key (provider, provider_subject)",
  "method = 'self_attested_18_plus'",
  "graph_schema_version = 'gon.module-graph/1.0'",
  "formula_version = 'gon-level-v1'",
  "content_chunks_active_source_ordinal_unique_idx",
  "async_jobs_active_fingerprint_unique_idx",
  "learning_attempts_one_draft_per_node_idx",
  "xp_ledger_user_sequence_unique",
  "outbox_events_publish_queue_idx",
];

const errors = [];
const files = (await readdir(migrationsDir))
  .filter((file) => file.endsWith(".sql"))
  .sort((a, b) => a.localeCompare(b));

if (files.length === 0) errors.push("No SQL migrations found.");

const prefixes = new Set();
let combined = "";
for (const file of files) {
  if (!/^\d{4}_[a-z0-9_]+\.sql$/i.test(file)) {
    errors.push(`Migration filename must be NNNN_name.sql: ${file}`);
    continue;
  }
  const prefix = file.slice(0, 4);
  if (prefixes.has(prefix)) errors.push(`Duplicate migration prefix: ${prefix}`);
  prefixes.add(prefix);

  const sql = await readFile(path.join(migrationsDir, file), "utf8");
  combined += `\n${sql}`;
  if (/\bTODO\b|\bFIXME\b/i.test(sql)) errors.push(`Unresolved TODO/FIXME in ${file}`);
  if (!sql.trim().endsWith(";")) errors.push(`Migration does not end with a semicolon: ${file}`);
}

const normalized = combined.toLowerCase().replace(/\s+/g, " ");
for (const table of requiredTables) {
  if (!normalized.includes(`create table ${table} (`)) {
    errors.push(`Missing table: ${table}`);
  }
}
for (const snippet of requiredSnippets) {
  if (!normalized.includes(snippet.toLowerCase().replace(/\s+/g, " "))) {
    errors.push(`Missing migration invariant: ${snippet}`);
  }
}

if (errors.length > 0) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Migration static check passed for ${files.length} files. This is not a PostgreSQL execution result.`,
  );
}
