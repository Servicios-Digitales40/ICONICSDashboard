# Asistente de mantenimiento para ICONICS

Aplicación web para consultar una instalación industrial en lenguaje natural.
El técnico entra con su cuenta de ICONICS y pregunta por señales, historia,
riesgos, manuales y reparaciones anteriores. La interfaz es una conversación
con tres paneles auxiliares: **Assets, Manuales y Casos**.

Esta rama, `Asistente`, no contiene el antiguo dashboard de 22 vistas.
Los planes de ese tablero se conservan como antecedentes en [docs](docs/README.md).

## Capacidades

- Lecturas actuales con calidad y marca de tiempo; exploración de AssetWorX.
- Historia, comparación de periodos, análisis, correlación y gráficos de señales compatibles.
- Evaluación de riesgos y diagnóstico determinista a partir de datos, manuales, casos y tendencias.
- Pronóstico de desgaste para sistemas con mecanismos declarados.
- Búsqueda documental BM25 y búsqueda semántica opcional con embeddings.
- Carga, reemplazo y archivo de manuales; hechos confirmados y bitácora de intervenciones.
- Registro de la causa real al cerrar un diagnóstico y propuestas de reglas para revisión humana.
- Control de bomba con restricciones de proceso, modo de solo lectura y permisos de ICONICS.
- Dictado, manos libres y lectura hablada de las respuestas, cuando se configura la voz.
- Adjuntar texto, cancelar/reintentar consultas, conservar el hilo y exportarlo a PDF.
- Selección de modelo cuando el servidor y `IA_MODELOS` ofrecen varios modelos.

El modelo elige herramientas y redacta; el código calcula las bandas y ordena
las causas. Cada consulta deja su procedencia. Las solicitudes al modelo se
encolan para compartir el servidor entre usuarios.

## Arquitectura

```text
React / Vite ── HTTP y SSE ── Node.js / Fastify
                              ├─ ICONICS FrameWorX REST (token por usuario)
                              ├─ llama-server (herramientas y redacción)
                              ├─ manuales e índices BM25 / embeddings
                              ├─ motor de diagnóstico y dominio shared/
                              └─ JSON de conocimiento y archivos PDF
```

El dominio declara dos instalaciones independientes: tanque y vibraciones.
La cobertura de historia y desgaste se declara por sistema; no todas las
herramientas admiten todas las señales. Véase [shared/README.md](shared/README.md).

## Requisitos e instalación

- Node.js **22.13 o posterior de la serie 22**, o una versión posterior compatible
  con los motores declarados por las dependencias. Node 18 ya no es una base válida
  para el conjunto actual de Fastify, Vitest, jsdom y PDF.js.
- npm y acceso a ICONICS FrameWorX REST para datos reales.
- `llama-server` para responder con IA; Whisper y embeddings son opcionales.

Desde la raíz del repositorio:

```powershell
npm --prefix backend install
npm --prefix react-dashboard install
Copy-Item .env.example .env.local
```

Edita `.env.local`: configura `ICONICS_API_BASE` y, para el asistente,
`IA_BASE`. No se requieren credenciales compartidas para el login normal.
La plantilla [.env.example](.env.example) y [backend/README.md](backend/README.md)
describen las opciones.

En dos terminales, desde la raíz:

```powershell
node --env-file=.env.local backend/server.mjs
```

```powershell
npm --prefix react-dashboard run dev
```

Abre http://localhost:5173. Vite reenvía `/api` al backend en el puerto 3001.
Para trabajar sin planta, configura `ICONICS_FAKE=true`: el backend simula
los datos y acepta credenciales no vacías para la sesión de desarrollo.
No hay interruptor de simulación en el frontend.

## IA, documentos y voz

- `IA_BASE`: dirección del servidor local de chat. La configuración habitual de
  llama-server usa `--jinja` para la plantilla con herramientas y escucha en
  `127.0.0.1`. `scripts/ia-local.ps1` contiene el arranque local.
- `IA_MAX_PASOS`: límite de rondas de herramientas por pregunta, 3 por defecto.
- `IA_DOCS_DIR`: carpeta de manuales. El lector contempla PDF, DOCX, TXT, MD,
  CSV y LOG; el catálogo de extensiones está en `shared/eva/comun/manuales.js`.
  PDF.js extrae texto de PDF, con un lector de respaldo. No hay OCR.
- `RAG_UPLOAD_ENABLED=true`: habilita modificaciones del catálogo documental;
  tener una carpeta configurada por sí solo no habilita las cargas.
- `IA_EMBEDDING_BASE`: añade búsqueda semántica a BM25. Sin ella se mantiene
  la búsqueda léxica.
- `IA_WHISPER_BASE`: habilita transcripción. El navegador convierte audio a WAV;
  la salida hablada usa síntesis del navegador/sistema. Véase `scripts/whisper.ps1`.

## Sesión y persistencia

OIDC + PKCE autentica a cada técnico contra ICONICS. Los tokens permanecen en
el backend y se asocian a una cookie HttpOnly. Las sesiones viven en memoria:
reiniciar el proceso obliga a iniciar sesión de nuevo.

La conversación se guarda en el navegador. Una sesión caducada conserva el
hilo; salir explícitamente lo borra. Los hechos y casos se guardan en
`datos/aprendizaje.json`; las cachés y documentos son archivos, no una base de datos.
Las rutas relativas de aprendizaje y caché dependen del directorio de trabajo:
se recomienda arrancar desde la raíz, como en los ejemplos.

No hay roles locales de administrador/operador. Las escrituras de planta usan
los permisos de ICONICS y `ICONICS_READ_ONLY`; la gestión de archivos emplea
sesión y las restricciones de configuración correspondientes.

## Producción e integración en HMI

```powershell
npm --prefix react-dashboard run build
node scripts/verificar-bundle.mjs
node --env-file=.env.production backend/server.mjs
```

Distribuye `backend/`, sus dependencias, `shared/` y `react-dashboard/dist/`.
El backend sirve el bundle; sin compilarlo responde 503. Usa un proxy inverso
con HTTPS: en producción la cookie lleva `Secure` y Node no termina TLS.
Configura `APP_VERSION` para identificar el despliegue en `/api/health`;
no se deriva automáticamente del build del frontend.

Para SSO silencioso dentro del HMI, configura `SSO_REDIRECT_URI`,
`FRAME_ANCESTORS` y el proxy del mismo origen. Si se monta bajo una subruta,
compila con `VITE_BASE_PATH=/asistente/` y `VITE_API_BASE=/asistente`. La configuración detallada está en el
[Plan 20, integración SSO](docs/PLAN-20-ASISTENTE.md).

## Verificación y documentación

```powershell
npm --prefix backend test
npm --prefix react-dashboard test
npm --prefix react-dashboard run build
node scripts/verificar-bundle.mjs
```

- [Índice de documentación y verificadores](docs/README.md).
- [Backend: configuración y API](backend/README.md).
- [Frontend: estructura y desarrollo](react-dashboard/README.md).
- [Dominio y limitaciones](shared/README.md).
- [Stack y dependencias directas](docs/STACK.md).
- [Reglas de mantenimiento](CLAUDE.md), [producto](PRODUCT.md) y [diseño](DESIGN.md).
