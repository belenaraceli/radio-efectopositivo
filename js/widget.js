(function() {
  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  // Robust helper to find the <script> that loaded this file
  function findThisScript() {
    // Prefer document.currentScript (works while script executes)
    if (document.currentScript) return document.currentScript;

    // Otherwise try to find a script tag that has a data-endpoint or whose src contains 'widget.js'
    const scripts = Array.from(document.getElementsByTagName('script'));
    for (let i = scripts.length - 1; i >= 0; i--) {
      const s = scripts[i];
      if (s.dataset && (s.dataset.endpoint || s.dataset.channelId || s.dataset.limit)) return s;
    }
    for (let i = scripts.length - 1; i >= 0; i--) {
      const s = scripts[i];
      try {
        if (s.src && s.src.indexOf('widget.js') !== -1) return s;
      } catch(e){}
    }
    // fallback: last script
    return scripts[scripts.length - 1] || null;
  }

  ready(async function() {
    const scriptEl = findThisScript();
    if (!scriptEl) {
      console.error('widget.js: no se pudo localizar el tag <script> que cargó el widget.');
      return;
    }

    const endpoint = scriptEl.dataset.endpoint || '/api/videos-rss';
    const channelId = scriptEl.dataset.channelId || '@radioefectopositivo';
    const limit = scriptEl.dataset.limit || 9;

    const container = document.getElementById('youtube-widget');
    if (!container) {
      console.error('widget.js: elemento contenedor con id "youtube-widget" no encontrado en la página.');
      return;
    }

    // Insertar estilos básicos (no sobrescriben si ya están)
    const styleId = 'youtube-widget-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
      #youtube-widget-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        gap: 1rem;
      }
      .yt-video-card {
        cursor: pointer;
        border: 1px solid #ddd;
        border-radius: 8px;
        overflow: hidden;
        background: #fff;
        transition: box-shadow 0.2s ease;
      }
      .yt-video-card:hover {
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      }
      .yt-video-thumb {
        width: 100%;
        aspect-ratio: 16/9;
        object-fit: cover;
        display: block;
      }
      .yt-video-title {
        font-size: 14px;
        font-weight: 500;
        padding: 0.5rem;
        color: #222;
        line-height: 1.3;
      }
      #yt-modal {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.7);
        display: none;
        align-items: center;
        justify-content: center;
        z-index: 9999;
      }
      #yt-modal-content {
        position: relative;
        width: 90%;
        max-width: 800px;
        aspect-ratio: 16/9;
        background: #000;
      }
      #yt-modal iframe {
        width: 100%;
        height: 100%;
        border: none;
      }
      #yt-modal-close {
        position: absolute;
        top: -40px;
        right: 0;
        background: #fff;
        border: none;
        padding: 8px 12px;
        cursor: pointer;
        border-radius: 4px;
        font-size: 14px;
      }
      `;
      document.head.appendChild(style);
    }

    // Crear grid y modal
    const grid = document.createElement('div');
    grid.id = 'youtube-widget-grid';
    container.appendChild(grid);

    const modal = document.createElement('div');
    modal.id = 'yt-modal';
    modal.innerHTML = `
      <div id="yt-modal-content">
        <button id="yt-modal-close">Cerrar ✖</button>
        <iframe id="yt-modal-iframe" src="" allowfullscreen></iframe>
      </div>
    `;
    document.body.appendChild(modal);

    const modalIframe = modal.querySelector('#yt-modal-iframe');
    const modalClose = modal.querySelector('#yt-modal-close');
    modalClose.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    function closeModal(){
      modal.style.display = 'none';
      modalIframe.src = '';
    }

    // Fetch videos
    try {
      const url = `${endpoint}?channelId=${encodeURIComponent(channelId)}&limit=${encodeURIComponent(limit)}`;
      const resp = await fetch(url);
      if (!resp.ok) {
        console.error('widget.js: fallo al obtener videos desde el endpoint', url, resp.status);
        grid.innerHTML = `<p>Error obteniendo videos (status ${resp.status}).</p>`;
        return;
      }
      const data = await resp.json();

      if (!data || !Array.isArray(data.videos) || !data.videos.length) {
        grid.innerHTML = `<p>No se encontraron videos.</p>`;
        console.warn('widget.js: la API devolvió data vacía o sin videos', data);
        return;
      }

      data.videos.forEach(video => {
        const card = document.createElement('div');
        card.className = 'yt-video-card';
        const thumb = video.thumbnail || (`https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`);
        card.innerHTML = `
          <img class="yt-video-thumb" src="${thumb}" alt="${escapeHtml(video.title)}">
          <div class="yt-video-title">${escapeHtml(video.title)}</div>
        `;
        card.addEventListener('click', () => {
          modal.style.display = 'flex';
          modalIframe.src = `https://www.youtube.com/embed/${encodeURIComponent(video.id)}?autoplay=1`;
        });
        grid.appendChild(card);
      });
    } catch (err) {
      console.error('widget.js: excepción al cargar videos', err);
      grid.innerHTML = `<p>Error cargando videos.</p>`;
    }
  });

  function escapeHtml(s) {
    return (s || '').replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }
})();
