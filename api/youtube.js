// api/youtube.js
// Vercel serverless handler - YouTube Data API helper with paged pages + tabs/playlists support
// Requiere process.env.YOUTUBE_API_KEY
const API_BASE = 'https://www.googleapis.com/youtube/v3';
const CACHE = {}; // general cache
const PAGE_TOKENS = {}; // cache page tokens for playlists/uploads in date_desc mode
const DEFAULT_TTL = 5 * 60 * 1000; // 5 min

function nowMs(){ return Date.now(); }
function cacheGet(key){ const c = CACHE[key]; if (c && c.expiry > nowMs()) return c.data; return null; }
function cacheSet(key, data, ttl = DEFAULT_TTL){ CACHE[key] = { expiry: nowMs() + ttl, data }; }

async function ytFetch(path, params = {}) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error('Missing YOUTUBE_API_KEY env var');
  params.key = apiKey;
  const qs = new URLSearchParams(params).toString();
  const url = `${API_BASE}/${path}?${qs}`;
  const res = await fetch(url);
  if (!res.ok) {
    const txt = await res.text().catch(()=>null);
    const err = new Error(`YouTube API error ${res.status}: ${txt || res.statusText}`);
    err.status = res.status; err.body = txt;
    throw err;
  }
  return res.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const action = (req.query.action || 'uploads').toString();
    const rawChannel = (req.query.channelId || '@radioefectopositivo').toString();
    const channelParam = rawChannel.replace(/^@/,'');
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(50, Number(req.query.pageSize || 10));
    const q = req.query.q ? String(req.query.q) : '';
    const order = (req.query.order || 'date_desc').toString(); // date_desc | date_asc
    const MAX_FETCH_ALL = Number(process.env.YT_MAX_FETCH_ALL || 500);

    const cacheKey = JSON.stringify({ action, channelParam, page, pageSize, q, order });
    const cached = cacheGet(cacheKey);
    if (cached) { res.setHeader('x-cache','HIT'); return res.status(200).json(cached); }

    // resolve channelId
    async function resolveChannelId(param) {
      if (/^UC[a-zA-Z0-9_-]{20,}$/.test(param)) return param;
      const s = await ytFetch('search', { part: 'snippet', type: 'channel', q: param, maxResults: 1 });
      if (s.items && s.items[0] && s.items[0].id && s.items[0].id.channelId) return s.items[0].id.channelId;
      const c = await ytFetch('channels', { part: 'id', forUsername: param });
      if (c.items && c.items[0] && c.items[0].id) return c.items[0].id;
      return null;
    }

    const channelId = await resolveChannelId(channelParam);
    if (!channelId) return res.status(404).json({ error: 'Channel not found' });

    const result = { channelId };

    // ---- playlists list (tabs) ----
    if (action === 'playlists') {
      const p = await ytFetch('playlists', { part: 'snippet,contentDetails', channelId, maxResults: 50 });
      result.playlists = (p.items || []).map(pl => ({
        id: pl.id,
        title: pl.snippet.title,
        count: pl.contentDetails?.itemCount || 0,
        thumbnail: pl.snippet.thumbnails?.medium?.url
      }));
      cacheSet(cacheKey, result);
      res.setHeader('x-cache','MISS');
      return res.status(200).json(result);
    }

    // ---- playlistVideos (paged) ----
    if (action === 'playlistVideos') {
      const playlistId = req.query.playlistId;
      if (!playlistId) return res.status(400).json({ error: 'playlistId required' });

      // get playlist item count if possible
      const plMeta = await ytFetch('playlists', { part: 'contentDetails,snippet', id: playlistId, maxResults: 1 });
      const total = plMeta.items?.[0]?.contentDetails?.itemCount || null;
      // if order desc -> use pageTokens caching strategy
      if (order === 'date_desc') {
        // key for page tokens cache
        const pk = `pt:playlist:${playlistId}:desc:${pageSize}`;
        if (!PAGE_TOKENS[pk] || PAGE_TOKENS[pk].expiry <= nowMs()) PAGE_TOKENS[pk] = { tokens: [''], expiry: nowMs() + DEFAULT_TTL };

        // ensure tokens array up to requested page
        while (PAGE_TOKENS[pk].tokens.length < page) {
          const tokenForPrev = PAGE_TOKENS[pk].tokens[PAGE_TOKENS[pk].tokens.length - 1];
          const resp = await ytFetch('playlistItems', { part: 'snippet,contentDetails', playlistId, maxResults: pageSize, pageToken: tokenForPrev });
          // store next token (may be undefined/null means no more)
          PAGE_TOKENS[pk].tokens.push(resp.nextPageToken || null);
          if (!resp.nextPageToken) break; // no more pages
        }

        // token to request is tokens[page-1]
        const tokenToUse = PAGE_TOKENS[pk].tokens[page-1] || '';
        const pageResp = await ytFetch('playlistItems', { part: 'snippet,contentDetails', playlistId, maxResults: pageSize, pageToken: tokenToUse });
        result.videos = (pageResp.items || []).map(it => ({
          id: it.snippet.resourceId?.videoId,
          title: it.snippet.title,
          description: it.snippet.description,
          thumbnail: it.snippet.thumbnails?.medium?.url,
          publishedAt: it.snippet.publishedAt
        }));
        // determine pageCount if total known
        if (total) result.pageCount = Math.ceil(total / pageSize);
        // if nextPageToken exists -> indicate there is a next page
        if (pageResp.nextPageToken) result.nextPage = page + 1;
      } else {
        // date_asc -> collect up to MAX_FETCH_ALL, reverse, slice
        let all = [];
        let next = '';
        do {
          const j = await ytFetch('playlistItems', { part: 'snippet,contentDetails', playlistId, maxResults: 50, pageToken: next });
          (j.items || []).forEach(it => {
            all.push({
              id: it.snippet.resourceId?.videoId,
              title: it.snippet.title,
              description: it.snippet.description,
              thumbnail: it.snippet.thumbnails?.medium?.url,
              publishedAt: it.snippet.publishedAt
            });
          });
          next = j.nextPageToken || '';
          if (all.length >= MAX_FETCH_ALL) break;
        } while (next);
        all = all.slice(0, MAX_FETCH_ALL).reverse(); // oldest first
        const start = (page - 1) * pageSize;
        const slice = all.slice(start, start + pageSize);
        result.videos = slice;
        result.pageCount = Math.ceil(all.length / pageSize);
        if (start + slice.length < all.length) result.nextPage = page + 1;
      }

      result.page = page;
      cacheSet(cacheKey, result);
      res.setHeader('x-cache','MISS');
      return res.status(200).json(result);
    }

    // ---- uploads (todos los videos del canal paginados por page) ----
    if (action === 'uploads') {
      const ch = await ytFetch('channels', { part: 'contentDetails', id: channelId });
      const uploads = ch.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
      if (!uploads) return res.status(500).json({ error: 'Uploads playlist not found' });

      if (order === 'date_desc') {
        // pageTokens caching similar to playlist
        const pk = `pt:uploads:${channelId}:desc:${pageSize}`;
        if (!PAGE_TOKENS[pk] || PAGE_TOKENS[pk].expiry <= nowMs()) PAGE_TOKENS[pk] = { tokens: [''], expiry: nowMs() + DEFAULT_TTL };

        // ensure we have tokens up to requested page
        while (PAGE_TOKENS[pk].tokens.length < page) {
          const tokenForPrev = PAGE_TOKENS[pk].tokens[PAGE_TOKENS[pk].tokens.length - 1];
          const resp = await ytFetch('playlistItems', { part: 'snippet,contentDetails', playlistId: uploads, maxResults: pageSize, pageToken: tokenForPrev });
          PAGE_TOKENS[pk].tokens.push(resp.nextPageToken || null);
          if (!resp.nextPageToken) break;
        }
        const tokenToUse = PAGE_TOKENS[pk].tokens[page-1] || '';
        const pageResp = await ytFetch('playlistItems', { part: 'snippet,contentDetails', playlistId: uploads, maxResults: pageSize, pageToken: tokenToUse });
        result.videos = (pageResp.items || []).map(it => ({
          id: it.snippet.resourceId?.videoId,
          title: it.snippet.title,
          description: it.snippet.description,
          thumbnail: it.snippet.thumbnails?.medium?.url,
          publishedAt: it.snippet.publishedAt
        }));
        // total unknown for uploads; we don't set pageCount reliably
        if (pageResp.nextPageToken) result.nextPage = page + 1;
      } else {
        // date_asc: collect up to MAX_FETCH_ALL then reverse and slice
        let all = [];
        let next = '';
        do {
          const j = await ytFetch('playlistItems', { part: 'snippet,contentDetails', playlistId: uploads, maxResults: 50, pageToken: next });
          (j.items || []).forEach(it => {
            all.push({
              id: it.snippet.resourceId?.videoId,
              title: it.snippet.title,
              description: it.snippet.description,
              thumbnail: it.snippet.thumbnails?.medium?.url,
              publishedAt: it.snippet.publishedAt
            });
          });
          next = j.nextPageToken || '';
          if (all.length >= MAX_FETCH_ALL) break;
        } while (next);
        all = all.slice(0, MAX_FETCH_ALL).reverse();
        const start = (page - 1) * pageSize;
        const slice = all.slice(start, start + pageSize);
        result.videos = slice;
        result.pageCount = Math.ceil(all.length / pageSize);
        if (start + slice.length < all.length) result.nextPage = page + 1;
      }

      result.page = page;
      cacheSet(cacheKey, result);
      res.setHeader('x-cache','MISS');
      return res.status(200).json(result);
    }

    // ---- search (simple: pageToken string prev/next) ----
    if (action === 'search') {
      if (!q) return res.status(400).json({ error: 'q parameter required' });
      const data = await ytFetch('search', { part: 'snippet', channelId, q, type: 'video', maxResults: pageSize, pageToken: req.query.pageToken || '' });
      result.videos = (data.items || []).map(it => ({
        id: it.id.videoId,
        title: it.snippet.title,
        description: it.snippet.description,
        thumbnail: it.snippet.thumbnails?.medium?.url,
        publishedAt: it.snippet.publishedAt
      }));
      if (data.nextPageToken) result.nextPage = 'next';
      if (req.query.pageToken) result.prevPage = 'prev';
      // simple server-side ordering within page
      if (order === 'date_asc') result.videos = result.videos.slice().sort((a,b)=> new Date(a.publishedAt) - new Date(b.publishedAt));
      else result.videos = result.videos.slice().sort((a,b)=> new Date(b.publishedAt) - new Date(a.publishedAt));
      cacheSet(cacheKey, result);
      res.setHeader('x-cache','MISS');
      return res.status(200).json(result);
    }

    // ---- live ----
    if (action === 'live') {
      const data = await ytFetch('search', { part: 'snippet', channelId, eventType: 'live', type: 'video', maxResults: 1 });
      if (data.items && data.items[0]) {
        const it = data.items[0];
        result.live = { id: it.id.videoId, title: it.snippet.title, thumbnail: it.snippet.thumbnails?.medium?.url };
      } else result.live = null;
      cacheSet(cacheKey, result);
      res.setHeader('x-cache','MISS');
      return res.status(200).json(result);
    }

    return res.status(400).json({ error: 'Unknown action' });

  } catch (err) {
    console.error('api/youtube error', err && (err.message || err.body || err));
    const status = err.status && Number(err.status) ? err.status : 500;
    return res.status(status).json({ error: 'Error interno', details: String(err.message || err.body || err) });
  }
}
