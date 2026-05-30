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
    autoUpdater.on('update-available', () => {
      mainWindow.webContents.send('app:update-available')
    })

    autoUpdater.on('update-downloaded', () => {
      mainWindow.webContents.send('app:update-downloaded')
    })

    if (app.isPackaged) {
      autoUpdater.checkForUpdatesAndNotify()
    }
  } catch (e) {
    console.log('Auto-updater not configured:', e.message)
  }
}

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
