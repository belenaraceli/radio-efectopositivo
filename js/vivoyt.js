// Abre una ventana emergente con el live de YouTube si existe; si no, abre el último upload; si falla, abre el canal.
async function vivoYT() {
  const channel = 'radioefectopositivo'; // sin @
  const apiBase = '/api/youtube'; // tu endpoint (ajusta si es distinto)
  // ventana - features
  const features = 'toolbar=no,location=no,status=no,menubar=no,scrollbars=yes,resizable=yes,width=960,height=540';

  try {
    // 1) comprobar transmisión en vivo
    const liveResp = await fetch(`${apiBase}?action=live&channelId=${encodeURIComponent(channel)}&pageSize=1`);
    if (liveResp.ok) {
      const liveJson = await liveResp.json();
      if (liveJson && liveJson.live && liveJson.live.id) {
        const liveId = liveJson.live.id;
        // Abrir embed en nueva ventana (opción: usar la página normal de YouTube si preferís controles estándar)
        // Opciones: embed con autoplay=0 (no autoplay) para que usuario presione play, o autoplay=1 si querés que empiece.
        const embedUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(liveId)}`;
        window.open(embedUrl, '_blank', features);
        return;
      }
    }

    // 2) si no hay live, pedir el último upload (fallback)
    const uploadsResp = await fetch(`${apiBase}?action=uploads&page=1&channelId=${encodeURIComponent(channel)}&pageSize=1`);
    if (uploadsResp.ok) {
      const uploadsJson = await uploadsResp.json();
      const video = (uploadsJson.videos && uploadsJson.videos[0]) || null;
      if (video && video.id) {
        const vidUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`;
        window.open(vidUrl, '_blank', features);
        return;
      }
    }

    // 3) fallback final: abrir el canal
    const channelUrl = `https://www.youtube.com/@${channel}`;
    window.open(channelUrl, '_blank', features);

  } catch (err) {
    console.error('vivoYT error', err);
    // fallback robusto
    const channelUrl = `https://www.youtube.com/@${channel}`;
    window.open(channelUrl, '_blank', features);
  }
}
