import { describe, it, expect, vi, afterEach } from 'vitest';
import { CsgWorkerClient } from '../src/csg/CsgWorkerClient';
import type { EnclosureProject } from '../src/types/project';
import type { CsgResponse, MeshData } from '../src/csg/workerProtocol';

const DUMMY_MESH: MeshData = { positions: new Float32Array(), indices: new Uint32Array() };
const PROJECT = {} as unknown as EnclosureProject; // the client never inspects it

/** Stand-in for the real Worker: lets a test drive responses, crashes, and message errors. */
class FakeWorker {
  onmessage: ((e: MessageEvent<CsgResponse>) => void) | null = null;
  onerror: ((e: { message: string; preventDefault(): void }) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  posted: unknown[] = [];
  terminated = false;

  postMessage(msg: unknown): void {
    this.posted.push(msg);
  }
  terminate(): void {
    this.terminated = true;
  }

  lastId(): number {
    return (this.posted[this.posted.length - 1] as { id: number }).id;
  }
  respondResult(id: number): void {
    this.onmessage?.({ data: { id, type: 'result', base: DUMMY_MESH, lid: DUMMY_MESH } } as MessageEvent<CsgResponse>);
  }
  respondError(id: number, message: string): void {
    this.onmessage?.({ data: { id, type: 'error', message } } as MessageEvent<CsgResponse>);
  }
  crash(message: string): void {
    this.onerror?.({ message, preventDefault: () => {} });
  }
}

function makeClient() {
  const fake = new FakeWorker();
  const client = new CsgWorkerClient(fake as unknown as Worker);
  return { fake, client };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('CsgWorkerClient', () => {
  it('resolves the matching request when the worker returns a result', async () => {
    const { fake, client } = makeClient();
    const { result } = client.generate(PROJECT, 'live');
    fake.respondResult(fake.lastId());
    await expect(result).resolves.toEqual({ base: DUMMY_MESH, lid: DUMMY_MESH });
  });

  it('rejects when the worker reports an error response', async () => {
    const { fake, client } = makeClient();
    const { result } = client.generate(PROJECT, 'live');
    fake.respondError(fake.lastId(), 'bad geometry');
    await expect(result).rejects.toThrow('bad geometry');
  });

  it('rejects ALL in-flight requests when the worker crashes (onerror)', async () => {
    const { fake, client } = makeClient();
    const a = client.generate(PROJECT, 'live');
    const b = client.generate(PROJECT, 'export');
    fake.crash('wasm abort');
    await expect(a.result).rejects.toThrow(/wasm abort|crashed/);
    await expect(b.result).rejects.toThrow(/wasm abort|crashed/);
  });

  it('rejects a request that never gets a response (timeout backstop)', async () => {
    vi.useFakeTimers();
    const { client } = makeClient();
    const { result } = client.generate(PROJECT, 'live');
    const assertion = expect(result).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(21_000);
    await assertion;
  });

  it('does not fire the timeout once a result has arrived', async () => {
    vi.useFakeTimers();
    const { fake, client } = makeClient();
    const { result } = client.generate(PROJECT, 'live');
    fake.respondResult(fake.lastId());
    await expect(result).resolves.toBeDefined();
    // Advancing past the timeout must not throw an unhandled rejection.
    await vi.advanceTimersByTimeAsync(30_000);
  });

  it('terminate() rejects anything still pending', async () => {
    const { fake, client } = makeClient();
    const { result } = client.generate(PROJECT, 'live');
    client.terminate();
    expect(fake.terminated).toBe(true);
    await expect(result).rejects.toThrow(/shut down/);
  });
});
