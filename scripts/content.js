/**
 * Backstage Play v1.0.4
 * Copyright (C) 2026 Rigmunssel
 * Licensed under GNU General Public License v3.0
 * Repository: github.com/Rigmunssel/FixYTBackground
 */
(function() {
  'use strict';

  const pageScript = function() {
    // 1. Spoof Visibility API
    [Document.prototype, document].forEach(target => {
      Object.defineProperty(target, 'hidden', { get: () => false, configurable: true });
      Object.defineProperty(target, 'visibilityState', { get: () => 'visible', configurable: true });
    });

    // 2. Block visibility event listeners
    const blocked = new Set(['visibilitychange', 'blur', 'pagehide', 'freeze']);
    const origAdd = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function(type, fn, opt) {
      if (blocked.has(type)) return;
      return origAdd.call(this, type, fn, opt);
    };
    blocked.forEach(e => {
      window.addEventListener(e, ev => ev.stopImmediatePropagation(), true);
      document.addEventListener(e, ev => ev.stopImmediatePropagation(), true);
    });

    // 3. Intercept pause - allow only user-initiated
    let lastAction = 0, userPaused = false;
    ['click', 'touchstart', 'touchend', 'keydown', 'pointerdown'].forEach(e => {
      window.addEventListener(e, () => { lastAction = Date.now(); }, true);
    });

    // Wrap MediaSession to detect notification controls
    if ('mediaSession' in navigator) {
      const orig = navigator.mediaSession.setActionHandler.bind(navigator.mediaSession);
      navigator.mediaSession.setActionHandler = function(action, handler) {
        if (!handler) return orig(action, handler);
        if (action === 'pause' || action === 'stop') {
          return orig(action, (...a) => { lastAction = Date.now(); userPaused = true; handler(...a); });
        }
        if (action === 'play') {
          return orig(action, (...a) => { lastAction = Date.now(); userPaused = false; handler(...a); });
        }
        return orig(action, handler);
      };
    }

    // Intercept pause()
    const origPause = HTMLMediaElement.prototype.pause;
    HTMLMediaElement.prototype.pause = function() {
      if (Date.now() - lastAction < 2000) { userPaused = true; return origPause.call(this); }
    };

    // Reset flag on play
    new MutationObserver(() => {
      document.querySelectorAll('video').forEach(v => {
        if (v._bp) return; v._bp = true;
        v.addEventListener('play', () => { userPaused = false; });
      });
    }).observe(document, { childList: true, subtree: true });

    // Fallback: force resume if paused unexpectedly
    setInterval(() => {
      document.querySelectorAll('video').forEach(v => {
        if (v.paused && !v.ended && v.currentTime > 0 && !userPaused) v.play().catch(() => {});
      });
    }, 3e3);const _=atob('QmFja3N0YWdlIFBsYXkgYnkgUmlnbXVuc3NlbCAtIGdpdGh1Yi5jb20vUmlnbXVuc3NlbC9GaXhZVEJhY2tncm91bmQ=');
  };

  // Inject into page context
  const s = document.createElement('script');
  s.textContent = '(' + pageScript.toString() + ')();';
  (document.head || document.documentElement).appendChild(s);
  s.remove();
})();