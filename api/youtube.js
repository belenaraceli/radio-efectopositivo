// api/youtube.js
// Vercel serverless handler para exponer endpoints que consume widget.js
// Required env: YT_API_KEY
//
// Actions supported (via query param `action`):
//  - playlists&limit=50&channelId=...         -> devuelve { playlists: [{id,title,count}, ...] }
//  - playlistVideos&playlistId=...&pageSize=10&pageToken=... -> { videos: [...], pageToken..., nextPageToken..., prevPageToken... }
//  - uploads&pageSize=10&pageToken=...&channelId=... -> videos del playlist "uploads" del canal
//  - live&channelId=...                       -> { live: { id, title, url } } or { live: null }
//  - search&q=...&channelId=...&pageSize=10   -> { videos: [...], nextPageToken... }
// 
// Deploy en Vercel: asegúrate de configurar YT_API_KEY en Environment Variables
// No incluyas tu API key en el código.

const YT = 'https://www.googleapis.com/youtube/v3';
const API_KEY = process.env.YT_API_KEY || '';
const DEFAULT_CHANNEL = process.env.DEFAULT_CHANNEL_ID || ''; // opcional

if (!API_KEY) {
  console.warn('YT API KEY not set - set YT_API_KEY env var');
}

// Helper: fetch wrapper
async function ytFetch(path, params = {}) {
  const url = new URL(`${YT}/${path}`);
  url.searchParams.set('key', API_KEY);
  for (const k of Object.keys(params)) {
    if (params[k] !== undefined && params[k] !== null) url.searchParams.set(k, params[k]);
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    const txt = await res.text().catch(()=>null);
    const err = new Error(`YouTube API error ${res.status}: ${txt || res.statusText}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// Map playlistItems -> simplified video object
function mapPlaylistItemToVideo(item) {
  // item.snippet.resourceId.videoId
  const snippet = item.snippet || {};
  const resource = snippet.resourceId || {};
  const vid = resource.videoId || snippet.videoId || (item.id && item.id.videoId) || null;
  const thumbnails = snippet.thumbnails || {};
  const thumb = (thumbnails.maxres && thumbnails.maxres.url) ||
                (thumbnails.high && thumbnails.high.url) ||
                (thumbnails.medium && thumbnails.medium.url) ||
                (thumbnails.default && thumbnails.default.url) ||
                null;
  return {
    id: vid,
    title: snippet.title || '',
    description: snippet.description || '',
    thumbnail: thumb,
    publishedAt: snippet.publishedAt || null,
  };
}

// Map searchItem -> simplified video object
function mapSearchItemToVideo(item) {
  const idObj = item.id || {};
  const vid = idObj.videoId || (item.snippet && item.snippet.resourceId && item.snippet.resourceId.videoId) || null;
  const thumbnails = (item.snippet && item.snippet.thumbnails) || {};
  const thumb = (thumbnails.high && thumbnails.high.url) ||
                (thumbnails.medium && thumbnails.medium.url) ||
                (thumbnails.default && thumbnails.default.url) || null;
  return {
    id: vid,
    title: item.snippet ? item.snippet.title : '',
    description: item.snippet ? item.snippet.description : '',
    thumbnail: thumb,
    publishedAt: item.snippet ? item.snippet.publishedAt : null,
  };
}

// Get uploads playlist id for channel
async function getUploadsPlaylistId(channelId) {
  // channels.list part=contentDetails
  const data = await ytFetch('channels', { part: 'contentDetails', id: channelId });
  if (!data || !data.items || !data.items.length) return null;
  const uploads = data.items[0].contentDetails.relatedPlaylists.uploads;
  return uploads || null;
}

// CORS-safe JSON response
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}

// Main handler (Vercel compatible)
// Vercel Serverless supports both default export function (for Node) and edge functions (different signature).
// This file uses the fetch handler signature so it can be used as an Edge function or normal serverless endpoint.
// If your project uses the older Node style (module.exports), Vercel still accepts this signature.
export default async function handler(req) {
  try {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    const url = new URL(req.url);
    const params = url.searchParams;
    const action = params.get('action') || 'uploads';
    const channelId = params.get('channelId') || DEFAULT_CHANNEL;
    const pageSize = Math.min(50, Number(params.get('pageSize') || 10)); // YouTube max 50
    const pageToken = params.get('pageToken') || undefined;
    const playlistId = params.get('playlistId') || undefined;
    const q = params.get('q') || undefined;
    const order = params.get('order') || 'date'; // for search
    const detectLive = params.get('detectLive') === '1' || params.get('detectLive') === 'true';

    if (!API_KEY) {
      return jsonResponse({ error: 'YT API key not configured (env YT_API_KEY)' }, 500);
    }

    // --- ACTION: playlists ---
    if (action === 'playlists') {
      if (!channelId) return jsonResponse({ error: 'channelId required' }, 400);
      const limit = Math.min(50, Number(params.get('limit') || 50));
      const data = await ytFetch('playlists', { part: 'snippet,contentDetails', channelId, maxResults: limit.toString() });
      const playlists = (data.items || []).map(p => ({
        id: p.id,
        title: (p.snippet && p.snippet.title) || '',
        count: (p.contentDetails && p.contentDetails.itemCount) || 0
      }));
      return jsonResponse({ playlists });
    }

    // --- ACTION: playlistVideos ---
    if (action === 'playlistVideos') {
      if (!playlistId) return jsonResponse({ error: 'playlistId required' }, 400);
      const data = await ytFetch('playlistItems', {
        part: 'snippet,contentDetails',
        playlistId,
        maxResults: pageSize.toString(),
        pageToken
      });
      const videos = (data.items || []).map(mapPlaylistItemToVideo).filter(v => v.id);
      return jsonResponse({
        videos,
        pageToken: data.nextPageToken || null,
        prevPageToken: data.prevPageToken || null,
        totalResults: data.pageInfo ? data.pageInfo.totalResults : null
      });
    }

    // --- ACTION: uploads (videos from channel uploads playlist) ---
    if (action === 'uploads') {
      if (!channelId) return jsonResponse({ error: 'channelId required' }, 400);
      const uploadsId = await getUploadsPlaylistId(channelId);
      if (!uploadsId) return jsonResponse({ videos: [], message: 'No uploads playlist found' });
      const data = await ytFetch('playlistItems', {
        part: 'snippet,contentDetails',
        playlistId: uploadsId,
        maxResults: pageSize.toString(),
        pageToken
      });
      const videos = (data.items || []).map(mapPlaylistItemToVideo).filter(v => v.id);
      return jsonResponse({
        videos,
        pageToken: data.nextPageToken || null,
        prevPageToken: data.prevPageToken || null,
        totalResults: data.pageInfo ? data.pageInfo.totalResults : null
      });
    }

    // --- ACTION: search (channel-scoped) ---
    if (action === 'search') {
      if (!channelId) return jsonResponse({ error: 'channelId required' }, 400);
      if (!q) return jsonResponse({ error: 'q (query) is required for search' }, 400);
      const data = await ytFetch('search', {
        part: 'snippet',
        q,
        channelId,
        order,
        type: 'video',
        maxResults: pageSize.toString(),
        pageToken
      });
      const videos = (data.items || []).map(mapSearchItemToVideo).filter(v => v.id);
      return jsonResponse({
        videos,
        pageToken: data.nextPageToken || null,
        totalResults: data.pageInfo ? data.pageInfo.totalResults : null
      });
    }

    // --- ACTION: live (detect active live video for channel) ---
    if (action === 'live') {
      if (!channelId) return jsonResponse({ error: 'channelId required' }, 400);
      // search for live event in channel
      try {
        const liveData = await ytFetch('search', {
          part: 'snippet',
          channelId,
          eventType: 'live',
          type: 'video',
          maxResults: '1'
        });
        if (liveData && liveData.items && liveData.items.length) {
          const it = liveData.items[0];
          const vid = (it.id && it.id.videoId) || null;
          const title = (it.snippet && it.snippet.title) || '';
          const urlVideo = vid ? `https://www.youtube.com/watch?v=${vid}` : null;
          return jsonResponse({ live: vid ? { id: vid, title, url: urlVideo } : null });
        } else {
          return jsonResponse({ live: null });
        }
      } catch(e) {
        // if search fails, return null (non-fatal)
        return jsonResponse({ live: null });
      }
    }

    // default: return helpful message
    return jsonResponse({
      message: 'YouTube API proxy endpoint',
      actions: ['playlists', 'playlistVideos', 'uploads', 'search', 'live'],
      notes: 'Set YT_API_KEY env var in Vercel. Use ?action=uploads&channelId=... or action=playlists&channelId=...'
    });
  } catch (err) {
    console.error('youtube api error', err);
    return jsonResponse({ error: err.message || String(err) }, err.status || 500);
  }
}
