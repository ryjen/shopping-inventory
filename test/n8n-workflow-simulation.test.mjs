import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const workflowPath = 'automation/n8n/shopping-ingestion-starter.n8n.json';
const rawAppendNodes = new Set(['Append Orders_Raw', 'Append Deals_Raw']);
const forbiddenAuthoritativeTargets = ['Purchases', 'Stock', 'Budget_Export'];

async function loadWorkflow() {
  return JSON.parse(await readFile(workflowPath, 'utf8'));
}

function nodeByName(workflow) {
  return new Map(workflow.nodes.map((node) => [node.name, node]));
}

function nextNodes(workflow, nodeName) {
  const main = workflow.connections?.[nodeName]?.main ?? [];
  return main.flatMap((connectionSet) => connectionSet.map((edge) => edge.node));
}

function walk(workflow, startName) {
  const visited = new Set();
  const edges = [];
  const queue = [startName];

  while (queue.length > 0) {
    const current = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);

    for (const target of nextNodes(workflow, current)) {
      edges.push([current, target]);
      queue.push(target);
    }
  }

  return { visited, edges };
}

function sheetNameFor(node) {
  const sheetName = node.parameters?.sheetName;
  if (sheetName && typeof sheetName === 'object' && 'value' in sheetName) return sheetName.value;
  return sheetName;
}

test('manual trigger integration path reaches both raw ingestion lanes', async () => {
  const workflow = await loadWorkflow();
  const nodes = nodeByName(workflow);
  const { visited } = walk(workflow, 'Manual trigger');

  for (const expected of [
    'Configuration',
    'Search receipt/order emails',
    'Prepare Orders_Raw rows',
    'Append Orders_Raw',
    'Search deal/promo emails',
    'Prepare Deals_Raw rows',
    'Append Deals_Raw',
  ]) {
    assert.ok(nodes.has(expected), `workflow missing expected node: ${expected}`);
    assert.ok(visited.has(expected), `manual trigger path does not reach ${expected}`);
  }
});

test('workflow terminal writes are raw append nodes only', async () => {
  const workflow = await loadWorkflow();
  const { visited } = walk(workflow, 'Manual trigger');

  const terminalNodes = [...visited].filter((nodeName) => nextNodes(workflow, nodeName).length === 0);
  assert.deepEqual(new Set(terminalNodes), rawAppendNodes);
});

test('integration graph does not route into authoritative state', async () => {
  const workflow = await loadWorkflow();
  const nodes = nodeByName(workflow);

  for (const node of workflow.nodes) {
    for (const forbidden of forbiddenAuthoritativeTargets) {
      assert.notEqual(node.name, forbidden, `workflow must not define authoritative node ${forbidden}`);
    }
  }

  for (const nodeName of walk(workflow, 'Manual trigger').visited) {
    const node = nodes.get(nodeName);
    assert.ok(node, `missing visited node ${nodeName}`);

    if (node.type === 'n8n-nodes-base.googleSheets') {
      assert.equal(node.parameters?.operation, 'append', `${node.name} must append only`);
      const sheetName = String(sheetNameFor(node) ?? '');

      for (const forbidden of forbiddenAuthoritativeTargets) {
        assert.ok(!sheetName.includes(forbidden), `${node.name} must not target ${forbidden}`);
      }
    }
  }
});

test('e2e simulation documents external boundaries explicitly', async () => {
  const workflow = await loadWorkflow();
  const nodes = nodeByName(workflow);

  const externalReadNodes = [...nodes.values()].filter((node) => node.type === 'n8n-nodes-base.gmail');
  const externalWriteNodes = [...nodes.values()].filter((node) => node.type === 'n8n-nodes-base.googleSheets');

  assert.deepEqual(
    externalReadNodes.map((node) => node.name).sort(),
    ['Search deal/promo emails', 'Search receipt/order emails'].sort(),
  );

  assert.deepEqual(
    externalWriteNodes.map((node) => node.name).sort(),
    ['Append Deals_Raw', 'Append Orders_Raw'].sort(),
  );

  for (const node of externalWriteNodes) {
    assert.equal(node.parameters?.operation, 'append');
  }
});
