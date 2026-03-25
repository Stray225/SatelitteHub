const express = require('express');
const path = require('path');
const https = require('https');
const http = require('http');

const app = express();
const PORT = 3000;
const N8N_WEBHOOK = 'http://n8n.tesacom.net:7830/webhook/tesacom-clientes';

app.use(express.json());
app.use(express.static(path.join(__dirname)));

function proxyRequest(url, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const data = JSON.stringify(body);
    const lib = parsed.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      },
      timeout: 25000
    };
    const req = lib.request(options, (res) => {
      let text = '';
      res.on('data', chunk => text += chunk);
      res.on('end', () => resolve({ status: res.statusCode, text }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout — n8n no respondió en 25s')); });
    req.write(data);
    req.end();
  });
}

app.post('/api/clientes', async (req, res) => {
  console.log('[proxy] →', JSON.stringify(req.body, null, 2));
  try {
    const { status, text } = await proxyRequest(N8N_WEBHOOK, req.body);
    console.log('[proxy] ← HTTP', status, text.substring(0, 300));
    res.status(status).set('Content-Type', 'application/json').send(text);
  } catch (err) {
    console.error('[proxy] ERROR:', err.message);
    res.status(502).json({ ok: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n✅ Servidor corriendo en http://localhost:${PORT}`);
  console.log(`   Proxy: /api/clientes → ${N8N_WEBHOOK}\n`);
});
