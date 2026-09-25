#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

function normalizePath(filePath) {
  return filePath.replaceAll("\\", "/").replace(/^\.\//, "");
}

function trackedFiles() {
  return execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean)
    .map(normalizePath);
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (quoted) throw new SyntaxError("unterminated quoted CSV field");
  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }

  return rows.filter((item) => !(item.length === 1 && item[0] === ""));
}

function stripMarkdownCode(markdown) {
  return markdown
    .replace(/~~~[\s\S]*?~~~/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`\n]*`/g, "");
}

function markdownTargets(markdown) {
  const targets = [];
  const text = stripMarkdownCode(markdown);
  const pattern = /!?\[[^\]]*\]\(([^)]+)\)/g;

  for (const match of text.matchAll(pattern)) {
    let target = match[1].trim();
    if (target.startsWith("<") && target.endsWith(">")) {
      target = target.slice(1, -1).trim();
    } else {
      const titleMatch = target.match(/^(\S+)(?:\s+["'][^"']*["'])?$/);
      if (titleMatch) target = titleMatch[1];
    }
    targets.push(target);
  }

  return targets;
}

function isExternalTarget(target) {
  return /^(?:https?:|mailto:|tel:|data:)/i.test(target);
}

function cleanLocalTarget(target) {
  const withoutFragment = target.split("#", 1)[0];
  const withoutQuery = withoutFragment.split("?", 1)[0];
  if (!withoutQuery) return null;

  try {
    return decodeURIComponent(withoutQuery);
  } catch {
    return withoutQuery;
  }
}

export async function validateMarkdownLinks(filePath, markdown, rootDir = process.cwd()) {
  const violations = [];

  for (const target of markdownTargets(markdown)) {
    if (!target || target.startsWith("#") || isExternalTarget(target)) continue;
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) {
      violations.push("unsupported-link-scheme");
      continue;
    }

    const cleaned = cleanLocalTarget(target);
    if (!cleaned) continue;

    const resolved = cleaned.startsWith("/")
      ? path.resolve(rootDir, `.\${cleaned}`)
      : path.resolve(rootDir, path.dirname(filePath), cleaned);

    try {
      await stat(resolved);
    } catch {
      violations.push("broken-relative-link");
    }
  }

  return violations;
}

function isSyntheticNamed(filePath) {
  return path.basename(filePath).includes(".synthetic.");
}

function collectIds(record, ids) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return;
  for (const key of ["case_id", "alias_id"]) {
    if (typeof record[key] === "string" && record[key].length > 0) {
      ids.push({ key, value: record[key] });
    }
  }
}

export function validateStructuredFixtureText(filePath, text) {
  const violations = [];
  const ids = [];
  const extension = path.extname(filePath).toLowerCase();
  const requireSynthetic = isSyntheticNamed(filePath);

  if (extension === ".json") {
    let value;
    try {
      value = JSON.parse(text);
    } catch {
      return { violations: ["invalid-json"], ids };
    }

    const records = Array.isArray(value) ? value : [value];
    if (requireSynthetic && !records.every((record) => record && typeof record === "object" && record.synthetic === true)) {
      violations.push("missing-synthetic-marker");
    }
    records.forEach((record) => collectIds(record, ids));
    return { violations, ids };
  }

  if (extension === ".jsonl") {
    const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length === 0) violations.push("empty-jsonl");

    for (const line of lines) {
      let record;
      try {
        record = JSON.parse(line);
      } catch {
        violations.push("invalid-jsonl");
        continue;
      }
      if (!record || typeof record !== "object" || Array.isArray(record)) {
        violations.push("jsonl-record-not-object");
        continue;
      }
      if (requireSynthetic && record.synthetic !== true) {
        violations.push("missing-synthetic-marker");
      }
      collectIds(record, ids);
    }

    return { violations: [...new Set(violations)], ids };
  }

  if (extension === ".csv") {
    let rows;
    try {
      rows = parseCsv(text);
    } catch {
      return { violations: ["invalid-csv"], ids };
    }

    if (rows.length === 0) return { violations: ["empty-csv"], ids };
    const header = rows[0];
    if (header.length === 0 || header.some((name) => name.trim().length === 0)) {
      violations.push("invalid-csv-header");
    }
    if (new Set(header).size !== header.length) {
      violations.push("duplicate-csv-header");
    }

    const syntheticIndex = header.indexOf("synthetic");
    if (requireSynthetic && syntheticIndex === -1) {
      violations.push("missing-synthetic-marker");
    }

    for (const row of rows.slice(1)) {
      if (row.length !== header.length) {
        violations.push("invalid-csv-row-width");
        continue;
      }
      if (requireSynthetic && row[syntheticIndex] !== "true") {
        violations.push("missing-synthetic-marker");
      }
      const record = Object.fromEntries(header.map((name, index) => [name, row[index]]));
      collectIds(record, ids);
    }

    return { violations: [...new Set(violations)], ids };
  }

  return { violations, ids };
}

export async function validateRepository(rootDir = process.cwd()) {
  const violations = [];
  const duplicateIds = new Map();
  const files = trackedFiles();

  for (const filePath of files.filter((item) => item.endsWith(".md"))) {
    const markdown = await readFile(path.resolve(rootDir, filePath), "utf8");
    const linkViolations = await validateMarkdownLinks(filePath, markdown, rootDir);
    for (const rule of linkViolations) violations.push({ filePath, rule });
  }

  const structuredFixtureFiles = files.filter((item) => {
    const inFixtureSurface = item.includes("/fixtures/") || item.startsWith("evaluation/expected/");
    return inFixtureSurface && [".json", ".jsonl", ".csv"].includes(path.extname(item).toLowerCase());
  });

  for (const filePath of structuredFixtureFiles) {
    const text = await readFile(path.resolve(rootDir, filePath), "utf8");
    const result = validateStructuredFixtureText(filePath, text);
    for (const rule of result.violations) violations.push({ filePath, rule });

    const family = filePath.startsWith("evaluation/fixtures/")
      ? "evaluation/fixtures"
      : filePath.startsWith("evaluation/expected/")
        ? "evaluation/expected"
        : path.dirname(filePath);

    for (const id of result.ids) {
      const key = `${family}:${id.key}:${id.value}`;
      if (duplicateIds.has(key)) {
        violations.push({ filePath, rule: `duplicate-${id.key}` });
      } else {
        duplicateIds.set(key, filePath);
      }
    }
  }

  return violations;
}

async function main() {
  const violations = await validateRepository();
  if (violations.length === 0) {
    console.log("repository-content-check: passed");
    return;
  }

  for (const { filePath, rule } of violations) {
    console.error(`repository-content-check: ${filePath}: ${rule}`);
  }
  process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
