/* js/widget.js
   Versión corregida: control robusto de peticiones para evitar apilamiento
   - No hay opción asc/desc
   - Tabs basados en ALLOWED_PLAYLISTS (rellena con tus playlist IDs)
   - Paginación por páginas (pageSize configurable)
   - AbortController por petición y validación requestId antes de render
   - Fallback RSS si la API devuelve quotaExceeded
*/

(function(){
  function ready(fn){ if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  function findScript(){ if (document.currentScript) return document.currentScript; const s = Array.from(document.getElementsByTagName('script')); for (let i=s.length-1;i>=0;i--){ const sc=s[i]; if (sc.dataset && (sc.dataset.endpoint||sc.dataset.channelId)) return sc; } return s[s.length-1]||null; }

  ready(async function(){
    const sc = findScript();
    if (!sc){ console.error('widget script tag not found'); return; }

    const ENDPOINT = sc.dataset.endpoint || '/api/youtube';
    const CHANNEL = (sc.dataset.channelId || '@radioefectopositivo').replace(/^@/,'');
    const PAGE_SIZE = Number(sc.dataset.pageSize || 12);

    const root = document.getElementById('youtube-widget');
    if (!root){ console.error('#youtube-widget not found'); return; }
    root.innerHTML = '';

    // -------------------------
    // CONFIG: PASTE HERE your playlist IDs (REQUIRED)
    // -------------------------
    const ALLOWED_PLAYLISTS = [
      { id: 'PL06d3Nw-68RVfTySoWo04Zf2-s3aEI2B4', title: 'Vuelta a casa' },
      { id: 'PL06d3Nw-68RU0lodA7BjIUCqCQjc7ptAL', title: 'Conociendo a Dios' },
      { id: 'PL06d3Nw-68RU5zyPjHEOYtT1VIdX6QlNC', title: 'Jesus... la revelación' },
      { id: 'PL06d3Nw-68RVRPINt4Grb74yn5p8TmFyp', title: 'Encuentro con Efecto Positivo' }
    ];

    // -------------------------
    // UI build
    // -------------------------
    const shell = document.createElement('div'); shell.className='ywp-shell';
    const header = document.createElement('div'); header.className='ywp-header';
    const tabsWrap = document.createElement('div'); tabsWrap.className='ywp-tabs';
    const searchWrap = document.createElement('div'); searchWrap.className='ywp-search-wrap';
    const searchInput = document.createElement('input'); searchInput.type='search'; searchInput.placeholder='Buscar...'; searchInput.className='ywp-search'; searchInput.id = 'ywp-search-input'; searchInput.name = 'ywp-search';
    searchWrap.appendChild(searchInput);

    const liveWrap = document.createElement('div'); liveWrap.className='ywp-live-wrap';
    const liveBtn = document.createElement('button'); liveBtn.className='ywp-live-btn'; liveBtn.style.display='none';
    liveWrap.appendChild(liveBtn);

    header.appendChild(tabsWrap); header.appendChild(searchWrap); header.appendChild(liveWrap);
    shell.appendChild(header);

    const content = document.createElement('div'); content.className='ywp-content';
    const grid = document.createElement('div'); grid.className='ywp-grid';
    content.appendChild(grid);
    shell.appendChild(content);

    const pager = document.createElement('div'); pager.className='ywp-pager';
    const prevBtn = document.createElement('button'); prevBtn.textContent='‹ Prev'; prevBtn.className='ywp-page-btn';
    const pagesWrap = document.createElement('span'); pagesWrap.className='ywp-pages';
    const nextBtn = document.createElement('button'); nextBtn.textContent='Next ›'; nextBtn.className='ywp-page-btn';
    pager.appendChild(prevBtn); pager.appendChild(pagesWrap); pager.appendChild(nextBtn);
    shell.appendChild(pager);

    // --- Modal: creación y control (reemplazar bloque existente) ---
const modal = document.createElement('div');
modal.className = 'ywp-modal';
modal.innerHTML = `
  <div class="ywp-modal-content" role="dialog">
    <button class="ywp-modal-close" aria-label="Cerrar">Cerrar ✖</button>
    <iframe class="ywp-modal-iframe" src="" frameborder="0" allow="autoplay; fullscreen; encrypted-media" allowfullscreen playsinline></iframe>
  </div>
`;
document.body.appendChild(modal);

const modalIframe = modal.querySelector('.ywp-modal-iframe');
const modalClose = modal.querySelector('.ywp-modal-close');

// Asegurarse que el iframe no tenga src por defecto
modalIframe.src = '';

// openModal y closeModal robustos
function openModal(id){
  // esto debe ejecutarse como resultado del click del usuario
  modal.style.display = 'flex';
  // limpiar y luego setear src con autoplay silenciado y playsinline
  modalIframe.src = '';
  // builds src ensuring playsinline, muted (mejor compatibilidad movil)
  modalIframe.src = `https://www.youtube.com/embed/${encodeURIComponent(id)}?autoplay=1&muted=1&playsinline=1&rel=0&modestbranding=1`;
  // foco accesible en botón cerrar
  try { modalClose.focus(); } catch(e){}
}

function closeModal(){
  modal.style.display = 'none';
  // quitar src para detener reproducción y liberar recursos
  modalIframe.src = '';
}

// listeners
modalClose.addEventListener('click', closeModal);
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });


    root.appendChild(shell);

    // styles
    if (!document.getElementById('ywp-styles')) {
      const css = document.createElement('style'); css.id='ywp-styles';
      css.textContent = `
      .ywp-shell{background:#0b0b0c70;color:#e6e6e6;padding:18px;border-radius:10px;max-width:1100px;margin:12px auto}
      .ywp-header{display:flex;justify-content:center;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:12px}
      .ywp-tabs{display:flex;gap:6px;flex-wrap:wrap;justify-content:center}
      .ywp-tab{background:#111;border:1px solid #222;padding:8px 12px;border-radius:8px;color:#ddd;cursor:pointer}
      .ywp-tab.active{background:#222;border-color:#444;color:#fff;font-weight:600}
      .ywp-search{padding:8px 10px;border-radius:8px;border:1px solid #222;background:#0f0f10;color:#eee;min-width:200px}
      .ywp-grid{display:grid;gap:12px;grid-template-columns:repeat(4,1fr)}
      .yt-video-card{background:#111;border-radius:8px;overflow:hidden;cursor:pointer;border:1px solid #1d1d1d}
      .ywp-thumb{width:100%;height:0;padding-bottom:56.25%;background-size:cover;background-position:center}
      .yt-video-title{padding:8px;font-size:14px;color:#f5f5f5}
      .ywp-pager{display:flex;gap:8px;align-items:center;justify-content:center;margin-top:12px}
      .ywp-page-btn{padding:8px 10px;border-radius:6px;background:#121212;color:#eee;border:1px solid #2a2a2a;cursor:pointer}
      .ywp-page-num{padding:6px 8px;border-radius:6px;background:#0f0f10;border:1px solid #222;margin:0 3px;cursor:pointer}
      .ywp-page-num.active{background:#444;color:#fff}
      .ywp-live-btn{background:#e33;color:#fff;padding:8px 10px;border-radius:8px;border:0;cursor:pointer}
      @media(max-width:900px){ .ywp-grid{grid-template-columns:repeat(2,1fr)} }
      @media(max-width:560px){ .ywp-grid{grid-template-columns:repeat(1,1fr)} .ywp-search{min-width:140px} }
      /* Modal — arreglar tamaño del iframe y botón cerrar */
      .ywp-modal{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.75);z-index:9999;padding: 20px; /* espacio alrededor para mobile */box-sizing: border-box;}
      .ywp-modal-content{width:100%;max-width:1180px;background:#000;position:relative;border-radius:8px;overflow:hidden;/* usar relacion 16:9 pero permitir que el iframe llene completamente */aspect-ratio: 16 / 9;display:flex;}
      .ywp-modal-iframe{border:0;width:100%;height:100%;display:block;}
      .ywp-modal-close{position:absolute;top:10px;right:10px;background:rgba(255,255,255,0.95);color:#111;border:none;padding:6px 10px;border-radius:6px;cursor:pointer;z-index: 2;font-weight:600;}
      @media(max-width:760px){.ywp-modal-content{ width:100%; max-width:100%; border-radius:6px; }
      .ywp-modal-close{ top:6px; right:6px; padding:5px 8px; }
      }

      `;
      document.head.appendChild(css);
    }

    // state
    let currentPage = 1;
    let pageCount = null;
    let activeTab = { type:'uploads', id: null };
    let lastQuery = '';
    let liveChecked = false;

    // abort + request id
    let currentFetchController = null;
    let lastRequestId = 0;

    function createTabElement(title, meta){
      const btn = document.createElement('button'); btn.className='ywp-tab'; btn.textContent = title;
      btn.dataset.meta = JSON.stringify(meta || {});
      return btn;
    }

    // fetch wrapper (does not manage requestId)
    async function fetchApiWithSignal(params, signal){
      const url = new URL(ENDPOINT, location.origin);
      Object.keys(params || {}).forEach(k => { if (params[k] !== undefined && params[k] !== null) url.searchParams.set(k, params[k]); });
      if (!url.searchParams.get('channelId')) url.searchParams.set('channelId', CHANNEL);
      if (!url.searchParams.get('pageSize')) url.searchParams.set('pageSize', PAGE_SIZE);
      const r = await fetch(url.toString(), { signal });
      if (!r.ok) {
        const t = await r.text().catch(()=>null);
        throw new Error(`Status ${r.status} - ${t||r.statusText}`);
      }
      return r.json();
    }

    // fallback RSS (no signal support, but we'll validate requestId before rendering)
    async function fetchRSSFallback(){
      try {
        const rssUrl = new URL('/api/videos-rss', location.origin);
        const r = await fetch(rssUrl.toString());
        if (!r.ok) throw new Error('RSS fallback failed');
        const data = await r.json();
        return { videos: (data.items || data.videos || []).slice(0, PAGE_SIZE), page:1 };
      } catch(e){
        throw e;
      }
    }

    // render videos (will be called only after requestId validation)
    function renderVideos(videos){
      grid.innerHTML = '';
      if (!videos || !videos.length) {
        grid.innerHTML = '<div>No se encontraron videos.</div>';
        return;
      }
      videos.forEach(v => {
        const card = document.createElement('div'); card.className='yt-video-card';
        const thumb = document.createElement('div'); thumb.className='ywp-thumb';
        thumb.style.backgroundImage = `url("${v.thumbnail || (`https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`)}")`;
        const title = document.createElement('div'); title.className='yt-video-title'; title.textContent = v.title || 'Sin título';
        card.appendChild(thumb); card.appendChild(title);
        card.dataset.published = v.publishedAt || '';
        card.addEventListener('click', ()=> openModal(v.id));
        grid.appendChild(card);
      });
    }

    function renderPager(){
      pagesWrap.innerHTML = '';
      if (pageCount && pageCount > 1) {
        const total = pageCount;
        const maxButtons = 7;
        let start = Math.max(1, currentPage - Math.floor(maxButtons/2));
        let end = Math.min(total, start + maxButtons - 1);
        if (end - start < maxButtons - 1) start = Math.max(1, end - maxButtons + 1);
        for (let i=start;i<=end;i++){
          const pbtn = document.createElement('button'); pbtn.className='ywp-page-num'; pbtn.textContent = i;
          if (i === currentPage) pbtn.classList.add('active');
          pbtn.addEventListener('click', ()=> { goToPage(i); });
          pagesWrap.appendChild(pbtn);
        }
      } else {
        const span = document.createElement('span'); span.textContent = `Página ${currentPage}`; span.style.color='#ddd';
        pagesWrap.appendChild(span);
      }
      prevBtn.disabled = currentPage <= 1;
      nextBtn.disabled = (pageCount ? currentPage >= pageCount : false);
    }

    // init tabs using ALLOWED_PLAYLISTS
    async function initTabs(){
      try {
        tabsWrap.innerHTML = '';
        const tabAll = createTabElement('Todos los videos', { type:'uploads' });
        tabAll.classList.add('active');
        tabAll.addEventListener('click', ()=> activateTab({ type:'uploads' }));
        tabsWrap.appendChild(tabAll);

        (ALLOWED_PLAYLISTS || []).forEach(pl => {
          if (!pl.id) return;
          const t = createTabElement(pl.title || 'Playlist', { type:'playlist', id: pl.id });
          t.addEventListener('click', ()=> activateTab({ type:'playlist', id: pl.id }));
          tabsWrap.appendChild(t);
        });
      } catch(e){
        console.error('initTabs error', e);
        tabsWrap.innerHTML = '<div style="color:#f88">No se pudieron crear las pestañas.</div>';
      }
    }

    // --- Reemplazar activateTab y loadPage por estas versiones ---
    let globalRenderToken = null; // token global para validar renderizaciones

    async function activateTab(tabSpec){
      Array.from(tabsWrap.children).forEach(ch => ch.classList.remove('active'));
      for (let btn of Array.from(tabsWrap.children)) {
        try {
          const meta = JSON.parse(btn.dataset.meta || '{}');
          if (tabSpec.type === 'uploads' && meta.type === 'uploads') { btn.classList.add('active'); break; }
          if (tabSpec.type === 'playlist' && meta.type === 'playlist' && meta.id === tabSpec.id) { btn.classList.add('active'); break; }
        } catch(e){}
      }

    // reset UI
    activeTab = tabSpec;
    currentPage = 1;
    pageCount = null;
    lastQuery = '';
    grid.innerHTML = ''; // clear immediately
    setLiveVisible(false);

    // abort previous fetch and bump request id / token
    if (currentFetchController) { try{ currentFetchController.abort(); } catch(e){} currentFetchController = null; }
    lastRequestId++;
    // new global token for this navigation
    globalRenderToken = Symbol('render');

    try {
      await loadPage(globalRenderToken);
    } catch(e) {
    if (e && (e.name === 'AbortError' || e.name === 'StaleResponse' || e.message === 'stale')) return;
      console.error('activateTab loadPage error', e);
    }
  }

  async function loadPage(renderToken){ // receive expected renderToken
  // create controller + local token
  if (currentFetchController) { try { currentFetchController.abort(); } catch(e){} currentFetchController = null; }
  currentFetchController = new AbortController();
  const localRequestId = ++lastRequestId;
  const myToken = renderToken || Symbol('render_local');

  // set a visual loading (but keep grid cleared)
  grid.innerHTML = '<div style="color:#bbb">Cargando...</div>';

  const params = { action:'', page: currentPage };
  if (activeTab.type === 'uploads') params.action = 'uploads';
  else if (activeTab.type === 'playlist') { params.action = 'playlistVideos'; params.playlistId = activeTab.id; }
  else { grid.innerHTML = ''; return; }

  try {
    let data;
    try {
      data = await fetchApiWithSignal(params, currentFetchController.signal);
    } catch(apiErr) {
      const msg = apiErr && apiErr.message ? apiErr.message : '';
      if (msg.includes('quota') || msg.includes('quotaExceeded')) {
        console.warn('Quota exceeded -> trying RSS fallback');
        data = await fetchRSSFallback(); // fallback returns { videos: [...] }
      } else {
        throw apiErr;
      }
    }

    // VALIDACIÓN RÍGIDA: solo renderiza si token es el mismo que el global actual
    if (globalRenderToken !== myToken) {
      // respuesta vieja - ignorar
      console.debug('Ignored stale response (different render token)');
      return;
    }

    // renderizar
    renderVideos(data.videos || []);
    pageCount = data.pageCount || null;
    currentPage = data.page || currentPage;
    renderPager();

    // live check (solo si este token sigue vigente)
    if (!liveChecked) {
      try {
        if (globalRenderToken !== myToken) return;
        const liveData = await (async ()=>{
          const ctrl = new AbortController();
          return await fetchApiWithSignal({ action:'live' }, ctrl.signal);
        })();
        if (globalRenderToken !== myToken) return;
        liveChecked = true;
        if (liveData && liveData.live) setLiveVisible(true, liveData.live.id);
        else setLiveVisible(false);
      } catch(e){
        if (globalRenderToken === myToken) setLiveVisible(false);
      }
    }

  } catch (err) {
    if (err && err.name === 'AbortError') return;
    console.error('Error loadPage', err);
    if (globalRenderToken !== myToken) return;
    grid.innerHTML = '<div style="color:#f88">Error cargando videos. Intenta nuevamente más tarde.</div>';
  }
}


    function setLiveVisible(show, videoId){
      if (show) {
        liveBtn.style.display = 'inline-flex';
        liveBtn.textContent = 'En vivo ▶';
        liveBtn.onclick = ()=> openModal(videoId);
      } else {
        liveBtn.style.display = 'none';
        liveBtn.onclick = null;
      }
    }

    async function goToPage(p){
      currentPage = Math.max(1, Number(p||1));
      // abort previous and bump requestId then load
      if (currentFetchController) { try{ currentFetchController.abort(); } catch(e){} currentFetchController = null; }
      lastRequestId++;
      await loadPage();
    }
    prevBtn.addEventListener('click', ()=> { if (currentPage>1) goToPage(currentPage-1); });
    nextBtn.addEventListener('click', ()=> { if (!pageCount || currentPage < pageCount) goToPage(currentPage+1); });

    // search (Enter)
    searchInput.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter') return;
      const q = searchInput.value.trim();
      if (!q) return;
      // abort previous, set state
      if (currentFetchController) { try{ currentFetchController.abort(); } catch(e){} currentFetchController = null; }
      lastRequestId++;
      activeTab = { type:'search' };
      currentPage = 1;
      pageCount = null;
      grid.innerHTML = '';
      try {
        const ctrl = new AbortController();
        const url = new URL(ENDPOINT, location.origin);
        url.searchParams.set('action','search');
        url.searchParams.set('q', q);
        url.searchParams.set('pageSize', PAGE_SIZE);
        url.searchParams.set('channelId', CHANNEL);
        const r = await fetch(url.toString(), { signal: ctrl.signal });
        if (!r.ok) throw new Error('Error en búsqueda');
        const data = await r.json();
        // only render if still latest
        const localRequestId = lastRequestId;
        if (localRequestId !== lastRequestId) return;
        renderVideos(data.videos || []);
        prevBtn.disabled = !data.prevPage;
        nextBtn.disabled = !data.nextPage;
        pagesWrap.innerHTML = `<span style="color:#ddd">Resultados para "${q}"</span>`;
      } catch(err) {
        if (err && err.name === 'AbortError') return;
        console.error('search error', err);
        grid.innerHTML = `<div style="color:#f88">Error en búsqueda.</div>`;
      }
    });

    // init
    await initTabs();
    await activateTab({ type:'uploads' });

  }); // ready end
})();
