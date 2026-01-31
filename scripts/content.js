// Backstage Play - Background video playback for YouTube
(function() {
  'use strict';

  // ========== 1. VISIBILITY API SPOOFING ==========
  const alwaysVisible = { get: () => 'visible', configurable: true };
  const alwaysFalse = { get: () => false, configurable: true };

  Object.defineProperty(document, 'visibilityState', alwaysVisible);
  Object.defineProperty(document, 'webkitVisibilityState', alwaysVisible);
  Object.defineProperty(document, 'hidden', alwaysFalse);
  Object.defineProperty(document, 'webkitHidden', alwaysFalse);

  // ========== 2. BLOCK VISIBILITY EVENTS ==========
  const blockEvent = (e) => {
    e.stopImmediatePropagation();
    e.preventDefault();
    return false;
  };

  // Capture phase to block before YouTube sees them
  ['visibilitychange', 'webkitvisibilitychange', 'blur', 'pagehide', 'freeze', 'resume'].forEach(evt => {
    window.addEventListener(evt, blockEvent, true);
    document.addEventListener(evt, blockEvent, true);
  });

  // ========== 3. BLOCK NEW EVENT LISTENERS ==========
  const blockedEvents = new Set([
    'visibilitychange', 'webkitvisibilitychange', 'pagehide', 'freeze', 'resume'
  ]);
  
  const originalAddEventListener = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function(type, listener, options) {
    if (blockedEvents.has(type)) return;
    return originalAddEventListener.call(this, type, listener, options);
  };

  // ========== 4. PREVENT VIDEO PAUSE ==========
  const originalPause = HTMLMediaElement.prototype.pause;
  let lastUserAction = 0;
  
  // Track user interactions
  ['click', 'touchstart', 'touchend', 'keydown'].forEach(evt => {
    document.addEventListener(evt, () => { lastUserAction = Date.now(); }, true);
  });

  HTMLMediaElement.prototype.pause = function() {
    const timeSinceAction = Date.now() - lastUserAction;
    // Only allow pause within 1 second of user action
    if (timeSinceAction < 1000) {
      return originalPause.call(this);
    }
    // Block automatic pauses - do nothing
    return undefined;
  };

  // ========== 5. AUTO-RESUME ON PAUSE ==========
  // If video gets paused without user action, resume it
  const observer = new MutationObserver(() => {
    const videos = document.querySelectorAll('video');
    videos.forEach(video => {
      if (!video._backstagePatched) {
        video._backstagePatched = true;
        video.addEventListener('pause', () => {
          const timeSinceAction = Date.now() - lastUserAction;
          if (timeSinceAction > 1000 && !video.ended) {
            // Auto-resume after a tiny delay
            setTimeout(() => {
              if (video.paused && !video.ended) {
                video.play().catch(() => {});
              }
            }, 100);
          }
        });
      }
    });
  });
  observer.observe(document, { childList: true, subtree: true });

  // ========== 6. MEDIA SESSION KEEP-ALIVE ==========
  if ('mediaSession' in navigator) {
    try {
      navigator.mediaSession.setActionHandler('pause', () => {});
      navigator.mediaSession.setActionHandler('play', () => {
        document.querySelectorAll('video').forEach(v => v.play().catch(() => {}));
      });
    } catch (e) {}
  }

  // ========== 7. BLOCK PAGE LIFECYCLE API ==========
  // YouTube may use this for mobile background detection
  if ('onfreeze' in document) {
    document.onfreeze = null;
    Object.defineProperty(document, 'onfreeze', { 
      get: () => null, 
      set: () => {}, 
      configurable: true 
    });
  }

  // ========== 8. SPOOF FOCUS STATE ==========
  Object.defineProperty(document, 'hasFocus', {
    value: () => true,
    writable: false,
    configurable: true
  });

  // ========== 9. INTERCEPT FETCH/XHR FOR SUSPEND SIGNALS ==========
  // Block YouTube from reporting "suspend" state
  const originalFetch = window.fetch;
  window.fetch = function(url, options) {
    if (typeof url === 'string' && url.includes('suspend')) {
      // Don't block the request, just continue
    }
    return originalFetch.apply(this, arguments);
  };

})();