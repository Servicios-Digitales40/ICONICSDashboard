# CLAUDE.md — no negociables de este proyecto

Este archivo es la referencia rápida antes de tocar código. Si algo aquí
contradice lo que ves en un archivo concreto, **el archivo tiene razón** —
avisa y se corrige este documento, no al revés. Los porqués largos viven en
las cabeceras de cada archivo y en `docs/`; aquí sólo el resumen accionable.

## 1. Qué es esto

Puente Node hacia ICONICS FrameWorX y **una sola pantalla**: la conversación
con el asistente. El técnico entra con su usuario y contraseña de ICONICS —no
los de un `.env`— y a partir de ahí pregunta; todo lo que la aplicación sabe
hacer se pide hablando. No hay sidebar, router de páginas, 3D ni gráficas de
tablero: eso vivía en la rama `Moises6` (el tablero de OEE / Demo EVA) y se
borró aquí en el [Plan 20](docs/PLAN-20-ASISTENTE.md), que es la referencia
completa de por qué y de qué sobrevivió. Detalle de producto en
[`PRODUCT.md`](PRODUCT.md), de arranque en [`README.md`](README.md).

## 2. No negociables (arquitectura)

Estas decisiones ya se tomaron. No se reabren por conveniencia de una tarea
puntual — si una tarea choca con una de estas, la tarea se replantea, no la
regla.

1. **ICONICS FrameWorX es la única fuente de datos de sensores DE PLANTA, y
   la única fuente de verdad sobre ellos.** No hay MQTT, no hay OPC-UA en el
   camino de datos (`scripts/plc_opcua.py` es un guion suelto, no está
   conectado a nada), no hay Node-RED, no hay event bus. Todo dato de sensor
   de planta entra por `backend/iconics/client.mjs`.

   **La acotación «de planta» es del 03-09-2026 y tiene dueño**
   ([`docs/PLAN-19-MODULARIZACION.md`](docs/PLAN-19-MODULARIZACION.md) §0.1):
   el módulo de Predicción consume un compresor real por una API externa, no
   por ICONICS. La regla no se relaja, se acota — un módulo con otra fuente
   **la declara en `shared/modulos.js` y nunca mezcla su dato con el de
   planta** en el mismo registro, el mismo lote de lectura ni la misma
   herramienta del asistente. Es la misma prohibición que ya separa tanque de
   vibraciones (`NO_COMPARTEN` en `shared/eva/comun/sistemas.js`), un nivel
   más arriba: allí impide cruzar dos máquinas con distinto PLC, aquí impide
   cruzar dos módulos con distinta fuente.
2. **No hay base de datos ni vector DB.** La persistencia es JSON en
   `backend/datos/` (embeddings-cache) y `datos/aprendizaje.json` (no
   versionado). Los "índices" de búsqueda son cachés JSON, no un motor
   externo.
3. **El código puntúa, el modelo redacta.** El motor de diagnóstico
   (`backend/ia/motor/`) es determinista y nunca lo toca el LLM. El modelo
   narra un resultado ya calculado; jamás decide una banda, un orden o una
   causa por su cuenta. Ver la cabecera de `motor/diagnostico.mjs` antes de
   tocarlo.
4. **La ausencia de dato nunca se disfraza de cero.** Un valor que no llegó,
   que tiene mala calidad OPC, o un tramo del historiador sin muestra, se
   representa como hueco (`sinDato`, `motivo`, `cobertura`) y se cuenta
   aparte. Ver `shared/quality.js`, `shared/valores.js` y la nota del
   26-08-2026 en la cabecera de `shared/eva/estadoMaquina.js`.
5. **No se inventa lo que falta.** Si algo requeriría OCR, un servidor que no
   está montado, o un umbral sin calibrar, el código lo dice explícitamente
   (`fallo(...)`, `provisional: true`) en vez de simular una respuesta. Un
   servidor sin una pieza montada se niega y explica qué falta; no degrada en
   silencio.
6. **El dominio compartido no se duplica.** Una regla de negocio que necesitan
   backend y frontend a la vez vive en `shared/`, una sola vez. Ver
   [`shared/README.md`](shared/README.md) — incluye el incidente concreto que
   esta regla existe para no repetir.
7. **`shared/` es dominio puro.** Sin React, sin `fetch`, sin nada que sepa de
   HTTP o de UI. Se prueba en Node sin arrancar nada. Lo que sí necesita red
   (`data/historia.js`, `data/simulador.js` en el frontend;
   `backend/ia/indices/` en el backend) vive fuera y **llama** al dominio, no
   al revés.
8. **`ICONICS_FAKE=true` nunca en producción.** Es el transporte simulado para
   desarrollo sin red — ver `backend/iconics/fakeClient.mjs`.
9. **Sin comodín en CORS ni en `frame-ancestors`.** `CORS_ORIGINS` compara
   por igualdad exacta; no existe `*`. `FRAME_ANCESTORS` (quién puede
   empotrarnos en un `<iframe>` — por ejemplo un HMI nativo de ICONICS,
   AnyGlass/GraphWorX) es más estricta todavía: ahí el comodín SÍ funcionaría
   de verdad si se dejara pasar —es sintaxis real de la CSP, no una
   comparación de igualdad—, así que el arranque falla si lo detecta en vez
   de filtrarlo en silencio. Ver `backend/http/plugins/seguridad.mjs`.
10. **La agrupación en 4 activos (Tanque, Bombeo, Distribución, Eléctrico) es
    NUESTRA, no del servidor.** Bajo `ac:TDCON/DEMO/SENSORES/` no hay equipos,
    sólo señales sueltas. Si el servidor publica equipos de verdad algún día,
    se sustituye `shared/eva/activos.js` y ninguna vista se entera — pero
    hasta entonces, ese archivo es la única fuente de esa agrupación.
11. **La sesión es obligatoria: no hay decorador vacío ni interruptor.** No
    existe `AUTH_HABILITADA` — el técnico entra con **su usuario y contraseña
    de ICONICS**, y sin esa sesión no hay token con el que leer nada. Toda
    ruta de `/api/` salvo `/api/health*` y `POST /api/sesion` declara
    `onRequest: [fastify.autenticar]`. Ver
    [`docs/PLAN-20-ASISTENTE.md`](docs/PLAN-20-ASISTENTE.md) §4.
12. **Una sola vista.** No se añade una ruta de página. Lo que haya que
    enseñar se enseña dentro del chat o en un cajón del chat (Assets,
    Manuales, Casos — §4.4 más abajo). Un `router` con dos entradas es el
    primer paso para volver a tener veintidós, y este proyecto ya hizo ese
    camino una vez.

## 3. Estructura del repo

```
.
├── CLAUDE.md            Este archivo
├── README.md             Arranque, orígenes de datos, pruebas
├── PRODUCT.md             Qué es esto para quién
├── DESIGN.md              Sistema de diseño (color, tipografía, componentes)
├── backend/               Servidor puente hacia ICONICS (Node, Fastify)
│   ├── http/plugins/         autenticacion.mjs (sesión de persona), seguridad, errores
│   ├── ia/                  Asistente. Íntegro desde el Plan 20: no lo tocó el borrado
│   │   ├── indices/           Búsqueda: bm25, documentos, embeddings, manuales
│   │   ├── motor/             Diagnóstico determinista: diagnostico, casos, temporal
│   │   ├── conversacion/      Bucle del modelo: chat, cola, definiciones, herramientas
│   │   ├── herramientas/      Una carpeta por FAMILIA de herramienta del modelo (22, en 6)
│   │   ├── reporte.mjs        PDF de la conversación (import diferido)
│   │   └── voz.mjs            Dictado (whisper)
│   ├── iconics/              Autenticación OIDC+PKCE, cliente REST, transporte falso
│   ├── sesiones/registro.mjs  El registro de sesiones de persona — ver §2.11
│   ├── routes/                sesionRoutes + una por dominio (chat, iconics, rag, casos,
│   │                          control, diagnostico, reportes, voz, system)
│   └── test/                  vitest: contratos HTTP, esquemas, config, sesión
├── react-dashboard/        Frontend React + Vite. Sin router: dos pantallas por estado
│   │                       de sesión (§2.11, §2.12)
│   └── src/
│       ├── app/App.jsx         Login | Asistente, según GET /api/sesion
│       ├── auth/                SesionProvider.jsx, Login.jsx
│       ├── features/asistente/  el corazón — pantalla completa, con sus tres cajones
│       │   └── cajones/            Assets, Manuales, Casos — ver docs/PLAN-20-ASISTENTE.md §5.5
│       ├── components/
│       │   ├── ui/                 Button, Input, Panel, AlertBanner, SectionLabel…
│       │   └── assets/ExploradorAssets.jsx   montado en el cajón «Assets»
│       ├── lib/
│       │   ├── api/                pedir.js (la única puerta a fetch) + apiBase/casosApi/ragApi
│       │   └── iconics/            apiClient + index (browse/points/data), para el cajón Assets
│       ├── theme/                 Tokens de tema (claro/oscuro/Mitsubishi Electric)
│       └── test/                  vitest: app/, auth/, dominio/, features/, lib/
├── shared/                 Dominio puro. ÍNTEGRO desde el Plan 20 — no se le tocó una línea
│   └── eva/                  Las dos instalaciones — ver shared/README.md para el mapa completo
│       ├── tanque/             Su catálogo, física, reglas y proyección
│       ├── vibraciones/        Lo mismo, para la otra máquina
│       └── comun/              Lo que ninguna posee sola: el registro, la forma
│                               común, umbrales, historia, aprendizaje, casos
├── scripts/                Verificadores (`verificar-*.mjs`) y sondas contra ICONICS real
└── docs/                   Planes (`PLAN-N-*.md`) y backlogs (`BACKLOG-*.md`)
```

> **De dónde salió esta forma.** Hasta el 03-09-2026 el repo era un tablero de
> 22 rutas (Demo EVA: tanque, vibraciones, alarmas, assets, predicción, RAG) con
> sidebar, 3D y gráficas. La rama `Asistente` lo destiló a una sola vista —el
> chat— conservando `backend/ia/` y `shared/` byte a byte. La rama del tablero
> sigue viva en `Moises6`. Razón, alcance y las cinco fases ejecutadas están en
> [`docs/PLAN-20-ASISTENTE.md`](docs/PLAN-20-ASISTENTE.md); no se repiten aquí.

Mapas detallados con el porqué de cada archivo: [`shared/README.md`](shared/README.md)
(dominio), [`backend/README.md`](backend/README.md) (servidor).

## 4. Convenciones

### 4.1 Cabeceras de archivo

Todo archivo no trivial abre con un comentario que explica **por qué existe y
por qué así**, no qué hace línea a línea — eso ya lo dice el código. Secciones
recurrentes con esta forma:

```js
/**
 * Una frase: qué es este archivo.
 *
 * ── POR QUÉ EXISTE / POR QUÉ ASÍ ────────────────────────────────────
 *
 * El razonamiento, con el incidente o la alternativa descartada si aplica.
 */
```

Al modificar un archivo, si el motivo de la cabecera ya no es cierto, se
corrige la cabecera en el mismo commit. Una cabecera desactualizada es peor
que ninguna.

### 4.2 El patrón "puerta" al mover un archivo

Cuando un archivo se traslada pero algo externo sigue importando la ruta
vieja por conveniencia, la ruta vieja se deja como una puerta de una línea
(el ejemplo histórico, `Demo-EVA/domain/*.js` reexportando `shared/eva/`, se
borró con el tablero en el Plan 20 — el patrón sigue vigente igual):

```js
/**
 * [Una frase de qué es.]
 *
 * El contenido vive en [`@shared/eva/X.js`](ruta/relativa); aquí queda la
 * puerta. El motivo del traslado está en `./archivo-hermano.js`.
 */
export * from "@shared/eva/X.js";
```

Nunca se copia el contenido a los dos sitios. Una puerta es una línea; una
copia es una divergencia esperando a pasar.

### 4.3 Separación por capa, no por tipo de archivo

- **Dominio** (`shared/`): reglas de negocio, puro, se prueba en Node sin red
  ni DOM.
- **Transporte/datos** (`backend/ia/indices/`, `lib/api/`, `lib/iconics/`):
  sabe hacer `fetch` o leer el historiador; no decide reglas de negocio, las
  importa del dominio.
- **Presentación** (`components/`, `features/asistente/`): sabe de React y de
  colores; no decide bandas ni umbrales, los pide al dominio ya resueltos.

Una vista que calcula una banda de riesgo con su propio `if` está rompiendo
esta capa — la banda se pide a `shared/eva/`, no se recalcula.

### 4.4 No hay nomenclatura de vista por máquina

Hasta el Plan 20 había una convención de nombres por máquina (`InicioTanque`,
`RiesgosVibracion`…) porque había nueve vistas por instalación. Con una sola
pantalla no aplica: la distinción por máquina vive donde tiene que vivir, en
`shared/eva/{tanque,vibraciones}/`, y el frontend ya no tiene vistas que
nombrar por instalación. Los tres cajones (`features/asistente/cajones/`) se
nombran por lo que muestran —Assets, Manuales, Casos—, no por máquina, porque
ninguno pertenece a una sola.

### 4.5 Alias de import

- `@/...` → `react-dashboard/src/...`
- `@shared/...` → `shared/...` (resuelto en Vite y en Node; ver
  `shared/README.md` sobre por qué el backend no importa desde `src/`)

### 4.6 Idioma y honestidad en el texto

Comentarios, mensajes de error y texto de cara al técnico van en español.
Un mensaje de `fallo(...)` dice qué falta y cómo resolverlo (qué llamar antes,
qué variable falta), nunca un genérico "algo salió mal".

### 4.7 Módulo y sistema no son lo mismo

Dos palabras que se parecen y no se pueden intercambiar:

- **Sistema** — una máquina de planta leída por ICONICS. Hoy `tanque` y
  `vibraciones`. Se declaran en `shared/eva/comun/sistemas.js`, que **no es
  una lista de nombres sino código ejecutable**: cada entrada trae `raices`,
  `puntos()`, `parse()`, `modelo()`, `esHistorizada()` y `cadenciaMs`, todo
  ello dando por hecho que hay tags de ICONICS detrás.
- **Módulo** — una agrupación de más arriba, definida por **su fuente de
  datos**. Hoy `monitoreo` (los dos sistemas de arriba, por ICONICS) y
  `prediccion` (un compresor real, por API externa). Se declaran en
  `shared/modulos.js`.

> **En la rama `Asistente` sigue habiendo dos módulos, no uno.** El
> [Plan 20](docs/PLAN-20-ASISTENTE.md) borró la vista de Predicción del
> frontend por estar fuera de alcance (otra fuente de datos), pero
> `shared/modulos.js` es dominio compartido y el plan no lo tocó: sigue
> declarando `prediccion`, con la limitación explícita de que el asistente
> todavía no la alcanza. `scripts/verificar-modulos.mjs` sigue vivo y en
> verde por esto mismo — comprueba la separación entre los dos módulos, no
> sólo entre los dos sistemas de ICONICS. Si un backend nuevo llega a
> consultar el compresor, la regla de abajo ya está puesta.

De ahí sale una regla concreta: **una máquina que no se lee por ICONICS no
entra en `SISTEMAS`.** Meterla obligaría a que cada una de esas funciones
tuviera una rama «ésta no es de ICONICS», que es exactamente el `if` repetido
en cinco archivos que ese registro existe para evitar. Ver
[`docs/PLAN-19-MODULARIZACION.md`](docs/PLAN-19-MODULARIZACION.md) §0.2.

## 5. Pruebas — qué existe y cuándo correrlas

Antes de dar una tarea por terminada, corre lo que toque de esta lista.

**Frontend** (`react-dashboard/`):
```bash
npm test               # vitest — 19 archivos, dominio + auth + asistente + cajones
npm run design:detect   # impeccable — antipatrones de diseño/CSS
npm run build            # confirma que el bundle sigue compilando
```
> Tras el [Plan 20](docs/PLAN-20-ASISTENTE.md), `design:detect` da **un**
> aviso *advisory* (`codex-grid-background` sobre el trazo de la respuesta) y
> está documentado como excepción deliberada en la cabecera de
> `Asistente.jsx` — no es una regresión pendiente de arreglar.

**Backend** (`backend/`):
```bash
npm test               # vitest — 12 archivos, contratos HTTP, sesión, config, logger
```

**Verificadores de extremo a extremo** (`scripts/`, sin red real — levantan un
ICONICS y un llama-server falsos):
```bash
node scripts/verificar-backend.mjs          # contrato HTTP completo
node scripts/verificar-herramientas.mjs      # las 22 herramientas del asistente
node scripts/verificar-chat.mjs               # el bucle de conversación
node scripts/verificar-diagnostico.mjs        # el motor: las 4 fuentes y su puntuación
node scripts/verificar-documentos.mjs          # índice de manuales / BM25
node scripts/verificar-casos.mjs                # índice de casos previos
node scripts/verificar-casos-cierre.mjs          # cierre de diagnóstico — sólo por chat
node scripts/verificar-temporal.mjs               # la 4ª fuente (tendencia)
node scripts/verificar-calibracion.mjs             # sensibilidad de umbrales al tamaño de corpus
node scripts/verificar-riesgos.mjs                  # reglas de riesgo del tanque
node scripts/verificar-riesgos-vibracion.mjs         # reglas de riesgo de vibraciones
node scripts/verificar-pronostico.mjs                 # desgaste acumulado
node scripts/verificar-aprendizaje.mjs                 # hechos, intervenciones y propuestas
node scripts/verificar-voz.mjs                          # dictado (whisper falso)
node scripts/verificar-manos-libres.mjs                  # ciclo de voz completo
node scripts/verificar-transporte-falso.mjs                # ICONICS_FAKE sirve las dos máquinas
node scripts/verificar-modulos.mjs                         # los dos módulos no cruzan fuentes (§4.7)
node scripts/verificar-sesion.mjs                            # login nativo, extremo a extremo (§2.11)
```
> `verificar-modulos.mjs` sigue en la lista a propósito: `shared/modulos.js`
> sigue declarando dos módulos aunque la vista de Predicción ya no exista en
> esta rama — ver la nota de §4.7.

**Sonda contra ICONICS REAL** (no vale el falso: necesita red a planta y
`--env-file`):
```bash
node --env-file=.env.local scripts/verificar-antiguedad-historico.mjs   # edad de la última muestra
```
> **Sin `--env-file` falla siempre**, con «Falta ICONICS_API_BASE en
> .env.local». Es la causa habitual de verlo en rojo dentro de una tanda de
> `verificar-*`, y no es una regresión — estaba listado junto a los que sí
> corren sin red. Con `--env-file` y red a planta pasa: medido el
> 02-09-2026, historia contigua desde el 18-08.
>
> Ojo al diagnosticarlo desde fuera: `bms-server` usa **certificado
> autofirmado**, así que un `curl` sin `-k` devuelve 000 y parece que no hay
> servidor. Lo hay. Node lo acepta por `NODE_TLS_REJECT_UNAUTHORIZED=0` en
> `.env.local` — que por eso mismo no arranca con `NODE_ENV=production`.

**Instrumentos de medida** (necesitan los servidores de IA: `:8081` para la
calibración, `:8080` para la narración — ninguno necesita ICONICS):
```bash
node --env-file=.env.local scripts/medir-calibracion.mjs   # distribución real de coseno y BM25
node --env-file=.env.local scripts/medir-narracion.mjs     # ¿obedece el modelo la instrucción de conflicto?
```
> No afirma nada, **mide**: de su salida salen los `UMBRAL_*` de
> `ia/motor/diagnostico.mjs`. No es un verificador y no devuelve código de
> error — no lo metas en una tanda de `verificar-*`. Su hermano sí lo es:
> `verificar-calibracion.mjs` prueba el MECANISMO sin servidores, sobre un
> corpus sintético. Separarlos es lo que impide poner un umbral a ojo y
> después escribir la prueba que lo confirme.

**Tras compilar el frontend:**
```bash
node scripts/verificar-bundle.mjs   # la pila 3D/recharts/xlsx no ha vuelto; techos de arranque
```
> **Remedido el 04-09-2026, al cerrar la Fase 5 del Plan 20**: `index`
> 98,88 KB sobre un techo de 110, `vendor` 125,18 KB sobre un techo de 140.
> `three`, `@react-three/*`, `recharts` y `xlsx` se desinstalaron en la F3 —
> `vendor` cayó un 46 % (de 203 a 109 KB en esa medición intermedia) — así que
> el guion ya no vigila «¿está diferido?» sino **«¿ha vuelto?»**: falla si
> encuentra el rastro de cualquiera de las tres en el código emitido, esté
> diferido o no.
>
> Los techos subieron de 102/126 (medidos en la F3, contra una app
> **incompleta**: sin login y sin cajones) a 110/140 al terminar la F5, por
> razones legítimas y medidas: `index` +10 KB por el login, la sesión y el
> armazón de tres estados; `vendor` +16 KB porque los cajones usan `useQuery`.
> Los tres cajones (Assets, Manuales, Casos) no cuentan en ninguno de los dos:
> viajan en `chunk`s propios, diferidos con `lazy()`.

**Regla de oro:** un cambio que toca `backend/ia/` corre como mínimo
`verificar-herramientas.mjs` y el verificador específico de lo que tocó
(`verificar-diagnostico.mjs` si tocó el motor, `verificar-documentos.mjs` si
tocó el índice de manuales, etc.). Un cambio en `shared/eva/` corre los
verificadores de ambas instalaciones si el archivo es común a las dos.

## 6. Flujo de trabajo con Claude Code

- **Commit por fase.** Cuando un trabajo se divide en fases (planes
  `docs/PLAN-N-*.md`), cada fase se prueba y se comitea antes de pasar a la
  siguiente — nunca un commit gigante al final.
- **No se hace push sin pedirlo explícitamente en ese turno.** Un commit
  autorizado antes no autoriza el siguiente push.
- **Gaps se documentan, no se ocultan.** Si algo queda bloqueado (falta un
  servidor, falta dato real para calibrar), se anota en el plan y en el
  código (`provisional: true`, comentario con el motivo) en vez de fingir que
  quedó resuelto.
- **Antes de mover o renombrar algo que "parece" un duplicado**, confirma
  leyendo la cabecera — este proyecto usa el patrón puerta (§4.2)
  deliberadamente, y no todo lo que comparte nombre es lo mismo dos veces
  (ver `docs/PLAN-17-CERRAR-AUDITORIA.md`, sección de auditoría de
  duplicados).

## 7. Referencias

- [`README.md`](README.md) — arranque, variables de entorno, orígenes de datos
- [`PRODUCT.md`](PRODUCT.md) — producto, usuarios, posicionamiento
- [`DESIGN.md`](DESIGN.md) — sistema de diseño
- [`shared/README.md`](shared/README.md) — mapa completo del dominio compartido
- [`backend/README.md`](backend/README.md) — variables de entorno del servidor
- [`docs/BACKLOG-BACKEND.md`](docs/BACKLOG-BACKEND.md), [`docs/BACKLOG-FRONTEND.md`](docs/BACKLOG-FRONTEND.md) — deuda conocida y priorizada
- [`docs/PLAN-17-CERRAR-AUDITORIA.md`](docs/PLAN-17-CERRAR-AUDITORIA.md) — última auditoría de arquitectura completa (previa al Plan 20)
- [`docs/PLAN-20-ASISTENTE.md`](docs/PLAN-20-ASISTENTE.md) — la rama `Asistente`: por qué es una rama y no un proyecto nuevo, el login nativo, el inventario de borrado, las siete fases ejecutadas (la última, el SSO silencioso para vivir embebido en el HMI de ICONICS)
