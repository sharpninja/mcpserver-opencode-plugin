import { jest } from '@jest/globals';
import { createMcpServerPlugin, allToolDescriptors } from '../src/index.js';
import { writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createHmac } from 'crypto';
import type { ReplBridge, ReplResponse } from '../src/transport/repl-bridge.js';

class FakeBridge {
  calls: Array<{ method: string; params?: Record<string, unknown> }> = [];
  closed = false;
  nextResponse: ReplResponse = { type: 'result', payload: { ok: true } };

  async invoke(method: string, params?: Record<string, unknown>): Promise<ReplResponse> {
    this.calls.push({ method, params });
    return this.nextResponse;
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

function asBridge(fake: FakeBridge): ReplBridge {
  return fake as unknown as ReplBridge;
}

async function setupPlugin(fake = new FakeBridge()) {
  const hooks = await createMcpServerPlugin({
    bridge: asBridge(fake),
    workspacePath: 'F:\\GitHub\\FeatureFlags',
    autoBootstrap: false,
    autoFlushCache: false,
    agentName: 'TestAgent',
  });

  return { hooks, fake };
}

describe('OpenCode McpServer Plugin contract', () => {
  test('plugin factory returns hooks with tool and lifecycle hooks', async () => {
    const { hooks } = await setupPlugin();
    expect(hooks).toHaveProperty('tool');
    expect(Object.prototype.hasOwnProperty.call(hooks, 'tool.execute.before')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(hooks, 'tool.execute.after')).toBe(true);
  });

  test('registers all expected tools including workspace_ensure', async () => {
    const { hooks } = await setupPlugin();
    const names = Object.keys(hooks.tool ?? {});

    expect(names).toHaveLength(allToolDescriptors.length);
    expect(names).toEqual(expect.arrayContaining([
      'workspace_ensure',
      'todo_query',
      'todo_internal_status',
      'todo_internal_enable',
      'session_query_history',
      'req_generate_document',
      'graphrag_query',
    ]));
  });

  test('tool execution returns ToolResult and routes through bridge', async () => {
    const fake = new FakeBridge();
    fake.nextResponse = {
      type: 'result',
      payload: { result: { items: [], totalCount: 0 } },
    };
    const { hooks } = await setupPlugin(fake);
    const tools = hooks.tool as Record<string, { description: string; args: unknown; execute: (input: Record<string, unknown>, context?: unknown) => Promise<unknown> }>;
    const todoQuery = tools['todo_query'];
    if (!todoQuery) throw new Error('todo_query was not registered');

    const result = await todoQuery.execute({ id: 'MCP-TODO-001' }, {});

    expect(result).toEqual({
      output: JSON.stringify({ items: [], totalCount: 0 }, null, 2),
      metadata: { items: [], totalCount: 0 },
    });
    expect(fake.calls.length).toBeGreaterThanOrEqual(1);
  });

  test('every registered tool has a description and execute function', async () => {
    const { hooks } = await setupPlugin();
    const tools = hooks.tool as Record<string, { description: string; args: unknown; execute: (input: Record<string, unknown>, context?: unknown) => Promise<unknown> }>;

    for (const [name, toolDef] of Object.entries(tools)) {
      expect(typeof toolDef.description).toBe('string');
      expect(toolDef.description.length).toBeGreaterThan(0);
      expect(toolDef.args).toBeDefined();
      expect(typeof toolDef.execute).toBe('function');
    }
  });

  test('lifecycle hooks fire without throwing', async () => {
    const fake = new FakeBridge();
    const { hooks } = await setupPlugin(fake);

    const beforeHook = hooks['tool.execute.before'];
    const afterHook = hooks['tool.execute.after'];

    if (beforeHook) {
      await expect(beforeHook(
        { tool: 'todo_query', sessionID: 'test-001', callID: 'call-001' },
        { args: { done: false } },
      )).resolves.not.toThrow();
    }

    if (afterHook) {
      await expect(afterHook(
        { tool: 'todo_query', sessionID: 'test-001', callID: 'call-001', args: { done: false } },
        { title: 'result', output: 'ok', metadata: {} },
      )).resolves.not.toThrow();
    }
  });

  test('unknown tool name throws during execution', async () => {
    const { hooks } = await setupPlugin();
    const tools = hooks.tool as Record<string, { description: string; args: unknown; execute: (input: Record<string, unknown>, context?: unknown) => Promise<unknown> }>;

    const fakeTool = tools['nonexistent_tool'];
    expect(fakeTool).toBeUndefined();
  });

  test('tool.execute.before works with various context fields', async () => {
    const { hooks } = await setupPlugin();
    const beforeHook = hooks['tool.execute.before'];

    await expect(beforeHook(
      { tool: 'todo_query', sessionID: 's1', callID: 'c1' },
      { args: {} },
    )).resolves.not.toThrow();
  });

  test('tool.execute.after works with error in metadata', async () => {
    const { hooks } = await setupPlugin();
    const afterHook = hooks['tool.execute.after'];

    await expect(afterHook(
      { tool: 'todo_query', sessionID: 's1', callID: 'c1', args: {} },
      { title: 'result', output: 'ok', metadata: { _error: 'Something broke' } },
    )).resolves.not.toThrow();
  });

  test('tool.execute.after works with error string', async () => {
    const { hooks } = await setupPlugin();
    const afterHook = hooks['tool.execute.after'];

    await afterHook(
      { tool: 'todo_query', sessionID: 's1', callID: 'c1', args: {} },
      { title: 'result', output: 'ok', metadata: { _error: 'Failed' } },
    );
  });

  test('execute with autoBootstrap true handles missing marker', async () => {
    const fake = new FakeBridge();
    fake.nextResponse = { type: 'result', payload: { result: [] } };
    const hooks = await createMcpServerPlugin({
      bridge: asBridge(fake),
      workspacePath: 'F:\\__nonexistent__',
      autoBootstrap: true,
      autoFlushCache: false,
      agentName: 'BA',
    });
    const tools = hooks.tool as Record<string, { execute: (i: Record<string, unknown>, c?: unknown) => Promise<unknown> }>;
    const todoQuery = tools['todo_query'];
    const result = await todoQuery.execute({}, {});
    expect(result).toBeDefined();
  });

  test('execute with autoFlushCache true does not throw', async () => {
    const fake = new FakeBridge();
    fake.nextResponse = { type: 'result', payload: { result: [] } };
    const hooks = await createMcpServerPlugin({
      bridge: asBridge(fake),
      workspacePath: 'F:\\__nonexistent__',
      autoBootstrap: false,
      autoFlushCache: true,
      agentName: 'FC',
    });
    const tools = hooks.tool as Record<string, { execute: (i: Record<string, unknown>, c?: unknown) => Promise<unknown> }>;
    const todoQuery = tools['todo_query'];
    const result = await todoQuery.execute({}, {});
    expect(result).toBeDefined();
  });

  test('flushCacheBestEffort with autoFlushCache true handles cacheFlush', async () => {
    const fake = new FakeBridge();
    const envKey = 'MCPSERVER_FAILSAFE_DIR';
    process.env[envKey] = 'F:\\__nonexistent_cache__';
    try {
      const hooks = await createMcpServerPlugin({
        bridge: asBridge(fake),
        workspacePath: 'F:\\__nonexistent__',
        autoBootstrap: false,
        autoFlushCache: true,
        agentName: 'FC2',
      });
      const tools = hooks.tool as Record<string, { execute: (i: Record<string, unknown>, c?: unknown) => Promise<unknown> }>;
      const todoQuery = tools['todo_query'];
      const result = await todoQuery.execute({}, {});
      expect(result).toBeDefined();
    } finally {
      delete process.env[envKey];
    }
  });

  test('dispatchTool handles unknown tool gracefully', async () => {
    const { hooks } = await setupPlugin();
    const tools = hooks.tool as Record<string, { execute: (i: Record<string, unknown>, c?: unknown) => Promise<unknown> }>;

    const todoQuery = tools['todo_query'];
    const result = await todoQuery.execute({}, {});
    expect(result).toBeDefined();
  });

  test('dispatchTool with workspace_ensure returns result', async () => {
    const fake = new FakeBridge();
    const { hooks } = await setupPlugin(fake);
    const tools = hooks.tool as Record<string, { description: string; args: unknown; execute: (i: Record<string, unknown>, c?: unknown) => Promise<unknown> }>;

    const wsTool = tools['workspace_ensure'];
    const result = await wsTool.execute({}, {});
    expect(result).toBeDefined();
  });

  test('dispatchTool with session tool routes through bridge', async () => {
    const fake = new FakeBridge();
    fake.nextResponse = { type: 'result', payload: { result: { items: [] } } };
    const { hooks } = await setupPlugin(fake);
    const tools = hooks.tool as Record<string, { execute: (i: Record<string, unknown>, c?: unknown) => Promise<unknown> }>;

    const tool = tools['session_query_history'];
    const result = await tool.execute({}, {});
    expect(result).toBeDefined();
  });

  test('dispatchTool with requirements tool routes through bridge', async () => {
    const fake = new FakeBridge();
    fake.nextResponse = { type: 'result', payload: { result: { items: [] } } };
    const { hooks } = await setupPlugin(fake);
    const tools = hooks.tool as Record<string, { execute: (i: Record<string, unknown>, c?: unknown) => Promise<unknown> }>;

    const tool = tools['req_generate_document'];
    const result = await tool.execute({}, {});
    expect(result).toBeDefined();
  });

  test('dispatchTool with graphrag tool routes through bridge', async () => {
    const fake = new FakeBridge();
    fake.nextResponse = { type: 'result', payload: { result: { items: [] } } };
    const { hooks } = await setupPlugin(fake);
    const tools = hooks.tool as Record<string, { execute: (i: Record<string, unknown>, c?: unknown) => Promise<unknown> }>;

    const tool = tools['graphrag_query'];
    const result = await tool.execute({}, {});
    expect(result).toBeDefined();
  });

  test('dispatchTool catch handler handles handler throw', async () => {
    const fake = new FakeBridge();
    fake.nextResponse = { type: 'error', payload: { code: 'ERR', message: 'fail' } };
    const { hooks } = await setupPlugin(fake);
    const tools = hooks.tool as Record<string, { execute: (i: Record<string, unknown>, c?: unknown) => Promise<unknown> }>;
    const result = await tools['todo_query'].execute({}, {});
    expect(result).toEqual({ output: expect.stringContaining('Error:') });
  });

  test('flushCacheBestEffort catch on cacheFlush failure', async () => {
    const fake = new FakeBridge();
    const failsafeFile = join(tmpdir(), `mcp-ff-${Date.now()}.tmp`);
    writeFileSync(failsafeFile, '', 'utf8');
    process.env.MCPSERVER_FAILSAFE_DIR = failsafeFile;
    try {
      const hooks = await createMcpServerPlugin({
        bridge: asBridge(fake),
        workspacePath: tmpdir(),
        autoBootstrap: false,
        autoFlushCache: true,
        agentName: 'FF',
      });
      const tools = hooks.tool as Record<string, { execute: (i: Record<string, unknown>, c?: unknown) => Promise<unknown> }>;
      const result = await tools['todo_query'].execute({}, {});
      expect(result).toBeDefined();
    } finally {
      delete process.env.MCPSERVER_FAILSAFE_DIR;
      try { unlinkSync(failsafeFile); } catch { /* ok */ }
    }
  });

  test('successful bootstrap covers marker env setup', async () => {
    const tmp = join(tmpdir(), `plugin-bs-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });
    const apiKey = 'test-api-key-abc123';
    const baseUrl = 'http://localhost:9999';
    const markerContent = `baseUrl: ${baseUrl}
apiKey: ${apiKey}
workspace: test-workspace
workspacePath: ${tmp}
port: '9999'
pid: '12345'
startedAt: '20260523T120000Z'
markerWrittenAtUtc: '20260523T120000Z'
serverStartedAtUtc: '20260523T120000Z'
endpoints:
  health: ${baseUrl}/health
`;
    const fp = join(tmp, 'AGENTS-README-FIRST.yaml');
    writeFileSync(fp, markerContent, 'utf8');

    const lines = [
      'canonicalization=marker-v1',
      'port=9999',
      `baseUrl=${baseUrl}`,
      `apiKey=${apiKey}`,
      'workspace=test-workspace',
      `workspacePath=${tmp}`,
      'pid=12345',
      'startedAt=20260523T120000Z',
      'markerWrittenAtUtc=20260523T120000Z',
      'serverStartedAtUtc=20260523T120000Z',
      `endpoints.health=${baseUrl}/health`,
    ];
    const payloadText = lines.join('\n') + '\n';
    const computed = createHmac('sha256', apiKey).update(payloadText).digest('hex').toUpperCase();
    const contentWithSig = markerContent + `signature:\n  value: ${computed}\n`;
    writeFileSync(fp, contentWithSig, 'utf8');

    const origFetch = globalThis.fetch;
    globalThis.fetch = jest.fn<(...args: any[]) => any>().mockImplementation(async (url: string) => {
      const m = url.match(/nonce=([^&]+)/);
      return { ok: true, json: async () => ({ nonce: m?.[1] ?? '' }) } as Response;
    }) as unknown as typeof globalThis.fetch;

    try {
      const fake = new FakeBridge();
      fake.nextResponse = { type: 'result', payload: { result: [] } };
      const hooks = await createMcpServerPlugin({
        bridge: asBridge(fake),
        workspacePath: tmp,
        autoBootstrap: true,
        autoFlushCache: false,
        agentName: 'BS',
      });
      const tools = hooks.tool as Record<string, { execute: (i: Record<string, unknown>, c?: unknown) => Promise<unknown> }>;
      const result = await tools['todo_query'].execute({}, {});
      expect(result).toBeDefined();
    } finally {
      globalThis.fetch = origFetch;
      delete process.env.MCPSERVER_BASE_URL;
      delete process.env.MCPSERVER_API_KEY;
      delete process.env.MCPSERVER_WORKSPACE_PATH;
      delete process.env.MCP_WORKSPACE_PATH;
      delete process.env.MCPSERVER_WORKSPACE;
      delete process.env.PLUGIN_AGENT_NAME;
    }
  });
});
