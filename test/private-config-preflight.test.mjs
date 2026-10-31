import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { test } from "node:test";
import { checkPrivateConfig } from "../scripts/private-config-preflight.mjs";

const root = resolve(".private");
const exampleId = "01234567-89ab-4def-8abc-0123456789ab";
const baseline = (environment = "development") => {
  const suffix = environment === "development" ? "dev" : "prod";
  return [
    'name = "shopping-inventory-' + suffix + '"',
    'main = "src/worker.mjs"',
    'workers_dev = true',
    '[[d1_databases]]',
    'binding = "DB"',
    'database_name = "shopping-inventory-' + suffix + '"',
    'database_id = "' + exampleId + '"',
    'migrations_dir = "migrations"',
    '[[r2_buckets]]',
    'binding = "RECEIPTS"',
    'bucket_name = "shopping-inventory-receipts-' + suffix + '"',
    '[vars]',
    'ENVIRONMENT = "' + environment + '"',
  ].join("\n");
};
mkdirSync(root, { recursive: true });
const writePrivate = (content) => {
  const dir = mkdtempSync(join(root, "preflight-synthetic-"));
  const file = join(dir, "wrangler.private.toml");
  writeFileSync(file, content, { mode: 0o600 });
  return { file, clean: () => rmSync(dir, { recursive: true, force: true }) };
};

test("accepts owner-only, ignored, correctly isolated private configs", () => {
  for (const env of ["development", "production"]) {
    const { file, clean } = writePrivate(baseline(env));
    try { assert.equal(checkPrivateConfig(file, env).environment, env); }
    finally { clean(); }
  }
});

test("rejects public config and a tracked production-looking file", () => {
  assert.throws(() => checkPrivateConfig(resolve("wrangler.toml"), "development"),
    /public_configuration_not_deployable/);
  const { file, clean } = writePrivate(baseline());
  try {
    const result = spawnSync(process.execPath,
      ["scripts/private-config-preflight.mjs", file, "development"], { encoding: "utf8" });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /local checks only/);
    assert.doesNotMatch(result.stdout, /01234567|database_id/);
  } finally { clean(); }
});

test("fails closed on placeholders, mismatched resources, and embedded secrets", () => {
  for (const [input, code] of [
    [baseline().replace(exampleId, "REPLACE_IN_PRIVATE_CONFIGURATION"), /placeholder_configuration/],
    [baseline().replace("shopping-inventory-receipts-dev", "shared-receipts"), /bucket_environment_mismatch/],
    [baseline().replace('ENVIRONMENT = "development"', 'ENVIRONMENT = "production"'), /environment_mismatch/],
    [baseline() + '\nAPI_TOKEN = "not-a-real-token"', /secrets_must_not_be_in_config/],
    [baseline().replace("workers_dev = true", "workers_dev = false"), /no_routable_worker_endpoint/],
    [baseline().replace(exampleId, "invalid"), /invalid_database_id/],
  ]) {
    const { file, clean } = writePrivate(input);
    try { assert.throws(() => checkPrivateConfig(file, "development"), code); }
    finally { clean(); }
  }
});

test("rejects owner-readable private configs with group or other permissions", () => {
  const { file, clean } = writePrivate(baseline());
  try {
    chmodSync(file, 0o644);
    assert.throws(() => checkPrivateConfig(file, "development"), /owner_only/);
  } finally { clean(); }
});
