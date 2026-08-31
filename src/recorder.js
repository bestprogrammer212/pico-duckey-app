const { globalShortcut } = require('electron')
const KEY_MAP = { 'Enter':'ENTER','Backspace':'BACKSPACE','Tab':'TAB','Escape':'ESCAPE','Delete':'DELETE','ArrowUp':'UPARROW','ArrowDown':'DOWNARROW','ArrowLeft':'LEFTARROW','ArrowRight':'RIGHTARROW','Control_L':'CTRL','Control_R':'CTRL','Shift_L':'SHIFT','Shift_R':'SHIFT','Alt_L':'ALT','Alt_R':'ALT','Meta_L':'GUI','Meta_R':'GUI','F1':'F1','F2':'F2','F3':'F3','F4':'F4','F5':'F5','F6':'F6','F7':'F7','F8':'F8','F9':'F9','F10':'F10','F11':'F11','F12':'F12' }
const TYPEABLE = /^[a-zA-Z0-9 \-_=+.,#*<>]$/
class Recorder {
  constructor() { this.events = []; this.isRecording = false; this.lastEventTime = 0; this.currentModifiers = new Set(); this.textBuffer = '' }
  start() { this.events = []; this.isRecording = true; this.lastEventTime = Date.now(); this.textBuffer = ''; try { globalShortcut.register('CommandOrControl+Shift+Escape', () => {}) } catch {} }
  stop() { this.isRecording = false; try { globalShortcut.unregister('CommandOrControl+Shift+Escape') } catch {}; if (this.textBuffer) this.flushText() }
  recordEvent(data) {
    if (!this.isRecording) return
    const now = Date.now(); const delay = now - this.lastEventTime; this.lastEventTime = now
    if (delay > 100 && this.events.length > 0) this.events.push({ type: 'delay', ms: Math.min(delay, 5000) })
    if (data.type === 'keydown') this.handleKeyDown(data); else if (data.type === 'keyup') this.handleKeyUp(data)
  }
  handleKeyDown(data) {
    const key = data.key
    if (['Control_L','Control_R','Shift_L','Shift_R','Alt_L','Alt_R','Meta_L','Meta_R'].includes(key)) { this.currentModifiers.add(KEY_MAP[key] || key); return }
    if (this.currentModifiers.size > 0) { if (this.textBuffer) this.flushText(); this.events.push({ type: 'combo', mods: Array.from(this.currentModifiers).join(' '), key: KEY_MAP[key] || key.toUpperCase() }); return }
    if (KEY_MAP[key] && key.length > 1) { if (this.textBuffer) this.flushText(); this.events.push({ type: 'key', key: KEY_MAP[key] }); return }
    if (key.length === 1 && TYPEABLE.test(key)) { this.textBuffer += key; return }
  }
  handleKeyUp(data) { const key = data.key; if (['Control_L','Control_R','Shift_L','Shift_R','Alt_L','Alt_R','Meta_L','Meta_R'].includes(key)) this.currentModifiers.delete(KEY_MAP[key] || key) }
  flushText() { if (this.textBuffer) { this.events.push({ type: 'string', text: this.textBuffer }); this.textBuffer = '' } }
  toDuckyScript() {
    let lines = ['REM Recorded with Pico Ducky GUI Recorder', 'REM Date: ' + new Date().toISOString(), '']
    for (const ev of this.events) {
      if (ev.type === 'delay') lines.push('DELAY ' + ev.ms)
      else if (ev.type === 'string') lines.push('STRING ' + ev.text)
      else if (ev.type === 'key') lines.push(ev.key)
      else if (ev.type === 'combo') lines.push(ev.mods + ' ' + ev.key)
    }
    lines.push('', 'REM End of recording')
    return lines.join('\n')
  }
}
module.exports = { Recorder }
