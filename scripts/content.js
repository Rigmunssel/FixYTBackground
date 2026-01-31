// Backstage Play - Background video playback for YouTube
(function() {
  'use strict';

  // Spoof Visibility API
  const props = {
    visibilityState: { get: () => 'visible', configurable: true },
    webkitVisibilityState: { get: () => 'visible', configurable: true },
    hidden: { get: () => false, configurable: true },
    webkitHidden: { get: () => false, configurable: true }
  };
  Object.keys(props).forEach(p => {
    try { Object.defineProperty(document, p, props[p]); } catch (e) {}
  });

  // Block visibility events
  const blockEvent = (e) => { e.stopImmediatePropagation(); e.preventDefault(); };
  ['visibilitychange', 'webkitvisibilitychange', 'blur', 'pagehide', 'freeze', 'resume'].forEach(evt => {
    window.addEventListener(evt, blockEvent, true);
    document.addEventListener(evt, blockEvent, true);
  });

  // Block scripts from adding visibility listeners
  const blockedEvents = new Set(['visibilitychange', 'webkitvisibilitychange', 'pagehide', 'freeze', 'resume']);
  const origAddEventListener = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function(type, listener, options) {
    if (blockedEvents.has(type)) return;
    return origAddEventListener.call(this, type, listener, options);
  };

  // Prevent automatic pause
  const originalPause = HTMLMediaElement.prototype.pause;
  let lastUserAction = 0;
  ['click', 'touchstart', 'touchend', 'keydown'].forEach(evt => {
    document.addEventListener(evt, () => { lastUserAction = Date.now(); }, true);
  });
  HTMLMediaElement.prototype.pause = function() {
    if (Date.now() - lastUserAction < 1000) return originalPause.call(this);
  };

  // Auto-resume on unexpected pause
  const observer = new MutationObserver(() => {
    document.querySelectorAll('video').forEach(video => {
      if (video._backstagePatched) return;
      video._backstagePatched = true;
      video.addEventListener('pause', () => {
        if (Date.now() - lastUserAction > 1000 && !video.ended) {
          setTimeout(() => {
            if (video.paused && !video.ended) video.play().catch(() => {});
          }, 100);
        }
      });
    });
  });
  observer.observe(document, { childList: true, subtree: true });

  // MediaSession handlers
  if ('mediaSession' in navigator) {
    try {
      navigator.mediaSession.setActionHandler('pause', () => {});
      navigator.mediaSession.setActionHandler('play', () => {
        document.querySelectorAll('video').forEach(v => v.play().catch(() => {}));
      });
    } catch (e) {}
  }

  // Block Page Lifecycle API
  if ('onfreeze' in document) {
    Object.defineProperty(document, 'onfreeze', { get: () => null, set: () => {}, configurable: true });
  }

  // Spoof focus state
  Object.defineProperty(document, 'hasFocus', { value: () => true, configurable: true });

  // Periodic resume check
  setInterval(() => {
    document.querySelectorAll('video').forEach(video => {
      if (video.paused && !video.ended && video.currentTime > 0 && Date.now() - lastUserAction > 2000) {
        video.play().catch(() => {});
      }
    });
  }, 5000);

})();