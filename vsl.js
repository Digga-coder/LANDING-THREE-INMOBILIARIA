document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const leadId = urlParams.get('lead');

  const BACKEND_URL = "https://web-78t58qun41lt.up-de-fra1-k8s-1.apps.run-on-seenode.com";
  const PERFIL = 'profesional';

  // ─── Progreso persistente (localStorage) ─────────────────────────
  // Guarda por lead qué se ha desbloqueado y por dónde va cada vídeo, para
  // que al RECARGAR la página no tenga que ver el VSL entero otra vez.
  const STORE_KEY = `three_progress_${leadId || 'anon'}`;
  let saved = { webinar: false, extras: false, boton: false, maxTime: {} };
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) saved = Object.assign(saved, JSON.parse(raw));
  } catch (e) {}
  const persist = () => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(saved)); } catch (e) {}
  };

  // ─── Helpers de tracking ─────────────────────────────────────────
  const sendEvent = (type, meta) => {
    if (!leadId) return;
    try {
      fetch(`${BACKEND_URL}/tracking/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, type, meta: meta || null }),
        keepalive: true,
      }).catch(() => {});
    } catch (err) {}
  };

  sendEvent('landing_view', { perfil: PERFIL, url: window.location.href });

  // ─── 1. Ocultar todos los botones de Calendly hasta el desbloqueo ──
  const style = document.createElement('style');
  style.innerHTML = `.calendly { display: none !important; }`;
  document.head.appendChild(style);

  let config = { delayedButtonSeconds: 60 };
  try {
    const res = await fetch(`${BACKEND_URL}/api/config`);
    if (res.ok) config = await res.json();
  } catch (err) {}

  // ─── 2. Desbloqueos (con opción "silent" al restaurar) ────────────
  // silent = true → restaurando de una recarga: no animamos, no hacemos
  // scroll y no reenviamos el evento (ya ocurrió en su día).
  let buttonRevealed = false;
  const revealButton = (motivo, silent) => {
    if (buttonRevealed) return;
    buttonRevealed = true;
    if (document.head.contains(style)) document.head.removeChild(style);
    document.querySelectorAll('.calendly').forEach((btn) => btn.classList.add('calendly-revealed'));
    saved.boton = true; persist();
    if (!silent) sendEvent('calendly_button_revealed', { motivo });
  };

  let webinarUnlocked = false;
  const unlockWebinar = (motivo, silent) => {
    if (webinarUnlocked) return;
    webinarUnlocked = true;
    const wrapper = document.getElementById('webinarWrapper');
    if (wrapper) {
      wrapper.classList.remove('locked');
      if (!silent) {
        wrapper.classList.add('webinar-unlock-flash');
        wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
    saved.webinar = true; persist();
    if (!silent) sendEvent('webinar_unlocked', { motivo });
  };

  let extrasUnlocked = false;
  const unlockExtras = (motivo, silent) => {
    if (extrasUnlocked) return;
    extrasUnlocked = true;
    document.querySelectorAll('.js-extra').forEach((w) => {
      w.classList.remove('locked');
      if (!silent) w.classList.add('webinar-unlock-flash');
    });
    saved.extras = true; persist();
    if (!silent) sendEvent('extras_unlocked', { motivo });
  };

  // ─── Restaurar el estado guardado (sin animaciones ni eventos) ────
  if (saved.webinar) unlockWebinar('restaurado', true);
  if (saved.boton) revealButton('restaurado', true);
  if (saved.extras) unlockExtras('restaurado', true);

  // ─── 3. Configurar TODOS los vídeos de la página ──────────────────
  const videos = document.querySelectorAll('video');
  videos.forEach((video) => {
    const videoId = video.id || `video_${Array.from(videos).indexOf(video)}`;
    // Los vídeos del embudo (VSL, webinar, extras) se rastrean y persisten.
    // Los DECORATIVOS (autoplay) son pura decoración de la web: los dejamos
    // sonando en bucle sin volumen y NO los rastreamos (no deben salir en el
    // CRM ni en "En directo").
    const esFunnel = !video.autoplay;
    if (!esFunnel) {
      video.muted = true;
      video.loop = true;
      video.play().catch(() => {});
      return; // sin tracking, sin bloqueo de seek, sin persistencia
    }

    // Restaurar la posición donde lo dejó (cuando el vídeo sepa su duración).
    if (esFunnel && saved.maxTime[videoId]) {
      const restore = () => {
        try { video.currentTime = Math.min(saved.maxTime[videoId], (video.duration || 1e9) - 0.5); } catch (e) {}
      };
      if (video.readyState >= 1) restore();
      else video.addEventListener('loadedmetadata', restore, { once: true });
    }

    // Bloqueo de seek: no adelantar más allá de lo ya visto (se puede retroceder).
    let maxTimeReached = (esFunnel && saved.maxTime[videoId]) || 0;
    video.addEventListener('timeupdate', () => {
      if (!video.seeking && video.currentTime > maxTimeReached) {
        maxTimeReached = video.currentTime;
        if (esFunnel) {
          // Guardamos la posición cada pocos segundos (no en cada frame).
          if (!video._lastSave || maxTimeReached - video._lastSave > 3) {
            video._lastSave = maxTimeReached;
            saved.maxTime[videoId] = maxTimeReached;
            persist();
          }
        }
      }
    });
    video.addEventListener('seeking', () => {
      if (video.currentTime > maxTimeReached + 1) video.currentTime = maxTimeReached;
    });
    video.addEventListener('pause', () => {
      if (esFunnel) { saved.maxTime[videoId] = maxTimeReached; persist(); }
    });

    // Tracking de play/progreso/end por vídeo. Marcamos como ya disparados
    // los hitos que ya se habían superado en una sesión anterior (por la
    // posición restaurada), para no reenviar eventos duplicados al CRM.
    let firedPlay = false;
    const restoredPct = (esFunnel && saved.maxTime[videoId] && video.duration)
      ? (saved.maxTime[videoId] / video.duration) * 100 : 0;
    const fired = { 25: restoredPct >= 25, 50: restoredPct >= 50, 75: restoredPct >= 75 };
    let fired90 = restoredPct >= 90;

    video.addEventListener('play', () => {
      if (!firedPlay) { firedPlay = true; sendEvent('video_play', { videoId }); }
    });

    video.addEventListener('timeupdate', () => {
      if (!video.duration) return;
      const pct = (video.currentTime / video.duration) * 100;
      for (const milestone of [25, 50, 75]) {
        if (!fired[milestone] && pct >= milestone) {
          fired[milestone] = true;
          sendEvent(`video_progress_${milestone}`, { videoId });
        }
      }
      if (!fired90 && pct >= 90) {
        fired90 = true;
        sendEvent('video_progress_90', { videoId });
        if (videoId === 'video1') unlockWebinar('vsl_90pct');
        if (videoId === 'videoWebinar') { revealButton('webinar_90pct'); unlockExtras('webinar_90pct'); }
      }
    });

    video.addEventListener('ended', () => {
      sendEvent('video_complete', { videoId });
      if (esFunnel) { saved.maxTime[videoId] = video.duration || maxTimeReached; persist(); }
      if (videoId === 'video1') unlockWebinar('video1_complete');
      if (videoId === 'videoWebinar') { revealButton('webinar_complete'); unlockExtras('webinar_complete'); }
    });
  });

  if (videos.length === 0) revealButton('no_video');

  // ─── 4. Tracking de clics en cualquier botón Calendly ─────────────
  document.querySelectorAll('.calendly').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (leadId) {
        try {
          fetch(`${BACKEND_URL}/tracking/video-click`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ leadId }),
            keepalive: true,
          });
        } catch (err) {}
      }
    });
  });
});
