#!/usr/bin/env node
// Read-only preflight: never prints private configuration content or values.
import { readFileSync, realpathSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ENVIRONMENTS = new Set(["development", "production"]);
const fail = (code) => { throw new Error(code); };

function settings(text) {
  // This is intentionally a narrow guard, not a TOML parser. Wrangler is
  // responsible for validating the full configuration with a dry-run.
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+#.*$/, "").trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
  const section = [];
  const values = [];
  for (const line of lines) {
    const array = line.match(/^\[\[([\w.-]+)\]\]$/);
    const table = line.match(/^\[([\w.-]+)\]$/);
    if (array || table) {
      section.length = 0;
      section.push((array ?? table)[1]);
      continue;
    }
    const field = line.match(/^([\w.-]+)\s*=\s*("[^"]*"|true|false|[^#\s]+)$/);
    if (field) values.push({ section: section[0] ?? "", key: field[1], value: field[2].replace(/^"|"$/g, "") });
  }
  return values;
}
function uniqueField(values, section, key) {
  const found = values.filter((v) => v.section === section && v.key === key);
  if (found.length !== 1) fail("missing_or_duplicate_" + section.replaceAll(".", "_") + "_" + key);
  return found[0].value;
}
function checkPrivateConfig(configPath, environment) {
  if (!ENVIRONMENTS.has(environment)) fail("unsupported_environment");
  const file = realpathSync(configPath);
  if (file === resolve(repositoryRoot, "wrangler.toml") || basename(file) === "wrangler.toml") {
    fail("public_configuration_not_deployable");
  }
  const ignored = spawnSync("git", ["check-ignore", "--no-index", "-q", "--", file], {
    cwd: repositoryRoot, encoding: "utf8",
  });
  if (ignored.status !== 0) fail("private_config_must_be_git_ignored");
  if ((statSync(file).mode & 0o077) !== 0) fail("private_config_permissions_must_be_owner_only");
  const text = readFileSync(file, "utf8");
  if (/REPLACE_IN_PRIVATE_CONFIGURATION|\bTODO\b|\bCHANGEME\b/i.test(text)) fail("placeholder_configuration");
  const values = settings(text);
  if (/^\s*(?:API_TOKEN|CLOUDFLARE_API_TOKEN|secret|password)\s*=/im.test(text)) {
    fail("secrets_must_not_be_in_config");
  }
  if (values.some(({ section }) => section.startsWith("env."))) fail("use_one_private_config_per_environment");
  const name = uniqueField(values, "", "name");
  const workerSuffix = "-" + (environment === "development" ? "dev" : "prod");
  if (name !== "shopping-inventory" + workerSuffix) fail("unexpected_worker_name");
  if (uniqueField(values, "vars", "ENVIRONMENT") !== environment) fail("environment_mismatch");
  const database = uniqueField(values, "d1_databases", "database_name");
  if (database !== name) fail("database_environment_mismatch");
  if (uniqueField(values, "d1_databases", "binding") !== "DB") fail("database_binding_mismatch");
  if (!UUID.test(uniqueField(values, "d1_databases", "database_id"))) fail("invalid_database_id");
  const bucket = uniqueField(values, "r2_buckets", "bucket_name");
  if (bucket !== "shopping-inventory-receipts" + workerSuffix) fail("bucket_environment_mismatch");
  if (uniqueField(values, "r2_buckets", "binding") !== "RECEIPTS") fail("bucket_binding_mismatch");
  const workersDev = uniqueField(values, "", "workers_dev");
  if (workersDev !== "true" && workersDev !== "false") fail("invalid_workers_dev");
  if (workersDev === "false" && !/^\s*(?:routes?\s*=|\[\[routes\]\])/m.test(text)) {
    fail("no_routable_worker_endpoint");
  }
  if (uniqueField(values, "", "main") !== "src/worker.mjs") fail("unexpected_worker_entrypoint");
  return { environment, worker: name };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4) fail("usage_private_config_path_and_environment");
    const result = checkPrivateConfig(process.argv[2], process.argv[3]);
    process.stdout.write("PASS private config preflight: " + result.environment + " (local checks only)\n");
  } catch (error) {
    process.stderr.write("BLOCKED private config preflight: " +
      (error instanceof Error && /^[a-z_]+$/.test(error.message) ? error.message : "unreadable_or_invalid_config") + "\n");
    process.exitCode = 1;
  }
}

export { checkPrivateConfig };
