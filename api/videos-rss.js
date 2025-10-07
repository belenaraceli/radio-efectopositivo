// api/videos-rss.js - versión mejorada: search + detectLive
const CACHE = {};
const TTL_MS = 15 * 60 * 1000; // 15 minutos

function nowMs(){ return Date.now(); }
function cacheKey(k,limit,q,live){ return `${k}::${limit}::${q||''}::${live?1:0}`; }

async function resolveChannelIdFromHandle(handle) {
  if (/^UC[a-zA-Z0-9_-]{20,}$/.test(handle)) return handle;
  const page = handle.startsWith('@') ? `https://www.youtube.com/${handle}` : `https://www.youtube.com/@${handle}`;
  try {
    const r = await fetch(page, { headers: { 'User-Agent': 'curl/7.64' } });
    if (!r.ok) return null;
    const text = await r.text();
    const m = text.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']https?:\/\/www\.youtube\.com\/channel\/(UC[0-9A-Za-z_-]{20,})['"]/i);
    if (m && m[1]) return m[1];
    const m2 = text.match(/"channelId"\s*:\s*"(?<cid>UC[0-9A-Za-z_-]{20,})"/);
    if (m2 && m2.groups && m2.groups.cid) return m2.groups.cid;
    const m3 = text.match(/\/channel\/(UC[0-9A-Za-z_-]{20,})/);
    if (m3 && m3[1]) return m3[1];
    return null;
  } catch (e) {
    console.error('resolveChannelIdFromHandle error', e);
    return null;
  }
}

function parseYoutubeRss(xml, limit) {
  const entries = Array.from(xml.matchAll(/<entry[\s\S]*?<\/entry>/gi)).map(m => m[0]);
  const videos = [];
  for (let i = 0; i < Math.min(limit, entries.length); i++) {
    const entry = entries[i];
    const idMatch = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/i);
    const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/i);
    const linkMatch = entry.match(/<link[^>]*href=["']([^"']+)["'][^>]*>/i);
    const publishedMatch = entry.match(/<published>([^<]+)<\/published>/i);
    const thumbMatch = entry.match(/<media:thumbnail[^>]*url=["']([^"']+)["']/i);
    const descMatch = entry.match(/<media:description[^>]*>([\s\S]*?)<\/media:description>/i);

    const id = idMatch ? idMatch[1] : null;
    const title = titleMatch ? titleMatch[1].trim() : '';
    const link = linkMatch ? linkMatch[1] : (id ? `https://www.youtube.com/watch?v=${id}` : null);
    const publishedAt = publishedMatch ? publishedMatch[1] : null;
    const thumbnail = thumbMatch ? thumbMatch[1] : null;
    const description = descMatch ? descMatch[1].trim() : '';

    if (id) videos.push({ id, title, thumbnail, publishedAt, link, description });
  }
  return videos;
}

// Detecta si hay live: consulta /channel/CHANNEL_ID/live y ve si redirige a watch?v=
async function detectLiveVideo(channelId) {
  try {
    const liveUrl = `https://www.youtube.com/channel/${encodeURIComponent(channelId)}/live`;
    // hacemos fetch sin seguir cross-origin JS restrictions (esto corre server-side)
    const r = await fetch(liveUrl, { redirect: 'follow', headers: { 'User-Agent': 'curl/7.64' } });
    // En muchos casos YouTube responde 200 y el body contiene un redirect meta. Otra técnica: comprobar r.url si cambió.
    // Algunos entornos serverless no exponen final URL, así que también parseamos el body para encontrar /watch?v=
    const finalUrl = r.url || '';
    if (finalUrl && finalUrl.includes('/watch')) {
      const m = finalUrl.match(/[?&]v=([^&]+)/);
      if (m && m[1]) return { id: m[1], url: finalUrl };
    }
    const body = await r.text();
    const m2 = body.match(/\/watch\?v=([0-9A-Za-z_-]{11})/);
    if (m2 && m2[1]) {
      return { id: m2[1], url: `https://www.youtube.com/watch?v=${m2[1]}` };
    }
    return null;
  } catch (e) {
    console.warn('detectLiveVideo error', e);
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    const raw = (req.query.channelId || 'radioefectopositivo').toString().trim();
    const handle = raw.replace(/^@/, '');
    const limit = Math.min(50, Number(req.query.limit) || 12);
    const q = req.query.q ? String(req.query.q).trim().toLowerCase() : '';
    const wantLive = (req.query.detectLive === 'true' || req.query.detectLive === '1');

    const key = cacheKey(handle, limit, q, wantLive);
    if (CACHE[key] && CACHE[key].expiry > nowMs()) {
      res.setHeader('x-cache', 'HIT');
      return res.status(200).json(CACHE[key].data);
    }

    const channelId = await resolveChannelIdFromHandle(handle);
    if (!channelId) return res.status(404).json({ error: 'ChannelId not found for handle ' + handle });

    const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
    const r = await fetch(feedUrl);
    if (!r.ok) return res.status(502).json({ error: 'Failed fetching RSS', status: r.status });
    const xml = await r.text();
    let videos = parseYoutubeRss(xml, limit*1); // initially parse up to requested limit

    // Si vino q, filtramos (title o description)
    if (q) {
      videos = videos.filter(v => ((v.title || '').toLowerCase().includes(q)) || ((v.description || '').toLowerCase().includes(q)));
    }

    // Limit after filtering
    videos = videos.slice(0, limit);

    const result = { channelId, videos };

    // Detect live if requested
    if (wantLive) {
      const live = await detectLiveVideo(channelId);
      if (live) result.live = live;
    }

    CACHE[key] = { expiry: nowMs() + TTL_MS, data: result };
    res.setHeader('x-cache', 'MISS');
    return res.status(200).json(result);
  } catch (err) {
    console.error('api/videos-rss error', err);
    return res.status(500).json({ error: 'internal_error', details: String(err) });
  }
}
