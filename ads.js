const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { AD_MANIFEST_URL, REFRESH_INTERVAL_MINUTES } = require('./ads-config');

let app = null;
let cachePath = null;
let onUpdate = null; // callback(ads[])
let refreshTimer = null;

function isConfigured() {
  return Boolean(AD_MANIFEST_URL) && !AD_MANIFEST_URL.includes('YOUR_USERNAME');
}

function fetchManifest() {
  if (!isConfigured()) return;

  const client = AD_MANIFEST_URL.startsWith('https') ? https : http;
  const req = client.get(AD_MANIFEST_URL, { timeout: 8000 }, (res) => {
    if (res.statusCode !== 200) {
      console.error(`Ad manifest fetch failed: HTTP ${res.statusCode}`);
      res.resume();
      return;
    }
    let body = '';
    res.on('data', (chunk) => {
      body += chunk;
    });
    res.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        const ads = Array.isArray(parsed.ads) ? parsed.ads : [];
        cacheAds(ads);
        if (onUpdate) onUpdate(ads);
      } catch (err) {
        console.error('Ad manifest parse error:', err.message);
      }
    });
  });
  req.on('error', (err) => console.error('Ad manifest fetch error:', err.message));
  req.on('timeout', () => req.destroy());
}

function cacheAds(ads) {
  try {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify({ ads, cachedAt: Date.now() }, null, 2));
  } catch (err) {
    console.error('Failed to cache ad manifest:', err.message);
  }
}

function loadCachedAds() {
  try {
    const parsed = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    return Array.isArray(parsed.ads) ? parsed.ads : [];
  } catch {
    return [];
  }
}

// Call once, after Electron's `app` module is ready. `updateCallback` is
// called with the current ads array whenever a fresh manifest is fetched.
function init(electronApp, updateCallback) {
  app = electronApp;
  cachePath = path.join(app.getPath('userData'), 'ads-cache.json');
  onUpdate = updateCallback;

  fetchManifest(); // get the latest right away
  refreshTimer = setInterval(fetchManifest, REFRESH_INTERVAL_MINUTES * 60 * 1000);
}

function stop() {
  if (refreshTimer) clearInterval(refreshTimer);
}

module.exports = { init, stop, loadCachedAds, isConfigured };
