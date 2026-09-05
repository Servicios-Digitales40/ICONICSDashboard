# CLAUDE.md — no negociables de este proyecto

Este archivo es la referencia rápida antes de tocar código. Si algo aquí
contradice lo que ves en un archivo concreto, **el archivo tiene razón** —
avisa y se corrige este documento, no al revés. Los porqués largos viven en
las cabeceras de cada archivo y en `docs/`; aquí sólo el resumen accionable.

## 1. Qué es esto

Puente Node hacia ICONICS FrameWorX + un dashboard React (Demo EVA) que
enseña dos instalaciones de planta (un sistema de agua y un sistema de
vibraciones) y un asistente de IA que responde sobre ellas. Detalle de
producto en [`PRODUCT.md`](PRODUCT.md), de arranque en [`README.md`](README.md).

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
9. **Sin comodín en CORS.** `CORS_ORIGINS` compara por igualdad exacta; no
   existe `*`.
10. **La agrupación en 4 activos (Tanque, Bombeo, Distribución, Eléctrico) es
    NUESTRA, no del servidor.** Bajo `ac:TDCON/DEMO/SENSORES/` no hay equipos,
    sólo señales sueltas. Si el servidor publica equipos de verdad algún día,
    se sustituye `shared/eva/activos.js` y ninguna vista se entera — pero
    hasta entonces, ese archivo es la única fuente de esa agrupación.
11. **Autenticación existe como decorador sin exigir nada todavía**
    (`backend/http/plugins/autenticacion.mjs`, `AUTH_HABILITADA=false`). No se
    activa como efecto colateral de otra tarea — es su propio plan (ver G11 en
    `docs/PLAN-17-CERRAR-AUDITORIA.md`).

    Desde el Plan 20 F5 la guarda `autenticar` **la aplica el ámbito** donde se
    registran las rutas de API (`app.mjs`), no cada ruta: la llevaban trece de
    treinta y tres, y olvidarla en la siguiente no rompía nada visible.
    `exigirRol` sí sigue declarándose ruta por ruta, que es donde hay criterio.
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
│   ├── lib/                  Escritura atómica de JSON y candado por ruta (Plan 20 F3)
│   ├── iconics/              Autenticación OIDC, cliente REST, transporte falso
│   ├── routes/                Traducción HTTP ↔ cliente (una por dominio)
│   └── test/                  vitest: contratos HTTP, esquemas, config
├── react-dashboard/        Frontend React + Vite
│   └── src/
│       ├── Demo-EVA/           Todo lo que sabe de las dos máquinas de planta
│       │   ├── domain/            Puertas (re-export) hacia shared/eva/ — ver §4.2
│       │   ├── data/               Lectura de red, por máquina: tanque/, vibraciones/, comunes/
│       │   ├── views/              Presentación, por máquina: tanque/, vibraciones/, comunes/
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
│       ├── vibraciones/        Lo mismo, para la otra máquina
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

- `tanque/` — `InicioTanque`, `PlantaTanque`, `RiesgosTanque`, `ControlesTanque`,
  `MaquetaTanque3D`, `DetalleActivo` (ya es exclusivo del tanque por
  contenido, no necesita el sufijo).
- `vibraciones/` — `InicioVibraciones`, `RiesgosVibracion`, `Vibraciones`,
  `Vibraciones3D`, `ControlesVibraciones`.
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

- **Sistema** — una máquina de planta leída por ICONICS. Hoy `tanque` y
  `vibraciones`. Se declaran en `shared/eva/comun/sistemas.js`, que **no es
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
[`docs/PLAN-19-MODULARIZACION.md`](docs/PLAN-19-MODULARIZACION.md) §0.2.

## 5. Pruebas — qué existe y cuándo correrlas

Antes de dar una tarea por terminada, corre lo que toque de esta lista.

**En la raíz** (Plan 20 F1 y F2 — miran el árbol entero):
```bash
npm run lint       # ESLint: fallos reales + la frontera de shared/ (§2.7)
npm run types      # tsc sobre shared/ con checkJs; no compila nada
npm run verificar  # la tanda completa de verificar-* que corre sin red
```
> Las tres corren también en CI (`.github/workflows/ci.yml`) en cuatro trabajos
> paralelos, para que el rojo diga DÓNDE sin abrir el registro. `npm run
> verificar` **descubre** la carpeta `scripts/` en vez de llevar una lista: un
> verificador nuevo entra en la tanda por existir, y lo único enumerado es lo
> que se excluye, con su motivo.

**Frontend** (`react-dashboard/`):
```bash
npm test              # vitest — dominio, componentes, hooks
npm run design:detect  # impeccable — antipatrones de diseño/CSS
npm run build           # confirma que el bundle sigue compilando
```

**Backend** (`backend/`):
```bash
npm test               # vitest — contratos HTTP (esquemas Zod), config, logger
```

**Verificadores de extremo a extremo** (`scripts/`, sin red real — levantan un
ICONICS y un llama-server falsos):
```bash
node scripts/verificar-backend.mjs          # contrato HTTP completo
node scripts/verificar-herramientas.mjs      # cada herramienta del asistente
node scripts/verificar-chat.mjs               # el bucle de conversación
node scripts/verificar-diagnostico.mjs        # el motor: las 4 fuentes y su puntuación
node scripts/verificar-documentos.mjs          # índice de manuales / BM25
node scripts/verificar-casos.mjs                # índice de casos previos
node scripts/verificar-casos-cierre.mjs          # cierre de diagnóstico (form y chat)
node scripts/verificar-temporal.mjs               # la 4ª fuente (tendencia)
node scripts/verificar-calibracion.mjs             # sensibilidad de umbrales al tamaño de corpus
node scripts/verificar-riesgos.mjs                  # reglas de riesgo del tanque
node scripts/verificar-riesgos-vibracion.mjs         # reglas de riesgo de vibraciones
node scripts/verificar-pronostico.mjs                 # desgaste acumulado
node scripts/verificar-voz.mjs                          # dictado (whisper falso)
node scripts/verificar-manos-libres.mjs                  # ciclo de voz completo
node scripts/verificar-transporte-falso.mjs                # ICONICS_FAKE sirve las dos máquinas
node scripts/verificar-modulos.mjs                         # los dos módulos no cruzan fuentes (§4.7)
node scripts/verificar-catalogo.mjs                         # el catálogo declarado es coherente
node scripts/verificar-instrucciones.mjs                     # el prompt no se contradice con el registro
node scripts/verificar-evaluacion.mjs                         # el evaluador del asistente juzga como debe
```
> Los tres últimos son del Plan 20. `verificar-catalogo.mjs` admite además
> `--real` para contrastar contra el árbol de ICONICS de verdad — ese modo sí
> necesita red y `--env-file`, y por eso el guion sin banderas no la toca.

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
node --env-file=.env.local scripts/medir-asistente.mjs    # el banco de 20 casos contra el modelo real
```
> No afirma nada, **mide**: de su salida salen los `UMBRAL_*` de
> `ia/motor/diagnostico.mjs`. No es un verificador y no devuelve código de
> error — no lo metas en una tanda de `verificar-*`. Su hermano sí lo es:
> `verificar-calibracion.mjs` prueba el MECANISMO sin servidores, sobre un
> corpus sintético. Separarlos es lo que impide poner un umbral a ojo y
> después escribir la prueba que lo confirme.

**Tras compilar el frontend:**
```bash
node scripts/verificar-bundle.mjs   # la pila 3D no viaja en el chunk de arranque
```
> **Hoy pasa** (medido el 02-09-2026: `index` 92,21 KB sobre 170,
> `vendor` 203,26 KB sobre 210). Este documento decía que seguía en rojo
> —«161,84 KB sobre un techo de 90»—; eso describía a `vendor`, y dejó de
> ser cierto el 31-ago-2026, un día antes de escribirse esta línea.
>
> El techo de `vendor` se subió entonces de 90 a 210 KB al instalar TanStack
> Query, con la medición y el motivo en la cabecera del propio guion. Roza la
> regla de «no se sube el techo para callarlo», así que conviene saberlo:
> quedó documentado y razonado, no escondido, pero `vendor` va hoy a 203 de
> 210 y el margen es de 7 KB. Ver `docs/BACKLOG-FRONTEND.md` F5, que sigue
> describiendo la situación anterior.

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
- [`docs/PLAN-17-CERRAR-AUDITORIA.md`](docs/PLAN-17-CERRAR-AUDITORIA.md) — última auditoría de arquitectura completa
