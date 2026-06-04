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
    expect(canHandleRequirementsTool('req_create_fr_batch')).toBe(true);
    expect(canHandleRequirementsTool('req_update_fr')).toBe(true);
    expect(canHandleRequirementsTool('req_update_fr_batch')).toBe(true);
    expect(canHandleRequirementsTool('req_delete_fr')).toBe(true);
    expect(canHandleRequirementsTool('req_list_tr')).toBe(true);
    expect(canHandleRequirementsTool('req_create_tr')).toBe(true);
    expect(canHandleRequirementsTool('req_create_tr_batch')).toBe(true);
    expect(canHandleRequirementsTool('req_update_tr')).toBe(true);
    expect(canHandleRequirementsTool('req_update_tr_batch')).toBe(true);
    expect(canHandleRequirementsTool('req_delete_tr')).toBe(true);
    expect(canHandleRequirementsTool('req_list_test')).toBe(true);
    expect(canHandleRequirementsTool('req_create_test')).toBe(true);
    expect(canHandleRequirementsTool('req_create_test_batch')).toBe(true);
    expect(canHandleRequirementsTool('req_update_test')).toBe(true);
    expect(canHandleRequirementsTool('req_update_test_batch')).toBe(true);
    expect(canHandleRequirementsTool('req_delete_test')).toBe(true);
    expect(canHandleRequirementsTool('req_create_batch')).toBe(true);
    expect(canHandleRequirementsTool('req_update_batch')).toBe(true);
    expect(canHandleRequirementsTool('req_copy_acceptance_criteria_from_todo')).toBe(true);
    expect(canHandleRequirementsTool('req_list_mappings')).toBe(true);
    expect(canHandleRequirementsTool('req_create_mapping')).toBe(true);
    expect(canHandleRequirementsTool('req_delete_mapping')).toBe(true);
    expect(canHandleRequirementsTool('req_generate_document')).toBe(true);
    expect(canHandleRequirementsTool('req_ingest_document')).toBe(true);
    expect(canHandleRequirementsTool('req_nonexistent')).toBe(false);
  });

  test('requirements helper branches cover document, typed params, and fallback normalization', async () => {
    const mod = await import('../src/tools/requirements.js');
    expect(mod.workflowDocType('functional')).toBe('fr');
    expect(mod.workflowDocType('technical')).toBe('tr');
    expect(mod.workflowDocType('testing')).toBe('test');
    expect(mod.workflowDocType('mapping')).toBe('matrix');
    expect(mod.workflowDocType(undefined)).toBe('all');
    expect(mod.workflowDocType('')).toBe('all');
    expect(mod.workflowDocType('custom')).toBe('custom');

    expect(mod.typedDocType('fr')).toBe('functional');
    expect(mod.typedDocType('tr')).toBe('technical');
    expect(mod.typedDocType('test')).toBe('testing');
    expect(mod.typedDocType('matrix')).toBe('mapping');
    expect(mod.typedDocType(undefined)).toBe('all');
    expect(mod.typedDocType('')).toBe('all');
    expect(mod.typedDocType('custom')).toBe('custom');

    expect(mod.workflowParams('req_list_fr', { area: 'MCP' })).toEqual({ area: 'MCP' });
    expect(mod.workflowParams('req_generate_document', { docType: 'functional' })).toEqual({ format: 'markdown', docType: 'fr' });
    expect(mod.listParam({ trIds: ['TR-1', 2, 'TR-2'] }, 'trIds', 'trId')).toEqual(['TR-1', 'TR-2']);
    expect(mod.listParam({ trId: 'TR-3' }, 'trIds', 'trId')).toEqual(['TR-3']);
    expect(mod.listParam({ trId: '' }, 'trIds', 'trId')).toEqual([]);

    const acceptanceCriteria = [{ text: 'criterion', isSatisfied: false }];
    expect(mod.typedParams('req_list_fr', {})).toEqual({});
    expect(mod.typedParams('req_get_fr', { id: 'FR-1' })).toEqual({ id: 'FR-1' });
    expect(mod.typedParams('req_create_fr', { id: 'FR-1', title: 'Title', body: 'Body', acceptanceCriteria })).toEqual({
      request: { id: 'FR-1', title: 'Title', body: 'Body', acceptanceCriteria },
    });
    expect(mod.typedParams('req_update_tr', { id: 'TR-1', description: 'Body' })).toEqual({
      id: 'TR-1',
      request: { title: '', body: 'Body' },
    });
    expect(mod.typedParams('req_update_fr', { id: 'FR-1', title: 'Title', acceptanceCriteria })).toEqual({
      id: 'FR-1',
      request: { title: 'Title', body: '', acceptanceCriteria },
    });
    expect(mod.typedParams('req_create_test', { id: 'TEST-1', condition: 'Condition', acceptanceCriteria })).toEqual({
      request: { id: 'TEST-1', condition: 'Condition', acceptanceCriteria },
    });
    expect(mod.typedParams('req_update_test', { id: 'TEST-1', description: 'Condition' })).toEqual({
      id: 'TEST-1',
      request: { condition: 'Condition' },
    });
    expect(mod.typedParams('req_update_test', { id: 'TEST-2', acceptanceCriteria })).toEqual({
      id: 'TEST-2',
      request: { condition: '', acceptanceCriteria },
    });
    const directRecords = [{ id: 'FR-DIRECT-001', title: 'Direct' }];
    expect(mod.typedParams('req_update_fr_batch', { records: directRecords })).toEqual({
      request: { records: directRecords },
    });
    expect(mod.parseRecordsValue(directRecords)).toBe(directRecords);
    expect(mod.parseRecordsValue('')).toBe('');
    expect(mod.parseRecordsValue('records: [')).toBe('records: [');
    expect(mod.parseRecordsValue('foo: bar')).toBe('foo: bar');
    expect(mod.parseRecordsValue('records:\n- id: FR-YAML-001\n  title: YAML')).toEqual([
      { id: 'FR-YAML-001', title: 'YAML' },
    ]);
    expect(mod.parseRecordsValue('[{"id":"FR-JSON-001","title":"JSON"}]')).toEqual([
      { id: 'FR-JSON-001', title: 'JSON' },
    ]);
    const nonBatchArgs = { records: '[{"id":"FR-UNCHANGED-001"}]' };
    expect(mod.normalizeRequirementArgs('req_list_fr', nonBatchArgs)).toBe(nonBatchArgs);
    expect(mod.normalizeRequirementArgs('req_update_fr_batch', { records: 'records:\n- id: FR-NORM-001' })).toEqual({
      records: [{ id: 'FR-NORM-001' }],
    });
    expect(mod.typedParams('req_copy_acceptance_criteria_from_todo', { kind: 'fr', id: 'FR-1', todoId: 'TODO-1' })).toEqual({
      kind: 'fr',
      id: 'FR-1',
      todoId: 'TODO-1',
    });
    expect(mod.typedParams('req_create_mapping', { frId: 'FR-1', trId: 'TR-1', testIds: ['TEST-1'] })).toEqual({
      frId: 'FR-1',
      request: { trIds: ['TR-1'], testIds: ['TEST-1'] },
    });
    expect(mod.typedParams('req_delete_mapping', { frId: 'FR-1' })).toEqual({ frId: 'FR-1' });
    expect(mod.typedParams('req_generate_document', { docType: 'matrix', format: 'wiki' })).toEqual({ doc: 'mapping', format: 'wiki' });
    expect(mod.typedParams('req_generate_document', { docType: 'functional', format: 1 })).toEqual({ doc: 'functional', format: 'markdown' });
    expect(mod.typedParams('req_ingest_document', { documents: { functional: 'FR' }, sourceFormat: 'wiki', preferredWikiFormat: 'zip' })).toEqual({
      request: { sourceFormat: 'wiki', preferredWikiFormat: 'zip', documents: { functional: 'FR' } },
    });
    expect(mod.typedParams('req_ingest_document', { documents: { technical: 'TR' }, sourceFormat: 1, preferredWikiFormat: 2 })).toEqual({
      request: { sourceFormat: 'wiki', documents: { technical: 'TR' } },
    });
    expect(mod.typedParams('req_ingest_document', { content: 'all-docs' })).toEqual({
      request: {
        functionalMarkdown: 'all-docs',
        technicalMarkdown: 'all-docs',
        testingMarkdown: 'all-docs',
        mappingMarkdown: 'all-docs',
      },
    });
    expect(mod.typedParams('unknown', { passthrough: true })).toEqual({ passthrough: true });

    expect(mod.isWikiGenerate('req_generate_document', { format: 'wiki' })).toBe(true);
    expect(mod.isWikiGenerate('req_generate_document', {})).toBe(false);
    expect(mod.isWikiGenerate('req_list_fr', { format: 'wiki' })).toBe(false);

    expect(mod.normalizeGenerateResponse({ type: 'result', payload: {} })).toEqual({ type: 'result', payload: {} });
    expect(mod.normalizeGenerateResponse({ type: 'result', payload: { result: { content: 'text' } } })).toEqual({
      type: 'result',
      payload: { result: { content: 'text' } },
    });
    const markdown = mod.normalizeGenerateResponse({ type: 'result', payload: { result: { content: [65, 66], contentType: 'text/markdown' } } });
    expect((markdown.payload as { result: Record<string, unknown> }).result.content).toBe('AB');
    const zip = mod.normalizeGenerateResponse({ type: 'result', payload: { result: { content: [1, 2], contentType: 'application/zip' } } });
    expect((zip.payload as { result: Record<string, unknown> }).result.contentBase64).toBe('AQI=');
    const zipByName = mod.normalizeGenerateResponse({
      type: 'result',
      payload: { result: { content: [65], fileName: 'custom.zip', format: 'wiki', docType: 'fr', generatedAt: '2026-01-01T00:00:00Z' } },
    });
    expect((zipByName.payload as { result: Record<string, unknown> }).result).toMatchObject({
      contentBase64: 'QQ==',
      fileName: 'custom.zip',
      format: 'wiki',
      docType: 'fr',
      generatedAt: '2026-01-01T00:00:00Z',
    });
    expect(mod.hasZipContent(zip)).toBe(true);
    expect(mod.hasZipContent({ type: 'result', payload: { result: { contentBase64: 'abc', fileName: 'x.zip' } } })).toBe(true);
    expect(mod.hasZipContent({ type: 'result', payload: {} })).toBe(false);
    expect(mod.hasZipContent({ type: 'result', payload: { result: { contentBase64: 'abc', contentType: 'text/plain' } } })).toBe(false);

    const oldFetch = globalThis.fetch;
    const oldBaseUrl = process.env.MCPSERVER_BASE_URL;
    const oldApiKey = process.env.MCPSERVER_API_KEY;
    const oldWorkspacePath = process.env.MCPSERVER_WORKSPACE_PATH;
    const oldMcpWorkspacePath = process.env.MCP_WORKSPACE_PATH;
    try {
      delete process.env.MCPSERVER_BASE_URL;
      delete process.env.MCPSERVER_API_KEY;
      delete process.env.MCPSERVER_WORKSPACE_PATH;
      delete process.env.MCP_WORKSPACE_PATH;
      expect(await mod.generateDocumentHttpFallback({ format: 'markdown' })).toBeNull();
      expect(await mod.generateDocumentHttpFallback({ format: 'wiki' })).toBeNull();

      process.env.MCPSERVER_BASE_URL = 'http://localhost:9999';
      process.env.MCPSERVER_API_KEY = 'key';
      process.env.MCPSERVER_WORKSPACE_PATH = 'F:\\GitHub\\McpServer';
      globalThis.fetch = jest.fn<(...args: any[]) => any>()
        .mockResolvedValueOnce({ ok: false, status: 503, text: async () => 'down' })
        .mockResolvedValueOnce({
          ok: true,
          headers: { get: () => 'text/plain' },
          arrayBuffer: async () => new Uint8Array([65]).buffer,
        })
        .mockResolvedValueOnce({ ok: false, status: 504, text: async () => { throw new Error('unreadable'); } })
        .mockResolvedValueOnce({
          ok: true,
          headers: { get: () => null },
          arrayBuffer: async () => new Uint8Array([66]).buffer,
        }) as unknown as typeof globalThis.fetch;

      const errorResult = await mod.generateDocumentHttpFallback({ format: 'wiki', docType: 'fr' });
      expect(errorResult?.type).toBe('error');
      const textResult = await mod.generateDocumentHttpFallback({ format: 'wiki', docType: 'tr' });
      expect((textResult?.payload as { result: Record<string, unknown> }).result.contentType).toBe('text/plain');
      const emptyErrorResult = await mod.generateDocumentHttpFallback({ format: 'wiki', docType: 'matrix' });
      expect((emptyErrorResult?.payload as { code?: string; message?: string }).message).toBe('requirements generate HTTP fallback returned HTTP 504');
      const defaultZipResult = await mod.generateDocumentHttpFallback({ format: 'wiki' });
      expect((defaultZipResult?.payload as { result: Record<string, unknown> }).result).toMatchObject({
        contentType: 'application/zip',
        fileName: 'requirements-wiki-documents.zip',
      });
    } finally {
      globalThis.fetch = oldFetch;
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

  // ------------------------------------------------------------------
  // AcceptanceCriteria forwarding coverage
  // ------------------------------------------------------------------


  test('req_copy_acceptance_criteria_from_todo maps to the workflow method', async () => {
    const { handleRequirementsTool } = await import('../src/tools/requirements.js');
    const bridge = {
      invoke: jest.fn().mockResolvedValue({ type: 'result', payload: { result: { copied: true } } }),
    } as unknown as ReplBridge;

    await handleRequirementsTool(
      'req_copy_acceptance_criteria_from_todo',
      { kind: 'fr', id: 'FR-AC-001', todoId: 'PLAN-MCP-001' },
      bridge,
    );

    expect(bridge.invoke).toHaveBeenCalledWith('workflow.requirements.copyAcceptanceCriteriaFromTodo', {
      kind: 'fr',
      id: 'FR-AC-001',
      todoId: 'PLAN-MCP-001',
    });
  });

  test('req_copy_acceptance_criteria_from_todo does not fall back to a typed method', async () => {
    const { handleRequirementsTool } = await import('../src/tools/requirements.js');
    const bridge = {
      invoke: jest.fn().mockResolvedValue({ type: 'error', payload: { code: 'copy_failed', message: 'copy failed' } }),
    } as unknown as ReplBridge;

    await expect(handleRequirementsTool(
      'req_copy_acceptance_criteria_from_todo',
      { kind: 'fr', id: 'FR-AC-001', todoId: 'PLAN-MCP-001' },
      bridge,
    )).rejects.toThrow(/copy_failed/);

    expect(bridge.invoke).toHaveBeenCalledTimes(1);
    expect(bridge.invoke).toHaveBeenCalledWith('workflow.requirements.copyAcceptanceCriteriaFromTodo', {
      kind: 'fr',
      id: 'FR-AC-001',
      todoId: 'PLAN-MCP-001',
    });
  });

  test('handleRequirementsTool updateFrBatch parses PowerShell YAML string records before invoking bridge', async () => {
    const { handleRequirementsTool } = await import('../src/tools/requirements.js');
    const bridge = {
      invoke: jest.fn().mockResolvedValue({ type: 'result', payload: { result: { items: [] } } }),
    } as unknown as ReplBridge;

    const recordsYaml = `records:
- id: FR-LOC-001
  title: Monitor device location
  description: The system SHALL monitor the device location while tracking is enabled.
  priority: high
  status: pending
  area: LOC
  acceptanceCriteria:
  - id: FR-LOC-001-AC001
    text: Demonstrates behavior for FR-LOC-001.
    isSatisfied: false`;

    await handleRequirementsTool('req_update_fr_batch', { records: recordsYaml }, bridge);

    expect(bridge.invoke).toHaveBeenCalledWith('workflow.requirements.updateFrBatch', {
      records: [
        {
          id: 'FR-LOC-001',
          title: 'Monitor device location',
          description: 'The system SHALL monitor the device location while tracking is enabled.',
          priority: 'high',
          status: 'pending',
          area: 'LOC',
          acceptanceCriteria: [
            {
              id: 'FR-LOC-001-AC001',
              text: 'Demonstrates behavior for FR-LOC-001.',
              isSatisfied: false,
            },
          ],
        },
      ],
    });
  });

  test('handleRequirementsTool createBatch parses inline JSON array records before invoking bridge', async () => {
    const { handleRequirementsTool } = await import('../src/tools/requirements.js');
    const bridge = {
      invoke: jest.fn().mockResolvedValue({ type: 'result', payload: { result: { items: [] } } }),
    } as unknown as ReplBridge;
    const recordsJson = '[{"kind":"fr","id":"FR-LOC-001","title":"Monitor device location","description":"The system SHALL monitor the device location while tracking is enabled.","priority":"high","status":"pending","area":"LOC","acceptanceCriteria":[{"id":"FR-LOC-001-AC001","text":"Demonstrates behavior for FR-LOC-001.","isSatisfied":false}]}]';

    await handleRequirementsTool('req_create_batch', { records: recordsJson }, bridge);

    expect(bridge.invoke).toHaveBeenCalledWith('workflow.requirements.createBatch', {
      records: [
        expect.objectContaining({
          kind: 'fr',
          id: 'FR-LOC-001',
          acceptanceCriteria: [
            expect.objectContaining({
              id: 'FR-LOC-001-AC001',
              isSatisfied: false,
            }),
          ],
        }),
      ],
    });
  });

  test('handleRequirementsTool createFr forwards acceptanceCriteria to workflow', async () => {
    const { handleRequirementsTool } = await import('../src/tools/requirements.js');
    const invoke = jest
      .fn<(...args: any[]) => any>()
      .mockResolvedValue({ type: 'result', payload: { result: { id: 'FR-AUTH-001' } } });
    const bridge = { invoke } as unknown as ReplBridge;

    const acceptanceCriteria = [
      { text: 'User can log in with email and password', isSatisfied: false },
      { id: 'AC-2', text: 'User receives error on bad credentials', isSatisfied: true, evidence: 'TEST-AUTH-001' },
    ];

    await handleRequirementsTool('req_create_fr', {
      id: 'FR-AUTH-001', title: 'Auth', description: 'Login', priority: 'high', area: 'AUTH',
      acceptanceCriteria,
    }, bridge);

    expect(invoke).toHaveBeenCalledWith('workflow.requirements.createFr', expect.objectContaining({
      acceptanceCriteria,
    }));
  });

  test('handleRequirementsTool updateTest forwards acceptanceCriteria to typed fallback', async () => {
    const { handleRequirementsTool } = await import('../src/tools/requirements.js');
    const invoke = jest
      .fn<(...args: any[]) => any>()
      .mockResolvedValueOnce({ type: 'result', payload: { result: {} } })
      .mockResolvedValueOnce({ type: 'result', payload: { result: { id: 'TEST-001' } } });
    const bridge = { invoke } as unknown as ReplBridge;

    const acceptanceCriteria = [{ text: 'Test verifies happy path', isSatisfied: true }];

    await handleRequirementsTool('req_update_test', {
      id: 'TEST-001', description: 'Should pass', acceptanceCriteria,
    }, bridge);

    expect(invoke).toHaveBeenNthCalledWith(2, 'client.Requirements.UpdateTestAsync', {
      id: 'TEST-001',
      request: { condition: 'Should pass', acceptanceCriteria },
    });
  });

  test('handleRequirementsTool createTr forwards acceptanceCriteria to typed fallback request body', async () => {
    const { handleRequirementsTool } = await import('../src/tools/requirements.js');
    const invoke = jest
      .fn<(...args: any[]) => any>()
      .mockResolvedValueOnce({ type: 'result', payload: { result: {} } })
      .mockResolvedValueOnce({ type: 'result', payload: { result: { id: 'TR-AUTH-DB-001' } } });
    const bridge = { invoke } as unknown as ReplBridge;

    const acceptanceCriteria = [
      { text: 'Schema includes users table', isSatisfied: false },
      { text: 'Schema includes sessions table', isSatisfied: false },
    ];

    await handleRequirementsTool('req_create_tr', {
      id: 'TR-AUTH-DB-001', title: 'DB', description: 'Schema', priority: 'high', area: 'AUTH', subarea: 'DB',
      acceptanceCriteria,
    }, bridge);

    expect(invoke).toHaveBeenNthCalledWith(2, 'client.Requirements.CreateTrAsync', {
      request: {
        id: 'TR-AUTH-DB-001',
        title: 'DB',
        body: 'Schema',
        acceptanceCriteria,
      },
    });
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

  test('graphrag helper branches parse responses and fallback errors', async () => {
    const {
      graphragHttpFallback,
      jsonInit,
      parseHttpResponse,
      pickBody,
    } = await import('../src/tools/graphrag.js');

    expect(pickBody({ name: 'Svc', missing: null, empty: '', zero: 0 }, ['name', 'missing', 'empty', 'zero'])).toEqual({
      name: 'Svc',
      zero: 0,
    });

    const emptyResponse = await parseHttpResponse({
      ok: true,
      headers: { get: () => null },
      text: async () => '',
    } as unknown as Response);
    expect(emptyResponse).toEqual({ contentType: 'application/json', result: { success: true }, bodyText: '' });

    const jsonResponse = await parseHttpResponse({
      headers: { get: () => 'application/json; charset=utf-8' },
      text: async () => '{"ready":true}',
    } as unknown as Response);
    expect(jsonResponse.result).toEqual({ ready: true });

    const invalidJsonResponse = await parseHttpResponse({
      headers: { get: () => 'application/json' },
      text: async () => '{bad json',
    } as unknown as Response);
    expect(invalidJsonResponse.result).toBe('{bad json');

    const textResponse = await parseHttpResponse({
      headers: { get: () => 'text/plain' },
      text: async () => 'plain result',
    } as unknown as Response);
    expect(textResponse.result).toBe('plain result');

    const init = jsonInit('PATCH', { Authorization: 'Bearer token' }, { name: 'Svc' });
    expect(init).toEqual({
      method: 'PATCH',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Svc' }),
    });

    const originalApiKey = process.env.MCPSERVER_API_KEY;
    const originalWorkspacePath = process.env.MCPSERVER_WORKSPACE_PATH;
    const originalBaseUrl = process.env.MCPSERVER_BASE_URL;
    const originalFetch = globalThis.fetch;

    try {
      delete process.env.MCPSERVER_API_KEY;
      delete process.env.MCPSERVER_WORKSPACE_PATH;
      delete process.env.MCPSERVER_BASE_URL;
      expect(await graphragHttpFallback('graphrag_status', {})).toBeNull();

      process.env.MCPSERVER_API_KEY = 'test-key';
      process.env.MCPSERVER_WORKSPACE_PATH = '/tmp/workspace';
      process.env.MCPSERVER_BASE_URL = 'http://localhost:9999';
      globalThis.fetch = jest.fn<(...args: any[]) => any>().mockResolvedValue({
        ok: false,
        status: 418,
        headers: { get: () => 'text/plain' },
        text: async () => 'short and stout',
      }) as unknown as typeof globalThis.fetch;

      expect(await graphragHttpFallback('graphrag_unknown', {})).toBeNull();
      const fallback = await graphragHttpFallback('graphrag_status', {});
      expect(fallback).toEqual({
        type: 'error',
        payload: {
          code: 'http_error',
          message: 'GraphRAG HTTP fallback returned HTTP 418 for graphrag_status: short and stout',
        },
      });
    } finally {
      if (originalApiKey === undefined) delete process.env.MCPSERVER_API_KEY;
      else process.env.MCPSERVER_API_KEY = originalApiKey;
      if (originalWorkspacePath === undefined) delete process.env.MCPSERVER_WORKSPACE_PATH;
      else process.env.MCPSERVER_WORKSPACE_PATH = originalWorkspacePath;
      if (originalBaseUrl === undefined) delete process.env.MCPSERVER_BASE_URL;
      else process.env.MCPSERVER_BASE_URL = originalBaseUrl;
      globalThis.fetch = originalFetch;
    }
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
