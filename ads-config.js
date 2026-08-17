// Point this at a JSON file YOU control and can edit anytime - see
// README.md section "Remote ad control" for hosting options (GitHub raw /
// jsDelivr / Gist are all free and instant to update).
//
// The app fetches this URL periodically and rotates through whatever ads
// are listed in it - no app update needed to change what's shown.
module.exports = {
  // NOTE: using the unpinned raw URL (no revision hash) on purpose - this
  // always serves whatever the gist currently contains. If you copy a
  // "raw" link straight from GitHub's UI it usually includes a revision
  // hash, which pins to that exact snapshot forever and stops picking up
  // future edits. Keep this URL in this hash-free form.
  AD_MANIFEST_URL: 'https://gist.githubusercontent.com/Esor48/a2484252464c8293a5fa8c0f97933884/raw/ads-config.json',
  REFRESH_INTERVAL_MINUTES: 15,
};
