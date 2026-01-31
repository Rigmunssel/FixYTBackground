// Backstage Play - Background video playback for YouTube
(function () {
  'use strict';

  // 1. Override visibility properties
  Object.defineProperty(document, 'visibilityState', { 
    value: 'visible', 
    writable: false,
    configurable: false 
  });
  Object.defineProperty(document, 'hidden', { 
    value: false, 
    writable: false,
    configurable: false 
  });

  // 2. Block visibilitychange events
  window.addEventListener('visibilitychange', (e) => {
    e.stopImmediatePropagation();
    e.preventDefault();
  }, true);

  // 3. Keep Media Session active
  if ('mediaSession' in navigator) {
    const noop = () => {};
    navigator.mediaSession.setActionHandler('pause', noop);
    navigator.mediaSession.setActionHandler('play', noop);
  }

  // 4. Block new visibility listeners
  const originalAddEventListener = document.addEventListener;
  document.addEventListener = function(type, listener, options) {
    if (type === 'visibilitychange') return;
    return originalAddEventListener.call(this, type, listener, options);
  };
})();
