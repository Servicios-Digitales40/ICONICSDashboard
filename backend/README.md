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

El `.env.local` vive en la raíz del repositorio y **no se versiona**.

| Variable | Por defecto | Para qué |
|---|---|---|
| `ICONICS_API_BASE` | *(vacío)* | Base de la API REST, p. ej. `https://servidor/fwxapi/rest/v1`. Sin ella la API responde 500. |
| `ICONICS_USERNAME` | *(vacío)* | Usuario del login OIDC. |
| `ICONICS_PASSWORD` | *(vacío)* | Su contraseña. |
| `ICONICS_POINT_NAME` | *(vacío)* | Punto que leen `/api/iconics/data` y `/api/context` cuando no se indica otro. |
| `PORT` | `3001` | Puerto de escucha. |
| `LOG_LEVEL` | `INFO` | `INFO`, `WARN` o `ERROR`. |
| `STATIC_DIR` | `react-dashboard/dist` | Build del frontend que se sirve. Relativo a la raíz o absoluto. |
| `DEFAULT_USUARIO`, `DEFAULT_LINEA`, `DEFAULT_EQUIPO`, `DEFAULT_TURNO`, `DEFAULT_RENDIMIENTO` | ver `config.mjs` | Contexto de cabecera que devuelve `/api/context`. |

Si `ICONICS_API_BASE` no es una URL válida o `PORT` no es un puerto, el
servidor **no arranca** y dice cuál de las dos está mal. Es deliberado: una
configuración rota que arranca a medias se diagnostica mucho peor.

> Los certificados autofirmados de ICONICS obligan a
> `NODE_TLS_REJECT_UNAUTHORIZED=0` en desarrollo. Es inseguro por definición
> —desactiva la verificación de certificados en todo el proceso— y no debe
> viajar a producción: allí lo correcto es instalar la CA del servidor.

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
│   ├── responses.mjs    Cabeceras CORS, JSON, texto
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

### Alarmas

| Ruta | Cuerpo | Respuesta |
|---|---|---|
| `GET /api/iconics/alarms?pointName=&hours=` | — | `{ ok, alarms: [] }` (máx. 48 h) |
| `PUT /api/iconics/alarms/acknowledge` | `{ eventIds, comment }` | `{ ok, result }` |

### Del propio puente

| Ruta | Respuesta |
|---|---|
| `GET /api/health` | `{ status, iconicsReachable, tokenValid, uptimeSeconds, timestamp, reason? }` |
| `GET /api/context` | `{ context, iconics }` |

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
  borraría justo el dato que explica el fallo.

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
