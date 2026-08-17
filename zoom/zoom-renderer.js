const img = document.getElementById('zoomed');
const backdrop = document.getElementById('backdrop');

window.zoomAPI.onSetImage((url) => {
  img.src = url;
});

backdrop.addEventListener('click', () => {
  window.zoomAPI.close();
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.zoomAPI.close();
});
