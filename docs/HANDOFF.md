# HANDOFF — dónde estamos y cómo seguir

**Fecha:** 22-09-2026 (tarde) · **Rama viva:** `Vibraciones1.0` · **HEAD:** el
cierre del Plan 41 (F5, archivar); `git log -1` lo dice.

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

### Qué funciona (verde, medido el 22-09-2026 por la tarde)

| | |
|---|---|
| Suite de frontend | **1097** pruebas · 29 omitidas |
| Suite de backend | **390** pruebas |
| Verificadores | **los 41** de `npm run verificar` |
| `verificar-herramientas` | **190** correctas (13 sobre una configurada) · **22 omitidas** (cierre) |
| `verificar-chat` | **71** correctas |
| `verificar-riesgos-vibracion` | **46** · **19 reglas** sobre 3 apoyos |
| Lint y types | limpios |
| Bundle | `index` 343,6 KB / 450 · `vendor` 269,1 / 330 · `three` diferido |

Funcionalmente: el tablero de vibraciones por **máquinas configuradas** (una
sección por máquina con siete vistas —Inicio, Gráficas, Vista 3D, Hallazgos,
Avisos, Casos previos, RAG— y un muro de planta), el asistente con sus 26
herramientas contestando sobre la configurada que se tiene delante, el motor
de diagnóstico determinista con las reglas del TIPO, el RAG documental con los
manuales asignados al tipo, el transporte falso (`ICONICS_FAKE=true`), el
CRUD de máquinas con verificación contra ICONICS y **sondeo de series variable
por variable**, y el alta marcando los tres árboles desde
`Planta › Configuración`.

**Desde el Plan 40 no hay máquina de vibraciones escrita a mano**, y desde el
Plan 41 (22-09-2026) el tipo también **deriva los nombres con que una persona
pide una señal** («velocidad eficaz lado acople» → `vRMS_S1`), entiende el
`MonState` como entero, y tiene una regla de **factor de cresta** que sólo se
evalúa con carga. Sin `datos/maquinas.json` el tablero arranca sin
vibraciones y lo dice.

**Visto en el navegador el 22-09-2026** con `vib-motor-03` recreada contra el
`bms-server` real: muro, menú, las siete vistas y el asistente. De mirarlo
salió un defecto del tipo, corregido el mismo día.

### Qué está a medias

**El módulo de Predicción está OCULTO del menú** (22-09-2026, a petición del
usuario: no se usa en esta demo, para ningún rol). Sus seis vistas del
compresor perdieron su `nav` en `app/routes/routes.jsx` y la sección
`sec-prediccion` se quedó sin hijos, así que desaparece sola. **Las rutas
siguen registradas y se abren por URL**: ocultar no es borrar.

**«Casos previos» sale vacío** en vibraciones: hay 13 casos y **ninguno** es
suyo (11 del tanque, 2 de «grupo de bombeo»). Es la foto real del módulo.

**El backend que corre puede ir por detrás del código.** Es un proceso
`node` arrancado a mano: los cambios en `shared/` no entran hasta reiniciarlo
(el frontend sí, por HMR). El 22-09 estuvo toda la tarde con el `shared/` de
las 11:44.

### Lo que la instalación no permite (no es un defecto del tablero)

**El motor gira sin nada acoplado.** 602 rpm, par ≈ 0 %, 0 kW, 1,4 A de
magnetización. Las vibraciones que sólo aparecen bajo esfuerzo no se pueden
observar; la regla de cresta sale «no evaluable · en vacío» (en vacío S2 daba
7,7 sin nada roto) y `medida-en-vacio` está siempre activa. Declarado en las
`limitaciones` de la máquina para que el asistente lo cite.

**El historiador contesta, pero a su manera.** Tres sondeos el 22-09: **21
series propias** de 86; las nueve `QC_*` son una sola serie; **35 «sin
variación»** que son banderas y estados que no cambian porque la máquina no
trabaja. «Devuelve 0 muestras» —lo que decía aquí hasta hoy— **ya no es
cierto**; lo que hay es un motor que no da nada que registrar.

**El Alarm Server de GENESIS64 da 500 a `AlarmHistory`** para cualquier
punto —del área de vibraciones y del tanque—. Por eso «Alarmas» de la
configurada se cerró sin vista (Plan 41 F4): los 6 contadores del área se leen
en vivo y se enseñan en Inicio; el historial de eventos no existe.

### Qué está roto

**Nada medido hoy.** El único rojo conocido es intermitente y **no es
contención**: `fuente-de-maquina.test.js` cae a veces en el subconjunto
`demo-eva` con un aserto y nunca solo ni en la suite entera (§9, F10 del
backlog de frontend).

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
- **SISTEMA** — una **máquina** de planta (`sistemas.js`). Hoy `tanque`,
  escrito a mano, más cada configurada registrada (la de vibraciones lo es
  desde el Plan 40).
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

> **Estado a 22-09-2026 (tarde).** El Plan 41 se escribió y se **completó en el
> día**; con él se archivaron el 32, el 37, el 38 y el 40. En
> `docs/por-completar/` queda **sólo el Plan 33**, y es correcto.

**`PLAN-33-MODULARIDAD-MAQUINAS.md`** — F1–F8 y F10 completas. Queda **F9**
(estación de llenado como máquina configurada), **bloqueada por la rama**: no
se puede hacer sin tocar el código del tanque. Es el final de la rama, no una
fase.

**Archivados hoy, con su estado reescrito con lo que de verdad pasó:**

- **41** (cerrar Vibraciones 1.0) — nació de sondear los planes contra el
  código: tres fases dadas por pendientes ya estaban hechas y una era
  imposible. Lo que sobrevivió se hizo en el día: F0 el navegador confirmado
  (y de mirarlo salió y se corrigió `decodificarVigilancia`, que sólo entendía
  base64), F1 tres sondeos y los pasos en planta por la API, F2 los sinónimos
  derivados por el tipo, F3 el factor de cresta (y «normalizar por rpm»
  descartado con el porqué), F4 cerrada **sin vista** con la medida delante,
  F5 archivar. Su §0 es la tabla del sondeo; sus fases dicen qué se midió.
- **32** (vibraciones) — completado en lo que la instalación permite: **el
  motor gira sin nada acoplado**, así que «con carga» no existe y las 35
  series «sin variación» son su estado real.
- **37** (vistas de la configurada) — F4 Alarmas cerrada sin vista: el Alarm
  Server da 500 a `AlarmHistory` para cualquier punto (también del tanque) y
  las banderas de la máquina no tienen serie verificada porque nunca alarmaron
  (B13). La sección se queda con tres entradas.
- **38** (registro dinámico) — confirmado en el navegador (Plan 41 F0).
- **40** (retirar la vibraciones a mano) — F4 cerrada: apoyos nombrados y
  limitación grabada por la API; manuales ya en `tipo:vibraciones`; la espejo
  no existe en este backend (si hay otro despliegue, se da de baja allí).
- Antes, el mismo día: el **19** y el **8** (no se borraron: los cita código
  vivo) y el **13** (borrado: nadie lo citaba). Y de antes, el 34, el 36 y el 39.

### Próximos pasos, por prioridad

**0 · Reiniciar el backend.** El que corre arrancó a las 11:44 del 22-09 con
el `shared/` de entonces: sin el decodificador entero, sin los alias derivados
ni la regla de cresta. El frontend ya lo tiene por HMR.

**1 · Planta, cuando se pueda.** Si hay otro despliegue con
`vibraciones-configurada`, darla de baja. El día que el motor tenga algo
acoplado: quitar la limitación «sin carga» de `vib-motor-03` y mirar la
cresta de cada apoyo con carga (S2 daba 7,7 en vacío).

**2 · Plan 42 — verificar una bandera que nunca cambió, sin forzarla**
(`por-completar/PLAN-42-VERIFICAR-BANDERAS-CONSTANTES.md`, escrito el 22-09).
Es B13 como plan: empieza por **medir** si el historiador registra periódico o
sólo al cambiar (F0, un `medir-`), y de ahí sale el criterio del sondeo (F1),
sus trece comprobaciones (F2) y los flancos de la configurada (F3). Ninguna
fase exige ir a la máquina.

**3 · F7 (el ciclo de vida del sondeo) y F8 (marcar fuera de la raíz)** del
backlog de frontend: la red que falta antes de tocar motores, y una decisión
de diseño sin tomar.

**4 · Reabrir la estación de llenado** — Plan 33 F9. Es el final de la rama.

*(F9 —limitaciones en el editor—, B11 —color del PDF por clave— y la captura
del intermitente F10 se hicieron el 22-09 por la tarde; ver los backlogs y §9.)*

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
| **Señales sin histórico** | Las **nueve `QC_*`** de vibraciones devuelven UNA sola serie, y tres grupos de señales booleanas del variador coinciden entre sí. `cargaMotor` + `eficienciaEnergetica` (tanque) **devuelven la serie de otra señal, sin dar error**. `aPeak_S1` estaba en esta lista **por un defecto NUESTRO de comparación**, no del servidor: ver el incidente del 22-09 |
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

**Pasa a las herramientas lo que las descripciones le enseñan, no lo que el
registro tiene.** Medido el 21-09-2026 (Plan 38 F3): con doce descripciones
diciendo «"tanque" o "vibraciones"», desde la pantalla de `Nuevo-Modor` llamó
con `sistema="vibraciones"`; por nombre, con `sistema="Nuevo-Modor"`. Al
imprimir el id en el inventario y quitar los ejemplos fijos, 6 de 7 preguntas
llegan a la máquina a la primera. Lo que quedaba —una pregunta sin máquina
(«¿hay algún riesgo activo?») con contexto de pantalla la leía como «en la
planta» y **barría las cuatro**— lo cerró el Plan 39 F5 (22-09-2026), y no
con más texto: con contexto, `sistemas_de_la_planta` **sale de las
definiciones del turno** (`intencion.mjs·acotarCatalogo`) salvo que la
pregunta nombre otra máquina o pida la planta entera. El modelo no puede
llamar a lo que no tiene. El instrumento pasó a 9 de 9.

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

**`z.enum(SISTEMA_IDS)` copia la lista al construir el esquema.** Medido con
zod 4: un id empujado a `SISTEMA_IDS` después no pasa el enum. Desde el Plan 38
el registro cambia en caliente, así que todo lo que valide `sistema` usa
`sistemaConocido()` (`esquemas.mjs`), que mira la lista al validar. Y el
registro es un módulo: **`montarApp` usa un `maquinas.json` vacío y propio**,
porque con el valor por defecto cada prueba registraría las máquinas del disco
de quien la corre.

**Retirar o renombrar una máquina deja huérfanos los manuales asignados a
ella.** El 22-09-2026 la ISO 20816-3 y dos manuales más seguían asignados a
`vibraciones` (retirada en el Plan 40) y ninguna configurada los veía: el
índice sólo deja pasar «el mismo id» o «sin asignar», y un id que ya no existe
no es de nadie. Desde el Plan 39 F3 un manual se puede asignar a un **tipo**
(`tipo:vibraciones`), que es lo que una norma es; y `GET /api/rag/documentos`
trae en el estado del índice `conSistemaDesconocido`, que es donde mirar
después de retirar una máquina.

**El reconocimiento de roles TOLERA la grafía, pero no inventa conceptos.**
Desde el 22-09-2026 `rolesDeTag` y `rolesDeClave` comparan por forma canónica
—minúsculas, y el espacio y el guión medio valen como guión bajo—, así que
`VRMS_S1`, `vRMS_S1` y `vrms_s1` son el mismo rol, y el sufijo del apoyo se
detecta igual. Antes era `===` contra la grafía exacta del SM 1281: **pasar
los tags de planta a mayúsculas dejaba sin rol a nueve de doce señales**, y con
ellas la máquina se quedaba sin reglas, sin estado y sin catálogo. Un nombre
DISTINTO —otro fabricante que llame `VEL_RMS` a la velocidad eficaz— se
declara en `shared/eva/vibraciones/aliasDeTags.js`, y el tipo **no arranca** si
un alias reclama dos roles. Lo que sigue sin poderse es inventar un concepto
que el equipo no publique: eso se declara en las limitaciones de la máquina.

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
| 22-09 | El editor pintaba un activo como «sin leer» y DESMARCADO si tenia una subcarpeta sin explorar (el `NOT_USED` de `S1`): `hojasBajo()` devuelve `null` si falta una rama del camino —a proposito— y solo se leian las carpetas con variables guardadas. Y el contador del historiador decia «22 · 21» porque sumaba la subcarpeta como si fuera un tag. **Los dos los cazo el usuario en pantalla** |
| 22-09 | El sondeo acusaba de «serie compartida» a `aPeak_S1` y `aRMS_S1`, que son series distintas. Comparaba **ocho muestras por POSICIÓN**, y esas dos se registran en grupos distintos del historiador (1 s y 5 s): a la misma hora les tocan posiciones distintas. Agravado por una ventana de **7 días fijos** que, con un hueco de registro, devolvía un tramo viejo con la máquina parada donde todo es ruido cerca de cero. **Lo cazó el usuario mirando ICONICS**, no la suite |

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

**Criterio de éxito:** `verificar-herramientas` imprime **183 correctas y 22
omitidas**, y «14 de ellas sobre una máquina CONFIGURADA». Las omitidas son
del cierre y el guion las cuenta a propósito; las catorce son la espejo de
vibraciones registrada sólo para su bloque (Plan 39 F0–F2).

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
| Backend | **390 passed** |
| Frontend | **1083 passed · 29 skipped** |
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

**Desde la fixture (Plan 40 F3), para arrancar sin planta:**

```bash
ICONICS_FAKE=true node scripts/sembrar-espejo.mjs        # escribe datos/maquinas.json
```

Siembra `scripts/lib/vibraciones-espejo.json`: 73 variables, 36 series
verificadas, los tres apoyos con nombre y las limitaciones de la instalación.
El backend la sirve sin reiniciar; `GET /api/maquinas` devuelve `cuantas: 1`.

> Desde el Plan 40 F3 **no hay máquina de vibraciones escrita a mano**: la
> demo es esta configurada. `generar-configuracion-vibraciones.mjs` se retiró
> con ella. `verificar-vibraciones-configurada.mjs` compara la fixture con
> `shared/eva/vibraciones/catalogoDemo.js`, la forma de la entrada retirada.

**Y los manuales de vibraciones se asignan al TIPO**, no a una máquina: en
`Planta › Documentación`, cada manual de vibraciones (la ISO 20816-3, el del
SM 1281, el del V20) va en «Todas las de Vigilancia de vibraciones»
(`tipo:vibraciones`). Uno asignado a una máquina que ya no existe no lo ve
nadie (§8).

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

**El asistente sobre una máquina configurada** (Plan 38 F3), contra el modelo
real y la planta real; unos seis minutos por tanda:

```bash
node --env-file=.env.local scripts/medir-asistente-configurada.mjs --maquina vib-motor-03
```

Es un `medir-`, no un `verificar-`: imprime a qué máquina fue cada herramienta
y no devuelve código de error. Apaga la autenticación **sólo en su proceso**
(monta la app sin puerto); `medir-asistente.mjs`, que no lo hace, recibe 401
con `AUTH_HABILITADA=true` y está anotado en el plan.

### La suite intermitente

Corre con **`maxWorkers: 4`**, y es deliberado. Sin el tope fallaba 2 de cada 4
tandas, con nombres distintos cada vez y todas pasando al correrlas solas.
Parecía fuga de estado; eran **timeouts por contención**: en 16 núcleos vitest
lanzaba ~15 workers con su jsdom, e `import` marcaba 534 s sobre 118 s de
reloj.

**Si vuelve a ponerse intermitente, mira primero SI los fallos dicen `timed
out`** (contención — este número) **o son asertos** (el código). No se subió
`testTimeout`: eso trata el síntoma y escondería una regresión real.

**Y uno que NO era contención ni orden: era el RELOJ (22-09-2026, cazado y
arreglado).** `fuente-de-maquina.test.js › con el origen SIMULADO…` caía «a
veces» con un aserto y nunca a demanda. Se supuso estado compartido entre
pruebas de la carpeta. Cazado a la sexta tanda con `--reporter=verbose`:
`vRMS_S1: expected 'undefined' to be 'number'`. El simulador de vibraciones
**no usa `Math.random`** —fijarlo en 0,99, como hacía la prueba, no servía de
nada—: su marcha y su paro van por reloj de pared en **ciclos de 10 min**, y
parado, `vRMSEn()` devuelve `null`. La prueba leía con `Date.now()` real, así
que caía o no según la hora. El arreglo, sólo en la prueba: fijar el reloj en
un instante en marcha (`vi.useFakeTimers({ toFake: ["Date"] })`, sólo `Date`,
porque el transporte espera su latencia con `setTimeout`). **La lección:** un
intermitente que no dice `timed out` y no se reproduce solo puede ser el
reloj, no sólo el orden; y la primera pregunta es «¿qué lee este código del
`Date.now()`?». Detalle en el backlog de frontend, F10.

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
