// ICT RegimeAI -- Tradovate CORS Proxy Server
// Deploy this on Render.com free tier
// Your browser app calls this proxy, this proxy calls Tradovate

const http = require('http');
const https = require('https');
const url = require('url');

const PORT = process.env.PORT || 3000;

// CORS headers -- allow your GitHub Pages URL
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

const server = http.createServer((req, res) => {
  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  const parsed = url.parse(req.url, true);

  // Health check
  if (parsed.pathname === '/health') {
    res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', time: new Date().toISOString() }));
    return;
  }

  // Proxy endpoint: POST /auth
  // Body: { username, password, cid, secret, demo }
  // Returns: Tradovate access token response
  if (parsed.pathname === '/auth' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { name, password, cid, sec, demo } = JSON.parse(body);
        const host = demo
          ? 'demo.tradovateapi.com'
          : 'live.tradovateapi.com';

        const payload = JSON.stringify({
          name: name,
          password: password,
          appId: 'ICT RegimeAI',
          appVersion: '1.0',
          cid: parseInt(cid),
          sec: sec,
        });

        const options = {
          hostname: host,
          path: '/v1/auth/accesstokenrequest',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
            'Accept': 'application/json',
          },
        };

        const proxyReq = https.request(options, proxyRes => {
          let data = '';
          proxyRes.on('data', chunk => data += chunk);
          proxyRes.on('end', () => {
            res.writeHead(proxyRes.statusCode, {
              ...CORS_HEADERS,
              'Content-Type': 'application/json',
            });
            res.end(data);
          });
        });

        proxyReq.on('error', err => {
          res.writeHead(500, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        });

        proxyReq.write(payload);
        proxyReq.end();
      } catch (e) {
        res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request body' }));
      }
    });
    return;
  }

  // Proxy endpoint: GET /balance?demo=true
  // Returns: Tradovate cash balance
  if (parsed.pathname === '/balance' && req.method === 'GET') {
    const token = req.headers['authorization']?.replace('Bearer ', '');
    const demo = parsed.query.demo !== 'false';
    const host = demo ? 'demo.tradovateapi.com' : 'live.tradovateapi.com';
    const options = {
      hostname: host,
      path: '/v1/cashBalance/getCashBalanceSnapshot',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    };
    const proxyReq = https.request(options, proxyRes => {
      let data = '';
      proxyRes.on('data', chunk => data += chunk);
      proxyRes.on('end', () => {
        res.writeHead(proxyRes.statusCode, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
        res.end(data);
      });
    });
    proxyReq.on('error', err => {
      res.writeHead(500, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    });
    proxyReq.end();
    return;
  }
  // 404
  res.writeHead(404, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`ICT RegimeAI proxy running on port ${PORT}`);
});
