module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Get credentials from query or default
  const { searchParams } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const username = searchParams.get('username') || '0192928383747';
  const password = searchParams.get('password') || '0192929383883';
  const server = 'http://rgkkw.live:8080';

  const headers = {
    'User-Agent': 'IPTVSmarters/1.0'
  };

  try {
    // 1. Fetch categories & streams in parallel
    const [catRes, streamRes] = await Promise.all([
      fetch(`${server}/player_api.php?username=${username}&password=${password}&action=get_live_categories`, { headers }),
      fetch(`${server}/player_api.php?username=${username}&password=${password}&action=get_live_streams`, { headers })
    ]);

    if (!streamRes.ok) {
      return res.status(502).send(`Error from IPTV server: ${streamRes.statusText}`);
    }

    const categoriesData = await catRes.json().catch(() => []);
    const streams = await streamRes.json().catch(() => []);

    const categoryMap = {};
    if (Array.isArray(categoriesData)) {
      for (const cat of categoriesData) {
        categoryMap[String(cat.category_id)] = cat.category_name || 'Live TV';
      }
    }

    // 2. Build M3U string chunks
    let m3u = '#EXTM3U\n';
    if (Array.isArray(streams)) {
      for (const s of streams) {
        const name = (s.name || 'Unknown Channel').replace(/[\r\n]+/g, ' ');
        const streamId = s.stream_id;
        const catName = categoryMap[String(s.category_id)] || 'Other';
        const logo = s.stream_icon || '';
        const epg = s.epg_channel_id || '';

        m3u += `#EXTINF:-1 tvg-id="${epg}" tvg-name="${name}" tvg-logo="${logo}" group-title="${catName}",${name}\n`;
        m3u += `${server}/live/${username}/${password}/${streamId}.ts\n`;
      }
    }

    // Cache on Vercel CDN for 15 minutes, revalidate in background up to 1 hour
    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
    res.setHeader('Content-Type', 'audio/x-mpegurl; charset=utf-8');
    return res.status(200).send(m3u);
  } catch (err) {
    console.error('Error generating M3U:', err);
    return res.status(500).send(`Server Error: ${err.message}`);
  }
};
