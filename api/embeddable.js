// api/embeddable.js  (CommonJS, listo para Vercel)
const BASE = 'https://www.googleapis.com/youtube/v3';

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`YT API ${r.status} ${r.statusText}`);
  return r.json();
}

module.exports = async (req, res) => {
  try {
    const apiKey = process.env.YOUTUBE_API_KEY || process.env.YT_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'YOUTUBE_API_KEY no configurada' });

    const { videoId, channelId } = req.query || {};
    if (!videoId && !channelId) return res.status(400).json({ error: 'Pasa ?videoId=... o ?channelId=...' });

    // Si piden videoId -> detalles completos (diagnóstico)
    if (videoId) {
      const q = new URL(`${BASE}/videos`);
      q.searchParams.set('key', apiKey);
      q.searchParams.set('part', 'status,contentDetails,snippet');
      q.searchParams.set('id', videoId);
      const j = await fetchJson(q.toString());
      if (!j.items || j.items.length === 0) return res.status(404).json({ id: videoId, found: false });
      const it = j.items[0];
      const out = {
        id: it.id,
        title: it.snippet?.title || '',
        embeddable: !!(it.status && it.status.embeddable),
        privacyStatus: it.status?.privacyStatus || null,
        uploadStatus: it.status?.uploadStatus || null,
        rejectionReason: it.status?.rejectionReason || null,
        contentRating: it.contentDetails?.contentRating || null,
        regionRestriction: it.contentDetails?.regionRestriction || null,
        snippet: {
          channelTitle: it.snippet?.channelTitle || '',
          publishedAt: it.snippet?.publishedAt || null,
        }
      };
      return res.setHeader('Content-Type','application/json').status(200).send(JSON.stringify(out));
    }

    // Si piden channelId -> listar embeddability de varios videos (comportamiento similar al anterior embeddable.js)
    if (channelId) {
      // simple delegación al endpoint original: search.list + videos.list batching
      const MAX_PAGES = 5; // 5*50 = 250 videos max
      const ids = [];
      let pageToken = null;
      let pages = 0;
      while (pages < MAX_PAGES) {
        const s = new URL(`${BASE}/search`);
        s.searchParams.set('key', apiKey);
        s.searchParams.set('part', 'id');
        s.searchParams.set('channelId', channelId);
        s.searchParams.set('type', 'video');
        s.searchParams.set('maxResults', '50');
        if (pageToken) s.searchParams.set('pageToken', pageToken);
        const sj = await fetchJson(s.toString());
        (sj.items || []).forEach(it => {
          const vid = it.id && it.id.videoId;
          if (vid) ids.push(vid);
        });
        pageToken = sj.nextPageToken || null;
        pages++;
        if (!pageToken) break;
      }
      // batch videos.list
      const out = [];
      for (let i=0;i<ids.length;i+=50) {
        const chunk = ids.slice(i,i+50);
        const v = new URL(`${BASE}/videos`);
        v.searchParams.set('key', apiKey);
        v.searchParams.set('part', 'status,snippet');
        v.searchParams.set('id', chunk.join(','));
        const vj = await fetchJson(v.toString());
        (vj.items || []).forEach(it => {
          out.push({
            id: it.id,
            title: it.snippet?.title || '',
            embeddable: !!(it.status && it.status.embeddable)
          });
        });
      }
      return res.setHeader('Content-Type','application/json').status(200).send(JSON.stringify({ channelId, total: out.length, videos: out }));
    }

    return res.status(400).json({ error: 'Parámetros inválidos' });
  } catch (err) {
    console.error('api/embeddable error', err);
    return res.status(500).json({ error: err.message || 'internal' });
  }
};
