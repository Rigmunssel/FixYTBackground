/**
 * Backstage Play v1.4.0
 * Background YouTube playback with auto-advance.
 *
 * Design philosophy:
 *   We spoof visibility so YouTube thinks the tab is active.
 *   YouTube auto-advances playlists and "Up next" on its own.
 *   We enable a setTimeout bypass near the end so YouTube's SPA
 *   navigation isn't throttled.  We ONLY intervene if YouTube
 *   fails to advance after a few seconds (stuck recovery).
 *
 * Phase state machine:
 *   IDLE  → bypass OFF, normal playback
 *   WARM  → bypass ON, ≤5s remaining or video ended (YouTube working)
 *   NAV   → bypass ON, our advance triggered, waiting for loadstart
 *   LOAD  → bypass ON, new video loading, waiting for playing
 *
 * Copyright (C) 2026 Rigmunssel – GNU GPL v3.0
 * github.com/Rigmunssel/FixYTBackground
 */
"use strict";

(() => {
  const LOG = "[BackstagePlay]";
  const log = (...a) => console.log(LOG, ...a);
  const err = (...a) => console.error(LOG, ...a);
  log("init");

  // ── Originals ─────────────────────────────────────────────────
  const origHiddenGet    = Object.getOwnPropertyDescriptor(Document.prototype, "hidden").get;
  const origAddEvent     = EventTarget.prototype.addEventListener;
  const origPause        = HTMLMediaElement.prototype.pause;
  const origSetTimeout   = window.setTimeout.bind(window);
  const origClearTimeout = window.clearTimeout.bind(window);

  // ── Phase state machine ───────────────────────────────────────
  const P = { IDLE: 0, WARM: 1, NAV: 2, LOAD: 3 };
  const PN = ["IDLE", "WARM", "NAV", "LOAD"];
  let phase = P.IDLE, phaseAt = 0;

  const setPhase = (p) => {
    if (phase === p) return;
    log(`phase ${PN[phase]}→${PN[p]}`);
    phase = p; phaseAt = Date.now();
    if (p === P.IDLE) retries = 0;
  };

  // ── setTimeout bypass via MessageChannel ──────────────────────
  // Active only when phase > IDLE.  Background tabs clamp setTimeout
  // to ≥1000 ms; MessageChannel.port.onmessage is NOT throttled.
  const mcPending = new Map();
  let mcId = 900000;

  window.setTimeout = function (fn, delay, ...args) {
    if (typeof fn === "function" && (delay === undefined || delay < 1000) && phase > 0) {
      const id = mcId++;
      const ch = new MessageChannel();
      ch.port1.onmessage = () => {
        if (mcPending.delete(id)) try { fn(...args); } catch (e) { console.error(e); }
      };
      mcPending.set(id, ch);
      ch.port2.postMessage(null);
      return id;
    }
    return origSetTimeout(fn, delay, ...args);
  };
  window.clearTimeout = function (id) {
    if (mcPending.delete(id)) return;
    return origClearTimeout(id);
  };

  // ── Constants ─────────────────────────────────────────────────
  const BLOCKED      = new Set(["visibilitychange", "blur", "pagehide", "freeze"]);
  const KA_MIN       = 30000;
  const KA_MAX       = 60000;
  const LOOP_INT     = 3000;      // main-loop interval
  const USR_ACT_WIN  = 2000;
  const WARM_SEC     = 5;         // enter WARM phase this many seconds before end
  const STUCK_SEC    = 4;         // seconds stuck before we intervene
  const NAV_TIMEOUT  = 6000;      // retry if advance didn't navigate
  const LOAD_TIMEOUT = 15000;     // give up waiting for "playing"
  const PHASE_MAX    = 30000;     // absolute safety: force IDLE
  const MAX_RETRIES  = 4;

  // ── State ─────────────────────────────────────────────────────
  let loopTimer      = null;
  let lastRealHidden = null;
  let userPaused     = false;
  let lastUserAction = 0;
  let stuckSince     = 0;         // when video first detected stuck
  let retries        = 0;
  let suppressUsr    = false;
  let ytNextTrack    = null;      // YouTube's nexttrack handler

  // ── Helpers ───────────────────────────────────────────────────
  const rand    = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
  const hidden  = () => { try { return !!origHiddenGet.call(document); } catch { return false; } };
  const vidId   = () => { try { return new URL(location.href).searchParams.get("v") || ""; } catch { return ""; } };
  const hasList = () => { try { return new URL(location.href).searchParams.has("list"); } catch { return false; } };
  const findVid = (playing) => {
    for (const v of document.querySelectorAll("video")) {
      if (v.ended || v.readyState < 2) continue;
      if (!playing || !v.paused) return v;
    }
    return null;
  };

  // ── Advance: Playlist ────────────────────────────────────────
  // Uses playVideoAt(index+1) — explicitly targets the correct next item.
  // NEVER uses nextVideo() or nexttrack (both go to recommendations on mobile).
  // DOM fallback restricted to playlist panel containers.
  const advPlaylist = () => {
    const cur = vidId();
    log(`advPL v=${cur} r#${retries}`);

    // 1) Player API: playVideoAt(currentIndex + 1)
    try {
      const p = document.getElementById("movie_player");
      if (p) {
        const idx  = typeof p.getPlaylistIndex === "function" ? p.getPlaylistIndex() : -1;
        const list = typeof p.getPlaylist === "function" ? p.getPlaylist() : null;
        if (list && idx >= 0 && idx + 1 < list.length) {
          log(`  →playVideoAt(${idx + 1}) id=${list[idx + 1]}`);
          p.playVideoAt(idx + 1);
          return true;
        }
        log(`  player: idx=${idx} list=${list ? list.length : "null"} — unavailable`);
      }
    } catch (e) { err("playVideoAt:", e); }

    // 2) DOM: playlist panel containers only
    const listId = (() => {
      try { return new URL(location.href).searchParams.get("list"); } catch { return null; }
    })();
    if (!listId) return false;

    for (const sel of [
      "ytm-playlist-panel-renderer",
      "#playlist-items",
      "ytm-playlist-video-list-renderer",
    ]) {
      const pan = document.querySelector(sel);
      if (!pan) continue;
      let found = false;
      for (const a of pan.querySelectorAll('a[href*="watch"]')) {
        try {
          const u = new URL(a.href, location.origin);
          if (u.searchParams.get("list") !== listId) continue;
          const v = u.searchParams.get("v");
          if (!v) continue;
          if (v === cur) { found = true; continue; }
          if (found) {
            log(`  →panel v=${v}`);
            suppressUsr = true; a.click(); suppressUsr = false;
            return true;
          }
        } catch {}
      }
    }

    log("  all strategies failed");
    return false;
  };

  // ── Advance: Non-playlist ─────────────────────────────────────
  // First try: nexttrack.  Retries: autonav DOM only.
  const advNonPlaylist = () => {
    const cur = vidId();
    log(`advNP v=${cur} r#${retries}`);

    // nexttrack on first try (same as forward-arrow button)
    if (retries === 0 && ytNextTrack) {
      log("  →nexttrack");
      try { ytNextTrack(); return true; } catch (e) { err("nexttrack:", e); }
    }

    // Autonav DOM — the "Up next" preview only
    for (const sel of [
      "ytm-autonav-preview-renderer a[href*='watch']",
      ".autonav-endscreen a[href*='watch']",
    ]) {
      for (const el of document.querySelectorAll(sel)) {
        const href = el.href || el.getAttribute("href") || "";
        if (cur && href.includes(cur)) continue;
        if (/[?&]v=([^&]+)/.test(href)) {
          log(`  →autonav v=${RegExp.$1}`);
          suppressUsr = true; el.click(); suppressUsr = false;
          return true;
        }
      }
    }

    // nexttrack fallback on retries
    if (retries > 0 && ytNextTrack) {
      log("  →retry nexttrack");
      try { ytNextTrack(); return true; } catch (e) { err("nexttrack:", e); }
    }

    log("  all strategies failed");
    return false;
  };

  // ── Unified advance ───────────────────────────────────────────
  const doAdvance = (reason) => {
    if (retries >= MAX_RETRIES) {
      log("max retries — backing off");
      setPhase(P.IDLE);
      return false;
    }
    log(`doAdvance(${reason})`);
    setPhase(P.NAV);
    return hasList() ? advPlaylist() : advNonPlaylist();
  };

  // ── Visibility spoofing ───────────────────────────────────────
  Object.defineProperty(Document.prototype, "hidden",
    { configurable: true, enumerable: true, get: () => false });
  Object.defineProperty(Document.prototype, "visibilityState",
    { configurable: true, enumerable: true, get: () => "visible" });

  EventTarget.prototype.addEventListener = function (type, fn, opt) {
    if (BLOCKED.has(type)) return;
    return origAddEvent.call(this, type, fn, opt);
  };
  for (const ev of BLOCKED) {
    const stop = (e) => { e.stopImmediatePropagation(); e.preventDefault(); };
    window.addEventListener(ev, stop, true);
    document.addEventListener(ev, stop, true);
  }

  // ── User action tracking ──────────────────────────────────────
  for (const e of ["click", "touchstart", "touchend", "keydown", "pointerdown"])
    window.addEventListener(e, () => { if (!suppressUsr) lastUserAction = Date.now(); }, true);

  // ── MediaSession ──────────────────────────────────────────────
  const syncPlayback = () => {
    if (!("mediaSession" in navigator)) return;
    const v = findVid(false);
    if (!v) return;
    const want = v.paused ? "paused" : "playing";
    if (navigator.mediaSession.playbackState !== want)
      navigator.mediaSession.playbackState = want;
    if (!v.paused && isFinite(v.duration) && v.duration > 0) {
      try {
        navigator.mediaSession.setPositionState({
          duration: v.duration, playbackRate: v.playbackRate || 1,
          position: Math.min(v.currentTime, v.duration),
        });
      } catch {}
    }
  };

  if ("mediaSession" in navigator) {
    const origSAH = navigator.mediaSession.setActionHandler.bind(navigator.mediaSession);
    navigator.mediaSession.setActionHandler = function (action, handler) {
      if (!handler) return origSAH(action, handler);
      if (action === "pause" || action === "stop")
        return origSAH(action, (...a) => { lastUserAction = Date.now(); userPaused = true; handler(...a); });
      if (action === "play")
        return origSAH(action, (...a) => { lastUserAction = Date.now(); userPaused = false; handler(...a); });
      if (action === "nexttrack") { ytNextTrack = handler; log("captured nexttrack"); }
      return origSAH(action, handler);
    };
  }

  // ── Pause interception ────────────────────────────────────────
  HTMLMediaElement.prototype.pause = function () {
    if (Date.now() - lastUserAction < USR_ACT_WIN) {
      userPaused = true;
      return origPause.call(this);
    }
    // Block programmatic pause
  };

  // ── Video element observer ────────────────────────────────────
  new MutationObserver(() => {
    for (const v of document.querySelectorAll("video")) {
      if (v._bp) continue;
      v._bp = true;

      v.addEventListener("play", () => {
        userPaused = false; stuckSince = 0;
        syncPlayback();
      });

      v.addEventListener("pause", syncPlayback);

      // ended: DON'T advance immediately — YouTube auto-advances when
      // it thinks the tab is visible (which we spoof). Just mark stuck
      // and enable bypass. If YouTube fails, main loop will intervene.
      v.addEventListener("ended", () => {
        if (!hidden()) return;
        if (phase >= P.NAV) return; // our advance already in progress
        if (!stuckSince) stuckSince = Date.now();
        if (phase < P.WARM) setPhase(P.WARM); // enable bypass for YouTube
      });

      v.addEventListener("waiting", () => {
        if (isFinite(v.duration) && v.duration > 0 && hidden()) {
          if (v.duration - v.currentTime <= 2 && !stuckSince)
            stuckSince = Date.now();
        }
      });

      // loadstart: new video loading → keep bypass active for media fetch
      v.addEventListener("loadstart", () => {
        stuckSince = 0;
        if (phase >= P.WARM) setPhase(P.LOAD);
      });

      // playing: video is actually playing → safe to return to IDLE
      v.addEventListener("playing", () => {
        stuckSince = 0;
        if (phase > P.IDLE) setPhase(P.IDLE);
        syncPlayback();
      });

      // timeupdate: enter WARM near end for bypass warmup + throttled sync
      v.addEventListener("timeupdate", () => {
        if (isFinite(v.duration) && v.duration > 0 && !v.ended && hidden()) {
          const rem = v.duration - v.currentTime;
          if (rem <= WARM_SEC && phase === P.IDLE)
            setPhase(P.WARM);
        }
        if (!v._bpSync || Date.now() - v._bpSync > 10000) {
          v._bpSync = Date.now();
          syncPlayback();
        }
      });
    }
  }).observe(document, { childList: true, subtree: true });

  // ── Sync fallback ─────────────────────────────────────────────
  setInterval(syncPlayback, 5000);

  // ── Keep-alive pings ──────────────────────────────────────────
  const ping = () => {
    const t = findVid(true) || findVid(false) || document;
    suppressUsr = true;
    if (Math.random() > 0.5) {
      const k = [
        { code: "ShiftLeft",   key: "Shift",   kc: 16 },
        { code: "ControlLeft", key: "Control", kc: 17 },
        { code: "AltLeft",     key: "Alt",     kc: 18 },
      ][rand(0, 2)];
      const init = { bubbles: true, cancelable: true, key: k.key, code: k.code, keyCode: k.kc, which: k.kc };
      t.dispatchEvent(new KeyboardEvent("keydown", init));
      origSetTimeout(() => {
        suppressUsr = true;
        t.dispatchEvent(new KeyboardEvent("keyup", init));
        suppressUsr = false;
      }, 50);
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
    suppressUsr = false;
  };

  const tick = () => {
    try { if (hidden() && findVid(false)) ping(); } catch (e) { err("tick:", e); }
    loopTimer = origSetTimeout(tick, rand(KA_MIN, KA_MAX));
  };

  origAddEvent.call(document, "visibilitychange", () => {
    const h = hidden();
    if (h && lastRealHidden === false) {
      origSetTimeout(() => {
        if (!hidden()) return;
        for (let i = 0; i < 3; i++)
          origSetTimeout(() => { if (hidden()) ping(); }, i * 80);
      }, 40);
    }
    lastRealHidden = h;
  }, true);

  // ── Main loop ─────────────────────────────────────────────────
  setInterval(() => {
    const h = hidden();

    // ── Phase timeouts ──────────────────────────────────────
    if (phase > P.IDLE) {
      const elapsed = Date.now() - phaseAt;
      if (elapsed > PHASE_MAX) {
        log("safety→IDLE"); setPhase(P.IDLE);
      } else if (phase === P.NAV && elapsed > NAV_TIMEOUT) {
        retries++;
        log(`nav-timeout r#${retries}`);
        doAdvance("nav-retry");
      } else if (phase === P.LOAD && elapsed > LOAD_TIMEOUT) {
        log("load-timeout→IDLE"); setPhase(P.IDLE);
      }
    }

    // ── Stuck detection (YouTube failed to auto-advance) ────
    // Only intervene from IDLE or WARM — never during NAV/LOAD.
    if (h && phase <= P.WARM && stuckSince && Date.now() - stuckSince > STUCK_SEC * 1000) {
      let hasEnded = false;
      for (const v of document.querySelectorAll("video")) {
        if (v.ended && v.currentSrc) { hasEnded = true; break; }
      }
      if (hasEnded) {
        stuckSince = Date.now(); // reset for next attempt
        doAdvance("stuck");
      }
    }

    // ── Near-end buffering stuck (readyState < 3 within 2s) ─
    if (h && phase <= P.WARM) {
      for (const v of document.querySelectorAll("video")) {
        if (!v.paused && !v.ended && isFinite(v.duration) && v.duration > 0) {
          const rem = v.duration - v.currentTime;
          if (rem <= 2 && v.readyState < 3) {
            if (!stuckSince) { stuckSince = Date.now(); if (phase === P.IDLE) setPhase(P.WARM); }
            else if (Date.now() - stuckSince > 5000) { stuckSince = Date.now(); doAdvance("buf-stuck"); }
          } else if (rem > 3 && stuckSince && !v.ended) { stuckSince = 0; }
        }
      }
    }

    // ── Re-detect ended after max-retries reset ─────────────
    if (h && phase === P.IDLE && !stuckSince) {
      for (const v of document.querySelectorAll("video")) {
        if (v.ended && v.currentSrc) {
          stuckSince = Date.now();
          setPhase(P.WARM);
          break;
        }
      }
    }

    // ── Force resume ────────────────────────────────────────
    for (const v of document.querySelectorAll("video")) {
      if (v.paused && !v.ended && !userPaused && v.readyState >= 2)
        v.play().catch(() => {});
    }
  }, LOOP_INT);

  // ── Boot ──────────────────────────────────────────────────────
  loopTimer = origSetTimeout(tick, rand(KA_MIN, KA_MAX));
  window.addEventListener("pagehide", () => clearTimeout(loopTimer));
  log("ready, list=" + hasList());
})();
