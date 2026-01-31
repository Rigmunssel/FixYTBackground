// Backstage Play - Background video playback for YouTube
// This script injects into the PAGE context (not content script sandbox)
(function() {
  'use strict';

  const log = (...args) => console.log('[Backstage]', ...args);
  log('🚀 Content script starting...');

  // ============================================================
  // INJECT INTO PAGE CONTEXT
  // Content scripts are isolated - YouTube can't see our overrides!
  // We must inject a <script> tag to run in the page's JS context
  // ============================================================
  
  const pageScript = function() {
    const log = (...args) => console.log('[Backstage:Page]', ...args);
    log('🎯 Page script injected at:', new Date().toISOString());
    log('📍 URL:', location.href);
    
    // Store original values for debugging
    const originalHidden = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
    const originalVisState = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState');
    log('📋 Original descriptors found:', !!originalHidden, !!originalVisState);

    // ========== 1. VISIBILITY API SPOOFING ==========
    const spoofProps = [
      ['Document.prototype', 'hidden', { get: () => false, configurable: true }],
      ['Document.prototype', 'visibilityState', { get: () => 'visible', configurable: true }],
      ['Document.prototype', 'webkitHidden', { get: () => false, configurable: true }],
      ['Document.prototype', 'webkitVisibilityState', { get: () => 'visible', configurable: true }],
      ['document', 'hidden', { get: () => false, configurable: true }],
      ['document', 'visibilityState', { get: () => 'visible', configurable: true }],
    ];
    
    spoofProps.forEach(([obj, prop, desc]) => {
      try {
        const target = obj === 'document' ? document : Document.prototype;
        Object.defineProperty(target, prop, desc);
        log('✅ Spoofed', obj + '.' + prop);
      } catch (e) {
        log('❌ Failed to spoof', obj + '.' + prop, e.message);
      }
    });

    // Verify spoofing
    log('📋 After spoof - document.hidden:', document.hidden);
    log('📋 After spoof - document.visibilityState:', document.visibilityState);

    // ========== 2. BLOCK VISIBILITY EVENTS ==========
    const blockedEventTypes = ['visibilitychange', 'webkitvisibilitychange', 'blur', 'pagehide', 'freeze', 'resume'];
    
    const blockHandler = (e) => {
      log('🛑 Blocking event:', e.type, 'target:', e.target === document ? 'document' : e.target === window ? 'window' : 'other');
      e.stopImmediatePropagation();
      e.preventDefault();
      return false;
    };
    
    blockedEventTypes.forEach(type => {
      window.addEventListener(type, blockHandler, true);
      document.addEventListener(type, blockHandler, true);
    });
    log('👂 Event blockers installed for:', blockedEventTypes.join(', '));

    // ========== 3. INTERCEPT addEventListener ==========
    const blockedSet = new Set(blockedEventTypes);
    const origWindowAdd = window.addEventListener.bind(window);
    const origDocAdd = document.addEventListener.bind(document);
    const origProtoAdd = EventTarget.prototype.addEventListener;

    EventTarget.prototype.addEventListener = function(type, listener, options) {
      if (blockedSet.has(type)) {
        log('🚫 Blocked addEventListener:', type, 'on', this === window ? 'window' : this === document ? 'document' : 'element');
        return;
      }
      return origProtoAdd.call(this, type, listener, options);
    };
    log('✅ addEventListener intercepted');

    // ========== 4. TRACK USER ACTIONS ==========
    let lastUserAction = 0;
    ['click', 'touchstart', 'touchend', 'keydown', 'pointerdown'].forEach(type => {
      document.addEventListener(type, () => {
        lastUserAction = Date.now();
        log('👆 User action:', type);
      }, true);
    });

    // ========== 5. INTERCEPT VIDEO PAUSE ==========
    const origPause = HTMLMediaElement.prototype.pause;
    HTMLMediaElement.prototype.pause = function() {
      const stack = new Error().stack;
      const timeSince = Date.now() - lastUserAction;
      log('⏸️ pause() called, timeSinceAction:', timeSince, 'ms');
      log('📚 Call stack:', stack?.split('\n').slice(1, 4).join(' <- '));
      
      if (timeSince < 1000) {
        log('✅ Allowing pause (user action)');
        return origPause.call(this);
      }
      log('🛑 BLOCKED pause (automatic)');
      return undefined;
    };

    // ========== 6. MONITOR VIDEOS ==========
    const patchVideo = (video) => {
      if (video._backstage) return;
      video._backstage = true;
      log('🎬 Patching video element');

      video.addEventListener('pause', (e) => {
        const timeSince = Date.now() - lastUserAction;
        log('⏸️ Video pause event, timeSinceAction:', timeSince, 'ended:', video.ended, 'currentTime:', video.currentTime.toFixed(2));
        
        if (timeSince > 1000 && !video.ended) {
          log('🔄 Scheduling auto-resume...');
          setTimeout(() => {
            if (video.paused && !video.ended) {
              log('▶️ Attempting resume...');
              video.play().then(() => log('✅ Resumed!')).catch(e => log('❌ Resume failed:', e.message));
            }
          }, 100);
        }
      });

      video.addEventListener('play', () => log('▶️ Video play event'));
      video.addEventListener('playing', () => log('▶️ Video playing event'));
      video.addEventListener('waiting', () => log('⏳ Video waiting event'));
      video.addEventListener('stalled', () => log('⚠️ Video stalled event'));
      video.addEventListener('suspend', () => log('⚠️ Video suspend event'));
      video.addEventListener('emptied', () => log('⚠️ Video emptied event'));
      video.addEventListener('abort', () => log('⚠️ Video abort event'));
      video.addEventListener('error', (e) => log('❌ Video error:', video.error?.message));
    };

    // Watch for videos
    new MutationObserver(() => {
      document.querySelectorAll('video').forEach(patchVideo);
    }).observe(document, { childList: true, subtree: true });
    document.querySelectorAll('video').forEach(patchVideo);

    // ========== 7. SPOOF FOCUS ==========
    Object.defineProperty(document, 'hasFocus', {
      value: () => { log('📞 hasFocus() called, returning true'); return true; },
      configurable: true
    });

    // ========== 8. INTERCEPT requestAnimationFrame ==========
    // YouTube might use RAF to detect background (RAF pauses when hidden)
    const origRAF = window.requestAnimationFrame;
    let rafRunning = true;
    let lastRAFTime = Date.now();
    
    window.requestAnimationFrame = function(callback) {
      const now = Date.now();
      const gap = now - lastRAFTime;
      if (gap > 1000) {
        log('⚠️ RAF gap detected:', gap, 'ms - possible background detection');
      }
      lastRAFTime = now;
      return origRAF.call(this, callback);
    };
    log('✅ requestAnimationFrame intercepted');

    // ========== 9. MONITOR AUDIO CONTEXT STATE ==========
    const origAudioContext = window.AudioContext || window.webkitAudioContext;
    if (origAudioContext) {
      const origResume = origAudioContext.prototype.resume;
      const origSuspend = origAudioContext.prototype.suspend;
      
      origAudioContext.prototype.suspend = function() {
        log('🔇 AudioContext.suspend() called - BLOCKING');
        return Promise.resolve();
      };
      
      origAudioContext.prototype.resume = function() {
        log('🔊 AudioContext.resume() called');
        return origResume.call(this);
      };
      log('✅ AudioContext intercepted');
    }

    // ========== 10. BLOCK PAGE LIFECYCLE API ==========
    if ('onfreeze' in document) {
      Object.defineProperty(document, 'onfreeze', { get: () => null, set: () => log('🛑 Blocked onfreeze'), configurable: true });
      Object.defineProperty(document, 'onresume', { get: () => null, set: () => log('🛑 Blocked onresume'), configurable: true });
    }

    // ========== 11. MEDIA SESSION ==========
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.setActionHandler('pause', () => {
          log('📱 MediaSession pause - ignoring');
        });
        navigator.mediaSession.setActionHandler('play', () => {
          log('📱 MediaSession play - resuming videos');
          document.querySelectorAll('video').forEach(v => v.play().catch(() => {}));
        });
        log('✅ MediaSession handlers set');
      } catch (e) {
        log('❌ MediaSession error:', e.message);
      }
    }

    // ========== 12. PERIODIC STATUS & FORCE RESUME ==========
    setInterval(() => {
      const videos = document.querySelectorAll('video');
      videos.forEach((v, i) => {
        log(`📊 [${i}] paused:${v.paused} time:${v.currentTime.toFixed(1)} ended:${v.ended} readyState:${v.readyState} networkState:${v.networkState}`);
        
        // Network states: 0=EMPTY, 1=IDLE, 2=LOADING, 3=NO_SOURCE
        // Ready states: 0=NOTHING, 1=METADATA, 2=CURRENT_DATA, 3=FUTURE_DATA, 4=ENOUGH_DATA
        
        if (v.paused && !v.ended && v.currentTime > 0) {
          const timeSince = Date.now() - lastUserAction;
          if (timeSince > 2000) {
            log('🔄 Force resuming video', i);
            v.play().catch(e => log('❌ Force resume failed:', e.message));
          }
        }
      });
    }, 3000);

    // ========== 13. CHECK WHAT YOUTUBE IS READING ==========
    // Trap property access to see what YouTube checks
    let accessLog = [];
    const logAccess = (prop) => {
      if (!accessLog.includes(prop)) {
        accessLog.push(prop);
        log('🔍 YouTube accessed:', prop);
      }
    };

    // Already spoofed but let's add logging
    try {
      const hiddenDesc = Object.getOwnPropertyDescriptor(document, 'hidden') || 
                         Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
      if (hiddenDesc) {
        Object.defineProperty(document, 'hidden', {
          get: () => { logAccess('document.hidden'); return false; },
          configurable: true
        });
      }
    } catch (e) {}

    log('🏁 Page script initialization complete');
  };

  // Inject the script into the page
  const script = document.createElement('script');
  script.textContent = '(' + pageScript.toString() + ')();';
  (document.head || document.documentElement).appendChild(script);
  script.remove();
  log('✅ Page script injected');

  // Also set up content script side monitoring
  log('📡 Content script monitoring active');
  
})();