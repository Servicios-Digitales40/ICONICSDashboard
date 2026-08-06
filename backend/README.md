# Backend puente hacia ICONICS

Servidor Node **sin dependencias** que hace dos cosas: resuelve la
autenticación contra ICONICS y expone su API REST al frontend en una forma que
el navegador puede consumir.

Existe porque el navegador no puede hablar con ICONICS directamente. La API de
FrameWorX exige OIDC con *Authorization Code + PKCE* —un flujo pensado para un
humano rellenando un formulario de login— y no habilita CORS. Meter esas
credenciales en un bundle de React sería, además, publicarlas.

```
navegador ──► backend puente ──► ICONICS (FrameWorX REST + Hyper Historian)
              · login OIDC
              · caché del token
              · validación de entrada
              · normalización de respuestas
```

## Puesta en marcha

```bash
node --env-file=.env.local backend/server.mjs      # escucha en :3001
```

El `.env.local` vive en la raíz del repositorio y **no se versiona**. La
plantilla comentada de todas las variables está en
[`.env.example`](../.env.example), que sí.

**ICONICS**

| Variable | Por defecto | Para qué |
|---|---|---|
| `ICONICS_API_BASE` | *(vacío)* | Base de la API REST, p. ej. `https://servidor/fwxapi/rest/v1`. Sin ella la API responde 500. |
| `ICONICS_USERNAME` | *(vacío)* | Usuario del login OIDC. |
| `ICONICS_PASSWORD` | *(vacío)* | Su contraseña. |
| `ICONICS_POINT_NAME` | *(vacío)* | Punto que leen `/api/iconics/data` y `/api/context` cuando no se indica otro. |
| `ICONICS_READ_ONLY` | **`true`** | Deshabilita escritura y *ack* de alarmas. Ver abajo. |

**Servidor**

| Variable | Por defecto | Para qué |
|---|---|---|
| `PORT` | `3001` | Puerto de escucha. |
| `LOG_LEVEL` | `INFO` | `INFO`, `WARN` o `ERROR`. |
| `STATIC_DIR` | `react-dashboard/dist` | Build del frontend que se sirve. Relativo a la raíz o absoluto. |
| `APP_VERSION` | `dev` | Qué build corre. Aparece en `/api/health`. |
| `NODE_ENV` | *(vacío)* | Con `production` se endurecen las comprobaciones de arranque. |
| `DEFAULT_USUARIO`, `DEFAULT_LINEA`, `DEFAULT_EQUIPO`, `DEFAULT_TURNO`, `DEFAULT_RENDIMIENTO` | ver `config.mjs` | Contexto de cabecera que devuelve `/api/context`. |

**Red y límites**

| Variable | Por defecto | Para qué |
|---|---|---|
| `CORS_ORIGINS` | *(vacío)* | Orígenes autorizados, separados por comas. Vacío = ninguno. |
| `TRUST_PROXY` | `false` | Leer la IP del cliente de `X-Forwarded-For`. Sólo con proxy inverso delante. |
| `RATE_LIMIT_MAX` | `300` | Peticiones a `/api/` por ventana y cliente. |
| `RATE_LIMIT_WINDOW_MS` | `60000` | La ventana. |
| `UPSTREAM_TIMEOUT_MS` | `15000` | Corte de cualquier llamada hacia ICONICS. |
| `BATCH_CACHE_TTL_MS` | `2000` | Vida de la caché de lecturas en lote. `0` la desactiva. |

Si `ICONICS_API_BASE` no es una URL válida, `PORT` no es un puerto, o un
booleano no es `true`/`false`, el servidor **no arranca** y dice cuál está mal.
Es deliberado: una configuración rota que arranca a medias se diagnostica mucho
peor.

### Las dos que hay que mirar antes de desplegar

**`ICONICS_READ_ONLY` vale `true` si nadie dice lo contrario.** El puente
mantiene una sesión OIDC privilegiada, así que una instalación sin configurar
no debe poder escribir en la planta. Con el modo activo, `POST /write`,
`POST /write/batch` y `PUT /alarms/acknowledge` responden **403 nombrando la
variable** — se registran igual y no se limitan a no existir, porque una ruta
inexistente caería al respaldo de la SPA y devolvería el `index.html` con un
200: el cliente no escribiría nada y creería que sí.

**`NODE_TLS_REJECT_UNAUTHORIZED=0` no arranca en producción.** Desactiva la
verificación de certificados de *todo* el proceso. Los certificados
autofirmados de ICONICS lo hacen necesario en desarrollo —y allí el arranque lo
avisa por el log—, pero con `NODE_ENV=production` la carga de configuración
falla a propósito. En el servidor lo correcto es instalar la CA de ICONICS y
apuntar `NODE_EXTRA_CA_CERTS` a ella.

## Estructura

```
backend/
├── server.mjs           Arranque: configura, monta y escucha
├── app.mjs              Ensamblado: dependencias, rutas, frontera de errores
├── config.mjs           Única lectura de process.env, validada
├── logger.mjs           Log estructurado (texto en TTY, JSON fuera)
│
├── http/                Mecánica HTTP, sin nada de ICONICS
│   ├── router.mjs       Tabla método + ruta
│   ├── responses.mjs    JSON, texto, error
│   ├── cors.mjs         Lista de orígenes autorizados
│   ├── rateLimit.mjs    Contador por cliente
│   ├── requestBody.mjs  Lectura de cuerpo JSON con límite de tamaño
│   └── staticFiles.mjs  Estáticos del build y respaldo de la SPA
│
├── iconics/             Todo lo que sabe de ICONICS
│   ├── authenticator.mjs  Flujo OIDC + PKCE, caché y refresco del token
│   ├── client.mjs         Operaciones contra la API REST
│   └── validation.mjs     Lista blanca de nombres de punto y fechas
│
└── routes/              Traducción HTTP ↔ cliente
    ├── iconicsRoutes.mjs
    └── systemRoutes.mjs
```

Las dependencias apuntan en un solo sentido —`routes` → `iconics` → `http`— y
ningún módulo de abajo conoce a los de arriba. `iconics/client.mjs` no sabe qué
es una respuesta HTTP; `http/` no sabe qué es un punto de ICONICS.

## Endpoints

Todos devuelven JSON con una marca `ok`. El cliente decide mirando `ok`, no
sólo el código HTTP, porque un error del servidor ICONICS llega con **su**
código y su cuerpo, sin enmascarar.

### Lectura

| Ruta | Respuesta |
|---|---|
| `GET /api/iconics/data?pointName=` | `{ ok, payload: { value, quality, timestamp }, pointName }` |
| `GET /api/iconics/data/batch?points=a,b,c` | `{ ok, payload: { [pointName]: { ok, payload } } }` |
| `GET /api/iconics/history?pointName=&startDate=&endDate=&aggregate=&interval=` | `{ ok, data: [{ timestamp, value, quality }], hasMore }` |
| `GET /api/iconics/browse?path=` | `{ ok, payload: BrowseResult[] }` |
| `GET /api/iconics/points?query=` | `{ ok, payload: BrowseResult[] }` |
| `GET /api/iconics/userinfo` | `{ ok, payload }` |

El lote existe porque el motor de sondeo del frontend agrupa en **una** llamada
todos los tags que las vistas montadas necesitan. Devuelve un mapa, no una
lista, para que el poller reparta cada valor sin buscar.

La historia se normaliza: ICONICS la envuelve en `historicalSamples` o la
entrega suelta según el caso, y el frontend no tiene por qué conocer ambas
formas. `hasMore` avisa de que la respuesta se truncó (100 muestras por
llamada); con `aggregate` e `interval` el servidor agrega y el volumen baja.

### Escritura

| Ruta | Cuerpo | Respuesta |
|---|---|---|
| `POST /api/iconics/write` | `{ pointName, value }` | `{ ok, result: WriteResult }` |
| `POST /api/iconics/write/batch` | `{ items: [{ pointName, value }] }` | `{ ok, results: WriteResult[] }` |

Las dos responden **403** mientras `ICONICS_READ_ONLY` valga `true`, que es su
valor por defecto.

### Alarmas

| Ruta | Cuerpo | Respuesta |
|---|---|---|
| `GET /api/iconics/alarms?pointName=&hours=` | — | `{ ok, alarms: [] }` (máx. 48 h) |
| `PUT /api/iconics/alarms/acknowledge` | `{ eventIds, comment }` | `{ ok, result }` |

### Del propio puente

| Ruta | Respuesta |
|---|---|
| `GET /api/health/live` | `{ status: 'ok', version, uptimeSeconds, timestamp }` |
| `GET /api/health` · `GET /api/health/ready` | `{ status, version, iconicsReachable, tokenValid, readOnly, uptimeSeconds, timestamp, reason? }` |
| `GET /api/context` | `{ context, iconics }` |

Son dos preguntas distintas y por eso son dos rutas. **`live`** dice si el
proceso respira y no consulta nada: es la sonda del orquestador, que corre cada
pocos segundos para siempre. **`ready`** —el nombre nuevo de `/api/health`, que
se mantiene— sí llama a ICONICS, y es la que mira el monitor. Sondear la
segunda cada 10 s serían 8 640 pings diarios contra el servidor de planta sólo
para saber si Node está vivo, y además reiniciaría el contenedor por una avería
que no es suya.

`status` tiene tres valores porque son tres averías distintas:

| Valor | Significa | Dónde mirar |
|---|---|---|
| `ok` | Se llega al servidor y hay token válido | — |
| `degraded` | Se llega, pero no hay token | Credenciales o permisos del usuario |
| `error` | No se llega | Red, servicio caído o `ICONICS_API_BASE` sin configurar |

Cualquier otra ruta sirve el frontend compilado: los archivos reales de
`/assets/` tal cual, y todo lo demás el `index.html`, para que el enrutador del
navegador resuelva. Si no hay build, responde 503 diciendo que falta compilar
en vez de un 404 que se confunde con una ruta mal escrita.

## Cómo está pensado

- **Una sola llamada saliente.** Todo lo que sale hacia ICONICS pasa por
  `request()` en `client.mjs`: autenticación, parseo, error y traza ocurren una
  vez y en un sitio. Antes cada operación repetía ese bloque, y cada copia
  podía divergir —de hecho divergían.

- **La configuración se lee una vez y se valida.** `process.env` se toca sólo
  en `config.mjs`. Eso permite montar la app entera con una configuración de
  prueba, que es exactamente lo que hace `scripts/verificar-backend.mjs`.

- **Un login, no uno por petición.** El token se cachea y se refresca con
  margen, y los intentos simultáneos comparten el mismo flujo en vuelo: veinte
  peticiones en frío disparan **un** login, no veinte.

- **Lista blanca, no lista negra.** Todo parámetro que acabe en una petición a
  ICONICS pasa por `validation.mjs`. El patrón admite lo que un nombre de punto
  real necesita —incluidos los parámetros de los Data Manipulators y el espacio
  `$info:` de diagnóstico de licencia— y rechaza lo demás.

- **Ninguna petición se queda colgada.** `app.mjs` envuelve el manejador
  completo: una excepción imprevista es un 500 registrado, no un socket abierto
  esperando a que el cliente se canse.

- **Los errores del servidor no se enmascaran.** Un 500 de ICONICS llega como
  500 con su cuerpo dentro de `payload`. Convertirlo en un 502 genérico
  borraría justo el dato que explica el fallo. Con una excepción deliberada: el
  corte por timeout se distingue como **504**, porque "tardó demasiado" y "no
  se pudo conectar" se arreglan en sitios distintos.

- **Ninguna llamada saliente puede colgarse.** `request()` lleva
  `AbortSignal.timeout`, y como toda salida pasa por ahí, las cubre todas. El
  modo de fallo de un servidor saturado no es rechazar la conexión: es
  aceptarla y no contestar, y sin corte eso acumulaba sockets hasta tumbar el
  puente.

- **El defecto es el seguro.** `ICONICS_READ_ONLY` y `CORS_ORIGINS` valen lo
  restrictivo si nadie los toca, y lo permisivo se pide a propósito. Es la
  lección que el frontend ya había aprendido con `VITE_ICONICS_FAKE`: un
  defecto cómodo se convierte en el estado permanente de las instalaciones que
  nadie revisó.

- **Una lectura para todas las pantallas.** El motor de sondeo agrupa muy bien
  dentro de un navegador, pero eso es por cada pantalla encendida, y todas
  piden los mismos tags. La caché de `readPoints()` colapsa esa ráfaga en una
  sola llamada; su ventana es un orden de magnitud menor que la cadencia de
  sondeo, así que ningún dato llega más viejo de lo que ya llegaba.

## Verificación

```bash
node scripts/verificar-backend.mjs
```

Levanta un ICONICS falso —flujo OIDC incluido— y comprueba que cada endpoint
devuelve la forma exacta que consume el frontend. No necesita red, ni
configuración, ni el backend levantado.

Contra el servidor real, con el backend en marcha:

```bash
node scripts/verificar-catalogo.mjs    # los 147 puntos del catálogo existen
node scripts/verificar-historia.mjs    # el historiador entrega muestras
```
