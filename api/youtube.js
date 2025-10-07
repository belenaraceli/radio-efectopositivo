// api/youtube.js
// ========================================
// Widget backend para YouTube Data API v3
// ----------------------------------------
// 🔹 Permite listar videos, playlists, buscar dentro del canal y detectar transmisiones en vivo
// 🔹 Usar variable de entorno YOUTUBE_API_KEY (nunca exponer en frontend)
// ========================================

const API_BASE = 'https://www.googleapis.com/youtube/v3';
const CACHE = {};
const TTL = 5 * 60 * 1000; // cache 5 minutos

function now() {
  return Date.now();
}

// Función auxiliar para llamadas a la API
async function ytFetch(endpoint, params = {}) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error('Falta la variable YOUTUBE_API_KEY en Vercel');

  params.key = apiKey;
  const qs = new URLSearchParams(params).toString();
  const url = `${API_BASE}/${endpoint}?${qs}`;

  const res = await fetch(url);
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`Error YouTube API (${res.status}): ${msg}`);
  }

  return res.json();
}

// ==============================
// Handler principal (Vercel)
// ==============================
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const action = (req.query.action || 'uploads').toString(); // acción: uploads | playlists | search | live
    const rawChannel = (req.query.channelId || '@radioefectopositivo').toString();
    const limit = Math.min(50, Number(req.query.limit) || 12);
    const pageToken = req.query.pageToken || '';
    const q = req.query.q ? String(req.query.q) : '';

    // -----------------------------
    // Resolver ID real del canal
    // -----------------------------
    async function resolveChannelId(param) {
      if (/^UC[a-zA-Z0-9_-]{20,}$/.test(param)) return param;

      const search = await ytFetch('search', {
        part: 'snippet',
        type: 'channel',
        q: param.replace('@', ''),
        maxResults: 1,
      });

      if (search.items?.length) {
        return search.items[0].id.channelId;
      }

      const ch = await ytFetch('channels', {
        part: 'id',
        forUsername: param.replace('@', ''),
      });

      return ch.items?.[0]?.id || null;
    }

    const cacheKey = JSON.stringify({ action, rawChannel, limit, pageToken, q });
    if (CACHE[cacheKey] && CACHE[cacheKey].expiry > now()) {
      res.setHeader('x-cache', 'HIT');
      return res.status(200).json(CACHE[cacheKey].data);
    }

    const channelId = await resolveChannelId(rawChannel);
    if (!channelId) {
      return res.status(404).json({ error: 'Canal no encontrado' });
    }

    let result = { channelId };

    // -----------------------------
    // Acciones disponibles
    // -----------------------------
    if (action === 'uploads') {
      // Videos subidos (todos los del canal)
      const ch = await ytFetch('channels', {
        part: 'contentDetails',
        id: channelId,
      });

      const uploads = ch.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
      if (!uploads) return res.status(500).json({ error: 'No se encontró la playlist de subidas' });

      const data = await ytFetch('playlistItems', {
        part: 'snippet,contentDetails',
        playlistId: uploads,
        maxResults: limit,
        pageToken,
      });

      result.videos = data.items.map(item => ({
        id: item.snippet.resourceId.videoId,
        title: item.snippet.title,
        description: item.snippet.description,
        thumbnail: item.snippet.thumbnails?.medium?.url,
        publishedAt: item.snippet.publishedAt,
      }));

      if (data.nextPageToken) result.nextPageToken = data.nextPageToken;
    }

    else if (action === 'playlists') {
      // Listar todas las playlists del canal
      const data = await ytFetch('playlists', {
        part: 'snippet,contentDetails',
        channelId,
        maxResults: limit,
      });

      result.playlists = data.items.map(p => ({
        id: p.id,
        title: p.snippet.title,
        count: p.contentDetails.itemCount,
        thumbnail: p.snippet.thumbnails?.medium?.url,
      }));
    }

    else if (action === 'search') {
      // Buscar videos por palabra clave
      const data = await ytFetch('search', {
        part: 'snippet',
        channelId,
        q,
        type: 'video',
        maxResults: limit,
        pageToken,
      });

      result.videos = data.items.map(v => ({
        id: v.id.videoId,
        title: v.snippet.title,
        thumbnail: v.snippet.thumbnails?.medium?.url,
        publishedAt: v.snippet.publishedAt,
      }));

      if (data.nextPageToken) result.nextPageToken = data.nextPageToken;
    }

    else if (action === 'live') {
      // Detectar transmisiones en vivo
      const data = await ytFetch('search', {
        part: 'snippet',
        channelId,
        eventType: 'live',
        type: 'video',
        maxResults: 1,
      });

      if (data.items?.length) {
        const live = data.items[0];
        result.live = {
          id: live.id.videoId,
          title: live.snippet.title,
          thumbnail: live.snippet.thumbnails?.medium?.url,
        };
      } else {
        result.live = null;
      }
    }

    else {
      return res.status(400).json({ error: 'Acción no válida' });
    }

    // Guardar en cache local
    CACHE[cacheKey] = { expiry: now() + TTL, data: result };

    res.setHeader('x-cache', 'MISS');
    return res.status(200).json(result);

  } catch (err) {
    console.error('Error en /api/youtube:', err);
    return res.status(500).json({ error: 'Error interno', details: String(err.message || err) });
  }
}
