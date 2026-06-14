document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const leadId = urlParams.get('lead');

  // URL del backend del agente en Seenode (sin barra final)
  const BACKEND_URL = "https://web-78t58qun41lt.up-de-fra1-k8s-1.apps.run-on-seenode.com";

  // ─── Helpers de tracking ────────────────────────────────────────
  const sendEvent = (type, meta) => {
    if (!leadId) return;
    try {
      fetch(`${BACKEND_URL}/tracking/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, type, meta: meta || null }),
        keepalive: true,
      }).catch(() => {});
    } catch (err) {
      // silencioso: el tracking nunca debe romper la UX
    }
  };

  // Evento de página vista (siempre)
  sendEvent('landing_view', { perfil: 'profesional', url: window.location.href });

  // 1. Ocultar todos los botones de agenda usando CSS dinámico
  const style = document.createElement('style');
  style.innerHTML = `
    .calendly { display: none !important; }
  `;
  document.head.appendChild(style);

  let config = { delayedButtonSeconds: 30 };

  // 2. Traer configuración (retraso) desde Seenode
  try {
    const res = await fetch(`${BACKEND_URL}/api/config`);
    if (res.ok) {
      config = await res.json();
    }
  } catch (err) {
    console.warn('Usando configuración local de fallback (30 seg)');
  }

  // 3. Temporizador que se inicia al darle al PLAY al primer video
  let timerStarted = false;
  const startTimer = () => {
    if (timerStarted) return;
    timerStarted = true;

    const delayMs = config.delayedButtonSeconds * 1000;
    setTimeout(() => {
      if (document.head.contains(style)) {
        document.head.removeChild(style);
        sendEvent('calendly_button_revealed');
      }
    }, delayMs);
  };

  const mainVideo = document.getElementById('video1');
  if (mainVideo) {
    // Eventos del vídeo: play, hitos de progreso y fin
    let firedPlay = false;
    const fired = { 25: false, 50: false, 75: false };

    mainVideo.addEventListener('play', () => {
      startTimer();
      if (!firedPlay) {
        firedPlay = true;
        sendEvent('video_play');
      }
    });

    mainVideo.addEventListener('timeupdate', () => {
      if (!mainVideo.duration) return;
      const pct = (mainVideo.currentTime / mainVideo.duration) * 100;
      for (const milestone of [25, 50, 75]) {
        if (!fired[milestone] && pct >= milestone) {
          fired[milestone] = true;
          sendEvent(`video_progress_${milestone}`);
        }
      }
    });

    mainVideo.addEventListener('ended', () => sendEvent('video_complete'));
  } else {
    startTimer(); // Fallback inmediato si no se encuentra el video
  }

  // 4. Tracking automático al hacer click en cualquier botón de Calendly
  const botonesCalendly = document.querySelectorAll('.calendly');
  botonesCalendly.forEach(btn => {
    btn.addEventListener('click', () => {
      if (leadId) {
        try {
          fetch(`${BACKEND_URL}/tracking/video-click`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ leadId }),
            keepalive: true
          });
        } catch (err) {
          console.error('Error de tracking:', err);
        }
      }
    });
  });
});
