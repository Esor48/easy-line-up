# CS2 Lineup Overlay

A small always-on-top corner widget for Counter-Strike 2. It automatically
detects which map you're playing (via CS2's official Game State Integration
feature) and lets you pick a smoke / flash / molotov lineup by name. Pick one
and it shows three images so you can practice fast, plus a dedicated Spawn
Smoke tab for the throws you do right out of spawn.

It does **not** read game memory, inject into the CS2 process, or hook
anything — it's a plain desktop window that sits on top of the game and gets
map info the same official way stream overlays and coaching tools do. Safe to
run alongside CS2 and VAC.

## 1. Run it

**Option A — for you, right now (dev mode):**
You'll need [Node.js](https://nodejs.org) installed.

```bash
cd cs2-lineup-overlay
npm install
npm start
```

**Option B — build a real installer to share with friends/testers:**

```bash
npm install
npm run dist
```

This produces an installer in `dist/` (an `.exe` on Windows, an `.AppImage`
on Linux) using `electron-builder`, with your custom app icon and a
license/data-notice page baked in (see sections 6 and 9). Anyone can just
download and run it like a normal app — no Node.js, no terminal, no npm
required on their end.

A small panel will appear in the top-right corner of your screen. You can
drag it anywhere, and it's resizable from the edges if you want more room.

## 2. Map detection sets itself up automatically

The first time the app runs, it automatically looks for your CS2 install
(checking Steam's default folders and any extra Steam library drives) and
copies the required Game State Integration config into CS2's `cfg` folder
for you — **no manual folder-copying needed.**

- If it finds CS2, you'll see a brief green banner: *"CS2 found automatically
  — lineups ready."* It disappears on its own after a few seconds.
- If it can't find CS2 (e.g. an unusual install location), you'll see a
  banner with a **SET FOLDER** button — click it, pick your CS2 folder (or
  the `…/game/csgo/cfg` folder directly) in the dialog that opens, and it's
  set up from there. This only ever comes up if auto-detection fails.

Either way, restart CS2 once after first setup so it picks up the new config.

**The map automatically resets when a match ends.** If CS2 stops reporting a
map at all (you left the match, disconnected, or went back to the main menu),
the panel switches back to the manual map picker rather than showing the last
map you played forever.

**Display mode note:** the overlay can only be seen if CS2 is running in
**Fullscreen Windowed** (Settings → Video → Display Mode). This is CS2's
default and what most players use. True "Exclusive Fullscreen" blocks all
overlays, including Discord's.

## 3. Using it

- The panel shows the detected map name in the header.
- Click the arrow (▸/▾) to expand/collapse the lineup list for that map.
- Use the ALL / SMOKE / FLASH / MOLOTOV / **SPAWN SMOKE** buttons to switch
  between categories - the list scrolls if there are more than fit on screen.
- Click a lineup name to see its images.
- Click **‹ BACK** to return to the list.
- Drag the header bar to reposition the panel anywhere on screen.
- If CS2 hasn't been detected yet, you'll see a manual map picker instead of
  the lineup list — pick a map to browse it right away. As soon as CS2/GSI
  reports a real map, this switches over automatically.
- **F9** — show/hide the whole overlay.
- **F8** — Mouse Capture Toggle: lets clicks pass straight through the panel
  to CS2 underneath (handy once you've picked a lineup and just want to
  glance at it while playing), or re-enables normal interaction with the
  panel.
- **Can't move your cursor to click the panel?** That's CS2 itself locking
  the mouse for aiming, same as any shooter - no overlay app can override
  that while CS2 has it captured. Press **Esc** to open CS2's own pause
  menu, which always releases the cursor reliably; click around the panel,
  then Esc again to resume.

## 4. Practicing a lineup - ZOOM

Regular lineups (ALL/SMOKE/FLASH/MOLOTOV) show three images, each with a
**ZOOM** button:

- **STAND HERE** — the general area to be in.
- **EXACT SPOT** — precisely where your feet need to be, since drifting a
  step left or right is often enough to ruin a smoke.
- **AIM HERE** — exactly what your crosshair should be looking at, with a
  bright **JUMP-THROW** or **STANDING THROW** badge above it (never both) —
  set per-lineup via the `throwType` field in the JSON.

Click **ZOOM** to open any image full-size in a large centered window - it
scales small screenshots up to fill the window properly. Click anywhere on
it or press Escape to close it.

The panel automatically grows/shrinks to fit whatever's on screen, so all
three images are always fully visible without scrolling.

**Adding images:** add image files into `images/<map>/` matching the
filenames referenced in `lineups.json`. You don't have to match the exact
file extension — `.jpg` vs `.png` etc. is matched by filename alone.

## 5. Adding your own lineups (no code changes needed)

The app ships with all 7 maps already set up as empty categories, ready for
you to fill in: **Ancient, Anubis, Cache, Dust II, Inferno, Mirage, Nuke**.
Everything lives in `data/lineups.json`, keyed by the exact map name CS2
reports (`de_ancient`, `de_anubis`, `de_cache`, `de_dust2`, `de_inferno`,
`de_mirage`, `de_nuke`). Add a new object to a map's array like this:

```json
{
  "id": "mirage-ct-window-smoke",
  "name": "CT Window Smoke (from T Ramp)",
  "type": "smoke",
  "side": "T",
  "area": "a-site",
  "throwType": "Left click, jump, right click",
  "extraNote": "Hold SHIFT while walking to the spot",
  "standImage": "de_mirage/ct-window-stand.png",
  "exactStandImage": "de_mirage/ct-window-exact.png",
  "aimImage": "de_mirage/ct-window-aim.png"
}
```

- `type` should be `smoke`, `flash`, or `molotov`. Note: the panel's FLASH
  MOL button shows both `flash` and `molotov` entries together in one tab.
  Common alternate spellings are also recognized automatically -
  `flashbang`, `flash grenade`, and `flashgrenade` all count as `flash`;
  `incendiary`, `firebomb`, and `fire` all count as `molotov` - so it
  doesn't matter which word you naturally reach for when typing up entries.
- `side` should be `T` or `CT` — every category (ALL/SMOKE/FLASH MOL/SPAWN
  SMOKE) has a shared T SIDE / CT SIDE toggle, and this decides which side a
  lineup shows under. **Leave it out entirely and the lineup shows under
  both sides** - useful for anything that isn't side-specific.
- `area` should be `a-site`, `mid`, or `b-site` — controls the ALL/A-SITE/
  MID/B-SITE filter row shown under the side toggle (for ALL/SMOKE/FLASH MOL
  only, not Spawn Smoke). **Leave it out and the lineup only shows under
  ALL**, not under any specific area button.
  **You don't have to set this by hand** — if you leave `area` out of the
  JSON entirely, the app automatically infers it from your image filenames
  instead. Just end the filename with `-a`, `-b`, or `-mid` right before the
  extension: `bench-aim-b.jpg` auto-tags as B-site, `window-aim-a.jpg` as
  A-site, `connector-aim-mid.jpg` as Mid. It checks the aim image first,
  then exact-spot, then stand. An explicit `area` field in the JSON always
  wins if you do set one.
- `throwType` is completely freeform — type whatever you want and it shows
  verbatim in the badge next to the aim image (e.g. "Jump throw", "Left
  click hold", "Walk + throw", anything). The two special values `jump` and
  `standing` map to the preset "JUMP-THROW"/"STANDING THROW" colored labels.
  **Defaults to "JUMP-THROW" automatically if you leave the field out
  entirely** - most lineups are jump-throws, so you only need to set this
  when a lineup is actually different (e.g. `"throwType": "standing"`).
  If you want a specific lineup to show no badge at all, set
  `"throwType": ""` explicitly - that's treated as a deliberate override,
  not a missing value.
- `extraNote` is optional freeform text shown right next to that badge, for
  lineups that need an extra manual step (e.g. "Press E on the box first").
  Type whatever you want here - leave it out if not needed.
- `positionGroup` is optional and manual - set it when two or more lineups
  are thrown from the exact same physical standing spot (not just the same
  general area). Give them all the same string value, e.g.
  `"positionGroup": "anubis-b-main-peek"`. Any lineup sharing that value
  shows a **SAME SPOT** badge in the list, and its detail view gets a
  scrollable strip at the bottom showing every other throw from that same
  spot (aim image only, since you're already standing in the right place -
  tap one to jump straight to it). Leave it out entirely for lineups that
  don't share a spot with anything else - this only ever shows up when
  you've deliberately linked two or more entries together.
- Image paths are relative to `images/`. Missing images just show a
  placeholder telling you which path to add.
- New maps just need a new top-level key in the JSON — no code changes.

**The side toggle auto-detects your team via GSI** (no setup needed) and
defaults to whichever side you're actually playing. If you manually switch
to look at the other side, that choice sticks - even while you keep playing
on your actual side - until you change maps or a new match starts, at which
point it goes back to auto-detecting.

Restart the app (or reload the window) after editing `lineups.json`.

## 6. Spawn Smoke tab (manual, always available)

A dedicated 5th tab next to ALL/SMOKE/FLASH/MOLOTOV, for the handful of
throws you do right out of spawn. Unlike the other tabs, it's not tied to
freeze time or any automatic detection — it's just always there to browse.

**Layout, top to bottom:**
1. A **T SIDE / CT SIDE** toggle.
2. One big overview image showing what that map+side's spawn generally
   looks like (from `data/spawn-overview.json`). If there's no image set for
   that map+side, and no spawn lineups either, it shows: *"There is no spawn
   smoke in this side."*
3. Below that, a tappable list of spawn lineups for that map+side (from
   `data/spawn-smokes.json`) — add as many as you want, named however you
   like (`Spawn 1 - Jungle Smoke`, `Spawn 2 - Window Smoke`, etc.).

**Opening a spawn lineup shows a different image order than regular
lineups** — **AIM HERE** (with the jump-throw/standing-throw badge) comes
**first**, followed by **SPAWN VIEW 1** and **SPAWN VIEW 2** instead of
"stand here"/"exact spot". The idea: at spawn you're not walking anywhere,
so the two spawn-view images just help you visually confirm you're at the
right spawn point before throwing.

**`data/spawn-overview.json`** — one big reference image per map+side:
```json
{
  "de_mirage": {
    "T": "de_mirage/spawn-overview-t.png",
    "CT": "de_mirage/spawn-overview-ct.png"
  }
}
```
Omit a side (or a whole map) entirely if you don't have an overview image
for it yet — the app falls back to the "no spawn smoke" text automatically.

**`data/spawn-smokes.json`** — one entry per spawn lineup:
```json
{
  "id": "mirage-t-spawn-1-jungle-smoke",
  "name": "Spawn 1 - Jungle Smoke",
  "side": "T",
  "type": "smoke",
  "throwType": "standing",
  "aimImage": "de_mirage/spawn-t1-jungle-aim.png",
  "spawnView1Image": "de_mirage/spawn-t1-view1.png",
  "spawnView2Image": "de_mirage/spawn-t1-view2.png"
}
```

**Organizing spawn images into T/CT subfolders (optional):** with a lot of
spawn positions per map, it's easier to keep them in separate folders
instead of one big flat list. Just include the subfolder in the image path:
```json
"aimImage": "de_ancient/spawn-t/spawn-t1-aim.jpg"
```
means the actual file lives at `images/de_ancient/spawn-t/spawn-t1-aim.jpg`.
Any folder depth works the same way (`de_ancient/spawn-ct/...`, or your own
naming) - the path is just a normal relative path, nothing special to set up.

**Note on an earlier, more complex version of this feature:** a previous
build of this app attempted fully automatic spawn detection using screen
capture + local image comparison (no game memory access) to recognize which
exact spawn you were at. It's been removed in favor of this simpler, fully
manual design — more predictable, easier to maintain, and no capture pipeline
running in the background. If GSI knows your team, the T/CT toggle
conveniently defaults to the right side, but you can always switch it
yourself.

## 7. Analytics (installs, DAU/MAU, country, language, session length)

The app can optionally send anonymous usage events (app installed, app
opened/closed, session duration) to [PostHog](https://posthog.com) so you
can see install counts, daily/monthly active users, country breakdown
(derived server-side from IP, never stored by you), and language
(OS locale) in a dashboard.

**To turn this on:**
1. Create a free PostHog account (or self-host it) and make a project.
2. Copy your Project API Key.
3. Paste it into `POSTHOG_API_KEY` at the top of `analytics.js`.
4. If your project is EU-hosted, change `POSTHOG_HOST` to `'eu.i.posthog.com'`.

Until you set a real key, analytics silently does nothing - the app works
identically either way.

**Consent has two paths depending on how the app was installed:**
- **Windows installer (NSIS):** consent is collected *during setup itself* —
  the installer shows a License page (`build/PRIVACY-AND-LICENSE.txt`)
  summarizing what's collected, and clicking "I Agree" to proceed with
  installation also records consent. A small marker file is written during
  install; the app checks for it on first launch and, if present, **never
  shows any in-app prompt at all.**
- **Anywhere else (dev mode via `npm start`, or non-Windows/non-NSIS
  builds):** there's no installer step to piggyback on, so the app falls
  back to a one-time in-app screen on first launch with **AGREE & CONTINUE**
  / **NO THANKS** buttons. Shown once ever, never again after that.

Either way, `PRIVACY.md` always has the full, exact breakdown of what is and
isn't collected.

**Before releasing publicly:** read `PRIVACY.md` — it flags what else you
should consider (a public privacy policy, EU-specific handling, etc.) if
you're distributing this widely or planning to run ads.

## 8. Remote ad control

An ad slot pinned to the bottom of the panel that you can update **remotely,
anytime, from your own computer — without pushing an app update**. Supports
images, GIFs, and video, and automatically resizes itself to fit whatever
creative is currently showing.

**Setup:**
1. Host a JSON manifest file *anywhere* you can edit (a
   [GitHub Gist](https://gist.github.com), a raw file in a public repo, or
   any static host). Use `ads-manifest.example.json` in this project as your
   starting template.
2. Put that file's URL into `AD_MANIFEST_URL` in `ads-config.js`.
3. Edit the hosted file's content whenever you want to change the ad —
   every installed copy picks it up automatically within
   `REFRESH_INTERVAL_MINUTES` (15 by default), no new release needed.
4. `type` can be `"image"`, `"gif"`, or `"video"`. `clickUrl` is optional and
   opens in the user's browser on click.

If the manifest can't be reached, the slot falls back to a small placeholder
rather than breaking anything.

**One heads-up:** most mainstream ad networks (Google AdSense in particular)
restrict or forbid placements inside non-browser desktop apps — check any
network's terms before assuming a web ad tag works unmodified here.

## 9. App icon

The app icon is generated from your logo (`build/icon.ico` for Windows,
`build/icon.png` for Linux) and wired into `package.json`'s
`build.win.icon` / `build.linux.icon`. To change it later: replace those two
files (keep the same names/formats — a multi-resolution `.ico` for Windows,
a 512×512 `.png` for Linux) and rebuild with `npm run dist`.

## 10. Auto-update (app downloads updates automatically)

The app checks for new versions on startup and downloads them in the
background using `electron-updater` - free, no server of your own to run.

- A **packaged** build (not `npm start` dev mode) silently checks for a
  newer release on launch.
- If one exists, it downloads in the background with a progress banner.
- Once downloaded: a **RESTART** button installs it immediately, or it
  installs automatically the next time you quit and reopen the app.

**Setup (one-time):**
1. Update `build.publish` in `package.json` with your real GitHub username
   and repo (currently placeholder values).
2. Push your code to that repo.
3. To ship a new version: bump `"version"` in `package.json`, then run:
   ```bash
   npm run publish
   ```
   This builds the installer *and* uploads it (plus the metadata
   `electron-updater` needs) to a GitHub Release automatically.

## 11. Packaged-app file access (important if you plan to distribute this)

By default, `electron-builder` bundles your whole app into a single
read-only archive (`app.asar`). That breaks two things this app needs:
opening `PRIVACY.md` from the consent screen (the OS can't open a file
that's sealed inside an archive), and reading `data/`, `images/`, and
`gsi/` the way a normal installed app should.

This is already fixed via `asarUnpack` in `package.json`'s build config,
which keeps those specific folders/files as real files sitting next to
`app.asar` instead of inside it. If you add new folders that need similar
treatment later, add them to that `asarUnpack` list the same way.

## 12. Project structure

```
cs2-lineup-overlay/
├─ main.js                    Electron main process: overlay window, GSI
│                             server, zoom window, auto-update wiring
├─ preload.js                 Safe bridge between main process and the UI
├─ analytics.js               Anonymous usage analytics + consent logic
├─ ads.js                     Fetches/caches the remote ad manifest
├─ ads-config.js              <-- edit this: your ad manifest URL
├─ ads-manifest.example.json  Template for the manifest you host yourself
├─ renderer/                  The corner panel's UI (HTML/CSS/JS)
├─ zoom/                      The full-size image inspector window
├─ build/                     Installer-time assets (not bundled into the app)
│  ├─ icon.ico / icon.png       App icons
│  ├─ PRIVACY-AND-LICENSE.txt   Shown as the Windows installer's License page
│  └─ installer.nsh             Records consent during install (see section 7)
├─ data/lineups.json          <-- edit this to add/change regular lineups
├─ data/spawn-smokes.json     <-- edit this to add/change spawn lineups
├─ data/spawn-overview.json   <-- edit this to add/change spawn overview images
├─ images/<map>/              Your lineup images
├─ gsi/gamestate_integration_lineuphelper.cfg   Copy into CS2's cfg folder
└─ PRIVACY.md                 What analytics data is collected and why
```

## 13. Packaging as a standalone .exe (optional)

For day-to-day use you can just run `npm start`. If you'd like a double-
clickable executable to share, run `npm run dist` (see section 1) — it uses
`electron-builder`, already configured in `package.json`.
