NEON SERPENT — ARENA ONLINE
===========================

Lee README.md para la guía completa (instalación, publicación, servidores
por país y solución de problemas).

INICIO RÁPIDO
-------------
1. Instala Node.js 18 o superior.
2. En esta carpeta ejecuta:
   npm install
   npm start
3. Abre http://localhost:3000/

ONLINE
------
- Jugar en la misma PC: abre dos pestañas o ventanas y entra a la misma
  región y sala.
- Jugar en otro dispositivo de tu red: abre http://TU-IP-LOCAL:3000/
  (por ejemplo http://192.168.1.50:3000/).
- Jugar por Internet: publica esta carpeta en Render, Railway, Fly.io o un VPS
  con Node.js. No basta con GitHub Pages, porque el multijugador necesita el
  servidor WebSocket (server.js).
- Cada país/región puede tener su propio nodo. Configura HOSTED_REGIONS,
  NODE_ID, NODE_LABEL y servers.json. Los detalles están en README.md.

VERSIÓN .EXE (WINDOWS)
----------------------
Descarga el .exe ya compilado desde:
https://github.com/jesuspena1511-ctrl/NeonSerpent/releases/latest

O compílalo tú:
1. Instala dependencias y compila:
   npm install
   npm run build
2. Abre:
   dist\NeonSerpent-win32-x64\NeonSerpent.exe
3. El .exe arranca su propio servidor online embebido y reutiliza uno que ya
   esté en el puerto 3000. Dos ventanas del .exe en la misma PC pueden jugar
   juntas; otros equipos de la red pueden abrir http://TU-IP-LOCAL:3000/.
4. Para jugar por Internet con el .exe, publica server.js y crea un archivo
   online-config.json junto a NeonSerpent.exe:

   {
     "api": "https://tu-servidor.onrender.com"
   }

   También puedes definir la variable NEON_ONLINE_API antes de abrirlo.
   Si api está vacío, se usa el servidor local embebido.

ARCHIVOS
--------
- index.html / NeonSerpent.Navegador.html: juego.
- server.js: servidor HTTP + WebSocket autoritativo.
- online.js: navegador de servidores y cliente online.
- main.js: app Electron y servidor embebido del .exe.
- online-config.json: backend remoto opcional para el .exe.
- render.yaml / Dockerfile / fly.toml.example: despliegue.
- dist/NeonSerpent-win32-x64/: build del .exe (no se sube a GitHub).

El progreso se guarda en el navegador con la clave neon-serpent-save-v1.
El .exe usa el mismo origen file:// y conserva el guardado.

Hecho por JesusDaniel. Creado con IA.
