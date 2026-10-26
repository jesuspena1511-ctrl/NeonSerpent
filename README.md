# Neon Serpent — Arena online

Juego arcade de serpientes en español, sin dependencias de front-end, con modo bots,
evento de Halloween y **multijugador online real** por WebSocket.

El servidor Node es autoritativo: valida movimiento, comida, potenciadores, choques,
muertes, reapariciones y ranking. El navegador solo predice al jugador local e
interpola a los rivales.

## Inicio rápido (tu PC)

Requisitos: **Node.js 18 o superior** (recomendado 20/22).

```powershell
cd C:\Users\Jesus\Downloads\neon-serpent
npm install
npm start
```

Abre:

- `http://localhost:3000/`
- `http://localhost:3000/index.html`

También existe `NeonSerpent.Navegador.html`; el servidor sirve ambas.

> En el navegador, el modo online **no funciona abriendo el HTML con doble clic**
> ni en un hosting estático como GitHub Pages por sí solo. Necesita `server.js` y
> WebSocket. La versión `.exe` sí lo hace sola porque arranca el servidor embebido.

## Versión .exe para Windows

> Descarga el `.exe` ya compilado desde
> [GitHub Releases](https://github.com/jesuspena1511-ctrl/NeonSerpent/releases/latest)
> (`NeonSerpent-2.0.0-win32-x64.zip`, Windows x64). Descomprime el ZIP y abre
> `NeonSerpent-win32-x64\NeonSerpent.exe`.

La carpeta incluye una app Electron (`main.js`) que **arranca el servidor online
embebido** y abre el juego desde `file://` para conservar el guardado existente.

```powershell
npm install
npm run build
```

El resultado queda en:

```text
dist\NeonSerpent-win32-x64\NeonSerpent.exe
```

Al abrir el `.exe`:

1. Busca un servidor Neon Serpent en `http://127.0.0.1:3000`. Si existe, lo reutiliza.
2. Si no existe, inicia uno propio en el puerto `3000` (o uno libre si está ocupado).
3. Abre el juego conectado a ese servidor. Dos ventanas del `.exe` en la misma PC
   comparten el mismo servidor y pueden jugar juntas.
4. El servidor escucha en `0.0.0.0`: otros equipos de la red pueden abrir
   `http://TU-IP-LOCAL:3000/` y entrar a la misma región y sala. Permite
   `NeonSerpent.exe` en el Firewall de Windows (redes privadas).

### Jugar por Internet con el .exe

El `.exe` puede usar el mismo backend público que la versión web. Primero publica
`server.js` (Render, Railway, Fly.io o un VPS) y consigue su URL HTTPS. Después crea
un archivo `online-config.json` **junto a `NeonSerpent.exe`**:

```json
{
  "api": "https://tu-servidor.onrender.com"
}
```

Cierra y vuelve a abrir el juego. El `.exe` se conectará a ese backend y verás las
seis regiones y los servidores de todos los nodos configurados en `servers.json`.

También puedes usar una variable de entorno, que tiene prioridad:

```powershell
$env:NEON_ONLINE_API="https://tu-servidor.onrender.com"
.\NeonSerpent.exe
```

Si `api` queda vacío (`""`), el `.exe` usa su servidor local embebido. El archivo
`online-config.json` incluido en el build está en `resources\online-config.json`;
el que pongas junto al `.exe` lo sobrescribe.

> El guardado del `.exe` sigue en `file://`, con la misma clave
> `neon-serpent-save-v1`. Cambiar entre servidor local y remoto no borra el progreso.

## Probar con otro dispositivo en tu casa

1. Ejecuta `npm start` en la PC.
2. Averigua la IP local: `ipconfig` (por ejemplo `192.168.1.50`).
3. Permite Node.js en el Firewall de Windows para redes privadas.
4. En el celular/otra PC abre `http://192.168.1.50:3000/`.
5. Ambos deben entrar a **la misma región y sala**.

El servidor escucha en `0.0.0.0:3000` por defecto.

## Publicarlo en Internet

Necesitas un hosting que ejecute Node.js y permita WebSocket. No basta con subir
solo `index.html`.

### Opción A — Render (recomendada para empezar)

1. Crea un repositorio en GitHub y sube **todo** el proyecto, excepto
   `node_modules/` y `dist/`.
2. En [Render](https://render.com): **New → Web Service**.
3. Conecta el repositorio.
4. Configura:
   - Runtime: **Node**
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Health Check Path: `/health`
5. Crea el servicio y espera el deploy. Render te da una URL HTTPS, por ejemplo
   `https://neon-serpent.onrender.com`.
6. Comparte esa URL. El cliente usará `wss://.../ws` automáticamente.

El archivo `render.yaml` incluido permite desplegar con Blueprint. El plan free
se suspende por inactividad; para partidas estables usa un plan pago.

### Opción B — Railway

1. Sube el proyecto a GitHub.
2. En [Railway](https://railway.app): **New Project → Deploy from GitHub Repo**.
3. Railway detecta Node; si hace falta:
   - Build: `npm install`
   - Start: `npm start`
4. En **Settings → Networking**, genera un dominio público.
5. Abre la URL `https://...` y comparte.

### Opción C — Fly.io

```powershell
# Instala flyctl y autentícate
fly auth login
cd C:\Users\Jesus\Downloads\neon-serpent
fly launch
fly deploy
```

En `fly.toml` usa:

```toml
[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = false
  auto_start_machines = true
  min_machines_running = 1
```

Puedes renombrar `fly.toml.example` y ajustar el nombre de la app.

### Opción D — VPS propio (Ubuntu)

```bash
# Node 20/22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs nginx

# En /var/www/neon-serpent
npm ci --omit=dev
sudo npm install -g pm2
pm2 start server.js --name neon-serpent
pm2 save
pm2 startup
```

Nginx (HTTPS y WebSocket):

```nginx
server {
  listen 80;
  server_name tu-dominio.com;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
  }
}
```

Luego instala HTTPS con Certbot:

```bash
sudo certbot --nginx -d tu-dominio.com
```

HTTPS es importante: si la página es `https`, el WebSocket debe ser `wss`.

## Variables de entorno

| Variable | Ejemplo | Uso |
| --- | --- | --- |
| `PORT` | `3000` | Puerto HTTP/WebSocket. Render/Railway lo asignan. |
| `HOST` | `0.0.0.0` | Interfaz de escucha. |
| `HOSTED_REGIONS` | `mexico,europa` | Regiones que hospeda este nodo. Vacío = todas. |
| `NODE_ID` | `mx-1` | Identificador técnico del nodo. |
| `NODE_LABEL` | `CDMX · Nodo México` | Nombre visible en el navegador de servidores. |

Regiones disponibles: `mexico`, `sudamerica`, `brasil`, `usa`, `europa`, `asia`.

Ejemplo de nodo solo para México:

```powershell
$env:HOSTED_REGIONS="mexico"
$env:NODE_ID="mx-1"
$env:NODE_LABEL="CDMX · Nodo México"
npm start
```

## Varios países / varios nodos

Un solo servidor puede mostrar las seis regiones como salas virtuales. Para tener
nodos físicos en distintos países:

1. Despliega un servidor por país/región con `HOSTED_REGIONS`, `NODE_ID` y
   `NODE_LABEL` distintos.
2. Publica cada nodo con HTTPS.
3. Edita `servers.json` en **todos** los nodos con la misma lista. Incluye también
   el nodo actual; si la lista queda vacía (`{"nodes":[]}`), el juego usa solo el
   servidor desde el que se abrió la página.

```json
{
  "nodes": [
    { "id": "mx-1", "label": "México · CDMX", "endpoint": "https://mx.tu-dominio.com" },
    { "id": "br-1", "label": "Brasil · São Paulo", "endpoint": "https://br.tu-dominio.com" },
    { "id": "eu-1", "label": "Europa · Fráncfort", "endpoint": "https://eu.tu-dominio.com" }
  ]
}
```

4. Abre el juego desde cualquiera de esos dominios. El cliente lee `servers.json`,
   consulta `/api/servers` de cada nodo, mide ping y mezcla las regiones.
5. El jugador entra por defecto a la región de su zona horaria, pero puede elegir
   cualquier otro servidor visible. Si ningún nodo hospeda la región del jugador,
   el navegador muestra una región sugerida y permite elegir otra.
6. Para jugar juntos, dos personas deben elegir **la misma región y la misma sala**.
   Cada nodo simula sus propias salas.

> Configura `HOSTED_REGIONS` con regiones distintas en cada nodo. Si dos nodos
> hospedan la misma región, aparecerá dos veces en la lista (son salas separadas).

La API envía CORS y el WebSocket acepta conexiones desde los otros dominios.

## Cómo funciona

- `server.js`: HTTP estático, API de servidores, `ws` autoritativo y salas.
- `online.js`: navegador de servidores, conexión WebSocket, predicción/interpolación.
- `game.js`: ciclo de partida online, muerte, reaparición y desconexión.
- `ui.js`: menú, HUD, resultados y botones de reintento.
- `core.js`, `entities.js`, `renderer.js`, `audio.js`: juego local, guardado, arte y sonido.

Endpoints:

- `GET /health` — estado del proceso.
- `GET /api/servers?tz=America/Mexico_City` — regiones, salas, jugadores y nodo.
- `GET /api/ping` — ping simple.
- `WS /ws` — partida en tiempo real.

## Guardado

El progreso (monedas, dulces, skins, logros, ajustes) se guarda en el navegador con
la clave `neon-serpent-save-v1` (esquema v3). Cada navegador/dispositivo tiene su
propio progreso; no se sincroniza entre dispositivos.

## Controles

- Ratón / dedo: apuntar.
- Clic / Espacio / gatillo: turbo.
- WASD o flechas: mover.
- `Esc` o `P`: pausa.
- `M`: sonido.
- `Enter` / `R`: reintentar o respawnear.

## Problemas frecuentes

**El menú dice “Abre el juego desde el servidor”.**
Estás abriendo el HTML como archivo. Usa `npm start` y entra por `http://localhost:3000`.

**El navegador de servidores no encuentra regiones.**
Comprueba `http://localhost:3000/health` y `http://localhost:3000/api/servers`.
Si estás en un hosting, revisa que el start command sea `npm start`.

**No conecta el WebSocket en producción.**
Debe estar detrás de HTTPS/WSS, con `Upgrade` y `Connection` configurados en el
proxy. En Render/Railway normalmente funciona sin tocar nada.

**Dos personas no se ven.**
Deben estar en la misma región y sala. Si usas varios nodos, elige el mismo nodo.

**Se oye pero no se ve a un rival.**
Actualiza la página, revisa la consola y confirma que ambos jugadores aparecen en
la clasificación. El servidor elimina a los jugadores desconectados.

## Publicar en GitHub

```bash
git init
git add .
git commit -m "Neon Serpent online"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/neon-serpent.git
git push -u origin main
```

No subas `node_modules/`, `dist/` ni archivos temporales. El `.gitignore` incluido
ya los excluye.

Hecho por JesusDaniel. Creado con IA.
