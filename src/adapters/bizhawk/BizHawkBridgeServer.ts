import { createServer, type AddressInfo, type Server, type Socket } from 'node:net';
import type { BizHawkEmeraldRawState } from '../../core/GameState';

export interface BizHawkBridgeServerOptions {
  host: string;
  port: number;
  logger?: (message: string, meta?: Record<string, unknown>) => void;
}

export class BizHawkBridgeServer {
  private server: Server | null = null;
  private client: Socket | null = null;
  private lastRawPacket: string | null = null;

  constructor(private readonly options: BizHawkBridgeServerOptions) {}

  async start(onPacket: (payload: BizHawkEmeraldRawState) => void): Promise<number> {
    if (this.server) {
      const address = this.server.address();
      if (address && typeof address === 'object') {
        return address.port;
      }
      return this.options.port;
    }

    this.server = createServer((socket) => {
      this.client = socket;
      this.options.logger?.('BizHawk bridge client connected', {
        remoteAddress: socket.remoteAddress,
        remotePort: socket.remotePort
      });

      let buffer = '';
      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) {
            continue;
          }

          this.lastRawPacket = trimmed;
          try {
            const parsed = JSON.parse(trimmed) as BizHawkEmeraldRawState;
            onPacket(parsed);
          } catch (error) {
            this.options.logger?.('BizHawk bridge malformed JSON packet', {
              error: String(error),
              packetPreview: trimmed.slice(0, 220)
            });
          }
        }
      });

      socket.on('close', () => {
        if (this.client === socket) {
          this.client = null;
        }
        this.options.logger?.('BizHawk bridge client disconnected');
      });

      socket.on('error', (error) => {
        this.options.logger?.('BizHawk bridge socket error', { error: String(error) });
      });
    });

    const port = await new Promise<number>((resolve, reject) => {
      this.server?.once('error', reject);
      this.server?.listen(this.options.port, this.options.host, () => {
        const address = this.server?.address() as AddressInfo | null;
        resolve(address?.port ?? this.options.port);
      });
    });

    this.options.logger?.('BizHawk bridge server listening', { host: this.options.host, port });
    return port;
  }

  async stop(): Promise<void> {
    if (this.client) {
      this.client.destroy();
      this.client = null;
    }

    if (!this.server) {
      return;
    }

    const toClose = this.server;
    this.server = null;
    await new Promise<void>((resolve) => toClose.close(() => resolve()));
  }

  isConnected(): boolean {
    return Boolean(this.client && !this.client.destroyed);
  }

  getLastRawPacket(): string | null {
    return this.lastRawPacket;
  }
}