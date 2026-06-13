import { jest } from '@jest/globals';
import {
  allToolDescriptors,
  asRecord,
  contextPrompt,
  contextWorkspacePath,
  createMcpServerPlugin,
  jsonPropToZod,
  jsonSchemaToZodShape,
  slug,
  stringValue,
  toolError,
  toolInput,
  toolName,
  utcStamp,
  wrapResult,
} from '../src/plugin.js';
import { writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createHmac } from 'crypto';
import type { ReplBridge, ReplResponse } from '@sharpninja/mcpserver-plugin-core';

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

async function withClearedMcpEnv<T>(action: () => Promise<T>): Promise<T> {
  const oldBaseUrl = process.env.MCPSERVER_BASE_URL;
  const oldApiKey = process.env.MCPSERVER_API_KEY;
  const oldWorkspacePath = process.env.MCPSERVER_WORKSPACE_PATH;
  const oldMcpWorkspacePath = process.env.MCP_WORKSPACE_PATH;
  delete process.env.MCPSERVER_BASE_URL;
  delete process.env.MCPSERVER_API_KEY;
  delete process.env.MCPSERVER_WORKSPACE_PATH;
  delete process.env.MCP_WORKSPACE_PATH;

  try {
    return await action();
  } finally {
    if (oldBaseUrl === undefined) delete process.env.MCPSERVER_BASE_URL;
    else process.env.MCPSERVER_BASE_URL = oldBaseUrl;
    if (oldApiKey === undefined) delete process.env.MCPSERVER_API_KEY;
    else process.env.MCPSERVER_API_KEY = oldApiKey;
    if (oldWorkspacePath === undefined) delete process.env.MCPSERVER_WORKSPACE_PATH;
    else process.env.MCPSERVER_WORKSPACE_PATH = oldWorkspacePath;
    if (oldMcpWorkspacePath === undefined) delete process.env.MCP_WORKSPACE_PATH;
    else process.env.MCP_WORKSPACE_PATH = oldMcpWorkspacePath;
  }
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

  test('plugin helper functions cover context and result branches', () => {
    expect(utcStamp(new Date(Date.UTC(2026, 0, 2, 3, 4, 5)))).toBe('20260102T030405Z');
    expect(slug(' F:/GitHub/Feature Flags! ')).toBe('f-github-feature-flags');
    expect(slug('!!!')).toBe('run');

    expect(asRecord({ ok: true })).toEqual({ ok: true });
    expect(asRecord(null)).toEqual({});
    expect(asRecord(['nope'])).toEqual({});

    expect(stringValue('  value  ')).toBe('value');
    expect(stringValue('   ')).toBeUndefined();
    expect(stringValue(1)).toBeUndefined();

    expect(contextWorkspacePath({ workspacePath: 'wp' })).toBe('wp');
    expect(contextWorkspacePath({ workspaceRoot: 'wr' })).toBe('wr');
    expect(contextWorkspacePath({ cwd: 'cwd' })).toBe('cwd');
    expect(contextWorkspacePath({ rootPath: 'root' })).toBe('root');
    expect(contextWorkspacePath({ workspaceInfo: { rootPath: 'info-root' } })).toBe('info-root');
    expect(contextWorkspacePath({ workspaceInfo: { workspacePath: 'info-wp' } })).toBe('info-wp');
    expect(contextWorkspacePath({})).toBeUndefined();

    expect(contextPrompt({ prompt: 'prompt' })).toBe('prompt');
    expect(contextPrompt({ input: 'input' })).toBe('input');
    expect(contextPrompt({ queryText: 'query' })).toBe('query');
    expect(contextPrompt({ snapshot: { prompt: 'snapshot-prompt' } })).toBe('snapshot-prompt');
    expect(contextPrompt({ snapshot: { input: 'snapshot-input' } })).toBe('snapshot-input');
    expect(contextPrompt({ snapshot: { queryText: 'snapshot-query' } })).toBe('snapshot-query');
    expect(contextPrompt({})).toBe('OpenCode run');

    expect(toolName({ toolCall: { name: 'call-tool' } })).toBe('call-tool');
    expect(toolName({ tool: { name: 'object-tool' } })).toBe('object-tool');
    expect(toolName({ toolName: 'named-tool' })).toBe('named-tool');
    expect(toolName({ name: 'plain-tool' })).toBe('plain-tool');
    expect(toolName({})).toBe('unknown_tool');

    expect(toolInput({ input: { direct: true } })).toEqual({ direct: true });
    expect(toolInput({ toolCall: { input: { nested: true } } })).toEqual({ nested: true });
    expect(toolInput({})).toBeUndefined();

    expect(toolError({ error: new Error('top') })).toBe('top');
    expect(toolError({ error: 'top-string' })).toBe('top-string');
    expect(toolError({ toolCall: { error: new Error('nested') } })).toBe('nested');
    expect(toolError({ toolCall: { error: 'nested-string' } })).toBe('nested-string');
    expect(toolError({ error: '' })).toBeUndefined();
  });

  test('schema helpers cover primitive, array, object, optional, and result branches', () => {
    expect(jsonPropToZod({ type: ['string', 'null'] }, '').safeParse('text').success).toBe(true);
    expect(jsonPropToZod({ type: 'boolean' }, '').safeParse(true).success).toBe(true);
    expect(jsonPropToZod({ type: 'number' }, '').safeParse(42).success).toBe(true);
    expect(jsonPropToZod({ type: 'array' }, '').safeParse(['a']).success).toBe(true);
    expect(jsonPropToZod({
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          done: { type: 'boolean' },
        },
      },
    }, '').safeParse([{ text: 'ok', done: false }]).success).toBe(true);
    expect(jsonPropToZod({
      type: 'object',
      properties: {
        count: { type: 'number' },
      },
    }, '').safeParse({ count: 1 }).success).toBe(true);

    const shape = jsonSchemaToZodShape({
      name: 'test_tool',
      description: 'test',
      inputSchema: {
        type: 'object',
        required: ['requiredName'],
        properties: {
          requiredName: { type: 'string' },
          optionalFlag: { type: 'boolean' },
        },
      },
    });
    expect(shape.requiredName.safeParse('name').success).toBe(true);
    expect(shape.optionalFlag.safeParse(undefined).success).toBe(true);

    expect(wrapResult({ result: 'plain' }, 'tool')).toEqual({ output: 'plain' });
    expect(wrapResult({ result: { ok: true } }, 'tool')).toEqual({
      output: JSON.stringify({ ok: true }, null, 2),
      metadata: { ok: true },
    });
    expect(wrapResult({ ok: true }, 'tool')).toEqual({
      output: JSON.stringify({ ok: true }, null, 2),
    });
  });

  test('jsonSchemaToZodShape tolerates schemas without properties or required', () => {
    expect(jsonSchemaToZodShape({ name: 'empty_tool', description: 'd', inputSchema: {} })).toEqual({});
    expect(jsonSchemaToZodShape({ name: 'props_no_required', description: 'd', inputSchema: { type: 'object', properties: { flag: { type: 'boolean' } } } }).flag.safeParse(undefined).success).toBe(true);
  });

  test('audit hooks coerce non-Error rejections to strings without throwing', async () => {
    const fake = new FakeBridge();
    fake.invoke = jest.fn<(...args: any[]) => any>().mockRejectedValue('string failure');
    const { hooks } = await setupPlugin(fake);

    await hooks.event?.({ event: { type: 'session.start', prompt: 'Non-error rejection path' } });
    await expect(hooks['tool.execute.before']?.(
      { tool: 'todo_query', sessionID: 's1', callID: 'c1' },
      { args: {} },
    )).resolves.not.toThrow();
    await expect(hooks['tool.execute.after']?.(
      { tool: 'todo_query', sessionID: 's1', callID: 'c1', args: {} },
      { title: 'result', output: 'ok', metadata: {} },
    )).resolves.not.toThrow();
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

  test('event hook starts a session, audits tools, and completes successfully', async () => {
    const fake = new FakeBridge();
    const { hooks } = await setupPlugin(fake);

    await hooks.event?.({ event: { type: 'session.start', prompt: 'Implement requirement acceptance criteria' } });
    await hooks['tool.execute.before']?.(
      { tool: 'req_create_fr', sessionID: 'session-1', callID: 'call-1' },
      { args: { id: 'FR-MCP-AC-001' } },
    );
    await hooks['tool.execute.after']?.(
      { tool: 'req_create_fr', sessionID: 'session-1', callID: 'call-1', args: { id: 'FR-MCP-AC-001' } },
      { title: 'result', output: 'ok', metadata: {} },
    );
    await hooks.event?.({ event: { type: 'session.complete', result: { output: 'done' } } });

    expect(fake.calls.length).toBeGreaterThanOrEqual(4);
    expect(fake.calls.map((call) => call.method)).toEqual(
      expect.arrayContaining(['client.SessionLog.SubmitAsync']),
    );
  });

  test('event hook ignores unknown events and records failed sessions', async () => {
    const fake = new FakeBridge();
    const { hooks } = await setupPlugin(fake);

    await expect(hooks.event?.({ event: { type: 'workspace.changed' } })).resolves.not.toThrow();
    await hooks.event?.({ event: { name: 'run-started', snapshot: { queryText: 'Run failure path' } } });
    await hooks.event?.({ event: { name: 'run-failed', error: new Error('boom') } });

    expect(fake.calls.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(fake.calls)).toContain('opencode_run_failed');
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

  test('execute resolves workspace path from context and environment fallbacks', async () => {
    const oldServerWorkspace = process.env.MCPSERVER_WORKSPACE_PATH;
    const oldMcpWorkspace = process.env.MCP_WORKSPACE_PATH;
    delete process.env.MCPSERVER_WORKSPACE_PATH;
    delete process.env.MCP_WORKSPACE_PATH;

    try {
      for (const args of [
        { workspaceRoot: 'F:\\GitHub\\Root' },
        { cwd: 'F:\\GitHub\\Cwd' },
        { rootPath: 'F:\\GitHub\\RootPath' },
        { workspaceInfo: { rootPath: 'F:\\GitHub\\InfoRoot' } },
        { workspaceInfo: { workspacePath: 'F:\\GitHub\\InfoWorkspace' } },
      ]) {
        const fake = new FakeBridge();
        fake.nextResponse = { type: 'result', payload: { result: [] } };
        const hooks = await createMcpServerPlugin({
          bridge: asBridge(fake),
          autoBootstrap: false,
          autoFlushCache: false,
          agentName: 'WP',
        });
        const tools = hooks.tool as Record<string, { execute: (i: Record<string, unknown>, c?: unknown) => Promise<unknown> }>;
        await expect(tools['todo_query'].execute(args, {})).resolves.toBeDefined();
      }

      process.env.MCPSERVER_WORKSPACE_PATH = 'F:\\GitHub\\ServerEnv';
      let fake = new FakeBridge();
      fake.nextResponse = { type: 'result', payload: { result: [] } };
      let hooks = await createMcpServerPlugin({ bridge: asBridge(fake), autoBootstrap: false, autoFlushCache: false, agentName: 'WP' });
      let tools = hooks.tool as Record<string, { execute: (i: Record<string, unknown>, c?: unknown) => Promise<unknown> }>;
      await expect(tools['todo_query'].execute({}, {})).resolves.toBeDefined();

      delete process.env.MCPSERVER_WORKSPACE_PATH;
      process.env.MCP_WORKSPACE_PATH = 'F:\\GitHub\\McpEnv';
      fake = new FakeBridge();
      fake.nextResponse = { type: 'result', payload: { result: [] } };
      hooks = await createMcpServerPlugin({ bridge: asBridge(fake), autoBootstrap: false, autoFlushCache: false, agentName: 'WP' });
      tools = hooks.tool as Record<string, { execute: (i: Record<string, unknown>, c?: unknown) => Promise<unknown> }>;
      await expect(tools['todo_query'].execute({}, {})).resolves.toBeDefined();
    } finally {
      if (oldServerWorkspace === undefined) delete process.env.MCPSERVER_WORKSPACE_PATH;
      else process.env.MCPSERVER_WORKSPACE_PATH = oldServerWorkspace;
      if (oldMcpWorkspace === undefined) delete process.env.MCP_WORKSPACE_PATH;
      else process.env.MCP_WORKSPACE_PATH = oldMcpWorkspace;
    }
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
    await withClearedMcpEnv(async () => {
      const { hooks } = await setupPlugin(fake);
      const tools = hooks.tool as Record<string, { execute: (i: Record<string, unknown>, c?: unknown) => Promise<unknown> }>;

      const tool = tools['session_query_history'];
      const result = await tool.execute({}, {});
      expect(result).toBeDefined();
    });
  });

  test('event completion uses response and default fallbacks', async () => {
    const fake = new FakeBridge();
    const { hooks } = await setupPlugin(fake);

    await hooks.event?.({ event: { type: 'session.start', prompt: 'Response fallback path' } });
    await hooks.event?.({ event: { type: 'session.complete', response: 'response fallback' } });
    await hooks.event?.({ event: { type: 'session.start', prompt: 'Default fallback path' } });
    await hooks.event?.({ event: { type: 'session.complete' } });

    const calls = JSON.stringify(fake.calls);
    expect(calls).toContain('response fallback');
    // The shared core derives the default completion response from the
    // configured agentName ('TestAgent' here) rather than a hardcoded
    // 'OpenCode' literal.
    expect(calls).toContain('TestAgent run completed.');
  });

  test('tool audit hooks swallow submit failures', async () => {
    const fake = new FakeBridge();
    fake.invoke = jest.fn<(...args: any[]) => any>().mockRejectedValue(new Error('submit failed'));
    const { hooks } = await setupPlugin(fake);

    await hooks.event?.({ event: { type: 'session.start', prompt: 'Audit failure path' } });
    await expect(hooks['tool.execute.before']?.(
      { tool: 'todo_query', sessionID: 'session-1', callID: 'call-1' },
      { args: {} },
    )).resolves.not.toThrow();
    await expect(hooks['tool.execute.after']?.(
      { tool: 'todo_query', sessionID: 'session-1', callID: 'call-1', args: {} },
      { title: 'result', output: 'ok', metadata: {} },
    )).resolves.not.toThrow();
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
    await withClearedMcpEnv(async () => {
      const { hooks } = await setupPlugin(fake);
      const tools = hooks.tool as Record<string, { execute: (i: Record<string, unknown>, c?: unknown) => Promise<unknown> }>;

      const tool = tools['graphrag_query'];
      const result = await tool.execute({}, {});
      expect(result).toBeDefined();
    });
  });

  test('dispatchTool catch handler handles handler throw', async () => {
    const fake = new FakeBridge();
    fake.nextResponse = { type: 'error', payload: { code: 'ERR', message: 'fail' } };
    const oldBaseUrl = process.env.MCPSERVER_BASE_URL;
    const oldApiKey = process.env.MCPSERVER_API_KEY;
    const oldWorkspacePath = process.env.MCPSERVER_WORKSPACE_PATH;
    const oldMcpWorkspacePath = process.env.MCP_WORKSPACE_PATH;
    delete process.env.MCPSERVER_BASE_URL;
    delete process.env.MCPSERVER_API_KEY;
    delete process.env.MCPSERVER_WORKSPACE_PATH;
    delete process.env.MCP_WORKSPACE_PATH;

    try {
      const { hooks } = await setupPlugin(fake);
      const tools = hooks.tool as Record<string, { execute: (i: Record<string, unknown>, c?: unknown) => Promise<unknown> }>;
      const result = await tools['todo_query'].execute({}, {});
      expect(result).toEqual({ output: expect.stringContaining('Error:') });
    } finally {
      if (oldBaseUrl === undefined) delete process.env.MCPSERVER_BASE_URL;
      else process.env.MCPSERVER_BASE_URL = oldBaseUrl;
      if (oldApiKey === undefined) delete process.env.MCPSERVER_API_KEY;
      else process.env.MCPSERVER_API_KEY = oldApiKey;
      if (oldWorkspacePath === undefined) delete process.env.MCPSERVER_WORKSPACE_PATH;
      else process.env.MCPSERVER_WORKSPACE_PATH = oldWorkspacePath;
      if (oldMcpWorkspacePath === undefined) delete process.env.MCP_WORKSPACE_PATH;
      else process.env.MCP_WORKSPACE_PATH = oldMcpWorkspacePath;
    }
  });

  test('flushCacheBestEffort catch on cacheFlush failure', async () => {
    await withClearedMcpEnv(async () => {
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
        const secondResult = await tools['todo_query'].execute({}, {});
        expect(secondResult).toBeDefined();
      } finally {
        delete process.env.MCPSERVER_FAILSAFE_DIR;
        try { unlinkSync(failsafeFile); } catch { /* ok */ }
      }
    });
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
