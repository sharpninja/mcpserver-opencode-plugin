import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import {
  applyRequiredMemoryToChatMessage,
  convertToMemoryItems,
  fetchRequiredMemoryResponse,
  formatRequiredMemoryContext,
  getMemoryDescriptorPath,
  getMemoryPluginRoot,
  getRequiredMemoryContext,
  invokeMemoryWorkflow,
  isRequestBoundaryHook,
  loadMemoryDescriptor,
  mergeRequiredMemoryIntoParts,
  resolveMemoryWorkflowMethod,
} from '../src/memory-context.js';

const root = path.resolve(__dirname, '..');

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

describe('opencode required-memory injection', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of [
      'MCP_PLUGIN_ROOT',
      'MCP_PLUGIN_HOST',
      'MCP_MEMORY_DESCRIPTOR_PATH',
      'MCP_MEMORY_REPL_RESPONSE',
      'MCP_PLUGIN_REPL_LOG',
      'MCP_PLUGIN_REPL_RESPONSE',
      'MCP_MEMORY_FETCH_ERROR',
    ]) {
      saved[key] = process.env[key];
    }
    process.env.MCP_PLUGIN_ROOT = root;
    process.env.MCP_PLUGIN_HOST = 'opencode';
    delete process.env.MCP_MEMORY_DESCRIPTOR_PATH;
    delete process.env.MCP_MEMORY_REPL_RESPONSE;
    delete process.env.MCP_PLUGIN_REPL_LOG;
    delete process.env.MCP_PLUGIN_REPL_RESPONSE;
    delete process.env.MCP_MEMORY_FETCH_ERROR;
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      restoreEnv(key, value);
    }
  });

  test('loads the host descriptor and maps memory_* aliases to workflow.memory.*', () => {
    const descriptor = loadMemoryDescriptor({ pluginRoot: root, host: 'opencode' });
    expect(descriptor.loaded).toBe(true);
    expect(descriptor.path).toMatch(/memory-descriptor\.json$/);
    expect(descriptor.injection.requiredMemoriesPrefix).toBe('REQUIRED MEMORIES -');
    expect(descriptor.injection.emptyFallback).toBe('REQUIRED MEMORIES - None.');
    expect(resolveMemoryWorkflowMethod('memory_remember', descriptor)).toBe('workflow.memory.remember');
    expect(resolveMemoryWorkflowMethod('workflow.memory.list', descriptor)).toBe('workflow.memory.list');
  });

  test('preserves explicit fallback flags from the descriptor', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-memory-flags-'));
    const custom = path.join(tmp, 'memory-descriptor.json');
    fs.writeFileSync(custom, JSON.stringify({
      host: 'opencode',
      fallback: { localFailsafe: false, replayAfterAck: false },
      tools: [],
    }));
    try {
      const descriptor = loadMemoryDescriptor({ descriptorPath: custom, host: 'opencode' });
      expect(descriptor.fallback.localFailsafe).toBe(false);
      expect(descriptor.fallback.replayAfterAck).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('derives workflowMethods from tools when the descriptor omits the map', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-memory-derive-'));
    const custom = path.join(tmp, 'memory-descriptor.json');
    fs.writeFileSync(custom, JSON.stringify({
      host: 'opencode',
      tools: ['memory_list', 'todo_query'],
    }));
    try {
      const descriptor = loadMemoryDescriptor({ descriptorPath: custom, host: 'opencode' });
      expect(descriptor.loaded).toBe(true);
      expect(descriptor.workflowMethods.memory_list).toBe('workflow.memory.list');
      expect(descriptor.workflowMethods.todo_query).toBeUndefined();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('returns an unloaded descriptor when the file is missing', () => {
    const missing = path.join(os.tmpdir(), `missing-memory-descriptor-${Date.now()}.json`);
    const descriptor = loadMemoryDescriptor({ descriptorPath: missing, host: 'opencode' });
    expect(descriptor.loaded).toBe(false);
    expect(descriptor.host).toBe('opencode');
    expect(descriptor.injection.emptyFallback).toBe('REQUIRED MEMORIES - None.');
  });

  test('resolves plugin root and descriptor path from options and env', () => {
    expect(getMemoryPluginRoot(root)).toBe(path.resolve(root));
    expect(getMemoryDescriptorPath(root, '/tmp/custom.json')).toBe('/tmp/custom.json');
    expect(getMemoryDescriptorPath(root)).toBe(path.join(path.resolve(root), 'memory-descriptor.json'));
    expect(resolveMemoryWorkflowMethod('memory_explore')).toBe('workflow.memory.explore');
  });

  test('renders explicit None when the stubbed memory fetch is empty', async () => {
    const context = await getRequiredMemoryContext({
      pluginRoot: root,
      fetchOverride: () => '',
    });
    expect(context).toBe('REQUIRED MEMORIES - None.');
  });

  test('renders descriptor prefix plus raw memory text from a stubbed fetch', async () => {
    const yaml = `type: result
payload:
  result:
    items:
      - id: MEMORY-REQ-001
        text: Raw memory text.
`;
    const context = await getRequiredMemoryContext({
      pluginRoot: root,
      fetchOverride: () => yaml,
    });
    expect(context).toBe('REQUIRED MEMORIES - MEMORY-REQ-001: Raw memory text.');
  });

  test('uses a custom descriptor path for prefix and empty fallback', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-memory-desc-'));
    const custom = path.join(tmp, 'custom-memory-descriptor.json');
    fs.writeFileSync(
      custom,
      JSON.stringify({
        host: 'opencode',
        injection: {
          requiredMemoriesPrefix: 'CUSTOM MEMORIES -',
          emptyFallback: 'CUSTOM MEMORIES - None.',
        },
        tools: ['memory_list'],
        workflowMethods: { memory_list: 'workflow.memory.list' },
      }),
    );
    process.env.MCP_MEMORY_DESCRIPTOR_PATH = custom;
    try {
      const context = await getRequiredMemoryContext({
        pluginRoot: root,
        fetchOverride: () => '',
      });
      expect(context).toBe('CUSTOM MEMORIES - None.');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('fail-softs to None when the memory fetch throws', async () => {
    const context = await getRequiredMemoryContext({
      pluginRoot: root,
      fetchOverride: () => {
        throw new Error('mcp unavailable');
      },
    });
    expect(context).toBe('REQUIRED MEMORIES - None.');
  });

  test('fail-softs when the descriptor JSON is invalid', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-memory-bad-'));
    const custom = path.join(tmp, 'broken-memory-descriptor.json');
    fs.writeFileSync(custom, '{not-json');
    try {
      const context = await getRequiredMemoryContext({
        descriptorPath: custom,
        fetchOverride: () => '',
      });
      expect(context).toBe('REQUIRED MEMORIES - None.');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('chat.message is the request-boundary hook and receives injected parts', async () => {
    expect(isRequestBoundaryHook('chat.message')).toBe(true);
    expect(isRequestBoundaryHook('session_begin_turn')).toBe(false);

    const output = { parts: [{ type: 'text', text: 'user prompt' }] };
    const parts = await applyRequiredMemoryToChatMessage(output, {
      pluginRoot: root,
      fetchOverride: () =>
        JSON.stringify({
          payload: { result: { items: [{ id: 'MEMORY-REQ-001', text: 'Descriptor-driven injection.' }] } },
        }),
    });
    expect(parts).toEqual([
      { type: 'text', text: 'user prompt' },
      { type: 'text', text: 'REQUIRED MEMORIES - MEMORY-REQ-001: Descriptor-driven injection.' },
    ]);
    expect(output.parts).toBe(parts);
  });

  test('chat.message injects explicit None and keeps going when memory fetch fails', async () => {
    process.env.MCP_MEMORY_FETCH_ERROR = '1';
    const output = { parts: [{ type: 'text', text: 'user prompt' }] };
    const parts = await applyRequiredMemoryToChatMessage(output, { pluginRoot: root });
    expect(parts).toEqual([
      { type: 'text', text: 'user prompt' },
      { type: 'text', text: 'REQUIRED MEMORIES - None.' },
    ]);
  });

  test('does not duplicate an already-injected required-memory part', async () => {
    const output = {
      parts: [{ type: 'text', text: 'REQUIRED MEMORIES - MEMORY-REQ-001: Descriptor-driven injection.' }],
    };
    const parts = await applyRequiredMemoryToChatMessage(output, {
      pluginRoot: root,
      fetchOverride: () =>
        JSON.stringify({
          payload: { result: { items: [{ id: 'MEMORY-REQ-001', text: 'Descriptor-driven injection.' }] } },
        }),
    });
    expect(parts).toHaveLength(1);
  });

  test('creates parts when the chat.message output has none', async () => {
    const created = await applyRequiredMemoryToChatMessage(undefined, {
      pluginRoot: root,
      fetchOverride: () => '',
    });
    expect(created).toEqual([{ type: 'text', text: 'REQUIRED MEMORIES - None.' }]);
  });

  test('falls through invalid JSON-looking payloads to an empty item list', () => {
    expect(convertToMemoryItems('{% not-json and not-yaml')).toEqual([]);
  });

  test('parses JSON, YAML, and line-oriented memory items', () => {
    expect(
      convertToMemoryItems({ payload: { result: { items: [{ id: 'MEMORY-REQ-002', text: 'From object.' }] } } }),
    ).toEqual([{ id: 'MEMORY-REQ-002', text: 'From object.' }]);
    expect(
      convertToMemoryItems('id: MEMORY-REQ-003\ntext: From lines.'),
    ).toEqual([{ id: 'MEMORY-REQ-003', text: 'From lines.' }]);
    expect(convertToMemoryItems([{ Id: 'MEMORY-REQ-005', Text: 'Pascal case.' }])).toEqual([
      { id: 'MEMORY-REQ-005', text: 'Pascal case.' },
    ]);
    expect(convertToMemoryItems('')).toEqual([]);
  });

  test('formats multiline memory text without losing the remainder', () => {
    const text = formatRequiredMemoryContext(undefined, [
      { id: 'MEMORY-REQ-004', text: 'First line.\nSecond line.' },
    ]);
    expect(text).toBe('REQUIRED MEMORIES - MEMORY-REQ-004: First line.\nSecond line.');
  });

  test('mergeRequiredMemoryIntoParts is idempotent for the same context', () => {
    const first = mergeRequiredMemoryIntoParts([{ type: 'text', text: 'user prompt' }], 'REQUIRED MEMORIES - None.');
    const second = mergeRequiredMemoryIntoParts(first, 'REQUIRED MEMORIES - None.');
    expect(second).toEqual([
      { type: 'text', text: 'user prompt' },
      { type: 'text', text: 'REQUIRED MEMORIES - None.' },
    ]);
    expect(mergeRequiredMemoryIntoParts(undefined, '')).toEqual([]);
  });

  test('fetches through a REPL bridge and logs the Effective list call', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-memory-bridge-'));
    const log = path.join(tmp, 'repl-log.txt');
    fs.writeFileSync(log, '');
    process.env.MCP_PLUGIN_REPL_LOG = log;
    process.env.MCP_MEMORY_REPL_RESPONSE = JSON.stringify({
      payload: { result: { items: [{ id: 'MEMORY-REQ-006', text: 'From env stub.' }] } },
    });
    try {
      const context = await getRequiredMemoryContext({ pluginRoot: root });
      expect(context).toBe('REQUIRED MEMORIES - MEMORY-REQ-006: From env stub.');
      const logged = fs.readFileSync(log, 'utf8');
      expect(logged).toMatch(/workflow\.memory\.list/);
      expect(logged).toMatch(/scope: Effective/);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('uses MCP_PLUGIN_REPL_RESPONSE when the REPL log seam has no memory stub', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-memory-repl-'));
    const log = path.join(tmp, 'repl-log.txt');
    fs.writeFileSync(log, '');
    process.env.MCP_PLUGIN_REPL_LOG = log;
    process.env.MCP_PLUGIN_REPL_RESPONSE = JSON.stringify({
      payload: { result: { items: [{ id: 'MEMORY-REQ-009', text: 'From plugin env.' }] } },
    });
    delete process.env.MCP_MEMORY_REPL_RESPONSE;
    try {
      const context = await getRequiredMemoryContext({ pluginRoot: root });
      expect(context).toBe('REQUIRED MEMORIES - MEMORY-REQ-009: From plugin env.');
      await expect(
        invokeMemoryWorkflow('memory_list', { scope: 'Effective' }, { pluginRoot: root }),
      ).resolves.toContain('MEMORY-REQ-009');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('throws when no fetch path is available', async () => {
    await expect(fetchRequiredMemoryResponse({ pluginRoot: root })).rejects.toThrow(
      'No memory fetch path available',
    );
  });

  test('reads MCP_MEMORY_REPL_RESPONSE without a REPL log seam', async () => {
    process.env.MCP_MEMORY_REPL_RESPONSE = JSON.stringify({
      result: { Items: [{ id: 'MEMORY-REQ-008', text: 'From memory env.' }] },
    });
    await expect(fetchRequiredMemoryResponse({ pluginRoot: root })).resolves.toContain('MEMORY-REQ-008');
    const context = await getRequiredMemoryContext({ pluginRoot: root });
    expect(context).toBe('REQUIRED MEMORIES - MEMORY-REQ-008: From memory env.');
  });

  test('uses a live bridge invoke when no fetch override is set', async () => {
    const bridge = {
      async invoke(method: string, params?: Record<string, unknown>) {
        expect(method).toBe('workflow.memory.list');
        expect(params).toEqual({ scope: 'Effective' });
        return { payload: { result: { items: [{ id: 'MEMORY-REQ-007', text: 'From bridge.' }] } } };
      },
    };
    const context = await getRequiredMemoryContext({ pluginRoot: root, bridge });
    expect(context).toBe('REQUIRED MEMORIES - MEMORY-REQ-007: From bridge.');

    const stringBridge = {
      async invoke() {
        return JSON.stringify({
          payload: { result: { items: [{ id: 'MEMORY-REQ-010', text: 'From string bridge.' }] } },
        });
      },
    };
    await expect(getRequiredMemoryContext({ pluginRoot: root, bridge: stringBridge })).resolves.toBe(
      'REQUIRED MEMORIES - MEMORY-REQ-010: From string bridge.',
    );
  });

  test('invokeMemoryWorkflow resolves aliases through the descriptor registry', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-memory-invoke-'));
    const log = path.join(tmp, 'repl-log.txt');
    fs.writeFileSync(log, '');
    process.env.MCP_PLUGIN_REPL_LOG = log;
    process.env.MCP_MEMORY_REPL_RESPONSE = 'type: result\npayload:\n  result:\n    ok: true\n';
    try {
      await invokeMemoryWorkflow('memory_recall', { query: 'auth' }, { pluginRoot: root });
      const logged = fs.readFileSync(log, 'utf8');
      expect(logged).toMatch(/workflow\.memory\.recall/);
      expect(logged).toMatch(/query: auth/);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('invokeMemoryWorkflow uses the bridge when no REPL log seam is set', async () => {
    const bridge = {
      async invoke(method: string, params?: Record<string, unknown>) {
        expect(method).toBe('workflow.memory.remember');
        return { ok: true, params };
      },
    };
    await expect(
      invokeMemoryWorkflow('memory_remember', { content: 'persist this' }, { pluginRoot: root, bridge }),
    ).resolves.toEqual({ ok: true, params: { content: 'persist this' } });
    await expect(invokeMemoryWorkflow('not-a-memory-tool', {}, { pluginRoot: root })).rejects.toThrow(
      /Unsupported memory tool alias/,
    );
    await expect(invokeMemoryWorkflow('memory_list', {}, { pluginRoot: root })).rejects.toThrow(
      /No REPL bridge available/,
    );
  });

  test('src/plugin.ts wires chat.message through required-memory injection', () => {
    const source = fs.readFileSync(path.join(root, 'src', 'plugin.ts'), 'utf8');
    const helper = fs.readFileSync(path.join(root, 'src', 'memory-context.ts'), 'utf8');
    expect(source).toContain('applyRequiredMemoryToChatMessage');
    expect(source).toContain("'chat.message'");
    expect(source).toContain('memory-context');
    expect(helper).toContain('workflow.memory.list');
    expect(helper).toContain("scope: 'Effective'");
  });
});
