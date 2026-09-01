const fs = require('fs')
const os = require('os')
const path = require('path')
const { execSync } = require('child_process')

const BOOTSEL_LABELS = ['RPI-RP2', 'RP2350', 'RPI-RP2350', 'RPI-RP2040']
const CIRCUITPY_LABELS = ['CIRCUITPY']

function findMountLinux(labels) {
  const user = process.env.USER || os.userInfo().username
  for (const label of labels) {
    for (const base of ['/media/' + user, '/run/media/' + user, '/Volumes']) {
      const p = base + '/' + label
      if (fs.existsSync(p)) return p
    }
  }
  return null
}

function findMountWindows(labels) {
  for (let code = 67; code <= 90; code++) {
    const letter = String.fromCharCode(code)
    const driveRoot = letter + ':\\'
    try {
      if (!fs.existsSync(driveRoot)) continue
      let label = ''
      try {
        const out = execSync('fsutil fsinfo volumeinfo ' + letter + ':', {
          stdio: ['pipe', 'pipe', 'ignore'],
          timeout: 3000
        }).toString()
        const m = out.match(/Volume\s+Label\s*:\s*(.+)/i)
        if (m) label = m[1].trim()
      } catch {}
      for (const target of labels) {
        if (label === target) return driveRoot
      }
      try {
        if (labels.includes('RPI-RP2') || labels.includes('RP2350')) {
          const infoUf2 = path.join(driveRoot, 'INFO_UF2.TXT')
          if (fs.existsSync(infoUf2)) {
            const content = fs.readFileSync(infoUf2, 'utf8')
            for (const target of labels) {
              if (content.includes(target)) return driveRoot
            }
            return driveRoot
          }
        }
        if (labels.includes('CIRCUITPY')) {
          if (fs.existsSync(path.join(driveRoot, 'boot.py')) ||
              fs.existsSync(path.join(driveRoot, 'code.py')) ||
              fs.existsSync(path.join(driveRoot, 'CIRCUITPY')) ||
              fs.existsSync(path.join(driveRoot, 'lib'))) {
            return driveRoot
          }
        }
      } catch {}
    } catch {}
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
