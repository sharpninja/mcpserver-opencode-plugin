import { z } from 'zod';

export interface ToolContext {
  sessionID: string;
  messageID: string;
  agent: string;
  directory: string;
  worktree: string;
  abort: AbortSignal;
  metadata(input: { title?: string; metadata?: Record<string, unknown> }): void;
  ask(input: { permission: string; patterns: string[]; always: string[]; metadata: Record<string, unknown> }): Promise<void>;
}

export type ToolResult = string | {
  title?: string;
  output: string;
  metadata?: Record<string, unknown>;
};

export interface ToolDefinition<Args extends z.ZodRawShape = z.ZodRawShape> {
  description: string;
  args: Args;
  execute(args: z.infer<z.ZodObject<Args>>, context: ToolContext): Promise<ToolResult>;
}

export interface PluginInput {
  directory: string;
  worktree: string;
}

export type PluginOptions = Record<string, unknown>;

export interface Hooks {
  event?: (input: { event: unknown }) => Promise<void>;
  config?: (input: Record<string, unknown>) => Promise<void>;
  tool?: Record<string, ToolDefinition>;
  auth?: unknown;
  provider?: unknown;
  'tool.execute.before'?: (input: { tool: string; sessionID: string; callID: string }, output: { args: Record<string, unknown> }) => Promise<void>;
  'tool.execute.after'?: (input: { tool: string; sessionID: string; callID: string; args: Record<string, unknown> }, output: { title: string; output: string; metadata: Record<string, unknown> }) => Promise<void>;
  [key: string]: unknown;
}

export type Plugin = (input: PluginInput, options?: PluginOptions) => Promise<Hooks>;
