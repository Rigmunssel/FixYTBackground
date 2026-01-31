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

    // Track user actions
    let lastUserAction = 0;
    let userWantsPause = false;
    ['click', 'touchstart', 'touchend', 'keydown', 'pointerdown', 'mousedown'].forEach(type => {
      window.addEventListener(type, (e) => {
        lastUserAction = Date.now();
        const target = e.target;
        if (target) {
          const isPlayerControl = 
            target.closest('.ytp-play-button') ||
            target.closest('.player-controls') ||
            target.closest('[class*="pause"]') ||
            target.closest('[class*="play"]') ||
            target.closest('button') ||
            target.tagName === 'VIDEO';
          if (isPlayerControl) {
            userWantsPause = true;
            setTimeout(() => { userWantsPause = false; }, 2000);
          }
        }
      }, true);
    });

    // Intercept video pause
    const origPause = HTMLMediaElement.prototype.pause;
    HTMLMediaElement.prototype.pause = function() {
      const timeSince = Date.now() - lastUserAction;
      if (timeSince < 2000 || userWantsPause) {
        userWantsPause = false;
        return origPause.call(this);
      }
    };

    // Auto-resume on unexpected pause
    const patchVideo = (video) => {
      if (video._backstage) return;
      video._backstage = true;
      video.addEventListener('pause', () => {
        if (Date.now() - lastUserAction > 1000 && !video.ended) {
          setTimeout(() => {
            if (video.paused && !video.ended) video.play().catch(() => {});
          }, 100);
        }
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

    // MediaSession handlers
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.setActionHandler('pause', () => {
          userWantsPause = true;
          lastUserAction = Date.now();
          document.querySelectorAll('video').forEach(v => origPause.call(v));
        });
        navigator.mediaSession.setActionHandler('play', () => {
          lastUserAction = Date.now();
          document.querySelectorAll('video').forEach(v => v.play().catch(() => {}));
        });
        navigator.mediaSession.setActionHandler('stop', () => {
          userWantsPause = true;
          lastUserAction = Date.now();
          document.querySelectorAll('video').forEach(v => origPause.call(v));
        });
      } catch (e) {}
    }

    // Periodic force resume
    setInterval(() => {
      document.querySelectorAll('video').forEach(v => {
        if (v.paused && !v.ended && v.currentTime > 0 && Date.now() - lastUserAction > 2000) {
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