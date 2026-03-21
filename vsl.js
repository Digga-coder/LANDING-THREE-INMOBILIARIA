document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const leadId = urlParams.get('lead');
  
  // URL de tu servidor en Seenode (SIN barra diagonal al final)
  const BACKEND_URL = "https://web-78t58qun41lt.up-de-fra1-k8s-1.apps.run-on-seenode.com"; // Ej: "https://agente-three.seenode.app"

  // 1. Ocultar todos los botones de agenda usando CSS dinámico
  const style = document.createElement('style');
  style.innerHTML = `
    .calendly { display: none !important; }
  `;
  document.head.appendChild(style);

  let config = { delayedButtonSeconds: 300 };

  // 2. Traer configuración (retraso) desde Seenode
  try {
    const res = await fetch(`${BACKEND_URL}/api/config`);
    if (res.ok) {
      config = await res.json();
    }
  } catch (err) {
    console.warn('Usando configuración local de fallback (5 min)');
  }

  // 3. Temporizador para mostrar botones
  const delayMs = config.delayedButtonSeconds * 1000;
  setTimeout(() => {
    if (document.head.contains(style)) {
      document.head.removeChild(style);
    }
  }, delayMs);

  // 4. Tracking automático al hacer click
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
