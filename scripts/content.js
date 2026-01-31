// Backstage Play - Background video playback for YouTube
(function() {
  'use strict';

  // 1. Override ALL visibility properties (including webkit prefixes)
  const alwaysVisible = { get: () => 'visible', configurable: true };
  const alwaysFalse = { get: () => false, configurable: true };

  Object.defineProperty(document, 'visibilityState', alwaysVisible);
  Object.defineProperty(document, 'webkitVisibilityState', alwaysVisible);
  Object.defineProperty(document, 'hidden', alwaysFalse);
  Object.defineProperty(document, 'webkitHidden', alwaysFalse);

  // 2. Block ALL visibility-related events from reaching YouTube
  const blockEvent = (e) => {
    e.stopImmediatePropagation();
    e.preventDefault();
    return false;
  };

  window.addEventListener('visibilitychange', blockEvent, true);
  window.addEventListener('webkitvisibilitychange', blockEvent, true);
  document.addEventListener('visibilitychange', blockEvent, true);
  document.addEventListener('webkitvisibilitychange', blockEvent, true);
  
  // 3. Block blur/focus events (YouTube sometimes uses these too)
  window.addEventListener('blur', blockEvent, true);
  window.addEventListener('pagehide', blockEvent, true);

  // 4. Prevent YouTube from adding its own visibility listeners
  const originalAddEventListener = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function(type, listener, options) {
    const blockedEvents = ['visibilitychange', 'webkitvisibilitychange', 'pagehide'];
    if (blockedEvents.includes(type)) {
      return; // Silently ignore
    }
    return originalAddEventListener.call(this, type, listener, options);
  };

  // 5. Keep Media Session active (prevents notification controls disappearing)
  if ('mediaSession' in navigator) {
    const noop = () => {};
    try {
      navigator.mediaSession.setActionHandler('pause', noop);
      navigator.mediaSession.setActionHandler('play', noop);
    } catch (e) {}
  }

  // 6. Prevent video.pause() from being called when hidden
  const originalPause = HTMLMediaElement.prototype.pause;
  let userInitiated = true;
  
  document.addEventListener('click', () => { userInitiated = true; }, true);
  document.addEventListener('touchstart', () => { userInitiated = true; }, true);
  
  HTMLMediaElement.prototype.pause = function() {
    // Only allow pause if user clicked something recently
    if (userInitiated) {
      userInitiated = false;
      return originalPause.call(this);
    }
    // Block automatic pauses (from visibility change)
    return undefined;
  };

})();