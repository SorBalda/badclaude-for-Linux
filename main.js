const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen, globalShortcut, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');

// ── Win32 FFI (Windows only) ────────────────────────────────────────────────
let keybd_event, VkKeyScanA;
if (process.platform === 'win32') {
  try {
    const koffi = require('koffi');
    const user32 = koffi.load('user32.dll');
    keybd_event = user32.func('void __stdcall keybd_event(uint8_t bVk, uint8_t bScan, uint32_t dwFlags, uintptr_t dwExtraInfo)');
    VkKeyScanA = user32.func('int16_t __stdcall VkKeyScanA(int ch)');
  } catch (e) {
    console.warn('koffi not available – macro sending disabled', e.message);
  }
}

// ── Config ─────────────────────────────────────────────────────────────────
const CONFIG_PATH = path.join(os.homedir(), '.badclauderc.json');

const DEFAULT_CONFIG = {
  mode: 'bad',
  sendCtrlC: true,
  sendEnter: true,
  hotkey: '',
  messages: {
    bad: ['FASTER', 'FASTER', 'GO FASTER', 'Faster CLANKER', 'Work FASTER', 'Speed it up clanker'],
    good: ['Great job Claude!', "You're doing amazing!", 'Keep it up!', 'Bravo Claude!', 'Perfect work!'],
  },
  sounds: { bad: 'default', good: 'default' },
};

let config;

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
      config = { ...DEFAULT_CONFIG, ...raw, messages: { ...DEFAULT_CONFIG.messages, ...raw.messages }, sounds: { ...DEFAULT_CONFIG.sounds, ...raw.sounds } };
      return;
    }
  } catch (e) {
    console.warn('Failed to load config, using defaults:', e.message);
  }
  config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

function saveConfig(cfg) {
  config = cfg;
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch (e) {
    console.warn('Failed to save config:', e.message);
  }
}

// ── Globals ─────────────────────────────────────────────────────────────────
let tray, overlay, settingsWin;
let overlayReady = false;
let spawnQueued = false;

const VK_CONTROL = 0x11;
const VK_RETURN  = 0x0D;
const VK_C       = 0x43;
const VK_MENU    = 0x12; // Alt
const VK_TAB     = 0x09;
const KEYUP      = 0x0002;

/** One Alt+Tab / Cmd+Tab so focus returns to the previously active app after tray click. */
function refocusPreviousApp() {
  const delayMs = 80;
  const run = () => {
    if (process.platform === 'win32') {
      if (!keybd_event) return;
      keybd_event(VK_MENU, 0, 0, 0);
      keybd_event(VK_TAB, 0, 0, 0);
      keybd_event(VK_TAB, 0, KEYUP, 0);
      keybd_event(VK_MENU, 0, KEYUP, 0);
    } else if (process.platform === 'darwin') {
      const script = [
        'tell application "System Events"',
        '  key down command',
        '  key code 48', // Tab
        '  key up command',
        'end tell',
      ].join('\n');
      execFile('osascript', ['-e', script], err => {
        if (err) {
          console.warn('refocus previous app (Cmd+Tab) failed:', err.message);
        }
      });
    } else if (process.platform === 'linux') {
      execFile('xdotool', ['key', 'alt+Tab'], err => {
        if (err) {
          console.warn('refocus previous app (Alt+Tab) failed:', err.message);
        }
      });
    }
  };
  setTimeout(run, delayMs);
}

function createTrayIconFallback() {
  const p = path.join(__dirname, 'icon', 'Template.png');
  if (fs.existsSync(p)) {
    const img = nativeImage.createFromPath(p);
    if (!img.isEmpty()) {
      if (process.platform === 'darwin') img.setTemplateImage(true);
      return img;
    }
  }
  console.warn('badclaude: icon/Template.png missing or invalid');
  return nativeImage.createEmpty();
}

async function tryIcnsTrayImage(icnsPath) {
  const size = { width: 64, height: 64 };
  const thumb = await nativeImage.createThumbnailFromPath(icnsPath, size);
  if (!thumb.isEmpty()) return thumb;
  return null;
}

async function getTrayIcon() {
  const iconDir = path.join(__dirname, 'icon');
  if (process.platform === 'win32') {
    const file = path.join(iconDir, 'icon.ico');
    if (fs.existsSync(file)) {
      const img = nativeImage.createFromPath(file);
      if (!img.isEmpty()) return img;
    }
    return createTrayIconFallback();
  }
  if (process.platform === 'linux') {
    return createTrayIconFallback();
  }
  if (process.platform === 'darwin') {
    const file = path.join(iconDir, 'AppIcon.icns');
    if (fs.existsSync(file)) {
      const fromPath = nativeImage.createFromPath(file);
      if (!fromPath.isEmpty()) return fromPath;
      try {
        const t = await tryIcnsTrayImage(file);
        if (t) return t;
      } catch (e) {
        console.warn('AppIcon.icns Quick Look thumbnail failed:', e?.message || e);
      }
      const tmp = path.join(os.tmpdir(), 'badclaude-tray.icns');
      try {
        fs.copyFileSync(file, tmp);
        const t = await tryIcnsTrayImage(tmp);
        if (t) return t;
      } catch (e) {
        console.warn('AppIcon.icns temp copy + thumbnail failed:', e?.message || e);
      }
    }
    return createTrayIconFallback();
  }
  return createTrayIconFallback();
}

// ── Overlay window ──────────────────────────────────────────────────────────
function createOverlay() {
  const { bounds } = screen.getPrimaryDisplay();
  overlay = new BrowserWindow({
    x: bounds.x, y: bounds.y,
    width: bounds.width, height: bounds.height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    focusable: false,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlayReady = false;
  overlay.loadFile('overlay.html');
  overlay.webContents.on('did-finish-load', () => {
    overlayReady = true;
    overlay.webContents.send('set-mode', config.mode);
    if (spawnQueued && overlay && overlay.isVisible()) {
      spawnQueued = false;
      overlay.webContents.send('spawn-whip');
      refocusPreviousApp();
    }
  });
  overlay.on('closed', () => {
    overlay = null;
    overlayReady = false;
    spawnQueued = false;
  });
}

function toggleOverlay() {
  if (overlay && overlay.isVisible()) {
    overlay.webContents.send('drop-whip');
    return;
  }
  if (!overlay) createOverlay();
  else overlay.webContents.send('set-mode', config.mode);
  overlay.show();
  if (overlayReady) {
    overlay.webContents.send('spawn-whip');
    refocusPreviousApp();
  } else {
    spawnQueued = true;
  }
}

// ── Settings window ─────────────────────────────────────────────────────────
function openSettings() {
  if (settingsWin) { settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    width: 500, height: 650,
    resizable: false,
    frame: true,
    title: 'badclaude – Settings',
    webPreferences: {
      preload: path.join(__dirname, 'settings-preload.js'),
    },
  });
  settingsWin.setMenuBarVisibility(false);
  settingsWin.loadFile('settings.html');
  settingsWin.on('closed', () => { settingsWin = null; });
}

// ── IPC ─────────────────────────────────────────────────────────────────────
ipcMain.on('whip-crack', () => {
  try {
    sendMacro();
  } catch (err) {
    console.warn('sendMacro failed:', err?.message || err);
  }
});
ipcMain.on('hide-overlay', () => { if (overlay) overlay.hide(); });

ipcMain.handle('get-config', () => config);
ipcMain.handle('save-config', (_e, cfg) => {
  const oldHotkey = config.hotkey;
  saveConfig(cfg);
  rebuildTrayMenu();
  if (cfg.hotkey !== oldHotkey) registerHotkey();
  if (overlay && overlayReady) overlay.webContents.send('set-mode', config.mode);
});
ipcMain.handle('pick-sound-file', async () => {
  const result = await dialog.showOpenDialog(settingsWin, {
    filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg'] }],
    properties: ['openFile'],
  });
  return result.filePaths?.[0] || null;
});

// ── Hotkey ───────────────────────────────────────────────────────────────────
function registerHotkey() {
  globalShortcut.unregisterAll();
  if (config.hotkey) {
    try {
      globalShortcut.register(config.hotkey, toggleOverlay);
    } catch (e) {
      console.warn('Failed to register hotkey:', config.hotkey, e.message);
    }
  }
}

// ── Macro ───────────────────────────────────────────────────────────────────
function sendMacro() {
  const phrases = config.messages[config.mode] || config.messages.bad;
  const chosen = phrases[Math.floor(Math.random() * phrases.length)];
  const text = config.sendEnter ? chosen + '\n' : chosen;

  if (process.platform === 'win32') {
    sendMacroWindows(chosen);
  } else if (process.platform === 'darwin') {
    sendMacroMac(chosen);
  } else if (process.platform === 'linux') {
    sendMacroLinux(text);
  }
}

function sendMacroWindows(text) {
  if (!keybd_event || !VkKeyScanA) return;
  const tapKey = vk => {
    keybd_event(vk, 0, 0, 0);
    keybd_event(vk, 0, KEYUP, 0);
  };
  const tapChar = ch => {
    const packed = VkKeyScanA(ch.charCodeAt(0));
    if (packed === -1) return;
    const vk = packed & 0xff;
    const shiftState = (packed >> 8) & 0xff;
    if (shiftState & 1) keybd_event(0x10, 0, 0, 0);
    tapKey(vk);
    if (shiftState & 1) keybd_event(0x10, 0, KEYUP, 0);
  };

  if (config.sendCtrlC) {
    keybd_event(VK_CONTROL, 0, 0, 0);
    keybd_event(VK_C, 0, 0, 0);
    keybd_event(VK_C, 0, KEYUP, 0);
    keybd_event(VK_CONTROL, 0, KEYUP, 0);
  }
  for (const ch of text) tapChar(ch);
  if (config.sendEnter) {
    keybd_event(VK_RETURN, 0, 0, 0);
    keybd_event(VK_RETURN, 0, KEYUP, 0);
  }
}

function sendMacroMac(text) {
  const escaped = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const parts = [];
  if (config.sendCtrlC) {
    parts.push('  key code 8 using {command down}'); // Cmd+C
    parts.push('  delay 0.03');
  }
  parts.push(`  keystroke "${escaped}"`);
  if (config.sendEnter) {
    parts.push('  key code 36'); // Enter
  }
  const script = ['tell application "System Events"', ...parts, 'end tell'].join('\n');
  execFile('osascript', ['-e', script], err => {
    if (err) console.warn('mac macro failed:', err.message);
  });
}

function sendMacroLinux(text) {
  const isWayland = process.env.XDG_SESSION_TYPE === 'wayland';
  if (isWayland) {
    const doType = () => {
      execFile('ydotool', ['type', '--delay', '50', '--key-delay', '12', text], err => {
        if (err) console.warn('linux macro type failed:', err.message);
      });
    };
    if (config.sendCtrlC) {
      execFile('ydotool', ['key', '--delay', '100', 'ctrl+c'], err => {
        if (err) { console.warn('linux macro Ctrl+C failed:', err.message); return; }
        setTimeout(doType, 150);
      });
    } else {
      doType();
    }
  } else {
    const doType = () => {
      const typeText = config.sendEnter ? text : text.replace(/\n$/, '');
      execFile('xdotool', ['type', '--clearmodifiers', typeText], err => {
        if (err) { console.warn('linux macro type failed:', err.message); return; }
        if (config.sendEnter) {
          execFile('xdotool', ['key', 'Return'], err2 => {
            if (err2) console.warn('linux macro Enter failed:', err2.message);
          });
        }
      });
    };
    if (config.sendCtrlC) {
      execFile('xdotool', ['key', 'ctrl+c'], err => {
        if (err) { console.warn('linux macro Ctrl+C failed:', err.message); return; }
        doType();
      });
    } else {
      doType();
    }
  }
}

// ── Tray menu ───────────────────────────────────────────────────────────────
function rebuildTrayMenu() {
  if (!tray) return;
  const actionLabel = config.mode === 'good' ? 'Pat!' : 'Whip!';
  tray.setToolTip(config.mode === 'good' ? 'Good Claude – click to pat' : 'Bad Claude – click for whip');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: actionLabel, click: toggleOverlay },
    { type: 'separator' },
    {
      label: 'Mode',
      submenu: [
        { label: 'Bad Claude', type: 'radio', checked: config.mode === 'bad', click: () => { config.mode = 'bad'; config.sendCtrlC = true; saveConfig(config); rebuildTrayMenu(); } },
        { label: 'Good Claude', type: 'radio', checked: config.mode === 'good', click: () => { config.mode = 'good'; config.sendCtrlC = false; saveConfig(config); rebuildTrayMenu(); } },
      ],
    },
    { type: 'separator' },
    { label: 'Settings', click: openSettings },
    { label: 'Quit', click: () => app.quit() },
  ]));
}

// ── App lifecycle ───────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  loadConfig();
  tray = new Tray(await getTrayIcon());
  rebuildTrayMenu();
  tray.on('click', toggleOverlay);
  registerHotkey();
});

app.on('window-all-closed', e => e.preventDefault());
app.on('will-quit', () => { globalShortcut.unregisterAll(); });
