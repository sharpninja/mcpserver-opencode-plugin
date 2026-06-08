import { z } from 'zod';
import * as path from 'path';
import { ReplBridge } from './transport/repl-bridge.js';
import { fullBootstrap, type MarkerContext } from './discovery/marker-resolver.js';
import { cacheFlush } from './cache/cache-manager.js';
import { todoTools, canHandleTodoTool, handleTodoTool } from './tools/todo.js';
import { sessionTools, canHandleSessionTool, handleSessionTool } from './tools/session.js';
import { memoryTools, canHandleMemoryTool, handleMemoryTool } from './tools/memory.js';
import { requirementsTools, canHandleRequirementsTool, handleRequirementsTool } from './tools/requirements.js';
import { graphragTools, canHandleGraphragTool, handleGraphragTool } from './tools/graphrag.js';
import { workspaceTools, canHandleWorkspaceTool, handleWorkspaceTool } from './tools/workspace.js';
import type { ToolDescriptor } from './tool-descriptor.js';
import type { ToolResult, Hooks } from './plugin-api.js';

export interface McpServerPluginConfig {
  agentName?: string;
  sessionTitle?: string;
  workspacePath?: string;
  bridge?: ReplBridge;
  autoBootstrap?: boolean;
  autoFlushCache?: boolean;
  toolTimeoutMs?: number;
}

export const allToolDescriptors: ToolDescriptor[] = [
  ...workspaceTools,
  ...todoTools,
  ...sessionTools,
  ...memoryTools,
  ...requirementsTools,
  ...graphragTools,
];

export function utcStamp(date = new Date()): string {
  return (
    date.getUTCFullYear().toString() +
    (date.getUTCMonth() + 1).toString().padStart(2, '0') +
    date.getUTCDate().toString().padStart(2, '0') +
    'T' +
    date.getUTCHours().toString().padStart(2, '0') +
    date.getUTCMinutes().toString().padStart(2, '0') +
    date.getUTCSeconds().toString().padStart(2, '0') +
    'Z'
  );
}

export function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'run';
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

export function contextWorkspacePath(value: unknown): string | undefined {
  const record = asRecord(value);
  return (
    stringValue(record.workspacePath) ||
    stringValue(record.workspaceRoot) ||
    stringValue(record.cwd) ||
    stringValue(record.rootPath) ||
    stringValue((asRecord(record.workspaceInfo) as Record<string, unknown>).rootPath) ||
    stringValue((asRecord(record.workspaceInfo) as Record<string, unknown>).workspacePath)
  );
}

export function contextPrompt(value: unknown): string {
  const record = asRecord(value);
  const snapshot = asRecord(record.snapshot);
  return (
    stringValue(record.prompt) ||
    stringValue(record.input) ||
    stringValue(record.queryText) ||
    stringValue(snapshot.prompt) ||
    stringValue(snapshot.input) ||
    stringValue(snapshot.queryText) ||
    'OpenCode run'
  );
}

export function toolName(value: unknown): string {
  const record = asRecord(value);
  const toolCall = asRecord(record.toolCall);
  const toolObj = asRecord(record.tool);
  return stringValue(toolCall.name) || stringValue(toolObj.name) || stringValue(record.toolName) || stringValue(record.name) || 'unknown_tool';
}

export function toolInput(value: unknown): unknown {
  const record = asRecord(value);
  if (Object.prototype.hasOwnProperty.call(record, 'input')) return record.input;
  const toolCall = asRecord(record.toolCall);
  if (Object.prototype.hasOwnProperty.call(toolCall, 'input')) return toolCall.input;
  return undefined;
}

export function toolError(value: unknown): string | undefined {
  const record = asRecord(value);
  const error = record.error;
  if (error instanceof Error) return error.message;
  if (typeof error === 'string' && error.length > 0) return error;
  const toolCall = asRecord(record.toolCall);
  const callError = toolCall.error;
  if (callError instanceof Error) return callError.message;
  if (typeof callError === 'string' && callError.length > 0) return callError;
  return undefined;
}

function eventPayload(value: unknown): Record<string, unknown> {
  const record = asRecord(value);
  const nested = asRecord(record.event);
  return Object.keys(nested).length > 0 ? nested : record;
}

function eventName(value: unknown): string | undefined {
  const record = asRecord(value);
  const nested = asRecord(record.event);
  return stringValue(nested.type) || stringValue(nested.name) || stringValue(record.type) || stringValue(record.name);
}

function isStartEvent(name: string): boolean {
  return /^(session|run|message)[._-](start|started|begin|began)$/i.test(name);
}

function isCompleteEvent(name: string): boolean {
  return /^(session|run|message)[._-](complete|completed|end|ended|stop|stopped|fail|failed|error)$/i.test(name);
}

function setMarkerEnvironment(marker: MarkerContext, agentName: string): void {
  process.env.MCPSERVER_BASE_URL = marker.baseUrl;
  process.env.MCPSERVER_API_KEY = marker.apiKey;
  process.env.MCPSERVER_WORKSPACE_PATH = marker.workspacePath;
  process.env.MCP_WORKSPACE_PATH = marker.workspacePath;
  process.env.MCPSERVER_WORKSPACE = marker.workspace;
  process.env.PLUGIN_AGENT_NAME = agentName;
}

export function jsonPropToZod(prop: Record<string, unknown>, _desc: string): z.ZodTypeAny {
  const types = Array.isArray(prop.type) ? prop.type : [prop.type];

  if (types.includes('boolean')) return z.boolean();
  if (types.includes('number')) return z.number();

  if (prop.type === 'array') {
    const items = prop.items as Record<string, unknown> | undefined;
    if (items && typeof items === 'object' && items.type === 'object' && items.properties) {
      return z.array(jsonPropToZod(items, _desc));
    }
    return z.array(z.string());
  }

  if (prop.type === 'object' && prop.properties) {
    const objShape: Record<string, z.ZodTypeAny> = {};
    for (const [k, v] of Object.entries(prop.properties as Record<string, unknown>)) {
      objShape[k] = jsonPropToZod(v as Record<string, unknown>, '');
    }
    return z.object(objShape);
  }

  return z.string();
}

export function jsonSchemaToZodShape(descriptor: ToolDescriptor): Record<string, z.ZodTypeAny> {
  const props = (descriptor.inputSchema as { properties?: Record<string, unknown> }).properties ?? {};
  const required = new Set((descriptor.inputSchema as { required?: string[] })?.required ?? []);
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [key, value] of Object.entries(props)) {
    const prop = value as Record<string, unknown>;
    const desc = (prop.description as string) ?? '';
    const zodType = jsonPropToZod(prop, desc);
    shape[key] = required.has(key) ? zodType : zodType.optional();
  }

  return shape;
}

export function wrapResult(payload: Record<string, unknown>, name: string): ToolResult {
  const result = payload.result;
  const output = typeof result === 'string'
    ? result
    : JSON.stringify(result ?? payload, null, 2);
  return {
    output,
    ...(typeof result === 'object' && result !== null ? { metadata: result as Record<string, unknown> } : {}),
  };
}

export async function createMcpServerPlugin(
  config: McpServerPluginConfig = {},
): Promise<Hooks> {
  const agentName = config.agentName ?? 'OpenCode';
  const bridge = config.bridge ?? new ReplBridge();
  let setupWorkspacePath = config.workspacePath;
  let bootstrappedWorkspace: string | undefined;
  let activeSessionId: string | undefined;
  let activeRequestId: string | undefined;
  let actionOrder = 0;
  let cacheFlushed = false;

  async function bootstrap(context?: unknown): Promise<MarkerContext | null> {
    const workspacePath =
      config.workspacePath ||
      contextWorkspacePath(context) ||
      setupWorkspacePath ||
      process.env.MCPSERVER_WORKSPACE_PATH ||
      process.env.MCP_WORKSPACE_PATH ||
      process.cwd();
    setupWorkspacePath = workspacePath;

    if (config.autoBootstrap === false) return null;
    if (bootstrappedWorkspace && path.resolve(bootstrappedWorkspace) === path.resolve(workspacePath)) return null;

    const marker = await fullBootstrap(workspacePath);
    setMarkerEnvironment(marker, agentName);
    bootstrappedWorkspace = marker.workspacePath;
    return marker;
  }

  async function bootstrapBestEffort(context?: unknown): Promise<void> {
    try {
      await bootstrap(context);
    } catch (error) {
      const message = `[mcpserver-opencode] marker bootstrap failed; continuing with failsafe behavior: ${
        error instanceof Error ? error.message : String(error)
      }`;
      process.stderr.write(`${message}\n`);
    }
  }

  async function flushCacheBestEffort(): Promise<void> {
    if (config.autoFlushCache === false || cacheFlushed) return;
    try {
      const result = await cacheFlush(bridge);
      cacheFlushed = true;
      if (result.flushed > 0 || result.failed > 0) {
        process.stderr.write(
          `[mcpserver-opencode] failsafe replay flushed=${result.flushed} failed=${result.failed} pending=${result.pending}\n`,
        );
      }
    } catch (error) {
      const message = `[mcpserver-opencode] failsafe replay failed: ${
        error instanceof Error ? error.message : String(error)
      }`;
      process.stderr.write(`${message}\n`);
    }
  }

  async function dispatchTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      if (canHandleWorkspaceTool(name)) return wrapResult(await handleWorkspaceTool(name, args, bridge, setupWorkspacePath), name);
      if (canHandleTodoTool(name)) return wrapResult(await handleTodoTool(name, args, bridge), name);
      if (canHandleSessionTool(name)) return wrapResult(await handleSessionTool(name, args, bridge), name);
      if (canHandleMemoryTool(name)) return wrapResult(await handleMemoryTool(name, args, bridge), name);
      if (canHandleRequirementsTool(name)) return wrapResult(await handleRequirementsTool(name, args, bridge), name);
      if (canHandleGraphragTool(name)) return wrapResult(await handleGraphragTool(name, args, bridge), name);
      throw new Error(`Unknown tool: ${name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { output: `Error: ${message}` };
    }
  }

  async function invokeSession(name: string, args: Record<string, unknown>): Promise<void> {
    await handleSessionTool(name, args, bridge);
  }

  async function startSession(context?: unknown): Promise<void> {
    const stamp = utcStamp();
    const prompt = contextPrompt(context);
    activeSessionId = activeSessionId ?? `${agentName}-${stamp}-${slug(setupWorkspacePath ?? 'workspace')}`;
    activeRequestId = `req-${stamp}-${slug(prompt)}`;
    await invokeSession('session_bootstrap', {});
    await invokeSession('session_open', {
      agent: agentName,
      sessionId: activeSessionId,
      title: config.sessionTitle ?? prompt.slice(0, 120),
    });
    await invokeSession('session_begin_turn', {
      requestId: activeRequestId,
      queryTitle: prompt.slice(0, 120),
      queryText: prompt,
    });
  }

  async function completeSession(context?: unknown): Promise<void> {
    if (!activeSessionId || !activeRequestId) return;
    const record = asRecord(context);
    const result = asRecord(record.result);
    const error = toolError(context) || stringValue(result.error);
    if (error) {
      await invokeSession('session_fail_turn', { errorMessage: error, errorCode: 'opencode_run_failed' });
      await invokeSession('session_close', { agent: agentName, sessionId: activeSessionId, status: 'failed' });
    } else {
      await invokeSession('session_complete_turn', {
        response: stringValue(result.output) || stringValue(record.response) || 'OpenCode run completed.',
      });
      await invokeSession('session_close', { agent: agentName, sessionId: activeSessionId, status: 'completed' });
    }
    activeRequestId = undefined;
  }

  async function appendToolAction(context: unknown, status: 'pending' | 'completed', error?: string): Promise<void> {
    if (!activeRequestId) return;
    const name = toolName(context);
    const input = toolInput(context);
    await invokeSession('session_append_actions', {
      actions: [
        {
          order: ++actionOrder,
          type: 'design_decision',
          status,
          description: error
            ? `OpenCode tool ${name} failed: ${error}`
            : `OpenCode tool ${name} ${status === 'pending' ? 'started' : 'completed'}`,
        },
      ],
    });
    await invokeSession('session_append_dialog', {
      dialogItems: [
        {
          timestamp: new Date().toISOString(),
          role: 'tool',
          category: error ? 'tool_result' : status === 'pending' ? 'tool_call' : 'tool_result',
          content: JSON.stringify({ tool: name, input, status, ...(error ? { error } : {}) }),
        },
      ],
    });
  }

  const hooksTools: Record<string, { description: string; args: Record<string, z.ZodTypeAny>; execute: (args: Record<string, unknown>, context: unknown) => Promise<ToolResult> }> = {};
  for (const descriptor of allToolDescriptors) {
    const shape = jsonSchemaToZodShape(descriptor);
    hooksTools[descriptor.name] = {
      description: descriptor.description,
      args: shape,
      execute: async (args: Record<string, unknown>, _context: unknown): Promise<ToolResult> => {
        await flushCacheBestEffort();
        await bootstrapBestEffort({ ...args, workspacePath: setupWorkspacePath });
        return dispatchTool(descriptor.name, args);
      },
    };
  }

  return {
    tool: hooksTools as Record<string, never>,
    event: async (input: { event: unknown }): Promise<void> => {
      const name = eventName(input);
      if (!name) return;

      const payload = eventPayload(input);
      if (isStartEvent(name)) {
        await startSession(payload);
      } else if (isCompleteEvent(name)) {
        await completeSession(payload);
      }
    },
    'tool.execute.before': async (
      input: { tool: string; sessionID: string; callID: string },
      _output: { args: Record<string, unknown> },
    ): Promise<void> => {
      try {
        await appendToolAction({ toolCall: { name: input.tool } }, 'pending');
      } catch (error) {
        process.stderr.write(
          `[mcpserver-opencode] tool.execute.before audit failed: ${error instanceof Error ? error.message : String(error)}\n`,
        );
      }
    },
    'tool.execute.after': async (
      input: { tool: string; sessionID: string; callID: string; args: Record<string, unknown> },
      output: { title: string; output: string; metadata: Record<string, unknown> },
    ): Promise<void> => {
      try {
        const hasError = toolError({ toolCall: { name: input.tool, error: output?.metadata?._error } });
        await appendToolAction(
          { toolCall: { name: input.tool, input: input.args } },
          hasError ? 'pending' : 'completed',
          hasError,
        );
      } catch (error) {
        process.stderr.write(
          `[mcpserver-opencode] tool.execute.after audit failed: ${error instanceof Error ? error.message : String(error)}\n`,
        );
      }
    },
  } as unknown as Hooks;
}

export default createMcpServerPlugin;
