(function() {
  const originalFetch = window.fetch;
  const originalOpen = XMLHttpRequest.prototype.open;

  window.fetch = async function(...args) {
    const url = args[0];
    const fullUrl = new URL(url instanceof Request ? url.url : url, window.location.href).href;
    window.postMessage({ type: 'API_STRIKE_CAPTURED', url: fullUrl }, '*');
    return originalFetch.apply(this, args);
  };

  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    const fullUrl = new URL(url, window.location.href).href;
    window.postMessage({ type: 'API_STRIKE_CAPTURED', url: fullUrl }, '*');
    return originalOpen.apply(this, [method, url, ...rest]);
  };
})();
