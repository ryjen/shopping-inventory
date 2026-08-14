import assert from "node:assert/strict";
import test from "node:test";

import { scanText } from "../scripts/privacy-guard.mjs";

const join = (...parts) => parts.join("");

// Construct detector inputs at runtime so the repository-wide guard can scan its
// own regression test without checking in literal examples that look private.
const realLookingReceipt = JSON.stringify({
  [join("mer", "chant")]: "Example Local Market",
  [join("purchased", "_at")]: "2026-08-13T18:22:00-07:00",
  [join("li", "nes")]: [
    { description: "MILK 2L", [join("am", "ount")]: Number(join("6", ".", "49")) },
    { description: "CAT LITTER", [join("am", "ount")]: Number(join("14", ".", "99")) },
  ],
  [join("sub", "total")]: Number(join("21", ".", "48")),
  [join("to", "tal")]: Number(join("22", ".", "55")),
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
  const privateEmail = join("person", "@", "private-domain", ".ca");
  const content = `${realLookingReceipt}\ncustomer_email: ${privateEmail}`;
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

test("rejects payment and loyalty identifiers without storing literal identifiers", () => {
  const payment = join("payment: VISA **** ", "43", "21");
  const loyalty = join("loyalty", "_number: ", "ABC", "DE", "12345");
  const violations = scanText("scratch.txt", `${payment}\n${loyalty}`);
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
