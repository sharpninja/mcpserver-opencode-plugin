import { z } from 'zod';
import {
  createMcpServerPluginCore,
  allToolDescriptors,
  asRecord,
  contextPrompt as coreContextPrompt,
  contextWorkspacePath,
  slug,
  stringValue,
  toolError,
  toolInput,
  toolName,
  utcStamp,
  type HostContext,
  type ReplBridge,
  type ToolDescriptor,
} from '@sharpninja/mcpserver-plugin-core';
import type { ToolResult, Hooks } from './plugin-api.js';

/**
 * Host-glue config for the opencode plugin. The shared transport / cache /
 * marker / session / dispatch logic now lives in
 * `@sharpninja/mcpserver-plugin-core` (`HostContext`); this repo keeps only
 * the opencode SDK wiring below: the zod schema conversion, the
 * `wrapResult` envelope, the event-name regex mapping, and the Hooks tool
 * map.
 */
export interface McpServerPluginConfig {
  agentName?: string;
  sessionTitle?: string;
  workspacePath?: string;
  bridge?: ReplBridge;
  autoBootstrap?: boolean;
  autoFlushCache?: boolean;
  toolTimeoutMs?: number;
}

/**
 * Re-export the host-neutral catalog and context helpers from the core so
 * existing host-glue consumers (and the host-glue test) keep a single import
 * surface (`../src/plugin.js`).
 */
export {
  allToolDescriptors,
  asRecord,
  contextWorkspacePath,
  slug,
  stringValue,
  toolError,
  toolInput,
  toolName,
  utcStamp,
};

/**
 * opencode-flavored prompt resolver: binds the host agent-name default
 * ('OpenCode run') the core's `contextPrompt` leaves to the caller.
 */
export function contextPrompt(value: unknown): string {
  return coreContextPrompt(value, 'OpenCode');
}

/* ------------------------------------------------------------------ *
 * Host-specific glue: opencode SDK shape conversion + result envelope
 * ------------------------------------------------------------------ */

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

export function wrapResult(payload: Record<string, unknown>, _name: string): ToolResult {
  const result = payload.result;
  const output = typeof result === 'string'
    ? result
    : JSON.stringify(result ?? payload, null, 2);
  return {
    output,
    ...(typeof result === 'object' && result !== null ? { metadata: result as Record<string, unknown> } : {}),
  };
}

/* ------------------------------------------------------------------ *
 * Host-specific glue: opencode event-name regex mapping
 * ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ *
 * Plugin factory: wire the shared core into the opencode Hooks contract
 * ------------------------------------------------------------------ */

export async function createMcpServerPlugin(
  config: McpServerPluginConfig = {},
): Promise<Hooks> {
  const core: HostContext = createMcpServerPluginCore({
    agentName: config.agentName ?? 'OpenCode',
    pluginId: 'opencode',
    sessionTitle: config.sessionTitle,
    workspacePath: config.workspacePath,
    bridge: config.bridge,
    autoBootstrap: config.autoBootstrap,
    autoFlushCache: config.autoFlushCache,
    toolTimeoutMs: config.toolTimeoutMs,
  });

  // The core's bootstrapBestEffort/flushCacheBestEffort log via
  // `context.logger.warn` on their swallow paths; opencode has no host
  // logger, so route those messages to stderr (the prior local behavior).
  const stderrLog = (message: string): void => {
    process.stderr.write(`${message}\n`);
  };
  const stderrLogger = { logger: { warn: stderrLog, error: stderrLog } };

  async function dispatchTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      return wrapResult(await core.dispatchTool(name, args), name);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { output: `Error: ${message}` };
    }
  }

  const hooksTools: Record<string, { description: string; args: Record<string, z.ZodTypeAny>; execute: (args: Record<string, unknown>, context: unknown) => Promise<ToolResult> }> = {};
  for (const descriptor of allToolDescriptors) {
    const shape = jsonSchemaToZodShape(descriptor);
    hooksTools[descriptor.name] = {
      description: descriptor.description,
      args: shape,
      execute: async (args: Record<string, unknown>, _context: unknown): Promise<ToolResult> => {
        await core.flushCacheBestEffort(stderrLogger);
        await core.bootstrapBestEffort({ ...args, workspacePath: core.workspacePath, ...stderrLogger });
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
        await core.startSession(payload);
      } else if (isCompleteEvent(name)) {
        await core.completeSession(payload);
      }
    },
    'tool.execute.before': async (
      input: { tool: string; sessionID: string; callID: string },
      _output: { args: Record<string, unknown> },
    ): Promise<void> => {
      try {
        await core.appendToolAction({ toolCall: { name: input.tool } }, 'pending');
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
        await core.appendToolAction(
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
