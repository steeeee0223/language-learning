export type DesktopSettings = {
  dataRoot?: string;
};

export type ResolvedDesktopDataRoot = {
  dataRoot: string;
  usedFallback: boolean;
  warning?: string;
};

export type DesktopRuntimeSettings = {
  dataRoot: string;
  defaultDataRoot: string;
  customDataRoot?: string;
  usedFallback: boolean;
  warning?: string;
};

export type StartNextServerInput = {
  appRoot: string;
  dataRoot: string;
  dev: boolean;
};

export type StartedNextServer = {
  url: string;
  stop(): Promise<void>;
};
