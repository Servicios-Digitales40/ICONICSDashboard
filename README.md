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
├── react-dashboard/    Frontend React + Vite
├── scripts/            Utilidades de verificación contra el servidor
└── docs/               Plan de conexión, mejoras y tabla de tags
```

## Requisitos

- Node.js 18 o superior
- Acceso a un servidor ICONICS con la API REST de FrameWorX habilitada

## Puesta en marcha

Las credenciales van en un archivo `.env.local` en la raíz, que **no se versiona**:

```
ICONICS_API_BASE=https://tu-servidor/...
ICONICS_USERNAME=usuario
ICONICS_PASSWORD=contraseña
ICONICS_POINT_NAME=punto por defecto para /api/iconics/data
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

En producción el backend sirve el `dist/` compilado desde el mismo origen, así
que basta con un proceso.

## Orígenes de datos

Hay tres, y los tres se ven igual de plausibles en pantalla. El indicador del
Topbar dice cuál está activo, y los dos que no son reales llevan además una
cinta de aviso permanente.

| Origen | De dónde salen los datos | Cómo se activa |
|---|---|---|
| En vivo | Servidor ICONICS | Por defecto |
| Simulado | Transporte falso, sin red | `VITE_ICONICS_FAKE=true` |
| Demo | Datos de ejemplo fijos | Botón del Topbar |

El simulador sirve para desarrollar sin servidor. La variable se resuelve en
build, así que un bundle compilado sin ella siempre irá al backend real.

## Pruebas

```bash
cd react-dashboard
npm test
```

Para comprobar que el catálogo de tags sigue coincidiendo con el servidor, con
el backend levantado:

```bash
node scripts/verificar-catalogo.mjs
node scripts/verificar-historia.mjs
```

## Documentación

- [`react-dashboard/README.md`](react-dashboard/README.md) — arquitectura del frontend
- [`docs/PLAN-1-CONEXION-ICONICS.md`](docs/PLAN-1-CONEXION-ICONICS.md) — plan de conexión
- [`docs/PLAN-2-MEJORAS.md`](docs/PLAN-2-MEJORAS.md) — mejoras propuestas
- [`docs/TAGS.md`](docs/TAGS.md) — tabla Excel → punto ICONICS → campo de dominio
