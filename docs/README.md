# Easy Line Up — Website

A static landing page for the Easy Line Up CS2 overlay app. No build step,
no framework — just HTML/CSS/JS, so it deploys anywhere that serves static
files.

## 1. One-time setup: connect it to your GitHub releases

Open `config.js` and fill in your real GitHub username and repo name — the
same ones you already put in the app's `package.json` under `build.publish`:

```js
const SITE_CONFIG = {
  GITHUB_OWNER: 'your-actual-username',
  GITHUB_REPO: 'your-actual-repo-name',
};
```

That's the only thing you need to edit. Once this is set, the site fetches
your **latest GitHub release** live every time someone visits — the
download buttons, version number, and file size all update automatically
whenever you ship a new version with `npm run publish` from the app
project. You never need to touch this website again after a release.

## 2. Deploy it — easiest option: GitHub Pages (free)

Since your app's installers already live on GitHub Releases, hosting the
website on GitHub Pages in the **same repository** is the simplest setup —
one place for everything.

1. Put this website's files in a folder in your repo, e.g. `docs/` (or a
   separate `gh-pages` branch — either works).
2. In your repo on GitHub: **Settings → Pages** → set the source to that
   folder/branch.
3. GitHub gives you a URL like `https://your-username.github.io/your-repo/`.
4. (Optional) Add a custom domain under the same Pages settings if you buy
   one later — GitHub handles the HTTPS certificate automatically.

## 3. Other hosting options

Since it's just static files, any of these work identically well and are
free for a site this size: **Netlify**, **Vercel**, **Cloudflare Pages**.
Drag-and-drop the folder onto any of them and it's live in under a minute.

## 4. One thing to fix after you know your final URL

`index.html` currently references the social-share preview image
(`og:image`) as a relative path (`assets/og-image.png`). Most platforms
resolve that fine, but a few (older Facebook/LinkedIn scrapers especially)
require an **absolute** URL to reliably show the preview image when the
link is shared. Once you know your final site URL, update these two lines
in `index.html`'s `<head>` to the full address:

```html
<meta property="og:image" content="https://your-actual-domain.com/assets/og-image.png" />
<meta name="twitter:image" content="https://your-actual-domain.com/assets/og-image.png" />
```

## Files

```
easy-lineup-website/
├─ index.html      Main landing page
├─ privacy.html     Privacy/data-collection page
├─ style.css        All styling
├─ script.js        Fetches latest GitHub release, wires up download buttons
├─ config.js        <-- edit this once with your GitHub username/repo
└─ assets/
   ├─ icon.png                The app icon (also used in the nav)
   ├─ favicon.ico              Multi-size favicon
   ├─ favicon-16x16.png
   ├─ favicon-32x32.png
   ├─ favicon-48x48.png
   ├─ apple-touch-icon.png     For iOS "Add to Home Screen"
   └─ og-image.png             Social share preview (Discord/Twitter/etc.)
```

## Testing locally

Since the site fetches from GitHub's API, just opening `index.html` directly
in a browser works fine for checking layout - the download buttons will
show real data once `config.js` is filled in and you have at least one
GitHub Release with a `.exe` and/or `.AppImage` asset attached to it.
