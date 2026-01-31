// Backstage Play - Background video playback for YouTube
(function() {
  'use strict';

  const pageScript = function() {
    const log = (...args) => console.log('[Backstage]', ...args);
    log('🚀 Initializing at', new Date().toISOString());

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
      try { Object.defineProperty(target, prop, desc); log('✅ Spoofed', prop); } catch (e) { log('❌ Failed', prop, e.message); }
    });

    // Block visibility events
    const blockedEventTypes = ['visibilitychange', 'webkitvisibilitychange', 'blur', 'pagehide', 'freeze', 'resume'];
    const blockHandler = (e) => { log('🛑 Blocked event:', e.type); e.stopImmediatePropagation(); e.preventDefault(); };
    blockedEventTypes.forEach(type => {
      window.addEventListener(type, blockHandler, true);
      document.addEventListener(type, blockHandler, true);
    });

    // Block addEventListener for visibility events
    const blockedSet = new Set(blockedEventTypes);
    const origProtoAdd = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function(type, listener, options) {
      if (blockedSet.has(type)) { log('🚫 Blocked addEventListener:', type); return; }
      return origProtoAdd.call(this, type, listener, options);
    };

    // State tracking
    let lastUserAction = 0;
    let userIntentionallyPaused = false;
    let mediaSessionAction = false;  // Flag for MediaSession-triggered actions
    
    // Track user interactions on page
    ['click', 'touchstart', 'touchend', 'keydown', 'pointerdown', 'mousedown'].forEach(type => {
      window.addEventListener(type, () => { 
        lastUserAction = Date.now(); 
        log('👆 User action:', type);
      }, true);
    });

    // Intercept MediaSession.setActionHandler to wrap YouTube's handlers
    if ('mediaSession' in navigator) {
      const origSetActionHandler = navigator.mediaSession.setActionHandler.bind(navigator.mediaSession);
      navigator.mediaSession.setActionHandler = function(action, handler) {
        log('🎵 MediaSession.setActionHandler called for:', action);
        
        if (action === 'pause' || action === 'stop') {
          // Wrap pause/stop handlers to set our flag
          const wrappedHandler = handler ? function(...args) {
            log('📱 MediaSession', action, 'triggered by notification');
            mediaSessionAction = true;
            lastUserAction = Date.now();
            userIntentionallyPaused = true;
            const result = handler.apply(this, args);
            setTimeout(() => { mediaSessionAction = false; }, 1000);
            return result;
          } : null;
          return origSetActionHandler(action, wrappedHandler);
        } else if (action === 'play') {
          // Wrap play handler to clear our flag
          const wrappedHandler = handler ? function(...args) {
            log('📱 MediaSession play triggered by notification');
            mediaSessionAction = true;
            lastUserAction = Date.now();
            userIntentionallyPaused = false;
            const result = handler.apply(this, args);
            setTimeout(() => { mediaSessionAction = false; }, 1000);
            return result;
          } : null;
          return origSetActionHandler(action, wrappedHandler);
        }
        return origSetActionHandler(action, handler);
      };
      log('✅ MediaSession.setActionHandler intercepted');
    }

    // Intercept video pause - only allow if user action or MediaSession
    const origPause = HTMLMediaElement.prototype.pause;
    HTMLMediaElement.prototype.pause = function() {
      const timeSince = Date.now() - lastUserAction;
      log('⏸️ pause() called, timeSince:', timeSince, 'mediaSessionAction:', mediaSessionAction, 'userIntentionallyPaused:', userIntentionallyPaused);
      
      if (timeSince < 2000 || mediaSessionAction) {
        log('✅ Allowing pause');
        userIntentionallyPaused = true;
        return origPause.call(this);
      }
      log('🛑 Blocking pause');
      // Don't call original - block the pause
    };

    // Watch videos for pause/play events
    const patchVideo = (video) => {
      if (video._backstage) return;
      video._backstage = true;
      log('🎬 Patching video element');
      
      video.addEventListener('pause', () => {
        log('⏸️ Video pause event, userIntentionallyPaused:', userIntentionallyPaused, 'ended:', video.ended);
        
        if (!userIntentionallyPaused && !video.ended) {
          log('🔄 Unexpected pause, scheduling resume...');
          setTimeout(() => {
            if (video.paused && !video.ended && !userIntentionallyPaused) {
              log('▶️ Resuming video');
              video.play().catch(e => log('❌ Resume failed:', e.message));
            }
          }, 100);
        }
      });
      
      video.addEventListener('play', () => {
        log('▶️ Video play event');
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
      origAudioContext.prototype.suspend = function() { 
        log('🔇 Blocking AudioContext.suspend');
        return Promise.resolve(); 
      };
    }

    // Block Page Lifecycle API
    if ('onfreeze' in document) {
      Object.defineProperty(document, 'onfreeze', { get: () => null, set: () => {}, configurable: true });
      Object.defineProperty(document, 'onresume', { get: () => null, set: () => {}, configurable: true });
    }

    // Periodic check - resume if paused unexpectedly
    setInterval(() => {
      document.querySelectorAll('video').forEach((v, i) => {
        log(`📊 Video ${i}: paused=${v.paused}, time=${v.currentTime.toFixed(1)}, userIntentionallyPaused=${userIntentionallyPaused}`);
        if (v.paused && !v.ended && v.currentTime > 0 && !userIntentionallyPaused) {
          log('🔄 Force resuming video', i);
          v.play().catch(e => log('❌ Force resume failed:', e.message));
        }
      });
    }, 3000);
    
    log('🏁 Initialization complete');
  };

  // Inject into page context
  const script = document.createElement('script');
  script.textContent = '(' + pageScript.toString() + ')();';
  (document.head || document.documentElement).appendChild(script);
  script.remove();
})();