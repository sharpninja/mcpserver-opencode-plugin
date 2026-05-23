export class FakeZodType {
  constructor(public _type: string) {}
  optional() { return this; }
  catchall(_fallback: unknown) { return this; }
  parse(val: unknown) { return val; }
}

const schema = {
  string: () => new FakeZodType('ZodString'),
  number: () => new FakeZodType('ZodNumber'),
  boolean: () => new FakeZodType('ZodBoolean'),
  object: (shape: Record<string, FakeZodType>) => new FakeZodType('ZodObject'),
  array: (elementType: FakeZodType) => new FakeZodType('ZodArray'),
  any: () => new FakeZodType('ZodAny'),
};

export function tool<TArgs extends Record<string, FakeZodType>>(input: {
  description: string;
  args: TArgs;
  execute(args: Record<string, unknown>, context: unknown): Promise<unknown>;
}): {
  description: string;
  args: TArgs;
  execute(args: Record<string, unknown>, context: unknown): Promise<unknown>;
} {
  return input;
}

tool.schema = schema;

export interface Plugin {
  (ctx?: unknown): Promise<Record<string, unknown>>;
}

export type ToolContext = Record<string, unknown>;
export type ToolResult = string | { title?: string; output: string; metadata?: Record<string, unknown> };
export type PluginInput = Record<string, unknown>;
export type PluginOptions = Record<string, unknown>;
export type Hooks = Record<string, unknown>;
