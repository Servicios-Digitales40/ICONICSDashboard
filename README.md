# ICONICS Dashboard

Tablero de planta que muestra el **OEE**, la producción y el estado de las
máquinas de Resonac, leyendo los datos de un servidor **ICONICS** (AssetWorX y
Hyper Historian).

El proyecto son dos piezas: un backend puente en Node que resuelve la
autenticación contra ICONICS, y un frontend en React que consume ese backend.

## Qué hace

- **Resumen de planta** — OEE agregado, sus tres factores, producción, reparto
  de rechazos, tiempos muertos y estado de cada área.
- **Monitor por área** — parrilla de tarjetas con las máquinas de cada línea.
- **Detalle de máquina** — desglose por factor (disponibilidad, rendimiento,
  calidad), el OEE representado de varias formas, y un comparativo entre dos
  fechas sobre datos del historiador.
- **Explorador de assets** — navegación del árbol de AssetWorX con lectura de
  propiedades en vivo.
- **Datos crudos** — lectura, escritura y borrado de puntos sueltos de ICONICS.

Las máquinas son 10, repartidas en dos áreas: siete líneas (`LIN 1..7`) y tres
rectificadoras (`REC 10, 11, 13`).

## Estructura

```
.
├── backend/            Servidor puente hacia ICONICS (Node, sin dependencias)
│   ├── http/             Mecánica HTTP: router, respuestas, estáticos
│   ├── iconics/          Autenticación OIDC, cliente REST y validación
│   └── routes/           Traducción HTTP ↔ cliente
├── react-dashboard/    Frontend React + Vite
├── scripts/            Utilidades de verificación
└── docs/               Plan de conexión, mejoras y tabla de tags
```

## Requisitos

- Node.js 18 o superior
- Acceso a un servidor ICONICS con la API REST de FrameWorX habilitada

## Puesta en marcha

Las credenciales van en un archivo `.env.local` en la raíz, que **no se
versiona**. La plantilla comentada de todas las variables está en
[`.env.example`](.env.example):

```
ICONICS_API_BASE=https://tu-servidor/fwxapi/rest/v1
ICONICS_USERNAME=usuario
ICONICS_PASSWORD=contraseña
ICONICS_POINT_NAME=punto por defecto para /api/iconics/data

# Sólo para desarrollo:
CORS_ORIGINS=http://localhost:5173   # el dev server de Vite es otro origen
ICONICS_READ_ONLY=false              # la escritura está deshabilitada por defecto
```

Backend, en una terminal:

```bash
node --env-file=.env.local backend/server.mjs    # escucha en :3001
```

Frontend, en otra:

```bash
cd react-dashboard
npm install
npm run dev                                       # Vite, normalmente en :5173
```

El resto de variables —puerto, nivel de log, directorio de estáticos— están en
[`backend/README.md`](backend/README.md).

### En producción

Un solo proceso: el backend sirve el frontend compilado desde el mismo origen,
así que no hace falta ni segundo servidor ni CORS.

```bash
cd react-dashboard && npm run build    # genera react-dashboard/dist
cd .. && node --env-file=.env.production backend/server.mjs
```

Sin ese build, el backend responde 503 diciendo que falta compilar.

El build se estampa solo con el `git describe` del árbol, y esa versión se ve
en el Topbar y en `/api/health`. En producción **no** deben aparecer
`VITE_ICONICS_FAKE`, `VITE_ENABLE_DEMO` ni `NODE_TLS_REJECT_UNAUTHORIZED`: las
dos primeras se hornean en el bundle, y la tercera impide el arranque con
`NODE_ENV=production`.

El paso a producción —lo que falta, cómo se compila y cómo se despliega— está
en [`docs/PLAN-3-PRODUCCION.md`](docs/PLAN-3-PRODUCCION.md).

## Orígenes de datos

Hay tres, y los tres se ven igual de plausibles en pantalla. El indicador del
Topbar dice cuál está activo, y los dos que no son reales llevan además una
cinta de aviso permanente.

| Origen | De dónde salen los datos | Cómo se activa |
|---|---|---|
| En vivo | Servidor ICONICS | Por defecto |
| Simulado | Transporte falso, sin red | `VITE_ICONICS_FAKE=true` |
| Demo | Datos de ejemplo fijos | Botón del Topbar, sólo si se compiló con `VITE_ENABLE_DEMO=true` |

El simulador sirve para desarrollar sin servidor. Las dos variables se
resuelven en build, así que un bundle compilado sin ellas va al backend real y
no trae interruptor de demo — que es lo que debe llegar a un monitor de planta.

## Pruebas

Frontend:

```bash
cd react-dashboard
npm test
```

Backend, sin necesidad de servidor ni configuración —levanta un ICONICS falso y
comprueba que cada endpoint devuelve la forma que el frontend espera:

```bash
node scripts/verificar-backend.mjs
```

Contra el servidor real, con el backend levantado:

```bash
node scripts/verificar-catalogo.mjs    # los puntos del catálogo existen
node scripts/verificar-historia.mjs    # el historiador entrega muestras
```

## Documentación

- [`backend/README.md`](backend/README.md) — arquitectura del puente y referencia de la API
- [`react-dashboard/README.md`](react-dashboard/README.md) — arquitectura del frontend
- [`docs/PLAN-1-CONEXION-ICONICS.md`](docs/PLAN-1-CONEXION-ICONICS.md) — plan de conexión
- [`docs/PLAN-2-MEJORAS.md`](docs/PLAN-2-MEJORAS.md) — mejoras propuestas
- [`docs/PLAN-3-PRODUCCION.md`](docs/PLAN-3-PRODUCCION.md) — paso a producción: huecos, build y despliegue
- [`docs/TAGS.md`](docs/TAGS.md) — tabla Excel → punto ICONICS → campo de dominio
