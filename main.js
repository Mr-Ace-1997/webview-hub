const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const fs   = require('fs')

const CONFIG_DIR  = path.join(__dirname, 'setting')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'WebView Hub',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,
      contextIsolation: true,
      nodeIntegration: false,
    }
  })
  win.loadFile('index.html')
}

// ── Config IPC ──────────────────────────────────────────────────
ipcMain.handle('config:get', () => {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return null
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
  } catch { return null }
})

ipcMain.handle('config:set', (_, data) => {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(data), 'utf8')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

// ── Lifecycle ───────────────────────────────────────────────────
app.whenReady().then(createWindow)
app.on('window-all-closed', () => app.quit())
