const fs = require('fs')
const path = require('path')
const { exec, execSync } = require('child_process')
const { loadConfig, ASSETS, PAYLOADS, NEEDED } = require('./downloader')
const { waitForMount, waitForUnmount, BOOTSEL_LABELS, CIRCUITPY_LABELS } = require('./detector')

function run(cmd) {
  return new Promise(function (resolve) {
    exec(cmd, function () { resolve() })
  })
}

function copyFile(src, dest) {
  return new Promise(function (resolve, reject) {
    fs.copyFile(src, dest, function (err) {
      if (err) reject(err)
      else resolve()
    })
  })
}

function copyDir(src, dest) {
  return new Promise(function (resolve, reject) {
    fs.cp(src, dest, { recursive: true }, function (err) {
      if (err) reject(err)
      else resolve()
    })
  })
}

function ejectDrive(mountPath) {
  return new Promise(function (resolve) {
    if (process.platform === 'win32') {
      var letter = mountPath.charAt(0)
      try {
        execSync(
          "powershell -NoProfile -Command \"(New-Object -comObject Shell.Application).Namespace(17).ParseName('" + letter + ":\\').InvokeVerb('Eject')\"",
          { stdio: 'ignore', timeout: 10000 }
        )
      } catch (e) {}
      resolve()
    } else {
      run('sync').then(function () {
        try {
          var dev = execSync('findmnt -n -o SOURCE "' + mountPath + '" 2>/dev/null').toString().trim()
          if (dev) {
            var disk = execSync('lsblk -no PKNAME "' + dev + '" 2>/dev/null').toString().trim()
            run('udisksctl unmount -b "' + dev + '" 2>/dev/null').then(function () {
              if (disk) {
                run('udisksctl power-off -b "/dev/' + disk + '" 2>/dev/null || eject "/dev/' + disk + '" 2>/dev/null').then(resolve)
              } else {
                resolve()
              }
            })
          } else {
            run('umount "' + mountPath + '" 2>/dev/null || true').then(resolve)
          }
        } catch (e) {
          resolve()
        }
      })
    }
  })
}

async function runFlashMode(win) {
  var emit = function (e, d) { win.webContents.send(e, d) }
  var log = function (m) { emit('flash:log', m) }
  var step = function (n, s) { emit('flash:progress', { step: n, sub: s }) }
  try {
    step(1, 'Hold BOOTSEL and plug in...')
    var bs = await waitForMount(BOOTSEL_LABELS, 60000)
    log('Detected: ' + bs)

    step(2, 'Copying flash nuke...')
    await copyFile(path.join(ASSETS, 'flash_nuke.uf2'), path.join(bs, 'flash_nuke.uf2'))
    log('Flash nuke copied. Waiting for remount...')
    await ejectDrive(bs)
    await waitForUnmount(bs, 30000).catch(function () {})

    var bs2 = await waitForMount(BOOTSEL_LABELS, 30000)
    log('Remounted: ' + bs2)

    step(3, 'Copying CircuitPython...')
    var cfg = loadConfig()
    if (!cfg.circuitpythonFile) throw new Error('No CircuitPython in config. Run setup first.')
    await copyFile(path.join(ASSETS, cfg.circuitpythonFile), path.join(bs2, cfg.circuitpythonFile))
    log('CircuitPython copied. Waiting for CIRCUITPY...')
    await ejectDrive(bs2)
    await waitForUnmount(bs2, 30000).catch(function () {})
    await new Promise(function (r) { setTimeout(r, 3000) })

    var cp = await waitForMount(CIRCUITPY_LABELS, 30000)
    log('CIRCUITPY mounted: ' + cp)

    step(4, 'Copying project files...')
    await copyDir(NEEDED, cp)
    log('Project files copied.')

    step(5, 'Select payload...')
    var payloads = fs.existsSync(PAYLOADS) ? fs.readdirSync(PAYLOADS).filter(function (f) { return f.endsWith('.dd') }) : []
    var armed = await new Promise(function (r) {
      win.webContents.send('flash:pickPayload', payloads)
      require('electron').ipcMain.once('flash:payloadChosen', function (_, c) { r(c) })
    })
    if (!armed) {
      log('No payload selected. Pico left in setup mode.')
      emit('flash:done', { payload: null, setupMode: true })
      return
    }
    var src = path.join(PAYLOADS, armed)
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

module.exports = { runFlashMode: runFlashMode }
