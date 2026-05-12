# HANDOFF — Satellite Hub

Documento de traspaso técnico. Estado al 11/05/2025.

---

## Estado general

El proyecto está funcional para alta de clientes. El módulo de equipos está estructurado pero incompleto porque falta un dato de configuración de IBIS que depende de soporte externo. El tab Planes existe visualmente pero no está conectado.

---

## Qué funciona hoy

- ✅ Alta de clientes (formulario individual → n8n → IBIS)
- ✅ Carga masiva de clientes desde Excel (.xlsx)
- ✅ Búsqueda de clientes en IBIS por nombre o código (autocomplete en el formulario de equipos)
- ✅ Verificación de cliente en IBIS por CUIT/RUT/RUC
- ✅ Autenticación OAuth2 con IBIS por país (AR y PY confirmados)
- ✅ Panel de actividad reciente con historial local
- ✅ Dark mode
- ✅ Exportar log de actividad a Excel
- ✅ Modo bulk para equipos (UI completa, envía a /api/equipos)

---

## Qué no está terminado

- ❌ **Workflow equipos — activación Alta**: El endpoint `/Provisioning/Devices/ActivateTemplate` requiere un `activationTemplateID` (entero) que identifica el template de IBIS para cada tipo de equipo. La API no lo devuelve con las credenciales actuales. Hay que pedírselo a soporte de Satcomhost o que un admin lo busque en el portal IBIS → Provisioning → Activation Templates.
- ❌ **Credenciales CL y PE inválidas**: Los tokens para Chile y Perú fallan con `invalid_client`. Hay que renovarlas en IBIS y actualizar en `server.js` y en los nodos "Cred CL" y "Cred PE" de ambos workflows.
- ❌ **Tab Planes**: El formulario existe pero el botón "Sincronizar" no tiene endpoint configurado. Se puede conectar a `POST /api/v1/PricePlans` en IBIS cuando sea necesario.

---

## Partes delicadas — no tocar sin probar

| Parte | Por qué |
|---|---|
| `getIbisToken` en `server.js` | Tiene caché de 50 min. Si se cambia mal el timing, las requests fallan silenciosamente con tokens vencidos. |
| `getFormPayload('equipment')` en el HTML | Lee campos dinámicos del DOM (los genera `onVendorChange`). Si se cambia el `data-key` o el `id` de algún input, el payload llega incompleto a n8n. |
| `onEquipCustomerSearch` | Tiene debounce de 350ms y lógica de dropdown. No tocar el timing sin probar. |
| Los nodos "Cred XX" en los JSON de n8n | Si se cambia el nombre del nodo, se rompe la conexión con "Obtener Token IBIS". |
| `handleSubmit` en el HTML | Maneja el AbortError distinto para clientes vs equipos. Tocarla sin entender el flujo completo es riesgoso. |
| VENDOR_GROUPS en el HTML | Controla qué campos aparecen en el formulario de equipos según el producto. Si se agrega un vendor nuevo, hay que agregarlo acá también. |

---

## Explicación de server.js

`server.js` hace tres cosas:

**1. Servir el frontend**
Express sirve todos los archivos estáticos del directorio raíz y devuelve `index satelitte.html` en la ruta `/`.

**2. Proxy hacia n8n**
`POST /api/clientes` y `POST /api/equipos` reenvían el body tal cual al webhook correspondiente de n8n, y devuelven la respuesta al frontend. Esto existe porque n8n corre en otra URL de la red interna y el browser no puede llamarla directamente (CORS).

**3. Consultas directas a IBIS**
`GET /api/verificar-cliente` y `GET /api/buscar-cliente` llaman a la API de IBIS directamente desde el servidor (no pasan por n8n). El servidor obtiene el token OAuth2, hace la búsqueda y devuelve el resultado. Los tokens se cachean en memoria para no pedir uno nuevo en cada búsqueda.

---

## Explicación de index satelitte.html

Un solo archivo HTML que contiene toda la UI y toda la lógica JavaScript. No usa frameworks ni bundlers.

**Secciones importantes del JS:**

- `VENDOR_GROUPS` y `EQUIP_OPTIONAL` — datos de configuración. Definen qué campos aparecen según el producto seleccionado.
- `EXEC_BY_COUNTRY` — lista de comerciales por país. Alimenta el dropdown de "Comercial Asignado".
- `onVendorChange()` — genera dinámicamente los campos del formulario de equipos según el vendor.
- `onPaisChange()` — actualiza comerciales, label del documento fiscal, categorías y provincias cuando se cambia el país.
- `getFormPayload()` — arma el objeto JSON que se manda a `/api/clientes` o `/api/equipos`.
- `handleSubmit()` — ejecuta el POST, maneja timeout (90s), muestra el modal de resultado.
- `onEquipCustomerSearch()` — autocomplete que busca clientes en IBIS en tiempo real.

---

## Explicación de los workflows JSON

Ambos workflows tienen la misma estructura:

```
Webhook → Switch País → Credenciales (por país) → Token IBIS → Llamada API → Respuesta
```

El "Switch País" lee el campo `ParentCustomerID` del body y enruta a los nodos de credenciales:
- 3 → Argentina
- 4 → Chile
- 5 → Paraguay
- 6 → Perú

Cada nodo de credenciales pasa `_cid` y `_csec` al nodo "Obtener Token IBIS", que hace el OAuth2 y devuelve el `access_token`.

**Diferencia entre los dos workflows:**
- `tesacom.json` llama a `POST /CustomerDetails` — crea el cliente en IBIS.
- `equipos.json` llama a `POST /Provisioning/Devices/ActivateTemplate` — activa el equipo. Este requiere `activationTemplateID` como query param (ver pendientes).

---

## Deployment en servidor interno

### Opción simple (Windows con Node.js instalado)

```bash
# En el servidor
git clone <repo> C:\Apps\SatelitteHub
cd C:\Apps\SatelitteHub
npm install
node server.js
```

Funciona pero el proceso se cae si se cierra la terminal.

### Opción recomendada (PM2)

```bash
npm install -g pm2
pm2 start server.js --name "satellite-hub"
pm2 save
pm2 startup  # para que arranque solo con Windows
```

### Puerto y acceso en red

Por defecto usa el puerto 3000. Para que otros en la red accedan:
- Asegurarse de que el firewall de Windows permita el puerto 3000
- Acceder desde otras PCs con `http://IP-DEL-SERVIDOR:3000`

### Cambiar la URL de n8n

Si n8n está en una URL distinta, cambiar en `server.js`:
```javascript
const N8N_WEBHOOK        = 'http://NUEVA-URL/webhook/tesacom-clientes';
const N8N_WEBHOOK_EQUIPOS = 'http://NUEVA-URL/webhook/tesacom-equipos';
```

---

## Checklist de pruebas manuales antes de dar por bueno

- [ ] Abrir `http://localhost:3000` y ver que carga sin errores de consola
- [ ] Tab Clientes: llenar nombre, país y CUIT → verificar que el botón "Enviar" se habilita
- [ ] Tab Clientes: cambiar el país → verificar que cambian los comerciales, el label del documento y las categorías fiscales
- [ ] Tab Clientes: enviar un cliente real → verificar que aparece el modal con el ID de IBIS
- [ ] Tab Equipos: seleccionar un producto (ej: Iridium) → verificar que aparecen los campos de IMSI, PIN1, PIN2, PUK1, PUK2
- [ ] Tab Equipos: buscar un cliente existente → verificar que aparece el dropdown y se puede seleccionar
- [ ] Tab Equipos / Bulk: descargar plantilla Excel de un vendor → verificar que tiene las columnas correctas
- [ ] Tab Equipos / Bulk: subir un Excel con datos → verificar que aparece la tabla de preview
- [ ] Panel lateral: verificar que el dot de IBIS aparece verde si hay conexión
- [ ] Dark mode: hacer click en la luna → verificar que cambia y persiste al recargar
- [ ] Log de actividad: hacer una operación → verificar que aparece el ítem con hora, estado y tab correcto

---

## Credenciales hardcodeadas — dónde están

| Archivo | Líneas | Qué es |
|---|---|---|
| `server.js` | 8–9 | URLs de los webhooks de n8n |
| `server.js` | 16–20 | Client ID y Client Secret de IBIS para AR, CL, PY, PE |
| `n8n-workflow-tesacom.json` | Nodos Cred AR/CL/PY/PE | Mismas credenciales duplicadas |
| `n8n-workflow-equipos.json` | Nodos Cred AR/CL/PY/PE | Mismas credenciales duplicadas |
| `index satelitte.html` | EXEC_BY_COUNTRY | Nombres, códigos y emails de comerciales internos |

Las credenciales de IBIS deberían estar en variables de entorno antes de poner esto en producción. Ver `.env.example`.
