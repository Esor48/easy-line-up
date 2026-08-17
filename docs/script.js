(function () {
  const { GITHUB_OWNER, GITHUB_REPO } = SITE_CONFIG;
  const isConfigured = GITHUB_OWNER && !GITHUB_OWNER.startsWith('YOUR_');
  const repoUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`;

  const els = {
    winButtons: [
      document.getElementById('download-win'),
      document.getElementById('download-win-2'),
      document.getElementById('nav-download'),
    ],
    linuxButtons: [document.getElementById('download-linux'), document.getElementById('download-linux-2')],
    winMeta: [document.getElementById('win-meta'), document.getElementById('win-meta-2')],
    githubLinks: [document.getElementById('trust-github')],
  };

  // GitHub links (e.g. the SmartScreen "view source" link) always work even
  // before releases config is set - they just point at the repo itself.
  els.githubLinks.forEach((a) => {
    if (a) a.href = isConfigured ? repoUrl : 'https://github.com';
  });

  function humanSize(bytes) {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(0)} MB`;
  }

  function setMeta(text) {
    els.winMeta.forEach((el) => {
      if (el) el.textContent = text;
    });
  }

  function fallbackToReleasesPage(message) {
    setMeta(message);
    const releasesUrl = isConfigured ? `${repoUrl}/releases/latest` : repoUrl;
    [...els.winButtons, ...els.linuxButtons].forEach((btn) => {
      if (btn) btn.href = releasesUrl;
    });
  }

  if (!isConfigured) {
    fallbackToReleasesPage('Set up GitHub releases to enable this button');
    return;
  }

  fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`)
    .then((res) => {
      if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);
      return res.json();
    })
    .then((release) => {
      const assets = release.assets || [];
      const winAsset = assets.find((a) => a.name.endsWith('.exe'));
      const linuxAsset = assets.find((a) => a.name.endsWith('.AppImage'));

      if (winAsset) {
        els.winButtons.forEach((btn) => {
          if (btn) btn.href = winAsset.browser_download_url;
        });
        setMeta(`v${release.tag_name.replace(/^v/, '')} · ${humanSize(winAsset.size)}`);
      } else {
        fallbackToReleasesPage('No Windows build in the latest release yet');
      }

      if (linuxAsset) {
        els.linuxButtons.forEach((btn) => {
          if (btn) btn.href = linuxAsset.browser_download_url;
        });
      } else {
        els.linuxButtons.forEach((btn) => {
          if (btn) btn.href = `${repoUrl}/releases/latest`;
        });
      }
    })
    .catch((err) => {
      console.error('Could not fetch latest release:', err);
      fallbackToReleasesPage('See all releases on GitHub');
    });

  // Small polish: if the visitor is clearly on Linux, swap which button
  // reads as primary - most people should still get the Windows-first
  // treatment since that's the overwhelming majority of CS2 players.
  if (/Linux/.test(navigator.userAgent) && !/Android/.test(navigator.userAgent)) {
    document.querySelectorAll('.download-row').forEach((row) => {
      const first = row.children[0];
      const second = row.children[1];
      if (first && second) row.insertBefore(second, first);
    });
  }
})();
