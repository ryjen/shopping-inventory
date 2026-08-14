import assert from "node:assert/strict";
import test from "node:test";

import { scanText } from "../scripts/privacy-guard.mjs";

const realLookingReceipt = JSON.stringify({
  merchant: "Example Local Market",
  purchased_at: "2026-08-13T18:22:00-07:00",
  lines: [
    { description: "MILK 2L", amount: 6.49 },
    { description: "CAT LITTER", amount: 14.99 },
  ],
  subtotal: 21.48,
  total: 22.55,
});

test("rejects a receipt-like transaction regardless of path", () => {
  assert.deepEqual(scanText("misc/upload.json", realLookingReceipt), [
    "likely-real-transaction-payload",
  ]);
});

test("renaming a receipt-like payload does not bypass the guard", () => {
  assert.deepEqual(scanText("notes/random-file.txt", realLookingReceipt), [
    "likely-real-transaction-payload",
  ]);
});

test("designated synthetic fixtures may exercise receipt structure", () => {
  assert.deepEqual(
    scanText("evaluation/fixtures/example.synthetic.json", realLookingReceipt),
    [],
  );
});

test("synthetic fixture paths do not exempt personal identifiers", () => {
  const content = `${realLookingReceipt}\ncustomer_email: person@private-domain.ca`;
  assert.deepEqual(
    scanText("evaluation/fixtures/example.synthetic.json", content),
    ["personal-email-address"],
  );
});

test("placeholder email domains remain usable in public fixtures", () => {
  assert.deepEqual(
    scanText("test/fixtures/message.json", "from: receipts@example.test"),
    [],
  );
});

test("rejects payment and loyalty identifiers without echoing values", () => {
  const violations = scanText(
    "scratch.txt",
    "payment: VISA **** 4321\nloyalty_number: ABCDE12345",
  );
  assert.deepEqual(violations, ["loyalty-identifier", "payment-identifier"]);
});

test("rejects known private/import locations even with harmless content", () => {
  assert.deepEqual(scanText("imports/receipts/new.json", "{}"), [
    "prohibited-private-path",
  ]);
  assert.deepEqual(scanText(".private/cache.json", "{}"), [
    "prohibited-private-path",
  ]);
});

test("ordinary source and documentation text is unaffected", () => {
  assert.deepEqual(
    scanText("docs/example.md", "Receipt data belongs in private storage. Use synthetic fixtures in Git."),
    [],
  );
});
