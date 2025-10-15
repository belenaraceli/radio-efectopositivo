/* widget.js
   Widget YouTube para consumir api/youtube.js (Vercel)
   - Soporta actions: playlists, playlistVideos, uploads, search, live
   - Filtrado seguro de ALLOWED_PLAYLISTS por id o title
   - Paginación con pageToken (next / prev)
   - dataset.meta siempre JSON.stringify
   - No modifica radio.js (tal como pediste)

   Uso: <script src="/js/widget.js" data-endpoint="/api/youtube" data-channel-id="UC..."></script>
*/

(function () {
  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  ready(function () {
    const sc = document.currentScript || Array.from(document.getElementsByTagName("script")).pop();
    if (!sc) {
      console.error("widget script tag not found");
      return;
    }

    // Config desde data attributes del script tag
    const ENDPOINT = (sc.dataset.endpoint || "/api/youtube").replace(/\/$/, "");
    const CHANNEL_ID = (sc.dataset.channelId || "").replace(/^@/, "");
    const PAGE_SIZE = Number(sc.dataset.pageSize || 12);

    // --- Editá aquí la lista blanca según quieras (ids preferibles) ---
    // Puede contener objetos { id: 'PLxxx', title: 'Nombre visible' }
    // El filtrado hará match por id OR por título (case-insensitive).
    const ALLOWED_PLAYLISTS = [
      // Ejemplo (reemplazá con los ids/títulos que necesites)
      { id: "PL06d3Nw-68RVfTySoWo04Zf2-s3aEI2B4", title: "Vuelta a casa" },
      { id: "PL06d3Nw-68RU0lodA7BjIUCqCQjc7ptAL", title: "Conociendo a Dios" },
      // Agregá/quita según corresponda
    ];

    // Contenedor raíz (debe existir en el HTML)
    const root = document.getElementById("youtube-widget");
    if (!root) {
      console.error("Elemento #youtube-widget no encontrado. Agregá un <div id=\"youtube-widget\"></div> donde quieras mostrarlo.");
      return;
    }
    root.innerHTML = "";

    // --- UI BUILD ---
    const shell = document.createElement("div");
    shell.className = "ywp-shell";
    const header = document.createElement("div");
    header.className = "ywp-header";

    const tabsWrap = document.createElement("div");
    tabsWrap.className = "ywp-tabs";

    const searchWrap = document.createElement("div");
    searchWrap.className = "ywp-search-wrap";
    const searchInput = document.createElement("input");
    searchInput.type = "search";
    searchInput.placeholder = "Buscar...";
    searchInput.className = "ywp-search";
    searchWrap.appendChild(searchInput);

    const orderWrap = document.createElement("div");
    orderWrap.className = "ywp-order-wrap";
    const orderSelect = document.createElement("select");
    orderSelect.className = "ywp-select";
    const optDateDesc = document.createElement("option");
    optDateDesc.value = "date";
    optDateDesc.textContent = "Más recientes";
    const optDateAsc = document.createElement("option");
    optDateAsc.value = "relevance";
    optDateAsc.textContent = "Relevancia";
    orderSelect.appendChild(optDateDesc);
    orderSelect.appendChild(optDateAsc);
    orderWrap.appendChild(orderSelect);

    const liveWrap = document.createElement("div");
    liveWrap.className = "ywp-live-wrap";
    const liveBtn = document.createElement("button");
    liveBtn.className = "ywp-live-btn";
    liveBtn.style.display = "none";
    liveWrap.appendChild(liveBtn);

    header.appendChild(tabsWrap);
    header.appendChild(searchWrap);
    header.appendChild(orderWrap);
    header.appendChild(liveWrap);
    shell.appendChild(header);

    const content = document.createElement("div");
    content.className = "ywp-content";
    const grid = document.createElement("div");
    grid.className = "ywp-grid";
    content.appendChild(grid);
    shell.appendChild(content);

    const pager = document.createElement("div");
    pager.className = "ywp-pager";
    const prevBtn = document.createElement("button");
    prevBtn.className = "ywp-page-btn";
    prevBtn.textContent = "‹ Prev";
    const pagesWrap = document.createElement("span");
    pagesWrap.className = "ywp-pages";
    const nextBtn = document.createElement("button");
    nextBtn.className = "ywp-page-btn";
    nextBtn.textContent = "Next ›";
    pager.appendChild(prevBtn);
    pager.appendChild(pagesWrap);
    pager.appendChild(nextBtn);
    shell.appendChild(pager);

    const modal = document.createElement("div");
    modal.className = "ywp-modal";
    modal.innerHTML = `<div class="ywp-modal-content" role="dialog"><button class="ywp-modal-close">Cerrar ✖</button><iframe class="ywp-modal-iframe" src="" allowfullscreen></iframe></div>`;
    document.body.appendChild(modal);
    const modalIframe = modal.querySelector(".ywp-modal-iframe");
    const modalClose = modal.querySelector(".ywp-modal-close");
    function openModal(id) {
      modal.style.display = "flex";
      modalIframe.src = `https://www.youtube.com/embed/${encodeURIComponent(id)}?autoplay=1`;
    }
    function closeModal() {
      modal.style.display = "none";
      modalIframe.src = "";
    }
    modalClose.addEventListener("click", closeModal);
    modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

    root.appendChild(shell);

    // Minimal CSS (si querés usar tu propio CSS, podés quitarlo)
    if (!document.getElementById("ywp-styles")) {
      const css = document.createElement("style");
      css.id = "ywp-styles";
      css.textContent = `
      .ywp-shell{background:transparent;color:#111;padding:10px;border-radius:8px;max-width:1100px;margin:0 auto}
      .ywp-header{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px}
      .ywp-tabs{display:flex;gap:6px;flex-wrap:wrap}
      .ywp-tab{background:#f2f2f2;padding:6px 10px;border-radius:8px;cursor:pointer;border:1px solid #e6e6e6}
      .ywp-tab.active{background:#ddd;font-weight:600}
      .ywp-search{padding:6px;border-radius:6px;border:1px solid #ddd;min-width:200px}
      .ywp-grid{display:grid;gap:12px;grid-template-columns:repeat(4,1fr)}
      .yt-video-card{background:#fff;border-radius:8px;overflow:hidden;cursor:pointer;border:1px solid #eee}
      .yt-video-thumb{width:100%;height:0;padding-bottom:56.25%;background-size:cover;background-position:center}
      .yt-video-title{padding:8px;font-size:14px;color:#111}
      .ywp-pager{display:flex;gap:8px;align-items:center;justify-content:center;margin-top:12px}
      .ywp-page-btn{padding:8px 10px;border-radius:6px;background:#fafafa;border:1px solid #ddd;cursor:pointer}
      .ywp-pages{color:#444}
      @media(max-width:900px){ .ywp-grid{grid-template-columns:repeat(2,1fr)} }
      @media(max-width:560px){ .ywp-grid{grid-template-columns:repeat(1,1fr)} .ywp-search{min-width:120px} }
      .ywp-modal{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.75);z-index:9999}
      .ywp-modal-content{width:90%;max-width:980px;aspect-ratio:16/9;background:#000;position:relative;border-radius:8px;overflow:hidden}
      .ywp-modal-close{position:absolute;top:-40px;right:0;background:#fff;color:#111;border:none;padding:6px 10px;border-radius:6px;cursor:pointer}
      .ywp-live-btn{background:#e33;color:#fff;padding:8px 10px;border-radius:8px;border:0;cursor:pointer}
      `;
      document.head.appendChild(css);
    }

    // --- Estado ---
    let playlists = [];
    let activeTab = { type: "uploads", id: null }; // uploads | playlist | search
    // pageTokens para la carga actual (lo devuelve la API)
    let currentNextToken = null;
    let currentPrevToken = null;
    let currentQuery = "";
    let currentOrder = orderSelect.value || "date";
    let lastRequestId = 0;
    let currentFetchController = null;

    // --- Helpers ---
    function safeStringifyMeta(meta) {
      try {
        return JSON.stringify(meta || {});
      } catch (e) {
        return "{}";
      }
    }

    function createTabElement(title, meta) {
      const btn = document.createElement("button");
      btn.className = "ywp-tab";
      btn.textContent = title;
      btn.dataset.meta = safeStringifyMeta(meta);
      return btn;
    }

    function mapApiVideo(v) {
      return {
        id: v.id,
        title: v.title,
        description: v.description,
        thumbnail: v.thumbnail,
        publishedAt: v.publishedAt
      };
    }

    // --- Fetch wrapper con abort + protección contra respuestas stale ---
    async function fetchApi(params) {
      if (currentFetchController) {
        try { currentFetchController.abort(); } catch (e) { /* ignore */ }
        currentFetchController = null;
      }
      currentFetchController = new AbortController();
      const myReqId = ++lastRequestId;

      const url = new URL(ENDPOINT, location.origin);
      Object.keys(params || {}).forEach(k => {
        if (params[k] !== undefined && params[k] !== null) url.searchParams.set(k, params[k]);
      });
      // si no viene channelId lo usamos desde la config del script
      if (!url.searchParams.get("channelId") && CHANNEL_ID) url.searchParams.set("channelId", CHANNEL_ID);

      try {
        const r = await fetch(url.toString(), { signal: currentFetchController.signal });
        if (!r.ok) {
          const txt = await r.text().catch(() => null);
          throw new Error(`API ${r.status} ${txt || r.statusText}`);
        }
        const json = await r.json();
        if (myReqId !== lastRequestId) {
          const e = new Error("stale");
          e.name = "StaleResponse";
          throw e;
        }
        return json;
      } catch (err) {
        throw err;
      } finally {
        // no limpiamos controller aquí porque podríamos querer abortarlo desde afuera
      }
    }

    // --- Render videos ---
    function renderVideos(videos) {
      grid.innerHTML = "";
      if (!videos || !videos.length) {
        grid.innerHTML = '<div>No se encontraron videos.</div>';
        return;
      }
      videos.forEach(v => {
        const card = document.createElement("div");
        card.className = "yt-video-card";
        const thumb = document.createElement("div");
        thumb.className = "yt-video-thumb";
        thumb.style.backgroundImage = `url("${v.thumbnail || (`https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`)}")`;
        const title = document.createElement("div");
        title.className = "yt-video-title";
        title.textContent = v.title || "Sin título";
        card.appendChild(thumb);
        card.appendChild(title);
        card.addEventListener("click", () => openModal(v.id));
        grid.appendChild(card);
      });
    }

    function renderPagerUI() {
      pagesWrap.innerHTML = "";
      const info = document.createElement("span");
      info.textContent = `Página (prev:${currentPrevToken ? "sí" : "no"} - next:${currentNextToken ? "sí" : "no"})`;
      pagesWrap.appendChild(info);
      prevBtn.disabled = !currentPrevToken;
      nextBtn.disabled = !currentNextToken;
    }

    // --- Tabs init (pedimos playlists y filtramos por ALLOWED_PLAYLISTS) ---
    async function initTabs() {
      try {
        const data = await fetchApi({ action: "playlists", limit: 50 });
        const fetched = (data.playlists || []).map(p => ({ id: p.id, title: p.title, count: p.count || 0 }));

        // Preparamos sets de comparacion
        const allowedIds = ALLOWED_PLAYLISTS.map(x => String(x.id || "").trim()).filter(Boolean);
        const allowedTitlesLower = ALLOWED_PLAYLISTS.map(x => (x.title || "").toLowerCase().trim()).filter(Boolean);

        const filtered = fetched.filter(pl => {
          const pid = String(pl.id || "").trim();
          const ptitle = String(pl.title || "").toLowerCase().trim();
          return (allowedIds.length && allowedIds.includes(pid)) || (allowedTitlesLower.length && allowedTitlesLower.includes(ptitle));
        });

        playlists = filtered;

        // Construir tabs: primero "Todos los videos" (uploads)
        tabsWrap.innerHTML = "";
        const tabAll = createTabElement("Todos los videos", { type: "uploads" });
        tabAll.classList.add("active");
        tabAll.addEventListener("click", () => activateTab({ type: "uploads" }));
        tabsWrap.appendChild(tabAll);

        if (!playlists.length) {
          console.warn("ALLOWED_PLAYLISTS no coincide con playlists del canal o no hay playlists. Revisá ALLOWED_PLAYLISTS o la respuesta de la API.");
        } else {
          playlists.forEach(pl => {
            const btn = createTabElement(pl.title, { type: "playlist", id: pl.id, count: pl.count });
            btn.addEventListener("click", () => activateTab({ type: "playlist", id: pl.id }));
            tabsWrap.appendChild(btn);
          });
        }
      } catch (err) {
        console.error("Error cargando playlists:", err);
        tabsWrap.innerHTML = '<div style="color:#f88">Error cargando playlists</div>';
      }
    }

    // --- Activar tab ---
    async function activateTab(spec) {
      // marcar activa (protección si tabsWrap vacío)
      try {
        if (tabsWrap && tabsWrap.children && tabsWrap.children.length) {
          Array.from(tabsWrap.children).forEach(ch => ch.classList.remove("active"));
          for (let btn of Array.from(tabsWrap.children)) {
            try {
              const meta = JSON.parse(btn.dataset.meta || "{}");
              if (spec.type === "uploads" && meta.type === "uploads") { btn.classList.add("active"); break; }
              if (spec.type === "playlist" && meta.type === "playlist" && String(meta.id) === String(spec.id)) { btn.classList.add("active"); break; }
            } catch (e) { /* ignore */ }
          }
        }
      } catch (e) {
        console.warn("Error marcando tab activa:", e);
      }

      // Reset estado de paginación y query
      currentNextToken = null;
      currentPrevToken = null;
      currentQuery = "";
      activeTab = spec;
      grid.innerHTML = "";
      setLiveVisible(false);

      // Abort y invalidación
      if (currentFetchController) { try { currentFetchController.abort(); } catch (e) {} currentFetchController = null; }
      lastRequestId++;

      // Cargar primero
      await loadPage();
    }

    // --- Carga de página según activeTab y pageToken ---
    async function loadPage(pageToken) {
      grid.innerHTML = "<div>Cargando...</div>";
      try {
        const params = {};
        if (activeTab.type === "uploads") {
          params.action = "uploads";
          params.pageSize = PAGE_SIZE;
          if (pageToken) params.pageToken = pageToken;
        } else if (activeTab.type === "playlist") {
          params.action = "playlistVideos";
          params.playlistId = activeTab.id;
          params.pageSize = PAGE_SIZE;
          if (pageToken) params.pageToken = pageToken;
        } else if (activeTab.type === "search") {
          params.action = "search";
          params.q = currentQuery;
          params.pageSize = PAGE_SIZE;
          params.order = currentOrder || "date";
          if (pageToken) params.pageToken = pageToken;
        } else {
          grid.innerHTML = "";
          return;
        }

        const data = await fetchApi(params);
        // Mapear videos
        const videos = (data.videos || []).map(mapApiVideo);
        renderVideos(videos);
        // actualizar tokens
        currentNextToken = data.pageToken || data.nextPageToken || null;
        currentPrevToken = data.prevPageToken || null;
        renderPagerUI();

        // live detection (llamamos si no hay live aún)
        try {
          const liveData = await fetchApi({ action: "live" });
          if (liveData && liveData.live && liveData.live.id) setLiveVisible(true, liveData.live.id);
          else setLiveVisible(false);
        } catch (e) {
          setLiveVisible(false);
        }

      } catch (err) {
        if (err && (err.name === "StaleResponse" || err.name === "AbortError" || err.message === "stale")) {
          return;
        }
        console.error("Error loadPage:", err);
        grid.innerHTML = `<div style="color:#f88">Error cargando videos.</div>`;
      }
    }

    function setLiveVisible(show, videoId) {
      if (show) {
        liveBtn.style.display = "inline-flex";
        liveBtn.textContent = "En vivo ▶";
        liveBtn.onclick = () => openModal(videoId);
      } else {
        liveBtn.style.display = "none";
        liveBtn.onclick = null;
      }
    }

    // --- Paginación click handlers ---
    prevBtn.addEventListener("click", async () => {
      if (!currentPrevToken) return;
      await loadPage(currentPrevToken);
    });
    nextBtn.addEventListener("click", async () => {
      if (!currentNextToken) return;
      await loadPage(currentNextToken);
    });

    // --- Búsqueda (server-side) ---
    searchInput.addEventListener("keydown", async (e) => {
      if (e.key !== "Enter") return;
      const q = searchInput.value.trim();
      if (!q) return;
      currentQuery = q;
      activeTab = { type: "search" };
      // marcar visualmente (si hay tab de "Todos" la desactiva)
      try {
        if (tabsWrap && tabsWrap.children && tabsWrap.children.length) {
          Array.from(tabsWrap.children).forEach(ch => ch.classList.remove("active"));
        }
      } catch (e) {}
      currentNextToken = null;
      currentPrevToken = null;
      await loadPage();
    });

    // --- Orden (para search) ---
    orderSelect.addEventListener("change", async () => {
      currentOrder = orderSelect.value;
      // si estamos en search, recargar
      if (activeTab.type === "search") {
        currentNextToken = null;
        currentPrevToken = null;
        await loadPage();
      }
    });

    // --- Init sequence ---
    (async function init() {
      await initTabs();
      // activar uploads por defecto
      await activateTab({ type: "uploads" });
    })();

  }); // ready end
})();
