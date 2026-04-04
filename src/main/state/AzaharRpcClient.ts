import net from 'node:net';

interface RpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface RpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

export class AzaharRpcClient {
  private socket: net.Socket | null = null;
  private nextId = 1;
  private buffer = '';
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  constructor(private readonly host: string, private readonly port: number) {}

  async connect(): Promise<void> {
    if (this.socket) return;
    this.socket = new net.Socket();

    await new Promise<void>((resolve, reject) => {
      this.socket?.once('error', reject);
      this.socket?.connect(this.port, this.host, () => resolve());
    });

    this.socket.on('data', (chunk) => {
      this.buffer += chunk.toString('utf8');
      let index = this.buffer.indexOf('\n');
      while (index >= 0) {
        const line = this.buffer.slice(0, index).trim();
        this.buffer = this.buffer.slice(index + 1);
        if (line) this.handleLine(line);
        index = this.buffer.indexOf('\n');
      }
    });

    this.socket.on('error', (err) => {
      for (const req of this.pending.values()) req.reject(err as Error);
      this.pending.clear();
    });
  }

  async disconnect(): Promise<void> {
    if (!this.socket) return;
    this.socket.end();
    this.socket.destroy();
    this.socket = null;
    this.pending.clear();
  }

  async call<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    if (!this.socket) {
      throw new Error('Azahar RPC not connected');
    }

    const id = this.nextId++;
    const payload: RpcRequest = { jsonrpc: '2.0', id, method, params };

    const promise = new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: (v) => resolve(v as T), reject });
    });

    this.socket.write(`${JSON.stringify(payload)}\n`);
    return promise;
  }

  private handleLine(line: string) {
    try {
      const msg = JSON.parse(line) as RpcResponse;
      if (!msg.id) return;
      const pending = this.pending.get(msg.id);
      if (!pending) return;
      this.pending.delete(msg.id);
      if (msg.error) {
        pending.reject(new Error(msg.error.message));
        return;
      }
      pending.resolve(msg.result);
    } catch {
      // ignore malformed lines
    }
  }
}
