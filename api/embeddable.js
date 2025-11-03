// api/embeddable.js  (CommonJS, listo para Vercel)
const BASE = 'https://www.googleapis.com/youtube/v3';

function okJson(res, data){ res.setHeader('Content-Type','application/json'); res.status(200).send(JSON.stringify(data)); }
function err(res, msg, code=500){ res.status(code).send({ error: msg }); }

async function fetchJson(url){
  const r = await fetch(url);
  if (!r.ok) throw new Error(`YT API ${r.status} ${r.statusText}`);
  return r.json();
}

// search.list -> obtener ids de videos de un channel (una página)
async function searchListVideoIds(apiKey, channelId, pageToken){
  const q = new URL(`${BASE}/search`);
  q.searchParams.set('key', apiKey);
  q.searchParams.set('part', 'id');
  q.searchParams.set('channelId', channelId);
  q.searchParams.set('type', 'video');
  q.searchParams.set('maxResults', '50');
  if (pageToken) q.searchParams.set('pageToken', pageToken);
  const j = await fetchJson(q.toString());
  const ids = (j.items||[]).map(it => it.id && it.id.videoId).filter(Boolean);
  return { ids, nextPageToken: j.nextPageToken || null };
}

// videos.list -> obtener status.embeddable para hasta 50 ids
async function videosListStatus(apiKey, ids){
  if (!ids || ids.length===0) return [];
  const q = new URL(`${BASE}/videos`);
  q.searchParams.set('key', apiKey);
  q.searchParams.set('part', 'status,snippet');
  q.searchParams.set('id', ids.join(','));
  const j = await fetchJson(q.toString());
  return (j.items||[]).map(it => ({
    id: it.id,
    title: it.snippet?.title || '',
    embeddable: !!(it.status && it.status.embeddable)
  }));
}

module.exports = async (req, res) => {
  try {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) return err(res, 'YOUTUBE_API_KEY no configurada', 500);

    const { videoId, channelId, pageToken } = Object.assign({}, req.query || {}, req.body || {});

    // 1) consulta por videoId
    if (videoId) {
      const rows = await videosListStatus(apiKey, [videoId]);
      if (rows.length === 0) return okJson(res, { videoId, embeddable: false, note: 'video not found' });
      return okJson(res, rows[0]);
    }

    // 2) consulta por channelId: recorrer páginas hasta 200 videos por defecto (evitar loops infinitos)
    if (channelId) {
      let allIds = [];
      let token = pageToken || null;
      let pages = 0;
      while (pages < 5) { // 5 pages * 50 = 250 videos max per request
        const out = await searchListVideoIds(apiKey, channelId, token);
        allIds = allIds.concat(out.ids);
        token = out.nextPageToken;
        pages++;
        if (!token) break;
      }
      // batch en bloques de 50
      const chunks = [];
      for (let i=0;i<allIds.length;i+=50) chunks.push(allIds.slice(i,i+50));
      const results = [];
      for (const c of chunks) {
        const r = await videosListStatus(apiKey, c);
        results.push(...r);
      }
      return okJson(res, { channelId, videos: results, total: results.length });
    }

    // 3) si no se pasaron parámetros
    return err(res, 'Pasa ?videoId=... o ?channelId=...', 400);
  } catch (e) {
    console.error('api/embeddable error', e);
    return err(res, e.message || 'internal');
  }
};
