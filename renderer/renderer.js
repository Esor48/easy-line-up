const TYPE_COLORS = {
  smoke: 'var(--smoke)',
  flash: 'var(--flash)',
  molotov: 'var(--molotov)',
};

// Accepts common synonyms so the exact word typed into the JSON doesn't
// matter - "flashbang", "flash grenade", etc. are all treated as "flash".
const TYPE_ALIASES = {
  flashbang: 'flash',
  'flash grenade': 'flash',
  flashgrenade: 'flash',
  incendiary: 'molotov',
  firebomb: 'molotov',
  fire: 'molotov',
};

function normalizeType(type) {
  if (!type) return type;
  const lower = type.toLowerCase().trim();
  return TYPE_ALIASES[lower] || lower;
}

const THROW_LABELS = {
  jump: 'JUMP-THROW',
  standing: 'STANDING THROW',
};

// Which image goes in which of the 3 detail-view slots, and in what order,
// depends on the category of lineup being viewed.
const REGULAR_SLOTS = [
  { label: 'STAND HERE', field: 'standImage', badge: false },
  { label: 'EXACT SPOT', field: 'exactStandImage', badge: false },
  { label: 'AIM HERE', field: 'aimImage', badge: true },
];
const SPAWN_SLOTS = [
  { label: 'AIM HERE', field: 'aimImage', badge: true },
  { label: 'SPAWN VIEW 1', field: 'spawnView1Image', badge: false },
  { label: 'SPAWN VIEW 2', field: 'spawnView2Image', badge: false },
];

const state = {
  lineups: {},        // full data from lineups.json
  spawnSmokes: {},     // full data from spawn-smokes.json
  spawnOverview: {},   // full data from spawn-overview.json
  currentMap: null,
  autoDetected: false, // true once CS2/GSI has reported a real map
  activeFilter: 'all', // 'all' | 'smoke' | 'flash' | 'spawn' ('flash' includes molotov)
  activeArea: 'all',    // 'all' | 'a-site' | 'mid' | 'b-site' - not used by Spawn Smoke
  activeSide: 'T',      // 'T' | 'CT' - applies to ALL/SMOKE/FLASH/SPAWN SMOKE alike
  sideManuallySet: false, // true once the user picks a side themselves, so
                           // GSI auto-detection stops overriding their choice
  team: null,           // 'T' | 'CT' | null, from GSI - the default side
};

const el = {
  app: document.getElementById('app'),
  header: document.getElementById('header'),
  body: document.getElementById('body'),
  footer: document.querySelector('.footer'),
  adSlot: document.querySelector('.ad-slot'),
  adSlotInner: document.getElementById('ad-slot-inner'),
  toggleBtn: document.getElementById('toggle-btn'),
  statusDot: document.getElementById('status-dot'),
  mapLabel: document.getElementById('map-label'),
  mapPicker: document.getElementById('map-picker'),
  mapPickerButtons: document.getElementById('map-picker-buttons'),
  changeMapRow: document.getElementById('change-map-row'),
  changeMapBtn: document.getElementById('change-map-btn'),
  filterRow: document.getElementById('filter-row'),
  lineupList: document.getElementById('lineup-list'),
  emptyState: document.getElementById('empty-state'),
  spawnTab: document.getElementById('spawn-tab'),
  sideToggle: document.getElementById('side-toggle'),
  sideButtons: document.querySelectorAll('.side-btn'),
  areaRow: document.getElementById('area-row'),
  areaButtons: document.querySelectorAll('.area-btn'),
  spawnOverviewFrame: document.getElementById('spawn-overview-frame'),
  spawnNoImageText: document.getElementById('spawn-no-image-text'),
  spawnEntryList: document.getElementById('spawn-entry-list'),
  listView: document.getElementById('list-view'),
  detailView: document.getElementById('detail-view'),
  backBtn: document.getElementById('back-btn'),
  detailName: document.getElementById('detail-name'),
  samePositionSection: document.getElementById('same-position-section'),
  samePositionScroll: document.getElementById('same-position-scroll'),
  gsiBanner: document.getElementById('gsi-banner'),
  gsiBannerText: document.getElementById('gsi-banner-text'),
  hotkeyBanner: document.getElementById('hotkey-banner'),
  hotkeyBannerText: document.getElementById('hotkey-banner-text'),
  gsiFixBtn: document.getElementById('gsi-fix-btn'),
  updateBanner: document.getElementById('update-banner'),
  updateBannerText: document.getElementById('update-banner-text'),
  updateRestartBtn: document.getElementById('update-restart-btn'),
  consentOverlay: document.getElementById('consent-overlay'),
  consentAgree: document.getElementById('consent-agree'),
  consentDecline: document.getElementById('consent-decline'),
  consentPrivacyLink: document.getElementById('consent-privacy-link'),
};

let activeItem = null;       // the lineup entry currently open in detail view
let activeCategory = 'regular'; // 'regular' | 'spawn' - which slot layout to use

// Measures the panel's true content height (header + banner + body content
// + footer + ad slot) and asks the main process to resize the window to
// match, so lineup images are always fully visible without scrolling or
// the user having to manually drag the window bigger.
function measureAndResize() {
  const bannerHeight = el.gsiBanner.hidden ? 0 : el.gsiBanner.offsetHeight;
  const updateBannerHeight = el.updateBanner.hidden ? 0 : el.updateBanner.offsetHeight;
  const hotkeyBannerHeight = el.hotkeyBanner.hidden ? 0 : el.hotkeyBanner.offsetHeight;
  const bodyHeight = el.app.classList.contains('collapsed') ? 0 : el.body.scrollHeight;
  const footerHeight = el.app.classList.contains('collapsed') ? 0 : el.footer.offsetHeight;
  const total =
    el.header.offsetHeight +
    bannerHeight +
    updateBannerHeight +
    hotkeyBannerHeight +
    bodyHeight +
    footerHeight +
    el.adSlot.offsetHeight +
    12; // borders + a small safety margin so content never clips
  window.overlayAPI.resizeWindow(total);
}

// scrollHeight/offsetHeight are reliable immediately after a DOM mutation,
// so a single synchronous measurement is enough - no deferred re-check,
// since that was actually compounding a resize feedback loop (see the
// .panel height fix above) rather than protecting against a real race.
function requestResize() {
  measureAndResize();
}

const MAP_DISPLAY_NAMES = {
  de_ancient: 'ANCIENT',
  de_anubis: 'ANUBIS',
  de_cache: 'CACHE',
  de_dust2: 'DUST II',
  de_inferno: 'INFERNO',
  de_mirage: 'MIRAGE',
  de_nuke: 'NUKE',
};

function humanizeMapName(mapName) {
  if (!mapName) return 'NO MAP';
  return MAP_DISPLAY_NAMES[mapName] || mapName.replace(/^de_/, '').toUpperCase();
}

// Auto-categorizes a lineup into A-site/Mid/B-site from its image filename
// when the JSON entry doesn't already set an explicit "area" field - e.g.
// "bench-aim-b.jpg" is automatically tagged B-site. The filename must end
// with a hyphen followed by exactly "a", "b", or "mid" right before the
// extension (case-insensitive) - this hyphen requirement is deliberate, so
// a name like "camera-aim.jpg" (ends in "a" but isn't meant to be tagged)
// is never mistakenly categorized.
function inferAreaFromPath(path) {
  if (!path) return null;
  const base = path.split('/').pop().replace(/\.[^./]+$/, '');
  const match = base.match(/-(a|b|mid)$/i);
  if (!match) return null;
  const tag = match[1].toLowerCase();
  if (tag === 'a') return 'a-site';
  if (tag === 'b') return 'b-site';
  return 'mid';
}

// Runs once, right after lineups.json loads: fills in `area` for any entry
// that doesn't already have one explicitly set, by checking its image
// filenames. An explicit "area" field in the JSON always wins - this only
// fills the gaps.
function applyAreaInference(lineupsData) {
  for (const entries of Object.values(lineupsData)) {
    for (const item of entries) {
      if (!item.area) {
        item.area =
          inferAreaFromPath(item.aimImage) ||
          inferAreaFromPath(item.exactStandImage) ||
          inferAreaFromPath(item.standImage) ||
          undefined;
      }
    }
  }
  return lineupsData;
}

function availableMaps() {
  return Object.keys(state.lineups);
}

function currentMapLineups() {
  if (!state.currentMap) return [];
  return state.lineups[state.currentMap] || [];
}

// Returns every OTHER lineup on the current map that shares this item's
// positionGroup tag (a manually-assigned string in lineups.json - lineups
// thrown from the exact same physical spot). Empty array if the item has
// no positionGroup set, or it's the only one with that tag.
function positionGroupMates(item) {
  if (!item || !item.positionGroup) return [];
  return currentMapLineups().filter(
    (other) => other.positionGroup === item.positionGroup && other.id !== item.id
  );
}

function filteredLineups() {
  let items = currentMapLineups().filter(
    (item) => !item.side || item.side === state.activeSide
  );

  if (state.activeArea !== 'all') {
    items = items.filter((item) => item.area === state.activeArea);
  }

  if (state.activeFilter === 'all') return items;
  if (state.activeFilter === 'flash') {
    // FLASH MOL button covers both flash and molotov entries
    return items.filter((item) => {
      const t = normalizeType(item.type);
      return t === 'flash' || t === 'molotov';
    });
  }
  return items.filter((item) => normalizeType(item.type) === state.activeFilter);
}

// ---------- Manual map picker (only shown while nothing is auto-detected) ----------

function renderMapPicker() {
  const showPicker = !state.currentMap;
  el.mapPicker.hidden = !showPicker;
  el.filterRow.hidden = showPicker;
  el.changeMapRow.hidden = showPicker || state.autoDetected;

  if (!showPicker) return;

  el.lineupList.hidden = true;
  el.emptyState.hidden = true;
  el.spawnTab.hidden = true;
  el.mapPickerButtons.innerHTML = '';

  for (const mapKey of availableMaps()) {
    const btn = document.createElement('button');
    btn.className = 'map-picker-btn';
    btn.textContent = humanizeMapName(mapKey);
    btn.addEventListener('click', () => selectMapManually(mapKey));
    el.mapPickerButtons.appendChild(btn);
  }
  requestResize();
}

function selectMapManually(mapKey) {
  if (mapKey !== state.currentMap) {
    state.sideManuallySet = false;
    state.activeArea = 'all';
  }
  state.currentMap = mapKey;
  state.autoDetected = false;
  el.mapLabel.textContent = `${humanizeMapName(mapKey)} (manual)`;
  el.statusDot.classList.remove('live');
  renderMapPicker();
  renderCurrentTab();
}

// Lets the user back out of a manually-picked map and choose a different
// one, since CS2/GSI won't ever override a manual pick on its own unless a
// real match starts.
function resetToMapPicker() {
  state.currentMap = null;
  state.autoDetected = false;
  state.sideManuallySet = false;
  state.activeArea = 'all';
  el.mapLabel.textContent = 'NO MAP';
  el.statusDot.classList.remove('live');
  renderMapPicker();
  renderCurrentTab();
}

// ---------- Tab switching (ALL/SMOKE/FLASH/MOLOTOV vs SPAWN SMOKE) ----------

function renderCurrentTab() {
  el.sideToggle.hidden = !state.currentMap;
  el.sideButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.side === state.activeSide);
  });

  const isSpawnTab = state.activeFilter === 'spawn';
  el.areaRow.hidden = !state.currentMap || isSpawnTab;
  el.areaButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.area === state.activeArea);
  });

  if (isSpawnTab) {
    el.lineupList.hidden = true;
    el.emptyState.hidden = true;
    el.spawnTab.hidden = false;
    renderSpawnTab();
  } else {
    el.spawnTab.hidden = true;
    renderList();
  }
}

// ---------- Regular lineup list (ALL/SMOKE/FLASH/MOLOTOV) ----------

function renderList() {
  if (!state.currentMap) {
    el.lineupList.innerHTML = '';
    el.emptyState.hidden = true;
    requestResize();
    return;
  }

  const items = filteredLineups(); // list scrolls (see .lineup-list max-height) rather than capping
  el.lineupList.innerHTML = '';

  if (items.length === 0) {
    el.emptyState.hidden = false;
    el.lineupList.hidden = true;
    requestResize();
    return;
  }
  el.emptyState.hidden = true;
  el.lineupList.hidden = false;

  for (const item of items) {
    const row = buildLineupRow(item, true);
    row.addEventListener('click', () => openDetail(item, 'regular'));
    el.lineupList.appendChild(row);
  }
  requestResize();
}

function buildLineupRow(item, withTypeChip) {
  const row = document.createElement('div');
  row.className = 'lineup-row';
  const normType = normalizeType(item.type);
  row.style.setProperty('--type-color', TYPE_COLORS[normType] || 'var(--accent)');

  if (withTypeChip) {
    const chip = document.createElement('span');
    chip.className = 'type-chip';
    chip.textContent = (normType || 'util').toUpperCase();
    row.appendChild(chip);
  }

  const name = document.createElement('span');
  name.className = 'row-name';
  name.textContent = item.name;
  row.appendChild(name);

  if (positionGroupMates(item).length > 0) {
    const posBadge = document.createElement('span');
    posBadge.className = 'position-badge';
    posBadge.textContent = 'SAME SPOT';
    row.appendChild(posBadge);
  }

  const arrow = document.createElement('span');
  arrow.className = 'row-arrow';
  arrow.textContent = '›';
  row.appendChild(arrow);

  return row;
}

// ---------- Spawn Smoke tab (manual, always available, not tied to freeze time) ----------

function currentSpawnEntries() {
  if (!state.currentMap) return [];
  const all = state.spawnSmokes[state.currentMap] || [];
  return all.filter((item) => item.side === state.activeSide);
}

// The overview frame sizes itself to the image's natural dimensions (see
// CSS), which the browser doesn't know until the image actually finishes
// loading/decoding. Resizing the window before that finishes means the
// window is briefly the wrong size until something else happens to trigger
// another resize later - waiting for load/error here closes that gap.
function waitForImageLoad(img) {
  return new Promise((resolve) => {
    if (img.complete) {
      resolve();
      return;
    }
    img.addEventListener('load', resolve, { once: true });
    img.addEventListener('error', resolve, { once: true });
  });
}

async function renderSpawnTab() {
  const overviewPath = state.spawnOverview?.[state.currentMap]?.[state.activeSide] || null;
  const resolved = overviewPath ? await window.overlayAPI.getImagePath(overviewPath) : null;

  el.spawnOverviewFrame.innerHTML = '';
  if (resolved) {
    el.spawnOverviewFrame.hidden = false;
    const img = document.createElement('img');
    img.src = resolved;
    el.spawnOverviewFrame.appendChild(img);
    await waitForImageLoad(img);
  } else {
    el.spawnOverviewFrame.hidden = true;
  }

  const entries = currentSpawnEntries();
  el.spawnNoImageText.hidden = !(resolved === null && entries.length === 0);

  el.spawnEntryList.innerHTML = '';
  for (const item of entries) {
    const row = buildLineupRow(item, false);
    row.addEventListener('click', () => openDetail(item, 'spawn'));
    el.spawnEntryList.appendChild(row);
  }

  requestResize();
}

function selectSide(side) {
  state.activeSide = side;
  state.sideManuallySet = true;
  renderCurrentTab();
}

// ---------- Detail view (generic 3-slot layout, driven by category) ----------

async function setImageFrame(frameEl, relPath) {
  frameEl.innerHTML = '';
  const resolved = relPath ? await window.overlayAPI.getImagePath(relPath) : null;

  if (resolved) {
    const img = document.createElement('img');
    img.src = resolved;
    frameEl.appendChild(img);
    await waitForImageLoad(img);
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'placeholder';
    placeholder.innerHTML = `No image yet — add a file at<code>images/${relPath || '(not set)'}</code>`;
    frameEl.appendChild(placeholder);
  }
}

// throwType can still be exactly "jump" or "standing" for the original
// preset labels/colors, but now also accepts ANY other freeform text -
// whatever you type is shown verbatim in the same blue badge style. No
// need to pick from a fixed list anymore.
function renderThrowBadgeInto(badgeEl, item) {
  // If the field is entirely absent, default to Jump Throw. If you want a
  // specific lineup to show no badge at all, set `"throwType": ""` in the
  // JSON explicitly - that's treated as an intentional override, not a
  // missing value, so it stays hidden instead of falling back to the default.
  const hasExplicitValue = Object.prototype.hasOwnProperty.call(item, 'throwType');
  const value = hasExplicitValue ? item.throwType : 'jump';

  if (!value) {
    badgeEl.hidden = true;
    return;
  }
  badgeEl.hidden = false;
  badgeEl.classList.remove('jump', 'standing');
  if (value === 'jump' || value === 'standing') {
    badgeEl.textContent = THROW_LABELS[value];
    badgeEl.classList.add(value);
  } else {
    badgeEl.textContent = value;
    badgeEl.classList.add('jump'); // custom text uses the blue style
  }
}

// Optional, freeform, manually-typed text shown next to the throw badge -
// for lineups that need an extra note, e.g. "Press E on the box first" or
// "Hold SHIFT while walking to the spot". Set via the `extraNote` field on
// a lineup entry in the JSON; left out entirely if not needed.
function renderExtraNoteInto(extraEl, item) {
  if (!item.extraNote) {
    extraEl.hidden = true;
    return;
  }
  extraEl.hidden = false;
  extraEl.textContent = item.extraNote;
}

// Only meaningful for regular lineups (category === 'regular') - Spawn
// Smoke entries don't carry a positionGroup and this stays hidden for them.
async function renderSamePositionStrip(item) {
  const mates = positionGroupMates(item);
  if (mates.length === 0) {
    el.samePositionSection.hidden = true;
    return;
  }

  el.samePositionSection.hidden = false;
  el.samePositionScroll.innerHTML = '';

  for (const mate of mates) {
    const card = document.createElement('div');
    card.className = 'same-position-card';

    const thumb = document.createElement('div');
    thumb.className = 'same-position-thumb';
    const resolved = mate.aimImage ? await window.overlayAPI.getImagePath(mate.aimImage) : null;
    if (resolved) {
      const img = document.createElement('img');
      img.src = resolved;
      thumb.appendChild(img);
    } else {
      const ph = document.createElement('div');
      ph.className = 'placeholder-mini';
      ph.textContent = 'No image yet';
      thumb.appendChild(ph);
    }

    const name = document.createElement('div');
    name.className = 'same-position-name';
    name.textContent = mate.name;

    card.append(thumb, name);
    card.addEventListener('click', () => openDetail(mate, 'regular'));
    el.samePositionScroll.appendChild(card);
  }
}

async function openDetail(item, category) {
  activeItem = item;
  activeCategory = category;
  el.detailName.textContent = item.name;
  el.listView.hidden = true;
  el.detailView.hidden = false;

  const slots = category === 'spawn' ? SPAWN_SLOTS : REGULAR_SLOTS;
  for (let i = 1; i <= 3; i++) {
    const slot = slots[i - 1];
    document.getElementById(`slot${i}-label`).textContent = slot.label;
    const badgeEl = document.getElementById(`slot${i}-badge`);
    const extraEl = document.getElementById(`slot${i}-extra`);
    if (slot.badge) {
      renderThrowBadgeInto(badgeEl, item);
      renderExtraNoteInto(extraEl, item);
    } else {
      badgeEl.hidden = true;
      extraEl.hidden = true;
    }
    await setImageFrame(document.getElementById(`slot${i}-frame`), item[slot.field]);
  }

  if (category === 'regular') {
    await renderSamePositionStrip(item);
  } else {
    el.samePositionSection.hidden = true;
  }

  requestResize();
}

function closeDetail() {
  el.detailView.hidden = true;
  el.listView.hidden = false;
  activeItem = null;
  requestResize();
}

function relPathForSlot(slotNum) {
  if (!activeItem) return null;
  const slots = activeCategory === 'spawn' ? SPAWN_SLOTS : REGULAR_SLOTS;
  return activeItem[slots[slotNum - 1].field];
}

// ---------- Zoom view (bigger look at one image) ----------

async function openZoom(slotNum) {
  const relPath = relPathForSlot(slotNum);
  if (!relPath) return;
  const result = await window.overlayAPI.openZoomView(relPath);
  if (!result.ok) {
    console.warn('No image saved for this slot yet - add one to the images/ folder first.');
  }
}

// ---------- GSI setup status banner ----------

function renderGsiStatus(result) {
  el.gsiBanner.hidden = false;
  el.gsiBanner.classList.remove('ok', 'warn');

  if (result.ok) {
    el.gsiBanner.classList.add('ok');
    el.gsiBannerText.textContent =
      result.method === 'manual'
        ? '✅ CS2 configured — lineups will auto-detect the map'
        : '✅ CS2 found automatically — lineups ready';
    el.gsiFixBtn.hidden = true;
    setTimeout(() => {
      el.gsiBanner.hidden = true;
      requestResize();
    }, 6000);
  } else {
    el.gsiBanner.classList.add('warn');
    el.gsiBannerText.textContent = "⚠ Couldn't find CS2 automatically";
    el.gsiFixBtn.hidden = false;
  }
  requestResize();
}

async function fixGsiManually() {
  el.gsiBannerText.textContent = 'Waiting for folder selection…';
  const result = await window.overlayAPI.setupGSIManually();
  renderGsiStatus(result);
}

// ---------- Auto-update banner ----------

function renderUpdateStatus(status) {
  if (status.state === 'available') {
    el.updateBanner.hidden = false;
    el.updateBannerText.textContent = '⬇ Update available — downloading…';
    el.updateRestartBtn.hidden = true;
  } else if (status.state === 'downloading') {
    el.updateBanner.hidden = false;
    const pct = status.progress ? Math.round(status.progress.percent) : 0;
    el.updateBannerText.textContent = `⬇ Downloading update… ${pct}%`;
    el.updateRestartBtn.hidden = true;
  } else if (status.state === 'ready') {
    el.updateBanner.hidden = false;
    el.updateBannerText.textContent = '✅ Update ready';
    el.updateRestartBtn.hidden = false;
  } else if (status.state === 'error') {
    el.updateBanner.hidden = true; // fail quietly, don't nag about update errors
  }
  requestResize();
}

// ---------- Map + round state (driven by GSI) ----------

function setMap(mapName) {
  // A real detection from CS2 always wins over a manual pick, and once it
  // arrives the manual picker steps aside. When the match ends and CS2
  // stops reporting a map at all, mapName arrives as null and we fall
  // back to the manual picker automatically.
  if (mapName !== state.currentMap) {
    state.sideManuallySet = false;
    state.activeArea = 'all';
  }
  state.currentMap = mapName;
  state.autoDetected = !!mapName;
  el.mapLabel.textContent = humanizeMapName(mapName);
  el.statusDot.classList.toggle('live', !!mapName);
  renderMapPicker();
  renderCurrentTab();
}

function onRoundUpdate({ team }) {
  // Auto-detect which side you're playing and default the side toggle to
  // match, for every tab (not just Spawn Smoke) - but once you've picked a
  // side yourself, that choice sticks even if you're actually on the other
  // side, until a new map/match resets it.
  if (team && team !== state.team) {
    state.team = team;
    if (!state.sideManuallySet) {
      state.activeSide = team;
      renderCurrentTab();
    }
  }
}

function togglePanel() {
  el.app.classList.toggle('collapsed');
  el.toggleBtn.textContent = el.app.classList.contains('collapsed') ? '▸' : '▾';
  requestResize();
}

// ---------- Remotely-controlled ad rotation ----------

let adRotationTimer = null;
let adIndex = 0;
let currentAds = [];

const MAX_AD_WIDTH = 312; // panel inner width budget
const MAX_AD_HEIGHT = 260; // don't let one ad dominate the whole panel

function sizeAdCreative(width, height) {
  const w = Number(width) || 300;
  const h = Number(height) || 50;
  const scale = Math.min(MAX_AD_WIDTH / w, MAX_AD_HEIGHT / h, 1) || 1;
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

function renderAdPlaceholder() {
  el.adSlotInner.innerHTML = `
    <span class="ad-slot-label">AD</span>
    <span class="ad-slot-placeholder">Ad space — configure ads-config.js</span>
  `;
  el.adSlotInner.style.width = '300px';
  el.adSlotInner.style.height = '50px';
  requestResize();
}

function showAd(index) {
  const ad = currentAds[index];
  if (!ad) {
    renderAdPlaceholder();
    return;
  }

  const { width, height } = sizeAdCreative(ad.width, ad.height);
  el.adSlotInner.style.width = `${width}px`;
  el.adSlotInner.style.height = `${height}px`;
  el.adSlotInner.innerHTML = '';

  let mediaEl;
  if (ad.type === 'video') {
    mediaEl = document.createElement('video');
    mediaEl.src = ad.url;
    mediaEl.autoplay = true;
    mediaEl.muted = true;
    mediaEl.loop = true;
    mediaEl.playsInline = true;
  } else {
    mediaEl = document.createElement('img');
    mediaEl.src = ad.url;
    mediaEl.alt = 'Advertisement';
  }

  if (ad.clickUrl) {
    mediaEl.addEventListener('click', () => {
      window.overlayAPI.openExternalUrl(ad.clickUrl);
    });
  }

  el.adSlotInner.appendChild(mediaEl);
  requestResize();
}

function startAdRotation(ads) {
  clearTimeout(adRotationTimer);
  currentAds = Array.isArray(ads) ? ads.filter((a) => a && a.url) : [];
  adIndex = 0;

  if (currentAds.length === 0) {
    renderAdPlaceholder();
    return;
  }

  const advance = () => {
    showAd(adIndex);
    const durationMs = Math.max(2, Number(currentAds[adIndex].durationSeconds) || 8) * 1000;
    adIndex = (adIndex + 1) % currentAds.length;
    adRotationTimer = setTimeout(advance, durationMs);
  };
  advance();
}

// ---------- One-time analytics consent ----------

async function initConsent() {
  const needsConsent = await window.overlayAPI.needsAnalyticsConsent();
  if (!needsConsent) return; // skipped entirely if the Windows installer already recorded it

  el.consentOverlay.hidden = false;
  requestResize();

  el.consentAgree.addEventListener('click', async () => {
    await window.overlayAPI.recordAnalyticsConsent(true);
    el.consentOverlay.hidden = true;
    requestResize();
  });
  el.consentDecline.addEventListener('click', async () => {
    await window.overlayAPI.recordAnalyticsConsent(false);
    el.consentOverlay.hidden = true;
    requestResize();
  });
  el.consentPrivacyLink.addEventListener('click', () => {
    window.overlayAPI.openPrivacyInfo();
  });
}

function wireEvents() {
  el.toggleBtn.addEventListener('click', togglePanel);
  el.backBtn.addEventListener('click', closeDetail);

  el.detailView.addEventListener('click', (e) => {
    const btn = e.target.closest('.zoom-btn');
    if (!btn) return;
    openZoom(Number(btn.dataset.slot));
  });

  el.filterRow.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    state.activeFilter = btn.dataset.type;
    [...el.filterRow.children].forEach((b) => b.classList.toggle('active', b === btn));
    renderCurrentTab();
  });

  el.sideButtons.forEach((btn) => {
    btn.addEventListener('click', () => selectSide(btn.dataset.side));
  });

  el.areaRow.addEventListener('click', (e) => {
    const btn = e.target.closest('.area-btn');
    if (!btn) return;
    state.activeArea = btn.dataset.area;
    el.areaButtons.forEach((b) => b.classList.toggle('active', b === btn));
    renderList();
  });

  el.changeMapBtn.addEventListener('click', resetToMapPicker);

  window.overlayAPI.onMapUpdate((mapName) => setMap(mapName));
  window.overlayAPI.onRoundUpdate((data) => onRoundUpdate(data));

  window.overlayAPI.onMouseCaptureChanged((disabled) => {
    el.app.style.opacity = disabled ? '0.55' : '1';
  });

  el.gsiFixBtn.addEventListener('click', fixGsiManually);
  window.overlayAPI.onGsiSetupResult((result) => renderGsiStatus(result));

  window.overlayAPI.onHotkeyRegistrationFailed((keys) => {
    el.hotkeyBanner.hidden = false;
    el.hotkeyBanner.classList.add('warn');
    el.hotkeyBannerText.textContent = `⚠ ${keys.join(' & ')} ${keys.length > 1 ? "aren't" : "isn't"} working — another app is probably already using ${keys.length > 1 ? 'them' : 'it'}`;
    requestResize();
  });

  window.overlayAPI.onAdsUpdate((ads) => startAdRotation(ads));

  window.overlayAPI.onUpdateStatus((status) => renderUpdateStatus(status));
  el.updateRestartBtn.addEventListener('click', () => {
    window.overlayAPI.quitAndInstallUpdate();
  });
}

async function init() {
  state.lineups = applyAreaInference(await window.overlayAPI.getLineups());
  state.spawnSmokes = await window.overlayAPI.getSpawnSmokes();
  state.spawnOverview = await window.overlayAPI.getSpawnOverview();
  const existingMap = await window.overlayAPI.getCurrentMap();

  wireEvents();
  await initConsent();

  if (existingMap) {
    setMap(existingMap);
  } else {
    renderMapPicker();
    renderCurrentTab();
  }

  const cachedAds = await window.overlayAPI.getCachedAds();
  startAdRotation(cachedAds);

  requestResize();
}

init();
