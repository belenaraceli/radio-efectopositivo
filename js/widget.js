/* js/widget.js
   Versión actualizada:
   - Filtra playlists a mostrar (solo las 4 indicadas)
   - Evita apilar videos al cambiar tabs (limpia + abort controller)
   - Paginación por páginas, orden asc/desc, live detect
   - Listo para usar con data-endpoint apuntando a tu /api/youtube en Vercel
*/

(function(){
  function ready(fn){ if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  function findScript(){ if (document.currentScript) return document.currentScript; const s = Array.from(document.getElementsByTagName('script')); for (let i=s.length-1;i>=0;i--){ const sc=s[i]; if (sc.dataset && (sc.dataset.endpoint||sc.dataset.channelId)) return sc; } return s[s.length-1]||null; }

  ready(async function(){
    const sc = findScript();
    if (!sc){ console.error('widget script tag not found'); return; }

    const ENDPOINT = sc.dataset.endpoint || '/api/youtube';
    const CHANNEL = (sc.dataset.channelId || '@radioefectopositivo').replace(/^@/,'');
    const PAGE_SIZE = Number(sc.dataset.pageSize || 10);

    // Contenedor principal (debe existir en la página)
    const root = document.getElementById('youtube-widget');
    if (!root){ console.error('#youtube-widget not found'); return; }
    root.innerHTML = '';

    // --- Lista blanca de playlists  ---
    const ALLOWED_PLAYLISTS = [
      { id: 'PL06d3Nw-68RVfTySoWo04Zf2-s3aEI2B4', title: 'Vuelta a casa' },
      { id: 'PL06d3Nw-68RU0lodA7BjIUCqCQjc7ptAL', title: 'Conociendo a Dios' },
      { id: 'PL06d3Nw-68RU5zyPjHEOYtT1VIdX6QlNC', title: 'Jesus... la revelación' },
      { id: 'PL06d3Nw-68RVRPINt4Grb74yn5p8TmFyp', title: 'Encuentro con Efecto Positivo' }
    ];
    

    // --- Build UI ---
    const shell = document.createElement('div'); shell.className='ywp-shell';
    const header = document.createElement('div'); header.className='ywp-header';
    const tabsWrap = document.createElement('div'); tabsWrap.className='ywp-tabs';
    const searchWrap = document.createElement('div'); searchWrap.className='ywp-search-wrap';
    const searchInput = document.createElement('input'); searchInput.type='search'; searchInput.placeholder='Buscar...'; searchInput.className='ywp-search';
    searchWrap.appendChild(searchInput);
    const orderWrap = document.createElement('div'); orderWrap.className='ywp-order-wrap';
    const orderSelect = document.createElement('select'); orderSelect.className='ywp-select';
    const opt1 = document.createElement('option'); opt1.value='date_desc'; opt1.textContent='Más recientes';
    const opt2 = document.createElement('option'); opt2.value='date_asc'; opt2.textContent='Más antiguos';
    orderSelect.appendChild(opt1); orderSelect.appendChild(opt2); orderWrap.appendChild(orderSelect);
    const liveWrap = document.createElement('div'); liveWrap.className='ywp-live-wrap';
    const liveBtn = document.createElement('button'); liveBtn.className='ywp-live-btn'; liveBtn.style.display='none';
    liveWrap.appendChild(liveBtn);

    header.appendChild(tabsWrap); header.appendChild(searchWrap); header.appendChild(orderWrap); header.appendChild(liveWrap);
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

    const modal = document.createElement('div'); modal.className='ywp-modal';
    modal.innerHTML = `<div class="ywp-modal-content" role="dialog"><button class="ywp-modal-close">Cerrar ✖</button><iframe class="ywp-modal-iframe" src="" allowfullscreen></iframe></div>`;
    document.body.appendChild(modal);
    const modalIframe = modal.querySelector('.ywp-modal-iframe'); const modalClose = modal.querySelector('.ywp-modal-close');
    function openModal(id){ modal.style.display='flex'; modalIframe.src = `https://www.youtube.com/embed/${encodeURIComponent(id)}?autoplay=1`; }
    function closeModal(){ modal.style.display='none'; modalIframe.src=''; }
    modalClose.addEventListener('click', closeModal); modal.addEventListener('click', (e)=>{ if(e.target===modal) closeModal(); });

    root.appendChild(shell);

    // --- Styles (dark, responsive) ---
    if (!document.getElementById('ywp-styles')) {
      const css = document.createElement('style'); css.id='ywp-styles';
      css.textContent = `
      .ywp-shell{background:#0b0b0c;color:#e6e6e6;padding:18px;border-radius:10px;max-width:1100px;margin:12px auto}
      .ywp-header{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:12px}
      .ywp-tabs{display:flex;gap:6px;flex-wrap:wrap}
      .ywp-tab{background:#111;border:1px solid #222;padding:8px 12px;border-radius:8px;color:#ddd;cursor:pointer}
      .ywp-tab.active{background:#222;border-color:#444;color:#fff;font-weight:600}
      .ywp-search{padding:8px 10px;border-radius:8px;border:1px solid #222;background:#0f0f10;color:#eee;min-width:200px}
      .ywp-grid{display:grid;gap:12px;grid-template-columns:repeat(4,1fr)}
      .yt-video-card{background:#111;border-radius:8px;overflow:hidden;cursor:pointer;border:1px solid #1d1d1d}
      .yt-video-thumb{width:100%;height:0;padding-bottom:56.25%;background-size:cover;background-position:center}
      .yt-video-title{padding:8px;font-size:14px;color:#f5f5f5}
      .ywp-pager{display:flex;gap:8px;align-items:center;justify-content:center;margin-top:12px}
      .ywp-page-btn{padding:8px 10px;border-radius:6px;background:#121212;color:#eee;border:1px solid #2a2a2a;cursor:pointer}
      .ywp-page-num{padding:6px 8px;border-radius:6px;background:#0f0f10;border:1px solid #222;margin:0 3px;cursor:pointer}
      .ywp-page-num.active{background:#444;color:#fff}
      .ywp-live-btn{background:#e33;color:#fff;padding:8px 10px;border-radius:8px;border:0;cursor:pointer}
      @media(max-width:900px){ .ywp-grid{grid-template-columns:repeat(2,1fr)} }
      @media(max-width:560px){ .ywp-grid{grid-template-columns:repeat(1,1fr)} .ywp-search{min-width:140px} }
      .ywp-modal{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.75);z-index:9999}
      .ywp-modal-content{width:90%;max-width:980px;aspect-ratio:16/9;background:#000;position:relative;border-radius:8px;overflow:hidden}
      .ywp-modal-close{position:absolute;top:-40px;right:0;background:#fff;color:#111;border:none;padding:8px 12px;border-radius:6px;cursor:pointer}
      `;
      document.head.appendChild(css);
    }

    // --- State ---
    let playlists = [];
    let activeTab = { type: 'uploads', id: null }; // uploads | playlist | search
    let currentPage = 1;
    let pageCount = null;
    let currentOrder = orderSelect.value || 'date_desc';
    let lastQuery = '';
    let liveChecked = false;

    // --- AbortController + stale-response protection ---
    let currentFetchController = null;
    let lastRequestId = 0;

    // helper to create tab button
    function createTabElement(title, meta){
      const btn = document.createElement('button'); btn.className='ywp-tab'; btn.textContent = title;
      btn.dataset.meta = JSON.stringify(meta || {});
      return btn;
    }

    // --- fetch wrapper with abort + stale protection ---
    async function fetchApi(params){
      // abort previous request (we do it here to centralize)
      if (currentFetchController) {
        try { currentFetchController.abort(); } catch(e){}
        currentFetchController = null;
      }
      currentFetchController = new AbortController();
      const thisRequestId = ++lastRequestId;

      const url = new URL(ENDPOINT, location.origin);
      Object.keys(params || {}).forEach(k => { if (params[k] !== undefined && params[k] !== null) url.searchParams.set(k, params[k]); });
      if (!url.searchParams.get('channelId')) url.searchParams.set('channelId', CHANNEL);
      if (!url.searchParams.get('pageSize')) url.searchParams.set('pageSize', PAGE_SIZE);
      if (!url.searchParams.get('order')) url.searchParams.set('order', currentOrder);

      try {
        const r = await fetch(url.toString(), { signal: currentFetchController.signal });
        if (!r.ok) {
          const t = await r.text().catch(()=>null);
          throw new Error(`Status ${r.status} - ${t||r.statusText}`);
        }
        const json = await r.json();
        // if a newer request started, ignore this response
        if (thisRequestId !== lastRequestId) {
          const e = new Error('stale');
          e.name = 'StaleResponse';
          throw e;
        }
        return json;
      } catch (err) {
        // pass abort/stale up for callers to ignore silently
        throw err;
      } finally {
        // don't null controller here; we want to keep it until next call or abort
      }
    }

    // --- render functions ---
    function renderVideos(videos){
      grid.innerHTML = '';
      if (!videos || !videos.length) {
        grid.innerHTML = '<div>No se encontraron videos.</div>';
        return;
      }
      videos.forEach(v => {
        const card = document.createElement('div'); card.className='yt-video-card';
        const thumb = document.createElement('div'); thumb.className='yt-video-thumb';
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
        // unknown total: show current only
        const span = document.createElement('span'); span.textContent = `Página ${currentPage}`; span.style.color='#ddd';
        pagesWrap.appendChild(span);
      }
      prevBtn.disabled = currentPage <= 1;
      nextBtn.disabled = (pageCount ? currentPage >= pageCount : false);
    }

    // --- tab init: fetch playlists but filter por lista blanca ---
    async function initTabs(){
      try {
        const data = await fetchApi({ action:'playlists', limit:50 });
        // filter playlists by allowed titles
        const filtered = (data.playlists || []).filter(pl => ALLOWED_PLAYLISTS.includes(pl.title));
        playlists = filtered;
        tabsWrap.innerHTML = '';
        const tabAll = createTabElement('Todos los videos', { type:'uploads' });
        tabAll.classList.add('active');
        tabAll.addEventListener('click', ()=> { activateTab({ type:'uploads' }); });
        tabsWrap.appendChild(tabAll);

        playlists.forEach(pl => {
          const t = createTabElement(pl.title, { type:'playlist', id: pl.id, count: pl.count });
          t.addEventListener('click', ()=> { activateTab({ type:'playlist', id: pl.id }); });
          tabsWrap.appendChild(t);
        });
      } catch (err) {
        console.error('Error cargando playlists', err);
        tabsWrap.innerHTML = '<div style="color:#f88">Error cargando playlists</div>';
      }
    }

    // --- activate tab (limpia, aborta peticiones previas, carga primera página) ---
    async function activateTab(tabSpec){
      // UI: marcar activa
      Array.from(tabsWrap.children).forEach(ch => ch.classList.remove('active'));
      // buscar el boton que tenga meta coincidente y marcarlo
      for (let btn of Array.from(tabsWrap.children)) {
        try {
          const meta = JSON.parse(btn.dataset.meta || '{}');
          if (tabSpec.type === 'uploads' && meta.type === 'uploads') { btn.classList.add('active'); break; }
          if (tabSpec.type === 'playlist' && meta.type === 'playlist' && meta.id === tabSpec.id) { btn.classList.add('active'); break; }
        } catch(e){}
      }

      // reset state immediately (para evitar apilamiento visual)
      activeTab = tabSpec;
      currentPage = 1;
      pageCount = null;
      lastQuery = '';
      grid.innerHTML = '';                // limpieza inmediata
      setLiveVisible(false);

      // abort any ongoing request
      if (currentFetchController) { try{ currentFetchController.abort(); } catch(e){} currentFetchController = null; }
      lastRequestId++; // invalidate previous responses too

      // cargar primera página
      await loadPage().catch(e => {
        // si fue abort o stale, ignorar silenciosamente
        if (e && (e.name === 'AbortError' || e.name === 'StaleResponse' || e.message === 'stale')) return;
        // otherwise log
        console.error('activateTab loadPage error', e);
      });
    }

    // --- loadPage: carga la página actual según activeTab ---
    async function loadPage(){
      // muestra loading breve
      grid.innerHTML = '<div style="color:#bbb">Cargando...</div>';
      try {
        let params = { action:'', page: currentPage };
        if (activeTab.type === 'uploads') { params.action = 'uploads'; }
        else if (activeTab.type === 'playlist') { params.action = 'playlistVideos'; params.playlistId = activeTab.id; }
        else { grid.innerHTML = ''; return; }

        const data = await fetchApi(params);
        // render
        renderVideos(data.videos || []);
        // update pagination state
        pageCount = data.pageCount || null;
        currentPage = data.page || currentPage;
        renderPager();

        // check live once
        if (!liveChecked) {
          try {
            const live = await fetchApi({ action:'live' });
            liveChecked = true;
            if (live && live.live) setLiveVisible(true, live.live.id);
            else setLiveVisible(false);
          } catch(e){ setLiveVisible(false); }
        }

      } catch (err) {
        // ignore abort/stale silently
        if (err && (err.name === 'AbortError' || err.name === 'StaleResponse' || err.message === 'stale')) {
          return;
        }
        console.error('Error loadPage', err);
        grid.innerHTML = `<div style="color:#f88">Error cargando videos.</div>`;
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
      // abort previous request to avoid stacking
      if (currentFetchController) { try{ currentFetchController.abort(); } catch(e){} currentFetchController = null; }
      lastRequestId++;
      await loadPage();
    }
    prevBtn.addEventListener('click', ()=> { if (currentPage>1) goToPage(currentPage-1); });
    nextBtn.addEventListener('click', ()=> { if (!pageCount || currentPage < pageCount) goToPage(currentPage+1); });

    // --- search: Enter para buscar, usa search action con prev/next (sin numeración) ---
    let lastSearchToken = '';
    searchInput.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter') return;
      const q = searchInput.value.trim();
      if (!q) return;
      // reset state for search
      activeTab = { type:'search' };
      currentPage = 1;
      pageCount = null;
      grid.innerHTML = '';
      try {
        const url = new URL(ENDPOINT, location.origin);
        url.searchParams.set('action','search');
        url.searchParams.set('q', q);
        url.searchParams.set('pageSize', PAGE_SIZE);
        url.searchParams.set('order', currentOrder);
        url.searchParams.set('channelId', CHANNEL);
        const r = await fetch(url.toString());
        if (!r.ok) throw new Error('Error en búsqueda');
        const data = await r.json();
        renderVideos(data.videos || []);
        prevBtn.disabled = !data.prevPage;
        nextBtn.disabled = !data.nextPage;
        pagesWrap.innerHTML = `<span style="color:#ddd">Resultados para "${q}"</span>`;
      } catch(err) {
        console.error('search error', err);
        grid.innerHTML = `<div style="color:#f88">Error en búsqueda.</div>`;
      }
    });

    // --- order change ---
    orderSelect.addEventListener('change', async ()=>{
      currentOrder = orderSelect.value;
      // reset and reload current tab from page 1
      currentPage = 1;
      pageCount = null;
      if (currentFetchController) { try{ currentFetchController.abort(); } catch(e){} currentFetchController = null; }
      lastRequestId++;
      await loadPage();
    });

    // --- init ---
    await initTabs();
    await activateTab({ type:'uploads' });

  }); // ready end
})();
