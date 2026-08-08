'use strict';

const DEFAULT_MAX_PAGES = 100;

document.addEventListener('DOMContentLoaded', async () => {
  const input = document.getElementById('max-pages');
  const btn = document.getElementById('save-btn');
  const msg = document.getElementById('msg');

  const { maxPages = DEFAULT_MAX_PAGES } = await chrome.storage.local.get('maxPages');
  input.value = maxPages;

  btn.addEventListener('click', async () => {
    const val = parseInt(input.value, 10);
    if (!val || val < 1) { input.value = 1; return; }
    if (val > 500) { input.value = 500; return; }

    await chrome.storage.local.set({ maxPages: val });
    msg.textContent = '저장됐습니다.';
    setTimeout(() => { msg.textContent = ''; }, 1500);
  });
});
