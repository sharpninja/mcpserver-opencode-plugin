import { jest } from '@jest/globals';
import { PassThrough } from 'stream';
import * as yaml from 'js-yaml';

/* ==================================================================
 * Module-level mocks -- defined BEFORE unstable_mockModule
 * ================================================================== */

const mockSpawn = jest.fn<() => any>();

jest.unstable_mockModule('child_process', () => ({
  spawn: mockSpawn,
}));

type ReplBridgeModule = typeof import('../src/transport/repl-bridge.js');
let ReplBridge!: ReplBridgeModule['ReplBridge'];

/* ==================================================================
 * Fake child process helper
 * ================================================================== */

function createProcMock() {
  const exitHandlers: Array<(code: number | null) => void> = [];

  return {
    stdin: { write: jest.fn(), end: jest.fn() },
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    killed: false,
    exitCode: null,
    kill: jest.fn<void, [string?]>(),
    on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (event === 'exit') {
        exitHandlers.push(handler as (code: number | null) => void);
      }
    }),
    _emitExit(code: number | null) {
      exitHandlers.forEach((h) => h(code));
    },
  };
}

type ProcMock = ReturnType<typeof createProcMock>;

let currentProc: ProcMock | null = null;

beforeEach(() => {
  mockSpawn.mockClear();
  mockSpawn.mockImplementation(() => {
    currentProc = createProcMock();
    return currentProc;
  });
});

afterEach(() => {
  currentProc = null;
  jest.useRealTimers();
  delete process.env.MCPSERVER_REPL_TIMEOUT_MS;
});

/* ==================================================================
 * Async helpers
 * ================================================================== */

/** Flush macrotasks (setImmediate) -- use in tests without fake timers. */
async function drain(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

/** Flush only microtasks -- use in tests with fake timers. */
async function drainMicro(): Promise<void> {
  await Promise.resolve();
}

/** Extract the requestId from the last stdin.write call. */
function extractRequestId(): string {
  const calls = currentProc!.stdin.write.mock.calls;
  const raw = (calls[calls.length - 1][0] as string).replace(/---\n$/, '').trim();
  const doc = yaml.load(raw) as Record<string, unknown>;
  return (doc!.payload as Record<string, unknown>).requestId as string;
}

/** Send a YAML response through the fake stdout. */
function respond(
  requestId: string,
  extraPayload: Record<string, unknown>,
  type: 'result' | 'error' | 'event' = 'result',
): void {
  const doc = yaml.dump({ type, payload: { requestId, ...extraPayload } }, { lineWidth: -1 });
  currentProc!.stdout.write(doc + '---\n');
}

/** Return the raw YAML string from the last stdin.write call. */
function writtenYaml(): string {
  const calls = currentProc!.stdin.write.mock.calls;
  return (calls[calls.length - 1][0] as string).replace(/---\n$/, '').trim();
}

/* ==================================================================
 * Tests
 * ================================================================== */

describe('ReplBridge', () => {
  beforeAll(async () => {
    const mod = await import('../src/transport/repl-bridge.js');
    ReplBridge = mod.ReplBridge;
  });

  /* ----------------------------------------------------------------
   * generateRequestId
   * ---------------------------------------------------------------- */
  describe('generateRequestId()', () => {
    const ID_PATTERN = /^req-\d{8}T\d{6}Z-[a-z0-9]+-[a-f0-9]{4}$/;

    test('returns a string matching the expected format', () => {
      const id = ReplBridge.generateRequestId();
      expect(id).toMatch(ID_PATTERN);
    });

    test('produces unique IDs across consecutive calls', () => {
      const a = ReplBridge.generateRequestId();
      const b = ReplBridge.generateRequestId();
      expect(a).not.toBe(b);
    });

    test('sanitises slug by removing special characters', () => {
      const id = ReplBridge.generateRequestId('HELLO_WORLD!!');
      expect(id).toMatch(ID_PATTERN);
      expect(id).toContain('helloworld');
    });

    test('falls back to req when slug is empty after sanitisation', () => {
      const id = ReplBridge.generateRequestId('!!!');
      expect(id).toMatch(ID_PATTERN);
      expect(id).toContain('-req-');
    });

    test('defaults to req when no slug is provided', () => {
      const id = ReplBridge.generateRequestId();
      expect(id).toMatch(ID_PATTERN);
      expect(id).toContain('-req-');
    });
  });

  /* ----------------------------------------------------------------
   * Process lifecycle
   * ---------------------------------------------------------------- */
  describe('process lifecycle', () => {
    test('spawns mcpserver-repl on first invoke', async () => {
      const bridge = new ReplBridge();
      const invokePromise = bridge.invoke('ping');

      await drain();

      const requestId = extractRequestId();
      respond(requestId, { ok: true });
      await invokePromise;

      expect(mockSpawn).toHaveBeenCalledTimes(1);
      expect(mockSpawn).toHaveBeenCalledWith('mcpserver-repl', ['--agent-stdio'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: expect.any(Object),
      });
      await bridge.close();
    });

    test('reuses existing process on subsequent invokes', async () => {
      const bridge = new ReplBridge();

      const p1 = bridge.invoke('ping');
      await drain();
      respond(extractRequestId(), { ok: true });
      await p1;
      expect(mockSpawn).toHaveBeenCalledTimes(1);

      const p2 = bridge.invoke('ping');
      await drain();
      respond(extractRequestId(), { ok: true });
      await p2;
      expect(mockSpawn).toHaveBeenCalledTimes(1);

      await bridge.close();
    });

    test('re-spawns if process has exited', async () => {
      const bridge = new ReplBridge();

      const p1 = bridge.invoke('ping');
      await drain();
      respond(extractRequestId(), { ok: true });
      await p1;

      currentProc!._emitExit(0);
      await drain();

      const p2 = bridge.invoke('ping');
      await drain();
      respond(extractRequestId(), { ok: true });
      await p2;

      expect(mockSpawn).toHaveBeenCalledTimes(2);
      await bridge.close();
    });
  });

  /* ----------------------------------------------------------------
   * invoke
   * ---------------------------------------------------------------- */
  describe('invoke()', () => {
    test('sends YAML envelope with method and params to stdin', async () => {
      const bridge = new ReplBridge();
      const invokePromise = bridge.invoke('todo_query', { done: false });

      await drain();

      const raw = writtenYaml();
      const doc = yaml.load(raw) as Record<string, unknown>;
      const payload = doc.payload as Record<string, unknown>;

      expect(doc.type).toBe('request');
      expect(payload.method).toBe('todo_query');
      expect(payload.params).toEqual({ done: false });
      expect(payload.requestId).toBeDefined();

      respond(payload.requestId as string, { result: { items: [] } });
      await invokePromise;
      await bridge.close();
    });

    test('sends YAML envelope without params when omitted', async () => {
      const bridge = new ReplBridge();
      const invokePromise = bridge.invoke('ping');

      await drain();

      const doc = yaml.load(writtenYaml()) as Record<string, unknown>;
      expect((doc.payload as Record<string, unknown>).params).toBeUndefined();

      respond(extractRequestId(), { ok: true });
      await invokePromise;
      await bridge.close();
    });

    test('resolves with the parsed response', async () => {
      const bridge = new ReplBridge();
      const invokePromise = bridge.invoke('todo_query', { done: false });

      await drain();
      const requestId = extractRequestId();
      respond(requestId, { result: { items: [{ id: 'T-1' }], totalCount: 1 } });

      const result = await invokePromise;
      expect(result.type).toBe('result');
      expect(result.payload.result).toEqual({ items: [{ id: 'T-1' }], totalCount: 1 });
      await bridge.close();
    });

    test('handles error responses from the REPL', async () => {
      const bridge = new ReplBridge();
      const invokePromise = bridge.invoke('todo_query');

      await drain();
      const requestId = extractRequestId();
      respond(requestId, { error: 'Not found' }, 'error');

      const result = await invokePromise;
      expect(result.type).toBe('error');
      expect(result.payload.error).toBe('Not found');
      await bridge.close();
    });
  });

  /* ----------------------------------------------------------------
   * Streaming
   * ---------------------------------------------------------------- */
  describe('invokeStreaming()', () => {
    test('delivers intermediate events to onEvent callback', async () => {
      const bridge = new ReplBridge();
      const events: Array<{ type: string; payload: Record<string, unknown> }> = [];
      const invokePromise = bridge.invokeStreaming(
        'session_listen',
        { sessionId: 's-1' },
        (evt) => events.push(evt),
      );

      await drain();
      const requestId = extractRequestId();

      respond(requestId, { event: { type: 'hello' } }, 'event');
      respond(requestId, { event: { type: 'progress' } }, 'event');
      respond(requestId, { result: 'done' }, 'result');

      const result = await invokePromise;
      expect(result.type).toBe('result');
      expect(result.payload.result).toBe('done');
      expect(events).toHaveLength(2);
      expect(events[0].payload.event).toEqual({ type: 'hello' });
      expect(events[1].payload.event).toEqual({ type: 'progress' });
      await bridge.close();
    });
  });

  /* ----------------------------------------------------------------
   * Timeout
   * ---------------------------------------------------------------- */
  describe('timeout', () => {
    test('rejects the pending request after MCPSERVER_REPL_TIMEOUT_MS', async () => {
      jest.useFakeTimers();
      process.env.MCPSERVER_REPL_TIMEOUT_MS = '100';

      const bridge = new ReplBridge();
      const invokePromise = bridge.invoke('todo_query');

      await drainMicro();

      jest.advanceTimersByTime(150);

      await expect(invokePromise).rejects.toThrow(/timed out/i);
      jest.useRealTimers();
      await bridge.close();
    });

    test('kills the process on timeout', async () => {
      jest.useFakeTimers();
      process.env.MCPSERVER_REPL_TIMEOUT_MS = '50';

      const bridge = new ReplBridge();
      const _invokePromise = bridge.invoke('todo_query').catch(() => {});

      await drainMicro();
      jest.advanceTimersByTime(100);

      expect(currentProc!.kill).toHaveBeenCalledWith('SIGTERM');
      jest.useRealTimers();
      await bridge.close();
    });

    test('rejects other pending requests when one times out', async () => {
      jest.useFakeTimers();
      process.env.MCPSERVER_REPL_TIMEOUT_MS = '50';

      const bridge = new ReplBridge();
      const p1 = bridge.invoke('method1').catch((e) => e);
      await drainMicro();
      const p2 = bridge.invoke('method2').catch((e) => e);
      await drainMicro();

      jest.advanceTimersByTime(100);

      const err1 = await p1;
      const err2 = await p2;
      expect(err1).toBeInstanceOf(Error);
      expect((err1 as Error).message).toMatch(/timed out/i);
      expect(err2).toBeInstanceOf(Error);
      expect((err2 as Error).message).toMatch(/timed out/i);
      jest.useRealTimers();
      await bridge.close();
    });

    test('guard returns safely when proc is null after close', async () => {
      jest.useFakeTimers();
      process.env.MCPSERVER_REPL_TIMEOUT_MS = '5000';

      const bridge = new ReplBridge();
      const invokePromise = bridge.invoke('ping').catch(() => {});
      await drainMicro();

      const closePromise = bridge.close();
      jest.advanceTimersByTime(2000);
      await drainMicro();

      expect(currentProc!.kill).toHaveBeenCalled();
      currentProc!.kill.mockClear();

      jest.advanceTimersByTime(3000);
      await drainMicro();

      await closePromise;
      expect(currentProc!.kill).not.toHaveBeenCalled();
      jest.useRealTimers();
    });

    test('sends SIGKILL if process does not exit after SIGTERM', async () => {
      jest.useFakeTimers();
      process.env.MCPSERVER_REPL_TIMEOUT_MS = '50';

      const bridge = new ReplBridge();
      const invokePromise = bridge.invoke('ping').catch(() => {});
      await drainMicro();

      jest.advanceTimersByTime(100);

      expect(currentProc!.kill).toHaveBeenCalledWith('SIGTERM');

      jest.advanceTimersByTime(2000);
      await drainMicro();

      expect(currentProc!.kill).toHaveBeenCalledWith('SIGKILL');
      jest.useRealTimers();
      await bridge.close();
    });

    test('rejects streaming request after timeout', async () => {
      jest.useFakeTimers();
      process.env.MCPSERVER_REPL_TIMEOUT_MS = '50';

      const bridge = new ReplBridge();
      const invokePromise = bridge.invokeStreaming('listen', { sessionId: 's-1' }, () => {});

      await drainMicro();

      jest.advanceTimersByTime(100);

      await expect(invokePromise).rejects.toThrow(/timed out/i);
      jest.useRealTimers();
      await bridge.close();
    });
  });

  /* ----------------------------------------------------------------
   * Error handling
   * ---------------------------------------------------------------- */
  describe('error handling', () => {
    test('ignores invalid YAML from the REPL without crashing', async () => {
      const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
      const bridge = new ReplBridge();
      const invokePromise = bridge.invoke('ping');

      await drain();
      const requestId = extractRequestId();

      currentProc!.stdout.write('{ invalid yaml\n---\n');
      respond(requestId, { ok: true });

      const result = await invokePromise;
      expect(result.type).toBe('result');
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse YAML'),
      );
      stderrSpy.mockRestore();
      await bridge.close();
    });

    test('ignores response with unknown requestId', async () => {
      const bridge = new ReplBridge();
      const invokePromise = bridge.invoke('ping');

      await drain();
      const requestId = extractRequestId();

      respond('unknown-id', { data: 1 }, 'result');
      respond(requestId, { ok: true });

      const result = await invokePromise;
      expect(result.type).toBe('result');
      await bridge.close();
    });

    test('ignores response without requestId', async () => {
      const bridge = new ReplBridge();
      const invokePromise = bridge.invoke('ping');

      await drain();
      const requestId = extractRequestId();

      const doc = yaml.dump({ type: 'result', payload: { data: 1 } }, { lineWidth: -1 });
      currentProc!.stdout.write(doc + '---\n');

      respond(requestId, { ok: true });

      const result = await invokePromise;
      expect(result.type).toBe('result');
      await bridge.close();
    });
  });

  /* ----------------------------------------------------------------
   * Process exit
   * ---------------------------------------------------------------- */
  describe('process exit', () => {
    test('rejects pending requests when the process exits', async () => {
      const bridge = new ReplBridge();
      const invokePromise = bridge.invoke('todo_query');

      await drain();

      // Attach the rejection handler BEFORE the exit fires to avoid
      // Node's unhandled rejection detection.
      const onRejected = expect(invokePromise).rejects.toThrow(/exited with code 1/);

      currentProc!._emitExit(1);
      await onRejected;
    });

    test('sets proc to null on exit', async () => {
      const bridge = new ReplBridge();
      const invokePromise = bridge.invoke('ping').catch(() => {});

      await drain();
      currentProc!._emitExit(0);
      await drain();
      await invokePromise;

      const p2 = bridge.invoke('ping');
      await drain();
      respond(extractRequestId(), { ok: true });
      await p2;

      expect(mockSpawn).toHaveBeenCalledTimes(2);
      await bridge.close();
    });
  });

  /* ----------------------------------------------------------------
   * stderr forwarding
   * ---------------------------------------------------------------- */
  describe('stderr forwarding', () => {
    test('forwards stderr output from the REPL process', async () => {
      const bridge = new ReplBridge();
      await bridge.ensure();

      const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
      try {
        currentProc!.stderr.write('test error message\n');
        expect(stderrSpy).toHaveBeenCalledWith('[repl] test error message\n');
      } finally {
        stderrSpy.mockRestore();
      }
      await bridge.close();
    });
  });

  /* ----------------------------------------------------------------
   * close
   * ---------------------------------------------------------------- */
  describe('close()', () => {
    test('ends stdin and waits for exit', async () => {
      const bridge = new ReplBridge();
      const invokePromise = bridge.invoke('ping');
      await drain();
      respond(extractRequestId(), { ok: true });
      await invokePromise;

      const closePromise = bridge.close();
      await drain();

      currentProc!._emitExit(0);
      await closePromise;

      expect(currentProc!.stdin.end).toHaveBeenCalledTimes(1);
    });

    test('is safe to call when no process exists', async () => {
      const bridge = new ReplBridge();
      await expect(bridge.close()).resolves.not.toThrow();
    });

    test('kills process if it does not exit within 2s', async () => {
      jest.useFakeTimers();

      const bridge = new ReplBridge();
      const invokePromise = bridge.invoke('ping');
      await drainMicro();
      respond(extractRequestId(), { ok: true });
      await invokePromise;

      const closePromise = bridge.close();

      jest.advanceTimersByTime(2000);
      await drainMicro();

      await closePromise;
      expect(currentProc!.kill).toHaveBeenCalled();
      jest.useRealTimers();
    });
  });
});
