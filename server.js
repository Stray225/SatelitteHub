const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;
const N8N_WEBHOOK = 'http://n8n.tesacom.net:7830/webhook/tesacom-clientes';

app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.post('/api/clientes', async (req, res) => {
  console.log('[proxy] →', JSON.stringify(req.body, null, 2));
  try {
    const response = await fetch(N8N_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(25000)
    });
    const text = await response.text();
    console.log('[proxy] ← HTTP', response.status, text.substring(0, 300));
    res.status(response.status).set('Content-Type', 'application/json').send(text);
  } catch (err) {
    console.error('[proxy] ERROR:', err.message);
    res.status(502).json({ ok: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n✅ Servidor corriendo en http://localhost:${PORT}`);
  console.log(`   Proxy: /api/clientes → ${N8N_WEBHOOK}\n`);
});
