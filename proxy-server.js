// ICT RegimeAI -- Tradovate CORS Proxy Server
// Handles REST auth AND WebSocket proxying
const http = require('http');
const https = require('https');
const url = require('url');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  const parsed = url.parse(req.url, true);

  if (parsed.pathname === '/health') {
    res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', time: new Date().toISOString() }));
    return;
  }

  if (parsed.pathname === '/auth' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { name, password, cid, sec, demo } = JSON.parse(body);
        const host = demo ? 'demo.tradovateapi.com' : 'live.tradovateapi.com';
        const payload = JSON.stringify({
          name, password,
          appId: 'ICTRegimeAI',
          appVersion: '3.0',
          cid: parseInt(cid),
          sec,
          deviceId: 'ict-regime-001',
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
            res.writeHead(proxyRes.statusCode, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
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

  if (parsed.pathname === '/order' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { token, demo, ...orderData } = JSON.parse(body);
        const host = demo ? 'demo.tradovateapi.com' : 'live.tradovateapi.com';
        const payload = JSON.stringify(orderData);
        const options = {
          hostname: host,
          path: '/v1/order/placeorder',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
            'Accept': 'application/json',
            'Authorization': `Bearer ${token}`,
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
        proxyReq.write(payload);
        proxyReq.end();
      } catch (e) {
        res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request body' }));
      }
    });
    return;
  }

  res.writeHead(404, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// WebSocket proxy
// Browser connects to wss://ict-regime-proxy.onrender.com/md?demo=false
// Proxy forwards everything to Tradovate MD server
const wss = new WebSocket.Server({ server });

wss.on('connection', (clientWs, req) => {
  const parsed = url.parse(req.url, true);
  const demo = parsed.query.demo === 'true';
  const tvUrl = demo
    ? 'wss://md-demo.tradovateapi.com/v1/websocket'
    : 'wss://md.tradovateapi.com/v1/websocket';

  console.log(`WS: browser connected -> forwarding to ${tvUrl}`);

  const tvWs = new WebSocket(tvUrl, {
    headers: {
      'Origin': 'https://trader.tradovate.com',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    }
  });

  tvWs.on('open', () => console.log('WS: Tradovate connected'));

  // Tradovate -> Browser
tvWs.on('message', (data, isBinary) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      if (isBinary) {
        clientWs.send(data);
      } else {
        clientWs.send(data.toString());
      }
    }
  });

  // Browser -> Tradovate
 clientWs.on('message', (data, isBinary) => {
    if (tvWs.readyState === WebSocket.OPEN) {
      if (isBinary) {
        tvWs.send(data);
      } else {
        tvWs.send(data.toString());
      }
    }
  });
  
tvWs.on('close', (code, reason) => {
    console.log(`WS: Tradovate closed ${code}`);
    if (clientWs.readyState === WebSocket.OPEN) clientWs.close(1000);
  });

  tvWs.on('error', err => {
    console.error('WS: Tradovate error', err.message);
    if (clientWs.readyState === WebSocket.OPEN) clientWs.close(1011, err.message);
  });

 clientWs.on('close', (code, reason) => {
    console.log(`WS: browser closed ${code}`);
    if (tvWs.readyState === WebSocket.OPEN) tvWs.close(1000);
  });

  clientWs.on('error', err => {
    console.error('WS: browser error', err.message);
    if (tvWs.readyState === WebSocket.OPEN) tvWs.close(1011, err.message);
  });
});

server.listen(PORT, () => {
  console.log(`ICT RegimeAI proxy running on port ${PORT}`);
});
