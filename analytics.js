const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------
// 1. Create a free account at https://posthog.com (or self-host PostHog).
// 2. Create a project and copy its "Project API Key".
// 3. Paste it below. Until you do, analytics silently does nothing - the
//    app works completely normally either way.
//
// Use 'eu.i.posthog.com' instead of 'us.i.posthog.com' below if your
// PostHog project is EU-hosted.
const POSTHOG_API_KEY = 'REPLACE_WITH_YOUR_POSTHOG_PROJECT_API_KEY';
const POSTHOG_HOST = 'us.i.posthog.com';

let app = null;
let settingsPath = null;
let distinctId = null;
let sessionId = null;
let sessionStart = null;
let enabled = true;
let configured = false;

function isConfigured() {
  return Boolean(POSTHOG_API_KEY) && !POSTHOG_API_KEY.startsWith('REPLACE_');
}

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  } catch {
    return {};
  }
}

function saveSettings(settings) {
  try {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  } catch (err) {
    console.error('Failed to save analytics settings:', err.message);
  }
}

// Call once, after Electron's `app` module is ready. Does NOT send any
// events yet if the user hasn't answered the one-time consent prompt -
// call recordConsent() first (or it will have already been recorded from
// a previous run).
function init(electronApp) {
  app = electronApp;
  settingsPath = path.join(app.getPath('userData'), 'analytics-settings.json');
  configured = isConfigured();

  const settings = loadSettings();

  if (!settings.distinctId) settings.distinctId = crypto.randomUUID();
  if (typeof settings.analyticsEnabled !== 'boolean') settings.analyticsEnabled = true;
  if (typeof settings.consentShown !== 'boolean') settings.consentShown = false;
  if (typeof settings.firstInstallTracked !== 'boolean') settings.firstInstallTracked = false;

  distinctId = settings.distinctId;
  enabled = settings.analyticsEnabled;
  sessionId = crypto.randomUUID();
  saveSettings(settings);

  // If this user already answered the consent prompt on a previous run,
  // track this session normally. If not, we wait - the renderer will show
  // the one-time consent screen and call recordConsent() with the answer.
  if (settings.consentShown) {
    if (!settings.firstInstallTracked) {
      track('App Installed', {});
      settings.firstInstallTracked = true;
      saveSettings(settings);
    }
    sessionStart = Date.now();
    track('App Opened', {});
  }
}

// Whether the one-time consent screen still needs to be shown.
function needsConsent() {
  const settings = loadSettings();
  return !settings.consentShown;
}

// Called once, when the user answers the first-run consent prompt.
function recordConsent(userEnabled) {
  const settings = loadSettings();
  settings.consentShown = true;
  settings.analyticsEnabled = Boolean(userEnabled);
  saveSettings(settings);
  enabled = settings.analyticsEnabled;

  // Now that we have a decision, track the "session" that's already
  // under way (install + open), same as if this had happened in init().
  if (!settings.firstInstallTracked) {
    track('App Installed', {});
    settings.firstInstallTracked = true;
    saveSettings(settings);
  }
  sessionStart = Date.now();
  track('App Opened', {});
}

function isEnabled() {
  return enabled;
}

// Call on app quit.
function trackClose() {
  if (!sessionStart) return;
  const sessionDurationSeconds = Math.round((Date.now() - sessionStart) / 1000);
  track('App Closed', { session_duration_seconds: sessionDurationSeconds });
}

function track(eventName, properties = {}) {
  if (!configured) {
    console.log(`[analytics] "${eventName}" NOT sent - no real POSTHOG_API_KEY set in analytics.js yet`);
    return;
  }
  if (!enabled) {
    console.log(`[analytics] "${eventName}" NOT sent - user declined or hasn't consented yet`);
    return;
  }
  if (!app) return;

  const payload = JSON.stringify({
    api_key: POSTHOG_API_KEY,
    event: eventName,
    distinct_id: distinctId,
    properties: {
      ...properties,
      $session_id: sessionId,
      app_version: app.getVersion(),
      platform: process.platform,
      // OS locale, e.g. "en-US" - used as a proxy for language, not identity.
      // Country is intentionally NOT sent from the client: PostHog derives it
      // server-side from the request IP and does not store the raw IP.
      language: app.getLocale(),
    },
  });

  console.log(`[analytics] sending "${eventName}" (distinct_id: ${distinctId})…`);

  const req = https.request(
    {
      hostname: POSTHOG_HOST,
      path: '/capture/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 5000,
    },
    (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`[analytics] "${eventName}" accepted by PostHog (HTTP ${res.statusCode})`);
        } else {
          console.error(
            `[analytics] "${eventName}" REJECTED by PostHog: HTTP ${res.statusCode} - ${body}`
          );
        }
      });
    }
  );
  req.on('error', (err) => {
    // Analytics must never crash or block the app.
    console.error(`[analytics] "${eventName}" send FAILED (network error):`, err.message);
  });
  req.on('timeout', () => req.destroy());
  req.write(payload);
  req.end();
}

module.exports = {
  init,
  needsConsent,
  recordConsent,
  track,
  trackClose,
  isEnabled,
  isConfigured,
};
