/* js/widget.js
   Cliente: widget que consume /api/youtube
   Reemplaza/actualiza tu widget.js con este.
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
      try { if (s.src && s.src.indexOf('widget.js') !== -1) return s; } catch(e){}
    }
    return scripts[scripts.length - 1] || null;
  }

  ready(async function() {
    const s = findThisScript();
    if (!s) { console.error('widget: script tag not found'); return; }

    const ENDPOINT = s.dataset.endpoint || '/api/youtube';
    const CHANNEL = (s.dataset.channelId || '@radioefectopositivo').replace(/^@/,'');
    const PAGE_LIMIT = parseInt(s.dataset.limit || 12, 10);

    const container = document.getElementById('youtube-widget');
    if (!container) { console.error('widget: container #youtube-widget not found'); return; }

    // Build UI (consistent with previous dark theme)
    container.innerHTML = '';
    const shell = document.createElement('div'); shell.className = 'ywp-shell';
    const header = document.createElement('div'); header.className = 'ywp-header';
    const playlistWrap = document.createElement('div'); playlistWrap.className = 'ywp-playlist-wrap';
    const playlistLabel = document.createElement('label'); playlistLabel.textContent = 'Playlists'; playlistLabel.className='ywp-label';
    const playlistSelect = document.createElement('select'); playlistSelect.className='ywp-select';
    playlistWrap.appendChild(playlistLabel); playlistWrap.appendChild(playlistSelect);

    const searchWrap = document.createElement('div'); searchWrap.className='ywp-search-wrap';
    const searchInput = document.createElement('input'); searchInput.type='search'; searchInput.placeholder='Buscar...'; searchInput.className='ywp-search';
    searchWrap.appendChild(searchInput);

    const orderWrap = document.createElement('div'); orderWrap.className='ywp-order-wrap';
    const orderLabel = document.createElement('label'); orderLabel.textContent='Orden'; orderLabel.className='ywp-label';
    const orderSelect = document.createElement('select'); orderSelect.className='ywp-select';
    const o1 = document.createElement('option'); o1.value='date_desc'; o1.textContent='Más recientes';
    const o2 = document.createElement('option'); o2.value='date_asc'; o2.textContent='Más antiguos';
    orderSelect.appendChild(o1); orderSelect.appendChild(o2);
    orderWrap.appendChild(orderLabel); orderWrap.appendChild(orderSelect);

    const liveWrap = document.createElement('div'); liveWrap.className='ywp-live-wrap';
    const liveBtn = document.createElement('button'); liveBtn.className='ywp-live-btn'; liveBtn.style.display='none';
    liveWrap.appendChild(liveBtn);

    header.appendChild(playlistWrap); header.appendChild(searchWrap); header.appendChild(orderWrap); header.appendChild(liveWrap);
    shell.appendChild(header);

    const content = document.createElement('div'); content.className='ywp-content';
    const grid = document.createElement('div'); grid.id='youtube-widget-grid'; grid.className='ywp-grid';
    content.appendChild(grid);
    shell.appendChild(content);

    const footer = document.createElement('div'); footer.className='ywp-footer';
    const loadMoreBtn = document.createElement('button'); loadMoreBtn.className='ywp-loadmore'; loadMoreBtn.textContent='Cargar más'; loadMoreBtn.style.display='none';
    const status = document.createElement('div'); status.className='ywp-status';
    footer.appendChild(loadMoreBtn); footer.appendChild(status);
    shell.appendChild(footer);

    const modal = document.createElement('div'); modal.id='ywp-modal'; modal.className='ywp-modal';
    modal.innerHTML = `<div class="ywp-modal-content" role="dialog" aria-modal="true"><button class="ywp-modal-close" aria-label="Cerrar reproductor">Cerrar ✖</button><iframe class="ywp-modal-iframe" src="" allowfullscreen></iframe></div>`;
    document.body.appendChild(modal);
    const modalIframe = modal.querySelector('.ywp-modal-iframe');
    const modalClose = modal.querySelector('.ywp-modal-close');
    function openModal(id){ modal.style.display='flex'; modalIframe.src = `https://www.youtube.com/embed/${encodeURIComponent(id)}?autoplay=1`; modal.setAttribute('aria-hidden','false'); }
    function closeModal(){ modal.style.display='none'; modalIframe.src=''; modal.setAttribute('aria-hidden','true'); }
    modalClose.addEventListener('click', closeModal);
    modal.addEventListener('click', (e)=> { if (e.target === modal) closeModal(); });

    container.appendChild(shell);

    // inject styles if missing (keep consistent)
    if (!document.getElementById('ywp-styles')) {
      const st = document.createElement('style'); st.id='ywp-styles';
      st.textContent = `
        .ywp-shell{box-sizing:border-box;background:#0b0b0c;color:#e6e6e6;padding:20px;border-radius:10px;width:100%;max-width:1100px;margin:10px auto}
        .ywp-header{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:14px}
        .ywp-label{display:block;font-size:13px;color:#cfcfcf;margin-bottom:6px}
        .ywp-select{width:100%;padding:8px 10px;border-radius:8px;border:1px solid #222;background:#111;color:#eee}
        .ywp-search{width:100%;padding:10px 12px;border-radius:8px;border:1px solid #222;background:#0f0f10;color:#eee;font-size:14px}
        .ywp-grid{display:grid;gap:14px;grid-template-columns:repeat(4,1fr)}
        .yt-video-card{cursor:pointer;border-radius:8px;overflow:hidden;background:#111;border:1px solid #1d1d1d;box-shadow:0 2px 6px rgba(0,0,0,.6);transition:transform .12s,box-shadow .12s}
        .yt-video-card:hover{transform:translateY(-4px);box-shadow:0 8px 24px rgba(0,0,0,.6)}
        .yt-video-thumb{width:100%;height:0;padding-bottom:56.25%;background-size:cover;background-position:center;display:block}
        .yt-video-title{padding:10px;font-size:14px;color:#f5f5f5;line-height:1.3;min-height:40px}
        .ywp-loadmore{padding:10px 14px;border-radius:8px;border:1px solid #333;background:#121212;color:#eee;cursor:pointer}
        .ywp-status{margin-top:8px;color:#bdbdbd;font-size:13px}
        .ywp-modal{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.75);z-index:99999}
        .ywp-modal-content{width:90%;max-width:1000px;aspect-ratio:16/9;background:#000;position:relative;border-radius:8px;overflow:hidden}
        .ywp-modal-close{position:absolute;top:-42px;right:0;background:#fff;color:#111;border:none;padding:8px 12px;border-radius:6px;cursor:pointer}
        @media(max-width:1200px){ .ywp-grid{grid-template-columns:repeat(3,1fr)} .ywp-shell{max-width:980px;padding:16px} }
        @media(max-width:900px){ .ywp-grid{grid-template-columns:repeat(2,1fr)} .ywp-shell{padding:14px} }
        @media(max-width:560px){ .ywp-grid{grid-template-columns:repeat(1,1fr);gap:10px} .ywp-header{gap:8px} .ywp-shell{padding:12px;border-radius:6px;margin:8px} .yt-video-title{font-size:13px;padding:8px;min-height:46px} }
      `;
      document.head.appendChild(st);
    }

    // state
    let currentMode = 'uploads'; // uploads | playlist | search
    let currentPlaylistId = null;
    let nextPageToken = null;
    let loading = false;
    let lastQuery = '';
    let currentOrder = 'date_desc'; // 'date_desc' or 'date_asc'

    // helpers
    function setStatus(t){ status.textContent = t || ''; }
    function setLoading(v){ loading = v; loadMoreBtn.disabled = v; if (v) setStatus('Cargando...'); else setStatus(''); }

    async function apiFetch(params){
      const url = new URL(ENDPOINT, location.origin);
      Object.keys(params).forEach(k => { if (params[k] !== undefined && params[k] !== null) url.searchParams.set(k, params[k]); });
      if (!url.searchParams.get('channelId')) url.searchParams.set('channelId', CHANNEL);
      const resp = await fetch(url.toString());
      if (!resp.ok) {
        const txt = await resp.text().catch(()=>null);
        throw new Error(`Status ${resp.status} - ${txt || resp.statusText}`);
      }
      return resp.json();
    }

    // render card with meta (publishedAt)
    function renderVideoCard(v){
      const div = document.createElement('div'); div.className = 'yt-video-card';
      const thumb = document.createElement('div'); thumb.className = 'yt-video-thumb';
      const urlThumb = v.thumbnail || (`https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`);
      thumb.style.backgroundImage = `url("${urlThumb}")`;
      const title = document.createElement('div'); title.className = 'yt-video-title'; title.textContent = v.title || 'Sin título';
      div.appendChild(thumb); div.appendChild(title);
      // store meta for potential future client use
      div.__meta = { publishedAt: v.publishedAt || '' };
      div.setAttribute('data-published', v.publishedAt || '');
      div.addEventListener('click', ()=> openModal(v.id));
      return div;
    }

    // load playlists
    async function loadPlaylists(){
      try {
        setLoading(true);
        const data = await apiFetch({ action:'playlists', limit:50 });
        playlistSelect.innerHTML = '';
        const labelOpt = document.createElement('option'); labelOpt.value='__label__'; labelOpt.textContent='Playlists'; labelOpt.disabled = true;
        playlistSelect.appendChild(labelOpt);
        const allOpt = document.createElement('option'); allOpt.value='__uploads__'; allOpt.textContent='Todos los uploads';
        playlistSelect.appendChild(allOpt);
        (data.playlists || []).forEach(p => {
          const o = document.createElement('option'); o.value = p.id; o.textContent = `${p.title} (${p.count||0})`; playlistSelect.appendChild(o);
        });
        if (playlistSelect.options.length > 1) playlistSelect.selectedIndex = 1;
      } catch(err) {
        console.error('Error playlists', err);
        setStatus('Error cargando playlists');
      } finally { setLoading(false); }
    }

    // load initial
    async function loadInitial(){
      grid.innerHTML = '';
      nextPageToken = null;
      setStatus('');
      await loadMore();
    }

    async function loadMore(){
      if (loading) return;
      setLoading(true);
      try {
        const params = { limit: PAGE_LIMIT };
        if (nextPageToken) params.pageToken = nextPageToken;
        params.order = currentOrder;

        if (currentMode === 'uploads') params.action = 'uploads';
        else if (currentMode === 'playlist') { params.action = 'playlistVideos'; params.playlistId = currentPlaylistId; }
        else if (currentMode === 'search') { params.action = 'search'; params.q = lastQuery; }

        const data = await apiFetch(params);

        // live check once
        if (!liveBtn.dataset.checked) {
          try {
            const l = await apiFetch({ action:'live' });
            liveBtn.dataset.checked = '1';
            if (l && l.live) {
              liveBtn.style.display = 'inline-flex';
              liveBtn.textContent = 'En vivo ▶';
              liveBtn.onclick = ()=> openModal(l.live.id);
            } else {
              liveBtn.style.display = 'none';
            }
          } catch(e){
            liveBtn.style.display = 'none';
          }
        }

        const items = data.videos || [];
        if (!items.length && !nextPageToken && grid.children.length === 0) {
          grid.innerHTML = '<div>No se encontraron videos.</div>';
        } else {
          items.forEach(v => {
            const card = renderVideoCard(v);
            grid.appendChild(card);
          });
        }

        // nextPageToken: either YouTube token (date_desc / search / playlist) or numeric offset string (date_asc)
        nextPageToken = (data.nextPageToken === null || data.nextPageToken === undefined) ? null : data.nextPageToken;
        loadMoreBtn.style.display = nextPageToken ? 'inline-block' : 'none';
        setStatus('');
      } catch(err) {
        console.error('Error cargando videos', err);
        setStatus('Error cargando videos');
      } finally { setLoading(false); }
    }

    // events
    playlistSelect.addEventListener('change', async ()=>{
      const v = playlistSelect.value;
      lastQuery = ''; searchInput.value = '';
      if (v === '__uploads__') { currentMode = 'uploads'; currentPlaylistId = null; }
      else { currentMode = 'playlist'; currentPlaylistId = v; }
      nextPageToken = null; grid.innerHTML = '';
      await loadInitial();
    });

    let debounce = null;
    searchInput.addEventListener('input', ()=> {
      clearTimeout(debounce);
      debounce = setTimeout(async ()=> {
        const q = searchInput.value.trim();
        if (!q) { lastQuery=''; currentMode = (currentPlaylistId ? 'playlist' : 'uploads'); }
        else { lastQuery = q; currentMode = 'search'; }
        nextPageToken = null; grid.innerHTML = '';
        await loadInitial();
      }, 420);
    });

    orderSelect.addEventListener('change', async ()=>{
      currentOrder = orderSelect.value;
      // Reset and re-load from server with new order
      nextPageToken = null; grid.innerHTML = '';
      await loadInitial();
    });

    loadMoreBtn.addEventListener('click', ()=> loadMore());

    // initial
    await loadPlaylists();
    // default selection: uploads
    if (playlistSelect.options.length > 1) playlistSelect.selectedIndex = 1;
    currentMode = 'uploads';
    currentOrder = 'date_desc';
    await loadInitial();

  }); // end ready
})();
