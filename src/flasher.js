const fs = require('fs')
const path = require('path')
const { exec, execSync } = require('child_process')
const { loadConfig, ASSETS, PAYLOADS, NEEDED } = require('./downloader')
const { waitForMount, waitForUnmount, BOOTSEL_LABELS, CIRCUITPY_LABELS } = require('./detector')

function run(cmd) { return new Promise(r => exec(cmd, () => r())) }

function copyFile(src, dest) {
  return new Promise((resolve, reject) => {
    fs.copyFile(src, dest, (err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

function copyDir(src, dest) {
  return new Promise((resolve, reject) => {
    fs.cp(src, dest, { recursive: true }, (err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

async function ejectDrive(mountPath) {
  if (process.platform === 'win32') {
    let letter = mountPath.charAt(0)
    try {
      execSync('powershell -NoProfile -Command "(New-Object -comObject Shell.Application).Namespace(17).ParseName(\'' + letter + ':\').InvokeVerb(\'Eject\')"', { stdio: 'ignore', timeout: 10000 })
    } catch (e) {
      try { execSync('powershell -NoProfile -Command "$v = (Get-Volume -DriveLetter ' + letter + '); (New-Object -comObject Shell.Application).Namespace(17).ParseName(\'' + letter + ':\').InvokeVerb(\'Eject\')"', { stdio: 'ignore', timeout: 10000 }) } catch {}
    }
  } else {
    await run('sync')
    try {
      const dev = execSync('findmnt -n -o SOURCE "' + mountPath + '" 2>/dev/null').toString().trim()
      if (dev) {
        const disk = execSync('lsblk -no PKNAME "' + dev + '" 2>/dev/null').toString().trim()
        await run('udisksctl unmount -b "' + dev + '" 2>/dev/null')
        if (disk) await run('udisksctl power-off -b "/dev/' + disk + '" 2>/dev/null || eject "/dev/' + disk + '" 2>/dev/null')
      } else {
        await run('umount "' + mountPath + '" 2>/dev/null || true')
      }
    } catch {}
  }
}

async function runFlashMode(win) {
  const emit = (e, d) => win.webContents.send(e, d)
  const log = m => emit('flash:log', m)
  const step = (n, s) => emit('flash:progress', { step: n, sub: s })
  try {
    step(1, 'Hold BOOTSEL and plug in...')
    const bs = await waitForMount(BOOTSEL_LABELS, 60000)
    log('Detected: ' + bs)

    step(2, 'Copying flash nuke...')
    await copyFile(path.join(ASSETS, 'flash_nuke.uf2'), path.join(bs, 'flash_nuke.uf2'))
    log('Flash nuke copied. Waiting for remount...')
    await ejectDrive(bs)
    await waitForUnmount(bs, 30000).catch(() => {})

    const bs2 = await waitForMount(BOOTSEL_LABELS, 30000)
    log('Remounted: ' + bs2)

    step(3, 'Copying CircuitPython...')
    const cfg = loadConfig()
    if (!cfg.circuitpythonFile) throw new Error('No CircuitPython in config. Run setup first.')
    await copyFile(path.join(ASSETS, cfg.circuitpythonFile), path.join(bs2, cfg.circuitpythonFile))
    log('CircuitPython copied. Waiting for CIRCUITPY...')
    await ejectDrive(bs2)
    await waitForUnmount(bs2, 30000).catch(() => {})
    await new Promise(r => setTimeout(r, 3000))

    const cp = await waitForMount(CIRCUITPY_LABELS, 30000)
    log('CIRCUITPY mounted: ' + cp)

    step(4, 'Copying project files...')
    await copyDir(NEEDED, cp)
    log('Project files copied.')

    step(5, 'Select payload...')
    const payloads = fs.existsSync(PAYLOADS) ? fs.readdirSync(PAYLOADS).filter(f => f.endsWith('.dd')) : []
    const armed = await new Promise(r => {
      win.webContents.send('flash:pickPayload', payloads)
      require('electron').ipcMain.once('flash:payloadChosen', (_, c) => r(c))
    })
    if (!armed) {
      log('No payload selected. Pico left in setup mode.')
      emit('flash:done', { payload: null, setupMode: true })
      return
    }
    const src = path.join(PAYLOADS, armed)
    if (fs.existsSync(src)) {
      await copyFile(src, path.join(cp, 'payload.dd'))
      log('Armed: ' + armed)
    }

    log('Ejecting...')
    await ejectDrive(cp)
    log('Flash complete!')
    emit('flash:done', { payload: armed })
  } catch (err) {
    emit('flash:error', err.message)
  }
}

module.exports = { runFlashMode }const fs = require('fs'); const path = require('path')
const { exec, execSync } = require('child_process')
const { loadConfig, ASSETS, PAYLOADS, NEEDED } = require('./downloader')
const { waitForMount, waitForUnmount, BOOTSEL_LABELS, CIRCUITPY_LABELS } = require('./detector')
function run(cmd) { return new Promise(r => exec(cmd, () => r())) }
async function runFlashMode(win) {
  const emit = (e, d) => win.webContents.send(e, d)
  const log = m => emit('flash:log', m)
  const step = (n, s) => emit('flash:progress', { step: n, sub: s })
  try {
    step(1, 'Hold BOOTSEL and plug in...'); const bs = await waitForMount(BOOTSEL_LABELS, 60000)
    step(2, 'Copying flash nuke...')
    await run('cp "' + path.join(ASSETS, 'flash_nuke.uf2') + '" "' + path.join(bs, 'flash_nuke.uf2') + '"')
    await run('sync && udisksctl unmount -b $(lsblk -o NAME,MOUNTPOINT | grep "' + bs + '" | awk \'{print "/dev/"$1}\') 2>/dev/null || true')
    await waitForUnmount(bs, 30000).catch(() => {})
    const bs2 = await waitForMount(BOOTSEL_LABELS, 30000)
    step(3, 'Copying CircuitPython...')
    const cfg = loadConfig(); if (!cfg.circuitpythonFile) throw new Error('No CircuitPython in config')
    await run('cp "' + path.join(ASSETS, cfg.circuitpythonFile) + '" "' + path.join(bs2, cfg.circuitpythonFile) + '"')
    await run('sync && udisksctl unmount -b $(lsblk -o NAME,MOUNTPOINT | grep "' + bs2 + '" | awk \'{print "/dev/"$1}\') 2>/dev/null || true')
    await waitForUnmount(bs2, 30000).catch(() => {}); await new Promise(r => setTimeout(r, 3000))
    const cp = await waitForMount(CIRCUITPY_LABELS, 30000)
    step(4, 'Copying project files...')
    await run('cp -r "' + NEEDED + '/." "' + cp + '/"')
    step(5, 'Select payload...')
    const payloads = fs.existsSync(PAYLOADS) ? fs.readdirSync(PAYLOADS).filter(f => f.endsWith('.dd')) : []
    const armed = await new Promise(r => { win.webContents.send('flash:pickPayload', payloads); require('electron').ipcMain.once('flash:payloadChosen', (_, c) => r(c)) })
    if (!armed) { log('No payload - Pico left mounted'); emit('flash:done', { payload: null, setupMode: true }); return }
    const src = path.join(PAYLOADS, armed)
    if (fs.existsSync(src)) { await run('cp "' + src + '" "' + path.join(cp, 'payload.dd') + '"'); log('Armed: ' + armed) }
    log('Ejecting...')
    await run('sync')
    try {
      const dev = execSync('findmnt -n -o SOURCE "' + cp + '" 2>/dev/null').toString().trim()
      if (dev) { const disk = execSync('lsblk -no PKNAME "' + dev + '" 2>/dev/null').toString().trim(); await run('udisksctl unmount -b "' + dev + '" 2>/dev/null'); if (disk) await run('udisksctl power-off -b "/dev/' + disk + '" 2>/dev/null || eject "/dev/' + disk + '" 2>/dev/null') }
      else { await run('umount "' + cp + '" 2>/dev/null || true') }
    } catch (e) { log('Eject manually: ' + e.message) }
    log('Flash complete!'); emit('flash:done', { payload: armed })
  } catch (err) { emit('flash:error', err.message) }
}
module.exports = { runFlashMode }
