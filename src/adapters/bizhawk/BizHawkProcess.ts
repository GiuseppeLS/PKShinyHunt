import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { BizHawkConfig } from '../../config/bizhawk';

export interface BizHawkProcessStatus {
  running: boolean;
  executableOk: boolean;
  romOk: boolean;
}

export class BizHawkProcess {
  private processRef: ChildProcess | null = null;

  constructor(private readonly logger?: (message: string, meta?: Record<string, unknown>) => void) {}

  async getStatus(config: BizHawkConfig): Promise<BizHawkProcessStatus> {
    return {
      running: await this.isRunning(),
      executableOk: Boolean(config.bizhawkExePath && existsSync(config.bizhawkExePath)),
      romOk: Boolean(config.emeraldRomPath && existsSync(config.emeraldRomPath))
    };
  }

  async ensureRunning(config: BizHawkConfig): Promise<void> {
    const running = await this.isRunning();
    if (running) {
      this.logger?.('BizHawk process already running');
      return;
    }

    if (!config.autoLaunchBizHawk) {
      this.logger?.('BizHawk not running and autoLaunchBizHawk disabled');
      return;
    }

    if (!existsSync(config.bizhawkExePath)) {
      this.logger?.('BizHawk executable missing', { path: config.bizhawkExePath });
      return;
    }

    if (!existsSync(config.emeraldRomPath)) {
      this.logger?.('Emerald ROM missing', { path: config.emeraldRomPath });
      return;
    }

    this.logger?.('Launching BizHawk with Emerald ROM', {
      exe: config.bizhawkExePath,
      rom: config.emeraldRomPath
    });

    this.processRef = spawn(config.bizhawkExePath, [config.emeraldRomPath], {
      detached: true,
      stdio: 'ignore'
    });
    this.processRef.unref();

    await this.waitForProcess(config.launchTimeoutMs);
  }

  private async waitForProcess(timeoutMs: number): Promise<void> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (await this.isRunning()) {
        this.logger?.('BizHawk process detected after launch');
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    this.logger?.('BizHawk process not detected within timeout', { timeoutMs });
  }

  private async isRunning(): Promise<boolean> {
    if (process.platform === 'win32') {
      const output = await this.runCommand('tasklist');
      return output.toLowerCase().includes('emuhawk.exe');
    }

    if (process.platform === 'linux' || process.platform === 'darwin') {
      const output = await this.runCommand('ps -A -o comm');
      const lowered = output.toLowerCase();
      return lowered.includes('emuhawk') || lowered.includes('bizhawk');
    }

    return false;
  }

  private async runCommand(command: string): Promise<string> {
    return new Promise((resolve) => {
      const child = spawn(command, { shell: true });
      let output = '';
      child.stdout.on('data', (chunk) => {
        output += chunk.toString('utf8');
      });
      child.on('error', () => resolve(''));
      child.on('close', () => resolve(output));
    });
  }
}