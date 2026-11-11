/**
 * Local web testing only.
 *
 * The SSO project only accepts requests whose Origin is on its allowed list
 * (https://app.waloop.in), and a browser always sends the page's own origin
 * (http://localhost:8081), so local logins get 403. This proxy forwards the
 * app's SSO and CPaaS calls with the allowed Origin and answers CORS for the
 * local page. Use it with `.env.local` (see `npm run dev:proxy`).
 *
 *   /sso/...    -> https://sso.1automations.com/...
 *   /cpaas/...  -> https://cpaasgateway.1automations.com/...
 *
 * Not used by the real app or any build. Delete `.env.local` to stop using it.
 */
import http from 'node:http';
import https from 'node:https';

const PORT = Number(process.env.DEV_PROXY_PORT || 8787);
const ORIGIN = process.env.DEV_PROXY_ORIGIN || 'https://app.waloop.in';
const TARGETS = {
  sso: 'https://sso.1automations.com',
  cpaas: 'https://cpaasgateway.1automations.com',
};

const cors = (req) => ({
  'access-control-allow-origin': req.headers.origin || '*',
  'access-control-allow-credentials': 'true',
  'access-control-allow-methods': 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  'access-control-allow-headers': req.headers['access-control-request-headers'] || '*',
  'access-control-expose-headers': '*',
  'access-control-max-age': '600',
  vary: 'Origin',
});

const resolve = (url) => {
  const m = /^\/(sso|cpaas)(\/.*)?$/.exec(url || '');
  if (!m) return null;
  return new URL((m[2] || '/'), TARGETS[m[1]]);
};

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors(req));
    res.end();
    return;
  }
  const target = resolve(req.url);
  if (!target) {
    res.writeHead(404, cors(req));
    res.end('dev-proxy: use /sso/... or /cpaas/...');
    return;
  }
  const headers = { ...req.headers, host: target.host, origin: ORIGIN, referer: `${ORIGIN}/` };
  const upstream = https.request(target, { method: req.method, headers }, (up) => {
    const out = { ...up.headers };
    for (const k of Object.keys(out)) if (k.startsWith('access-control-')) delete out[k];
    res.writeHead(up.statusCode || 502, { ...out, ...cors(req) });
    up.pipe(res);
  });
  upstream.on('error', (e) => {
    res.writeHead(502, cors(req));
    res.end(`dev-proxy: ${e.message}`);
  });
  req.pipe(upstream);
  console.log(`${req.method} ${req.url.split('?')[0]}`);
});

server.listen(PORT, () => console.log(`dev-proxy on http://localhost:${PORT} (Origin: ${ORIGIN})`));
