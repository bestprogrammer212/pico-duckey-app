const fs = require('fs')
const path = require('path')
const os = require('os')

const BOOTSEL_LABELS = ['RPI-RP2', 'RP2350', 'RPI-RP2350', 'RPI-RP2040']
const CIRCUITPY_LABELS = ['CIRCUITPY']

function findMountLinux(labels) {
  const user = process.env.USER || os.userInfo().username
  for (const label of labels) {
    for (const base of ['/media/' + user, '/run/media/' + user, '/Volumes']) {
      const p = base + '/' + label
      try {
        if (fs.existsSync(p)) return p
      } catch (e) {}
    }
  }
  return null
}

function findMountWindows(labels) {
  // Scanne alle Laufwerke C: bis Z:
  for (let code = 67; code <= 90; code++) {
    const letter = String.fromCharCode(code)
    const driveRoot = letter + ':\\'

    // Prüfe ob Laufwerk existiert (keine Shell-Befehle, nur fs)
    let exists = false
    try {
      exists = fs.existsSync(driveRoot)
    } catch (e) {
      try {
        fs.accessSync(driveRoot)
        exists = true
      } catch (e2) {}
    }
    if (!exists) continue

    // BOOTSEL-Modus: Pico zeigt INFO_UF2.TXT
    // Diese Datei existiert IMMER im BOOTSEL-Modus, egal welches Label
    if (labels.includes('RPI-RP2') || labels.includes('RP2350')) {
      const infoUf2 = path.join(driveRoot, 'INFO_UF2.TXT')
      try {
        if (fs.existsSync(infoUf2)) {
          return driveRoot
        }
      } catch (e) {}

      // Fallback: check label-based folder
      const labelFile = path.join(driveRoot, 'INFO_UF2.TXT')
      try {
        const content = fs.readFileSync(labelFile, 'utf8')
        if (content && content.length > 0) {
          return driveRoot
        }
      } catch (e) {}
    }

    // CIRCUITPY-Modus: Pico zeigt boot.py / code.py / lib/
    if (labels.includes('CIRCUITPY')) {
      const markers = ['boot.py', 'code.py', 'lib', 'payload.dd', 'secrets.py']
      for (const marker of markers) {
        try {
          if (fs.existsSync(path.join(driveRoot, marker))) {
            // Zusätzlich prüfen dass es kein normales Laufwerk ist
            // (C:\ hat z.B. auch manchmal boot.py-ähnliche Dateien)
            // CIRCUITPY hat immer code.py UND lib/
            if (marker === 'lib' || marker === 'code.py' || marker === 'boot.py') {
              return driveRoot
            }
          }
        } catch (e) {}
      }
    }
  }
  return null
}

function findMount(labels) {
  if (process.platform === 'win32') return findMountWindows(labels)
  return findMountLinux(labels)
}

function findBootsel() { return findMount(BOOTSEL_LABELS) }
function findCircuitpy() { return findMount(CIRCUITPY_LABELS) }

function waitForMount(labels, timeoutMs) {
  const timeout = timeoutMs || 60000
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const iv = setInterval(() => {
      const p = findMount(labels)
      if (p) { clearInterval(iv); resolve(p) }
      else if (Date.now() - start > timeout) {
        clearInterval(iv)
        reject(new Error('Timed out waiting for device'))
      }
    }, 1000)
  })
}

function waitForUnmount(mountPath, timeoutMs) {
  const timeout = timeoutMs || 30000
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const iv = setInterval(() => {
      if (!fs.existsSync(mountPath)) { clearInterval(iv); resolve() }
      else if (Date.now() - start > timeout) {
        clearInterval(iv)
        reject(new Error('Timed out waiting for unmount'))
      }
    }, 500)
  })
}

module.exports = {
  findBootsel,
  findCircuitpy,
  waitForMount,
  waitForUnmount,
  BOOTSEL_LABELS,
  CIRCUITPY_LABELS
}
