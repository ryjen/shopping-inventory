import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join as joinPath } from "node:path";
import test from "node:test";

import { scanFile, scanText } from "../scripts/privacy-guard.mjs";

const join = (...parts) => parts.join("");

// Construct detector inputs at runtime so the repository-wide guard can scan its
// own regression test without checking in literal examples that look private.
const realLookingReceiptObject = {
  [join("mer", "chant")]: "Example Local Market",
  [join("purchased", "_at")]: "2026-08-13T18:22:00-07:00",
  [join("li", "nes")]: [
    { description: "MILK 2L", [join("am", "ount")]: Number(join("6", ".", "49")) },
    { description: "CAT LITTER", [join("am", "ount")]: Number(join("14", ".", "99")) },
  ],
  [join("sub", "total")]: Number(join("21", ".", "48")),
  [join("to", "tal")]: Number(join("22", ".", "55")),
};
const realLookingReceipt = JSON.stringify(realLookingReceiptObject);
const syntheticReceipt = JSON.stringify({ synthetic: true, ...realLookingReceiptObject });

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

test("fixture location alone does not bypass receipt detection", () => {
  assert.deepEqual(
    scanText("evaluation/fixtures/example.json", realLookingReceipt),
    ["likely-real-transaction-payload"],
  );
});

test("designated fixtures require an explicit synthetic marker", () => {
  assert.deepEqual(
    scanText("evaluation/fixtures/example.synthetic.json", syntheticReceipt),
    [],
  );
});

test("synthetic fixture markers outside fixture directories are not exemptions", () => {
  assert.deepEqual(scanText("misc/upload.json", syntheticReceipt), [
    "likely-real-transaction-payload",
  ]);
});

test("markdown synthetic-example marker exempts only its immediate fenced block", () => {
  const marked = [
    "# Public example",
    "<!-- privacy-guard: synthetic-example -->",
    "```json",
    syntheticReceipt,
    "```",
  ].join("\n");
  assert.deepEqual(scanText("docs/example.md", marked), []);

  const unmarkedSecondBlock = `${marked}\n\n\`\`\`json\n${realLookingReceipt}\n\`\`\``;
  assert.deepEqual(scanText("docs/example.md", unmarkedSecondBlock), [
    "likely-real-transaction-payload",
  ]);
});

test("synthetic fixtures do not exempt personal identifiers", () => {
  const privateEmail = join("person", "@", "private-domain", ".ca");
  const content = `${syntheticReceipt}\ncustomer_email: ${privateEmail}`;
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

test("rejects phone, postal-address, and private-network URL shapes", () => {
  const phone = join("604", "-", "555", "-", "0184");
  const postal = join("V7", "R ", "2N9");
  const street = join("742", " Cedar Example ", "Road");
  const privateUrl = join("https://", "192", ".168.", "24", ".7/private-receipt");

  assert.deepEqual(scanText("notes/contact.txt", `phone: ${phone}`), [
    "personal-phone-number",
  ]);
  assert.deepEqual(scanText("notes/location.txt", `postal: ${postal}`), [
    "postal-address",
  ]);
  assert.deepEqual(scanText("notes/location.txt", `address: ${street}`), [
    "postal-address",
  ]);
  assert.deepEqual(scanText("notes/source.txt", `source: ${privateUrl}`), [
    "private-internal-url",
  ]);
});

test("public placeholder and loopback URLs remain usable", () => {
  assert.deepEqual(scanText("docs/example.md", "https://example.test/receipt"), []);
  assert.deepEqual(scanText("docs/development.md", "http://127.0.0.1:8787"), []);
});

test("rejects known private/import locations even with harmless content", () => {
  assert.deepEqual(scanText("imports/receipts/new.json", "{}"), [
    "prohibited-private-path",
  ]);
  assert.deepEqual(scanText(".private/cache.json", "{}"), [
    "prohibited-private-path",
  ]);
});

test("fails closed when a tracked file is binary", async () => {
  const directory = await mkdtemp(joinPath(tmpdir(), "shopping-privacy-"));
  const file = joinPath(directory, "renamed-receipt.bin");
  try {
    await writeFile(file, Uint8Array.from([0x89, 0x50, 0x00, 0x47]));
    assert.deepEqual(await scanFile(file), ["unscannable-tracked-file"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("ordinary source and documentation text is unaffected", () => {
  assert.deepEqual(
    scanText("docs/example.md", "Receipt data belongs in private storage. Use synthetic fixtures in Git."),
    [],
  );
});

test("private receipt import paths are never publishable", () => {
  assert.deepEqual(scanText("receipts/scan.json", "{}"), ["prohibited-private-path"]);
});

test("rejects concrete Google Sheet, file and folder URLs", () => {
  const id = join("1A2B3C4D5E6F7G8H9I", "JkLmNoPq123");
  const sheet = join("https://docs.google.com/", "spreadsheets/d/", id, "/edit");
  const file = join("https://drive.google.com/", "file/d/", id, "/view");
  const folder = join("https://drive.google.com/", "drive/folders/", id);
  for (const privateUrl of [sheet, file, folder]) {
    assert.deepEqual(scanText("docs/example.md", privateUrl), ["private-google-workspace-url"]);
  }
});
