document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const leadId = urlParams.get('lead');

  const BACKEND_URL = "https://web-78t58qun41lt.up-de-fra1-k8s-1.apps.run-on-seenode.com";
  const PERFIL = 'profesional';

  // ─── Un solo vídeo, sin candados (22-10) ──────────────────────────
  // Antes: vídeo corto → desbloqueaba el webinar → desbloqueaba el botón de
  // reservar ("modo yincana"). Ahora hay UNA presentación (la larga) y los
  // botones de reservar están visibles desde el principio: se reserva
  // primero y la presentación es la llave del Zoom (lo gestiona el CRM).
  // Lo que sigue haciendo esta página: recordar por dónde va el vídeo,
  // impedir adelantarlo más allá de lo visto, y avisar al CRM de cada hito.

  // ─── Progreso persistente (localStorage) ─────────────────────────
  const STORE_KEY = `three_progress_${leadId || 'anon'}`;
  let saved = { maxTime: {} };
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) saved = Object.assign(saved, JSON.parse(raw));
    if (!saved.maxTime) saved.maxTime = {};
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

  // ─── 1. Botones de reservar: visibles y el flotante fijo ─────────
  document.querySelectorAll('.calendly').forEach((btn) => btn.classList.add('calendly-revealed'));
  const flot = document.getElementById('ctaFlotante');
  if (flot) flot.classList.add('cta-persist');

  // ─── 2. "Terminó la presentación": se avisa UNA vez al CRM ───────
  // Se conserva el nombre del evento que ya entiende el CRM
  // (calendly_button_revealed = terminó el vídeo principal).
  let terminada = false;
  const presentacionTerminada = (motivo) => {
    if (terminada) return;
    terminada = true;
    sendEvent('calendly_button_revealed', { motivo });
  };

  // ─── 3. Configurar TODOS los vídeos de la página ──────────────────
  const videos = document.querySelectorAll('video');
  videos.forEach((video) => {
    const videoId = video.id || `video_${Array.from(videos).indexOf(video)}`;
    // Los vídeos del embudo (presentación, extras) se rastrean y persisten.
    // Los DECORATIVOS (autoplay) son pura decoración: en bucle, sin volumen y
    // sin tracking (no deben salir en el CRM ni en "En directo").
    const esFunnel = !video.autoplay;
    if (!esFunnel) {
      video.muted = true;
      video.loop = true;
      video.play().catch(() => {});
      return;
    }

    // Restaurar la posición donde lo dejó (cuando el vídeo sepa su duración).
    if (saved.maxTime[videoId]) {
      const restore = () => {
        try { video.currentTime = Math.min(saved.maxTime[videoId], (video.duration || 1e9) - 0.5); } catch (e) {}
      };
      if (video.readyState >= 1) restore();
      else video.addEventListener('loadedmetadata', restore, { once: true });
    }

    // Bloqueo de seek: no adelantar más allá de lo ya visto (se puede retroceder).
    let maxTimeReached = saved.maxTime[videoId] || 0;
    video.addEventListener('timeupdate', () => {
      if (!video.seeking && video.currentTime > maxTimeReached) {
        maxTimeReached = video.currentTime;
        if (!video._lastSave || maxTimeReached - video._lastSave > 3) {
          video._lastSave = maxTimeReached;
          saved.maxTime[videoId] = maxTimeReached;
          persist();
        }
      }
    });
    video.addEventListener('seeking', () => {
      if (video.currentTime > maxTimeReached + 1) video.currentTime = maxTimeReached;
    });
    video.addEventListener('pause', () => {
      saved.maxTime[videoId] = maxTimeReached; persist();
    });

    // Tracking de play/progreso/end por vídeo. Los hitos ya superados en una
    // sesión anterior (posición restaurada) no se reenvían al CRM.
    let firedPlay = false;
    const restoredPct = (saved.maxTime[videoId] && video.duration)
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
        if (videoId === 'videoWebinar') presentacionTerminada('webinar_90pct');
      }
    });

    video.addEventListener('ended', () => {
      sendEvent('video_complete', { videoId });
      saved.maxTime[videoId] = video.duration || maxTimeReached; persist();
      if (videoId === 'videoWebinar') presentacionTerminada('webinar_complete');
    });
  });

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
