# HANDOFF — dónde estamos y cómo seguir

**Fecha:** 21-09-2026 · **Rama viva:** `Vibraciones1.0` · **HEAD:** el último
commit del Plan 36 (el de documentos); `git log -1` lo dice.

Este documento es lo primero que lee una sesión nueva. `CLAUDE.md` dice las
**reglas**; esto dice el **estado**: qué funciona, qué está a medias, qué se
decidió ya y qué trampas están medidas.

> **Lo marcado `POR CONFIRMAR` no se ha podido verificar contra el repo.** No
> se da por cierto: se pregunta antes de apoyarse en ello.

---

## 1. Estado actual

### La rama y su regla

Desde el **17-09-2026** esta demo es **sólo de vibraciones**. El tanque y su
grupo de bombeo están **cerrados por mantenimiento**: fuera del menú, sin
sondeo, el asistente se niega a contestar por ellos y sus pruebas están
omitidas con su motivo.

**Las dos reglas, que no son negociables mientras dure la rama:**

1. **El código del tanque NO se modifica.** Se consulta —es el módulo maduro y
   el espejo del que copiar— pero no se edita.
2. **Sus pruebas no se arreglan.** Una que falle por el cierre se omite igual;
   una que falle por OTRA cosa sí es un defecto.

Cerrado **no es borrado**: todo sigue en el árbol y cada sitio dice cómo
volver. El detalle está en `PLAN-32-VIBRACIONES.md` §2.5.

### Qué funciona (verde, medido hoy)

| | |
|---|---|
| Suite de frontend | **1053** pruebas · 29 omitidas |
| Suite de backend | **377** pruebas |
| Verificadores | **los 41** de `npm run verificar` |
| `verificar-herramientas` | **169** correctas · **22 omitidas** (cierre) |
| Lint y types | limpios |
| Bundle | `index` 318 KB / 450 · `vendor` 269 / 330 (el editor del Plan 36 entra diferido) |

Funcionalmente: el tablero de vibraciones (73 puntos en vivo), el asistente con
sus 26 herramientas, el motor de diagnóstico determinista, el RAG documental,
los casos previos, el transporte falso (`ICONICS_FAKE=true`), el CRUD de
máquinas configuradas con su comprobación contra ICONICS, y —desde el Plan 36—
**el alta y la edición de una máquina marcando los tres árboles de ICONICS**
desde `Planta › Configuración`.

### Qué está a medias

**El Plan 33 no se ha visto correr en el navegador.** Está probado con la suite
y ejercido por `curl` contra el backend real, **no observado en pantalla**. El
Plan 36 sí: el usuario dio de alta `vib-motor-03` contra planta el 21-09-2026 y
eso destapó tres defectos de la ficha, ya corregidos
(`PLAN-36` §4.1). El editor sólo lo ha usado quien lo escribió y quien lo pidió;
una segunda vuelta con otra persona sigue pendiente.

**La máquina de vibraciones tiene OCHO vistas, no nueve.** Falta
**Historización**, y no es reubicar sino construir: depende del historiador,
que hoy devuelve cero (ver §6).

**«Casos previos» sale vacío** en vibraciones: hay 13 casos y **ninguno** es
suyo (11 del tanque, 2 de «grupo de bombeo»). No es un defecto de la vista, es
la foto real del módulo.

### Qué está roto

**El historiador de vibraciones devuelve 0 muestras.** Ocho claves probadas
—tres `vRMS`, `aRMS`, `DKW` y tres del variador— dan **0 muestras y
`tramosFallidos: 1`** en 6 h y en 24 h. El tanque, en el mismo instante,
devuelve 86.

**Es el bloqueante real del objetivo de la rama**, y está por encima de
cualquier fase pendiente del Plan 33.

---

## 2. Arquitectura en resumen

```
ICONICS FrameWorX  (REST · OIDC · certificado autofirmado)
      │
      ▼
backend/iconics/client.mjs ──── fakeClient.mjs  (ICONICS_FAKE=true)
      │   readPoint(s) · readHistory · browse · search
      │   writePoint(s) · readAlarmHistory · acknowledgeAlarms
      ▼
backend/routes/*.mjs   (13 archivos · 46 endpoints)
      │
      ▼
shared/   dominio puro — sin React, sin fetch (CLAUDE.md §2.7)
      │
      ▼
react-dashboard/src/   React + Vite
```

### Archivos que hay que conocer antes de tocar nada

| Archivo | Por qué importa |
|---|---|
| `shared/eva/comun/sistemas.js` | **El registro.** No es una lista: cada entrada declara `raices`, `puntos()`, `parse()`, `modelo()`, `estado()`, `series{}`. Valida al cargar y **lanza** |
| `shared/eva/comun/estadoMaquina.js` | La forma común de estado que comparten las máquinas |
| `shared/eva/comun/construirSistema.js` | De configuración a entrada del registro (Plan 33 F3) |
| `shared/eva/tipos/vibraciones.js` | El **tipo**: lo que vale para cualquier motor con SM 1281 |
| `backend/ia/motor/diagnostico.mjs` | El motor determinista. **El LLM no lo toca** |
| `backend/ia/herramientas/` | Siete carpetas, una por familia. **No es un archivo único** |
| `backend/ia/conversacion/definiciones.mjs` | Los esquemas de las 26 herramientas |
| `backend/ia/conversacion/intencion.mjs` | Acota el catálogo por intención (§8) |
| `react-dashboard/src/app/routes/routes.jsx` | Registro de rutas: el menú se deriva de aquí |
| `react-dashboard/src/Demo-EVA/data/comunes/evaSource.js` | **El sondeo.** Arranca por conteo de referencias (§8) |

### Tres palabras que no se pueden intercambiar

- **MÓDULO** — agrupación por **fuente de datos** (`shared/modulos.js`). Hoy
  `monitoreo` (ICONICS) y `prediccion` (API externa).
- **SISTEMA** — una **máquina** de planta (`sistemas.js`). Hoy `tanque` y
  `vibraciones`.
- **TIPO** — de qué **clase** es una máquina (`shared/eva/tipos/`). Sus reglas,
  su física, su norma.

---

## 3. Decisiones tomadas y su razón

### Arquitectura (`CLAUDE.md` §2, no se reabren)

| Decisión | Razón |
|---|---|
| **ICONICS única fuente de planta** | Sin MQTT, sin OPC-UA, sin event bus. Acotado el 03-09: Predicción usa otra fuente y **la declara**, sin mezclar jamás |
| **Sin base de datos** | JSON con escritura atómica y candado. Un puñado de máquinas no justifica un motor |
| **El código puntúa, el modelo redacta** | El motor es determinista y reproducible. El LLM narra un resultado **ya calculado** |
| **La ausencia de dato nunca se disfraza de cero** | Un valor que no llegó es un hueco con motivo, no un 0 |
| **No se inventa lo que falta** | Un servidor sin una pieza se niega y dice qué falta; no degrada en silencio |
| **`shared/` es dominio puro** | Sin React ni fetch. Se prueba en Node sin arrancar nada |

### Plan 33 — modularidad de máquinas

| Decisión | Razón |
|---|---|
| **La configuración alimenta el registro, no lo sustituye** | ~100 importaciones de `SISTEMAS` no cambian, y la validación que lanza sigue lanzando |
| **El TIPO es código; la MÁQUINA es configuración** | Las reglas son deterministas y el LLM no las toca. Un tipo persistido apuntaría a código por nombre y añadiría un fallo nuevo |
| **`historyVerified` arranca en `false`** | **Medido**: el servidor contesta que sí y devuelve la serie de OTRA señal. Dos casos en el tanque, uno en vibraciones |
| **Escritura deny-by-default** | ICONICS no publica esa capacidad en `browse`. Lo que no se declara, no se escribe |
| **`UNKNOWN` ≠ `INVALID`** | «No se pudo mirar» y «ya no existe» se ven igual desde fuera. Colapsarlos daría de baja la planta en un corte de red |
| **No se añaden herramientas al asistente** | Con 26, cada una es una elección que un modelo pequeño puede fallar |

### Del cierre de la estación de llenado

**`SISTEMA_IDS` no se filtró.** Esa lista hace dos trabajos: valida esquemas Zod
y llena selectores. Filtrarla habría dejado los **11 casos del tanque** con un
`sistema` que el backend no reconoce. **Ocultar una máquina no puede invalidar
su historia.** De ahí `SISTEMAS_EN_SERVICIO`, aparte.

**El cierre es una guarda, no sólo el prompt.** `resolverSistema()` niega toda
herramienta sobre una máquina cerrada. El motivo está medido: el 4B abrió **6
de cada 6** narraciones desobedeciendo su instrucción. Dejar el cierre en manos
de una frase del prompt sería confiar en lo que acababa de fallar.

---

## 4. Alternativas descartadas

**TypeScript.** Se usa **JSDoc + `checkJs`** sobre JavaScript: `npm run types`
corre `tsc -p jsconfig.json` y **no compila nada**. Da comprobación de tipos en
`shared/` sin paso de build ni `.d.ts`. No se ha propuesto migrar.

**Un enrutador en el frontend.** `useNavegacion` son ~100 líneas sobre la
History API. Su cabecera lo dice: «una dependencia nueva en el bundle de planta
tendría que ganarse su sitio con algo más que esto». El Plan 33 F6 confirmó que
ni siquiera hacía falta para direccionar máquinas: los parámetros ya viajan en
la query string.

**Vector DB.** `CLAUDE.md` §2.2: los índices son cachés JSON (BM25 +
embeddings), no un motor externo.

> **Qdrant, SQLite y fine-tuning**: no hay rastro de que se evaluaran. El
> usuario confirmó que los mencionó **como ejemplo**. No se documentan como
> descartados para no inventarles un porqué.

---

## 5. Trabajo en curso y próximos pasos

### Ramas

`Vibraciones1.0` es **la única viva**. Está **393 commits por delante de
`main`**, y `origin/Vibraciones1.0` coincide con el HEAD local —el trabajo está
en el remoto—.

Hay **13 ramas locales y 24 remotas**, todas anteriores. `POR CONFIRMAR` si
alguna sigue en uso; ninguna se ha tocado en este trabajo.

### Los planes vivos

**`PLAN-33-MODULARIDAD-MAQUINAS.md`** — F1–F8 y F10 completas. Queda **F9**
(estación de llenado como máquina configurada), **bloqueada por la rama**: no
se puede hacer sin tocar el código del tanque.

**`PLAN-34-MAQUINAS-DESDE-EL-ARBOL.md`** — F0–F4 completas. Queda **F5**
(retirar `vibraciones.js` como catálogo), que sólo tiene sentido cuando una
máquina configurada haga todo lo que hace el catálogo.

**`PLAN-32-VIBRACIONES.md`** — F1 completa. Quedan F2–F6.

**`PLAN-36-CONFIGURAR-DESDE-EL-ARBOL.md`** está en `docs/completados/`: F1–F3
hechas, **pendiente de verse en el navegador**.

### Próximos pasos, por prioridad

**0 · Seguir usando la pantalla del Plan 36 contra planta.** La primera vuelta
(21-09-2026) destapó tres defectos de la ficha en una hora de uso; conviene una
segunda: editar una máquina para quitar variables, emparejar a mano un tag de
`Jaritza\L1`, y sondear después de editar. §9 dice cómo arrancar.

**1 · Plan 32 F2 — desbloquear el historiador.** Por qué el grupo `DEMO 3`
devuelve 0 muestras: si dejó de registrar, o si la ruta cambió como en el
incidente B10. **Bloquea todo lo demás** de esta lista.

**2 · Plan 32 F3 — las señales en pantalla.** Reutilizar `GraficaHistoria` y
`SelectorRango`, que ya son genéricos. Con esto la máquina tendría su novena
vista (Historización).

**3 · Plan 32 F4 — que el diagnóstico vea.** `necesita` en las 8 reglas que no
lo declaran, **factor de cresta** (`aPeak/aRMS`, coste cero: las dos medidas ya
se leen) y normalizar por rpm.

**4 · Plan 32 F5 — RAG y casos.** `terminosManual` en las causas de vibraciones
para alcanzar los **47 fragmentos de la ISO 20816-3 que ya están indexados**.

**5 · Ver el Plan 33 en el navegador.** Está probado, no observado.

**6 · Plan 32 F6 — índice de sinónimos.** Que el asistente entienda «el apoyo
del motor» como el tanque entiende «la bomba». Es **B3 del backlog**.

---

## 6. Problemas abiertos y deuda técnica

### Bloqueantes

**El historiador de vibraciones no devuelve nada.** 0 muestras,
`tramosFallidos: 1`. Sin esto no hay Historización, ni `firmaTemporal`, ni
pronóstico.

### Conocidos y declarados

| Problema | Estado |
|---|---|
| **Autenticación ENCENDIDA** | `AUTH_HABILITADA=true` desde el 21-09-2026 (Plan 35 F4). Tres roles con jerarquía —`administrador > operador > visualizador`—, rol mínimo en las 37 rutas y el tablero pidiendo credenciales. Esta fila decía que el tablero «no sabe pedir token»: el Plan 25 lo resolvió y nadie actualizó el handoff |
| **Umbrales provisionales** | Las bandas del tanque son «estimaciones nuestras para un sistema de agua genérico», no confirmadas por quien opera |
| **Señales sin histórico** | `aPeak_S1` (vibraciones) y `cargaMotor` + `eficienciaEnergetica` (tanque) **devuelven la serie de otra señal, sin dar error** |
| **Diagnóstico de rodamientos apagado** | `MonState_e_f_BPFO/BPFI/FTF` en posición 0. Es configuración del SM 1281, no código |
| **Sin geometría de chumaceras** | S2 y S3 declaran `rodamiento: null`. Sin referencia no hay frecuencias de defecto en dos de tres apoyos |
| **El historiador rechaza una carpeta con `\` final** | `browse` de `hda:\Configuration\DEMO_VIBRACIONES` responde; la misma ruta con contrabarra final da **500 sin detalle** (medido 21-09-2026). El catálogo escrito a mano la lleva (`GRUPO_HISTORIADOR`). La pantalla y el descubridor la quitan (`normalizarRaizHistorica`) |
| **Una máquina configurada NO lee alarmas ni estado de sensor** | Ya diagnostica —el Plan 34 F3 reconstruye su dominio desde los roles— pero esas dos piezas no son roles del tipo, así que van vacías y se declara. Se recogen en la F4 de ese plan |
| **10 herramientas sin índice de sinónimos** | B3 del backlog. Resuelven por máquina desde F7, pero vibraciones no tiene sinónimos propios |
| **Janitza da mala calidad** | En 16 de 18 tags |

### Nota sobre `datos/`

**`datos/` está en `.gitignore`.** `datos/maquinas.json` —las máquinas
configuradas— **no viaja con el repo**. Una sesión nueva verá la pantalla de
Configuración **vacía** hasta ejecutar el generador (§9).

---

## 7. Entorno externo

> **Sólo nombres de variables y para qué sirven. Ningún valor.** Los valores
> están en `.env.local`, que no se versiona.

### Los tres servicios

| Servicio | Variable | Nota |
|---|---|---|
| **ICONICS FrameWorX** | `ICONICS_API_BASE` | REST + OIDC. **Certificado autofirmado**: un `curl` sin `-k` devuelve 000 y parece que no hay servidor. Lo hay |
| **llama-server** (LLM local) | `IA_BASE` | Único modelo de lenguaje. Nada sale a una API de terceros |
| **Embeddings** | `IA_EMBEDDING_BASE` | Opcional: sin él la búsqueda cae a BM25 solo |
| **Whisper** (dictado) | `IA_WHISPER_BASE` | Opcional |

> **Qué modelo y qué hardware corren hoy: `POR CONFIRMAR`.** El plan que lo
> documentaba quedó fuera de alcance por decisión del usuario.

### Variables por función

**ICONICS** — `ICONICS_API_BASE`, `ICONICS_USERNAME`, `ICONICS_PASSWORD`,
`ICONICS_POINT_NAME`, `ICONICS_FAKE` (transporte simulado, **nunca en
producción**), `ICONICS_READ_ONLY` (bloquea toda escritura).

**IA** — `IA_BASE`, `IA_MODELO`, `IA_MODELOS`, `IA_MAX_PASOS` (cuántas rondas
de herramientas), `IA_MAX_TOKENS`, `IA_TIMEOUT_MS`, `IA_TURNOS`,
`IA_PROGRESO_MS`, `IA_DOCS_DIR` (carpeta de manuales del RAG),
`IA_EMBEDDING_BASE`, `IA_EMBEDDING_MODELO`, `IA_WHISPER_BASE`,
`IA_WHISPER_IDIOMA`, `IA_WHISPER_TIMEOUT_MS`, `IA_REPORTES_DIR`,
`IA_REPORTES_MAX_DIAS`, `IA_BACKLOG_CHAT_DIR`, `IA_CACHE_*`.

**Seguridad** — `AUTH_HABILITADA`, `AUTH_SECRETO`, `AUTH_USUARIOS`,
`AUTH_MINUTOS`, `REPORTES_SECRETO` (sin él los enlaces no caducan, y el
arranque lo avisa), `CORS_ORIGINS` (**igualdad exacta, sin comodín**),
`CONNECT_ORIGINS`, `FRAME_ANCESTORS`, `TRUST_PROXY`, `RATE_LIMIT_*`.

**Persistencia** — `MAQUINAS_RUTA` (las máquinas configuradas),
`CUADERNO_RUTA`, `DIARIO_ACCIONAMIENTOS`, `DIARIO_CONVERSACIONES`,
`DIARIO_DIAGNOSTICOS`, y sus `_DIAS` / `_MAX_BYTES`.

**Historiador y caché** — `HISTORY_CACHE_*`, `HISTORY_CONCURRENCIA`,
`HISTORY_MAX_PAGINAS`, `HISTORY_MAX_MS`, `BATCH_CACHE_TTL_MS`.

**Servidor** — `PORT`, `NODE_ENV`, `LOG_LEVEL`, `STATIC_DIR`, `APP_VERSION`,
`PLANTA_TZ`, `UPSTREAM_TIMEOUT_MS`, `WRITE_CONFIRM_*`, `RAG_UPLOAD_ENABLED`,
`DEFAULT_*`.

**TLS** — `NODE_EXTRA_CA_CERTS`, `NODE_TLS_REJECT_UNAUTHORIZED` (por eso el
backend **no arranca con `NODE_ENV=production`** si está puesto).

---

## 8. Comportamientos del modelo y trampas conocidas

### Del modelo

**No obedece una instrucción que compita con una plantilla cercana.** Medido:
el narrador abrió **6 de cada 6** respuestas con «no pude consultar los
manuales» pese a que su instrucción lo prohibía, porque la plantilla que tenía
más a mano decía eso. **La corrección no fue insistir, fue decirle con qué
EMPEZAR.** Resultado: 0 de 6.

**Corolario:** una regla que importa se pone en el **código**, no en el prompt.
Por eso el cierre de una máquina es una guarda en `resolverSistema()`.

**Un modelo pequeño no encadena bien.** Pedirle «vuelve a llamar añadiendo
`sistema=...`» no funciona: reintenta con otro nombre o se rinde. Se arregla
**no necesitando el reintento**.

**El catálogo de herramientas se acota por intención.** 26 herramientas son
~8 650 tokens que viajan en cada llamada; con el prompt, ~14 330 fijos.
`intencion.mjs` reduce a 4-6 **por reglas sobre el texto, nunca preguntándole
al modelo**. Ante la duda entrega el catálogo completo: cerrar de más cuesta
una respuesta peor, abrir de más sólo cuesta la optimización.

### Del código

**El sondeo arranca por conteo de referencias, NO al montar una vista.**
Cualquier componente siempre montado que pida datos los pide **en todas las
pantallas**. Ha revivido el sondeo de una máquina cerrada **dos veces**: el
contador de alarmas del Topbar (31-08) y el badge de hallazgos (17-09). Las dos
veces la prueba seguía verde porque miraba lo que se **pinta**, no lo que se
**suscribe**.

**`hda:` es el ARCHIVO, `ac:` es el VALOR EN VIVO.** Son nombres distintos y
**no derivan uno del otro**. Confundirlos da 500, no un error que se explique.
El 09-09 una reorganización rompió el histórico de 12 de 13 ramas del tanque
por esto.

**Las carpetas de `hda:` NO terminan en `\`; las de `ac:` SÍ terminan en `/`.**
Una regla «carpeta = termina en separador» valía para un árbol y rompía el
otro. En `shared/eva/comun/arbolIconics.js` la carpeta del historiador se
define por exclusión —lo que no es tag es carpeta— y es lo que usan la
pantalla, el descubridor y el fake. Y cada carpeta `ac:` cuelga un
`.Attributes` que no es ni carpeta ni señal: se filtra (`esNodoDeSistema`).

**El transporte falso devuelve cualquier punto que le pidan.** Contra
`ICONICS_FAKE=true` una configuración inventada sale `VALID`, y es correcto:
para ese servidor esos puntos existen. Tiene además un `CAOS.ausente`
aleatorio, así que **afirmar un veredicto contra el falso produce pruebas
intermitentes**.

**vitest 4 eliminó `poolOptions`.** Escrito a la manera de vitest 3 **se ignora
en silencio**. Se perdió una vuelta entera por eso.

**El `pkill` puede no matar el backend que crees.** Se perdieron tres
mediciones concluyendo «mi arreglo no funciona» cuando el puerto seguía
sirviendo código viejo. **Levanta un puerto propio para medir.**

### Incidentes con nombre

| Fecha | Qué pasó |
|---|---|
| 07-09 | CI cayó sin que nadie tocara CI: lockfile escrito por npm 11, consumido por npm 10 |
| 09-09 | Reorganización del árbol rompió el histórico de 12 de 13 ramas (`ac:` vs `hda:`) |
| 31-08 y 17-09 | El sondeo del tanque revivido dos veces desde componentes de chrome |
| 17-09 | `poolOptions` ignorado en silencio; la suite intermitente por contención, no por estado |
| 18-09 | `aviso` existe en **dos familias** con ámbitos distintos: indexar roles por clave colapsaba una sobre otra en silencio |
| 18-09 | El dictado leía `location.hash` en una app que usa History API: **el vocabulario no se elegía nunca** |
| 18-09 | `.omit({id:true})` descartaba el campo **en silencio**: un `PATCH` con `id` devolvía 200 sin cambiar nada |

---

## 9. Cómo verificar que todo funciona

### Arranque sin red ni planta

```bash
cd backend && ICONICS_FAKE=true node server.mjs   # sin .env.local
cd react-dashboard && npm run dev                  # tablero en :5173
```

`ICONICS_FAKE=true` sirve las dos máquinas —las señales del tanque y los 73
puntos de vibraciones con sus contadores de alarma— sin `ICONICS_API_BASE`.

> `npm start` del backend es `node --env-file=../.env.local server.mjs`, así
> que **necesita ese archivo**. Para arrancar sin él, invoca `server.mjs`
> directamente como arriba.

### La puerta antes de tocar modelo o herramientas

```bash
ICONICS_FAKE=true node scripts/verificar-herramientas.mjs
ICONICS_FAKE=true node scripts/verificar-chat.mjs
```

**Criterio de éxito:** `verificar-herramientas` imprime **169 correctas y 22
omitidas**. Las omitidas son del cierre y el guion las cuenta a propósito.

### La tanda completa

```bash
npm run lint && npm run types && npm run verificar
cd backend && npm test
cd react-dashboard && npm test
```

**Criterio de éxito, medido el 21-09-2026:**

| | Esperado |
|---|---|
| `npm run verificar` | **Los 41 pasaron** |
| Backend | **377 passed** |
| Frontend | **1053 passed · 29 skipped** |
| Lint y types | sin salida |

**Un rojo nuevo es un defecto de verdad**: lo del cierre ya está omitido.

### Dar de alta la máquina de vibraciones

`datos/maquinas.json` **no viaja con el repo** (`.gitignore`). Hay dos caminos.

**Desde la pantalla (Plan 36):** con el backend arrancado —vale con
`ICONICS_FAKE=true`— entra como administrador, `Planta › Configuración ›
Nueva máquina`, y teclea las tres raíces:

```
ac:TDCON/DEMO_VIBRACIONES/Vibraciones/
hda:\Configuration\DEMO_VIBRACIONES
ae:/DEMO VIBRACIONES
```

Explorar, marcar `S1` (sus 26 variables quedan marcadas), quitar lo que no
sea de la máquina, rellenar id y PLC, guardar. Después, en la ficha, «Sondear
sus series» para ganar la verificación.

**Desde el catálogo (Plan 33 F4), para comparar:**

```bash
node scripts/generar-configuracion-vibraciones.mjs datos/maquinas.json
```

**Criterio de éxito:** imprime `73 variables · 40 series heredadas · 7 sin rol`.
El backend la sirve sin reiniciar; `GET /api/maquinas` devuelve `cuantas: 1`.

> Esa configuración **se deriva del catálogo**, no se escribe a mano: las dos
> salen de la misma fuente, así que cualquier diferencia es real.
> `verificar-vibraciones-configurada.mjs` las compara.

### Los 44 verificadores

Tres quedan fuera de la tanda: `todo` (es el corredor), `antiguedad-historico`
(necesita red real y `--env-file`) y `bundle` (necesita `dist/`).

| Grupo | Guiones |
|---|---|
| **Asistente** | `herramientas` · `chat` · `intencion` · `instrucciones` · `evaluacion` · `inyeccion` · `narrador` |
| **Motor** | `diagnostico` · `temporal` · `calibracion` · `casos` · `casos-cierre` · `pronostico` · `vida-rodamiento` |
| **Dominio** | `riesgos` · `riesgos-vibracion` · `dominio` · `catalogo` · `modulos` · `aprendizaje` |
| **Máquinas (Planes 33, 34 y 36)** | `maquinas` · `registro-configurado` · `vibraciones-configurada` · `deriva-iconics` · `descubrimiento` · `sondeo-series` · `dominio-configurado` · `punto-historico-vibraciones` · `configurar-desde-arbol` |
| **Backend** | `backend` · `tls` · `codigos` · `frescura` · `diario-diagnosticos` · `roles` |
| **Documentos** | `documentos` |
| **i18n** | `i18n` · `textos` |
| **Voz** | `voz` · `manos-libres` |
| **Transporte** | `transporte-falso` |

### Contra planta real

```bash
node --env-file=.env.local scripts/verificar-antiguedad-historico.mjs
```

Sin `--env-file` **falla siempre** con «Falta ICONICS_API_BASE». No es una
regresión.

### La suite intermitente

Corre con **`maxWorkers: 4`**, y es deliberado. Sin el tope fallaba 2 de cada 4
tandas, con nombres distintos cada vez y todas pasando al correrlas solas.
Parecía fuga de estado; eran **timeouts por contención**: en 16 núcleos vitest
lanzaba ~15 workers con su jsdom, e `import` marcaba 534 s sobre 118 s de
reloj.

**Si vuelve a ponerse intermitente, mira primero SI los fallos dicen `timed
out`** (contención — este número) **o son asertos** (el código). No se subió
`testTimeout`: eso trata el síntoma y escondería una regresión real.

### El bundle

```bash
cd react-dashboard && npm run build && node ../scripts/verificar-bundle.mjs
```

Lo que protege de verdad es que **la pila 3D no viaje en el arranque**. Los
techos se han subido cinco veces, y **dos seguidas sin medición es el límite
para `index`** — está escrito en el propio guion. `vendor` no se sube más sin
tomar antes una de las dos palancas: cargar sólo el idioma activo (~40 KB) o
trocear `lucide-react`.

---

## 10. Nota sobre documentos obsoletos

Existe un **«Plan 14»** que **no está en `docs/`**: vive en
`.claude/skills/impeccable/planes/Plan14.md`, junto a un catálogo de mejoras
del asistente que lo referencia.

Lo cita **`backend/README.md`** (en la fila de `ICONICS_FAKE`), y es la única
referencia fuera de esa carpeta.

**Está desactualizado** —describe `herramientas.mjs` como archivo único, cuando
hoy es una carpeta con siete familias, y da cifras de pruebas de hace un mes— y
el usuario indicó **ignorarlo**. Se deja constancia aquí para que esa
referencia no parezca un enlace roto.

**De ahí sale el único dato que este handoff no puede dar**: qué modelo y qué
hardware corren hoy (§7, `POR CONFIRMAR`).
