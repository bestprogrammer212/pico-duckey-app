const { app, BrowserWindow, ipcMain, dialog, globalShortcut, nativeImage } = require('electron')
const path = require('path')
const fs = require('fs')
const { exec, execSync } = require('child_process')
const { runDownloader, loadConfig, saveConfig, ASSETS, PAYLOADS, NEEDED } = require('./src/downloader')
const { findBootsel, findCircuitpy, BOOTSEL_LABELS, CIRCUITPY_LABELS } = require('./src/detector')
const { runFlashMode } = require('./src/flasher')
const { Recorder } = require('./src/recorder')

let win
let recorder = null
let statusInterval = null
const LOCK_FILE = path.join(ASSETS, 'app.lock')

function run(cmd) {
  return new Promise((resolve) => { exec(cmd, () => resolve()) })
}

function ejectDrive(mountPath) {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      let letter = mountPath.charAt(0)
      try {
        execSync('powershell -NoProfile -Command "(New-Object -comObject Shell.Application).Namespace(17).ParseName(\'' + letter + ':\').InvokeVerb(\'Eject\')"', { stdio: 'ignore', timeout: 10000 })
      } catch {}
      resolve()
    } else {
      run('sync').then(() => {
        try {
          const dev = execSync('findmnt -n -o SOURCE "' + mountPath + '" 2>/dev/null').toString().trim()
          if (dev) {
            const disk = execSync('lsblk -no PKNAME "' + dev + '" 2>/dev/null').toString().trim()
            run('udisksctl unmount -b "' + dev + '" 2>/dev/null').then(() => {
              if (disk) run('udisksctl power-off -b "/dev/' + disk + '" 2>/dev/null || eject "/dev/' + disk + '" 2>/dev/null').then(resolve)
              else resolve()
            })
          } else {
            run('umount "' + mountPath + '" 2>/dev/null || true').then(resolve)
          }
        } catch { resolve() }
      })
    }
  })
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200, height: 780, minWidth: 900, minHeight: 600,
    frame: false, backgroundColor: '#002B36',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false
    }
  })
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png'))
  win.setIcon(icon)
  fs.mkdirSync(ASSETS, { recursive: true })
  fs.writeFileSync(LOCK_FILE, String(Date.now()))
  const config = loadConfig()
  if (!config.disclaimerAccepted || !config.setupDone || !config.circuitpythonFile || !checkRequiredFiles(config)) {
    win.loadFile('renderer/index.html')
    win.webContents.once('did-finish-load', () => win.webContents.send('app:needsSetup', true))
  } else {
    win.loadFile('renderer/index.html')
  }
  statusInterval = setInterval(() => {
    let status = 'none'
    if (findBootsel()) status = 'bootsel'
    else if (findCircuitpy()) status = 'circuitpy'
    win.webContents.send('device:status', status)
  }, 2000)
}

function checkRequiredFiles(config) {
  const picoDuckyFiles = ['boot.py','code.py','duckyinpython.py','pins.py','webapp.py','wsgiserver.py']
  const adafruitLibs = ['adafruit_hid','adafruit_debouncer.mpy','adafruit_ticks.mpy','asyncio','adafruit_wsgi']
  const checks = [
    path.join(ASSETS, config.circuitpythonFile),
    path.join(ASSETS, 'flash_nuke.uf2'),
    ...picoDuckyFiles.map(f => path.join(NEEDED, f)),
    ...adafruitLibs.map(f => path.join(NEEDED, 'lib', f)),
  ]
  return checks.every(p => fs.existsSync(p))
}

ipcMain.on('window:minimize', () => win.minimize())
ipcMain.on('window:maximize', () => { if (win.isMaximized()) win.unmaximize(); else win.maximize() })
ipcMain.on('window:close', () => win.close())

ipcMain.handle('setup:getConfig', () => loadConfig())
ipcMain.handle('setup:run', async (_, { board, ssid, password }) => {
  fs.mkdirSync(NEEDED, { recursive: true })
  const isW = board.includes('W')
  if (isW && ssid) {
    fs.writeFileSync(path.join(NEEDED, 'secrets.py'),
      "secrets = {\n    'ssid': '" + ssid + "',\n    'password': '" + password + "'\n}\n")
  }
  const emit = (event, data) => win.webContents.send('setup:' + event, data)
  await runDownloader(board, emit)
  const cfg = loadConfig()
  if (isW) { cfg.ssid = ssid; cfg.password = password }
  cfg.disclaimerAccepted = true; cfg.setupDone = true; cfg.board = board
  saveConfig(cfg)
  return { ok: true }
})
ipcMain.handle('setup:boardList', () => ['Pico', 'Pico W', 'Pico 2', 'Pico 2 W'])

ipcMain.handle('flash:start', async () => { await runFlashMode(win) })

ipcMain.handle('payload:list', async () => {
  if (!fs.existsSync(PAYLOADS)) return []
  return fs.readdirSync(PAYLOADS).filter(f => f.endsWith('.dd'))
})
ipcMain.handle('payload:read', async (_, name) => {
  const p = path.join(PAYLOADS, name)
  if (!fs.existsSync(p)) return { ok: false, error: 'File not found' }
  return { ok: true, content: fs.readFileSync(p, 'utf8') }
})
ipcMain.handle('payload:save', async (_, name, content) => {
  try { fs.mkdirSync(PAYLOADS, { recursive: true }); fs.writeFileSync(path.join(PAYLOADS, name), content); return { ok: true } }
  catch (e) { return { ok: false, error: e.message } }
})
ipcMain.handle('payload:import', async () => {
  const result = await dialog.showOpenDialog(win, {
    title: 'Import Payload',
    filters: [{ name: 'Ducky Script', extensions: ['dd', 'txt'] }],
    properties: ['openFile']
  })
  if (result.canceled || result.filePaths.length === 0) return { ok: false, canceled: true }
  fs.copyFileSync(result.filePaths[0], path.join(PAYLOADS, path.basename(result.filePaths[0])))
  return { ok: true, name: path.basename(result.filePaths[0]) }
})
ipcMain.handle('payload:delete', async (_, name) => {
  const p = path.join(PAYLOADS, name)
  if (fs.existsSync(p)) fs.unlinkSync(p)
  return { ok: true }
})
ipcMain.handle('payload:arm', async (_, name) => {
  try {
    const cp = findCircuitpy()
    if (!cp) return { ok: false, error: 'CIRCUITPY not mounted' }
    fs.copyFileSync(path.join(PAYLOADS, name), path.join(cp, 'payload.dd'))
    if (process.platform !== 'win32') await run('sync')
    return { ok: true }
  } catch (e) { return { ok: false, error: e.message } }
})

ipcMain.handle('setupMode:swapPayload', async (_, name) => {
  const cp = findCircuitpy()
  if (!cp) return { ok: false, error: 'CIRCUITPY not mounted' }
  fs.copyFileSync(path.join(PAYLOADS, name), path.join(cp, 'payload.dd'))
  if (process.platform !== 'win32') await run('sync')
  return { ok: true }
})
ipcMain.handle('setupMode:listFiles', async () => {
  const cp = findCircuitpy()
  if (!cp) return { ok: false, error: 'CIRCUITPY not mounted' }
  return { ok: true, files: fs.readdirSync(cp).filter(f => fs.statSync(path.join(cp, f)).isFile()) }
})
ipcMain.handle('setupMode:downloadFile', async (_, name) => {
  const cp = findCircuitpy()
  if (!cp) return { ok: false, error: 'CIRCUITPY not mounted' }
  const result = await dialog.showSaveDialog(win, { title: 'Save File', defaultPath: name })
  if (result.canceled) return { ok: false, canceled: true }
  fs.copyFileSync(path.join(cp, name), result.filePath)
  return { ok: true, dest: result.filePath }
})
ipcMain.handle('setupMode:eject', async () => {
  const cp = findCircuitpy()
  if (!cp) return { ok: false, error: 'CIRCUITPY not mounted' }
  await ejectDrive(cp)
  return { ok: true }
})

ipcMain.handle('wifi:get', () => {
  const cfg = loadConfig()
  return { ssid: cfg.ssid || '', password: cfg.password || '', board: cfg.board || '' }
})
ipcMain.handle('wifi:save', async (_, { ssid, password }) => {
  try {
    const cfg = loadConfig()
    if (!(cfg.board || '').includes('W')) return { ok: false, error: 'Wi-Fi not supported on this board.' }
    if (!ssid || !password) return { ok: false, error: 'SSID and password required.' }
    const cp = findCircuitpy()
    if (!cp) return { ok: false, error: 'Pico not in setup mode.' }
    const content = "secrets = {\n    'ssid': '" + ssid + "',\n    'password': '" + password + "'\n}\n"
    fs.writeFileSync(path.join(NEEDED, 'secrets.py'), content)
    fs.writeFileSync(path.join(cp, 'secrets.py'), content)
    cfg.ssid = ssid; cfg.password = password; saveConfig(cfg)
    return { ok: true }
  } catch (e) { return { ok: false, error: e.message } }
})

ipcMain.handle('app:reconfigure', async () => {
  try { fs.rmSync(ASSETS, { recursive: true, force: true }); return { ok: true } }
  catch (e) { return { ok: false, error: e.message } }
})
ipcMain.handle('app:needsSetup', () => {
  const cfg = loadConfig()
  return !cfg.disclaimerAccepted || !cfg.setupDone || !cfg.circuitpythonFile
})

// Recorder
ipcMain.handle('recorder:start', async () => {
  if (recorder) recorder.stop()
  recorder = new Recorder()
  recorder.start()
  return { ok: true }
})
ipcMain.handle('recorder:stop', async () => {
  if (!recorder) return { ok: false, error: 'Not recording' }
  recorder.stop()
  const script = recorder.toDuckyScript()
  recorder = null
  return { ok: true, script }
})
ipcMain.handle('recorder:save', async (_, name, script) => {
  try {
    fs.mkdirSync(PAYLOADS, { recursive: true })
    const fname = name.endsWith('.dd') ? name : name + '.dd'
    fs.writeFileSync(path.join(PAYLOADS, fname), script)
    return { ok: true, name: fname }
  } catch (e) { return { ok: false, error: e.message } }
})

app.whenReady().then(createWindow)
app.on('window-all-closed', () => {
  try { if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE) } catch {}
  if (statusInterval) clearInterval(statusInterval)
  if (recorder) recorder.stop()
  if (process.platform !== 'darwin') app.quit()
})
app.on('before-quit', () => { try { if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE) } catch {} })
