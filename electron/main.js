const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const { autoUpdater } = require('electron-updater')
const { initDatabase, getMeta } = require('./db')
const { registerIpcHandlers } = require('./ipc')
const { startSync } = require('./sync')

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  // Auto-updater events (public GitHub repo — no token needed)
  try {
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('checking-for-update', () => {
      mainWindow.webContents.send('app:update-checking')
    })

    autoUpdater.on('update-available', (info) => {
      mainWindow.webContents.send('app:update-available', {
        version: info.version,
        releaseDate: info.releaseDate,
      })
    })

    autoUpdater.on('update-not-available', (info) => {
      mainWindow.webContents.send('app:update-not-available', {
        version: info.version,
      })
    })

    autoUpdater.on('download-progress', (progress) => {
      mainWindow.webContents.send('app:download-progress', {
        percent: Math.round(progress.percent),
        transferred: progress.transferred,
        total: progress.total,
        bytesPerSecond: progress.bytesPerSecond,
      })
    })

    autoUpdater.on('update-downloaded', (info) => {
      mainWindow.webContents.send('app:update-downloaded', {
        version: info.version,
      })
    })

    autoUpdater.on('error', (err) => {
      mainWindow.webContents.send('app:update-error', {
        message: err.message || 'Update check failed',
      })
    })

    // Check for updates on startup only (no periodic checks)
    if (app.isPackaged) {
      autoUpdater.checkForUpdates().catch((e) => {
        console.log('Startup update check failed:', e.message)
      })
    }
  } catch (e) {
    console.log('Auto-updater not configured:', e.message)
  }
}

// ── Update IPC Handlers ─────────────────────────────────────
ipcMain.handle('app:get-version', () => {
  return { success: true, data: app.getVersion() }
})

ipcMain.handle('app:check-for-updates', async () => {
  try {
    await autoUpdater.checkForUpdates()
    return { success: true, data: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

ipcMain.on('app:restart-and-install', () => {
  try {
    autoUpdater.quitAndInstall()
  } catch (e) {
    console.log('Auto-updater quit failed:', e.message)
  }
})

app.whenReady().then(() => {
  initDatabase()
  registerIpcHandlers()
  createWindow()

  // Only start sync if sync config exists
  const syncUrl = getMeta('sync_url')
  const syncToken = getMeta('sync_token')
  if (syncUrl && syncToken) {
    startSync()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
