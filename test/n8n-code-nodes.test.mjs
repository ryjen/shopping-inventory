import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const workflowPath = 'automation/n8n/shopping-ingestion-starter.n8n.json';
const fixturePath = 'test/fixtures/n8n/sample-gmail-messages.json';

async function loadWorkflow() {
  return JSON.parse(await readFile(workflowPath, 'utf8'));
}

async function loadFixtures() {
  return JSON.parse(await readFile(fixturePath, 'utf8'));
}

function getCodeNode(workflow, nodeName) {
  const node = workflow.nodes.find((candidate) => candidate.name === nodeName);
  assert.ok(node, `missing n8n Code node: ${nodeName}`);
  assert.equal(node.type, 'n8n-nodes-base.code', `${nodeName} must be a Code node`);
  assert.equal(typeof node.parameters?.jsCode, 'string', `${nodeName} must contain jsCode`);
  return node;
}

function runCodeNode(node, inputItems, configOverrides = {}) {
  const config = {
    spreadsheetId: 'test-spreadsheet-id',
    ordersSheetName: 'Orders_Raw',
    dealsSheetName: 'Deals_Raw',
    extractor: 'n8n.shopping-ingestion-starter.test',
    ...configOverrides,
  };

  const sandbox = {
    items: inputItems.map((json) => ({ json })),
    Date,
    Math,
    String,
    $: (nodeName) => {
      assert.equal(nodeName, 'Configuration', 'Code node should only access the Configuration node');
      return {
        first: () => ({ json: config }),
      };
    },
  };

  return vm.runInNewContext(`(() => { ${node.parameters.jsCode} })()`, sandbox, {
    timeout: 1000,
    displayErrors: true,
  });
}

test('Prepare Orders_Raw rows maps Gmail messages into reviewable raw rows', async () => {
  const workflow = await loadWorkflow();
  const fixtures = await loadFixtures();
  const node = getCodeNode(workflow, 'Prepare Orders_Raw rows');

  const rows = runCodeNode(node, fixtures.orders).map((item) => item.json);

  assert.equal(rows.length, fixtures.orders.length);

  for (const row of rows) {
    assert.match(row.order_import_id, /^order_import_[0-9a-f]{8}$/);
    assert.equal(row.source_type, 'email_receipt');
    assert.equal(row.source_system, 'gmail');
    assert.match(row.source_uri, /^gmail:\/\/message\//);
    assert.equal(row.currency, 'CAD');
    assert.equal(row.extractor, 'n8n.shopping-ingestion-starter.test');
    assert.equal(row.parse_confidence, 0.25);
    assert.equal(row.review_state, 'new');
    assert.match(row.dedupe_key, /^gmail_order_[0-9a-f]{8}$/);
    assert.ok(row.item_text_raw.length > 0, 'item_text_raw should preserve review evidence');
    assert.ok(row.ambiguity_notes.includes('Needs parsing/review'));
  }
});

test('Prepare Orders_Raw rows is deterministic for the same Gmail message ids', async () => {
  const workflow = await loadWorkflow();
  const fixtures = await loadFixtures();
  const node = getCodeNode(workflow, 'Prepare Orders_Raw rows');

  const first = runCodeNode(node, fixtures.orders).map((item) => item.json);
  const second = runCodeNode(node, fixtures.orders).map((item) => item.json);

  assert.deepEqual(
    first.map((row) => [row.order_import_id, row.dedupe_key]),
    second.map((row) => [row.order_import_id, row.dedupe_key]),
  );
});

test('Prepare Deals_Raw rows maps Gmail promo messages into reviewable deal rows', async () => {
  const workflow = await loadWorkflow();
  const fixtures = await loadFixtures();
  const node = getCodeNode(workflow, 'Prepare Deals_Raw rows');

  const rows = runCodeNode(node, fixtures.deals).map((item) => item.json);

  assert.equal(rows.length, fixtures.deals.length);

  for (const row of rows) {
    assert.match(row.deal_import_id, /^deal_import_[0-9a-f]{8}$/);
    assert.equal(row.source_type, 'email_promo');
    assert.equal(row.source_system, 'gmail');
    assert.match(row.source_uri, /^gmail:\/\/message\//);
    assert.equal(row.currency, 'CAD');
    assert.equal(row.extractor, 'n8n.shopping-ingestion-starter.test');
    assert.equal(row.parse_confidence, 0.2);
    assert.equal(row.review_state, 'new');
    assert.ok(row.item_text_raw.length > 0, 'item_text_raw should preserve review evidence');
    assert.ok(row.ambiguity_notes.includes('Needs parsing/review'));
  }
});

test('Code node outputs never look authoritative', async () => {
  const workflow = await loadWorkflow();
  const fixtures = await loadFixtures();

  const orders = runCodeNode(getCodeNode(workflow, 'Prepare Orders_Raw rows'), fixtures.orders).map((item) => item.json);
  const deals = runCodeNode(getCodeNode(workflow, 'Prepare Deals_Raw rows'), fixtures.deals).map((item) => item.json);

  for (const row of [...orders, ...deals]) {
    assert.equal(row.review_state, 'new');
    assert.ok(row.parse_confidence <= 0.25, 'starter ingestion should stay low confidence');
    assert.ok(!('stock_state' in row), 'raw imports must not emit stock state');
    assert.ok(!('budget_category' in row), 'raw imports must not emit budget export categories');
  }
});
