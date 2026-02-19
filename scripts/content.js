/**
 * Backstage Play v1.3.0
 * Copyright (C) 2026 Rigmunssel
 * Licensed under GNU General Public License v3.0
 * Repository: github.com/Rigmunssel/FixYTBackground
 */
"use strict";

(() => {
  const origHiddenDesc = Object.getOwnPropertyDescriptor(Document.prototype, "hidden");
  const origAddEvent = EventTarget.prototype.addEventListener;
  const origPause = HTMLMediaElement.prototype.pause;

  const BLOCKED = new Set(["visibilitychange", "blur", "pagehide", "freeze"]);
  const KEEPALIVE_MIN = 30000;
  const KEEPALIVE_MAX = 60000;
  const PREPAUSE_DELAY = 40;
  const PREPAUSE_BURST = 3;
  const PREPAUSE_SPACING = 80;
  const RESUME_INTERVAL = 3000;
  const USER_ACTION_WINDOW = 2000;
  const ADVANCE_CHECK_INTERVAL = 3000;
  const ADVANCE_RETRY_DELAY = 6000;

  let loopTimer = null;
  let lastRealHidden = null;
  let userPaused = false;
  let lastUserAction = 0;

  const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

  const getRealHidden = () => {
    try { return !!origHiddenDesc.get.call(document); } catch { return false; }
  };

  const findVideo = (playingOnly) => {
    for (const v of document.querySelectorAll("video")) {
      if (v.ended || v.readyState < 2) continue;
      if (!playingOnly || !v.paused) return v;
    }
    return null;
  };

  // ── Visibility spoofing ────────────────────────────────────────
  Object.defineProperty(Document.prototype, "hidden", {
    configurable: true, enumerable: true, get: () => false,
  });
  Object.defineProperty(Document.prototype, "visibilityState", {
    configurable: true, enumerable: true, get: () => "visible",
  });

  // ── Block visibility events ────────────────────────────────────
  EventTarget.prototype.addEventListener = function (type, fn, opt) {
    if (BLOCKED.has(type)) return;
    return origAddEvent.call(this, type, fn, opt);
  };

  for (const ev of BLOCKED) {
    const stop = (e) => { e.stopImmediatePropagation(); e.preventDefault(); };
    window.addEventListener(ev, stop, true);
    document.addEventListener(ev, stop, true);
  }

  // ── Pause interception ─────────────────────────────────────────
  ["click", "touchstart", "touchend", "keydown", "pointerdown"].forEach((e) => {
    window.addEventListener(e, () => { lastUserAction = Date.now(); }, true);
  });

  let origSet = null;

  // ── Media session: playbackState & positionState management ────
  const syncPlaybackState = () => {
    if (!("mediaSession" in navigator)) return;
    const v = findVideo(false);
    if (!v) return;
    const desired = v.paused ? "paused" : "playing";
    if (navigator.mediaSession.playbackState !== desired) {
      navigator.mediaSession.playbackState = desired;
    }
    if (!v.paused && isFinite(v.duration) && v.duration > 0) {
      try {
        navigator.mediaSession.setPositionState({
          duration: v.duration,
          playbackRate: v.playbackRate || 1,
          position: Math.min(v.currentTime, v.duration),
        });
      } catch {}
    }
  };

  if ("mediaSession" in navigator) {
    origSet = navigator.mediaSession.setActionHandler.bind(navigator.mediaSession);

    navigator.mediaSession.setActionHandler = function (action, handler) {
      if (!handler) return origSet(action, handler);
      if (action === "pause" || action === "stop") {
        return origSet(action, (...a) => { lastUserAction = Date.now(); userPaused = true; handler(...a); });
      }
      if (action === "play") {
        return origSet(action, (...a) => { lastUserAction = Date.now(); userPaused = false; handler(...a); });
      }
      return origSet(action, handler);
    };
  }

  HTMLMediaElement.prototype.pause = function () {
    if (Date.now() - lastUserAction < USER_ACTION_WINDOW) {
      userPaused = true;
      return origPause.call(this);
    }
  };

  new MutationObserver(() => {
    for (const v of document.querySelectorAll("video")) {
      if (v._bp) continue;
      v._bp = true;
      v.addEventListener("play", () => { userPaused = false; });
    }
  }).observe(document, { childList: true, subtree: true });

  // ── Media session: keep playbackState in sync ─────────────────
  setInterval(syncPlaybackState, 5000);

  new MutationObserver(() => {
    for (const v of document.querySelectorAll("video")) {
      if (v._bpSync) continue;
      v._bpSync = true;
      origAddEvent.call(v, "play", syncPlaybackState);
      origAddEvent.call(v, "pause", syncPlaybackState);
      origAddEvent.call(v, "timeupdate", () => {
        const now = Date.now();
        if (!v._bpLastPos || now - v._bpLastPos > 10000) {
          v._bpLastPos = now;
          syncPlaybackState();
        }
      });
    }
  }).observe(document, { childList: true, subtree: true });

  // ── Keep-alive: synthetic events to prevent idle detection ─────
  const ping = () => {
    const t = findVideo(true) || findVideo(false) || document;
    if (Math.random() > 0.5) {
      const k = [
        { code: "ShiftLeft", key: "Shift", kc: 16 },
        { code: "ControlLeft", key: "Control", kc: 17 },
        { code: "AltLeft", key: "Alt", kc: 18 },
      ][rand(0, 2)];
      const init = { bubbles: true, cancelable: true, key: k.key, code: k.code, keyCode: k.kc, which: k.kc };
      t.dispatchEvent(new KeyboardEvent("keydown", init));
      setTimeout(() => t.dispatchEvent(new KeyboardEvent("keyup", init)), 50);
    } else {
      try {
        t.dispatchEvent(new PointerEvent("pointermove", {
          bubbles: true, pointerType: "mouse",
          clientX: Math.random() * 100, clientY: Math.random() * 100,
        }));
      } catch {
        t.dispatchEvent(new MouseEvent("mousemove", {
          bubbles: true, clientX: Math.random() * 100, clientY: Math.random() * 100,
        }));
      }
    }
  };

  const tick = () => {
    try {
      if (getRealHidden() && findVideo(false)) ping();
    } catch {}
    loopTimer = setTimeout(tick, rand(KEEPALIVE_MIN, KEEPALIVE_MAX));
  };

  const startLoop = () => { clearTimeout(loopTimer); loopTimer = setTimeout(tick, rand(KEEPALIVE_MIN, KEEPALIVE_MAX)); };

  // ── Pre-pause kick: burst when tab hides ───────────────────────
  origAddEvent.call(document, "visibilitychange", () => {
    const hidden = getRealHidden();
    if (hidden && lastRealHidden === false) {
      setTimeout(() => {
        try {
          if (!getRealHidden()) return;
          for (let i = 0; i < PREPAUSE_BURST; i++) {
            setTimeout(() => { try { if (getRealHidden()) ping(); } catch {} }, i * PREPAUSE_SPACING);
          }
        } catch {}
      }, PREPAUSE_DELAY);
    }
    lastRealHidden = hidden;
  }, true);

  // ── Force resume ───────────────────────────────────────────────
  setInterval(() => {
    for (const v of document.querySelectorAll("video")) {
      if (v.paused && !v.ended && v.currentTime > 0 && !userPaused) v.play().catch(() => {});
    }
  }, RESUME_INTERVAL);

  // ── Auto-advance: click next video when current one ends ───────
  const TAG = "[BackstagePlay]";
  const ts = () => new Date().toTimeString().slice(0, 8);
  const getVideoId = () => {
    try { return new URL(location.href).searchParams.get("v"); } catch { return null; }
  };

  const findNextClickTarget = () => {
    // 1. Mobile playlist: next item after the selected one
    const mSel = document.querySelector(
      'ytm-playlist-panel-video-renderer[aria-selected="true"]'
    );
    if (mSel?.nextElementSibling) {
      const link = mSel.nextElementSibling.querySelector("a[href]");
      if (link) return { el: link, src: "playlist-next" };
    }

    // 2. Desktop playlist: next item after the selected one
    const dSel = document.querySelector(
      "ytd-playlist-panel-video-renderer[selected]"
    );
    if (dSel?.nextElementSibling) {
      const link = dSel.nextElementSibling.querySelector("a[href]");
      if (link) return { el: link, src: "playlist-next" };
    }

    // 3. Mobile player next button (second of the prev/next pair)
    const mBtns = document.querySelectorAll(
      "button.player-middle-controls-prev-next-button"
    );
    if (mBtns.length >= 2) return { el: mBtns[mBtns.length - 1], src: "player-next-btn" };

    // 4. Desktop player next button
    const dNext = document.querySelector("a.ytp-next-button, button.ytp-next-button");
    if (dNext) return { el: dNext, src: "player-next-btn" };

    return null;
  };

  let advAttempt = 0;   // timestamp of first advance attempt (0 = idle)
  let advFromId = "";    // video ID when advance was triggered

  setInterval(() => {
    if (!getRealHidden()) return;

    const vid = document.querySelector("video");
    if (!vid) return;
    const curId = getVideoId();

    // Detect successful advance: video ID changed since our attempt
    if (advAttempt && curId && curId !== advFromId) {
      console.log(`${TAG} ${ts()} Advanced to ${curId} (${Date.now() - advAttempt}ms)`);
      advAttempt = 0;
      advFromId = "";
      return;
    }

    // Video ended and not user-paused → try to advance
    if (vid.ended && !userPaused) {
      const target = findNextClickTarget();
      if (!target) return;

      if (!advAttempt) {
        // First attempt
        advFromId = curId;
        advAttempt = Date.now();
        console.log(`${TAG} ${ts()} Video ended, advancing via ${target.src}`);
        target.el.click();
      } else if (Date.now() - advAttempt > ADVANCE_RETRY_DELAY) {
        // Retry — previous click didn't result in navigation
        console.log(`${TAG} ${ts()} Retrying advance via ${target.src}`);
        advAttempt = Date.now();
        target.el.click();
      }
    }
  }, ADVANCE_CHECK_INTERVAL);

  // ── Boot ───────────────────────────────────────────────────────
  startLoop();
  window.addEventListener("pagehide", () => clearTimeout(loopTimer));
})();
