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
- **Asistente** — un chat que responde en lenguaje natural consultando ICONICS
  de verdad, con un modelo que corre en el propio servidor. Opcional: sin
  `IA_BASE` no aparece.

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
├── shared/             Dominio que usan los dos: catálogo de tags e historiador
├── scripts/            Utilidades de verificación
└── docs/               Plan de conexión, mejoras y tabla de tags
```

`shared/` existe porque el backend y el frontend necesitan las mismas reglas de
negocio —qué máquinas hay, cómo se nombra un punto, cómo se resume un día del
historiador— y duplicarlas las haría divergir. Ver
[`shared/README.md`](shared/README.md).

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

> ⚠️ **`shared/` tiene que viajar en la release.** Desde el Plan 6 el backend
> importa de ahí el catálogo de tags y las reglas del historiador. Un paquete
> que lleve solo `backend/` y `dist/` arranca y falla en el primer `import`.
> El guion de empaquetado está archivado en el tag `archivo/plan-produccion` y
> **no incluye `shared/` todavía**: hay que añadirlo al recuperarlo.

El build se estampa solo con el `git describe` del árbol, y esa versión se ve
en el Topbar y en `/api/health`. En producción **no** deben aparecer
`VITE_ICONICS_FAKE`, `VITE_ENABLE_SIMULATOR`, `VITE_ENABLE_PROTOTYPES` ni
`NODE_TLS_REJECT_UNAUTHORIZED`: las tres primeras se hornean en el bundle, y la
última impide el arranque con `NODE_ENV=production`.

El paso a producción —lo que falta, cómo se compila y cómo se despliega— está
en [`docs/PLAN-3-PRODUCCION.md`](docs/PLAN-3-PRODUCCION.md).

## Orígenes de datos

Hay **dos**, y los dos se ven igual de plausibles en pantalla. El indicador del
Topbar dice cuál está activo, y el que no es real lleva además una cinta de
aviso permanente.

| Origen | De dónde salen los datos | Cómo se activa |
|---|---|---|
| En vivo | Servidor ICONICS | Por defecto |
| Simulado | Transporte falso, sin red | `VITE_ICONICS_FAKE=true` al arrancar, o el botón del Topbar si se compiló con `VITE_ENABLE_SIMULATOR=true` |

El simulador sirve para desarrollar sin servidor **y** para enseñar la
aplicación. Pasa por el motor de polling igual que el servidor real, así que
ejercita la calidad OPC, los reintentos y la marca de dato rancio; lo único que
cambia es de dónde salen los bytes.

Hasta agosto de 2026 había un tercer origen, «Demo», con su propia fuente de
datos fijos. Se retiró porque se saltaba el motor entero —justo lo que había
que ejercitar—, y lo único valioso que aportaba, poder cambiar en caliente, lo
heredó el simulador. Ver [`docs/PLAN-5-DOS-ORIGENES.md`](docs/PLAN-5-DOS-ORIGENES.md).

### Banderas de compilación

| Variable | Qué hace | Por defecto |
|---|---|---|
| `VITE_ICONICS_FAKE` | Arranca en el simulador | real |
| `VITE_ENABLE_SIMULATOR` | Añade el **botón** para cambiar de origen en caliente | apagada |
| `VITE_ICONICS_CHAOS` | `none` · `soft` · `high` — cuántos fallos inyecta el simulador | `soft` |
| `VITE_ENABLE_PROTOTYPES` | Añade las 12 propuestas de diseño y la vista «Máquina 3D» | apagada |

Todas se resuelven en **build**, así que un bundle compilado sin ellas va al
backend real, no trae interruptor y no tiene rutas experimentales — que es lo
que debe llegar a un monitor de planta.

Para una demostración con público, `VITE_ICONICS_CHAOS=none` apaga la
aleatoriedad del simulador: sin huecos, sin calidad mala y sin latencia.

## El asistente

Un chat, disponible desde cualquier pantalla, que responde preguntas en
lenguaje natural consultando ICONICS. «¿Cuál fue el OEE de la Línea 1 el 25 de
marzo de 2025?» se convierte en una lectura real del historiador, no en una
cifra recitada por el modelo.

Es **opcional y está apagado por defecto**. Se enciende apuntando `IA_BASE` a
un llama-server local:

```bash
llama-server.exe -m <modelo>.gguf --jinja --host 127.0.0.1 --port 8080 -c 4096 -ngl 99 --parallel 1
```

Dos cosas de esa línea no son opcionales. **`--jinja`** activa la plantilla de
chat del modelo: sin ella no ve las herramientas y contesta de memoria, que es
el modo de fallo más peligroso porque parece que funciona. Y **`127.0.0.1`**,
porque llama-server no tiene autenticación de ninguna clase.

Tres reglas del diseño, por si sorprenden en pantalla:

- **Toda cifra viene de una consulta.** Debajo de cada respuesta se dice de
  dónde salió el dato. Si el modelo contesta con números sin haber consultado
  nada, el puente **no** deja salir la respuesta.
- **Una consulta a la vez.** La segunda pregunta simultánea recibe un aviso, no
  una espera muda: dos a la vez se reparten la GPU y tardan el doble las dos.
- **Solo algunas máquinas tienen historia.** Hoy, la Lineal 1. Preguntar por
  otra fecha pasada devuelve «no tengo ese dato», nunca un cero.

El detalle está en [`docs/PLAN-6-IA-LOCAL.md`](docs/PLAN-6-IA-LOCAL.md).

## Pruebas

Frontend:

```bash
cd react-dashboard
npm test
```

Backend, sin necesidad de servidor ni configuración —levantan un ICONICS falso
y un llama-server falso, y comprueban que cada pieza devuelve la forma que
espera la siguiente:

```bash
node scripts/verificar-backend.mjs        # el contrato HTTP
node scripts/verificar-herramientas.mjs   # las herramientas del asistente
node scripts/verificar-chat.mjs           # el bucle de conversación
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
- [`docs/PLAN-6-IA-LOCAL.md`](docs/PLAN-6-IA-LOCAL.md) — chat con IA local sobre los datos (propuesto)
- [`docs/TAGS.md`](docs/TAGS.md) — tabla Excel → punto ICONICS → campo de dominio
