(function() {
  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  function findThisScript() {
    if (document.currentScript) return document.currentScript;
    const scripts = Array.from(document.getElementsByTagName('script'));
    for (let i = scripts.length - 1; i >= 0; i--) {
      const s = scripts[i];
      if (s.dataset && (s.dataset.endpoint || s.dataset.channelId || s.dataset.limit)) return s;
    }
    for (let i = scripts.length - 1; i >= 0; i--) {
      const s = scripts[i];
      try { if (s.src && s.src.indexOf('widget.js') !== -1) return s; } catch(e){}
    }
    return scripts[scripts.length - 1] || null;
  }

  ready(async function() {
    const scriptEl = findThisScript();
    if (!scriptEl) { console.error('widget: script tag not found'); return; }

    const endpointBase = scriptEl.dataset.endpoint || '/api/videos-rss';
    const channelId = scriptEl.dataset.channelId || '@radioefectopositivo';
    const limit = parseInt(scriptEl.dataset.limit || 9, 10) || 9;

    const container = document.getElementById('youtube-widget');
    if (!container) { console.error('widget: container #youtube-widget not found'); return; }

    // build UI: header with search and live button
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.gap = '8px';
    header.style.alignItems = 'center';
    header.style.marginBottom = '12px';

    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.placeholder = 'Buscar programas...';
    searchInput.style.flex = '1';
    searchInput.style.padding = '8px';
    searchInput.style.border = '1px solid #ddd';
    searchInput.style.borderRadius = '6px';

    const liveBtn = document.createElement('button');
    liveBtn.textContent = 'Buscar en vivo';
    liveBtn.style.padding = '8px 10px';
    liveBtn.style.borderRadius = '6px';
    liveBtn.style.border = '1px solid #e33';
    liveBtn.style.background = '#fff';
    liveBtn.style.color = '#e33';
    liveBtn.disabled = true; // activamos si detecta live

    header.appendChild(searchInput);
    header.appendChild(liveBtn);
    container.appendChild(header);

    // grid and modal
    const grid = document.createElement('div'); grid.id = 'youtube-widget-grid';
    container.appendChild(grid);

    const modal = document.createElement('div'); modal.id = 'yt-modal';
    modal.innerHTML = `<div id="yt-modal-content"><button id="yt-modal-close">Cerrar ✖</button><iframe id="yt-modal-iframe" src="" allowfullscreen></iframe></div>`;
    document.body.appendChild(modal);
    const modalIframe = modal.querySelector('#yt-modal-iframe');
    const modalClose = modal.querySelector('#yt-modal-close');
    modalClose.addEventListener('click', closeModal);
    modal.addEventListener('click', (e)=>{ if(e.target===modal) closeModal(); });
    function closeModal(){ modal.style.display='none'; modalIframe.src=''; }

    // inject styles if missing (same as before)
    if (!document.getElementById('youtube-widget-styles')) {
      const s = document.createElement('style');
      s.id='youtube-widget-styles';
      s.textContent = `#youtube-widget-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:1rem}.yt-video-card{cursor:pointer;border:1px solid #ddd;border-radius:8px;overflow:hidden;background:#fff;transition:box-shadow 0.2s}.yt-video-card:hover{box-shadow:0 4px 12px rgba(0,0,0,0.15)}.yt-video-thumb{width:100%;aspect-ratio:16/9;object-fit:cover;display:block}.yt-video-title{font-size:14px;font-weight:500;padding:0.5rem;color:#222;line-height:1.3}#yt-modal{position:fixed;inset:0;background:rgba(0,0,0,0.7);display:none;align-items:center;justify-content:center;z-index:9999}#yt-modal-content{position:relative;width:90%;max-width:800px;aspect-ratio:16/9;background:#000}#yt-modal iframe{width:100%;height:100%;border:0}#yt-modal-close{position:absolute;top:-40px;right:0;background:#fff;border:0;padding:8px 12px;cursor:pointer;border-radius:4px;font-size:14px}`;
      document.head.appendChild(s);
    }

    // helper: fetch and render
    async function loadVideos(q, detectLive=false) {
      grid.innerHTML = '<div>Cargando...</div>';
      try {
        const url = new URL(endpointBase, location.origin);
        url.searchParams.set('channelId', channelId);
        url.searchParams.set('limit', limit);
        if (q) url.searchParams.set('q', q);
        if (detectLive) url.searchParams.set('detectLive', '1');

        const resp = await fetch(url.toString());
        if (!resp.ok) {
          grid.innerHTML = `<div>Error cargando videos (status ${resp.status})</div>`;
          return;
        }
        const data = await resp.json();
        grid.innerHTML = '';
        // live handling
        if (data.live) {
          liveBtn.disabled = false;
          liveBtn.textContent = 'Ver en vivo ▶';
          liveBtn.onclick = () => {
            modal.style.display='flex';
            modalIframe.src = `https://www.youtube.com/embed/${encodeURIComponent(data.live.id)}?autoplay=1`;
          };
        } else {
          liveBtn.disabled = true;
          liveBtn.textContent = 'No hay transmisión en vivo';
          liveBtn.onclick = null;
        }

        if (!data.videos || !data.videos.length) {
          grid.innerHTML = '<div>No se encontraron videos.</div>';
          return;
        }
        data.videos.forEach(v => {
          const card = document.createElement('div'); card.className='yt-video-card';
          const thumb = v.thumbnail || (`https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`);
          card.innerHTML = `<img class="yt-video-thumb" src="${thumb}" alt="${escapeHtml(v.title)}"><div class="yt-video-title">${escapeHtml(v.title)}</div>`;
          card.addEventListener('click', ()=>{ modal.style.display='flex'; modalIframe.src=`https://www.youtube.com/embed/${encodeURIComponent(v.id)}?autoplay=1`; });
          grid.appendChild(card);
        });
      } catch (err) {
        console.error('widget load error', err);
        grid.innerHTML = '<div>Error cargando videos.</div>';
      }
    }

    // debounce search
    let to = null;
    searchInput.addEventListener('input', ()=> {
      clearTimeout(to);
      to = setTimeout(()=> loadVideos(searchInput.value, false), 400);
    });

    // initial load (with live detection)
    await loadVideos('', true);
  });

  function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, (m)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
})();
