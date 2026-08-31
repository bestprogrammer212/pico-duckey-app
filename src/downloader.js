const fs = require('fs')
const path = require('path')
const https = require('https')
const ASSETS = path.join(__dirname, '..', 'assets', 'files')
const PAYLOADS = path.join(__dirname, '..', 'assets', 'payloads')
const NEEDED = path.join(ASSETS, 'needed_files')
const LIB = path.join(NEEDED, 'lib')
const BOARD_IDS = { 'Pico':'raspberry_pi_pico', 'Pico W':'raspberry_pi_pico_w', 'Pico 2':'raspberry_pi_pico2', 'Pico 2 W':'raspberry_pi_pico2_w' }
function ensureDirs() { [ASSETS, PAYLOADS, NEEDED, LIB].forEach(d => fs.mkdirSync(d, { recursive: true })) }
function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    const req = (u) => {
      https.get(u, { headers: { 'User-Agent': 'pico-flash-app' } }, res => {
        if (res.statusCode === 301 || res.statusCode === 302) { file.destroy(); fs.unlink(dest, () => {}); return download(res.headers.location, dest).then(resolve).catch(reject) }
        if (res.statusCode !== 200) { reject(new Error('HTTP ' + res.statusCode)); return }
        res.pipe(file); file.on('finish', () => file.close(resolve))
      }).on('error', err => { fs.unlink(dest, () => {}); reject(err) })
    }
    req(url)
  })
}
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const req = (u) => {
      https.get(u, { headers: { 'User-Agent': 'pico-flash-app' } }, res => {
        if (res.statusCode === 301 || res.statusCode === 302) return request(res.headers.location)
        let data = ''; res.on('data', c => data += c); res.on('end', () => { try { resolve(JSON.parse(data)) } catch (e) { reject(e) } })
      }).on('error', reject)
    }
    req(url)
  })
}
async function downloadFlashNuke(emit) {
  const dest = path.join(ASSETS, 'flash_nuke.uf2')
  if (fs.existsSync(dest)) return
  const bundled = path.join(__dirname, '..', 'assets', 'bundled', 'flash_nuke.uf2')
  if (fs.existsSync(bundled)) { fs.copyFileSync(bundled, dest); return }
  throw new Error('flash_nuke.uf2 not found')
}
async function downloadCircuitPython(board, emit) {
  const boardId = BOARD_IDS[board]; if (!boardId) throw new Error('Unknown board: ' + board)
  const existing = fs.readdirSync(ASSETS).find(f => f.startsWith('adafruit-circuitpython-' + boardId) && f.endsWith('.uf2'))
  if (existing) { const c = loadConfig(); c.circuitpythonFile = existing; c.board = board; saveConfig(c); return }
  const rel = await fetchJSON('https://api.github.com/repos/adafruit/circuitpython/releases/latest')
  const ver = rel.tag_name.replace(/^v/, '')
  const fname = 'adafruit-circuitpython-' + boardId + '-en_US-' + ver + '.uf2'
  await download('https://downloads.circuitpython.org/bin/' + boardId + '/en_US/' + fname, path.join(ASSETS, fname))
  const c = loadConfig(); c.circuitpythonFile = fname; c.board = board; saveConfig(c)
}
async function downloadPicoDucky(emit) {
  const files = ['boot.py','code.py','duckyinpython.py','pins.py','webapp.py','wsgiserver.py']
  const base = 'https://raw.githubusercontent.com/dbisu/pico-ducky/main/'
  for (const f of files) { const dest = path.join(NEEDED, f); if (!fs.existsSync(dest)) await download(base + f, dest) }
}
async function downloadAdafruitLibs(emit) {
  const needed = ['adafruit_hid','adafruit_debouncer.mpy','adafruit_ticks.mpy','asyncio','adafruit_wsgi']
  if (needed.every(n => fs.existsSync(path.join(LIB, n)))) return
  const rel = await fetchJSON('https://api.github.com/repos/adafruit/Adafruit_CircuitPython_Bundle/releases/latest')
  const zipAsset = rel.assets.find(a => (a.name.includes('9.x-mpy') || a.name.includes('10.x-mpy')) && a.name.endsWith('.zip'))
  if (!zipAsset) throw new Error('Bundle zip not found')
  const zipDest = path.join(ASSETS, zipAsset.name)
  if (!fs.existsSync(zipDest)) await download(zipAsset.browser_download_url, zipDest)
  const extractDir = path.join(ASSETS, '_bundle'); fs.mkdirSync(extractDir, { recursive: true })
  require('child_process').execSync('unzip -o "' + zipDest + '" -d "' + extractDir + '"', { stdio: 'pipe' })
  const root = fs.readdirSync(extractDir)[0]; const libSrc = path.join(extractDir, root, 'lib')
  for (const item of needed) {
    const src = path.join(libSrc, item); const dest = path.join(LIB, item)
    if (!fs.existsSync(src)) continue
    if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true })
    fs.cpSync(src, dest, { recursive: true })
  }
  fs.rmSync(extractDir, { recursive: true, force: true })
}
const CONFIG_PATH = path.join(ASSETS, 'config.json')
function loadConfig() { try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) } catch { return {} } }
function saveConfig(cfg) { fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2)) }
async function runDownloader(board, emit) {
  ensureDirs()
  try {
    emit('progress', { step: 1, label: 'flash_nuke...' }); await downloadFlashNuke(emit)
    emit('progress', { step: 2, label: 'CircuitPython...' }); await downloadCircuitPython(board, emit)
    emit('progress', { step: 3, label: 'pico-ducky files...' }); await downloadPicoDucky(emit)
    emit('progress', { step: 4, label: 'Adafruit libs...' }); await downloadAdafruitLibs(emit)
    emit('progress', { step: 5, label: 'Done!' }); emit('done', true)
  } catch (err) { emit('error', err.message) }
}
module.exports = { runDownloader, loadConfig, saveConfig, ASSETS, PAYLOADS, NEEDED, LIB }
