document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const leadId = urlParams.get('lead');

  const BACKEND_URL = "https://web-78t58qun41lt.up-de-fra1-k8s-1.apps.run-on-seenode.com";

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

  sendEvent('landing_view', { perfil: 'profesional', url: window.location.href });

  // ─── 1. Ocultar todos los botones de Calendly hasta el desbloqueo ──
  const style = document.createElement('style');
  style.innerHTML = `.calendly { display: none !important; }`;
  document.head.appendChild(style);

  let config = { delayedButtonSeconds: 60 };
  try {
    const res = await fetch(`${BACKEND_URL}/api/config`);
    if (res.ok) config = await res.json();
  } catch (err) {}

  // ─── 2. Desbloqueo del botón ──────────────────────────────────────
  // Se revela cuando el vídeo principal alcanza el 50% O cuando pasa
  // el timer de fallback (lo que ocurra antes).
  let buttonRevealed = false;
  const revealButton = (motivo) => {
    if (buttonRevealed) return;
    buttonRevealed = true;
    if (document.head.contains(style)) {
      document.head.removeChild(style);
    }
    sendEvent('calendly_button_revealed', { motivo });
    // Animación "pulse" al revelarse para que llame la atención
    document.querySelectorAll('.calendly').forEach((btn) => {
      btn.classList.add('calendly-revealed');
    });
  };

  // ─── Desbloqueo gradual del webinar (Paso 2) ──────────────────────
  let webinarUnlocked = false;
  const unlockWebinar = (motivo) => {
    if (webinarUnlocked) return;
    webinarUnlocked = true;
    const wrapper = document.getElementById('webinarWrapper');
    if (wrapper) {
      wrapper.classList.remove('locked');
      wrapper.classList.add('webinar-unlock-flash');
      wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    sendEvent('webinar_unlocked', { motivo });
  };

  // ─── Paso 3: vídeos extra (se abren al 90% del webinar) ───────────
  let extrasUnlocked = false;
  const unlockExtras = (motivo) => {
    if (extrasUnlocked) return;
    extrasUnlocked = true;
    document.querySelectorAll('.js-extra').forEach((w) => {
      w.classList.remove('locked');
      w.classList.add('webinar-unlock-flash');
    });
    sendEvent('extras_unlocked', { motivo });
  };

  // ─── 3. Configurar TODOS los vídeos de la página ──────────────────
  const videos = document.querySelectorAll('video');
  videos.forEach((video) => {
    const videoId = video.id || `video_${Array.from(videos).indexOf(video)}`;

    // Bloqueo de seek: no se puede arrastrar la barra hacia adelante.
    // Se permite retroceder libremente.
    let maxTimeReached = 0;
    video.addEventListener('timeupdate', () => {
      if (!video.seeking && video.currentTime > maxTimeReached) {
        maxTimeReached = video.currentTime;
      }
    });
    video.addEventListener('seeking', () => {
      // Si intenta saltar hacia adelante (más de 1s sobre lo ya visto), lo devolvemos
      if (video.currentTime > maxTimeReached + 1) {
        video.currentTime = maxTimeReached;
      }
    });

    // Tracking de play/progreso/end por vídeo
    let firedPlay = false;
    const fired = { 25: false, 50: false, 75: false };
    let fired90 = false;

    video.addEventListener('play', () => {
      if (!firedPlay) {
        firedPlay = true;
        sendEvent('video_play', { videoId });
      }
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
      // Desbloqueo por pasos al 90% del tiempo visto (filtro real).
      if (!fired90 && pct >= 90) {
        fired90 = true;
        sendEvent('video_progress_90', { videoId });
        // Paso 1 → Paso 2: el VSL abre el webinar
        if (videoId === 'video1') unlockWebinar('vsl_90pct');
        // Paso 2 → CTA + Paso 3: el webinar revela el botón y abre los extra
        if (videoId === 'videoWebinar') { revealButton('webinar_90pct'); unlockExtras('webinar_90pct'); }
      }
    });

    video.addEventListener('ended', () => {
      sendEvent('video_complete', { videoId });
      if (videoId === 'video1') unlockWebinar('video1_complete');
      if (videoId === 'videoWebinar') { revealButton('webinar_complete'); unlockExtras('webinar_complete'); }
    });
  });

  if (videos.length === 0) {
    // Sin vídeos en la página: revelar el botón ya
    revealButton('no_video');
  }

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
