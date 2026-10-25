import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const workflowDir = path.join(process.cwd(), 'automation', 'n8n');
const authoritativeTabs = new Set(['Purchases', 'Stock', 'Budget_Export']);

async function workflowFiles() {
  const entries = await readdir(workflowDir);
  return entries
    .filter((entry) => entry.endsWith('.n8n.json'))
    .map((entry) => path.join(workflowDir, entry));
}

async function readWorkflow(file) {
  const raw = await readFile(file, 'utf8');
  return { file, raw, workflow: JSON.parse(raw) };
}

function connectionTargets(connections) {
  const targets = [];

  for (const [sourceName, outputs] of Object.entries(connections ?? {})) {
    for (const outputGroup of Object.values(outputs ?? {})) {
      if (!Array.isArray(outputGroup)) continue;
      for (const connectionSet of outputGroup) {
        if (!Array.isArray(connectionSet)) continue;
        for (const edge of connectionSet) {
          targets.push({ sourceName, ...edge });
        }
      }
    }
  }

  return targets;
}

function unwrapResourceLocator(value) {
  if (value && typeof value === 'object' && 'value' in value) {
    return value.value;
  }
  return value;
}

test('n8n workflow exports are valid and structurally connected', async () => {
  const files = await workflowFiles();
  assert.ok(files.length > 0, 'expected at least one n8n workflow file');

  for (const file of files) {
    const { workflow } = await readWorkflow(file);
    assert.match(workflow.id, /^synthetic_[a-z0-9_]+$/, `${file}: stable synthetic workflow ID required for pinned n8n import`);
    assert.equal(typeof workflow.name, 'string', `${file}: workflow name is required`);
    assert.ok(Array.isArray(workflow.nodes), `${file}: nodes must be an array`);
    assert.ok(workflow.nodes.length > 0, `${file}: nodes must not be empty`);
    assert.equal(typeof workflow.connections, 'object', `${file}: connections object is required`);

    const nodeIds = new Set();
    const nodeNames = new Set();

    for (const node of workflow.nodes) {
      assert.equal(typeof node.id, 'string', `${file}: every node needs a stable id`);
      assert.equal(typeof node.name, 'string', `${file}: every node needs a name`);
      assert.equal(typeof node.type, 'string', `${file}: every node needs a type`);
      assert.ok(!nodeIds.has(node.id), `${file}: duplicate node id ${node.id}`);
      assert.ok(!nodeNames.has(node.name), `${file}: duplicate node name ${node.name}`);
      nodeIds.add(node.id);
      nodeNames.add(node.name);
    }

    for (const sourceName of Object.keys(workflow.connections)) {
      assert.ok(nodeNames.has(sourceName), `${file}: connection source does not exist: ${sourceName}`);
    }

    for (const edge of connectionTargets(workflow.connections)) {
      assert.ok(nodeNames.has(edge.node), `${file}: connection target does not exist: ${edge.node}`);
    }
  }
});

test('n8n workflows preserve the raw-evidence boundary', async () => {
  for (const file of await workflowFiles()) {
    const { workflow } = await readWorkflow(file);

    for (const node of workflow.nodes) {
      if (node.type !== 'n8n-nodes-base.googleSheets') continue;

      assert.equal(
        node.parameters?.operation,
        'append',
        `${file}: Google Sheets node ${node.name} must be append-only`,
      );

      const sheetName = unwrapResourceLocator(node.parameters?.sheetName);
      assert.ok(sheetName, `${file}: Google Sheets node ${node.name} must declare a sheetName`);

      for (const forbidden of authoritativeTabs) {
        assert.ok(
          !String(sheetName).includes(forbidden),
          `${file}: ${node.name} must not write to authoritative tab ${forbidden}`,
        );
      }
    }
  }
});

test('scheduled triggers are disabled in repository exports', async () => {
  for (const file of await workflowFiles()) {
    const { workflow } = await readWorkflow(file);
    const scheduledTriggers = workflow.nodes.filter((node) => node.type === 'n8n-nodes-base.scheduleTrigger');

    for (const node of scheduledTriggers) {
      assert.equal(node.disabled, true, `${file}: scheduled trigger ${node.name} must default to disabled`);
    }
  }
});

test('Code nodes avoid dangerous or environment-sensitive JavaScript', async () => {
  const forbiddenPatterns = [
    /\brequire\s*\(/,
    /\bimport\s*\(/,
    /\beval\s*\(/,
    /\bFunction\s*\(/,
    /child_process/,
    /fs\./,
  ];

  for (const file of await workflowFiles()) {
    const { workflow } = await readWorkflow(file);
    const codeNodes = workflow.nodes.filter((node) => node.type === 'n8n-nodes-base.code');

    for (const node of codeNodes) {
      const jsCode = node.parameters?.jsCode ?? '';
      assert.ok(jsCode.trim().length > 0, `${file}: Code node ${node.name} must contain code`);

      for (const pattern of forbiddenPatterns) {
        assert.ok(!pattern.test(jsCode), `${file}: Code node ${node.name} contains forbidden pattern ${pattern}`);
      }
    }
  }
});

test('raw row builders emit required schema fields by convention', async () => {
  const requiredByNode = {
    'Prepare Orders_Raw rows': [
      'order_import_id',
      'order_id',
      'source_type',
      'source_system',
      'source_uri',
      'item_text_raw',
      'currency',
      'extractor',
      'extracted_at',
      'parse_confidence',
      'ambiguity_notes',
      'dedupe_key',
      'review_state',
    ],
    'Prepare Deals_Raw rows': [
      'deal_import_id',
      'source_type',
      'source_system',
      'source_uri',
      'merchant_raw',
      'item_text_raw',
      'currency',
      'extractor',
      'extracted_at',
      'parse_confidence',
      'ambiguity_notes',
      'review_state',
    ],
  };

  for (const file of await workflowFiles()) {
    const { workflow } = await readWorkflow(file);

    for (const [nodeName, fields] of Object.entries(requiredByNode)) {
      const node = workflow.nodes.find((candidate) => candidate.name === nodeName);
      assert.ok(node, `${file}: missing Code node ${nodeName}`);
      const jsCode = node.parameters?.jsCode ?? '';

      for (const field of fields) {
        assert.ok(jsCode.includes(`${field}:`), `${file}: ${nodeName} does not appear to emit ${field}`);
      }
    }
  }
});

const ALLOWED_SHEET_DOCUMENT_EXPR = "={{ $('Configuration').first().json.spreadsheetId }}";

function assertPlaceholderOnlyWorkflowResources(workflow, file = 'synthetic-export') {
  for (const node of workflow.nodes ?? []) {
    for (const credential of Object.values(node.credentials ?? {})) {
      assert.equal(credential?.id, 'TODO', `${file}: credential id on ${node.name} must remain a placeholder`);
      assert.match(String(credential?.name ?? ''), /^TODO\b/,
        `${file}: credential name on ${node.name} must remain a placeholder`);
    }

    if (node.type !== 'n8n-nodes-base.googleSheets') continue;
    // Check the actual input consumed by n8n, not only a Configuration assignment.
    // Expressions other than the exact approved reference are not equivalent to a placeholder.
    const documentId = node.parameters?.documentId;
    assert.deepEqual(Object.keys(documentId ?? {}).sort(), ['__rl', 'mode', 'value'].sort(),
      `${file}: ${node.name} must not export cached or unknown document locator metadata`);
    assert.equal(documentId?.__rl, true, `${file}: ${node.name} requires a resource locator`);
    assert.equal(documentId?.mode, 'id', `${file}: ${node.name} must resolve the configured spreadsheet ID`);
    assert.equal(documentId?.value, ALLOWED_SHEET_DOCUMENT_EXPR,
      `${file}: ${node.name} may only reference Configuration.spreadsheetId`);

    const sheetNames = new Map([
      ['Append Orders_Raw', "={{ $('Configuration').first().json.ordersSheetName }}"],
      ['Append Deals_Raw', "={{ $('Configuration').first().json.dealsSheetName }}"],
    ]);
    assert.ok(sheetNames.has(node.name), `${file}: unreviewed Sheets node ${node.name}`);
    const sheetName = node.parameters?.sheetName;
    assert.deepEqual(Object.keys(sheetName ?? {}).sort(), ['__rl', 'mode', 'value'].sort(),
      `${file}: ${node.name} must not export cached or unknown sheet locator metadata`);
    assert.equal(sheetName?.__rl, true, `${file}: ${node.name} requires a sheet locator`);
    assert.equal(sheetName?.mode, 'name', `${file}: ${node.name} must resolve the configured sheet name`);
    assert.equal(sheetName?.value, sheetNames.get(node.name),
      `${file}: ${node.name} must use the explicitly approved sheet reference`);
  }

  const configuration = workflow.nodes.find((node) => node.name === 'Configuration');
  assert.ok(configuration, `${file}: Configuration node is required`);
  const assignments = configuration.parameters?.assignments?.assignments ?? [];
  const spreadsheetIds = assignments.filter((item) => item.name === 'spreadsheetId');
  assert.equal(spreadsheetIds.length, 1, `${file}: exactly one spreadsheetId assignment required`);
  assert.equal(spreadsheetIds[0]?.value, 'TODO_GOOGLE_SHEET_ID',
    `${file}: spreadsheetId must remain a public placeholder`);
}

test('workflow exports contain placeholder-only credentials and actual resource locators', async () => {
  for (const file of await workflowFiles()) {
    const { workflow } = await readWorkflow(file);
    assertPlaceholderOnlyWorkflowResources(workflow, file);
  }
});

test('literal, indirect and spoofed Sheets document locators are rejected', async () => {
  const files = await workflowFiles();
  const { workflow } = await readWorkflow(files[0]);
  const sheetsNode = workflow.nodes.find((node) => node.type === 'n8n-nodes-base.googleSheets');
  assert.ok(sheetsNode, 'synthetic fixture must contain a Sheets node');
  const index = workflow.nodes.indexOf(sheetsNode);

  for (const injected of [
    { __rl: true, mode: 'id', value: 'synthetic_unapproved_sheet_id' },
    { __rl: true, mode: 'id', value: "={{ $('Other').first().json.spreadsheetId }}" },
    { __rl: true, mode: 'id', value: '={{ $env.SHEET_ID }}' },
    { __rl: true, mode: 'url', value: 'TODO_GOOGLE_SHEET_ID' },
    'TODO_GOOGLE_SHEET_ID',
  ]) {
    const changed = structuredClone(workflow);
    changed.nodes[index].parameters.documentId = injected;
    assert.throws(() => assertPlaceholderOnlyWorkflowResources(changed),
      'invalid document locator must fail before publication');
  }

  for (const [locator, field] of [
    ['documentId', 'cachedResultUrl'],
    ['documentId', 'cachedResultName'],
    ['sheetName', 'cachedResultUrl'],
    ['sheetName', 'cachedResultName'],
    ['sheetName', 'unexpectedMetadata'],
  ]) {
    const changed = structuredClone(workflow);
    changed.nodes[index].parameters[locator][field] =
      ['https://docs.google.com/', 'spreadsheets/d/', 'synthetic-unapproved-locator', '/edit'].join('');
    assert.throws(() => assertPlaceholderOnlyWorkflowResources(changed),
      `cached or unrecognized ${locator}.${field} must fail publication`);
  }

  const changed = structuredClone(workflow);
  changed.nodes.find((node) => node.name === 'Configuration')
    .parameters.assignments.assignments.find((item) => item.name === 'spreadsheetId')
    .value = 'synthetic_unapproved_sheet_id';
  assert.throws(() => assertPlaceholderOnlyWorkflowResources(changed));
});

test('workflow exports do not contain real credential material', async () => {
  for (const file of await workflowFiles()) {
    const { raw } = await readWorkflow(file);

    assert.ok(!/ya29\./i.test(raw), `${file}: looks like a Google OAuth token leaked`);
    assert.ok(!/AIza[0-9A-Za-z_-]{35}/.test(raw), `${file}: looks like a Google API key leaked`);
    assert.ok(!/-----BEGIN [A-Z ]+PRIVATE KEY-----/.test(raw), `${file}: looks like a private key leaked`);
  }
});
