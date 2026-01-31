/**
 * Backstage Play - Content Script
 * Prevents video playback interruption when switching tabs or apps.
 * Injected at document_start for maximum effectiveness.
 */

(function () {
  'use strict';

  // Override visibility properties to always report "visible"
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

  // Block visibilitychange events from reaching page scripts
  window.addEventListener('visibilitychange', function (event) {
    event.stopImmediatePropagation();
  }, true);

  // Prevent Media Session pause handler from being overwritten
  if ('mediaSession' in navigator) {
    const originalSetActionHandler = navigator.mediaSession.setActionHandler.bind(navigator.mediaSession);

    navigator.mediaSession.setActionHandler = function (action, handler) {
      if (action === 'pause') {
        // Ignore pause handlers to prevent background pause
        return;
      }
      originalSetActionHandler(action, handler);
    };
  }
})();
