import type { DesktopRuntimeSettings } from '../../electron/types';

declare global {
  interface Window {
    languageLearningDesktop?: {
      getSettings(): Promise<DesktopRuntimeSettings>;
      chooseDataRoot(): Promise<DesktopRuntimeSettings>;
      openDataRoot(): Promise<void>;
    };
  }
}

export {};
