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

  let timerStarted = false;
  const startFallbackTimer = () => {
    if (timerStarted) return;
    timerStarted = true;
    setTimeout(() => revealButton('timer_fallback'), config.delayedButtonSeconds * 1000);
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

    video.addEventListener('play', () => {
      startFallbackTimer();
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

          // El 50% del vídeo principal desbloquea el botón
          if (videoId === 'video1' && milestone === 50) {
            revealButton('video1_50pct');
          }
        }
      }
    });

    video.addEventListener('ended', () => {
      sendEvent('video_complete', { videoId });
      if (videoId === 'video1') revealButton('video1_complete');
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
