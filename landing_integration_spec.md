# Especificación Técnica: Integración de Landing en Cloudflare con Backend en Seenode

Este documento detalla los pasos exactos para actualizar tu repositorio de Github `LANDING-THREE-INMOBILIARIA` (desplegado en Cloudflare Pages) para que se comunique correctamente con tu bot de WhatsApp alojado en Seenode.

## 1. Actualizar `index.html`

Abre tu archivo `index.html` en el repositorio de la landing y añade esta línea justo antes de la etiqueta de cierre `</body></html>` (al final del todo):

```html
  <script src="/vsl.js"></script>
</body></html>
```

*Nota: Asegúrate de que los botones de Calendly tengan la clase `calendly`.*

## 2. Crear archivo `vsl.js`

En la carpeta raíz de tu repositorio de la landing (junto a `index.html`), crea un nuevo archivo llamado `vsl.js` y pega **exactamente** este código. 

**Importante:** Cuando tengas la URL real de Seenode, deberás reemplazar `AQUI_TU_URL_DE_SEENODE` por tu dominio.

```javascript
document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const leadId = urlParams.get('lead');
  
  // URL de tu servidor en Seenode (SIN barra diagonal al final)
  const BACKEND_URL = "AQUI_TU_URL_DE_SEENODE"; // Ej: "https://agente-three.seenode.app"

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
```

## 3. Configuración CORS en Seenode (Backend)

Nuestro código backend actual ya tiene la librería \`cors\` configurada globalmente (`app.use(cors())`), por lo que aceptará peticiones entrantes desde tu dominio `https://threeinmobiliaria.pages.dev/` sin problemas. No necesitas hacer nada más en el backend aparte de subirlo.
