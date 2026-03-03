let capturedUrls = {};

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'NEW_URL' && sender.tab) {
    const tabId = sender.tab.id;
    ensureTabEntry(tabId);
    capturedUrls[tabId].live.add(message.url);
  } else if (message.type === 'DISCOVER_SCRIPT' && sender.tab) {
    const tabId = sender.tab.id;
    const scriptUrl = message.url;
    extractEndpoints(scriptUrl, tabId);
  } else if (message.type === 'DISCOVER_INLINE' && sender.tab) {
    const tabId = sender.tab.id;
    parseContent(message.content, tabId, sender.tab.url);
  } else if (message.type === 'GET_DATA') {
    const tabId = message.tabId;
    if (capturedUrls[tabId]) {
      sendResponse({
        live: Array.from(capturedUrls[tabId].live),
        discovered: Array.from(capturedUrls[tabId].discovered)
      });
    } else {
      sendResponse({ live: [], discovered: [] });
    }
  } else if (message.type === 'CLEAR_URLS') {
    if (capturedUrls[message.tabId]) {
      capturedUrls[message.tabId].live.clear();
      capturedUrls[message.tabId].discovered.clear();
      capturedUrls[message.tabId].processedScripts.clear();
    }
    sendResponse({ success: true });
  }
  return true;
});

function ensureTabEntry(tabId) {
  if (!capturedUrls[tabId]) {
    capturedUrls[tabId] = {
      live: new Set(),
      discovered: new Set(),
      processedScripts: new Set()
    };
  }
}

async function extractEndpoints(scriptUrl, tabId) {
  ensureTabEntry(tabId);
  if (capturedUrls[tabId].processedScripts.has(scriptUrl)) return;
  capturedUrls[tabId].processedScripts.add(scriptUrl);

  try {
    const response = await fetch(scriptUrl);
    const content = await response.text();
    parseContent(content, tabId, scriptUrl);
  } catch (error) {
    // Silent fail
  }
}

function parseContent(content, tabId, sourceUrl) {
  ensureTabEntry(tabId);

  // GREEDY match until a non-URL character to ensure we get the WHOLE string
  // This prevents long base64 chunks from being truncated into valid-looking short matches
  const regex = /(?:https?:\/\/[^\s"'<>(){}\[\]^|]{5,}|(?:\/|["'])(?:api|v[0-9]|rest|json|graphql|ajax|auth|user|login|upload)[^\s"'<>(){}\[\]^|]*)/gi;

  let match;
  while ((match = regex.exec(content)) !== null) {
    let url = match[0];

    // Clean padding
    url = url.replace(/^["'(\[{]/, '').replace(/["')\]};,]$/, '');

    if (isLikelyEndpoint(url)) {
      capturedUrls[tabId].discovered.add(url);
    }
  }
}

function isLikelyEndpoint(url) {
  // 1. Strict length constraint - now effective because we match the FULL string
  if (url.length < 4 || url.length > 150) return false;

  // 2. High entropy / Token check (common in base64/data blobs)
  if (url.includes('+')) return false;
  if (url.includes('=') && !url.includes('?')) return false;

  // 3. Structural check
  if (url.includes('//') && !url.startsWith('http')) return false;
  if ((url.match(/\//g) || []).length > 8) return false;

  // 4. Forbidden patterns (common in binary-to-text dumps)
  if (url.includes('///')) return false;
  if (/[\x00-\x1F\x7F]/.test(url)) return false; // Non-printable chars

  // 5. Ignore static assets
  const staticAssets = /\.(png|jpg|jpeg|gif|svg|css|woff2?|ttf|eot|ico|html|js|map|txt|pdf|zip|gz|exe|bin|swf|flv)$/i;
  if (staticAssets.test(url)) return false;

  // 6. Key indicators for APIs
  const apiIndicators = /(api|v[0-9]|rest|json|graphql|ajax|auth|user|login|upload|token|query|mutation|callback|oauth)/i;

  if (url.startsWith('http')) {
     return true;
  }

  // For relative paths, require an indicator
  return apiIndicators.test(url);
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    capturedUrls[tabId] = {
      live: new Set(),
      discovered: new Set(),
      processedScripts: new Set()
    };
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  delete capturedUrls[tabId];
});
