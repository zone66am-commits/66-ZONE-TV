/**
 * Cloudflare Worker — HLS/M3U8 HTTPS proxy
 * Deploy this worker, then put its URL + "?url=" in HLS_PROXY inside the HTML.
 *
 * Example:
 * const HLS_PROXY = 'https://YOUR-WORKER.workers.dev/?url=';
 *
 * IMPORTANT: This worker is intentionally restricted to the hostnames found
 * in the supplied M3U file. Add/remove hosts only if you trust them.
 */

const ALLOWED_HOSTS = new Set(['premium2.ottpro2.org']);

function corsHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
    'Access-Control-Allow-Headers': 'Range,Origin,Referer,User-Agent,Content-Type',
    'Access-Control-Expose-Headers': 'Content-Length,Content-Range,Accept-Ranges,Content-Type',
    ...extra
  };
}

function proxiedUrl(workerOrigin, target) {
  return workerOrigin + '?url=' + encodeURIComponent(target);
}

function rewriteManifest(text, baseUrl, workerOrigin) {
  const lines = text.split(/\r?\n/);

  return lines.map(line => {
    const trimmed = line.trim();

    // Rewrite URI="..." inside EXT-X-KEY / EXT-X-MAP / similar tags.
    if (trimmed.startsWith('#') && /URI="/i.test(line)) {
      return line.replace(/URI="([^"]+)"/gi, (_, uri) => {
        const absolute = new URL(uri, baseUrl).href;
        return `URI="${proxiedUrl(workerOrigin, absolute)}"`;
      });
    }

    // Leave comments/tags alone.
    if (!trimmed || trimmed.startsWith('#')) return line;

    try {
      const absolute = new URL(trimmed, baseUrl).href;
      return proxiedUrl(workerOrigin, absolute);
    } catch {
      return line;
    }
  }).join('\n');
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    const requestUrl = new URL(request.url);
    const raw = requestUrl.searchParams.get('url');

    if (!raw) {
      return new Response('Missing ?url=', {
        status: 400,
        headers: corsHeaders({'Content-Type': 'text/plain; charset=utf-8'})
      });
    }

    let target;
    try {
      target = new URL(raw);
    } catch {
      return new Response('Invalid URL', {
        status: 400,
        headers: corsHeaders({'Content-Type': 'text/plain; charset=utf-8'})
      });
    }

    if (!/^https?:$/.test(target.protocol) || !ALLOWED_HOSTS.has(target.hostname)) {
      return new Response('Host not allowed', {
        status: 403,
        headers: corsHeaders({'Content-Type': 'text/plain; charset=utf-8'})
      });
    }

    const upstreamHeaders = new Headers();
    const range = request.headers.get('Range');
    if (range) upstreamHeaders.set('Range', range);
    upstreamHeaders.set('User-Agent', 'Mozilla/5.0');

    let upstream;
    try {
      upstream = await fetch(target.href, {
        method: request.method === 'HEAD' ? 'HEAD' : 'GET',
        headers: upstreamHeaders,
        redirect: 'follow'
      });
    } catch (e) {
      return new Response('Upstream fetch failed', {
        status: 502,
        headers: corsHeaders({'Content-Type': 'text/plain; charset=utf-8'})
      });
    }

    const contentType = upstream.headers.get('content-type') || '';
    const looksLikeM3U8 =
      /mpegurl|vnd\.apple\.mpegurl/i.test(contentType) ||
      /\.m3u8(?:$|\?)/i.test(target.pathname + target.search);

    if (looksLikeM3U8 && request.method !== 'HEAD') {
      const body = await upstream.text();
      const rewritten = rewriteManifest(body, target.href, requestUrl.origin);

      return new Response(rewritten, {
        status: upstream.status,
        headers: corsHeaders({
          'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8',
          'Cache-Control': 'no-store'
        })
      });
    }

    const headers = corsHeaders({
      'Content-Type': contentType || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });

    for (const name of ['Content-Length','Content-Range','Accept-Ranges','ETag','Last-Modified']) {
      const value = upstream.headers.get(name);
      if (value) headers[name] = value;
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers
    });
  }
};
