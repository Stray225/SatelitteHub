# Satellite Hub

Herramienta interna de Tesacom para sincronizar altas, bajas y modificaciones de clientes y equipos hacia el sistema IBIS (Satcomhost), usando formularios web y automatizaciones n8n.

---

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | HTML + CSS + JS vanilla (sin frameworks) |
| Backend | Node.js 18+ con Express |
| Automatización | n8n (self-hosted en red interna) |
| API destino | IBIS — `https://ibistesacom.satcomhost.com` |
| Procesamiento Excel | SheetJS (`xlsx.full.min.js`) |

---

## Estructura de archivos

```
├── index satelitte.html       # Frontend completo (UI + lógica JS)
├── server.js                  # Backend: proxy HTTP y autenticación IBIS
├── package.json
├── xlsx.full.min.js           # Librería Excel para carga masiva (no instalar, ya incluida)
├── n8n-workflow-tesacom.json  # Workflow n8n — alta/baja de clientes
├── n8n-workflow-equipos.json  # Workflow n8n — operaciones de equipos
├── kit de marca/              # Logos Tesacom (usados en el header)
├── fonts/                     # Fuentes locales (fallback si no carga Google Fonts)
├── .env.example               # Variables de entorno necesarias (ver abajo)
├── README.md                  # Este archivo
└── HANDOFF.md                 # Estado del proyecto y guía para ustedes
```

---

## Instalación y ejecución local

```bash
# Instalar dependencias
npm install

# Levantar el servidor
npm start
```

Abre `http://localhost:3000` en el navegador.

El servidor corre en el puerto 3000 por defecto.

---

## Variables de entorno

Actualmente las configuraciones están hardcodeadas en `server.js`. Para producción, moverlas a un archivo `.env` (ver `.env.example`).

Las variables necesarias son:

```
PORT=3000
N8N_BASE_URL=http://n8n.tesacom.net:7830
IBIS_BASE_URL=https://ibistesacom.satcomhost.com
IBIS_CID_AR=...
IBIS_CSEC_AR=...
IBIS_CID_CL=...
IBIS_CSEC_CL=...
IBIS_CID_PY=...
IBIS_CSEC_PY=...
IBIS_CID_PE=...
IBIS_CSEC_PE=...
```

---

## Endpoints del servidor

| Método | Ruta | Función |
|---|---|---|
| GET | `/` | Sirve el frontend |
| POST | `/api/clientes` | Proxy al webhook de n8n para clientes |
| POST | `/api/equipos` | Proxy al webhook de n8n para equipos |
| GET | `/api/verificar-cliente?taxCode=` | Consulta directa a IBIS por CUIT/RUT/RUC |
| GET | `/api/buscar-cliente?q=&pais=` | Búsqueda de clientes en IBIS por nombre o código |

---

## Flujo general

```
Usuario llena formulario
       ↓
Frontend (index satelitte.html)
       ↓ POST /api/clientes o /api/equipos
Servidor (server.js) — proxy
       ↓ POST webhook
n8n — workflow JSON
       ↓ OAuth2 token + llamada API
IBIS (Satcomhost)
       ↓ respuesta JSON
Servidor → Frontend → Modal de resultado
```

---

## Conexión con IBIS

La autenticación es OAuth2 con `grant_type=client_credentials`. Hay credenciales distintas por país:

| País | ParentCustomerID |
|---|---|
| Argentina | 3 |
| Chile | 4 |
| Paraguay | 5 |
| Perú | 6 |

El servidor cachea los tokens por 50 minutos para no pedir uno nuevo en cada operación.

En los workflows n8n, el nodo "Switch País" enruta al nodo de credenciales correcto según el `ParentCustomerID` que llega en el payload.

---

## Conexión con n8n

Los workflows están en los archivos JSON del repo. Para usarlos:

1. Abrir n8n (`http://n8n.tesacom.net:7830`)
2. Importar `n8n-workflow-tesacom.json` y `n8n-workflow-equipos.json`
3. Activar ambos workflows
4. Verificar que las URLs de webhook coincidan con las del `server.js`

---

## Limitaciones conocidas

- Las credenciales de Chile (CL) y Perú (PE) en los workflows n8n están vencidas o son inválidas — los tokens no se generan.
- El tab **Planes** tiene el formulario construido pero no está conectado a ningún endpoint IBIS.
- El workflow de equipos usa `POST /Provisioning/Devices/ActivateTemplate`, que requiere un `activationTemplateID` entero. Ese ID no está disponible vía API con las credenciales actuales, necesitamos confirmación de soporte IBIS.
- No hay manejo de errores si n8n está caído al momento de la request (timeout de 60s, luego error 502).

---

## Pendientes

- [ ] Obtener `activationTemplateID` por tipo de equipo/vendor desde soporte IBIS
- [ ] Actualizar credenciales de CL y PE
- [ ] Mover credenciales a variables de entorno
- [ ] Conectar tab Planes a un endpoint IBIS (Si es que se hace)
- [ ] Agregar autenticación básica al servidor (hoy cualquiera en la red puede acceder)
