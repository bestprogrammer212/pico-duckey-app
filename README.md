# pico-ducky-app

Electron GUI for flashing Raspberry Pi Pico with pico-ducky.  
Includes Payload Editor and Live Recorder.

## Features

- **Flash Mode**: Wipe and reflash your Pico with CircuitPython + pico-ducky
- **Setup Mode**: Swap payloads, download files, eject safely
- **Payload Editor**: Create and edit Ducky Script (.dd) files
- **Recorder**: Record keystrokes live and generate .dd payloads
- **Auto-Suppress**: While the app is open, the Pico will NOT execute payloads

## Supported Boards

- Raspberry Pi Pico
- Raspberry Pi Pico W
- Raspberry Pi Pico 2
- Raspberry Pi Pico 2 W

## Install

```bash
npm install
npm start
```

## Build

```bash
npm run build
```

## First Run

1. Select your Pico variant (Pico, Pico W, Pico 2, Pico 2 W)
2. The app downloads CircuitPython, pico-ducky files, and Adafruit libraries
3. For Pico W / Pico 2 W: enter Wi-Fi SSID and password
4. Click "Start Flash" — hold BOOTSEL and plug in your Pico

## Keyboard Layout

Payloads are CH-keyboard safe (only A-Z, 0-9, # \* + - . \_ = &lt; &gt; SPACE).

## Project Structure

```
pico-ducky-app/
├── package.json
├── main.js          (Electron main process)
├── preload.js       (IPC bridge)
├── src/
│   ├── detector.js  (Pico detection)
│   ├── flasher.js   (Flash logic)
│   ├── downloader.js(Download logic)
│   └── recorder.js  (Keystroke recorder)
├── renderer/
│   ├── index.html
│   ├── app.js
│   └── style.css
└── assets/
    ├── bundled/
    │   └── flash_nuke.uf2
    └── payloads/
        └── matrix-glitch.dd
```
