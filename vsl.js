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

  // ─── 1. El botón de reservar: VISIBLE pero BLOQUEADO ──────────────
  // Antes se ocultaba del todo y el lead no sabía que existía. Ahora se ve un
  // cartel grande y bloqueado en su lugar: ve el premio y entiende que se
  // desbloquea terminando el webinar. Es a propósito — a la 1-a-1 se viene con
  // la presentación vista, para no hacerle perder el tiempo a nadie.
  const style = document.createElement('style');
  style.innerHTML = `
    .calendly { display: none !important; }
    .cal-bloqueado{display:block;margin:1.4rem auto;max-width:560px;padding:18px 24px;border-radius:16px;
      background:linear-gradient(135deg,#efeaf9,#faf7ff);border:2px dashed #b9aed6;color:#4b3b7a;
      text-align:center;font-weight:800;font-size:16px;line-height:1.45;cursor:not-allowed;user-select:none;
      box-shadow:0 6px 20px rgba(49,27,146,.06)}
    .cal-bloqueado .cal-lock{display:block;font-size:1.9rem;margin-bottom:6px;opacity:.85}
    .cal-bloqueado small{display:block;font-weight:600;font-size:13px;opacity:.85;margin-top:7px}
  `;
  document.head.appendChild(style);

  const HTML_BLOQUEADO =
    '<span class="cal-lock">🔒</span>Reserva tu reunión 1 a 1 con Arkaitz' +
    '<small>Se desbloquea al terminar el webinar. Lo hacemos así a propósito: a la reunión se viene ' +
    'con la presentación ya vista, para no hacerte perder el tiempo.</small>';

  // Pone un cartel bloqueado justo donde iría cada botón de reservar.
  // El flotante se queda oculto (ahí un cartel grande estorbaría).
  function pintarBloqueados() {
    document.querySelectorAll('.calendly').forEach((btn) => {
      if (btn.dataset.lockPintado || btn.closest('.cta-flotante')) return;
      btn.dataset.lockPintado = '1';
      const cartel = document.createElement('div');
      cartel.className = 'cal-bloqueado';
      cartel.innerHTML = HTML_BLOQUEADO;
      btn.parentNode.insertBefore(cartel, btn);
    });
  }
  pintarBloqueados();

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
    // Fuera los carteles bloqueados: ya se lo ha ganado, ahora van los botones
    document.querySelectorAll('.cal-bloqueado').forEach((el) => el.remove());
    if (document.head.contains(style)) document.head.removeChild(style);
    document.querySelectorAll('.calendly').forEach((btn) => btn.classList.add('calendly-revealed'));
    // El botón flotante se queda FIJO en pantalla a partir de aquí (sin depender
    // del scroll): agendar el 1-a-1 es el paso clave, tiene que estar siempre a la vista.
    const flot = document.getElementById('ctaFlotante');
    if (flot) flot.classList.add('cta-persist');
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
