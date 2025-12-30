# HaxBall Impostor Game 🕵️⚽

Un juego social de deducción estilo "Impostor/Espía" temático de futbolistas para salas de HaxBall.

## 📋 Descripción

5 jugadores por ronda: 4 conocen al futbolista secreto, 1 es el impostor que no lo conoce. A través de pistas y votación, los jugadores deben descubrir quién es el impostor.

### Fases del juego

1. **WAITING** - Jugadores se unen con `!join`
2. **ASSIGN** - Asignación aleatoria de roles
3. **CLUES** - Cada jugador da una pista de una palabra
4. **DISCUSSION** - Tiempo para debatir
5. **VOTING** - Votar al sospechoso
6. **REVEAL** - Se revela el impostor
7. **RESULTS** - Resumen de la ronda

## 🚀 Inicio Rápido

### Requisitos

- Node.js 18+
- npm

### Instalación

```bash
# Clonar repositorio
git clone <repo-url>
cd haxball

# Instalar dependencias
npm install

# Copiar configuración
cp .env.example .env
```

### Desarrollo (sin token)

```bash
npm run dev
```

> ⚠️ Sin token, deberás resolver el recaptcha manualmente en el navegador.
> El servidor mostrará instrucciones para obtener el link de la sala.

### Producción (con token)

1. Obtener token: https://www.haxball.com/headlesstoken
2. Configurar en `.env`:
   ```
   HAXBALL_TOKEN=tu_token_aquí
   ```
3. Ejecutar:
   ```bash
   npm run build
   npm start
   ```

## 🎮 Comandos

| Comando | Fase | Descripción |
|---------|------|-------------|
| `!join` | WAITING | Unirse a la cola |
| `!leave` | WAITING | Salir de la cola |
| `!start` | WAITING | Iniciar ronda (admin) |
| `!clue <palabra>` | CLUES | Dar pista |
| `!vote <id>` | VOTING | Votar sospechoso |
| `!help` | Cualquiera | Ver ayuda |
| `!status` | Cualquiera | Ver estado |

### Comandos Admin

| Comando | Descripción |
|---------|-------------|
| `!forcereveal` | Revelar impostor |
| `!skipphase` | Saltar fase actual |

## ⚙️ Configuración

Variables de entorno (`.env`):

```bash
# Token HaxBall (opcional en dev)
HAXBALL_TOKEN=

# Sala
ROOM_NAME=Impostor Game 🕵️
MAX_PLAYERS=16
NO_PLAYER=true

# Servidor
PORT=3000
LOG_LEVEL=info

# Tiempos (segundos)
CLUE_TIME=30
DISCUSSION_TIME=60
VOTING_TIME=45
```

## 🐳 Docker

### Build y Run

```bash
# Build
docker build -t haxball-impostor .

# Run
docker run -p 3000:3000 --env-file .env haxball-impostor
```

### Docker Compose

```bash
# Producción
docker-compose up -d

# Desarrollo
docker-compose --profile dev up
```

## 📊 Health Check

```bash
# Liveness
curl http://localhost:3000/health

# Room link
curl http://localhost:3000/room

# Métricas Prometheus
curl http://localhost:3000/metrics
```

## 🖥️ Deploy en VPS

### Con PM2

```bash
# Instalar PM2
npm install -g pm2

# Build
npm run build

# Iniciar
pm2 start ecosystem.config.js --env production

# Ver logs
pm2 logs haxball-impostor

# Monitorear
pm2 monit
```

### Chrome Flag para VPS

En entornos donde WebRTC tiene problemas, agregar al inicio de Chrome/Chromium:

```bash
--disable-features=WebRtcHideLocalIpsWithMdns
```

O configurar en PM2:

```javascript
// ecosystem.config.js
env_production: {
  PUPPETEER_ARGS: '--disable-features=WebRtcHideLocalIpsWithMdns'
}
```

## 🧪 Tests

```bash
# Todos los tests
npm test

# Con coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

## 📁 Estructura

```
src/
├── adapter/          # Abstracción HaxBall API
├── commands/         # Parser de comandos
├── config/           # Configuración
├── data/             # Datos (futbolistas)
├── game/             # Lógica del juego
├── health/           # Health server
└── utils/            # Utilidades
tests/
├── unit/             # Tests unitarios
└── integration/      # Tests integración
```

## 🔧 Desarrollo

```bash
# Lint
npm run lint

# Format
npm run format

# Build
npm run build
```

## 📝 Licencia

MIT
"# Impostor" 
