// api/youtube.js
// YouTube Data API v3 handler for Vercel serverless
// Supports: action=uploads|playlists|playlistVideos|search|live
// Supports order=date_desc (efficient) and order=date_asc (collect up to MAX_FETCH_ALL and reverse)
// Requires process.env.YOUTUBE_API_KEY
const API_BASE = 'https://www.googleapis.com/youtube/v3';
const CACHE = {};
const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

function nowMs(){ return Date.now(); }
function cacheGet(key){ const c = CACHE[key]; if (c && c.expiry > nowMs()) return c.data; return null; }
function cacheSet(key, data, ttl = DEFAULT_TTL){ CACHE[key] = { expiry: nowMs() + ttl, data }; }

// Simple YouTube fetch wrapper
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
    err.status = res.status;
    err.body = txt;
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
    const limit = Math.min(50, Number(req.query.limit) || 12);
    const pageToken = req.query.pageToken || '';
    const q = req.query.q ? String(req.query.q) : '';
    const order = (req.query.order || 'date_desc').toString(); // date_desc or date_asc
    const MAX_FETCH_ALL = Number(process.env.YT_MAX_FETCH_ALL || 500);

    const cacheKey = JSON.stringify({ action, channelParam, limit, pageToken, q, order });
    const cached = cacheGet(cacheKey);
    if (cached) { res.setHeader('x-cache','HIT'); return res.status(200).json(cached); }

    // resolve channelId
    async function resolveChannelId(param) {
      if (/^UC[a-zA-Z0-9_-]{20,}$/.test(param)) return param;
      // search for channel
      const s = await ytFetch('search', { part: 'snippet', type: 'channel', q: param, maxResults: 1 });
      if (s.items && s.items[0] && s.items[0].id && s.items[0].id.channelId) return s.items[0].id.channelId;
      // try forUsername
      const c = await ytFetch('channels', { part: 'id', forUsername: param });
      if (c.items && c.items[0] && c.items[0].id) return c.items[0].id;
      return null;
    }

    const channelId = await resolveChannelId(channelParam);
    if (!channelId) return res.status(404).json({ error: 'Channel not found' });

    const result = { channelId };

    if (action === 'playlists') {
      const data = await ytFetch('playlists', { part: 'snippet,contentDetails', channelId, maxResults: limit });
      result.playlists = (data.items || []).map(p => ({
        id: p.id,
        title: p.snippet.title,
        count: p.contentDetails.itemCount,
        thumbnail: p.snippet.thumbnails?.medium?.url
      }));
    }

    else if (action === 'playlistVideos') {
      const playlistId = req.query.playlistId;
      if (!playlistId) return res.status(400).json({ error: 'playlistId required' });
      const data = await ytFetch('playlistItems', { part: 'snippet,contentDetails', playlistId, maxResults: limit, pageToken });
      result.videos = (data.items || []).map(it => {
        const sn = it.snippet || {};
        return {
          id: sn.resourceId?.videoId,
          title: sn.title,
          description: sn.description,
          thumbnail: sn.thumbnails?.medium?.url,
          publishedAt: sn.publishedAt
        };
      });
      if (data.nextPageToken) result.nextPageToken = data.nextPageToken;
    }

    else if (action === 'uploads') {
      // get uploads playlist id
      const ch = await ytFetch('channels', { part: 'contentDetails', id: channelId });
      const uploads = ch.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
      if (!uploads) return res.status(500).json({ error: 'Uploads playlist not found' });

      if (order === 'date_desc') {
        // efficient: use playlistItems pageToken (YouTube returns newest first)
        const data = await ytFetch('playlistItems', { part: 'snippet,contentDetails', playlistId: uploads, maxResults: limit, pageToken });
        result.videos = (data.items || []).map(item => ({
          id: item.snippet.resourceId.videoId,
          title: item.snippet.title,
          description: item.snippet.description,
          thumbnail: item.snippet.thumbnails?.medium?.url,
          publishedAt: item.snippet.publishedAt
        }));
        if (data.nextPageToken) result.nextPageToken = data.nextPageToken;
      } else {
        // date_asc: gather up to MAX_FETCH_ALL items, reverse (oldest first), then serve by numeric offset (pageToken as offset)
        let all = [];
        let next = '';
        do {
          const j = await ytFetch('playlistItems', { part: 'snippet,contentDetails', playlistId: uploads, maxResults: 50, pageToken: next });
          (j.items || []).forEach(it => {
            all.push({
              id: it.snippet.resourceId.videoId,
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
        const offset = Math.max(0, Number(pageToken || 0));
        const slice = all.slice(offset, offset + limit);
        result.videos = slice;
        const newOffset = offset + slice.length;
        if (newOffset < all.length) result.nextPageToken = String(newOffset);
        else result.nextPageToken = null;
      }
    }

    else if (action === 'search') {
      if (!q) return res.status(400).json({ error: 'q parameter required for search' });
      // YouTube search supports order? not for channel-limited search; we'll respect 'order' by post-processing limited set.
      // Use search.list (returns most relevant/date default), then map videos
      const data = await ytFetch('search', { part: 'snippet', channelId, q, type: 'video', maxResults: limit, pageToken });
      result.videos = (data.items || []).map(it => ({
        id: it.id.videoId,
        title: it.snippet.title,
        description: it.snippet.description,
        thumbnail: it.snippet.thumbnails?.medium?.url,
        publishedAt: it.snippet.publishedAt
      }));
      if (data.nextPageToken) result.nextPageToken = data.nextPageToken;
      // If order === date_asc, we do a local reverse of the current page (server-side)
      if (order === 'date_asc' && Array.isArray(result.videos)) {
        result.videos = result.videos.slice().sort((a,b)=> new Date(a.publishedAt) - new Date(b.publishedAt));
      } else {
        result.videos = result.videos.slice().sort((a,b)=> new Date(b.publishedAt) - new Date(a.publishedAt));
      }
    }

    else if (action === 'live') {
      const data = await ytFetch('search', { part: 'snippet', channelId, eventType: 'live', type: 'video', maxResults: 1 });
      if (data.items && data.items[0]) {
        const it = data.items[0];
        result.live = { id: it.id.videoId, title: it.snippet.title, thumbnail: it.snippet.thumbnails?.medium?.url };
      } else result.live = null;
    }

    else {
      return res.status(400).json({ error: 'Unknown action' });
    }

    cacheSet(cacheKey, result);
    res.setHeader('x-cache','MISS');
    return res.status(200).json(result);

  } catch (err) {
    console.error('api/youtube error', err && (err.message || err.body || err));
    if (err.status) {
      // If it's a YouTube API error, try to forward body
      return res.status(err.status === 403 ? 403 : 500).json({ error: 'Error interno', details: err.message || err.body || String(err) });
    }
    return res.status(500).json({ error: 'Error interno', details: String(err && (err.message || err)) });
  }
}
