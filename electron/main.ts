import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  readDesktopSettings,
  resolveDesktopDataRoot,
  settingsPath,
  toRuntimeSettings,
  validateDataRoot,
  writeDesktopSettings,
} from './settings';
import { startNextServer } from './server';
import type { DesktopRuntimeSettings, StartedNextServer } from './types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isDev = process.argv.includes('--dev');

let runtimeSettings: DesktopRuntimeSettings;
let server: StartedNextServer | undefined;
let isQuitting = false;

function createFailureWindow(message: string) {
  dialog.showErrorBox('Language Learning failed to start', message);
}

function createWindow(url: string) {
  const window = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  window.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    void shell.openExternal(targetUrl);
    return { action: 'deny' };
  });

  void window.loadURL(url);
}

function registerIpc(userDataPath: string) {
  ipcMain.handle('desktop:get-settings', () => runtimeSettings);

  ipcMain.handle('desktop:open-data-root', async () => {
    await shell.openPath(runtimeSettings.dataRoot);
  });

  ipcMain.handle('desktop:choose-data-root', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
    });

    if (result.canceled || !result.filePaths[0]) {
      return runtimeSettings;
    }

    const dataRoot = await validateDataRoot(result.filePaths[0]);
    const nextSettings = { dataRoot };
    await writeDesktopSettings(settingsPath(userDataPath), nextSettings);
    runtimeSettings = {
      ...runtimeSettings,
      customDataRoot: dataRoot,
      warning: 'Restart the app to use the selected data folder.',
    };
    return runtimeSettings;
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !isQuitting) {
    app.quit();
  }
});

app.on('before-quit', (event) => {
  if (isQuitting) {
    return;
  }

  isQuitting = true;
  event.preventDefault();
  void Promise.resolve(server?.stop())
    .catch((error) => {
      console.error('Failed to stop local server during shutdown.', error);
    })
    .finally(() => {
      server = undefined;
      app.quit();
    });
});

async function startDesktopApp() {
  const userDataPath = app.getPath('userData');
  const settings = await readDesktopSettings(settingsPath(userDataPath));
  const resolved = await resolveDesktopDataRoot({ userDataPath, settings });
  runtimeSettings = toRuntimeSettings({ resolved, userDataPath, settings });
  registerIpc(userDataPath);
  server = await startNextServer({
    appRoot: app.getAppPath(),
    dataRoot: runtimeSettings.dataRoot,
    dev: isDev,
  });
  createWindow(server.url);
}

function handleStartupError(error: unknown) {
  createFailureWindow(error instanceof Error ? error.message : String(error));
  app.quit();
}

void app.whenReady().then(startDesktopApp).catch(handleStartupError);
