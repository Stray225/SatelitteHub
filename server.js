const express = require('express');
const path = require('path');
const https = require('https');
const http = require('http');

const app = express();
const PORT = 3000;
const N8N_WEBHOOK = 'http://n8n.tesacom.net:7830/webhook/tesacom-clientes';

const IBIS_TOKEN_URL  = 'https://ibistesacom.satcomhost.com/identity/connect/token';
const IBIS_API_BASE   = 'https://ibistesacom.satcomhost.com/api/v1';
const IBIS_CLIENT_ID  = 'ed0bca6fac254bb6a6a2901e0e4bae25';
const IBIS_CLIENT_SECRET = 'QT7OOC+yjCbOIHOfi6itJag7UhQIsq3qfSV2/9TUQhE=';

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Redirigir / al archivo correcto
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index satelitte.html'));
});

function httpRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const reqOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: options.timeout || 60000
    };
    if (body) reqOptions.headers['Content-Length'] = Buffer.byteLength(body);
    const req = lib.request(reqOptions, (res) => {
      let text = '';
      res.on('data', chunk => text += chunk);
      res.on('end', () => resolve({ status: res.statusCode, text }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

// Proxy a n8n
app.post('/api/clientes', async (req, res) => {
  console.log('[proxy] →', JSON.stringify(req.body, null, 2));
  try {
    const body = JSON.stringify(req.body);
    const { status, text } = await httpRequest(N8N_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout: 60000
    }, body);
    console.log('[proxy] ← HTTP', status, text.substring(0, 300));
    res.status(status).set('Content-Type', 'application/json').send(text || '{}');
  } catch (err) {
    console.error('[proxy] ERROR:', err.message);
    res.status(502).json({ ok: false, error: err.message });
  }
});

// Verificar si el cliente existe en IBIS por TaxCode
app.get('/api/verificar-cliente', async (req, res) => {
  const { taxCode } = req.query;
  if (!taxCode) return res.status(400).json({ ok: false, error: 'taxCode requerido' });
  try {
    // 1. Obtener token
    const formBody = `grant_type=client_credentials&client_id=${encodeURIComponent(IBIS_CLIENT_ID)}&client_secret=${encodeURIComponent(IBIS_CLIENT_SECRET)}&scope=ibisApi`;
    const tokenRes = await httpRequest(IBIS_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15000
    }, formBody);
    const tokenData = JSON.parse(tokenRes.text);
    if (!tokenData.access_token) return res.status(401).json({ ok: false, error: 'No se pudo obtener token IBIS' });

    // 2. Buscar cliente por TaxCode
    const searchUrl = `${IBIS_API_BASE}/Customers?$filter=TaxCode eq '${encodeURIComponent(taxCode)}'&$top=1`;
    const searchRes = await httpRequest(searchUrl, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
      timeout: 15000
    });
    const data = JSON.parse(searchRes.text);
    const customers = data.value || [];
    if (customers.length > 0) {
      res.json({ ok: true, found: true, CustomerID: customers[0].CustomerID, CustomerName: customers[0].CustomerName });
    } else {
      res.json({ ok: true, found: false });
    }
  } catch (err) {
    console.error('[verificar] ERROR:', err.message);
    res.status(502).json({ ok: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n✅ Servidor corriendo en http://localhost:${PORT}`);
  console.log(`   Proxy: /api/clientes → ${N8N_WEBHOOK}\n`);
});
