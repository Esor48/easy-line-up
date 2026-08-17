const {
  app,
  BrowserWindow,
  ipcMain,
  globalShortcut,
  screen,
  dialog,
  shell,
} = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const analytics = require('./analytics');
const ads = require('./ads');
const { autoUpdater } = require('electron-updater');

// Must be set before any app.getPath() call. Pinned to a literal value
// (rather than left to package.json's "name"/"productName" resolution)
// because build/installer.nsh writes a consent marker to this exact same
// folder name during install - see checkInstallerConsentMarker() below.
app.setName('cs2-lineup-overlay');

// If the app is somehow launched twice (auto-start + a manual shortcut
// double-click, a stuck/orphaned previous instance, etc.), the SECOND
// instance's F8/F9 global hotkey registration silently fails - Windows
// only lets one process claim a given hotkey. The user then ends up
// looking at a window whose hotkeys don't work while an invisible earlier
// instance holds them (extra easy to lose track of since the window has
// skipTaskbar: true). Enforcing a single instance closes that gap: any
// second launch just quits immediately and focuses the already-running one.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

const GSI_PORT = 3000;
const GSI_CFG_SOURCE = path.join(__dirname, 'gsi', 'gamestate_integration_lineuphelper.cfg');
const GSI_CFG_FILENAME = 'gamestate_integration_lineuphelper.cfg';

let mainWindow = null;
let zoomWindow = null;
let currentMap = null;
let mouseCaptureOff = false; // true = clicks pass through to CS2 underneath

// ---------------------------------------------------------------------
// GSI auto-setup: find CS2's cfg folder and drop our config file in it
// ---------------------------------------------------------------------

function candidateSteamRoots() {
  const roots = [];
  const home = os.homedir();

  if (process.platform === 'win32') {
    const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const pf = process.env['ProgramFiles'] || 'C:\\Program Files';
    roots.push(path.join(pf86, 'Steam'), path.join(pf, 'Steam'));
  } else {
    // best-effort Linux/SteamOS paths (Proton)
    roots.push(
      path.join(home, '.steam', 'steam'),
      path.join(home, '.local', 'share', 'Steam'),
      path.join(home, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam')
    );
  }
  return roots.filter((p) => fs.existsSync(p));
}

// Steam can install games across multiple drives/folders. The list of
// those folders lives in a simple key-value "libraryfolders.vdf" file.
function libraryFoldersFromVdf(steamRoot) {
  const vdfPath = path.join(steamRoot, 'steamapps', 'libraryfolders.vdf');
  const folders = [steamRoot];
  try {
    const content = fs.readFileSync(vdfPath, 'utf-8');
    const matches = content.matchAll(/"path"\s*"([^"]+)"/g);
    for (const m of matches) {
      folders.push(m[1].replace(/\\\\/g, '\\'));
    }
  } catch {
    // no library file, that's fine - just use the root we already have
  }
  return folders;
}

function findCS2CfgFolder() {
  for (const root of candidateSteamRoots()) {
    for (const library of libraryFoldersFromVdf(root)) {
      const cfgPath = path.join(
        library,
        'steamapps',
        'common',
        'Counter-Strike Global Offensive',
        'game',
        'csgo',
        'cfg'
      );
      if (fs.existsSync(cfgPath)) return cfgPath;
    }
  }
  return null;
}

function installGsiCfg(cfgFolder) {
  const dest = path.join(cfgFolder, GSI_CFG_FILENAME);
  fs.copyFileSync(GSI_CFG_SOURCE, dest);
  return dest;
}

function autoSetupGSI() {
  const cfgFolder = findCS2CfgFolder();
  if (!cfgFolder) return { ok: false, reason: 'not-found' };
  try {
    const dest = installGsiCfg(cfgFolder);
    return { ok: true, path: dest, method: 'auto' };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

async function manualSetupGSI() {
  if (!mainWindow) return { ok: false, reason: 'no-window' };
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select your CS2 "cfg" folder (…/game/csgo/cfg)',
    properties: ['openDirectory'],
  });
  if (result.canceled || !result.filePaths[0]) return { ok: false, reason: 'canceled' };

  const chosen = result.filePaths[0];
  // be forgiving: accept either the cfg folder itself, or the CS2 root,
  // and try to resolve down to .../game/csgo/cfg
  const candidates = [
    chosen,
    path.join(chosen, 'game', 'csgo', 'cfg'),
    path.join(chosen, 'csgo', 'cfg'),
  ];
  const cfgFolder = candidates.find((p) => fs.existsSync(p));
  if (!cfgFolder) return { ok: false, reason: 'invalid-folder' };

  try {
    const dest = installGsiCfg(cfgFolder);
    return { ok: true, path: dest, method: 'manual' };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

ipcMain.handle('setup-gsi-auto', () => autoSetupGSI());
ipcMain.handle('setup-gsi-manual', () => manualSetupGSI());

// ---------------------------------------------------------------------
// Main corner panel
// ---------------------------------------------------------------------

function createWindow() {
  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: 340,
    height: 640,
    x: screenWidth - 360,
    y: 20,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    minWidth: 320,
    minHeight: 90,
    skipTaskbar: true,
    hasShadow: false,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // F9 - show/hide the whole overlay panel
  const f9Registered = globalShortcut.register('F9', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      // Re-assert the always-on-top level every time - Windows can quietly
      // drop a window's always-on-top priority during certain focus
      // transitions with fullscreen/borderless games, which would make the
      // panel "show" internally but never actually become visible above
      // CS2. Cheap to redo, and closes that gap.
      mainWindow.setAlwaysOnTop(true, 'screen-saver');
      // show() would grab keyboard focus, which yanks focus away from CS2
      // (running fullscreen/borderless) - looks and feels exactly like an
      // alt-tab mid-game. showInactive() displays the panel without ever
      // taking focus, so CS2 stays the active/focused window throughout.
      mainWindow.showInactive();
    }
  });
  if (!f9Registered) {
    console.error(
      'F9 hotkey could not be registered - another running app is probably already using it.'
    );
  }

  // F8 - Mouse Capture Toggle: lets clicks pass straight through the panel
  // to CS2 underneath (or re-enables normal interaction with the panel)
  const f8Registered = globalShortcut.register('F8', () => {
    if (!mainWindow) return;
    mouseCaptureOff = !mouseCaptureOff;
    mainWindow.setIgnoreMouseEvents(mouseCaptureOff, { forward: true });
    mainWindow.webContents.send('mouse-capture-changed', mouseCaptureOff);
  });
  if (!f8Registered) {
    console.error(
      'F8 hotkey could not be registered - another running app is probably already using it.'
    );
  }

  if (!f9Registered || !f8Registered) {
    const failed = [!f9Registered && 'F9', !f8Registered && 'F8'].filter(Boolean);
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.webContents.send('hotkey-registration-failed', failed);
    });
  }
}

// ---------------------------------------------------------------------
// Zoom view: a big, centered, interactive window for inspecting one
// image up close
// ---------------------------------------------------------------------

// Fixed breathing room around the image (border + hint-text margin) - the
// window is sized as the image's exact native resolution plus this, so the
// image itself always renders at true 1:1 pixels. See zoom.html's matching
// `.backdrop { padding: 24px }`.
function openZoomView(imageFileUrl) {
  closeZoomView();

  const { bounds, workArea } = screen.getPrimaryDisplay();

  // Fixed target size, not tied to the source image's native resolution -
  // the image is set to object-fit:cover in zoom.html, so it always fully
  // fills whatever this window's size is, regardless of how small or
  // differently-shaped the original screenshot was.
  const TARGET_WIDTH = 1440;
  const TARGET_HEIGHT = 1080;
  const width = Math.min(TARGET_WIDTH, Math.round(workArea.width * 0.94));
  const height = Math.min(TARGET_HEIGHT, Math.round(workArea.height * 0.9));

  // Anchored near the TOP of the screen rather than centered - CS2's
  // crosshair always sits at the exact screen center, so a centered zoom
  // window would sit directly on top of it, hiding the one thing the
  // player actually needs to compare against while aiming.
  const topMargin = Math.round(workArea.height * 0.06);

  zoomWindow = new BrowserWindow({
    x: Math.round(bounds.x + (bounds.width - width) / 2),
    y: bounds.y + topMargin,
    width,
    height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: true,
    hasShadow: false,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'zoom', 'zoom-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  zoomWindow.setAlwaysOnTop(true, 'screen-saver');
  zoomWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  zoomWindow.loadFile(path.join(__dirname, 'zoom', 'zoom.html'));
  zoomWindow.webContents.once('did-finish-load', () => {
    zoomWindow.webContents.send('set-image', imageFileUrl);
  });
  zoomWindow.on('blur', () => closeZoomView());
}

function closeZoomView() {
  if (zoomWindow) {
    zoomWindow.destroy();
    zoomWindow = null;
  }
}

// Looks up an image by its declared relative path, falling back to any
// file with the same base name (different extension) in that folder.
// `baseDir` defaults to the images/ folder but can be overridden (used for
// the spawn-smoke overview images too).
function resolveImagePath(relPath, baseDir = path.join(__dirname, 'images')) {
  if (!relPath) return null;
  const fullPath = path.join(baseDir, relPath);
  if (fs.existsSync(fullPath)) return fullPath;

  const dir = path.dirname(fullPath);
  const baseNoExt = path.basename(relPath, path.extname(relPath)).toLowerCase();
  try {
    const match = fs
      .readdirSync(dir)
      .find((f) => path.basename(f, path.extname(f)).toLowerCase() === baseNoExt);
    if (match) return path.join(dir, match);
  } catch {
    // folder doesn't exist yet - no image saved
  }
  return null;
}

ipcMain.handle('open-zoom-view', (_event, relImagePath) => {
  const fullPath = resolveImagePath(relImagePath);
  if (!fullPath) return { ok: false, reason: 'missing-image' };
  openZoomView(`file://${fullPath}?t=${Date.now()}`);
  return { ok: true };
});

ipcMain.handle('close-zoom-view', () => {
  closeZoomView();
  return { ok: true };
});

// ---------------------------------------------------------------------
// Game State Integration listener
// ---------------------------------------------------------------------

function startGSIServer() {
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(404);
      res.end();
      return;
    }
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      res.writeHead(200);
      res.end();
      try {
        const payload = JSON.parse(body);
        const mapName = payload && payload.map && payload.map.name;
        const roundPhase = payload && payload.round && payload.round.phase; // 'freezetime'|'live'|'over'
        const phaseEndsIn =
          payload && payload.phase_countdowns && payload.phase_countdowns.phase_ends_in;
        const team = payload && payload.player && payload.player.team; // 'T' | 'CT'

        if (mainWindow) {
          if (mapName) {
            if (mapName !== currentMap) {
              currentMap = mapName;
              mainWindow.webContents.send('map-update', mapName);
            }
          } else if (currentMap !== null) {
            // No map in the payload at all - the match ended (back at menu,
            // disconnected, etc). Go back to the manual map picker.
            currentMap = null;
            mainWindow.webContents.send('map-update', null);
          }

          // Team is forwarded so the Spawn Smoke tab can default to the
          // correct T/CT side automatically when it's known.
          mainWindow.webContents.send('round-update', {
            phase: roundPhase || null,
            phaseEndsIn: phaseEndsIn !== undefined ? Number(phaseEndsIn) : null,
            team: team || null,
          });
        }
      } catch (err) {
        console.error('GSI payload parse error:', err.message);
      }
    });
  });

  server.on('error', (err) => {
    console.error('GSI server error (is port 3000 already in use?):', err.message);
  });

  server.listen(GSI_PORT, '127.0.0.1', () => {
    console.log(`GSI listener running at http://127.0.0.1:${GSI_PORT}`);
  });
}

// ---------------------------------------------------------------------
// Lineup data
// ---------------------------------------------------------------------

function readJson(relPath, fallback) {
  const dataPath = path.join(__dirname, relPath);
  try {
    return JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  } catch (err) {
    console.error(`Failed to read ${relPath}:`, err.message);
    return fallback;
  }
}

ipcMain.handle('get-lineups', () => readJson('data/lineups.json', {}));
ipcMain.handle('get-spawn-smokes', () => readJson('data/spawn-smokes.json', {}));
ipcMain.handle('get-spawn-overview', () => readJson('data/spawn-overview.json', {}));

ipcMain.handle('get-image-path', (_event, relPath) => {
  const fullPath = resolveImagePath(relPath);
  return fullPath ? `file://${fullPath}?t=${Date.now()}` : null;
});

ipcMain.handle('get-current-map', () => currentMap);

// The renderer measures its own content height (list/detail view, images,
// etc.) and asks us to grow/shrink the window to match, so lineup images
// are always fully visible without the user needing to scroll or manually
// resize.
ipcMain.handle('resize-window', (_event, desiredHeight) => {
  if (!mainWindow) return { ok: false };
  const { width } = mainWindow.getBounds();
  const { height: workHeight } = screen.getPrimaryDisplay().workAreaSize;
  const clamped = Math.max(120, Math.min(Math.round(desiredHeight), workHeight - 40));
  mainWindow.setContentSize(width, clamped);
  return { ok: true, height: clamped };
});

// ---------------------------------------------------------------------
// Analytics consent
// ---------------------------------------------------------------------
// On Windows, the installer can record consent during setup itself (see
// build/installer.nsh + PRIVACY-AND-LICENSE.txt) by writing a small marker
// file. If that marker exists, we treat consent as already given and skip
// showing the in-app prompt entirely - it only shows as a fallback where no
// installer step happened (dev mode, or any non-Windows/non-NSIS build).
function checkInstallerConsentMarker() {
  const markerPath = path.join(app.getPath('userData'), 'installer-consent.json');
  try {
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf-8'));
    if (marker && marker.agreed === true) {
      analytics.recordConsent(true);
      return true;
    }
  } catch {
    // no marker - normal case for dev mode / non-Windows builds
  }
  return false;
}

ipcMain.handle('needs-analytics-consent', () => {
  if (checkInstallerConsentMarker()) return false;
  return analytics.needsConsent();
});
ipcMain.handle('record-analytics-consent', (_event, enabledValue) => {
  analytics.recordConsent(enabledValue);
  return analytics.isEnabled();
});
ipcMain.handle('open-privacy-info', () => {
  shell.openPath(path.join(__dirname, 'PRIVACY.md'));
});
ipcMain.handle('open-external-url', (_event, url) => {
  if (typeof url === 'string' && /^https?:\/\//.test(url)) {
    shell.openExternal(url);
  }
});

ipcMain.handle('get-cached-ads', () => ads.loadCachedAds());

// ---------------------------------------------------------------------
// Auto-update: checks GitHub Releases (or whatever provider is configured
// in package.json's "build.publish") for a newer version and downloads it
// in the background, then prompts to restart and install.
// ---------------------------------------------------------------------

function initAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    if (mainWindow) mainWindow.webContents.send('update-status', { state: 'available', info });
  });
  autoUpdater.on('download-progress', (progress) => {
    if (mainWindow) mainWindow.webContents.send('update-status', { state: 'downloading', progress });
  });
  autoUpdater.on('update-downloaded', (info) => {
    if (mainWindow) mainWindow.webContents.send('update-status', { state: 'ready', info });
  });
  autoUpdater.on('error', (err) => {
    console.error('Auto-update error:', err.message);
    if (mainWindow) mainWindow.webContents.send('update-status', { state: 'error', message: err.message });
  });

  // Only check in a packaged build - running via `npm start` (dev mode)
  // has no update feed and would just log a harmless error otherwise.
  if (app.isPackaged) {
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('checkForUpdates failed:', err.message);
    });
  }
}

ipcMain.handle('quit-and-install-update', () => {
  autoUpdater.quitAndInstall();
});

if (gotSingleInstanceLock) {
  app.whenReady().then(() => {
    createWindow();
    startGSIServer();
    analytics.init(app);
    initAutoUpdater();
    ads.init(app, (freshAds) => {
      if (mainWindow) mainWindow.webContents.send('ads-update', freshAds);
    });
    mainWindow.webContents.once('did-finish-load', () => {
      const result = autoSetupGSI();
      mainWindow.webContents.send('gsi-setup-result', result);
    });
  });
}

app.on('before-quit', () => {
  analytics.trackClose();
  ads.stop();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  app.quit();
});
