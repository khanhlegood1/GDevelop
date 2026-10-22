#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import pg from "pg";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, "..");
const migrationsDir = path.join(appDir, "db", "migrations");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function loadMigrations() {
  const files = (await readdir(migrationsDir))
    .filter((file) => /^\d{4}_[a-z0-9_]+\.sql$/i.test(file))
    .sort((a, b) => a.localeCompare(b));

  if (files.length === 0) throw new Error(`No migrations found in ${migrationsDir}`);

  const prefixes = new Set();
  const migrations = [];
  for (const file of files) {
    const prefix = file.slice(0, 4);
    if (prefixes.has(prefix)) throw new Error(`Duplicate migration prefix ${prefix}`);
    prefixes.add(prefix);
    const sql = await readFile(path.join(migrationsDir, file), "utf8");
    migrations.push({ version: file, sql, checksum: sha256(sql) });
  }
  return migrations;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required. Refusing to pretend migrations ran against the memory store.");
    process.exitCode = 2;
    return;
  }

  const migrations = await loadMigrations();
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query("select pg_advisory_lock(hashtext('gon_schema_migrations'))");
    await client.query(`
      create table if not exists gon_schema_migrations (
        version text primary key,
        checksum char(64) not null,
        applied_at timestamptz not null default now()
      )
    `);

    const appliedResult = await client.query(
      "select version, checksum from gon_schema_migrations order by version",
    );
    const applied = new Map(
      appliedResult.rows.map((row) => [row.version, String(row.checksum).trim()]),
    );

    for (const migration of migrations) {
      const existingChecksum = applied.get(migration.version);
      if (existingChecksum) {
        if (existingChecksum !== migration.checksum) {
          throw new Error(
            `Migration checksum mismatch for ${migration.version}. Published migrations are immutable; add a forward migration instead.`,
          );
        }
        console.log(`skip ${migration.version}`);
        continue;
      }

      console.log(`apply ${migration.version}`);
      await client.query("begin");
      try {
        await client.query(migration.sql);
        await client.query(
          "insert into gon_schema_migrations (version, checksum) values ($1, $2)",
          [migration.version, migration.checksum],
        );
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }
  } finally {
    try {
      await client.query("select pg_advisory_unlock(hashtext('gon_schema_migrations'))");
    } finally {
      await client.end();
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
