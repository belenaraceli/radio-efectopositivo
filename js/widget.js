(function() {
  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(async function() {
    const scriptEl = document.currentScript;
    const endpoint = scriptEl.dataset.endpoint || '/api/videos-rss';
    const channelId = scriptEl.dataset.channelId || '@radioefectopositivo';
    const limit = scriptEl.dataset.limit || 9;

    const container = document.getElementById('youtube-widget');
    if (!container) return;

    const style = document.createElement('style');
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

    modalClose.addEventListener('click', () => {
      modal.style.display = 'none';
      modalIframe.src = '';
    });

    modal.addEventListener('click', (e) => {
      if (e.target.id === 'yt-modal') {
        modal.style.display = 'none';
        modalIframe.src = '';
      }
    });

    try {
      const url = `${endpoint}?channelId=${encodeURIComponent(channelId)}&limit=${limit}`;
      const resp = await fetch(url);
      const data = await resp.json();

      if (!data.videos || !data.videos.length) {
        grid.innerHTML = `<p>No se encontraron videos.</p>`;
        return;
      }

      data.videos.forEach(video => {
        const card = document.createElement('div');
        card.className = 'yt-video-card';
        card.innerHTML = `
          <img class="yt-video-thumb" src="${video.thumbnail}" alt="${video.title}">
          <div class="yt-video-title">${video.title}</div>
        `;
        card.addEventListener('click', () => {
          modal.style.display = 'flex';
          modalIframe.src = `https://www.youtube.com/embed/${video.id}?autoplay=1`;
        });
        grid.appendChild(card);
      });
    } catch (err) {
      console.error('Error cargando videos', err);
      grid.innerHTML = `<p>Error cargando videos.</p>`;
    }
  });
})();
