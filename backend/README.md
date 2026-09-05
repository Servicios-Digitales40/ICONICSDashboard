# Backend del asistente ICONICS

Servidor Node.js / Fastify que autentica personas, consulta ICONICS y coordina
las herramientas del asistente, los documentos, la voz y los reportes.

## Arranque

Instala las dependencias con `npm --prefix backend install` desde la raíz.
Usa el entorno indicado en el [README principal](../README.md) y arranca desde
esa misma raíz:

```powershell
node --env-file=.env.local backend/server.mjs
```

El script `npm start` de esta carpeta también existe, pero cambia el directorio
de trabajo: los archivos de aprendizaje y cachés con rutas relativas pueden
terminar en otra ubicación. Mantén un único directorio de trabajo por despliegue.
Los directorios de estáticos y reportes se resuelven desde la raíz del proyecto.

## Estructura

| Ubicación | Responsabilidad |
|---|---|
| `server.mjs` | Arranque y escucha. |
| `app.mjs` | Dependencias, plugins, sesiones, rutas y estáticos. |
| `config.mjs` | Lectura y validación de configuración. |
| `http/esquemas.mjs` | Contratos Zod de solicitudes. |
| `http/plugins/` | Sesión, seguridad, errores y cuerpos binarios. |
| `sesiones/registro.mjs` | Sesiones de usuario en memoria. |
| `iconics/` | OIDC + PKCE, cliente REST, validación y transporte simulado. |
| `ia/conversacion/` | Cola, bucle del modelo, definiciones y ensamblado de herramientas. |
| `ia/herramientas/` | Registro, máquina, históricos, documentación, diagnóstico y aprendizaje. |
| `ia/indices/` | BM25, embeddings, extracción y gestión de manuales. |
| `ia/motor/` | Diagnóstico determinista, casos anteriores y tendencia. |
| `ia/reporte.mjs`, `ia/voz.mjs` | PDF de conversación y transcripción. |
| `routes/` | Contratos HTTP por dominio. |
| `test/` | Pruebas Vitest con Fastify inject. |

## Configuración

La plantilla completa y comentada está en [.env.example](../.env.example).
Los valores efectivos y su validación están en [config.mjs](config.mjs).

| Variables | Función y valores por defecto relevantes |
|---|---|
| `ICONICS_API_BASE` | Base absoluta de FrameWorX REST. |
| `ICONICS_POINT_NAME` | Punto por defecto de las rutas de lectura/contexto compatibles. |
| `ICONICS_USERNAME`, `ICONICS_PASSWORD` | Identidad auxiliar para scripts; no sustituyen el login individual. |
| `ICONICS_READ_ONLY` | `true`: impide escrituras de planta y reconocimiento de alarmas. |
| `ICONICS_FAKE` | `false`: activar sólo para simulación de desarrollo. |
| `PORT`, `STATIC_DIR` | `3001`, `react-dashboard/dist`. |
| `NODE_ENV`, `APP_VERSION`, `LOG_LEVEL` | Modo de despliegue, versión explícita (`dev`) y nivel (`INFO`). |
| `CORS_ORIGINS`, `FRAME_ANCESTORS` | Listas de orígenes exactos; vacías por defecto. |
| `TRUST_PROXY` | `false`; activar sólo con proxy de confianza. |
| `SESION_TTL_MINUTOS`, `SESION_MAX` | 60 minutos de inactividad, 32 sesiones. |
| `SSO_REDIRECT_URI` | Retorno configurado del flujo OIDC silencioso. |
| `UPSTREAM_TIMEOUT_MS`, `BATCH_CACHE_TTL_MS` | 15000 ms por llamada a ICONICS; 2000 ms de caché de lote. |
| `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS` | 300 solicitudes por ventana de 60000 ms. |
| `HISTORY_MAX_PAGINAS`, `HISTORY_MAX_MS`, `HISTORY_CONCURRENCIA` | 20 páginas, 20000 ms totales, 6 tramos concurrentes. |
| `IA_BASE`, `IA_MODELO`, `IA_MODELOS` | Servidor de chat y nombres de modelo; IA apagada sin base. |
| `IA_TIMEOUT_MS`, `IA_MAX_TOKENS`, `IA_MAX_PASOS` | 180000 ms, 512 tokens y 3 rondas. |
| `IA_TURNOS` | Horarios explícitos; vacío no inventa turnos. |
| `IA_DOCS_DIR`, `RAG_UPLOAD_ENABLED` | Carpeta documental y permiso de modificar manuales (`false`). |
| `IA_EMBEDDING_BASE`, `IA_EMBEDDING_MODELO` | Búsqueda semántica opcional; modelo `local`. |
| `IA_WHISPER_BASE`, `IA_WHISPER_IDIOMA`, `IA_WHISPER_TIMEOUT_MS` | Transcripción opcional; español y 60000 ms. |
| `IA_REPORTES_DIR`, `IA_REPORTES_MAX_DIAS` | `Documentos/Reportes`, purga perezosa a los 30 días. |
| `IA_BACKLOG_CHAT_DIR` | `Documentos/BacklogChat`; exportaciones sin purga automática por antigüedad. |
| `DEFAULT_USUARIO`, `DEFAULT_LINEA`, `DEFAULT_EQUIPO`, `DEFAULT_TURNO`, `DEFAULT_RENDIMIENTO` | Metadatos heredados de `/api/context`; no son lecturas ni identidad autenticada. |

## API

En desarrollo, `/docs` ofrece Swagger UI con los esquemas registrados.
No se publica esa interfaz en producción. Los métodos y cuerpos definitivos
están en `routes/` y `http/esquemas.mjs`.

| Familia | Rutas |
|---|---|
| Salud | `GET /api/health/live`, `GET /api/health`, `GET /api/health/ready`. |
| Sesión | `GET/POST/DELETE /api/sesion`; intercambio silencioso bajo `/api/sesion/silenciosa/*` y retorno `/auth/silencioso`. |
| Contexto compatible | `GET /api/context`, con sesión. |
| Lecturas | `GET /api/iconics/data`, `GET /api/iconics/data/batch`. |
| Historia | `GET /api/iconics/history`, `POST /api/iconics/history/batch`. |
| Exploración | `GET /api/iconics/browse`, `GET /api/iconics/points`, `GET /api/iconics/userinfo`. |
| Escrituras | `POST /api/iconics/write`, `POST /api/iconics/write/batch`. |
| Alarmas | `GET /api/iconics/alarms`, `PUT /api/iconics/alarms/acknowledge`. |
| Chat | `GET/POST /api/chat`, `PUT /api/chat/modelo`, `POST /api/chat/exportar`. |
| Documentos | `GET/POST/PUT /api/rag/documentos` y operaciones de archivo definidas en ragRoutes. |
| Casos | Consulta, alta y archivo bajo `/api/casos`. |
| Diagnóstico, control y reportes | Véanse diagnosticoRoutes, controlRoutes y reportesRoutes. |
| Voz | `GET/POST /api/voz`. |

`live` sólo informa de que el proceso está vivo. `health` y `ready`
consultan conectividad con ICONICS: el campo status es `ok` o `error`,
y se informa de sesiones activas. No hay un token global ni estado degraded.

Una ruta industrial implementada no garantiza que el servidor conectado tenga
el dato disponible. En particular, el catálogo de vibraciones declara limitaciones
para alarmas individuales, historia y vigilancias.

## Seguridad y comportamiento

Cada sesión construye su cliente ICONICS con el token de esa persona.
No hay roles locales ni una identidad privilegiada común. Los endpoints de negocio
exigen sesión; las escrituras de planta respetan además el modo de solo lectura,
y las modificaciones documentales su interruptor específico.

La aplicación impone límites de cuerpo, tiempo y concurrencia; valida nombres
de puntos y esquemas. Los logs redactan secretos. Producción exige HTTPS delante
del servidor para la cookie Secure y rechaza desactivar la verificación TLS.
Para una CA privada, configura `NODE_EXTRA_CA_CERTS`.

El chat transmite eventos SSE y comparte una cola de inferencia. Sin `IA_BASE`,
la consulta de estado informa que está deshabilitado y el intento de conversar
explica la configuración faltante; la interfaz del asistente sigue existiendo.

## Documentos, conocimiento y pruebas

PDF.js extrae PDF con un lector de respaldo; DOCX y formatos de texto también
están admitidos. No hay OCR. BM25 funciona sin embeddings. Los manuales
archivados no alimentan el índice y los casos archivados no alimentan el diagnóstico.

Ejecuta `npm --prefix backend test` desde la raíz. Las pruebas montan Fastify
en memoria y no requieren planta. Los verificadores con servidores simulados,
sondas reales y medidas de IA se distinguen en [docs/README.md](../docs/README.md).
