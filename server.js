const express = require('express');
const path = require('path');
const https = require('https');
const http = require('http');

const app = express();
const PORT = 3000;
const N8N_WEBHOOK        = 'http://n8n.tesacom.net:7830/webhook/tesacom-clientes';
const N8N_WEBHOOK_EQUIPOS = 'http://n8n.tesacom.net:7830/webhook/tesacom-equipos';

const IBIS_TOKEN_URL = 'https://ibistesacom.satcomhost.com/identity/connect/token';
const IBIS_API_BASE  = 'https://ibistesacom.satcomhost.com/api/v1';

// OAuth2 client credentials por país (ParentCustomerID → 3=AR, 4=CL, 5=PY, 6=PE)
// En producción mover a variables de entorno (.env.example)
const IBIS_CREDS = {
  '3': { id: 'ed0bca6fac254bb6a6a2901e0e4bae25', secret: 'QT7OOC+yjCbOIHOfi6itJag7UhQIsq3qfSV2/9TUQhE=' },  // AR
  '4': { id: '4fd1675586b646778af1e2cc0ca19f83', secret: 'l82+rnPT1yaP8TA73B3HzabctTRhr3W03QPgw4YRNfl=' },  // CL — credencial pendiente de renovación
  '5': { id: '6f3c4cdabcf349e3a197fd77f4be05e0', secret: 'VhJQkwnuhr607LiBZgUp5mJ1S7lduea9Ag0+k/Xrr5g=' },  // PY
  '6': { id: '8ddf0664d99c4493b01ec5b9317719ae', secret: 'S8iHbB0oogBbePAy8K417jTouIoKYbRE07zK9Kg2lh0=' },  // PE — credencial pendiente de renovación
};

// Los tokens duran 1h en IBIS. Los cacheamos 50min para tener margen.
const tokenCache = {};
async function getIbisToken(paisId) {
  const now = Date.now();
  if (tokenCache[paisId] && tokenCache[paisId].expires > now) return tokenCache[paisId].token;
  const creds = IBIS_CREDS[paisId] || IBIS_CREDS['3'];
  const formBody = `grant_type=client_credentials&client_id=${encodeURIComponent(creds.id)}&client_secret=${encodeURIComponent(creds.secret)}&scope=ibisApi`;
  const r = await httpRequest(IBIS_TOKEN_URL, { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, timeout:15000 }, formBody);
  const d = JSON.parse(r.text);
  if (!d.access_token) throw new Error('No se pudo obtener token IBIS');
  tokenCache[paisId] = { token: d.access_token, expires: now + 50 * 60 * 1000 };
  return d.access_token;
}

app.use(express.json());
app.use(express.static(path.join(__dirname)));

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

app.post('/api/clientes', async (req, res) => {
  console.log('POST /api/clientes', JSON.stringify(req.body, null, 2));
  try {
    const body = JSON.stringify(req.body);
    const { status, text } = await httpRequest(N8N_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout: 60000
    }, body);
    console.log('n8n respuesta HTTP', status, text.substring(0, 300));
    res.status(status).set('Content-Type', 'application/json').send(text || '{}');
  } catch (err) {
    console.error('error proxy clientes:', err.message);
    res.status(502).json({ ok: false, error: err.message });
  }
});

app.post('/api/equipos', async (req, res) => {
  console.log('POST /api/equipos', JSON.stringify(req.body, null, 2));
  try {
    const body = JSON.stringify(req.body);
    const { status, text } = await httpRequest(N8N_WEBHOOK_EQUIPOS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout: 60000
    }, body);
    console.log('n8n equipos respuesta HTTP', status, text.substring(0, 300));
    res.status(status).set('Content-Type', 'application/json').send(text || '{}');
  } catch (err) {
    console.error('error proxy equipos:', err.message);
    res.status(502).json({ ok: false, error: err.message });
  }
});

app.get('/api/verificar-cliente', async (req, res) => {
  const { taxCode } = req.query;
  if (!taxCode) return res.status(400).json({ ok: false, error: 'taxCode requerido' });
  try {
    let accessToken;
    try { accessToken = await getIbisToken('3'); } catch(e) { return res.status(401).json({ ok: false, error: 'No se pudo obtener token IBIS' }); }

    const searchUrl = `${IBIS_API_BASE}/Customers?$filter=TaxCode eq '${encodeURIComponent(taxCode)}'&$top=1`;
    const searchRes = await httpRequest(searchUrl, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${accessToken}` },
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
    console.error('error verificar-cliente:', err.message);
    res.status(502).json({ ok: false, error: err.message });
  }
});

app.get('/api/buscar-cliente', async (req, res) => {
  const { q, pais } = req.query;
  if (!q || q.trim().length < 2) return res.json([]);
  try {
    const token = await getIbisToken(pais || '3');
    const safe = q.trim().replace(/'/g, "''");
    const filter = encodeURIComponent(`contains(CustomerName,'${safe}') or contains(CustomerCode,'${safe}')`);
    const url = `${IBIS_API_BASE}/Customers?$filter=${filter}&$top=10&$select=CustomerID,CustomerName,CustomerCode,ParentCustomerID`;
    const r = await httpRequest(url, { method:'GET', headers:{ 'Authorization': `Bearer ${token}` }, timeout:15000 });
    let data;
    try { data = JSON.parse(r.text); } catch(e) { return res.json([]); }
    res.json(data.value || []);
  } catch(err) {
    console.error('error buscar-cliente:', err.message);
    res.status(502).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`servidor en http://localhost:${PORT}`);
  console.log(`webhook: ${N8N_WEBHOOK}`);
});
