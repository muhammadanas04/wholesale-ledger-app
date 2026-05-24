const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')

// Load .env from project root (dev) or from app resources / userData (packaged)
const envPath = app.isPackaged
  ? path.join(app.getPath('userData'), '.env')
  : path.join(__dirname, '..', '.env')
require('dotenv').config({ path: envPath })
const { autoUpdater } = require('electron-updater')
const { initDatabase } = require('./db')
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

  // Auto-updater events
  try {
    autoUpdater.on('update-available', () => {
      mainWindow.webContents.send('app:update-available')
    })

    autoUpdater.on('update-downloaded', () => {
      mainWindow.webContents.send('app:update-downloaded')
    })

    if (app.isPackaged && process.env.GH_TOKEN) {
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
  startSync()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
