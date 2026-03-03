document.addEventListener('DOMContentLoaded', async () => {
  const listElement = document.getElementById('url-list');
  const copyAllButton = document.getElementById('copy-all');
  const clearButton = document.getElementById('clear');
  const statusElement = document.getElementById('status');
  const searchInput = document.getElementById('search');
  const tabs = document.querySelectorAll('.tab');

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const currentOrigin = new URL(tab.url).origin;

  let allUrls = { live: [], discovered: [] };
  let currentTab = 'internal';

  function showStatus(text) {
    statusElement.textContent = text;
    setTimeout(() => {
      if (statusElement.textContent === text) statusElement.textContent = '';
    }, 2000);
  }

  function isInternal(url) {
    if (url.startsWith('/') || !url.startsWith('http')) return true;
    try {
      return new URL(url).origin === currentOrigin;
    } catch (e) {
      return false;
    }
  }

  function getFullUrl(url) {
    if (url.startsWith('http')) return url;
    if (url.startsWith('/')) return currentOrigin + url;
    return currentOrigin + '/' + url;
  }

  function renderList() {
    const query = searchInput.value.toLowerCase();
    listElement.innerHTML = '';

    const isInt = currentTab === 'internal';

    // Deduplication Set using the final full URL as key
    const seen = new Set();
    const toRender = [];

    // Prioritize Live captures
    [...allUrls.live, ...allUrls.discovered].forEach(url => {
      if (isInternal(url) !== isInt) return;
      if (!url.toLowerCase().includes(query)) return;

      const fullUrl = getFullUrl(url);
      if (!seen.has(fullUrl)) {
        seen.add(fullUrl);
        // Identify if this specific string was live or disc
        const type = allUrls.live.includes(url) ? 'live' : 'disc';
        toRender.push({ url, type });
      }
    });

    if (toRender.length === 0) {
      const msg = query ? 'No matching endpoints found.' : 'No endpoints captured for this category.';
      listElement.innerHTML = `<div class="empty-state">${msg}</div>`;
      return;
    }

    toRender.forEach(item => createItem(item.url, item.type));
  }

  function createItem(url, type) {
    const li = document.createElement('li');
    li.className = 'url-item';

    let displayPath = url;
    try {
      if (url.startsWith('http')) {
        const urlObj = new URL(url);
        displayPath = urlObj.pathname + urlObj.search;
      }
    } catch (e) {}

    const pathEl = document.createElement('div');
    pathEl.className = 'url-path';
    pathEl.textContent = displayPath;

    const metaEl = document.createElement('div');
    metaEl.className = 'url-meta';

    const label = document.createElement('span');
    label.className = `label label-${type}`;
    label.textContent = type === 'live' ? 'Live' : 'Disc';

    const fullUrlEl = document.createElement('div');
    fullUrlEl.className = 'full-url';
    fullUrlEl.textContent = url;

    metaEl.appendChild(label);
    metaEl.appendChild(fullUrlEl);

    li.appendChild(pathEl);
    li.appendChild(metaEl);

    const targetUrl = getFullUrl(url);
    li.title = `Click to copy: ${targetUrl}`;
    li.onclick = () => {
      navigator.clipboard.writeText(targetUrl).then(() => {
        showStatus('Copied full URL!');
      });
    };

    listElement.appendChild(li);
  }

  async function fetchData() {
    chrome.runtime.sendMessage({ type: 'GET_DATA', tabId: tab.id }, (response) => {
      if (response) {
        allUrls = response;
        renderList();
      }
    });
  }

  // Event Listeners
  searchInput.oninput = () => renderList();

  tabs.forEach(t => {
    t.onclick = () => {
      tabs.forEach(item => item.classList.remove('active'));
      t.classList.add('active');
      currentTab = t.dataset.tab;
      renderList();
    };
  });

  copyAllButton.onclick = () => {
    const query = searchInput.value.toLowerCase();
    const isInt = currentTab === 'internal';
    const seen = new Set();
    const result = [];

    [...allUrls.live, ...allUrls.discovered].forEach(url => {
      if (isInternal(url) !== isInt) return;
      if (!url.toLowerCase().includes(query)) return;

      const fullUrl = getFullUrl(url);
      if (!seen.has(fullUrl)) {
        seen.add(fullUrl);
        result.push(fullUrl);
      }
    });

    if (result.length > 0) {
      navigator.clipboard.writeText(result.join('\n')).then(() => {
        showStatus(`Copied ${result.length} unique URLs!`);
      });
    }
  };

  clearButton.onclick = () => {
    chrome.runtime.sendMessage({ type: 'CLEAR_URLS', tabId: tab.id }, () => {
      fetchData();
      showStatus('Cleared!');
    });
  };

  fetchData();
  setInterval(fetchData, 2000);
});
