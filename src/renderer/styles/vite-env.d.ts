/// <reference types="vite/client" />

import type { ElectronApi } from '../shared/ipc';

declare global {
  interface Window {
    electronApi: ElectronApi;
  }
}