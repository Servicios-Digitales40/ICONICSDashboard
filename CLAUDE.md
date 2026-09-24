# CLAUDE.md — no negociables de este proyecto

Este archivo es la referencia rápida antes de tocar código. Si algo aquí
contradice lo que ves en un archivo concreto, **el archivo tiene razón** —
avisa y se corrige este documento, no al revés. Los porqués largos viven en
las cabeceras de cada archivo y en `docs/`; aquí sólo el resumen accionable.

## 1. Qué es esto

Una **plataforma de configuración de máquinas con ICONICS FrameWorX como
única fuente de verdad de planta**: se configura la máquina desde el árbol de
ICONICS, se verifican sus señales y sus series del historiador, se le asigna
documentación, y un asistente de IA local contesta sobre su estado, sus
señales y sus valores, dibuja gráficas, genera reportes y diagnostica con un
motor determinista. Técnicamente: un puente Node (Fastify) hacia ICONICS y un
tablero React (Demo EVA) con dos instalaciones de planta (un sistema de agua,
hoy cerrado y sin vistas propias, y un sistema de vibraciones como máquina
configurada). Detalle
de producto en [`PRODUCT.md`](PRODUCT.md), de arranque en [`README.md`](README.md).

> ## ⚠ RAMA `Vibraciones1.0`: LA ESTACIÓN DE LLENADO ESTÁ CERRADA
>
> **Desde el 17-09-2026 y hasta nuevo aviso, esta demo es SÓLO de vibraciones.**
>
> El tanque y su grupo de bombeo están **cerrados por mantenimiento**: no salen
> en el menú, no se leen sus puntos, el asistente se niega a contestar sobre
> ellos y sus pruebas están omitidas. El plan completo —qué se cerró, por qué
> así y cómo se reabre— está en
> [`docs/completados/PLAN-32-VIBRACIONES.md`](docs/completados/PLAN-32-VIBRACIONES.md) §2.
>
> **Las dos reglas de esta rama:**
>
> 1. **El código del tanque NO se modifica.** Se consulta cuanto haga falta —es
>    el módulo maduro y el espejo del que copiar para vibraciones— pero no se
>    edita. Si algo del tanque parece que hay que arreglar, se anota; no se toca.
> 2. **Sus pruebas no se arreglan.** Las que dependen de esa máquina están
>    omitidas con su motivo escrito y su «para reabrir». Una que falle por el
>    cierre se omite igual; una que falle por OTRA cosa sí es un defecto.
>
> **Cerrado no es borrado.** Todo lo del tanque sigue en el árbol, comentado o
> con `.skip`, y cada sitio dice cómo volver. Reabrir es deshacer, no reescribir.
>
> ### Rama `UI-Limpieza1.0` (desde el 22-09-2026): el tanque ya no es «el Tanque»
>
> Nace de `Vibraciones1.0` con una decisión del usuario: **el tanque se piensa
> como otra posible máquina configurada**, no como una instalación aparte. La
> regla de arriba cambia así, y el detalle está en
> [`docs/completados/PLAN-42.5-UI-MAQUINAS-CONFIGURADAS-Y-LIMPIEZA.md`](docs/completados/PLAN-42.5-UI-MAQUINAS-CONFIGURADAS-Y-LIMPIEZA.md) §1:
>
> 1. **El dominio del tanque** (`shared/eva/tanque/`) **sigue sin borrarse**: es
>    la materia prima del tipo `estacion-de-llenado` del Plan 43. Se lee, se
>    puede mover; no se destila en esta rama.
> 2. **Sus vistas y su capa de datos se sustituyen por vistas genéricas de
>    máquina configurada y se borran**, con las pruebas omitidas que sólo ellas
>    justificaban. Borrar va **después** de sustituir, nunca antes. **Hecho el
>    23-09-2026**: no queda ninguna vista del tanque (`views/tanque/` no
>    existe); su fuente en vivo (`EvaProvider`, `evaSource`, `hooks.js`) sí,
>    hasta el Plan 43.
> 3. **Lo que no es de ninguna máquina y nadie importa se borra ya**, con la
>    evidencia en el commit.
>
> ### Tres ramas desde el 23-09-2026
>
> `UI-Limpieza1.0` (Moisés) → `DemoVibraciones4.0` (la de la presentación; no
> se edita, sólo recibe merges) → `AjustesGustavo5.0` (Gustavo, el asistente).
> El día de la demo las dos ramas de trabajo se funden en la de la
> presentación. Quién toca qué, los archivos calientes y cómo sincronizar están
> en [`docs/HANDOFF.md`](docs/HANDOFF.md) §0. Las reglas de este documento
> valen igual en las tres.

> Lo que sigue en este documento describe el proyecto COMPLETO, que es el que
> vuelve al reabrir.

### Empezar aquí

**Sesión nueva:** lee [`docs/HANDOFF.md`](docs/HANDOFF.md) antes que nada. Trae
el estado real —qué funciona, qué está a medias, qué está roto—, las decisiones
ya tomadas con su porqué, y las trampas conocidas. Este archivo dice las
reglas; aquél dice dónde estamos.

**Las cuatro restricciones duras**, en una línea cada una:

| | |
|---|---|
| **Node 24** | Se declara en `.nvmrc` y en los tres `package.json`. **No es 18**: con otra mayor, `npm ci` se niega. Ver §5 |
| **Dependencias** | El backend **sí las tiene** (Fastify, zod, pino, pdfkit…). La regla no es «ninguna» sino **ninguna NUEVA sin pedirla antes** — ver §6 |
| **Sólo LLM local** | `llama-server` por `IA_BASE`. Nada sale a una API de terceros (§2.1) |
| **ICONICS es la única fuente** | De todo dato de sensor de planta. Sin MQTT, sin OPC-UA en el camino, sin event bus (§2.1) |

## 2. No negociables (arquitectura)

Estas decisiones ya se tomaron. No se reabren por conveniencia de una tarea
puntual — si una tarea choca con una de estas, la tarea se replantea, no la
regla.

1. **ICONICS FrameWorX es la única fuente de datos de sensores DE PLANTA, y
   la única fuente de verdad sobre ellos.** No hay MQTT, no hay OPC-UA en el
   camino de datos (el guion suelto `scripts/plc_opcua.py` se borró el
   23-09-2026, Plan 42.5 F5: nunca estuvo conectado), no hay Node-RED, no
   hay event bus. Todo dato de sensor
   de planta entra por `backend/iconics/client.mjs`.

   **La acotación «de planta» es del 03-09-2026 y tiene dueño**
   ([`docs/completados/PLAN-19-MODULARIZACION.md`](docs/completados/PLAN-19-MODULARIZACION.md) §0.1):
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
9. **Sin comodín en CORS.** `CORS_ORIGINS` compara por igualdad exacta; no
   existe `*`.
10. **La agrupación en 4 activos (Tanque, Bombeo, Distribución, Eléctrico) es
    NUESTRA, no del servidor.** Bajo `ac:TDCON/DEMO/SENSORES/` no hay equipos,
    sólo señales sueltas. Si el servidor publica equipos de verdad algún día,
    se sustituye `shared/eva/activos.js` y ninguna vista se entera — pero
    hasta entonces, ese archivo es la única fuente de esa agrupación.
11. **La autenticación está ENCENDIDA, con tres roles jerárquicos**
    (`backend/http/plugins/autenticacion.mjs`, `AUTH_HABILITADA=true` desde el
    21-09-2026). Este punto decía «implementada y APAGADA», y que el tablero
    «todavía no sabe pedir un token»: el Plan 25 resolvió la pantalla de acceso
    y la renovación, y el Plan 35 cerró el resto.

    ```
    administrador  >  operador  >  visualizador
    ```

    **La jerarquía es pura**: un administrador puede todo lo que puede un
    operador, incluido accionar la planta. Vive en `shared/roles.js` —es
    dominio, no HTTP— y la usan el backend para negar y la pantalla para no
    ofrecer lo que va a fallar. La herencia se resuelve **al comprobar, no al
    firmar**: un token con los roles ya expandidos llevaría dentro la jerarquía
    del día en que se emitió.

    **Apagada por defecto sigue siendo lo correcto** para un despliegue que no
    la configure. Lo que cambió es que encenderla ya funciona de punta a punta.

    `REPORTES_SECRETO` (Plan 22 F7) es aparte y sigue igual: sin él los enlaces
    de descarga no caducan, y el arranque lo avisa.

    Desde el Plan 20 F5 la guarda `autenticar` **la aplica el ámbito** donde se
    registran las rutas de API (`app.mjs`), no cada ruta: la llevaban trece de
    treinta y tres, y olvidarla en la siguiente no rompía nada visible.
    `exigirRol` sí sigue declarándose ruta por ruta, que es donde hay criterio
    — y desde el Plan 35 F2 **la lleva toda ruta de API**, con tres exenciones
    declaradas: las sondas de salud, `/api/auth/*` (exigir rol para saber qué
    rol tienes no lo puede cumplir nadie) y `GET /api/reportes`, cuyo control
    de acceso es el **enlace firmado**. Hay una prueba que entra con el rol
    más bajo y falla si alguna ruta nueva le deja pasar.
    `test/rutas/guardas.test.mjs` recorre el inventario real y falla si alguna
    queda fuera.

## 3. Estructura del repo

```
.
├── CLAUDE.md            Este archivo
├── README.md             Arranque, orígenes de datos, pruebas
├── PRODUCT.md             Qué es esto para quién
├── DESIGN.md              Sistema de diseño (color, tipografía, componentes)
├── backend/               Servidor puente hacia ICONICS (Node, Fastify)
│   ├── http/                Mecánica HTTP: router, esquemas Zod, plugins
│   ├── ia/                  Asistente
│   │   ├── indices/           Búsqueda: bm25, documentos, embeddings, manuales
│   │   ├── motor/             Diagnóstico determinista: diagnostico, casos, temporal
│   │   ├── conversacion/      Bucle del modelo: chat, cola, definiciones, herramientas
│   │   ├── herramientas/      Una carpeta por FAMILIA de herramienta del modelo
│   │   ├── evaluacion/        Banco de casos y juez del asistente (Plan 20 F9)
│   │   ├── reporte.mjs        PDF de la conversación (import diferido)
│   │   └── voz.mjs            Dictado (whisper)
│   ├── lib/                  Escritura atómica y candado (Plan 20 F3), diario de
│   │                          accionamientos y enlaces firmados (Plan 22 F3, F7)
│   ├── iconics/              Autenticación OIDC, cliente REST, transporte falso
│   ├── routes/                Traducción HTTP ↔ cliente (una por dominio)
│   └── test/                  vitest: contratos HTTP, esquemas, config
├── react-dashboard/        Frontend React + Vite
│   └── src/
│       ├── Demo-EVA/           Todo lo que sabe de las dos máquinas de planta
│       │   ├── domain/            Puertas (re-export) hacia shared/eva/ — ver §4.2
│       │   ├── data/               Lectura de red: tanque/ (la fuente en vivo), comunes/ y vibraciones/
│       │   ├── views/              Presentación: comunes/, maquina/ (genéricas) y vibraciones/ (del tipo)
│       │   ├── components/         Piezas de presentación de esta demo
│       │   └── three-d/            Maqueta 3D
│       ├── modulos/             Módulos que NO se sirven de ICONICS — ver §4.7
│       │   └── prediccion/         El compresor, por API externa (data/, views/, components/)
│       ├── components/          Kit de UI genérico (no sabe de ICONICS ni de Demo EVA)
│       ├── features/             Módulos verticales (asistente, three-d genérico, data)
│       ├── lib/                  Infraestructura de frontend
│       │   └── api/                Clientes HTTP de planta (apiBase, casosApi, ragApi)
│       ├── theme/                 Tokens de tema (claro/oscuro/Mitsubishi Electric)
│       └── test/                  vitest: por área, espejo de src/
├── shared/                 Dominio puro que usan LOS DOS programas (§2.6, §2.7)
│   └── eva/                  Las dos instalaciones — ver shared/README.md para el mapa completo
│       ├── tanque/             Su catálogo, física, reglas y proyección
│       ├── vibraciones/        Lo que es del TIPO (catálogo, física, reglas) y catalogoDemo.js,
│       │                       la forma de la entrada retirada en el Plan 40 (referencia, no registro)
│       └── comun/              Lo que ninguna posee sola: el registro, la forma
│                               común, umbrales, historia, aprendizaje, casos
├── scripts/                Verificadores (`verificar-*.mjs`) y sondas contra ICONICS real
└── docs/                   Planes (`PLAN-N-*.md`) y backlogs (`BACKLOG-*.md`)
```

Mapas detallados con el porqué de cada archivo: [`shared/README.md`](shared/README.md)
(dominio), [`backend/README.md`](backend/README.md) (servidor),
[`react-dashboard/src/Demo-EVA/README.md`](react-dashboard/src/Demo-EVA/README.md)
(frontend de planta).

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
vieja por conveniencia (p. ej. `react-dashboard/src/Demo-EVA/domain/*.js`
después de que su contenido se movió a `shared/eva/`), la ruta vieja se deja
como una puerta de una línea:

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

- **Dominio** (`shared/`, `Demo-EVA/domain/` como puerta): reglas de negocio,
  puro, se prueba en Node sin red ni DOM.
- **Transporte/datos** (`Demo-EVA/data/`, `backend/ia/indices/`): sabe hacer
  `fetch` o leer el historiador; no decide reglas de negocio, las importa del
  dominio.
- **Presentación** (`components/`, `views/`): sabe de React y de colores; no
  decide bandas ni umbrales, los pide al dominio ya resueltos.

Una vista que calcula una banda de riesgo con su propio `if` está rompiendo
esta capa — la banda se pide a `shared/eva/`, no se recalcula.

### 4.4 Nomenclatura por máquina

Con dos instalaciones (tanque, vibraciones) más lo transversal, el nombre de
archivo/vista se distingue por **máquina**, no por el nombre de la demo:

- `tanque/` — **ya no existe en `views/`** (Plan 42.5 F4, 23-09-2026): sus
  seis vistas se borraron porque el tanque entrará como máquina configurada
  y usará las genéricas de `maquina/` (Plan 43). Queda `data/tanque/` (la
  fuente en vivo) y el dominio en `shared/eva/tanque/`.
- `maquina/` — `PlantaMaquina`, `DetalleMaquina`: para CUALQUIER máquina
  configurada, dirigidas por su `sistema` y su tipo, sin un `if` por máquina
  (Plan 42.5 D1).
- `vibraciones/` — `InicioVibraciones`, `RiesgosVibracion`, `Vibraciones`,
  `Vibraciones3D`. Desde el Plan 40 F2 todas reciben la máquina CONFIGURADA
  que se tiene delante; no hay vista de una vibraciones escrita a mano.
- `comunes/` — lo que no pertenece a una sola máquina (el explorador de
  Assets, Alarmas, Cierre de diagnóstico, Documentación, Predicción). Aquí
  "Eva" en el nombre no es ruido porque no hay máquina que distinguir.

El sufijo "Eva" se elimina cuando la carpeta ya dice la máquina; no aporta
información ahí y sólo la repite.

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

- **Sistema** — una máquina de planta leída por ICONICS. Hoy `tanque`,
  escrito a mano, más **cada máquina configurada** (`datos/maquinas.json`),
  que el backend registra al arrancar y tras cada cambio. **Desde el Plan 40
  no hay máquina de vibraciones escrita a mano**: la de la demo es una
  configurada de tipo `vibraciones`. Se declaran en
  `shared/eva/comun/sistemas.js`, que **no es
  una lista de nombres sino código ejecutable**: cada entrada trae `raices`,
  `puntos()`, `parse()`, `modelo()`, `esHistorizada()` y `cadenciaMs`, todo
  ello dando por hecho que hay tags de ICONICS detrás.
- **Módulo** — una agrupación de más arriba, definida por **su fuente de
  datos**. Hoy `monitoreo` (los dos sistemas de arriba, por ICONICS) y
  `prediccion` (un compresor real, por API externa). Se declaran en
  `shared/modulos.js`.

De ahí sale una regla concreta: **una máquina que no se lee por ICONICS no
entra en `SISTEMAS`.** Meterla obligaría a que cada una de esas funciones
tuviera una rama «ésta no es de ICONICS», que es exactamente el `if` repetido
en cinco archivos que ese registro existe para evitar. Ver
[`docs/completados/PLAN-19-MODULARIZACION.md`](docs/completados/PLAN-19-MODULARIZACION.md) §0.2.

### 4.8 Primero lo mínimo; escalar sólo si se justifica

La solución más pequeña que resuelva el problema **de verdad**, y crecer sólo
con una medición o un incidente delante. No es minimalismo por estética: es que
cada pieza de más hay que mantenerla, y las que se añaden «por si acaso» nadie
las revisa después.

Tres ejemplos de este repo, los tres con su porqué escrito en el código:

- **Sin base de datos** (§2.2): JSON con escritura atómica. Un puñado de
  máquinas no justifica un motor. Se revisa **con medición**, no por intuición.
- **Sin enrutador** en el frontend: `useNavegacion` son ~100 líneas sobre la
  History API. «Una dependencia nueva en el bundle de planta tendría que
  ganarse su sitio con algo más que esto.»
- **Un rótulo, no un nivel de menú** (Plan 33 F10): agrupar nueve vistas en
  tres apartados se resolvió con un separador. Hacerlo anidable habría exigido
  decidir plegado, colapsado y conteo del badge — tres decisiones de chrome
  para el mismo resultado visible.

El corolario práctico: **cuando dudes entre dos diseños, escribe el pequeño y
deja anotado qué mediría para justificar el grande.**

## 5. Pruebas — qué existe y cuándo correrlas

Antes de dar una tarea por terminada, corre lo que toque.

### 5.1 La puerta obligatoria

**Antes de tocar el modelo, el prompt o cualquier herramienta del asistente**,
estas dos tienen que pasar. No son parte de «la tanda»: son la puerta.

```bash
ICONICS_FAKE=true node scripts/verificar-herramientas.mjs   # cada herramienta
ICONICS_FAKE=true node scripts/verificar-chat.mjs           # el bucle completo
```

`ICONICS_FAKE=true` levanta el backend entero —tablero, historiador,
asistente— **sin red a planta y sin `ICONICS_API_BASE`**. Los dos guiones
montan además un `llama-server` falso, así que corren en cualquier máquina.

> **Hoy `verificar-herramientas` reporta 197 correctas y 24 OMITIDAS** (la
> estación de llenado está cerrada, §1). El guion imprime cuántas omitió y por
> qué. Ese verde significa «197 de 221», y está dicho a propósito para que
> nadie lo lea como si hubiera mirado las 221. Trece de las 197 son sobre una
> máquina **configurada** (Plan 39 F0–F2), y también lo imprime; siete más, en
> bloque propio al final, son los reportes por plantilla (Plan 44 F3). Las dos
> últimas omitidas son el catálogo del tanque en `generar_reporte`, que desde
> el Plan 44 F3.5 se dibuja sólo desde el registro y se niega con el cierre.

### 5.2 La tanda completa

```bash
npm run lint       # ESLint: fallos reales + la frontera de shared/ (§2.7)
npm run types      # tsc sobre shared/ con checkJs; no compila nada
npm run verificar  # los 41 verificar-* que corren sin red
```

`npm run verificar` **descubre** la carpeta `scripts/`: un verificador nuevo
entra en la tanda por existir. Lo único enumerado es lo que se excluye, con su
motivo. Hay **44 guiones `verificar-*`**; tres quedan fuera de la tanda
(`todo` es el corredor, `antiguedad-historico` necesita red real y `bundle`
necesita `dist/`).

Las tres corren también en CI (`.github/workflows/ci.yml`) en cuatro trabajos
paralelos, para que el rojo diga DÓNDE sin abrir el registro.

### 5.3 Las suites

```bash
cd backend && npm test          # 433 — contratos HTTP, config, logger, reportes por plantilla
cd react-dashboard && npm test  # 1180 (+20 omitidas) — dominio, vistas, hooks
cd react-dashboard && npm run build && node ../scripts/verificar-bundle.mjs
```

> **La suite de frontend corre con `maxWorkers: 4`, y es deliberado.** Sin ese
> tope fallaba de forma intermitente, y el modo de fallo despistaba: los
> nombres cambiaban en cada tanda y todas pasaban al correrlas solas. Eran
> **timeouts por contención**, no fugas de estado.
>
> **Si vuelve a ponerse intermitente, mira primero SI los fallos dicen `timed
> out`** (entonces es contención) **o son asertos** (entonces es el código). El
> detalle medido está en `HANDOFF.md` §9 y en `vite.config.js`.

### 5.4 Contra planta real

```bash
node --env-file=.env.local scripts/verificar-antiguedad-historico.mjs
```

Sin `--env-file` **falla siempre** con «Falta ICONICS_API_BASE». Es la causa
habitual de verlo en rojo dentro de una tanda, y no es una regresión.

Los **instrumentos de medida** (`scripts/medir-*.mjs`) necesitan los servidores
de IA y **no devuelven código de error**: miden, no afirman. No los metas en
una tanda de `verificar-*`. De su salida salen los `UMBRAL_*` del motor.

### 5.5 Node 24, en un solo sitio

Se declara en `.nvmrc` y los tres `package.json` lo repiten como `engines`.
**No es 18**: con otra mayor, `npm ci` se niega.

El 07-09-2026 CI se cayó por esto sin que nadie tocara CI: un lockfile escrito
por npm 11 y consumido por npm 10. **Un lockfile lo escribe una versión de npm
y lo consume otra**, y `npm ci` hace bien en no improvisar. Si hay que cambiar
de Node, se cambia `.nvmrc` y se regeneran los tres locks **con esa versión**.

### 5.6 Reglas de oro

- Un cambio en `backend/ia/` corre **§5.1** y el verificador de lo que tocó
  (`verificar-diagnostico` si fue el motor, `verificar-documentos` si el índice
  de manuales…).
- Un cambio en `shared/eva/` corre los verificadores de **ambas** instalaciones
  si el archivo es común.
- **En esta rama parte de la suite está OMITIDA a propósito** (29 pruebas de
  frontend y 24 comprobaciones de herramientas). Por eso **un rojo nuevo es un
  defecto de verdad**. Y si una prueba falla por depender del tanque, se omite
  con su motivo — no se arregla tocando esa máquina (§1).

El catálogo completo de los 38 verificadores, con qué protege cada uno, está en
[`docs/HANDOFF.md`](docs/HANDOFF.md) §9.

## 6. Flujo de trabajo con Claude Code

- **Commit por fase.** Cuando un trabajo se divide en fases (planes
  `docs/{completados,por-completar}/PLAN-N-*.md` — un plan se archiva en la
  carpeta que corresponda a su estado, nunca se borra), cada fase se prueba y
  se comitea antes de pasar a la siguiente — nunca un commit gigante al final.
- **No se hace push sin pedirlo explícitamente en ese turno.** Un commit
  autorizado antes no autoriza el siguiente push.
- **Gaps se documentan, no se ocultan.** Si algo queda bloqueado (falta un
  servidor, falta dato real para calibrar), se anota en el plan y en el
  código (`provisional: true`, comentario con el motivo) en vez de fingir que
  quedó resuelto.
- **Antes de mover o renombrar algo que "parece" un duplicado**, confirma
  leyendo la cabecera — este proyecto usa el patrón puerta (§4.2)
  deliberadamente, y no todo lo que comparte nombre es lo mismo dos veces
  (ver `docs/completados/PLAN-17-CERRAR-AUDITORIA.md`, sección de auditoría de
  duplicados).

### 6.1 Cómo se estructura un plan

Un trabajo largo se escribe como `docs/por-completar/PLAN-N-NOMBRE.md`, con:

- una cabecera de **estado** en la primera línea (`F1–F8 completadas · F9 por
  completar`), que se actualiza **en el mismo commit** que la fase;
- **fases numeradas** `F1`, `F2`…, cada una con objetivo, dependencias, riesgos
  y criterios de aceptación;
- al completarse, la fase se reescribe con **lo que de verdad pasó**: qué se
  midió, qué defecto apareció, qué se decidió y por qué. Un plan que sólo diga
  «hecho ✅» no sirve dentro de seis meses.

El plan **se archiva en `docs/completados/` cuando termina, nunca se borra**.
El **42.5** (la UI de las máquinas configuradas y la limpieza del tanque, con
su F6 de ajustes tras mirarlo en planta) se completó y archivó el 23-09-2026.
Vivos hoy: el **33** (modularidad de máquinas), con su F9 —la estación de
llenado como configurada— **bloqueada hasta reabrir** la rama, y el **44**
(reportes por plantilla: ocho tipos de PDF que el asistente compone desde
`backend/ia/reportes/`, escrito el 23-09-2026 con su F0 hecha). El
**42** (verificar una bandera que nunca cambió sin forzarla, desde B13) se
escribió y se completó el 22-09-2026 por la tarde: midió primero cómo registra
el historiador una constante y de ahí salió el criterio `registrada-constante`
del sondeo. El
**41** (cerrar Vibraciones 1.0) se escribió y se completó el 22-09-2026 tras
sondear los demás contra el código, y con él se archivaron el **32**, el **37**,
el **38** y el **40**; su §0 dice qué se dio por pendiente y ya estaba hecho, y
sus fases qué se midió para cerrar cada una (incluida la F4, cerrada **sin
vista** porque el Alarm Server da 500 y las banderas nunca alarmaron).

Archivados antes: el **34**, el **36**, el **39**, y el mismo 22-09 el **19**
(modularización: F4/F5/F7 dependían de una API externa que no llegó) y el **8**
(Demo EVA: sólo quedaba `PROVISIONALES`). Los dos últimos **se archivaron sin
borrarse porque los cita código vivo**. El **13** se borró: no lo citaba nadie.
Ver `HANDOFF.md` §5 para cuál sigue.


### 6.2 Qué NO hacer

- **No añadir dependencias.** Ni al backend ni al frontend. Si una parece
  necesaria, **se pide antes** con el motivo y qué se descartó. Hay 15 en el
  backend y todas tienen su porqué; la 16 no entra sola.
- **No refactorizar fuera del alcance pedido.** Si ves algo mejorable, se
  anota en `docs/BACKLOG-*.md`; no se arregla de paso. Un commit que mezcla el
  trabajo pedido con tres mejoras no se puede revertir a medias.
- **No tocar el código del tanque** mientras dure esta rama (§1).
- **No subir un techo** —de bundle, de timeout, de límite— para callar un rojo.
  Se mide primero, y si se sube, se escribe con qué medición.
- **No "arreglar" una prueba omitida.** Las que están con `.skip` u `omitir()`
  llevan su motivo escrito; una que falle por el cierre se omite igual (§5.6).
- **No dar por buena una prueba que pasa sin haberla visto fallar.** Si es
  importante, rómpela a propósito una vez y comprueba que la caza.

## 7. Referencias

- **[`docs/HANDOFF.md`](docs/HANDOFF.md) — estado real, decisiones tomadas,
  trampas conocidas y cómo verificar. Lo primero que lee una sesión nueva.**
- [`README.md`](README.md) — arranque, variables de entorno, orígenes de datos
- [`PRODUCT.md`](PRODUCT.md) — producto, usuarios, posicionamiento
- [`DESIGN.md`](DESIGN.md) — sistema de diseño
- [`shared/README.md`](shared/README.md) — mapa completo del dominio compartido
- [`backend/README.md`](backend/README.md) — variables de entorno del servidor
- [`docs/BACKLOG-BACKEND.md`](docs/BACKLOG-BACKEND.md), [`docs/BACKLOG-FRONTEND.md`](docs/BACKLOG-FRONTEND.md) — deuda conocida y priorizada
- [`docs/completados/PLAN-17-CERRAR-AUDITORIA.md`](docs/completados/PLAN-17-CERRAR-AUDITORIA.md) — última auditoría de arquitectura completa
