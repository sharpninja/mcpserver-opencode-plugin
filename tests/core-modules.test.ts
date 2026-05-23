import { jest } from '@jest/globals';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, unlinkSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes, createHmac } from 'crypto';
import type { ReplBridge, ReplResponse } from '../src/transport/repl-bridge.js';

let tmpDir: string;
let markerFile: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'mcpserver-test-'));
});

afterEach(() => {
  try { unlinkSync(markerFile); } catch { /* ok */ }
  try { unlinkSync(join(tmpDir, 'AGENTS-README-FIRST.yaml')); } catch { /* ok */ }
  try { unlinkSync(join(tmpDir, 'nested', 'AGENTS-README-FIRST.yaml')); } catch { /* ok */ }
  delete process.env.MCPSERVER_FAILSAFE_DIR;
  delete process.env.MCPSERVER_BASE_URL;
  delete process.env.MCPSERVER_API_KEY;
  delete process.env.MCPSERVER_WORKSPACE_PATH;
  delete process.env.MCP_WORKSPACE_PATH;
  delete process.env.MCP_CODEX_INTERNAL_TODO;
  delete process.env.MCPSERVER_INTERNAL_TODO_STATE_FILE;
  delete process.env.MCPSERVER_PLUGIN_CACHE_DIR;
});

function writeMarker(overrides: Record<string, string> = {}): string {
  const apiKey = overrides.apiKey || 'test-api-key-abc123';
  const baseUrl = overrides.baseUrl || 'http://localhost:9999';
  const workspace = overrides.workspace || 'test-workspace';
  const workspacePath = overrides.workspacePath || tmpDir;
  const port = overrides.port || '9999';

  const payload = [
    `canonicalization=marker-v1`,
    `port=${port}`,
    `baseUrl=${baseUrl}`,
    `apiKey=${apiKey}`,
    `workspace=${workspace}`,
    `workspacePath=${workspacePath}`,
    `pid=12345`,
    `startedAt=20260523T120000Z`,
    `markerWrittenAtUtc=20260523T120000Z`,
    `serverStartedAtUtc=20260523T120000Z`,
  ].join('\n') + '\n';

  const signature = randomBytes(32).toString('hex').toUpperCase();

  const content = `baseUrl: ${baseUrl}
apiKey: ${apiKey}
workspace: ${workspace}
workspacePath: ${workspacePath}
port: ${port}
pid: '12345'
startedAt: '20260523T120000Z'
markerWrittenAtUtc: '20260523T120000Z'
serverStartedAtUtc: '20260523T120000Z'
signature:
  value: ${signature}
`;

  const fp = join(tmpDir, 'AGENTS-README-FIRST.yaml');
  writeFileSync(fp, content, 'utf8');
  return fp;
}

function writeMarkerWithHmac(): { file: string; apiKey: string; baseUrl: string } {
  const apiKey = 'test-api-key-abc123';
  const baseUrl = 'http://localhost:9999';
  const workspacePath = tmpDir;
  const workspace = 'test-workspace';
  const port = '9999';

  const healthUrl = `${baseUrl}/health`;
  const markerContent = `baseUrl: ${baseUrl}
apiKey: ${apiKey}
workspace: ${workspace}
workspacePath: ${workspacePath}
port: ${port}
pid: '12345'
startedAt: '20260523T120000Z'
markerWrittenAtUtc: '20260523T120000Z'
serverStartedAtUtc: '20260523T120000Z'
endpoints:
  health: ${healthUrl}
`;

  const fp = join(tmpDir, 'AGENTS-README-FIRST.yaml');
  writeFileSync(fp, markerContent, 'utf8');

  const lines = [
    'canonicalization=marker-v1',
    `port=${port}`,
    `baseUrl=${baseUrl}`,
    `apiKey=${apiKey}`,
    `workspace=${workspace}`,
    `workspacePath=${workspacePath}`,
    `pid=12345`,
    `startedAt=20260523T120000Z`,
    `markerWrittenAtUtc=20260523T120000Z`,
    `serverStartedAtUtc=20260523T120000Z`,
    `endpoints.health=${healthUrl}`,
  ];
  const payloadText = lines.join('\n') + '\n';

  const computed = createHmac('sha256', apiKey).update(payloadText).digest('hex').toUpperCase();

  const contentWithSig = markerContent + `signature:\n  value: ${computed}\n`;
  writeFileSync(fp, contentWithSig, 'utf8');

  return { file: fp, apiKey, baseUrl };
}

/* ================================================================
 * marker-resolver tests
 * ================================================================ */
describe('marker-resolver', () => {
  describe('findMarkerFile', () => {
    test('finds marker in current directory', async () => {
      const { findMarkerFile } = await import('../src/discovery/marker-resolver.js');
      markerFile = writeMarker();
      const result = findMarkerFile(tmpDir);
      expect(result).toBe(join(tmpDir, 'AGENTS-README-FIRST.yaml'));
    });

    test('finds marker in parent directory', async () => {
      const { findMarkerFile } = await import('../src/discovery/marker-resolver.js');
      const subDir = join(tmpDir, 'sub');
      mkdirSync(subDir);
      markerFile = writeMarker();
      const result = findMarkerFile(subDir);
      expect(result).toBe(join(tmpDir, 'AGENTS-README-FIRST.yaml'));
    });

    test('returns null when no marker found', async () => {
      const { findMarkerFile } = await import('../src/discovery/marker-resolver.js');
      const result = findMarkerFile(tmpDir);
      expect(result).toBeNull();
    });
  });

  describe('parseMarkerField', () => {
    test('parses top-level field', async () => {
      const { parseMarkerField } = await import('../src/discovery/marker-resolver.js');
      markerFile = writeMarker();
      const result = parseMarkerField(markerFile, 'baseUrl');
      expect(result).toBe('http://localhost:9999');
    });

    test('parses nested endpoints field', async () => {
      const { parseMarkerField } = await import('../src/discovery/marker-resolver.js');
      writeFileSync(join(tmpDir, 'AGENTS-README-FIRST.yaml'), `baseUrl: http://localhost:9999
apiKey: test-key
endpoints:
  health: /health
`, 'utf8');
      markerFile = join(tmpDir, 'AGENTS-README-FIRST.yaml');
      const result = parseMarkerField(markerFile, 'health');
      expect(result).toBe('/health');
    });

    test('returns null for missing field', async () => {
      const { parseMarkerField } = await import('../src/discovery/marker-resolver.js');
      markerFile = writeMarker();
      const result = parseMarkerField(markerFile, 'nonexistent');
      expect(result).toBeNull();
    });

    test('handles content after endpoints section', async () => {
      const { parseMarkerField } = await import('../src/discovery/marker-resolver.js');
      writeFileSync(join(tmpDir, 'AGENTS-README-FIRST.yaml'), `baseUrl: http://localhost:9999
apiKey: test-key
endpoints:
  health: /health
otherSection:
  field: value
`, 'utf8');
      markerFile = join(tmpDir, 'AGENTS-README-FIRST.yaml');
      const result = parseMarkerField(markerFile, 'nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('buildCanonicalPayload', () => {
    test('handles agent_plugins section in verifySignature', async () => {
      const { verifySignature } = await import('../src/discovery/marker-resolver.js');
      const apiKey = 'test-agent-key';
      const baseUrl = 'http://localhost:9999';
      const port = '9999';
      const healthUrl = `${baseUrl}/health`;

      const lines = [
        'canonicalization=marker-v1',
        `port=${port}`,
        `baseUrl=${baseUrl}`,
        `apiKey=${apiKey}`,
        'workspace=test-ws',
        `workspacePath=${tmpDir}`,
        'pid=12345',
        'startedAt=20260523T120000Z',
        'markerWrittenAtUtc=20260523T120000Z',
        'serverStartedAtUtc=20260523T120000Z',
        `endpoints.health=${healthUrl}`,
        'agentPlugins.policy=allow-all',
        'agentPlugins.contractDigest=abc123',
      ];
      const payloadText = lines.join('\n') + '\n';
      const sig = createHmac('sha256', apiKey).update(payloadText).digest('hex').toUpperCase();

      writeFileSync(join(tmpDir, 'AGENTS-README-FIRST.yaml'), `baseUrl: ${baseUrl}
apiKey: ${apiKey}
workspace: test-ws
workspacePath: ${tmpDir}
port: '${port}'
pid: '12345'
startedAt: '20260523T120000Z'
markerWrittenAtUtc: '20260523T120000Z'
serverStartedAtUtc: '20260523T120000Z'
endpoints:
  health: ${healthUrl}
agent_plugins:
  policy: allow-all
  contract_digest: abc123
signature:
  value: ${sig}
`, 'utf8');
      markerFile = join(tmpDir, 'AGENTS-README-FIRST.yaml');
      expect(verifySignature(markerFile)).toBe(true);
    });
  });

  describe('verifySignature', () => {
    test('validates correct HMAC signature', async () => {
      const { verifySignature } = await import('../src/discovery/marker-resolver.js');
      const { file } = writeMarkerWithHmac();
      const result = verifySignature(file);
      expect(result).toBe(true);
    });

    test('fails when apiKey missing', async () => {
      const { verifySignature } = await import('../src/discovery/marker-resolver.js');
      const fp = join(tmpDir, 'AGENTS-README-FIRST.yaml');
      writeFileSync(fp, 'baseUrl: http://localhost:9999\nworkspace: test\n', 'utf8');
      markerFile = fp;
      const result = verifySignature(fp);
      expect(result).toBe(false);
    });

    test('fails when no signature field', async () => {
      const { verifySignature } = await import('../src/discovery/marker-resolver.js');
      const fp = join(tmpDir, 'AGENTS-README-FIRST.yaml');
      writeFileSync(fp, 'baseUrl: http://localhost:9999\napiKey: test-key\n', 'utf8');
      markerFile = fp;
      const result = verifySignature(fp);
      expect(result).toBe(false);
    });

    test('fails when content modified', async () => {
      const { verifySignature } = await import('../src/discovery/marker-resolver.js');
      const { file } = writeMarkerWithHmac();
      const corrupted = readFileSync(file, 'utf8').replace('baseUrl: http://localhost:9999', 'baseUrl: http://localhost:8888');
      writeFileSync(file, corrupted, 'utf8');
      const result = verifySignature(file);
      expect(result).toBe(false);
    });
  });

  describe('fullBootstrap', () => {
    test('returns MarkerContext on success', async () => {
      const { fullBootstrap } = await import('../src/discovery/marker-resolver.js');
      const { file, apiKey, baseUrl } = writeMarkerWithHmac();

      const origFetch = globalThis.fetch;
      globalThis.fetch = jest.fn().mockImplementation(async (url: string) => {
        const m = url.match(/nonce=([^&]+)/);
        return {
          ok: true,
          json: async () => ({ nonce: m ? m[1] : 'unknown' }),
        } as Response;
      }) as unknown as typeof globalThis.fetch;

      try {
        const result = await fullBootstrap(tmpDir);
        expect(result.baseUrl).toBe(baseUrl);
        expect(result.apiKey).toBe(apiKey);
        expect(result.workspacePath).toBe(tmpDir);
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    test('throws on health check failure', async () => {
      const { fullBootstrap } = await import('../src/discovery/marker-resolver.js');
      writeMarkerWithHmac();

      const origFetch = globalThis.fetch;
      globalThis.fetch = jest.fn().mockRejectedValue(new Error('Connection refused')) as unknown as typeof globalThis.fetch;

      try {
        await expect(fullBootstrap(tmpDir)).rejects.toThrow('MCP_UNTRUSTED');
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    test('throws on nonce mismatch', async () => {
      const { fullBootstrap } = await import('../src/discovery/marker-resolver.js');
      writeMarkerWithHmac();

      const origFetch = globalThis.fetch;
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ nonce: 'wrong-nonce' }),
      }) as unknown as typeof globalThis.fetch;

      try {
        await expect(fullBootstrap(tmpDir)).rejects.toThrow('MCP_UNTRUSTED');
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    test('throws when no marker found', async () => {
      const { fullBootstrap } = await import('../src/discovery/marker-resolver.js');
      await expect(fullBootstrap(tmpDir)).rejects.toThrow('MCP_UNTRUSTED');
    });

    test('throws on signature verification failure', async () => {
      const { fullBootstrap } = await import('../src/discovery/marker-resolver.js');
      writeFileSync(join(tmpDir, 'AGENTS-README-FIRST.yaml'), `baseUrl: http://localhost:9999
apiKey: test-key
workspace: test
workspacePath: ${tmpDir}
port: '9999'
signature:
  value: BADSIG
`, 'utf8');
      await expect(fullBootstrap(tmpDir)).rejects.toThrow('MCP_UNTRUSTED: Signature verification failed');
    });
  });
});

/* ================================================================
 * cache-manager tests
 * ================================================================ */
describe('cache-manager', () => {
  beforeEach(() => {
    process.env.MCPSERVER_FAILSAFE_DIR = join(tmpDir, 'failsafe');
  });

  test('cacheWrite creates YAML file', async () => {
    const { cacheWrite } = await import('../src/cache/cache-manager.js');
    const fp = await cacheWrite('test.method', { key: 'value' });
    expect(existsSync(fp)).toBe(true);
    const content = readFileSync(fp, 'utf8');
    expect(content).toContain('test.method');
    expect(content).toContain('key');
    expect(content).toContain('value');
  });

  test('cacheWrite uses env dir', async () => {
    const { cacheWrite } = await import('../src/cache/cache-manager.js');
    const fp = await cacheWrite('test.method');
    expect(fp).toContain(process.env.MCPSERVER_FAILSAFE_DIR!);
  });

  test('cacheDelete removes file', async () => {
    const { cacheWrite, cacheDelete } = await import('../src/cache/cache-manager.js');
    const fp = await cacheWrite('test.method');
    expect(existsSync(fp)).toBe(true);
    await cacheDelete(fp);
    expect(existsSync(fp)).toBe(false);
  });

  test('cacheDelete no error on missing file', async () => {
    const { cacheDelete } = await import('../src/cache/cache-manager.js');
    await expect(cacheDelete(join(tmpDir, 'nonexistent.yaml'))).resolves.not.toThrow();
  });

  test('cacheFlush replays entries', async () => {
    const { cacheWrite, cacheFlush } = await import('../src/cache/cache-manager.js');
    await cacheWrite('test.ping', { data: 1 });

    const bridge = {
      invoke: jest.fn().mockResolvedValue({ type: 'result', payload: { ok: true } }),
    } as unknown as ReplBridge;

    const result = await cacheFlush(bridge);
    expect(result.flushed).toBe(1);
    expect(result.failed).toBe(0);
  });

  test('cacheFlush handles bridge errors', async () => {
    const { cacheWrite, cacheFlush } = await import('../src/cache/cache-manager.js');
    await cacheWrite('test.fail', { data: 1 });

    const bridge = {
      invoke: jest.fn().mockResolvedValue({ type: 'error', payload: { code: 'err' } }),
    } as unknown as ReplBridge;

    const result = await cacheFlush(bridge);
    expect(result.failed).toBe(1);
  });

  test('cacheFlush handles empty dir', async () => {
    const { cacheFlush } = await import('../src/cache/cache-manager.js');
    const bridge = { invoke: jest.fn() } as unknown as ReplBridge;
    const result = await cacheFlush(bridge);
    expect(result.flushed).toBe(0);
    expect(result.failed).toBe(0);
  });
});

/* ================================================================
 * session-shim tests
 * ================================================================ */
describe('SessionShim', () => {
  let SessionShim: any;
  let shim: any;

  beforeAll(async () => {
    const mod = await import('../src/tools/session-shim.js');
    SessionShim = mod.SessionShim;
  });

  beforeEach(() => {
    shim = new SessionShim();
  });

  test('bootstrap is no-op', () => {
    expect(() => shim.bootstrap()).not.toThrow();
  });

  test('open creates session state', () => {
    shim.open({ agent: 'TestAgent', sessionId: 'TA-001', title: 'Test' });
    const state = shim.getState();
    expect(state).not.toBeNull();
    expect(state.sourceType).toBe('TestAgent');
    expect(state.sessionId).toBe('TA-001');
    expect(state.status).toBe('in_progress');
  });

  test('beginTurn starts a turn', () => {
    shim.open({ agent: 'TestAgent', sessionId: 'TA-001', title: 'Test' });
    shim.beginTurn({ requestId: 'req-001', queryTitle: 'Q', queryText: 'Query text' });
    expect(shim.getState().currentTurn).not.toBeUndefined();
    expect(shim.getState().currentTurn.requestId).toBe('req-001');
  });

  test('updateTurn patches fields', () => {
    shim.open({ agent: 'TestAgent', sessionId: 'TA-001', title: 'Test' });
    shim.beginTurn({ requestId: 'req-001', queryTitle: 'Q', queryText: 'Query text' });
    shim.updateTurn({ response: 'Done', interpretation: 'Fixed bug', tokenCount: 150, tags: ['bug'] });
    expect(shim.getState().currentTurn.response).toBe('Done');
    expect(shim.getState().currentTurn.interpretation).toBe('Fixed bug');
    expect(shim.getState().currentTurn.tokenCount).toBe(150);
  });

  test('appendDialog adds dialog items', () => {
    shim.open({ agent: 'TestAgent', sessionId: 'TA-001', title: 'Test' });
    shim.beginTurn({ requestId: 'req-001', queryTitle: 'Q', queryText: 'Query text' });
    shim.appendDialog({
      dialogItems: [{ timestamp: new Date().toISOString(), role: 'model', content: 'thinking...', category: 'reasoning' }],
    });
    expect(shim.getState().currentTurn.dialogItems).toHaveLength(1);
  });

  test('appendActions adds action items', () => {
    shim.open({ agent: 'TestAgent', sessionId: 'TA-001', title: 'Test' });
    shim.beginTurn({ requestId: 'req-001', queryTitle: 'Q', queryText: 'Query text' });
    shim.appendActions({ actions: [{ order: 1, description: 'edit file', type: 'edit', status: 'completed' }] });
    expect(shim.getState().currentTurn.actions).toHaveLength(1);
  });

  test('completeTurn archives turn', () => {
    shim.open({ agent: 'TestAgent', sessionId: 'TA-001', title: 'Test' });
    shim.beginTurn({ requestId: 'req-001', queryTitle: 'Q', queryText: 'Query text' });
    shim.completeTurn({ response: 'Done' });
    expect(shim.getState().currentTurn).toBeUndefined();
    expect(shim.getState().turns).toHaveLength(1);
    expect(shim.getState().turns[0].status).toBe('completed');
  });

  test('failTurn archives turn with error', () => {
    shim.open({ agent: 'TestAgent', sessionId: 'TA-001', title: 'Test' });
    shim.beginTurn({ requestId: 'req-001', queryTitle: 'Q', queryText: 'Query text' });
    shim.failTurn({ errorMessage: 'Something broke', errorCode: 'ERR_001' });
    expect(shim.getState().turns[0].status).toBe('failed');
    expect(shim.getState().turns[0].errorMessage).toBe('Something broke');
  });

  test('close sets final status', () => {
    shim.open({ agent: 'TestAgent', sessionId: 'TA-001', title: 'Test' });
    shim.close({ agent: 'TestAgent', sessionId: 'TA-001', status: 'completed' });
    expect(shim.getState().status).toBe('completed');
  });

  test('close creates state if missing', () => {
    shim.close({ agent: 'TestAgent', sessionId: 'TA-001', status: 'completed' });
    expect(shim.getState()).not.toBeNull();
    expect(shim.getState().status).toBe('completed');
  });

  test('buildSubmitPayload builds correct structure', () => {
    shim.open({ agent: 'TestAgent', sessionId: 'TA-001', title: 'Test session', model: 'gpt-4' });
    shim.beginTurn({ requestId: 'req-001', queryTitle: 'Query', queryText: 'Do something' });
    shim.completeTurn({ response: 'Done' });
    const payload = shim.buildSubmitPayload();
    expect(payload.sessionLog).toBeDefined();
    expect(payload.sessionLog.sourceType).toBe('TestAgent');
    expect(payload.sessionLog.turns).toHaveLength(1);
  });

  test('buildSubmitPayload throws without session', () => {
    expect(() => shim.buildSubmitPayload()).toThrow(/session_open/);
  });

  test('beginTurn throws without session', () => {
    expect(() => shim.beginTurn({ requestId: 'r', queryTitle: 'q', queryText: 'q' })).toThrow(/session_open/);
  });

  test('completeTurn throws without turn', () => {
    shim.open({ agent: 'TestAgent', sessionId: 'TA-001', title: 'Test' });
    expect(() => shim.completeTurn({})).toThrow(/session_begin_turn/);
  });

  test('reset clears state', () => {
    shim.open({ agent: 'TestAgent', sessionId: 'TA-001', title: 'Test' });
    expect(shim.getState()).not.toBeNull();
    shim.reset();
    expect(shim.getState()).toBeNull();
  });

  test('updateTurn no-ops when no args provided', () => {
    shim.open({ agent: 'TestAgent', sessionId: 'TA-001', title: 'Test' });
    shim.beginTurn({ requestId: 'req-001', queryTitle: 'Q', queryText: 'Query text' });
    shim.updateTurn({});
    expect(shim.getState().currentTurn.response).toBeUndefined();
  });
});

/* ================================================================
 * dispatchSessionTool tests
 * ================================================================ */
describe('dispatchSessionTool', () => {
  let dispatchSessionTool: any;
  let syntheticOk: any;
  let SessionShim: any;

  beforeAll(async () => {
    const mod = await import('../src/tools/session-shim.js');
    dispatchSessionTool = mod.dispatchSessionTool;
    syntheticOk = mod.syntheticOk;
    SessionShim = mod.SessionShim;
  });

  test('syntheticOk returns result response', () => {
    const resp = syntheticOk('test');
    expect(resp.type).toBe('result');
    expect(resp.payload.ok).toBe(true);
    expect(resp.payload.detail).toBe('test');
  });

  test('bootstrap returns ok', async () => {
    const shim = new SessionShim();
    const bridge = { invoke: jest.fn() };
    const result = await dispatchSessionTool(shim, bridge, 'session_bootstrap', {});
    expect(result.type).toBe('result');
    expect(result.payload.ok).toBe(true);
  });

  test('open returns ok', async () => {
    const shim = new SessionShim();
    const bridge = { invoke: jest.fn() };
    const result = await dispatchSessionTool(shim, bridge, 'session_open', {
      agent: 'TestAgent', sessionId: 'TA-001', title: 'Test',
    });
    expect(result.type).toBe('result');
  });

  test('begin turn returns ok', async () => {
    const shim = new SessionShim();
    const bridge = { invoke: jest.fn() };
    await dispatchSessionTool(shim, bridge, 'session_open', {
      agent: 'TestAgent', sessionId: 'TA-001', title: 'Test',
    });
    const result = await dispatchSessionTool(shim, bridge, 'session_begin_turn', {
      requestId: 'req-001', queryTitle: 'Q', queryText: 'Query text',
    });
    expect(result.type).toBe('result');
  });

  test('query history calls bridge', async () => {
    const shim = new SessionShim();
    const bridge = { invoke: jest.fn().mockResolvedValue({ type: 'result', payload: { items: [] } }) };
    const result = await dispatchSessionTool(shim, bridge, 'session_query_history', { limit: 5 });
    expect(bridge.invoke).toHaveBeenCalledWith('client.SessionLog.QueryAsync', { limit: 5 });
    expect(result.type).toBe('result');
  });

  test('unknown tool throws', async () => {
    const shim = new SessionShim();
    const bridge = { invoke: jest.fn() };
    await expect(dispatchSessionTool(shim, bridge, 'session_unknown', {})).rejects.toThrow('Unknown session tool');
  });

  test('update turn submits to bridge', async () => {
    const shim = new SessionShim();
    const bridge = { invoke: jest.fn().mockResolvedValue({ type: 'result', payload: { ok: true } }) };
    await dispatchSessionTool(shim, bridge, 'session_open', {
      agent: 'TestAgent', sessionId: 'TA-001', title: 'Test',
    });
    await dispatchSessionTool(shim, bridge, 'session_begin_turn', {
      requestId: 'req-001', queryTitle: 'Q', queryText: 'Query text',
    });
    const result = await dispatchSessionTool(shim, bridge, 'session_update_turn', { response: 'Done' });
    expect(bridge.invoke).toHaveBeenCalledWith('client.SessionLog.SubmitAsync', expect.any(Object));
    expect(result.type).toBe('result');
  });
});

/* ================================================================
 * session.ts tool handler tests
 * ================================================================ */
describe('session tool handlers', () => {
  test('canHandleSessionTool returns true for known tools', async () => {
    const { canHandleSessionTool } = await import('../src/tools/session.js');
    expect(canHandleSessionTool('session_bootstrap')).toBe(true);
    expect(canHandleSessionTool('session_open')).toBe(true);
    expect(canHandleSessionTool('session_begin_turn')).toBe(true);
    expect(canHandleSessionTool('session_query_history')).toBe(true);
    expect(canHandleSessionTool('session_close')).toBe(true);
    expect(canHandleSessionTool('session_unknown')).toBe(false);
  });

  test('handleSessionTool dispatches correctly', async () => {
    const { handleSessionTool } = await import('../src/tools/session.js');
    const bridge = {
      invoke: jest.fn().mockResolvedValue({ type: 'result', payload: { ok: true } }),
    } as unknown as ReplBridge;

    const result = await handleSessionTool('session_bootstrap', {}, bridge);
    expect(result.ok).toBe(true);
  });

  test('handleSessionTool throws on bridge error', async () => {
    const { handleSessionTool } = await import('../src/tools/session.js');
    const bridge = {
      invoke: jest.fn().mockResolvedValue({ type: 'error', payload: { code: 'err', message: 'fail' } }),
    } as unknown as ReplBridge;

    await expect(handleSessionTool('session_query_history', { limit: 5 }, bridge)).rejects.toThrow('err: fail');
  });

  test('handleSessionTool throws on unknown tool', async () => {
    const { handleSessionTool } = await import('../src/tools/session.js');
    const bridge = {} as ReplBridge;
    await expect(handleSessionTool('session_nonexistent', {}, bridge)).rejects.toThrow('Unknown session tool');
  });
});

/* ================================================================
 * workspace tool handler tests
 * ================================================================ */
describe('workspace tool handlers', () => {
  test('canHandleWorkspaceTool', async () => {
    const { canHandleWorkspaceTool } = await import('../src/tools/workspace.js');
    expect(canHandleWorkspaceTool('workspace_ensure')).toBe(true);
    expect(canHandleWorkspaceTool('workspace_other')).toBe(false);
  });

  test('handleWorkspaceTool bootstrap failure recovery', async () => {
    const { handleWorkspaceTool } = await import('../src/tools/workspace.js');
    const bridge = {
      invoke: jest.fn<(...args: any[]) => any>().mockImplementation(async (method: string) => {
        if (method === 'client.Workspace.ListAsync' || method === 'client.Workspace.CreateAsync' || method === 'client.Workspace.InitAsync') {
          return { type: 'result', payload: { result: { key: 'test', items: [] } } };
        }
        return { type: 'error', payload: { code: 'unknown', message: 'unknown method' } };
      }),
    } as unknown as ReplBridge;

    const result = await handleWorkspaceTool('workspace_ensure', {}, bridge, tmpDir);
    expect(result.trusted).toBe(false);
    expect(result.registered).toBe(true);
  });

  test('handleWorkspaceTool bootstrap success', async () => {
    const { handleWorkspaceTool } = await import('../src/tools/workspace.js');
    writeMarkerWithHmac();
    const origFetch = globalThis.fetch;
    globalThis.fetch = jest.fn<(...args: any[]) => any>().mockImplementation(async (url: string) => {
      const m = url.match(/nonce=([^&]+)/);
      return { ok: true, json: async () => ({ nonce: m?.[1] ?? '' }) } as Response;
    }) as unknown as typeof globalThis.fetch;
    try {
      const bridge = {} as ReplBridge;
      const result = await handleWorkspaceTool('workspace_ensure', {}, bridge, tmpDir);
      expect(result.trusted).toBe(true);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test('workspace_ensure throws for unknown tool', async () => {
    const { handleWorkspaceTool } = await import('../src/tools/workspace.js');
    const bridge = {} as ReplBridge;
    await expect(handleWorkspaceTool('workspace_invalid', {}, bridge)).rejects.toThrow('Unknown workspace tool');
  });

  test('handleWorkspaceTool bridge error in list', async () => {
    const { handleWorkspaceTool } = await import('../src/tools/workspace.js');
    const bridge = {
      invoke: jest.fn<(...args: any[]) => any>().mockResolvedValue({ type: 'error', payload: { code: 'ERR', message: 'list fail' } }),
    } as unknown as ReplBridge;
    await expect(handleWorkspaceTool('workspace_ensure', {}, bridge, tmpDir)).rejects.toThrow('ERR: list fail');
  });

  test('handleWorkspaceTool with null workspace item', async () => {
    const { handleWorkspaceTool } = await import('../src/tools/workspace.js');
    const bridge = {
      invoke: jest.fn<(...args: any[]) => any>().mockImplementation(async (method: string) => {
        if (method === 'client.Workspace.ListAsync') {
          return { type: 'result', payload: { result: { items: [null] } } };
        }
        return { type: 'result', payload: { result: { key: 'test' } } };
      }),
    } as unknown as ReplBridge;
    const result = await handleWorkspaceTool('workspace_ensure', {}, bridge, tmpDir);
    expect(result.trusted).toBe(false);
    expect(result.created).toBe(true);
  });

  test('handleWorkspaceTool with missing items field', async () => {
    const { handleWorkspaceTool } = await import('../src/tools/workspace.js');
    const bridge = {
      invoke: jest.fn<(...args: any[]) => any>().mockImplementation(async (method: string) => {
        if (method === 'client.Workspace.ListAsync') {
          return { type: 'result', payload: { result: { key: 'test' } } };
        }
        return { type: 'result', payload: { result: { key: 'test' } } };
      }),
    } as unknown as ReplBridge;
    const result = await handleWorkspaceTool('workspace_ensure', {}, bridge, tmpDir);
    expect(result.trusted).toBe(false);
    expect(result.created).toBe(true);
  });

  test('handleWorkspaceTool with matching workspace item', async () => {
    const { handleWorkspaceTool } = await import('../src/tools/workspace.js');
    const bridge = {
      invoke: jest.fn<(...args: any[]) => any>().mockImplementation(async (method: string) => {
        if (method === 'client.Workspace.ListAsync') {
          return { type: 'result', payload: { result: { items: [{ workspacePath: tmpDir }] } } };
        }
        return { type: 'result', payload: { result: { key: 'test' } } };
      }),
    } as unknown as ReplBridge;
    const result = await handleWorkspaceTool('workspace_ensure', {}, bridge, tmpDir);
    expect(result.workspacePath).toBe(tmpDir);
  });

  test('handleWorkspaceTool init async failure', async () => {
    const { handleWorkspaceTool } = await import('../src/tools/workspace.js');
    const bridge = {
      invoke: jest.fn<(...args: any[]) => any>().mockImplementation(async (method: string) => {
        if (method === 'client.Workspace.ListAsync') {
          return { type: 'result', payload: { result: { items: [null] } } };
        }
        if (method === 'client.Workspace.InitAsync') {
          return { type: 'error', payload: { code: 'ERR', message: 'init failed' } };
        }
        return { type: 'result', payload: { result: { key: 'test' } } };
      }),
    } as unknown as ReplBridge;
    await expect(handleWorkspaceTool('workspace_ensure', {}, bridge, tmpDir)).rejects.toThrow();
  });
});

/* ================================================================
 * todo tool handler tests
 * ================================================================ */
describe('todo tool handlers', () => {
  test('canHandleTodoTool covers all tool names', async () => {
    const { canHandleTodoTool } = await import('../src/tools/todo.js');
    expect(canHandleTodoTool('todo_query')).toBe(true);
    expect(canHandleTodoTool('todo_get')).toBe(true);
    expect(canHandleTodoTool('todo_create')).toBe(true);
    expect(canHandleTodoTool('todo_update')).toBe(true);
    expect(canHandleTodoTool('todo_delete')).toBe(true);
    expect(canHandleTodoTool('todo_internal_status')).toBe(true);
    expect(canHandleTodoTool('todo_internal_enable')).toBe(true);
    expect(canHandleTodoTool('todo_internal_disable')).toBe(true);
    expect(canHandleTodoTool('todo_internal_tracking')).toBe(true);
    expect(canHandleTodoTool('todo_nonexistent')).toBe(false);
  });

  test('handleTodoTool dispatches via bridge', async () => {
    const { handleTodoTool } = await import('../src/tools/todo.js');
    const bridge = {
      invoke: jest.fn().mockResolvedValue({ type: 'result', payload: { result: [{ id: 'T-1' }] } }),
    } as unknown as ReplBridge;

    const result = await handleTodoTool('todo_query', { keyword: 'test' }, bridge);
    expect(Array.isArray(result.result)).toBe(true);
  });

  test('handleTodoTool throws on bridge error', async () => {
    const { handleTodoTool } = await import('../src/tools/todo.js');
    const bridge = {
      invoke: jest.fn().mockResolvedValue({ type: 'error', payload: { code: 'NOT_FOUND', message: 'missing' } }),
    } as unknown as ReplBridge;

    await expect(handleTodoTool('todo_get', { id: 'T-999' }, bridge)).rejects.toThrow('NOT_FOUND');
  });

  test('handleTodoTool internal status', async () => {
    process.env.MCPSERVER_INTERNAL_TODO_STATE_FILE = join(tmpDir, 'istatus.yaml');
    const { handleTodoTool } = await import('../src/tools/todo.js');
    const bridge = {} as ReplBridge;
    const result = await handleTodoTool('todo_internal_status', {}, bridge);
    expect(result.result.enabled).toBe(false);
    expect(result.result.source).toBe('default');
  });

  test('handleTodoTool internal enable/disable', async () => {
    process.env.MCPSERVER_INTERNAL_TODO_STATE_FILE = join(tmpDir, 'ienable.yaml');
    const { handleTodoTool } = await import('../src/tools/todo.js');
    const bridge = {} as ReplBridge;

    let result = await handleTodoTool('todo_internal_enable', {}, bridge);
    expect(result.result.enabled).toBe(true);

    result = await handleTodoTool('todo_internal_disable', {}, bridge);
    expect(result.result.enabled).toBe(false);

    result = await handleTodoTool('todo_internal_status', {}, bridge);
    expect(result.result.enabled).toBe(false);
  });

  test('handleTodoTool internal tracking with various inputs', async () => {
    process.env.MCPSERVER_INTERNAL_TODO_STATE_FILE = join(tmpDir, 'itrack.yaml');
    const { handleTodoTool } = await import('../src/tools/todo.js');
    const bridge = {} as ReplBridge;

    let result = await handleTodoTool('todo_internal_tracking', { enabled: true }, bridge);
    expect(result.result.enabled).toBe(true);

    result = await handleTodoTool('todo_internal_tracking', { mode: 'off' }, bridge);
    expect(result.result.enabled).toBe(false);

    result = await handleTodoTool('todo_internal_tracking', { mode: 'mcp' }, bridge);
    expect(result.result.enabled).toBe(true);

    result = await handleTodoTool('todo_internal_tracking', { enabled: false }, bridge);
    expect(result.result.enabled).toBe(false);
  });

  test('handleTodoTool internal tracking with env var override', async () => {
    process.env.MCPSERVER_INTERNAL_TODO_STATE_FILE = join(tmpDir, 'ienv.yaml');
    process.env.MCP_CODEX_INTERNAL_TODO = 'true';
    const { handleTodoTool } = await import('../src/tools/todo.js');
    const bridge = {} as ReplBridge;
    const result = await handleTodoTool('todo_internal_status', {}, bridge);
    expect(result.result.enabled).toBe(true);
    expect(result.result.source).toBe('environment');
    delete process.env.MCP_CODEX_INTERNAL_TODO;
  });

  test('handleTodoTool throws on unknown internal option', async () => {
    process.env.MCPSERVER_INTERNAL_TODO_STATE_FILE = join(tmpDir, 'iunknown.yaml');
    const { handleTodoTool } = await import('../src/tools/todo.js');
    const bridge = {} as ReplBridge;
    await expect(handleTodoTool('todo_internal_tracking', { enabled: 'invalid' }, bridge)).rejects.toThrow();
  });

  test('handleTodoTool unknown tool throws', async () => {
    const { handleTodoTool } = await import('../src/tools/todo.js');
    const bridge = {} as ReplBridge;
    await expect(handleTodoTool('todo_does_not_exist', {}, bridge)).rejects.toThrow('Unknown todo tool');
  });

  test('handleTodoTool HTTP fallback todo_query', async () => {
    process.env.MCPSERVER_API_KEY = 'test-key';
    process.env.MCPSERVER_WORKSPACE_PATH = tmpDir;
    process.env.MCPSERVER_BASE_URL = 'http://localhost:9999';

    const origFetch = globalThis.fetch;
    globalThis.fetch = jest.fn<(...args: any[]) => any>().mockResolvedValue({
      ok: true, headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ result: [{ id: 'T-1' }] }),
    }) as unknown as typeof globalThis.fetch;

    try {
      const { handleTodoTool } = await import('../src/tools/todo.js');
      const bridge = {} as ReplBridge;
      const result = await handleTodoTool('todo_query', { keyword: 'test' }, bridge);
      expect(result.result).toBeDefined();
    } finally {
      delete process.env.MCPSERVER_API_KEY;
      delete process.env.MCPSERVER_WORKSPACE_PATH;
      delete process.env.MCPSERVER_BASE_URL;
      globalThis.fetch = origFetch;
    }
  });

  test('handleTodoTool HTTP fallback todo_get', async () => {
    process.env.MCPSERVER_API_KEY = 'test-key';
    process.env.MCPSERVER_WORKSPACE_PATH = tmpDir;
    process.env.MCPSERVER_BASE_URL = 'http://localhost:9999';

    const origFetch = globalThis.fetch;
    globalThis.fetch = jest.fn<(...args: any[]) => any>().mockResolvedValue({
      ok: true, headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ id: 'T-1', title: 'Test' }),
    }) as unknown as typeof globalThis.fetch;

    try {
      const { handleTodoTool } = await import('../src/tools/todo.js');
      const bridge = {} as ReplBridge;
      const result = await handleTodoTool('todo_get', { id: 'T-1' }, bridge);
      expect(result.result.id).toBe('T-1');
    } finally {
      delete process.env.MCPSERVER_API_KEY;
      delete process.env.MCPSERVER_WORKSPACE_PATH;
      delete process.env.MCPSERVER_BASE_URL;
      globalThis.fetch = origFetch;
    }
  });

  test('handleTodoTool HTTP fallback todo_create', async () => {
    process.env.MCPSERVER_API_KEY = 'test-key';
    process.env.MCPSERVER_WORKSPACE_PATH = tmpDir;
    process.env.MCPSERVER_BASE_URL = 'http://localhost:9999';

    const origFetch = globalThis.fetch;
    globalThis.fetch = jest.fn<(...args: any[]) => any>().mockResolvedValue({
      ok: true, headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ id: 'T-NEW', title: 'New' }),
    }) as unknown as typeof globalThis.fetch;

    try {
      const { handleTodoTool } = await import('../src/tools/todo.js');
      const bridge = {} as ReplBridge;
      const result = await handleTodoTool('todo_create', { id: 'T-NEW', title: 'New TODO', priority: 'high', done: false, section: 'ui' }, bridge);
      expect(result.result.title).toBe('New');
    } finally {
      delete process.env.MCPSERVER_API_KEY;
      delete process.env.MCPSERVER_WORKSPACE_PATH;
      delete process.env.MCPSERVER_BASE_URL;
      globalThis.fetch = origFetch;
    }
  });

  test('handleTodoTool HTTP fallback todo_update', async () => {
    process.env.MCPSERVER_API_KEY = 'test-key';
    process.env.MCPSERVER_WORKSPACE_PATH = tmpDir;
    process.env.MCPSERVER_BASE_URL = 'http://localhost:9999';

    const origFetch = globalThis.fetch;
    globalThis.fetch = jest.fn<(...args: any[]) => any>().mockResolvedValue({
      ok: true, headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ id: 'T-1', title: 'Updated' }),
    }) as unknown as typeof globalThis.fetch;

    try {
      const { handleTodoTool } = await import('../src/tools/todo.js');
      const bridge = {} as ReplBridge;
      const result = await handleTodoTool('todo_update', { id: 'T-1', title: 'Updated', done: true, description: ['desc1'], implementationTasks: [{ task: 'step1', done: false }] }, bridge);
      expect(result.result.title).toBe('Updated');
    } finally {
      delete process.env.MCPSERVER_API_KEY;
      delete process.env.MCPSERVER_WORKSPACE_PATH;
      delete process.env.MCPSERVER_BASE_URL;
      globalThis.fetch = origFetch;
    }
  });

  test('handleTodoTool HTTP fallback todo_analyze_requirements', async () => {
    process.env.MCPSERVER_API_KEY = 'test-key';
    process.env.MCPSERVER_WORKSPACE_PATH = tmpDir;
    process.env.MCPSERVER_BASE_URL = 'http://localhost:9999';

    const origFetch = globalThis.fetch;
    globalThis.fetch = jest.fn<(...args: any[]) => any>().mockResolvedValue({
      ok: true, headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ id: 'T-1' }),
    }) as unknown as typeof globalThis.fetch;

    try {
      const { handleTodoTool } = await import('../src/tools/todo.js');
      const bridge = {} as ReplBridge;
      const result = await handleTodoTool('todo_analyze_requirements', { id: 'T-1' }, bridge);
      expect(result.result.id).toBe('T-1');
    } finally {
      delete process.env.MCPSERVER_API_KEY;
      delete process.env.MCPSERVER_WORKSPACE_PATH;
      delete process.env.MCPSERVER_BASE_URL;
      globalThis.fetch = origFetch;
    }
  });

  test('handleTodoTool HTTP fallback todo_query with status done filtering', async () => {
    process.env.MCPSERVER_API_KEY = 'test-key';
    process.env.MCPSERVER_WORKSPACE_PATH = tmpDir;
    process.env.MCPSERVER_BASE_URL = 'http://localhost:9999';

    const origFetch = globalThis.fetch;
    globalThis.fetch = jest.fn<(...args: any[]) => any>().mockResolvedValue({
      ok: true, headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ result: [{ id: 'T-1' }] }),
    }) as unknown as typeof globalThis.fetch;

    try {
      const { handleTodoTool } = await import('../src/tools/todo.js');
      const bridge = {} as ReplBridge;
      const result = await handleTodoTool('todo_query', { status: 'open' }, bridge);
      expect(result.result).toBeDefined();
    } finally {
      delete process.env.MCPSERVER_API_KEY;
      delete process.env.MCPSERVER_WORKSPACE_PATH;
      delete process.env.MCPSERVER_BASE_URL;
      globalThis.fetch = origFetch;
    }
  });

  test('handleTodoTool HTTP fallback todo_delete and error', async () => {
    process.env.MCPSERVER_API_KEY = 'test-key';
    process.env.MCPSERVER_WORKSPACE_PATH = tmpDir;
    process.env.MCPSERVER_BASE_URL = 'http://localhost:9999';

    let callIdx = 0;
    const origFetch = globalThis.fetch;
    globalThis.fetch = jest.fn<(...args: any[]) => any>().mockImplementation(async () => {
      callIdx++;
      return {
        ok: callIdx === 1,
        status: 500,
        headers: { get: () => 'application/json' },
        text: async () => callIdx === 1 ? JSON.stringify({ deleted: true }) : 'Error text',
      } as Response;
    }) as unknown as typeof globalThis.fetch;

    try {
      const { handleTodoTool } = await import('../src/tools/todo.js');
      const bridge = {} as ReplBridge;
      const result = await handleTodoTool('todo_delete', { id: 'T-1' }, bridge);
      expect(result.result.deleted).toBe(true);
      await expect(handleTodoTool('todo_query', {}, bridge)).rejects.toThrow('HTTP 500');
    } finally {
      delete process.env.MCPSERVER_API_KEY;
      delete process.env.MCPSERVER_WORKSPACE_PATH;
      delete process.env.MCPSERVER_BASE_URL;
      globalThis.fetch = origFetch;
    }
  });

  test('handleTodoTool HTTP fallback null for missing get id', async () => {
    process.env.MCPSERVER_API_KEY = 'test-key';
    process.env.MCPSERVER_WORKSPACE_PATH = tmpDir;
    process.env.MCPSERVER_BASE_URL = 'http://localhost:9999';

    const origFetch = globalThis.fetch;
    globalThis.fetch = jest.fn<(...args: any[]) => any>();

    try {
      const { handleTodoTool } = await import('../src/tools/todo.js');
      const bridge = { invoke: jest.fn<(...args: any[]) => any>().mockResolvedValue({ type: 'result', payload: { result: null } }) } as unknown as ReplBridge;
      const result = await handleTodoTool('todo_get', {}, bridge);
      expect(bridge.invoke).toHaveBeenCalled();
    } finally {
      delete process.env.MCPSERVER_API_KEY;
      delete process.env.MCPSERVER_WORKSPACE_PATH;
      delete process.env.MCPSERVER_BASE_URL;
      globalThis.fetch = origFetch;
    }
  });

  test('handleTodoTool HTTP fallback network error', async () => {
    process.env.MCPSERVER_API_KEY = 'test-key';
    process.env.MCPSERVER_WORKSPACE_PATH = tmpDir;
    process.env.MCPSERVER_BASE_URL = 'http://localhost:9999';

    const origFetch = globalThis.fetch;
    globalThis.fetch = jest.fn<(...args: any[]) => any>().mockRejectedValue(new Error('network down')) as unknown as typeof globalThis.fetch;

    try {
      const { handleTodoTool } = await import('../src/tools/todo.js');
      const bridge = {} as ReplBridge;
      await expect(handleTodoTool('todo_query', {}, bridge)).rejects.toThrow('network down');
    } finally {
      delete process.env.MCPSERVER_API_KEY;
      delete process.env.MCPSERVER_WORKSPACE_PATH;
      delete process.env.MCPSERVER_BASE_URL;
      globalThis.fetch = origFetch;
    }
  });

  test('handleTodoTool with request wrapper', async () => {
    const { handleTodoTool, canHandleTodoTool } = await import('../src/tools/todo.js');
    const bridge = {
      invoke: jest.fn<(...args: any[]) => any>().mockResolvedValue({ type: 'result', payload: { result: [{ id: 'R-1' }] } }),
    } as unknown as ReplBridge;

    const result = await handleTodoTool('todo_query', { request: { id: 'R-1', keyword: 'test' } }, bridge);
    expect(result.result).toBeDefined();
  });

  test('handleTodoTool with implementationTasks string', async () => {
    const { handleTodoTool } = await import('../src/tools/todo.js');
    const bridge = {
      invoke: jest.fn<(...args: any[]) => any>().mockResolvedValue({ type: 'result', payload: { result: { id: 'T-1' } } }),
    } as unknown as ReplBridge;

    const result = await handleTodoTool('todo_create', {
      id: 'T-1', title: 'Test', implementationTasks: 'single task',
    }, bridge);
    expect(result.result.id).toBe('T-1');
  });

  test('handleTodoTool with implementationTasks array of strings', async () => {
    const { handleTodoTool } = await import('../src/tools/todo.js');
    const bridge = {
      invoke: jest.fn<(...args: any[]) => any>().mockResolvedValue({ type: 'result', payload: { result: { id: 'T-2' } } }),
    } as unknown as ReplBridge;

    const result = await handleTodoTool('todo_update', {
      id: 'T-2', implementationTasks: ['step 1', 'step 2'],
    }, bridge);
    expect(result.result.id).toBe('T-2');
  });

  test('boolToEnabled handles various string inputs', async () => {
    process.env.MCPSERVER_INTERNAL_TODO_STATE_FILE = join(tmpDir, 'booltest.yaml');
    const { handleTodoTool } = await import('../src/tools/todo.js');
    const bridge = {} as ReplBridge;

    process.env.MCP_CODEX_INTERNAL_TODO = 'true';
    let result = await handleTodoTool('todo_internal_status', {}, bridge);
    expect(result.result.enabled).toBe(true);
    expect(result.result.source).toBe('environment');

    process.env.MCP_CODEX_INTERNAL_TODO = 'false';
    result = await handleTodoTool('todo_internal_status', {}, bridge);
    expect(result.result.enabled).toBe(false);

    process.env.MCP_CODEX_INTERNAL_TODO = 'mcp';
    result = await handleTodoTool('todo_internal_status', {}, bridge);
    expect(result.result.enabled).toBe(true);

    process.env.MCP_CODEX_INTERNAL_TODO = 'codex';
    result = await handleTodoTool('todo_internal_status', {}, bridge);
    expect(result.result.enabled).toBe(false);

    delete process.env.MCP_CODEX_INTERNAL_TODO;
  });

  test('internalTodoCacheDir with MCPSERVER_PLUGIN_CACHE_DIR', async () => {
    process.env.MCPSERVER_PLUGIN_CACHE_DIR = join(tmpDir, 'plugin-cache');
    const { handleTodoTool } = await import('../src/tools/todo.js');
    const bridge = {} as ReplBridge;
    const result = await handleTodoTool('todo_internal_status', {}, bridge);
    expect(result.result.enabled).toBe(false);
    delete process.env.MCPSERVER_PLUGIN_CACHE_DIR;
  });

  test('HTTP fallback todo_update with request wrapper', async () => {
    process.env.MCPSERVER_API_KEY = 'test-key';
    process.env.MCPSERVER_WORKSPACE_PATH = tmpDir;
    process.env.MCPSERVER_BASE_URL = 'http://localhost:9999';

    const origFetch = globalThis.fetch;
    globalThis.fetch = jest.fn<(...args: any[]) => any>().mockResolvedValue({
      ok: true, headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ id: 'T-1', title: 'Updated' }),
    }) as unknown as typeof globalThis.fetch;

    try {
      const { handleTodoTool } = await import('../src/tools/todo.js');
      const bridge = {} as ReplBridge;
      const result = await handleTodoTool('todo_update', {
        request: { id: 'T-1', title: 'Updated', done: true },
      }, bridge);
      expect(result.result.title).toBe('Updated');
    } finally {
      delete process.env.MCPSERVER_API_KEY;
      delete process.env.MCPSERVER_WORKSPACE_PATH;
      delete process.env.MCPSERVER_BASE_URL;
      globalThis.fetch = origFetch;
    }
  });

  test('HTTP fallback todo_create with implementationTasks string', async () => {
    process.env.MCPSERVER_API_KEY = 'test-key';
    process.env.MCPSERVER_WORKSPACE_PATH = tmpDir;
    process.env.MCPSERVER_BASE_URL = 'http://localhost:9999';

    const origFetch = globalThis.fetch;
    globalThis.fetch = jest.fn<(...args: any[]) => any>().mockResolvedValue({
      ok: true, headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ id: 'T-1', title: 'Test' }),
    }) as unknown as typeof globalThis.fetch;

    try {
      const { handleTodoTool } = await import('../src/tools/todo.js');
      const bridge = {} as ReplBridge;
      const result = await handleTodoTool('todo_create', {
        id: 'T-1', title: 'Test', implementationTasks: 'single task',
      }, bridge);
      expect(result.result.title).toBe('Test');
    } finally {
      delete process.env.MCPSERVER_API_KEY;
      delete process.env.MCPSERVER_WORKSPACE_PATH;
      delete process.env.MCPSERVER_BASE_URL;
      globalThis.fetch = origFetch;
    }
  });

  test('HTTP fallback todo_create with implementationTasks array of strings', async () => {
    process.env.MCPSERVER_API_KEY = 'test-key';
    process.env.MCPSERVER_WORKSPACE_PATH = tmpDir;
    process.env.MCPSERVER_BASE_URL = 'http://localhost:9999';

    const origFetch = globalThis.fetch;
    globalThis.fetch = jest.fn<(...args: any[]) => any>().mockResolvedValue({
      ok: true, headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ id: 'T-1', title: 'Test' }),
    }) as unknown as typeof globalThis.fetch;

    try {
      const { handleTodoTool } = await import('../src/tools/todo.js');
      const bridge = {} as ReplBridge;
      const result = await handleTodoTool('todo_create', {
        id: 'T-1', title: 'Test', implementationTasks: ['step 1', 'step 2'],
      }, bridge);
      expect(result.result.title).toBe('Test');
    } finally {
      delete process.env.MCPSERVER_API_KEY;
      delete process.env.MCPSERVER_WORKSPACE_PATH;
      delete process.env.MCPSERVER_BASE_URL;
      globalThis.fetch = origFetch;
    }
  });

  test('HTTP fallback todo_query with status completed', async () => {
    process.env.MCPSERVER_API_KEY = 'test-key';
    process.env.MCPSERVER_WORKSPACE_PATH = tmpDir;
    process.env.MCPSERVER_BASE_URL = 'http://localhost:9999';

    const origFetch = globalThis.fetch;
    globalThis.fetch = jest.fn<(...args: any[]) => any>().mockResolvedValue({
      ok: true, headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ result: [{ id: 'T-1' }] }),
    }) as unknown as typeof globalThis.fetch;

    try {
      const { handleTodoTool } = await import('../src/tools/todo.js');
      const bridge = {} as ReplBridge;
      const result = await handleTodoTool('todo_query', { status: 'completed' }, bridge);
      expect(result.result).toBeDefined();
    } finally {
      delete process.env.MCPSERVER_API_KEY;
      delete process.env.MCPSERVER_WORKSPACE_PATH;
      delete process.env.MCPSERVER_BASE_URL;
      globalThis.fetch = origFetch;
    }
  });

  test('HTTP fallback returns null for unknown todo tool', async () => {
    process.env.MCPSERVER_API_KEY = 'test-key';
    process.env.MCPSERVER_WORKSPACE_PATH = tmpDir;
    process.env.MCPSERVER_BASE_URL = 'http://localhost:9999';
    const origFetch = globalThis.fetch;
    globalThis.fetch = jest.fn();
    try {
      const { handleTodoTool } = await import('../src/tools/todo.js');
      const bridge = { invoke: jest.fn<(...args: any[]) => any>().mockResolvedValue({ type: 'error', payload: { code: 'UNKNOWN', message: 'no such' } }) } as unknown as ReplBridge;
      await expect(handleTodoTool('todo_does_not_exist', {}, bridge)).rejects.toThrow();
    } finally {
      delete process.env.MCPSERVER_API_KEY;
      delete process.env.MCPSERVER_WORKSPACE_PATH;
      delete process.env.MCPSERVER_BASE_URL;
      globalThis.fetch = origFetch;
    }
  });
});

/* ================================================================
 * dispatchSessionTool remaining coverage
 * ================================================================ */
describe('dispatchSessionTool extra coverage', () => {
  let dispatchSessionTool: any;
  let SessionShim: any;

  beforeAll(async () => {
    const mod = await import('../src/tools/session-shim.js');
    dispatchSessionTool = mod.dispatchSessionTool;
    SessionShim = mod.SessionShim;
  });

  test('append dialog submits', async () => {
    const shim = new SessionShim();
    const bridge = { invoke: jest.fn().mockResolvedValue({ type: 'result', payload: { ok: true } }) };
    await dispatchSessionTool(shim, bridge, 'session_open', { agent: 'A', sessionId: 'S', title: 'T' });
    await dispatchSessionTool(shim, bridge, 'session_begin_turn', { requestId: 'r', queryTitle: 'Q', queryText: 'T' });
    const result = await dispatchSessionTool(shim, bridge, 'session_append_dialog', {
      dialogItems: [{ timestamp: new Date().toISOString(), role: 'model', content: 'c', category: 'reasoning' }],
    });
    expect(bridge.invoke).toHaveBeenCalledWith('client.SessionLog.SubmitAsync', expect.any(Object));
    expect(result.type).toBe('result');
  });

  test('append actions submits', async () => {
    const shim = new SessionShim();
    const bridge = { invoke: jest.fn().mockResolvedValue({ type: 'result', payload: { ok: true } }) };
    await dispatchSessionTool(shim, bridge, 'session_open', { agent: 'A', sessionId: 'S', title: 'T' });
    await dispatchSessionTool(shim, bridge, 'session_begin_turn', { requestId: 'r', queryTitle: 'Q', queryText: 'T' });
    const result = await dispatchSessionTool(shim, bridge, 'session_append_actions', {
      actions: [{ order: 1, description: 'd', type: 'edit', status: 'completed' }],
    });
    expect(bridge.invoke).toHaveBeenCalledWith('client.SessionLog.SubmitAsync', expect.any(Object));
    expect(result.type).toBe('result');
  });

  test('complete turn submits', async () => {
    const shim = new SessionShim();
    const bridge = { invoke: jest.fn().mockResolvedValue({ type: 'result', payload: { ok: true } }) };
    await dispatchSessionTool(shim, bridge, 'session_open', { agent: 'A', sessionId: 'S', title: 'T' });
    await dispatchSessionTool(shim, bridge, 'session_begin_turn', { requestId: 'r', queryTitle: 'Q', queryText: 'T' });
    const result = await dispatchSessionTool(shim, bridge, 'session_complete_turn', { response: 'Done' });
    expect(bridge.invoke).toHaveBeenCalledWith('client.SessionLog.SubmitAsync', expect.any(Object));
    expect(result.type).toBe('result');
  });

  test('fail turn submits', async () => {
    const shim = new SessionShim();
    const bridge = { invoke: jest.fn().mockResolvedValue({ type: 'result', payload: { ok: true } }) };
    await dispatchSessionTool(shim, bridge, 'session_open', { agent: 'A', sessionId: 'S', title: 'T' });
    await dispatchSessionTool(shim, bridge, 'session_begin_turn', { requestId: 'r', queryTitle: 'Q', queryText: 'T' });
    const result = await dispatchSessionTool(shim, bridge, 'session_fail_turn', { errorMessage: 'Error' });
    expect(bridge.invoke).toHaveBeenCalledWith('client.SessionLog.SubmitAsync', expect.any(Object));
    expect(result.type).toBe('result');
  });

  test('close submits', async () => {
    const shim = new SessionShim();
    const bridge = { invoke: jest.fn().mockResolvedValue({ type: 'result', payload: { ok: true } }) };
    await dispatchSessionTool(shim, bridge, 'session_open', { agent: 'A', sessionId: 'S', title: 'T' });
    const result = await dispatchSessionTool(shim, bridge, 'session_close', { agent: 'A', sessionId: 'S' });
    expect(bridge.invoke).toHaveBeenCalledWith('client.SessionLog.SubmitAsync', expect.any(Object));
    expect(result.type).toBe('result');
  });

  test('submitSessionWithFailsafe returns error when bridge fails', async () => {
    const shim = new SessionShim();
    const bridge = { invoke: jest.fn().mockResolvedValue({ type: 'error', payload: { code: 'FAIL', message: 'failed' } }) };
    await dispatchSessionTool(shim, bridge, 'session_open', { agent: 'A', sessionId: 'S', title: 'T' });
    await dispatchSessionTool(shim, bridge, 'session_begin_turn', { requestId: 'r', queryTitle: 'Q', queryText: 'T' });
    const result = await dispatchSessionTool(shim, bridge, 'session_update_turn', { response: 'R' });
    expect(result.type).toBe('error');
  });

  test('submitSessionWithFailsafe recovers from bridge throw', async () => {
    const shim = new SessionShim();
    const bridge = { invoke: jest.fn().mockRejectedValue(new Error('Network error')) };
    await dispatchSessionTool(shim, bridge, 'session_open', { agent: 'A', sessionId: 'S', title: 'T' });
    await dispatchSessionTool(shim, bridge, 'session_begin_turn', { requestId: 'r', queryTitle: 'Q', queryText: 'T' });
    const result = await dispatchSessionTool(shim, bridge, 'session_update_turn', { response: 'R' });
    expect(result.type).toBe('error');
  });

  test('query history uses HTTP fallback when env vars set', async () => {
    process.env.MCPSERVER_API_KEY = 'test-key';
    process.env.MCPSERVER_WORKSPACE_PATH = '/tmp';
    process.env.MCPSERVER_BASE_URL = 'http://localhost:9999';

    const origFetch = globalThis.fetch;
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify([{ id: '1' }]),
    }) as unknown as typeof globalThis.fetch;

    try {
      const shim = new SessionShim();
      const bridge = { invoke: jest.fn() };
      const result = await dispatchSessionTool(shim, bridge, 'session_query_history', { limit: 5 });
      expect(result.type).toBe('result');
    } finally {
      delete process.env.MCPSERVER_API_KEY;
      delete process.env.MCPSERVER_WORKSPACE_PATH;
      delete process.env.MCPSERVER_BASE_URL;
      globalThis.fetch = origFetch;
    }
  });

  test('query history HTTP fallback returns null when missing env', async () => {
    const shim = new SessionShim();
    const bridge = { invoke: jest.fn().mockResolvedValue({ type: 'result', payload: { items: [] } }) };
    const result = await dispatchSessionTool(shim, bridge, 'session_query_history', { limit: 5 });
    expect(bridge.invoke).toHaveBeenCalled();
  });
});

describe('session shim reset', () => {
  test('__resetSessionShimForTests resets shim', async () => {
    const { __resetSessionShimForTests } = await import('../src/tools/session.js');
    __resetSessionShimForTests();
  });
});

describe('cache manager', () => {
  test('cacheFlush catch on bridge invoke throw', async () => {
    const { cacheFlush } = await import('../src/cache/cache-manager.js');
    const failsafeDir = join(tmpDir, 'failsafe-catch');
    process.env.MCPSERVER_FAILSAFE_DIR = failsafeDir;
    mkdirSync(failsafeDir, { recursive: true });
    writeFileSync(join(failsafeDir, 'test.yaml'), JSON.stringify({ method: 'test.method', params: {} }));
    const bridge = { invoke: jest.fn().mockRejectedValue(new Error('bridge down')) } as unknown as ReplBridge;
    try {
      const result = await cacheFlush(bridge);
      expect(result.failed).toBe(1);
      expect(result.flushed).toBe(0);
    } finally {
      delete process.env.MCPSERVER_FAILSAFE_DIR;
    }
  });
});
