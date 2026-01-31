// Backstage Play - Background video playback for YouTube
(function() {
  'use strict';

  const pageScript = function() {
    // Spoof Visibility API
    const spoofProps = [
      [Document.prototype, 'hidden', { get: () => false, configurable: true }],
      [Document.prototype, 'visibilityState', { get: () => 'visible', configurable: true }],
      [Document.prototype, 'webkitHidden', { get: () => false, configurable: true }],
      [Document.prototype, 'webkitVisibilityState', { get: () => 'visible', configurable: true }],
      [document, 'hidden', { get: () => false, configurable: true }],
      [document, 'visibilityState', { get: () => 'visible', configurable: true }],
    ];
    spoofProps.forEach(([target, prop, desc]) => {
      try { Object.defineProperty(target, prop, desc); } catch (e) {}
    });

    // Block visibility events
    const blockedEventTypes = ['visibilitychange', 'webkitvisibilitychange', 'blur', 'pagehide', 'freeze', 'resume'];
    const blockHandler = (e) => { e.stopImmediatePropagation(); e.preventDefault(); };
    blockedEventTypes.forEach(type => {
      window.addEventListener(type, blockHandler, true);
      document.addEventListener(type, blockHandler, true);
    });

    // Block addEventListener for visibility events
    const blockedSet = new Set(blockedEventTypes);
    const origProtoAdd = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function(type, listener, options) {
      if (blockedSet.has(type)) return;
      return origProtoAdd.call(this, type, listener, options);
    };

    // State tracking
    let lastUserAction = 0;
    let pauseAllowedAt = 0;  // Timestamp when we allowed a pause through
    let userIntentionallyPaused = false;
    
    // Track user interactions
    ['click', 'touchstart', 'touchend', 'keydown', 'pointerdown', 'mousedown'].forEach(type => {
      window.addEventListener(type, () => { lastUserAction = Date.now(); }, true);
    });

    // Intercept video pause - only allow if recent user action
    const origPause = HTMLMediaElement.prototype.pause;
    HTMLMediaElement.prototype.pause = function() {
      const timeSince = Date.now() - lastUserAction;
      if (timeSince < 2000) {
        pauseAllowedAt = Date.now();
        return origPause.call(this);
      }
      // Block automatic pause
    };

    // Watch videos for pause/play events
    const patchVideo = (video) => {
      if (video._backstage) return;
      video._backstage = true;
      
      video.addEventListener('pause', () => {
        // If pause happened right after we allowed it, user intended to pause
        if (Date.now() - pauseAllowedAt < 500) {
          userIntentionallyPaused = true;
        } else if (!video.ended) {
          // Unexpected pause (e.g., YouTube found another way) - resume
          setTimeout(() => {
            if (video.paused && !video.ended && !userIntentionallyPaused) {
              video.play().catch(() => {});
            }
          }, 100);
        }
      });
      
      video.addEventListener('play', () => {
        userIntentionallyPaused = false;
      });
    };
    
    new MutationObserver(() => {
      document.querySelectorAll('video').forEach(patchVideo);
    }).observe(document, { childList: true, subtree: true });

    // Spoof focus
    Object.defineProperty(document, 'hasFocus', { value: () => true, configurable: true });

    // Block AudioContext suspend
    const origAudioContext = window.AudioContext || window.webkitAudioContext;
    if (origAudioContext) {
      origAudioContext.prototype.suspend = function() { return Promise.resolve(); };
    }

    // Block Page Lifecycle API
    if ('onfreeze' in document) {
      Object.defineProperty(document, 'onfreeze', { get: () => null, set: () => {}, configurable: true });
      Object.defineProperty(document, 'onresume', { get: () => null, set: () => {}, configurable: true });
    }

    // Periodic check - resume if paused unexpectedly
    setInterval(() => {
      document.querySelectorAll('video').forEach(v => {
        if (v.paused && !v.ended && v.currentTime > 0 && !userIntentionallyPaused) {
          v.play().catch(() => {});
        }
      });
    }, 3000);
  };

  // Inject into page context
  const script = document.createElement('script');
  script.textContent = '(' + pageScript.toString() + ')();';
  (document.head || document.documentElement).appendChild(script);
  script.remove();
})();