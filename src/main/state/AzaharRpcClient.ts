interface AzaharRpcClientOptions {
  connectTimeoutMs?: number;
  logger?: (
    level: 'info' | 'error' | 'debug',
    message: string,
    meta?: Record<string, unknown>
  ) => void;
}

export class AzaharRpcClient {
  private logger?: AzaharRpcClientOptions['logger'];
  private hasReportedUnsupported = false;

  constructor(
    private readonly host: string,
    private readonly port: number,
    options: AzaharRpcClientOptions = {}
  ) {
    this.logger = options.logger;
  }

  async connect(): Promise<void> {
    if (!this.hasReportedUnsupported) {
      this.logger?.('error', 'Azahar RPC transport unsupported in current client', {
        host: this.host,
        port: this.port,
        reason:
          'Current implementation previously used TCP, but local verification showed no TCP listener on this port. Transport/protocol mismatch.',
      });
      this.hasReportedUnsupported = true;
    }

    throw new Error(
      `Azahar RPC transport mismatch: no TCP listener on ${this.host}:${this.port}. ` +
        `Current client cannot connect using the protocol it was built for.`
    );
  }

  async disconnect(): Promise<void> {
    // No-op until correct transport is implemented.
  }

  async call<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    void method;
    void params;

    throw new Error(
      `Azahar RPC call blocked: current client transport is invalid for ${this.host}:${this.port}.`
    );
  }
}