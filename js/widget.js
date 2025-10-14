/* js/widget.js
   Widget cliente con:
   - Tabs: "Todos los videos" + playlists
   - Paginación por páginas numeradas (pageSize = 10 por defecto)
   - Orden global (Más recientes / Más antiguos)
   - Búsqueda (Prev/Next style)
   - Live botón aparece solo si hay transmisión
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

    const root = document.getElementById('youtube-widget');
    if (!root){ console.error('#youtube-widget not found'); return; }
    root.innerHTML = '';

    // shell
    const shell = document.createElement('div'); shell.className='ywp-shell';
    const header = document.createElement('div'); header.className='ywp-header';
    const tabsWrap = document.createElement('div'); tabsWrap.className='ywp-tabs';
    const searchWrap = document.createElement('div'); searchWrap.className='ywp-search-wrap';
    const searchInput = document.createElement('input'); searchInput.type='search'; searchInput.placeholder='Buscar...'; searchInput.className='ywp-search';
    searchWrap.appendChild(searchInput);

    const orderWrap = document.createElement('div'); orderWrap.className='ywp-order-wrap';
    const orderSelect = document.createElement('select'); orderSelect.className='ywp-select';
    const o1 = document.createElement('option'); o1.value='date_desc'; o1.textContent='Más recientes';
    const o2 = document.createElement('option'); o2.value='date_asc'; o2.textContent='Más antiguos';
    orderSelect.appendChild(o1); orderSelect.appendChild(o2);
    orderWrap.appendChild(orderSelect);

    const liveWrap = document.createElement('div'); liveWrap.className='ywp-live-wrap';
    const liveBtn = document.createElement('button'); liveBtn.className='ywp-live-btn'; liveBtn.style.display='none';
    liveWrap.appendChild(liveBtn);

    header.appendChild(tabsWrap); header.appendChild(searchWrap); header.appendChild(orderWrap); header.appendChild(liveWrap);
    shell.appendChild(header);

    const content = document.createElement('div'); content.className='ywp-content';
    const grid = document.createElement('div'); grid.className='ywp-grid'; content.appendChild(grid);
    shell.appendChild(content);

    const pager = document.createElement('div'); pager.className='ywp-pager';
    const prevBtn = document.createElement('button'); prevBtn.textContent='‹ Prev'; prevBtn.className='ywp-page-btn';
    const pagesWrap = document.createElement('span'); pagesWrap.className='ywp-pages';
    const nextBtn = document.createElement('button'); nextBtn.textContent='Next ›'; nextBtn.className='ywp-page-btn';
    pager.appendChild(prevBtn); pager.appendChild(pagesWrap); pager.appendChild(nextBtn);
    shell.appendChild(pager);

    // modal
    const modal = document.createElement('div'); modal.className='ywp-modal'; modal.innerHTML = `<div class="ywp-modal-content" role="dialog"><button class="ywp-modal-close">Cerrar ✖</button><iframe class="ywp-modal-iframe" src="" allowfullscreen></iframe></div>`;
    document.body.appendChild(modal);
    const modalIframe = modal.querySelector('.ywp-modal-iframe'); const modalClose = modal.querySelector('.ywp-modal-close');
    function openModal(id){ modal.style.display='flex'; modalIframe.src=`https://www.youtube.com/embed/${encodeURIComponent(id)}?autoplay=1`; }
    function closeModal(){ modal.style.display='none'; modalIframe.src=''; }
    modalClose.addEventListener('click', closeModal); modal.addEventListener('click', (e)=>{ if(e.target===modal) closeModal(); });

    root.appendChild(shell);

    // inject minimal styles (you already had dark theme; keep consistent)
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

    // state
    let playlists = []; // {id,title,count}
    let activeTab = { type: 'uploads' , id: null }; // type: uploads | playlist | search
    let currentPage = 1;
    let pageCount = null;
    let currentOrder = orderSelect.value || 'date_desc';
    let lastQuery = '';
    let liveChecked = false;

    function createTabElement(title, meta){
      const btn = document.createElement('button'); btn.className='ywp-tab'; btn.textContent = title;
      btn.dataset.meta = JSON.stringify(meta || {});
      return btn;
    }

    // fetch playlists and build tabs
    async function initTabs(){
      try {
        const data = await fetchApi({ action:'playlists', limit:50 });
        playlists = data.playlists || [];
        tabsWrap.innerHTML = '';
        // Todos los videos tab (uploads)
        const tabAll = createTabElement('Todos los videos', { type:'uploads' });
        tabAll.classList.add('active');
        tabsWrap.appendChild(tabAll);
        tabAll.addEventListener('click', ()=> { activateTab({type:'uploads'}); });

        // playlist tabs
        playlists.forEach(pl => {
          const t = createTabElement(pl.title, { type:'playlist', id: pl.id, count: pl.count });
          tabsWrap.appendChild(t);
          t.addEventListener('click', ()=> { activateTab({type:'playlist', id: pl.id}); });
        });
      } catch(e){
        console.error('Error cargando playlists', e);
        tabsWrap.innerHTML = '<div style="color:#f88">Error cargando playlists</div>';
      }
    }

    // wrapper to call backend
    async function fetchApi(params){
      const url = new URL(ENDPOINT, location.origin);
      Object.keys(params || {}).forEach(k => { if (params[k] !== undefined && params[k] !== null) url.searchParams.set(k, params[k]); });
      // always set channelId and pageSize
      if (!url.searchParams.get('channelId')) url.searchParams.set('channelId', CHANNEL);
      if (!url.searchParams.get('pageSize')) url.searchParams.set('pageSize', PAGE_SIZE);
      if (!url.searchParams.get('order')) url.searchParams.set('order', currentOrder);
      const r = await fetch(url.toString());
      if (!r.ok) {
        const t = await r.text().catch(()=>null);
        throw new Error(`Status ${r.status} - ${t||r.statusText}`);
      }
      return r.json();
    }

    // render videos array into grid
    function renderVideos(videos){
      grid.innerHTML = '';
      if (!videos || !videos.length) { grid.innerHTML = '<div>No se encontraron videos.</div>'; return; }
      videos.forEach(v => {
        const card = document.createElement('div'); card.className='yt-video-card';
        const thumb = document.createElement('div'); thumb.className='yt-video-thumb';
        thumb.style.backgroundImage = `url("${v.thumbnail || (`https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`)}")`;
        const title = document.createElement('div'); title.className='yt-video-title'; title.textContent = v.title || 'Sin título';
        card.appendChild(thumb); card.appendChild(title);
        card.addEventListener('click', ()=> openModal(v.id));
        // store meta
        card.dataset.published = v.publishedAt || '';
        grid.appendChild(card);
      });
    }

    // pager rendering (simple window)
    function renderPager(){
      pagesWrap.innerHTML = '';
      // if pageCount known, render numeric pages; else show current and next/prev only
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

    // navigate
    async function goToPage(p){
      currentPage = Math.max(1, Number(p||1));
      await loadPage();
    }

    prevBtn.addEventListener('click', ()=> { if (currentPage>1) goToPage(currentPage-1); });
    nextBtn.addEventListener('click', ()=> { if (!pageCount || currentPage < pageCount) goToPage(currentPage+1); });

    // main loader: based on activeTab
    async function loadPage(){
      grid.innerHTML = '<div style="color:#bbb">Cargando...</div>';
      setLiveVisible(false);
      try {
        let params = { action: '', page: currentPage };
        if (activeTab.type === 'uploads') { params.action = 'uploads'; }
        else if (activeTab.type === 'playlist') { params.action = 'playlistVideos'; params.playlistId = activeTab.id; }
        else return;

        // if we're in search mode (activeTab.type === 'search'), different flow (not used here)
        const data = await fetchApi(params);
        // render
        renderVideos(data.videos || []);
        // page and pageCount
        pageCount = data.pageCount || null;
        currentPage = data.page || currentPage;
        renderPager();

        // check live (only once)
        if (!liveChecked) {
          try {
            const live = await fetchApi({ action:'live' });
            liveChecked = true;
            if (live && live.live) {
              setLiveVisible(true, live.live.id);
            } else {
              setLiveVisible(false);
            }
          } catch(e){ setLiveVisible(false); }
        }

      } catch (err) {
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

    // activate tab (type: uploads | playlist)
    async function activateTab(tabSpec){
      // mark tabs active UI
      Array.from(tabsWrap.children).forEach(ch => ch.classList.remove('active'));
      // find button that matches meta
      for (let btn of Array.from(tabsWrap.children)) {
        const meta = JSON.parse(btn.dataset.meta || '{}');
        if (tabSpec.type === 'uploads' && meta.type === 'uploads') { btn.classList.add('active'); break; }
        if (tabSpec.type === 'playlist' && meta.type === 'playlist' && meta.id === tabSpec.id) { btn.classList.add('active'); break; }
      }
      // set state
      activeTab = tabSpec;
      currentPage = 1;
      pageCount = null;
      await loadPage();
    }

    // search (we'll use search action with simple prev/next flow)
    let searchToken = '';
    searchInput.addEventListener('keydown', async (e)=> {
      if (e.key === 'Enter') {
        const q = searchInput.value.trim();
        if (!q) return;
        // switch to search mode (we'll reuse activeTab.type='search' for logic)
        activeTab = { type:'search' };
        currentPage = 1;
        lastQuery = q;
        await runSearch(q);
      }
    });

    async function runSearch(q, pageToken = '') {
      grid.innerHTML = '<div style="color:#bbb">Buscando...</div>';
      try {
        const url = new URL(ENDPOINT, location.origin);
        url.searchParams.set('action','search');
        url.searchParams.set('q', q);
        url.searchParams.set('pageSize', PAGE_SIZE);
        url.searchParams.set('order', currentOrder);
        url.searchParams.set('channelId', CHANNEL);
        if (pageToken) url.searchParams.set('pageToken', pageToken);
        const r = await fetch(url.toString());
        if (!r.ok) throw new Error('Error en búsqueda');
        const data = await r.json();
        renderVideos(data.videos || []);
        // search returns simple prev/next flags; we won't render numeric pages here
        prevBtn.disabled = !data.prevPage;
        nextBtn.disabled = !data.nextPage;
        pagesWrap.innerHTML = `<span style="color:#ddd">Resultados para "${q}"</span>`;
        // set live check to false (no change)
      } catch(e){
        console.error('search error', e);
        grid.innerHTML = `<div style="color:#f88">Error en búsqueda.</div>`;
      }
    }

    // order change
    orderSelect.addEventListener('change', async ()=>{
      currentOrder = orderSelect.value;
      currentPage = 1;
      pageCount = null;
      await loadPage();
    });

    // initialize tabs and first load
    await initTabs();
    // default activate uploads
    await activateTab({ type:'uploads' });

  }); // ready
})();
