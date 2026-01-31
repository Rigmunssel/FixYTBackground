// Backstage Play - Background video playback for YouTube
// DEBUG VERSION - Check browser console for logs
(function() {
  'use strict';
  
  const DEBUG = true;
  const log = (...args) => DEBUG && console.log('[Backstage]', ...args);
  
  log('🚀 Extension loaded at:', new Date().toISOString());
  log('📍 URL:', location.href);
  log('📋 Initial document.hidden:', document.hidden);
  log('📋 Initial document.visibilityState:', document.visibilityState);

  // ========== 1. VISIBILITY API SPOOFING ==========
  const alwaysVisible = { get: () => 'visible', configurable: true };
  const alwaysFalse = { get: () => false, configurable: true };

  try {
    Object.defineProperty(document, 'visibilityState', alwaysVisible);
    log('✅ Spoofed document.visibilityState');
  } catch (e) {
    log('❌ Failed to spoof visibilityState:', e.message);
  }

  try {
    Object.defineProperty(document, 'webkitVisibilityState', alwaysVisible);
    log('✅ Spoofed document.webkitVisibilityState');
  } catch (e) {
    log('❌ Failed to spoof webkitVisibilityState:', e.message);
  }

  try {
    Object.defineProperty(document, 'hidden', alwaysFalse);
    log('✅ Spoofed document.hidden');
  } catch (e) {
    log('❌ Failed to spoof hidden:', e.message);
  }

  try {
    Object.defineProperty(document, 'webkitHidden', alwaysFalse);
    log('✅ Spoofed document.webkitHidden');
  } catch (e) {
    log('❌ Failed to spoof webkitHidden:', e.message);
  }

  // Verify the spoofing worked
  log('📋 After spoof - document.hidden:', document.hidden);
  log('📋 After spoof - document.visibilityState:', document.visibilityState);

  // ========== 2. BLOCK VISIBILITY EVENTS ==========
  const blockEvent = (e) => {
    log('🛑 Blocked event:', e.type);
    e.stopImmediatePropagation();
    e.preventDefault();
    return false;
  };

  // Capture phase to block before YouTube sees them
  ['visibilitychange', 'webkitvisibilitychange', 'blur', 'pagehide', 'freeze', 'resume'].forEach(evt => {
    window.addEventListener(evt, blockEvent, true);
    document.addEventListener(evt, blockEvent, true);
    log('👂 Added blocker for:', evt);
  });

  // ========== 3. BLOCK NEW EVENT LISTENERS ==========
  const blockedEvents = new Set([
    'visibilitychange', 'webkitvisibilitychange', 'pagehide', 'freeze', 'resume'
  ]);
  
  const originalAddEventListener = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function(type, listener, options) {
    if (blockedEvents.has(type)) {
      log('🚫 Blocked addEventListener for:', type);
      return;
    }
    return originalAddEventListener.call(this, type, listener, options);
  };

  // ========== 4. PREVENT VIDEO PAUSE ==========
  const originalPause = HTMLMediaElement.prototype.pause;
  let lastUserAction = 0;
  
  // Track user interactions
  ['click', 'touchstart', 'touchend', 'keydown'].forEach(evt => {
    document.addEventListener(evt, () => { 
      lastUserAction = Date.now(); 
      log('👆 User action detected:', evt);
    }, true);
  });

  HTMLMediaElement.prototype.pause = function() {
    const timeSinceAction = Date.now() - lastUserAction;
    log('⏸️ pause() called, time since user action:', timeSinceAction, 'ms');
    
    if (timeSinceAction < 1000) {
      log('✅ Allowing pause (user initiated)');
      return originalPause.call(this);
    }
    log('🛑 Blocking automatic pause');
    return undefined;
  };

  // ========== 5. AUTO-RESUME ON PAUSE ==========
  const observer = new MutationObserver(() => {
    const videos = document.querySelectorAll('video');
    videos.forEach(video => {
      if (!video._backstagePatched) {
        video._backstagePatched = true;
        log('🎬 Patched video element');
        
        video.addEventListener('pause', () => {
          const timeSinceAction = Date.now() - lastUserAction;
          log('⏸️ Video paused event, time since action:', timeSinceAction, 'ms');
          log('📊 Video state - paused:', video.paused, 'ended:', video.ended);
          
          if (timeSinceAction > 1000 && !video.ended) {
            log('🔄 Auto-resuming in 100ms...');
            setTimeout(() => {
              if (video.paused && !video.ended) {
                log('▶️ Calling video.play()');
                video.play().then(() => {
                  log('✅ Video resumed successfully');
                }).catch((e) => {
                  log('❌ Failed to resume:', e.message);
                });
              }
            }, 100);
          }
        });
        
        video.addEventListener('play', () => {
          log('▶️ Video play event');
        });
      }
    });
  });
  observer.observe(document, { childList: true, subtree: true });

  // ========== 6. MEDIA SESSION KEEP-ALIVE ==========
  if ('mediaSession' in navigator) {
    try {
      navigator.mediaSession.setActionHandler('pause', () => {
        log('📱 MediaSession pause handler called - ignoring');
      });
      navigator.mediaSession.setActionHandler('play', () => {
        log('📱 MediaSession play handler called');
        document.querySelectorAll('video').forEach(v => v.play().catch(() => {}));
      });
      log('✅ MediaSession handlers set');
    } catch (e) {
      log('❌ MediaSession error:', e.message);
    }
  }

  // ========== 7. BLOCK PAGE LIFECYCLE API ==========
  if ('onfreeze' in document) {
    document.onfreeze = null;
    Object.defineProperty(document, 'onfreeze', { 
      get: () => null, 
      set: () => { log('🛑 Blocked onfreeze assignment'); }, 
      configurable: true 
    });
    log('✅ Blocked Page Lifecycle API');
  }

  // ========== 8. SPOOF FOCUS STATE ==========
  Object.defineProperty(document, 'hasFocus', {
    value: () => true,
    writable: false,
    configurable: true
  });
  log('✅ Spoofed document.hasFocus()');

  // ========== 9. PERIODIC STATUS CHECK ==========
  setInterval(() => {
    const videos = document.querySelectorAll('video');
    videos.forEach((video, i) => {
      log(`📊 Video ${i} status - paused: ${video.paused}, currentTime: ${video.currentTime.toFixed(2)}, ended: ${video.ended}`);
      
      // Force resume if paused unexpectedly
      if (video.paused && !video.ended && video.currentTime > 0) {
        const timeSinceAction = Date.now() - lastUserAction;
        if (timeSinceAction > 2000) {
          log('🔄 Periodic check: forcing resume');
          video.play().catch(e => log('❌ Periodic resume failed:', e.message));
        }
      }
    });
  }, 5000);

  log('🏁 Extension initialization complete');

})();