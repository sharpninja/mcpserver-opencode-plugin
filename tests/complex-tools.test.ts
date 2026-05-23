import { jest } from '@jest/globals';
import type { ReplBridge } from '../src/transport/repl-bridge.js';

/* ================================================================
 * requirements tool handler tests
 * ================================================================ */
describe('requirements tool handlers', () => {
  test('canHandleRequirementsTool covers all names', async () => {
    const { canHandleRequirementsTool } = await import('../src/tools/requirements.js');
    expect(canHandleRequirementsTool('req_list_fr')).toBe(true);
    expect(canHandleRequirementsTool('req_get_fr')).toBe(true);
    expect(canHandleRequirementsTool('req_create_fr')).toBe(true);
    expect(canHandleRequirementsTool('req_update_fr')).toBe(true);
    expect(canHandleRequirementsTool('req_delete_fr')).toBe(true);
    expect(canHandleRequirementsTool('req_list_tr')).toBe(true);
    expect(canHandleRequirementsTool('req_create_tr')).toBe(true);
    expect(canHandleRequirementsTool('req_update_tr')).toBe(true);
    expect(canHandleRequirementsTool('req_delete_tr')).toBe(true);
    expect(canHandleRequirementsTool('req_list_test')).toBe(true);
    expect(canHandleRequirementsTool('req_create_test')).toBe(true);
    expect(canHandleRequirementsTool('req_update_test')).toBe(true);
    expect(canHandleRequirementsTool('req_delete_test')).toBe(true);
    expect(canHandleRequirementsTool('req_list_mappings')).toBe(true);
    expect(canHandleRequirementsTool('req_create_mapping')).toBe(true);
    expect(canHandleRequirementsTool('req_delete_mapping')).toBe(true);
    expect(canHandleRequirementsTool('req_generate_document')).toBe(true);
    expect(canHandleRequirementsTool('req_ingest_document')).toBe(true);
    expect(canHandleRequirementsTool('req_nonexistent')).toBe(false);
  });

  test('handleRequirementsTool dispatches workflow method', async () => {
    const { handleRequirementsTool } = await import('../src/tools/requirements.js');
    const bridge = {
      invoke: jest.fn().mockResolvedValue({ type: 'result', payload: { result: [{ id: 'FR-AUTH-001' }] } }),
    } as unknown as ReplBridge;

    const result = await handleRequirementsTool('req_list_fr', { area: 'AUTH' }, bridge);
    expect(bridge.invoke).toHaveBeenCalledWith('workflow.requirements.listFr', { area: 'AUTH' });
    expect(result.result).toEqual([{ id: 'FR-AUTH-001' }]);
  });

  test('handleRequirementsTool falls back to typed method', async () => {
    const { handleRequirementsTool } = await import('../src/tools/requirements.js');
    const bridge = {
      invoke: jest
        .fn()
        .mockResolvedValueOnce({ type: 'result', payload: { result: {} } })
        .mockResolvedValueOnce({ type: 'result', payload: { result: { id: 'FR-AUTH-001' } } }),
    } as unknown as ReplBridge;

    const result = await handleRequirementsTool('req_get_fr', { id: 'FR-AUTH-001' }, bridge);
    expect(result.result).toEqual({ id: 'FR-AUTH-001' });
  });

  test('handleRequirementsTool create FR', async () => {
    const { handleRequirementsTool } = await import('../src/tools/requirements.js');
    const bridge = {
      invoke: jest.fn().mockResolvedValue({ type: 'result', payload: { result: { id: 'FR-AUTH-001' } } }),
    } as unknown as ReplBridge;

    const result = await handleRequirementsTool('req_create_fr', {
      id: 'FR-AUTH-001', title: 'Auth', description: 'Login', priority: 'high', area: 'AUTH',
    }, bridge);
    expect(result.result.id).toBe('FR-AUTH-001');
  });

  test('handleRequirementsTool generate document', async () => {
    const { handleRequirementsTool } = await import('../src/tools/requirements.js');
    const bridge = {
      invoke: jest.fn().mockResolvedValue({
        type: 'result',
        payload: { result: { content: 'FR-1: Login', format: 'markdown', docType: 'fr' } },
      }),
    } as unknown as ReplBridge;

    const result = await handleRequirementsTool('req_generate_document', { docType: 'functional', format: 'markdown' }, bridge);
    expect(result.result).toBeDefined();
  });

  test('handleRequirementsTool ingest document with content', async () => {
    const { handleRequirementsTool } = await import('../src/tools/requirements.js');
    const bridge = {
      invoke: jest.fn().mockResolvedValue({ type: 'result', payload: { result: { ok: true } } }),
    } as unknown as ReplBridge;

    const result = await handleRequirementsTool('req_ingest_document', {
      content: '# Requirements\nFR-1: Login\n', format: 'markdown',
    }, bridge);
    expect(result.result.ok).toBe(true);
  });

  test('handleRequirementsTool ingest with wiki documents map', async () => {
    const { handleRequirementsTool } = await import('../src/tools/requirements.js');
    const bridge = {
      invoke: jest.fn().mockResolvedValue({ type: 'result', payload: { result: { ok: true } } }),
    } as unknown as ReplBridge;

    const result = await handleRequirementsTool('req_ingest_document', {
      documents: { 'req.md': '# Req' },
      sourceFormat: 'wiki',
      preferredWikiFormat: 'github',
    }, bridge);
    expect(result.result.ok).toBe(true);
  });

  test('handleRequirementsTool generate wiki format falls back', async () => {
    const { handleRequirementsTool } = await import('../src/tools/requirements.js');
    const bridge = {
      invoke: jest.fn().mockResolvedValue({ type: 'result', payload: { result: {} } }),
    } as unknown as ReplBridge;

    const origFetch = globalThis.fetch;
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: new Map([['content-type', 'application/zip']]),
      arrayBuffer: async () => Buffer.from('test'),
    }) as unknown as typeof globalThis.fetch;

    try {
      const result = await handleRequirementsTool('req_generate_document', { docType: 'all', format: 'wiki' }, bridge);
      expect(result.result).toBeDefined();
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test('handleRequirementsTool throws on error', async () => {
    const { handleRequirementsTool } = await import('../src/tools/requirements.js');
    const bridge = {
      invoke: jest.fn().mockResolvedValue({ type: 'error', payload: { code: 'ERR', message: 'fail' } }),
    } as unknown as ReplBridge;

    await expect(handleRequirementsTool('req_list_fr', {}, bridge)).rejects.toThrow('ERR');
  });

  test('handleRequirementsTool throws on unknown tool', async () => {
    const { handleRequirementsTool } = await import('../src/tools/requirements.js');
    const bridge = {} as ReplBridge;
    await expect(handleRequirementsTool('req_unknown', {}, bridge)).rejects.toThrow('Unknown requirements tool');
  });

  // ------------------------------------------------------------------
  // Bridge dispatch tests for remaining operations
  // ------------------------------------------------------------------

  test('handleRequirementsTool dispatches req_update_fr via bridge', async () => {
    const { handleRequirementsTool } = await import('../src/tools/requirements.js');
    const bridge = {
      invoke: jest.fn<(...args: any[]) => any>().mockResolvedValue({ type: 'result', payload: { result: { id: 'FR-001', status: 'completed' } } }),
    } as unknown as ReplBridge;
    const result = await handleRequirementsTool('req_update_fr', { id: 'FR-001', status: 'completed' }, bridge);
    expect(result.result.id).toBe('FR-001');
    expect(result.result.status).toBe('completed');
  });

  test('handleRequirementsTool dispatches req_delete_fr via bridge', async () => {
    const { handleRequirementsTool } = await import('../src/tools/requirements.js');
    const bridge = {
      invoke: jest.fn<(...args: any[]) => any>().mockResolvedValue({ type: 'result', payload: { result: { deleted: true } } }),
    } as unknown as ReplBridge;
    const result = await handleRequirementsTool('req_delete_fr', { id: 'FR-001' }, bridge);
    expect(result.result.deleted).toBe(true);
  });

  test('handleRequirementsTool dispatches req_list_tr via bridge', async () => {
    const { handleRequirementsTool } = await import('../src/tools/requirements.js');
    const bridge = {
      invoke: jest.fn<(...args: any[]) => any>().mockResolvedValue({ type: 'result', payload: { result: [{ id: 'TR-001' }] } }),
    } as unknown as ReplBridge;
    const result = await handleRequirementsTool('req_list_tr', { area: 'AUTH' }, bridge);
    expect(result.result).toHaveLength(1);
  });

  test('handleRequirementsTool dispatches req_create_tr via bridge', async () => {
    const { handleRequirementsTool } = await import('../src/tools/requirements.js');
    const bridge = {
      invoke: jest.fn<(...args: any[]) => any>().mockResolvedValue({ type: 'result', payload: { result: { id: 'TR-AUTH-001' } } }),
    } as unknown as ReplBridge;
    const result = await handleRequirementsTool('req_create_tr', {
      id: 'TR-AUTH-001', title: 'DB', description: 'Schema', priority: 'high', area: 'AUTH', subarea: 'DB',
    }, bridge);
    expect(result.result.id).toBe('TR-AUTH-001');
  });

  test('handleRequirementsTool dispatches req_update_tr via bridge', async () => {
    const { handleRequirementsTool } = await import('../src/tools/requirements.js');
    const bridge = {
      invoke: jest.fn<(...args: any[]) => any>().mockResolvedValue({ type: 'result', payload: { result: { id: 'TR-001', status: 'completed' } } }),
    } as unknown as ReplBridge;
    const result = await handleRequirementsTool('req_update_tr', { id: 'TR-001', status: 'completed' }, bridge);
    expect(result.result.id).toBe('TR-001');
  });

  test('handleRequirementsTool dispatches req_delete_tr via bridge', async () => {
    const { handleRequirementsTool } = await import('../src/tools/requirements.js');
    const bridge = {
      invoke: jest.fn<(...args: any[]) => any>().mockResolvedValue({ type: 'result', payload: { result: { deleted: true } } }),
    } as unknown as ReplBridge;
    const result = await handleRequirementsTool('req_delete_tr', { id: 'TR-001' }, bridge);
    expect(result.result.deleted).toBe(true);
  });

  test('handleRequirementsTool dispatches req_list_test via bridge', async () => {
    const { handleRequirementsTool } = await import('../src/tools/requirements.js');
    const bridge = {
      invoke: jest.fn<(...args: any[]) => any>().mockResolvedValue({ type: 'result', payload: { result: [{ id: 'TEST-001' }] } }),
    } as unknown as ReplBridge;
    const result = await handleRequirementsTool('req_list_test', { area: 'AUTH' }, bridge);
    expect(result.result).toHaveLength(1);
  });

  test('handleRequirementsTool dispatches req_create_test via bridge', async () => {
    const { handleRequirementsTool } = await import('../src/tools/requirements.js');
    const bridge = {
      invoke: jest.fn<(...args: any[]) => any>().mockResolvedValue({ type: 'result', payload: { result: { id: 'TEST-AUTH-001' } } }),
    } as unknown as ReplBridge;
    const result = await handleRequirementsTool('req_create_test', {
      id: 'TEST-AUTH-001', title: 'Auth Test', description: 'Should login', priority: 'high', area: 'AUTH',
    }, bridge);
    expect(result.result.id).toBe('TEST-AUTH-001');
  });

  test('handleRequirementsTool dispatches req_update_test via bridge', async () => {
    const { handleRequirementsTool } = await import('../src/tools/requirements.js');
    const bridge = {
      invoke: jest.fn<(...args: any[]) => any>().mockResolvedValue({ type: 'result', payload: { result: { id: 'TEST-001', status: 'completed' } } }),
    } as unknown as ReplBridge;
    const result = await handleRequirementsTool('req_update_test', { id: 'TEST-001', status: 'completed' }, bridge);
    expect(result.result.id).toBe('TEST-001');
  });

  test('handleRequirementsTool dispatches req_delete_test via bridge', async () => {
    const { handleRequirementsTool } = await import('../src/tools/requirements.js');
    const bridge = {
      invoke: jest.fn<(...args: any[]) => any>().mockResolvedValue({ type: 'result', payload: { result: { deleted: true } } }),
    } as unknown as ReplBridge;
    const result = await handleRequirementsTool('req_delete_test', { id: 'TEST-001' }, bridge);
    expect(result.result.deleted).toBe(true);
  });

  test('handleRequirementsTool dispatches req_list_mappings via bridge', async () => {
    const { handleRequirementsTool } = await import('../src/tools/requirements.js');
    const bridge = {
      invoke: jest.fn<(...args: any[]) => any>().mockResolvedValue({ type: 'result', payload: { result: [{ frId: 'FR-001', trId: 'TR-001' }] } }),
    } as unknown as ReplBridge;
    const result = await handleRequirementsTool('req_list_mappings', { frId: 'FR-001' }, bridge);
    expect(result.result).toHaveLength(1);
  });

  test('handleRequirementsTool dispatches req_create_mapping via bridge', async () => {
    const { handleRequirementsTool } = await import('../src/tools/requirements.js');
    const bridge = {
      invoke: jest.fn<(...args: any[]) => any>().mockResolvedValue({ type: 'result', payload: { result: { frId: 'FR-001', trIds: ['TR-001'] } } }),
    } as unknown as ReplBridge;
    const result = await handleRequirementsTool('req_create_mapping', { frId: 'FR-001', trIds: ['TR-001'] }, bridge);
    expect(result.result.frId).toBe('FR-001');
  });

  test('handleRequirementsTool dispatches req_delete_mapping via bridge', async () => {
    const { handleRequirementsTool } = await import('../src/tools/requirements.js');
    const bridge = {
      invoke: jest.fn<(...args: any[]) => any>().mockResolvedValue({ type: 'result', payload: { result: { deleted: true } } }),
    } as unknown as ReplBridge;
    const result = await handleRequirementsTool('req_delete_mapping', { frId: 'FR-001', trId: 'TR-001' }, bridge);
    expect(result.result.deleted).toBe(true);
  });

  // ------------------------------------------------------------------
  // Typed method fallback tests (workflow returns empty, exercises typedParams)
  // ------------------------------------------------------------------

  test('handleRequirementsTool falls back to typed method for req_create_tr', async () => {
    const { handleRequirementsTool } = await import('../src/tools/requirements.js');
    const bridge = {
      invoke: jest
        .fn<(...args: any[]) => any>()
        .mockResolvedValueOnce({ type: 'result', payload: { result: {} } })
        .mockResolvedValueOnce({ type: 'result', payload: { result: { id: 'TR-AUTH-001' } } }),
    } as unknown as ReplBridge;
    const result = await handleRequirementsTool('req_create_tr', {
      id: 'TR-AUTH-001', title: 'DB', description: 'Schema', priority: 'high', area: 'AUTH', subarea: 'DB',
    }, bridge);
    expect(result.result.id).toBe('TR-AUTH-001');
  });

  test('handleRequirementsTool falls back to typed method for req_update_tr', async () => {
    const { handleRequirementsTool } = await import('../src/tools/requirements.js');
    const bridge = {
      invoke: jest
        .fn<(...args: any[]) => any>()
        .mockResolvedValueOnce({ type: 'result', payload: { result: {} } })
        .mockResolvedValueOnce({ type: 'result', payload: { result: { id: 'TR-001', title: 'Updated' } } }),
    } as unknown as ReplBridge;
    const result = await handleRequirementsTool('req_update_tr', { id: 'TR-001', title: 'Updated' }, bridge);
    expect(result.result.title).toBe('Updated');
  });

  test('handleRequirementsTool falls back to typed method for req_create_test', async () => {
    const { handleRequirementsTool } = await import('../src/tools/requirements.js');
    const bridge = {
      invoke: jest
        .fn<(...args: any[]) => any>()
        .mockResolvedValueOnce({ type: 'result', payload: { result: {} } })
        .mockResolvedValueOnce({ type: 'result', payload: { result: { id: 'TEST-AUTH-001' } } }),
    } as unknown as ReplBridge;
    const result = await handleRequirementsTool('req_create_test', {
      id: 'TEST-AUTH-001', title: 'Test', description: 'Should pass', priority: 'high', area: 'AUTH',
    }, bridge);
    expect(result.result.id).toBe('TEST-AUTH-001');
  });

  test('handleRequirementsTool falls back to typed method for req_update_test', async () => {
    const { handleRequirementsTool } = await import('../src/tools/requirements.js');
    const bridge = {
      invoke: jest
        .fn<(...args: any[]) => any>()
        .mockResolvedValueOnce({ type: 'result', payload: { result: {} } })
        .mockResolvedValueOnce({ type: 'result', payload: { result: { id: 'TEST-001', condition: 'Should pass' } } }),
    } as unknown as ReplBridge;
    const result = await handleRequirementsTool('req_update_test', { id: 'TEST-001', description: 'Should pass' }, bridge);
    expect(result.result.condition).toBe('Should pass');
  });

  test('handleRequirementsTool falls back to typed method for req_create_mapping', async () => {
    const { handleRequirementsTool } = await import('../src/tools/requirements.js');
    const bridge = {
      invoke: jest
        .fn<(...args: any[]) => any>()
        .mockResolvedValueOnce({ type: 'result', payload: { result: {} } })
        .mockResolvedValueOnce({ type: 'result', payload: { result: { frId: 'FR-001' } } }),
    } as unknown as ReplBridge;
    const result = await handleRequirementsTool('req_create_mapping', { frId: 'FR-001', trIds: ['TR-001'], testIds: ['TEST-001'] }, bridge);
    expect(result.result.frId).toBe('FR-001');
  });

  test('handleRequirementsTool falls back to typed method for req_delete_mapping', async () => {
    const { handleRequirementsTool } = await import('../src/tools/requirements.js');
    const bridge = {
      invoke: jest
        .fn<(...args: any[]) => any>()
        .mockResolvedValueOnce({ type: 'result', payload: { result: {} } })
        .mockResolvedValueOnce({ type: 'result', payload: { result: { deleted: true } } }),
    } as unknown as ReplBridge;
    const result = await handleRequirementsTool('req_delete_mapping', { frId: 'FR-001' }, bridge);
    expect(result.result.deleted).toBe(true);
  });

  test('handleRequirementsTool falls back to typed method for req_ingest with content', async () => {
    const { handleRequirementsTool } = await import('../src/tools/requirements.js');
    const bridge = {
      invoke: jest
        .fn<(...args: any[]) => any>()
        .mockResolvedValueOnce({ type: 'result', payload: { result: {} } })
        .mockResolvedValueOnce({ type: 'result', payload: { result: { ok: true } } }),
    } as unknown as ReplBridge;
    const result = await handleRequirementsTool('req_ingest_document', { content: '# Reqs', format: 'markdown' }, bridge);
    expect(result.result.ok).toBe(true);
  });

  test('handleRequirementsTool falls back to typed method for req_ingest with documents map', async () => {
    const { handleRequirementsTool } = await import('../src/tools/requirements.js');
    const bridge = {
      invoke: jest
        .fn<(...args: any[]) => any>()
        .mockResolvedValueOnce({ type: 'result', payload: { result: {} } })
        .mockResolvedValueOnce({ type: 'result', payload: { result: { ok: true } } }),
    } as unknown as ReplBridge;
    const result = await handleRequirementsTool('req_ingest_document', {
      documents: { 'req.md': '# Req' },
      sourceFormat: 'canonical',
      preferredWikiFormat: 'azure',
    }, bridge);
    expect(result.result.ok).toBe(true);
  });

  // ------------------------------------------------------------------
  // workflowDocType / typedDocType coverage
  // ------------------------------------------------------------------

  test('handleRequirementsTool generate document with various docTypes', async () => {
    const { handleRequirementsTool } = await import('../src/tools/requirements.js');
    const bridge = {
      invoke: jest
        .fn<(...args: any[]) => any>()
        .mockResolvedValue({ type: 'result', payload: { result: { content: '# Doc', format: 'markdown', docType: 'all' } } }),
    } as unknown as ReplBridge;

    const docTypes = ['functional', 'technical', 'testing', 'mapping', '', undefined] as const;
    for (const docType of docTypes) {
      const result = await handleRequirementsTool('req_generate_document', { docType, format: 'markdown' }, bridge);
      expect(result.result).toBeDefined();
    }
  });

  // ------------------------------------------------------------------
  // normalizeGenerateResponse (array buffer) coverage
  // ------------------------------------------------------------------

  test('handleRequirementsTool normalize array buffer content from typed method', async () => {
    const { handleRequirementsTool } = await import('../src/tools/requirements.js');
    const bridge = {
      invoke: jest
        .fn<(...args: any[]) => any>()
        .mockResolvedValueOnce({ type: 'result', payload: { result: {} } })
        .mockResolvedValueOnce({
          type: 'result',
          payload: {
            result: {
              content: [72, 101, 108, 108, 111],
              contentType: 'text/markdown',
              fileName: 'output.md',
              format: 'markdown',
              docType: 'fr',
            },
          },
        }),
    } as unknown as ReplBridge;
    const result = await handleRequirementsTool('req_generate_document', { docType: 'functional', format: 'markdown' }, bridge);
    expect(result.result.content).toBe('Hello');
    expect(result.result.contentType).toBe('text/markdown');
  });

  test('handleRequirementsTool normalize zip array buffer from typed method', async () => {
    const { handleRequirementsTool } = await import('../src/tools/requirements.js');
    const bridge = {
      invoke: jest
        .fn<(...args: any[]) => any>()
        .mockResolvedValueOnce({ type: 'result', payload: { result: {} } })
        .mockResolvedValueOnce({
          type: 'result',
          payload: {
            result: {
              content: [116, 101, 115, 116],
              contentType: 'application/zip',
              fileName: 'docs.zip',
              format: 'wiki',
              docType: 'all',
            },
          },
        }),
    } as unknown as ReplBridge;
    const result = await handleRequirementsTool('req_generate_document', { docType: 'all', format: 'wiki' }, bridge);
    expect(result.result.contentBase64).toBeDefined();
    expect(result.result.fileName).toBe('docs.zip');
  });

  // ------------------------------------------------------------------
  // HTTP fallback tests for wiki generate
  // ------------------------------------------------------------------

  test('handleRequirementsTool HTTP fallback wiki generate', async () => {
    process.env.MCPSERVER_API_KEY = 'test-key';
    process.env.MCPSERVER_WORKSPACE_PATH = '/tmp';
    process.env.MCPSERVER_BASE_URL = 'http://localhost:9999';

    const origFetch = globalThis.fetch;
    globalThis.fetch = jest.fn<(...args: any[]) => any>().mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/zip' },
      arrayBuffer: async () => Buffer.from('test'),
    }) as unknown as typeof globalThis.fetch;

    try {
      const { handleRequirementsTool } = await import('../src/tools/requirements.js');
      const bridge = {} as ReplBridge;
      const result = await handleRequirementsTool('req_generate_document', { docType: 'all', format: 'wiki' }, bridge);
      expect(result.result.contentBase64).toBeDefined();
      expect(result.result.fileName).toBe('requirements-wiki-documents.zip');
    } finally {
      delete process.env.MCPSERVER_API_KEY;
      delete process.env.MCPSERVER_WORKSPACE_PATH;
      delete process.env.MCPSERVER_BASE_URL;
      globalThis.fetch = origFetch;
    }
  });

  test('handleRequirementsTool HTTP fallback wiki generate error', async () => {
    process.env.MCPSERVER_API_KEY = 'test-key';
    process.env.MCPSERVER_WORKSPACE_PATH = '/tmp';
    process.env.MCPSERVER_BASE_URL = 'http://localhost:9999';

    const origFetch = globalThis.fetch;
    globalThis.fetch = jest.fn<(...args: any[]) => any>().mockResolvedValue({
      ok: false,
      status: 500,
      headers: { get: () => 'text/plain' },
      text: async () => 'Server error',
    }) as unknown as typeof globalThis.fetch;

    try {
      const { handleRequirementsTool } = await import('../src/tools/requirements.js');
      const bridge = {} as ReplBridge;
      await expect(handleRequirementsTool('req_generate_document', { docType: 'all', format: 'wiki' }, bridge)).rejects.toThrow('HTTP 500');
    } finally {
      delete process.env.MCPSERVER_API_KEY;
      delete process.env.MCPSERVER_WORKSPACE_PATH;
      delete process.env.MCPSERVER_BASE_URL;
      globalThis.fetch = origFetch;
    }
  });

  // ------------------------------------------------------------------
  // Serialized workflow non-zip wiki generate (covers lines 558-559)
  // ------------------------------------------------------------------

  test('handleRequirementsTool wiki generate workflow non-zip falls through to typed', async () => {
    const { handleRequirementsTool } = await import('../src/tools/requirements.js');
    const bridge = {
      invoke: jest
        .fn<(...args: any[]) => any>()
        .mockResolvedValueOnce({
          type: 'result',
          payload: {
            result: {
              content: [72, 105],
              contentType: 'text/plain',
              fileName: 'out.txt',
              format: 'wiki',
              docType: 'all',
            },
          },
        })
        .mockResolvedValueOnce({ type: 'result', payload: { result: { content: 'Falls back', format: 'markdown', docType: 'all' } } }),
    } as unknown as ReplBridge;
    const result = await handleRequirementsTool('req_generate_document', { docType: 'all', format: 'wiki' }, bridge);
    expect(result.result).toBeDefined();
  });

  // ------------------------------------------------------------------
  // stringArg empty return coverage (line 314)
  // ------------------------------------------------------------------

  test('handleRequirementsTool stringArg returns empty for missing field', async () => {
    const { handleRequirementsTool } = await import('../src/tools/requirements.js');
    const bridge = {
      invoke: jest
        .fn<(...args: any[]) => any>()
        .mockResolvedValueOnce({ type: 'result', payload: { result: {} } })
        .mockResolvedValueOnce({ type: 'result', payload: { result: { id: 'FR-001' } } }),
    } as unknown as ReplBridge;
    const result = await handleRequirementsTool('req_get_fr', {}, bridge);
    expect(result.result.id).toBe('FR-001');
  });

  // ------------------------------------------------------------------
  // requestParam / listParam coverage (lines 354-361)
  // ------------------------------------------------------------------

  test('handleRequirementsTool listParam handles legacy single values', async () => {
    const { handleRequirementsTool } = await import('../src/tools/requirements.js');
    const bridge = {
      invoke: jest
        .fn<(...args: any[]) => any>()
        .mockResolvedValueOnce({ type: 'result', payload: { result: {} } })
        .mockResolvedValueOnce({ type: 'result', payload: { result: { frId: 'FR-001' } } }),
    } as unknown as ReplBridge;
    const result = await handleRequirementsTool('req_create_mapping', { frId: 'FR-001', trId: 'TR-001', testId: 'TEST-001' }, bridge);
    expect(result.result.frId).toBe('FR-001');
  });
});

/* ================================================================
 * graphrag tool handler tests
 * ================================================================ */
describe('graphrag tool handlers', () => {
  test('canHandleGraphragTool covers all names', async () => {
    const { canHandleGraphragTool } = await import('../src/tools/graphrag.js');
    expect(canHandleGraphragTool('graphrag_status')).toBe(true);
    expect(canHandleGraphragTool('graphrag_index')).toBe(true);
    expect(canHandleGraphragTool('graphrag_query')).toBe(true);
    expect(canHandleGraphragTool('graphrag_ingest')).toBe(true);
    expect(canHandleGraphragTool('graphrag_doc_list')).toBe(true);
    expect(canHandleGraphragTool('graphrag_doc_chunks')).toBe(true);
    expect(canHandleGraphragTool('graphrag_doc_delete')).toBe(true);
    expect(canHandleGraphragTool('graphrag_entity_create')).toBe(true);
    expect(canHandleGraphragTool('graphrag_entity_list')).toBe(true);
    expect(canHandleGraphragTool('graphrag_entity_get')).toBe(true);
    expect(canHandleGraphragTool('graphrag_entity_update')).toBe(true);
    expect(canHandleGraphragTool('graphrag_entity_delete')).toBe(true);
    expect(canHandleGraphragTool('graphrag_rel_create')).toBe(true);
    expect(canHandleGraphragTool('graphrag_rel_list')).toBe(true);
    expect(canHandleGraphragTool('graphrag_rel_get')).toBe(true);
    expect(canHandleGraphragTool('graphrag_rel_update')).toBe(true);
    expect(canHandleGraphragTool('graphrag_rel_delete')).toBe(true);
    expect(canHandleGraphragTool('graphrag_nonexistent')).toBe(false);
  });

  test('handleGraphragTool dispatches via bridge', async () => {
    const { handleGraphragTool } = await import('../src/tools/graphrag.js');
    const bridge = {
      invoke: jest.fn().mockResolvedValue({ type: 'result', payload: { result: { status: 'ready' } } }),
    } as unknown as ReplBridge;

    const result = await handleGraphragTool('graphrag_status', {}, bridge);
    expect(result.result.status).toBe('ready');
    expect(bridge.invoke).toHaveBeenCalledWith('workflow.graphrag.status', {});
  });

  test('handleGraphragTool query with params', async () => {
    const { handleGraphragTool } = await import('../src/tools/graphrag.js');
    const bridge = {
      invoke: jest.fn().mockResolvedValue({ type: 'result', payload: { result: { answer: '42' } } }),
    } as unknown as ReplBridge;

    const result = await handleGraphragTool('graphrag_query', { query: 'meaning of life', mode: 'local', maxChunks: 5 }, bridge);
    expect(result.result.answer).toBe('42');
    expect(bridge.invoke).toHaveBeenCalledWith('workflow.graphrag.query', { query: 'meaning of life', mode: 'local', maxChunks: 5 });
  });

  test('handleGraphragTool entity CRUD', async () => {
    const { handleGraphragTool } = await import('../src/tools/graphrag.js');
    const bridge = {
      invoke: jest.fn().mockResolvedValue({ type: 'result', payload: { result: { id: 'ent-001' } } }),
    } as unknown as ReplBridge;

    let result = await handleGraphragTool('graphrag_entity_create', { name: 'AuthService', entityType: 'component' }, bridge);
    expect(result.result.id).toBe('ent-001');

    bridge.invoke = jest.fn().mockResolvedValue({ type: 'result', payload: { result: { id: 'ent-001', name: 'AuthService' } } });
    result = await handleGraphragTool('graphrag_entity_get', { entityId: 'ent-001' }, bridge);
    expect(result.result.name).toBe('AuthService');
  });

  test('handleGraphragTool relationship CRUD', async () => {
    const { handleGraphragTool } = await import('../src/tools/graphrag.js');
    const bridge = {
      invoke: jest.fn().mockResolvedValue({ type: 'result', payload: { result: { id: 'rel-001' } } }),
    } as unknown as ReplBridge;

    const result = await handleGraphragTool('graphrag_rel_create', {
      sourceEntityId: 'ent-001', targetEntityId: 'ent-002', relationshipType: 'calls',
    }, bridge);
    expect(result.result.id).toBe('rel-001');
  });

  test('handleGraphragTool document operations', async () => {
    const { handleGraphragTool } = await import('../src/tools/graphrag.js');
    const bridge = {
      invoke: jest.fn().mockResolvedValue({ type: 'result', payload: { result: { items: [] } } }),
    } as unknown as ReplBridge;

    let result = await handleGraphragTool('graphrag_doc_list', { skip: 0, take: 10 }, bridge);
    expect(result.result.items).toEqual([]);

    bridge.invoke = jest.fn().mockResolvedValue({ type: 'result', payload: { result: { chunks: [] } } });
    result = await handleGraphragTool('graphrag_doc_chunks', { documentId: 'doc-001' }, bridge);
    expect(result.result.chunks).toEqual([]);
  });

  test('handleGraphragTool throws on bridge error', async () => {
    const { handleGraphragTool } = await import('../src/tools/graphrag.js');
    const bridge = {
      invoke: jest.fn().mockResolvedValue({ type: 'error', payload: { code: 'ERR', message: 'fail' } }),
    } as unknown as ReplBridge;

    await expect(handleGraphragTool('graphrag_status', {}, bridge)).rejects.toThrow('ERR');
  });

  test('handleGraphragTool throws on unknown tool', async () => {
    const { handleGraphragTool } = await import('../src/tools/graphrag.js');
    const bridge = {} as ReplBridge;
    await expect(handleGraphragTool('graphrag_unknown', {}, bridge)).rejects.toThrow('Unknown graphrag tool');
  });

  test('handleGraphragTool HTTP fallback with status', async () => {
    process.env.MCPSERVER_API_KEY = 'test-key';
    process.env.MCPSERVER_WORKSPACE_PATH = '/tmp';
    process.env.MCPSERVER_BASE_URL = 'http://localhost:9999';

    const origFetch = globalThis.fetch;
    globalThis.fetch = jest.fn<(...args: any[]) => any>().mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ status: 'ready' }),
    }) as unknown as typeof globalThis.fetch;

    try {
      const { handleGraphragTool } = await import('../src/tools/graphrag.js');
      const bridge = {} as ReplBridge;
      const result = await handleGraphragTool('graphrag_status', {}, bridge);
      expect(result.result.status).toBe('ready');
    } finally {
      delete process.env.MCPSERVER_API_KEY;
      delete process.env.MCPSERVER_WORKSPACE_PATH;
      delete process.env.MCPSERVER_BASE_URL;
      globalThis.fetch = origFetch;
    }
  });

  test('handleGraphragTool HTTP fallback with query', async () => {
    process.env.MCPSERVER_API_KEY = 'test-key';
    process.env.MCPSERVER_WORKSPACE_PATH = '/tmp';
    process.env.MCPSERVER_BASE_URL = 'http://localhost:9999';

    const origFetch = globalThis.fetch;
    globalThis.fetch = jest.fn<(...args: any[]) => any>().mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ answer: '42' }),
    }) as unknown as typeof globalThis.fetch;

    try {
      const { handleGraphragTool } = await import('../src/tools/graphrag.js');
      const bridge = {} as ReplBridge;
      const result = await handleGraphragTool('graphrag_query', { query: 'test', mode: 'local' }, bridge);
      expect(result.result.answer).toBe('42');
    } finally {
      delete process.env.MCPSERVER_API_KEY;
      delete process.env.MCPSERVER_WORKSPACE_PATH;
      delete process.env.MCPSERVER_BASE_URL;
      globalThis.fetch = origFetch;
    }
  });

  test('handleGraphragTool HTTP fallback with doc_list', async () => {
    process.env.MCPSERVER_API_KEY = 'test-key';
    process.env.MCPSERVER_WORKSPACE_PATH = '/tmp';
    process.env.MCPSERVER_BASE_URL = 'http://localhost:9999';

    const origFetch = globalThis.fetch;
    globalThis.fetch = jest.fn<(...args: any[]) => any>().mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ items: [] }),
    }) as unknown as typeof globalThis.fetch;

    try {
      const { handleGraphragTool } = await import('../src/tools/graphrag.js');
      const bridge = {} as ReplBridge;
      const result = await handleGraphragTool('graphrag_doc_list', { skip: 0, take: 10 }, bridge);
      expect(result.result.items).toEqual([]);
    } finally {
      delete process.env.MCPSERVER_API_KEY;
      delete process.env.MCPSERVER_WORKSPACE_PATH;
      delete process.env.MCPSERVER_BASE_URL;
      globalThis.fetch = origFetch;
    }
  });

  test('handleGraphragTool HTTP fallback entity CRUD', async () => {
    process.env.MCPSERVER_API_KEY = 'test-key';
    process.env.MCPSERVER_WORKSPACE_PATH = '/tmp';
    process.env.MCPSERVER_BASE_URL = 'http://localhost:9999';

    let callCount = 0;
    const origFetch = globalThis.fetch;
    globalThis.fetch = jest.fn<(...args: any[]) => any>().mockImplementation(async () => {
      callCount++;
      return {
        ok: true,
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify(callCount === 1 ? { id: 'ent-001' } : { items: [] }),
      } as Response;
    }) as unknown as typeof globalThis.fetch;

    try {
      const { handleGraphragTool } = await import('../src/tools/graphrag.js');
      const bridge = {} as ReplBridge;
      let result = await handleGraphragTool('graphrag_entity_create', { name: 'Svc', entityType: 'component' }, bridge);
      expect(result.result.id).toBe('ent-001');
      result = await handleGraphragTool('graphrag_entity_list', { entityType: 'component' }, bridge);
      expect(result.result.items).toEqual([]);
    } finally {
      delete process.env.MCPSERVER_API_KEY;
      delete process.env.MCPSERVER_WORKSPACE_PATH;
      delete process.env.MCPSERVER_BASE_URL;
      globalThis.fetch = origFetch;
    }
  });

  test('handleGraphragTool HTTP fallback relationship CRUD', async () => {
    process.env.MCPSERVER_API_KEY = 'test-key';
    process.env.MCPSERVER_WORKSPACE_PATH = '/tmp';
    process.env.MCPSERVER_BASE_URL = 'http://localhost:9999';

    const origFetch = globalThis.fetch;
    globalThis.fetch = jest.fn<(...args: any[]) => any>().mockImplementation(async () => ({
      ok: true,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ id: 'rel-001' }),
    })) as unknown as typeof globalThis.fetch;

    try {
      const { handleGraphragTool } = await import('../src/tools/graphrag.js');
      const bridge = {} as ReplBridge;
      let result = await handleGraphragTool('graphrag_rel_create', { sourceEntityId: 'e1', targetEntityId: 'e2', relationshipType: 'calls' }, bridge);
      expect(result.result.id).toBe('rel-001');
      result = await handleGraphragTool('graphrag_rel_list', {}, bridge);
      expect(result.result.id).toBe('rel-001');
    } finally {
      delete process.env.MCPSERVER_API_KEY;
      delete process.env.MCPSERVER_WORKSPACE_PATH;
      delete process.env.MCPSERVER_BASE_URL;
      globalThis.fetch = origFetch;
    }
  });

  test('handleGraphragTool HTTP fallback error response', async () => {
    process.env.MCPSERVER_API_KEY = 'test-key';
    process.env.MCPSERVER_WORKSPACE_PATH = '/tmp';
    process.env.MCPSERVER_BASE_URL = 'http://localhost:9999';

    const origFetch = globalThis.fetch;
    globalThis.fetch = jest.fn<(...args: any[]) => any>().mockResolvedValue({
      ok: false,
      status: 500,
      headers: { get: () => 'text/plain' },
      text: async () => 'Server error',
    }) as unknown as typeof globalThis.fetch;

    try {
      const { handleGraphragTool } = await import('../src/tools/graphrag.js');
      const bridge = {} as ReplBridge;
      await expect(handleGraphragTool('graphrag_status', {}, bridge)).rejects.toThrow('HTTP 500');
    } finally {
      delete process.env.MCPSERVER_API_KEY;
      delete process.env.MCPSERVER_WORKSPACE_PATH;
      delete process.env.MCPSERVER_BASE_URL;
      globalThis.fetch = origFetch;
    }
  });

  test('handleGraphragTool HTTP fallback index', async () => {
    process.env.MCPSERVER_API_KEY = 'test-key';
    process.env.MCPSERVER_WORKSPACE_PATH = '/tmp';
    process.env.MCPSERVER_BASE_URL = 'http://localhost:9999';

    const origFetch = globalThis.fetch;
    globalThis.fetch = jest.fn<(...args: any[]) => any>().mockResolvedValue({
      ok: true, headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ ok: true }),
    }) as unknown as typeof globalThis.fetch;

    try {
      const { handleGraphragTool } = await import('../src/tools/graphrag.js');
      const bridge = {} as ReplBridge;
      const result = await handleGraphragTool('graphrag_index', { force: true }, bridge);
      expect(result.result.ok).toBe(true);
    } finally {
      delete process.env.MCPSERVER_API_KEY;
      delete process.env.MCPSERVER_WORKSPACE_PATH;
      delete process.env.MCPSERVER_BASE_URL;
      globalThis.fetch = origFetch;
    }
  });

  test('handleGraphragTool HTTP fallback ingest and doc_delete', async () => {
    process.env.MCPSERVER_API_KEY = 'test-key';
    process.env.MCPSERVER_WORKSPACE_PATH = '/tmp';
    process.env.MCPSERVER_BASE_URL = 'http://localhost:9999';

    let callIdx = 0;
    const origFetch = globalThis.fetch;
    globalThis.fetch = jest.fn<(...args: any[]) => any>().mockImplementation(async () => {
      callIdx++;
      return {
        ok: true, headers: { get: () => 'application/json' },
        text: async () => JSON.stringify(callIdx === 1 ? { id: 'doc-001' } : { deleted: true }),
      } as Response;
    }) as unknown as typeof globalThis.fetch;

    try {
      const { handleGraphragTool } = await import('../src/tools/graphrag.js');
      const bridge = {} as ReplBridge;
      let result = await handleGraphragTool('graphrag_ingest', { content: 'hello', title: 'test', sourceType: 'txt', sourceKey: '/tmp/test.txt' }, bridge);
      expect(result.result.id).toBe('doc-001');
      result = await handleGraphragTool('graphrag_doc_delete', { documentId: 'doc-001' }, bridge);
      expect(result.result.deleted).toBe(true);
    } finally {
      delete process.env.MCPSERVER_API_KEY;
      delete process.env.MCPSERVER_WORKSPACE_PATH;
      delete process.env.MCPSERVER_BASE_URL;
      globalThis.fetch = origFetch;
    }
  });

  test('handleGraphragTool HTTP fallback doc_chunks and entity_get', async () => {
    process.env.MCPSERVER_API_KEY = 'test-key';
    process.env.MCPSERVER_WORKSPACE_PATH = '/tmp';
    process.env.MCPSERVER_BASE_URL = 'http://localhost:9999';

    let callIdx = 0;
    const origFetch = globalThis.fetch;
    globalThis.fetch = jest.fn<(...args: any[]) => any>().mockImplementation(async () => {
      callIdx++;
      return {
        ok: true, headers: { get: () => 'application/json' },
        text: async () => JSON.stringify(callIdx === 1 ? { chunks: ['c1'] } : { id: 'ent-001', name: 'Test' }),
      } as Response;
    }) as unknown as typeof globalThis.fetch;

    try {
      const { handleGraphragTool } = await import('../src/tools/graphrag.js');
      const bridge = {} as ReplBridge;
      let result = await handleGraphragTool('graphrag_doc_chunks', { documentId: 'doc-001' }, bridge);
      expect(result.result.chunks).toEqual(['c1']);
      result = await handleGraphragTool('graphrag_entity_get', { entityId: 'ent-001' }, bridge);
      expect(result.result.name).toBe('Test');
    } finally {
      delete process.env.MCPSERVER_API_KEY;
      delete process.env.MCPSERVER_WORKSPACE_PATH;
      delete process.env.MCPSERVER_BASE_URL;
      globalThis.fetch = origFetch;
    }
  });

  test('handleGraphragTool HTTP fallback entity update and delete', async () => {
    process.env.MCPSERVER_API_KEY = 'test-key';
    process.env.MCPSERVER_WORKSPACE_PATH = '/tmp';
    process.env.MCPSERVER_BASE_URL = 'http://localhost:9999';

    let callIdx = 0;
    const origFetch = globalThis.fetch;
    globalThis.fetch = jest.fn<(...args: any[]) => any>().mockImplementation(async () => {
      callIdx++;
      return {
        ok: true, headers: { get: () => 'application/json' },
        text: async () => JSON.stringify(callIdx === 1 ? { id: 'ent-001' } : { deleted: true }),
      } as Response;
    }) as unknown as typeof globalThis.fetch;

    try {
      const { handleGraphragTool } = await import('../src/tools/graphrag.js');
      const bridge = {} as ReplBridge;
      let result = await handleGraphragTool('graphrag_entity_update', { entityId: 'ent-001', name: 'Updated', entityType: 'component' }, bridge);
      expect(result.result.id).toBe('ent-001');
      result = await handleGraphragTool('graphrag_entity_delete', { entityId: 'ent-001' }, bridge);
      expect(result.result.deleted).toBe(true);
    } finally {
      delete process.env.MCPSERVER_API_KEY;
      delete process.env.MCPSERVER_WORKSPACE_PATH;
      delete process.env.MCPSERVER_BASE_URL;
      globalThis.fetch = origFetch;
    }
  });

  test('handleGraphragTool HTTP fallback relationship get/update/delete', async () => {
    process.env.MCPSERVER_API_KEY = 'test-key';
    process.env.MCPSERVER_WORKSPACE_PATH = '/tmp';
    process.env.MCPSERVER_BASE_URL = 'http://localhost:9999';

    let callIdx = 0;
    const origFetch = globalThis.fetch;
    globalThis.fetch = jest.fn<(...args: any[]) => any>().mockImplementation(async () => {
      callIdx++;
      const payloads = [
        { id: 'rel-001' }, { id: 'rel-001' }, { deleted: true },
      ];
      return {
        ok: true, headers: { get: () => 'application/json' },
        text: async () => JSON.stringify(payloads[callIdx - 1] ?? { ok: true }),
      } as Response;
    }) as unknown as typeof globalThis.fetch;

    try {
      const { handleGraphragTool } = await import('../src/tools/graphrag.js');
      const bridge = {} as ReplBridge;
      let result = await handleGraphragTool('graphrag_rel_get', { relationshipId: 'rel-001' }, bridge);
      expect(result.result.id).toBe('rel-001');
      result = await handleGraphragTool('graphrag_rel_update', { relationshipId: 'rel-001', description: 'updated' }, bridge);
      expect(result.result.id).toBe('rel-001');
      result = await handleGraphragTool('graphrag_rel_delete', { relationshipId: 'rel-001' }, bridge);
      expect(result.result.deleted).toBe(true);
    } finally {
      delete process.env.MCPSERVER_API_KEY;
      delete process.env.MCPSERVER_WORKSPACE_PATH;
      delete process.env.MCPSERVER_BASE_URL;
      globalThis.fetch = origFetch;
    }
  });

  test('handleGraphragTool HTTP fallback network error', async () => {
    process.env.MCPSERVER_API_KEY = 'test-key';
    process.env.MCPSERVER_WORKSPACE_PATH = '/tmp';
    process.env.MCPSERVER_BASE_URL = 'http://localhost:9999';

    const origFetch = globalThis.fetch;
    globalThis.fetch = jest.fn<(...args: any[]) => any>().mockRejectedValue(new Error('Network failure')) as unknown as typeof globalThis.fetch;

    try {
      const { handleGraphragTool } = await import('../src/tools/graphrag.js');
      const bridge = {} as ReplBridge;
      await expect(handleGraphragTool('graphrag_status', {}, bridge)).rejects.toThrow('Network failure');
    } finally {
      delete process.env.MCPSERVER_API_KEY;
      delete process.env.MCPSERVER_WORKSPACE_PATH;
      delete process.env.MCPSERVER_BASE_URL;
      globalThis.fetch = origFetch;
    }
  });
});
