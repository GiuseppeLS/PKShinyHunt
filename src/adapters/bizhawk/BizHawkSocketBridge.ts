import { createServer, type Server, type Socket } from 'node:net';
import type { BizHawkEmeraldRawState } from '../../core/GameState';

export interface BizHawkSocketBridgeOptions {
  host: string;
  port: number;
  logger?: (message: string, meta?: Record<string, unknown>) => void;
}

export class BizHawkSocketBridge {
  private server: Server | null = null;
  private client: Socket | null = null;

  constructor(private readonly options: BizHawkSocketBridgeOptions) {}

  async start(onMessage: (payload: BizHawkEmeraldRawState) => void): Promise<void> {
    if (this.server) {
      return;
    }

    this.server = createServer((socket) => {
      this.client = socket;
      this.options.logger?.('BizHawk socket client connected', { remoteAddress: socket.remoteAddress, remotePort: socket.remotePort });

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

          try {
            const parsed = JSON.parse(trimmed) as BizHawkEmeraldRawState;
            onMessage(parsed);
          } catch (error) {
            this.options.logger?.('BizHawk JSON parse error', { error: String(error), linePreview: trimmed.slice(0, 180) });
          }
        }
      });

      socket.on('close', () => {
        if (this.client === socket) {
          this.client = null;
        }
        this.options.logger?.('BizHawk socket client disconnected');
      });

      socket.on('error', (error) => {
        this.options.logger?.('BizHawk socket client error', { error: String(error) });
      });
    });

    await new Promise<void>((resolve, reject) => {
      this.server?.once('error', reject);
      this.server?.listen(this.options.port, this.options.host, () => {
        this.options.logger?.('BizHawk socket server listening', { host: this.options.host, port: this.options.port });
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (this.client) {
      this.client.destroy();
      this.client = null;
    }

    if (!this.server) {
      return;
    }

    const currentServer = this.server;
    this.server = null;

    await new Promise<void>((resolve) => {
      currentServer.close(() => resolve());
    });
  }

  isClientConnected(): boolean {
    return Boolean(this.client && !this.client.destroyed);
  }
}