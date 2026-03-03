// 1. Inject interceptor for live capturing
const script = document.createElement('script');
script.src = chrome.runtime.getURL('interceptor.js');
script.onload = function() {
  this.remove();
};
(document.head || document.documentElement).appendChild(script);

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.data.type === 'API_STRIKE_CAPTURED') {
    chrome.runtime.sendMessage({ type: 'NEW_URL', url: event.data.url });
  }
});

// 2. Discover all scripts (External and Inline)
function scanScripts() {
  // External scripts
  document.querySelectorAll('script[src]').forEach(s => {
    if (s.src) {
      chrome.runtime.sendMessage({ type: 'DISCOVER_SCRIPT', url: s.src });
    }
  });

  // Inline scripts
  document.querySelectorAll('script:not([src])').forEach(s => {
    if (s.textContent.length > 20) {
      chrome.runtime.sendMessage({ type: 'DISCOVER_INLINE', content: s.textContent });
    }
  });
}

// 3. Scan main page content as well
function scanDOM() {
  // Some frameworks store API endpoints in attributes or variables
  // Let's send the whole body for parsing if it's not too large
  const bodyText = document.body ? document.body.innerHTML : '';
  if (bodyText.length > 0 && bodyText.length < 1000000) {
     chrome.runtime.sendMessage({ type: 'DISCOVER_INLINE', content: bodyText });
  }
}

// Run scans
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    scanScripts();
    scanDOM();
  });
} else {
  scanScripts();
  scanDOM();
}

// 4. Monitor for updates
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((node) => {
      if (node.tagName === 'SCRIPT') {
        if (node.src) {
          chrome.runtime.sendMessage({ type: 'DISCOVER_SCRIPT', url: node.src });
        } else {
          chrome.runtime.sendMessage({ type: 'DISCOVER_INLINE', content: node.textContent });
        }
      } else if (node.querySelectorAll) {
        node.querySelectorAll('script').forEach(s => {
          if (s.src) {
            chrome.runtime.sendMessage({ type: 'DISCOVER_SCRIPT', url: s.src });
          } else {
            chrome.runtime.sendMessage({ type: 'DISCOVER_INLINE', content: s.textContent });
          }
        });
      }
    });
  });
});

observer.observe(document.documentElement, {
  childList: true,
  subtree: true
});
