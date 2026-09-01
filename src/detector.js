const fs = require('fs')
const os = require('os')
const path = require('path')

const BOOTSEL_LABELS = ['RPI-RP2', 'RP2350', 'RPI-RP2350', 'RPI-RP2040']
const CIRCUITPY_LABELS = ['CIRCUITPY']

// Hilfsfunktion: Prüft, ob ein Pfad existiert, ohne abzustürzen
function safeExists(p) {
  try {
    return fs.existsSync(p)
  } catch (e) {
    return false
  }
}

// Methode zur Erkennung anhand von Mikrocontroller-typischen Dateien
function detectByFiles(driveRoot, labels) {
  // BOOTSEL-Modus: INFO_UF2.TXT existiert immer auf dem Raspberry Pi Pico / RP2350
  if (labels.some(l => BOOTSEL_LABELS.includes(l))) {
    if (safeExists(path.join(driveRoot, 'INFO_UF2.TXT')) || safeExists(path.join(driveRoot, 'info_uf2.txt'))) {
      return true
    }
  }
  // CIRCUITPY-Modus: Typische CircuitPython Dateien/Ordner
  if (labels.includes('CIRCUITPY')) {
    if (safeExists(path.join(driveRoot, 'boot.py')) ||
        safeExists(path.join(driveRoot, 'code.py')) ||
        safeExists(path.join(driveRoot, 'lib'))) {
      return true
    }
  }
  return false
}

function findMountLinuxAndMac(labels) {
  const user = process.env.USER || os.userInfo().username
  const searchPaths = []

  // Pfade für Linux und macOS sammeln
  for (const label of labels) {
    searchPaths.push('/media/' + user + '/' + label)
    searchPaths.push('/run/media/' + user + '/' + label)
    searchPaths.push('/Volumes/' + label)
  }

  // 1. Direkte Erkennung über das Mount-Label
  for (const p of searchPaths) {
    if (safeExists(p)) return p
  }

  // 2. Fallback: Alle Mount-Ordner nach typischen Dateien durchsuchen (falls Label anders heißt)
  const bases = ['/media/' + user, '/run/media/' + user, '/Volumes']
  for (const base of bases) {
    if (!safeExists(base)) continue
    try {
      const dirs = fs.readdirSync(base)
      for (const dir of dirs) {
        const fullPath = path.join(base, dir)
        if (detectByFiles(fullPath, labels)) return fullPath
      }
    } catch (e) {}
  }

  return null
}

function findMountWindows(labels) {
  // Alle verfügbaren Laufwerksbuchstaben A-Z prüfen
  for (let code = 65; code <= 90; code++) {
    const letter = String.fromCharCode(code)
    const driveRoot = letter + ':\\'

    // Sicherstellen, dass auf das Laufwerk zugegriffen werden kann
    if (!safeExists(driveRoot)) continue

    // Direkt über dateibasierte Erkennung (schnellste und sicherste Methode auf Windows)
    if (detectByFiles(driveRoot, labels)) {
      return driveRoot
    }
  }
  return null
}

function findMount(labels) {
  if (process.platform === 'win32') return findMountWindows(labels)
  return findMountLinuxAndMac(labels)
}

function findBootsel() { return findMount(BOOTSEL_LABELS) }
function findCircuitpy() { return findMount(CIRCUITPY_LABELS) }

function waitForMount(labels, timeoutMs) {
  const timeout = timeoutMs || 60000
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const iv = setInterval(() => {
      const p = findMount(labels)
      if (p) {
        clearInterval(iv)
        resolve(p)
      } else if (Date.now() - start > timeout) {
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
      if (!safeExists(mountPath)) {
        clearInterval(iv)
        resolve()
      } else if (Date.now() - start > timeout) {
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
