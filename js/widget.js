/* js/widget.js
   Widget completo: playlists, uploads (todos), buscador, live, paginación.
   Requiere que data-endpoint apunte a /api/youtube (o al endpoint completo en Vercel).
*/
(function() {
  function ready(fn){ if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }

  function findThisScript(){
    if (document.currentScript) return document.currentScript;
    const scripts = Array.from(document.getElementsByTagName('script'));
    for (let i = scripts.length - 1; i >= 0; i--){
      const s = scripts[i];
      if (s.dataset && (s.dataset.endpoint || s.dataset.channelId || s.dataset.limit)) return s;
    }
    for (let i = scripts.length - 1; i >= 0; i--){
      const s = scripts[i];
      try{ if (s.src && s.src.indexOf('widget.js') !== -1) return s; } catch(e){}
    }
    return scripts[scripts.length-1] || null;
  }

  ready(async function(){
    const scriptEl = findThisScript();
    if (!scriptEl) { console.error('widget: script tag not found'); return; }

    const ENDPOINT = scriptEl.dataset.endpoint || '/api/youtube';
    const CHANNEL = (scriptEl.dataset.channelId || '@radioefectopositivo').replace(/^@/,'');
    const PAGE_LIMIT = parseInt(scriptEl.dataset.limit || 12, 10);

    const container = document.getElementById('youtube-widget');
    if (!container) { console.error('widget: container #youtube-widget not found'); return; }

    // basic UI structure
    container.innerHTML = '';
    const header = document.createElement('div'); header.style.display='flex'; header.style.gap='8px'; header.style.alignItems='center'; header.style.marginBottom='12px';
    const playlistSelect = document.createElement('select'); playlistSelect.style.padding='6px'; playlistSelect.style.borderRadius='6px';
    const searchInput = document.createElement('input'); searchInput.type='search'; searchInput.placeholder='Buscar en el canal...'; searchInput.style.flex='1'; searchInput.style.padding='8px'; searchInput.style.border='1px solid #ddd'; searchInput.style.borderRadius='6px';
    const liveBtn = document.createElement('button'); liveBtn.textContent='Buscar en vivo'; liveBtn.disabled=true; liveBtn.style.padding='8px 10px'; liveBtn.style.borderRadius='6px'; liveBtn.style.border='1px solid #e33'; liveBtn.style.background='#fff'; liveBtn.style.color='#e33';
    header.appendChild(playlistSelect); header.appendChild(searchInput); header.appendChild(liveBtn);
    container.appendChild(header);

    // grid + load more
    const grid = document.createElement('div'); grid.id='youtube-widget-grid'; grid.style.display='grid'; grid.style.gridTemplateColumns='repeat(auto-fill,minmax(220px,1fr))'; grid.style.gap='1rem';
    container.appendChild(grid);

    const loaderWrap = document.createElement('div'); loaderWrap.style.marginTop='12px'; loaderWrap.style.textAlign='center';
    const loadMoreBtn = document.createElement('button'); loadMoreBtn.textContent='Cargar más'; loadMoreBtn.style.padding='8px 12px'; loadMoreBtn.style.borderRadius='6px'; loadMoreBtn.style.border='1px solid #333'; loadMoreBtn.style.background='#fff';
    const statusSpan = document.createElement('div'); statusSpan.style.marginTop='8px'; statusSpan.style.color='#666';
    loaderWrap.appendChild(loadMoreBtn); loaderWrap.appendChild(statusSpan);
    container.appendChild(loaderWrap);

    // modal
    const modal = document.createElement('div'); modal.id='yt-modal'; modal.style.position='fixed'; modal.style.inset='0'; modal.style.background='rgba(0,0,0,0.7)'; modal.style.display='none'; modal.style.alignItems='center'; modal.style.justifyContent='center'; modal.style.zIndex='9999';
    modal.innerHTML = `<div id="yt-modal-content" style="position:relative;width:90%;max-width:900px;aspect-ratio:16/9;background:#000"><button id="yt-modal-close" style="position:absolute;top:-40px;right:0;background:#fff;border:none;padding:8px 12px;border-radius:6px;cursor:pointer">Cerrar ✖</button><iframe id="yt-modal-iframe" src="" allowfullscreen style="width:100%;height:100%;border:0"></iframe></div>`;
    document.body.appendChild(modal);
    const modalIframe = modal.querySelector('#yt-modal-iframe');
    const modalClose = modal.querySelector('#yt-modal-close');
    modalClose.addEventListener('click', closeModal);
    modal.addEventListener('click', (e)=> { if (e.target===modal) closeModal(); });
    function closeModal(){ modal.style.display='none'; modalIframe.src=''; }

    // inject styles if not present (id to avoid duplication)
    if (!document.getElementById('youtube-widget-styles')) {
      const style = document.createElement('style'); style.id='youtube-widget-styles';
      style.textContent = `
        .yt-video-card{cursor:pointer;border:1px solid #ddd;border-radius:8px;overflow:hidden;background:#fff;transition:box-shadow .2s}
        .yt-video-card:hover{box-shadow:0 4px 12px rgba(0,0,0,.15)}
        .yt-video-thumb{width:100%;aspect-ratio:16/9;object-fit:cover;display:block}
        .yt-video-title{font-size:14px;font-weight:500;padding:.5rem;color:#222;line-height:1.3}
        .playlist-option { padding:6px }
      `;
      document.head.appendChild(style);
    }

    // state
    let currentMode = 'uploads'; // 'uploads' or 'playlist' or 'search'
    let currentPlaylistId = null;
    let nextPageToken = null;
    let loading = false;
    let lastQuery = '';

    // helpers
    function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, (m)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
    function setStatus(t){ statusSpan.textContent = t || ''; }
    function setLoading(v){ loading = v; loadMoreBtn.disabled = v; if (v) setStatus('Cargando...'); else setStatus(''); }

    async function apiFetch(params){
      const url = new URL(ENDPOINT, location.origin);
      Object.keys(params).forEach(k=> url.searchParams.set(k, params[k]));
      // ensure channelId param
      if (!url.searchParams.get('channelId')) url.searchParams.set('channelId', CHANNEL);
      const r = await fetch(url.toString());
      if (!r.ok) {
        const text = await r.text().catch(()=>null);
        throw new Error(`Status ${r.status} - ${text||r.statusText}`);
      }
      return r.json();
    }

    // load playlists
    async function loadPlaylists(){
      try {
        setLoading(true);
        const data = await apiFetch({ action:'playlists', limit:50 });
        playlistSelect.innerHTML = '';
        // default "Todos" option
        const optAll = document.createElement('option'); optAll.value = '__uploads__'; optAll.textContent = 'Todos los uploads'; optAll.className='playlist-option';
        playlistSelect.appendChild(optAll);
        (data.playlists||[]).forEach(p => {
          const o = document.createElement('option');
          o.value = p.id;
          o.textContent = `${p.title} (${p.count||0})`;
          o.className = 'playlist-option';
          playlistSelect.appendChild(o);
        });
      } catch(err){
        console.error('Error cargando playlists', err);
        setStatus('Error cargando playlists');
      } finally { setLoading(false); }
    }

    // load videos depending on mode
    async function loadInitialVideos(){
      grid.innerHTML = '';
      nextPageToken = null;
      setStatus('');
      if (currentMode === 'search' && !lastQuery) { grid.innerHTML = '<div>Ingresa un término para buscar.</div>'; return; }
      await loadMore();
    }

    async function loadMore(){
      if (loading) return;
      setLoading(true);
      try {
        let params = { limit: PAGE_LIMIT };
        if (nextPageToken) params.pageToken = nextPageToken;

        if (currentMode === 'uploads') {
          params.action = 'uploads';
        } else if (currentMode === 'playlist') {
          params.action = 'playlistVideos';
          params.playlistId = currentPlaylistId;
        } else if (currentMode === 'search') {
          params.action = 'search';
          params.q = lastQuery;
        }

        const data = await apiFetch(params);

        // handle live for top-level (call separate endpoint)
        if (params.action !== 'live' && !liveBtn.dataset.checkedLive) {
          // check live
          try {
            const live = await apiFetch({ action:'live' });
            liveBtn.dataset.checkedLive = '1';
            if (live && live.live) {
              liveBtn.disabled = false;
              liveBtn.textContent = 'Ver en vivo ▶';
              liveBtn.onclick = ()=> { modal.style.display='flex'; modalIframe.src = `https://www.youtube.com/embed/${encodeURIComponent(live.live.id)}?autoplay=1`; };
            } else {
              liveBtn.disabled = true;
              liveBtn.textContent = 'No hay transmisión en vivo';
              liveBtn.onclick = null;
            }
          } catch(e){
            // ignore live check errors
            liveBtn.disabled = true;
            liveBtn.textContent = 'Buscar en vivo';
          }
        }

        const items = data.videos || [];
        if (!items.length && !nextPageToken && grid.children.length === 0) {
          grid.innerHTML = '<div>No se encontraron videos.</div>';
        } else {
          items.forEach(v => {
            const card = document.createElement('div'); card.className='yt-video-card';
            const thumb = v.thumbnail || (`https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`);
            card.innerHTML = `<img class="yt-video-thumb" src="${escapeHtml(thumb)}" alt="${escapeHtml(v.title)}"><div class="yt-video-title">${escapeHtml(v.title)}</div>`;
            card.addEventListener('click', ()=> {
              modal.style.display='flex';
              modalIframe.src = `https://www.youtube.com/embed/${encodeURIComponent(v.id)}?autoplay=1`;
            });
            grid.appendChild(card);
          });
        }

        nextPageToken = data.nextPageToken || null;
        if (!nextPageToken) {
          loadMoreBtn.style.display = 'none';
        } else {
          loadMoreBtn.style.display = 'inline-block';
        }
        setStatus('');
      } catch(err){
        console.error('Error cargando videos', err);
        setStatus('Error cargando videos: ' + (err.message||err));
      } finally { setLoading(false); }
    }

    // events
    playlistSelect.addEventListener('change', async ()=>{
      const val = playlistSelect.value;
      if (val === '__uploads__') {
        currentMode = 'uploads';
        currentPlaylistId = null;
      } else {
        currentMode = 'playlist';
        currentPlaylistId = val;
      }
      lastQuery = '';
      searchInput.value = '';
      await loadInitialVideos();
    });

    let debounce = null;
    searchInput.addEventListener('input', ()=> {
      clearTimeout(debounce);
      debounce = setTimeout(async ()=>{
        const q = searchInput.value.trim();
        if (!q) {
          // empty search => show uploads or playlist
          lastQuery = '';
          currentMode = (currentPlaylistId? 'playlist' : 'uploads');
        } else {
          lastQuery = q;
          currentMode = 'search';
        }
        await loadInitialVideos();
      }, 450);
    });

    loadMoreBtn.addEventListener('click', async ()=> { await loadMore(); });

    // initial flow
    await loadPlaylists();
    // default select first option
    playlistSelect.value = '__uploads__';
    currentMode = 'uploads';
    await loadInitialVideos();

  }); // end ready
})();
