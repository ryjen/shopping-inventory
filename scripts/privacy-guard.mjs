#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const SYNTHETIC_FIXTURE_PATH = /^(?:evaluation\/fixtures|test\/fixtures)\//;
const SYNTHETIC_MARKER = /(?:["']synthetic["']\s*:\s*true|["']source_type["']\s*:\s*["']synthetic["'])/i;
const FORBIDDEN_PRIVATE_PATHS = [
  /^\.private\//,
  /^private\//,
  /^data\/private\//,
  /^receipts\/private\//,
  /^exports\/private\//,
  /^imports\/receipts\//,
];

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi;
const SECRET_PATTERNS = [
  /\bgh[oprsu]_[A-Za-z0-9_]{20,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\b(?:sk|rk)-(?:live|prod)-[A-Za-z0-9_-]{16,}\b/g,
];

const RECEIPT_SIGNALS = [
  /["']?(?:merchant|merchant_name|store_name)["']?\s*[:=]\s*["'][^"'\n]{2,}["']/i,
  /["']?(?:purchased_at|purchase_date|transaction_date|receipt_date|timestamp)["']?\s*[:=]\s*["'][^"'\n]{4,}["']/i,
  /["']?(?:items|lines|basket|products)["']?\s*[:=]\s*(?:\[|["'])/i,
  /["']?(?:subtotal|total|amount)["']?\s*[:=]\s*["']?-?\d+(?:\.\d{1,2})?/i,
  /["']?(?:payment|payment_method|loyalty|membership|member_number|card_last4)["']?\s*[:=]/i,
];

const PAYMENT_IDENTIFIER = /(?:card|visa|mastercard|amex|payment)[^\n]{0,32}(?:\*{2,}|x{2,})?\d{4}\b/i;
const LOYALTY_IDENTIFIER = /(?:loyalty|membership|member|rewards)(?:[_ -]?(?:id|number|no))?\s*[:=]\s*["']?[A-Za-z0-9-]{5,}/i;

function normalizePath(filePath) {
  return filePath.replaceAll("\\", "/").replace(/^\.\//, "");
}

function isPlaceholderEmailDomain(domain) {
  const lower = domain.toLowerCase();
  return lower === "example.com" || lower.endsWith(".example.com") ||
    lower === "example.test" || lower.endsWith(".example.test") ||
    lower === "example.invalid" || lower.endsWith(".example.invalid");
}

function isProbablyBinary(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  return sample.includes(0);
}

function trackedFiles() {
  return execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
}

export function scanText(filePath, text) {
  const path = normalizePath(filePath);
  const violations = new Set();

  if (FORBIDDEN_PRIVATE_PATHS.some((pattern) => pattern.test(path))) {
    violations.add("prohibited-private-path");
  }

  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) violations.add("credential-like-token");
  }

  EMAIL_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(EMAIL_PATTERN)) {
    if (!isPlaceholderEmailDomain(match[1])) {
      violations.add("personal-email-address");
      break;
    }
  }

  if (PAYMENT_IDENTIFIER.test(text)) violations.add("payment-identifier");
  if (LOYALTY_IDENTIFIER.test(text)) violations.add("loyalty-identifier");

  // Receipt-shaped examples are exempt only when they live in a designated fixture
  // directory and explicitly identify themselves as synthetic. The location alone is
  // not a bypass. Identifier/credential checks still apply to synthetic fixtures.
  const isSyntheticFixture = SYNTHETIC_FIXTURE_PATH.test(path) && SYNTHETIC_MARKER.test(text);
  if (!isSyntheticFixture) {
    const receiptSignalCount = RECEIPT_SIGNALS.filter((pattern) => pattern.test(text)).length;
    const moneyLikeValues = (text.match(/(?:\b(?:CAD|USD)\s*)?\$?\d+\.\d{2}\b/g) ?? []).length;
    if (receiptSignalCount >= 3 && moneyLikeValues >= 2) {
      violations.add("likely-real-transaction-payload");
    }
  }

  return [...violations].sort();
}

export async function scanFile(filePath) {
  const path = normalizePath(filePath);
  const pathViolations = FORBIDDEN_PRIVATE_PATHS.some((pattern) => pattern.test(path))
    ? ["prohibited-private-path"]
    : [];

  const buffer = await readFile(filePath);
  if (buffer.length > MAX_TEXT_BYTES || isProbablyBinary(buffer)) {
    return pathViolations;
  }

  return [...new Set([...pathViolations, ...scanText(path, buffer.toString("utf8"))])].sort();
}

async function main(args) {
  const paths = args.length === 1 && args[0] === "--tracked" ? trackedFiles() : args;
  if (paths.length === 0) {
    console.error("privacy-guard: no files supplied");
    process.exitCode = 2;
    return;
  }

  let failed = false;
  for (const filePath of paths) {
    try {
      const violations = await scanFile(filePath);
      if (violations.length === 0) continue;
      failed = true;
      // Never echo matching content. Paths and policy classes are sufficient for remediation.
      console.error(`privacy-guard: ${normalizePath(filePath)}: ${violations.join(", ")}`);
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
  }

  if (failed) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main(process.argv.slice(2));
}
