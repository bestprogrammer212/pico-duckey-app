const fs = require('fs')
const os = require('os')
const BOOTSEL_LABELS = ['RPI-RP2', 'RP2350', 'RPI-RP2350', 'RPI-RP2040']
const CIRCUITPY_LABELS = ['CIRCUITPY']
function findMount(labels) {
  const user = process.env.USER || os.userInfo().username
  for (const label of labels) {
    for (const base of ['/media/' + user, '/run/media/' + user, '/Volumes']) {
      const p = base + '/' + label
      if (fs.existsSync(p)) return p
    }
  }
  return null
}
function findBootsel() { return findMount(BOOTSEL_LABELS) }
function findCircuitpy() { return findMount(CIRCUITPY_LABELS) }
function waitForMount(labels, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const iv = setInterval(() => {
      const p = findMount(labels)
      if (p) { clearInterval(iv); resolve(p) }
      else if (Date.now() - start > timeoutMs) { clearInterval(iv); reject(new Error('Timed out')) }
    }, 1000)
  })
}
function waitForUnmount(mountPath, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const iv = setInterval(() => {
      if (!fs.existsSync(mountPath)) { clearInterval(iv); resolve() }
      else if (Date.now() - start > timeoutMs) { clearInterval(iv); reject(new Error('Timed out')) }
    }, 500)
  })
}
module.exports = { findBootsel, findCircuitpy, waitForMount, waitForUnmount, BOOTSEL_LABELS, CIRCUITPY_LABELS }
