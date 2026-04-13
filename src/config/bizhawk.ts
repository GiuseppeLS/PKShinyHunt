import type { Settings } from '../types/domain';

export interface BizHawkConfig {
  bizhawkExePath: string;
  emeraldRomPath: string;
  tcpHost: string;
  tcpPort: number;
  autoLaunchBizHawk: boolean;
  autoAttachBizHawk: boolean;
  launchTimeoutMs: number;
}

export const DEFAULT_BIZHAWK_CONFIG: BizHawkConfig = {
  bizhawkExePath: '',
  emeraldRomPath: '',
  tcpHost: '127.0.0.1',
  tcpPort: 17374,
  autoLaunchBizHawk: false,
  autoAttachBizHawk: true,
  launchTimeoutMs: 20000
};

export function resolveBizHawkConfig(settings?: Partial<Settings> | null): BizHawkConfig {
  return {
    ...DEFAULT_BIZHAWK_CONFIG,
    ...(settings?.bizhawk ?? {})
  };
}