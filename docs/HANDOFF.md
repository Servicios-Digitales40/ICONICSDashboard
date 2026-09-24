# HANDOFF — dónde estamos y cómo seguir

**Fecha:** 23-09-2026 (tarde) · **Rama viva de Moisés:** `UI-Limpieza1.0` · **Rama de la presentación:** `DemoVibraciones4.0` (nace de ésta el 23-09-2026; sólo recibe merges) · **Rama de Gustavo:** `AjustesGustavo5.0` (nace de la anterior; el asistente). **Plan 42.5 COMPLETADO y archivado el 23-09-2026** (F0–F6, comprobado en el navegador contra planta esa tarde). Quien llegue desde una versión antigua empieza por **§0**.

Este documento es lo primero que lee una sesión nueva. `CLAUDE.md` dice las
**reglas**; esto dice el **estado**: qué funciona, qué está a medias, qué se
decidió ya y qué trampas están medidas.

> **Lo marcado `POR CONFIRMAR` no se ha podido verificar contra el repo.** No
> se da por cierto: se pregunta antes de apoyarse en ello.

---

## 0. Si llegas desde una versión antigua — léelo antes que nada

> Escrito el **23-09-2026** para quien retoma el proyecto desde una rama de
> hace semanas (Gustavo, `AjustesGustavo5.0`) y para el asistente que le
> ayude. Resume qué es esto HOY, qué cambió, en qué rama trabaja cada uno y
> cómo no pisarse. Lo que sigue en §1–§10 es el detalle.

### Qué es esto hoy, en cuatro frases

Una **plataforma de configuración de máquinas** con ICONICS FrameWorX como
única fuente de planta: se configura una máquina desde el árbol de ICONICS
(`eva-configuracion`), se verifican sus señales y sus series del historiador,
y el tablero le pinta sus vistas **genéricas** (Inicio, Planta, Estado
mecánico, Vista 3D, Detalle, Hallazgos, Avisos, Casos, RAG) sin un `if` por
máquina. El **asistente** (LLM local por `llama-server`) contesta con
herramientas deterministas sobre la máquina que se tiene delante; un
**motor de diagnóstico** determinista puntúa y el modelo sólo redacta. Hoy hay
**una máquina configurada** en el despliegue (`vib-motor-03`, «Nuevo-Modor»,
tipo `vibraciones`, 86 variables, 74 series verificadas) y **el tanque ya no
tiene vistas**: está cerrado y sus pantallas se borraron; volverá como otra
máquina configurada (Plan 43). Las reglas viven en `CLAUDE.md`; los planes
completados, con lo que de verdad pasó, en `docs/completados/`.

### Lo que cambió desde las versiones antiguas, por orden

Si tu rama es anterior a septiembre, casi todo lo de abajo es nuevo para ti.
Cada plan está en `docs/completados/PLAN-N-*.md` con sus fases reescritas
con lo que pasó; leer el §0 de cada uno basta para situarse.

| Cuándo | Plan | Qué cambió |
|---|---|---|
| 03-09 | 19 | **Módulos**: `monitoreo` (ICONICS) y `prediccion` (API externa, oculto). Un módulo declara su fuente; nunca mezcla datos con otra |
| 04–07-09 | 20 | **Backend**: `autenticar` por ámbito, esquemas Zod por ruta, escritura atómica, banco de evaluación del asistente (`backend/ia/evaluacion/`), 41 verificadores en `npm run verificar` |
| 08–11-09 | 22–27 | **i18n obligatorio** (es/en, `verificar-i18n` y `verificar-textos`), roles, diario de accionamientos, enlaces firmados de reportes, historización de 45 señales más |
| 17-09 | 32 | **La estación de llenado se CIERRA**: fuera del menú, sin sondeo, el asistente se niega. Rama `Vibraciones1.0` |
| 18–21-09 | 33–40 | **Máquinas configuradas**: `datos/maquinas.json` → `construirSistema(maquina, tipo)`; el **tipo** (`shared/eva/tipos/vibraciones.js`) trae roles, reglas, física simulada, vocabulario; el editor configura desde el árbol; el sondeo verifica series; la máquina de vibraciones escrita a mano **se retira** |
| 21-09 | 35 | **Autenticación ENCENDIDA** (`AUTH_HABILITADA=true`): tres roles, pantalla de acceso, `exigirRol` en toda ruta |
| 22-09 | 41, 42 | Cierre de Vibraciones 1.0; el criterio `registrada-constante` del sondeo |
| 22–23-09 | **42.5** | Rama `UI-Limpieza1.0`: Planta y Detalle **genéricos** (`views/maquina/`), la bitácora de casos vaciada, **todas las vistas del tanque borradas**, `features/data` y Predicción fuera del menú, `verificar-i18n` caza claves huérfanas, y la **F6** tras mirarlo en planta: filtros por activo, mudos listados, configuración más corta, **nombre y alias por asset** que el asistente resuelve, el muro borrado y un arranque que desvía a la primera configurada |

Tres cosas que rompen la intuición de quien viene de antes:

- **`vibraciones` ya no es un sistema escrito a mano.** No hay
  `SISTEMAS.vibraciones`; hay lo que `datos/maquinas.json` diga, registrado al
  arrancar (`registrarSistema`). Las pruebas y los verificadores usan la
  **máquina espejo** (`scripts/lib/vibraciones-espejo.json`,
  `configuracionEspejo()`), no una escrita a mano.
- **El tanque sigue en el registro pero cerrado** (`cerrado: true` en
  `sistemas.js`): `resolverSistema` lo niega, 24 comprobaciones de
  `verificar-herramientas` están omitidas por eso, y su dominio
  (`shared/eva/tanque/`) no se toca ni se borra.
- **La autenticación está encendida.** El tablero pide credenciales
  (`backend/http/plugins/autenticacion.mjs`); las pruebas y los verificadores
  no la necesitan (`ICONICS_FAKE=true` y `AUTH_HABILITADA` sin definir).

### Las ramas, y el plan del día de la demo

```
main ─── … ─── Vibraciones1.0 ─── UI-Limpieza1.0 ──(sigue Moisés)──▶
                                        │
                                        └── DemoVibraciones4.0 ─(la de la presentación)─▶
                                                   │
                                                   └── AjustesGustavo5.0 ─(sigue Gustavo)──▶
```

| Rama | Quién | Para qué |
|---|---|---|
| `UI-Limpieza1.0` | Moisés | Sigue el Plan 42.5 (comprobación en planta) y lo que salga |
| `DemoVibraciones4.0` | nadie edita | Nace de `UI-Limpieza1.0` el 23-09-2026 (`9f1c44a`). Es la que queda **en el equipo de la presentación**. Sólo recibe merges |
| `AjustesGustavo5.0` | Gustavo | Nace de `DemoVibraciones4.0`. Su foco: el **asistente** |

**El día de la demo se hace merge de `UI-Limpieza1.0` y de `AjustesGustavo5.0`
hacia `DemoVibraciones4.0`.** Para que ese merge sea barato:

1. **Cada uno en su zona.** Gustavo: `backend/ia/**`, `scripts/verificar-herramientas.mjs`,
   `verificar-chat.mjs`, `verificar-instrucciones.mjs`, `verificar-evaluacion.mjs`
   y `react-dashboard/src/i18n/locales/*/assistant.json`. Moisés:
   `react-dashboard/src/**` salvo lo anterior, `shared/eva/**`, `docs/`.
2. **Los archivos calientes que tocamos los dos se avisan antes de tocarlos:**
   `shared/eva/comun/sistemas.js` (registro, `sistemasDeSenal`,
   `sistemaPorNombre`), `shared/eva/comun/construirSistema.js` (la entrada de
   una configurada: `aliasDe`, `herramientas`, `limitaciones`),
   `backend/ia/conversacion/definiciones.mjs` (las 26 herramientas),
   `backend/ia/conversacion/chat.mjs` (el prompt y el bucle), `CLAUDE.md` y
   este HANDOFF. Si hay que tocarlos, un commit pequeño y sólo con eso.
3. **Traer `DemoVibraciones4.0` a tu rama** cada vez que reciba algo
   (`git merge DemoVibraciones4.0` desde la tuya), no esperar al día de la demo.
4. **Commit por fase, con la puerta pasada, y sin push sin pedirlo**
   (`CLAUDE.md` §6). Un plan nuevo va a `docs/por-completar/PLAN-N-*.md`
   (§6.1); el siguiente número libre es el **45** (el 43 está reservado al
   tanque como configurada; el **44** —reportes por plantilla— está escrito
   y toca `backend/ia/`: ver su D11 antes de tocar `definiciones.mjs` o
   `chat.mjs`).

### Dónde vive el asistente hoy (para quien va a tocarlo)

| Qué | Dónde |
|---|---|
| El bucle: prompt, inventario de la planta, rondas, la guarda que bloquea una respuesta con cifras sin herramienta | `backend/ia/conversacion/chat.mjs` (`inventarioDeLaPlanta`, `avisoDeBloqueo`) |
| Las 26 herramientas que ve el modelo, con sus esquemas Zod | `backend/ia/conversacion/definiciones.mjs` |
| Cómo se ejecutan: familias por carpeta, y el índice de señales del tanque | `backend/ia/herramientas/*/index.mjs`, `backend/ia/conversacion/herramientas.mjs` |
| Resolver de qué máquina va una pregunta (`resolverSistema`: id, nombre o **alias**) y la guarda de «cerrada» | `backend/ia/herramientas/lib/maquina.mjs` |
| Resolver una señal por texto en las configuradas (`sistemasDeSenal`), y una máquina por nombre (`sistemaPorNombre`) | `shared/eva/comun/sistemas.js` |
| Los nombres por los que se pide una variable (`aliasDe`: clave, etiqueta, rol, alias de la variable, **nombre y alias de su activo**) | `shared/eva/comun/construirSistema.js` + `tipo.aliasDe` en `shared/eva/tipos/vibraciones.js` |
| El motor determinista: casos, causas, temporal | `backend/ia/motor/` (leer la cabecera de `diagnostico.mjs` antes) |
| Búsqueda: BM25, embeddings, manuales, casos | `backend/ia/indices/` |
| La narración en inglés de lo que el dominio escribe en español | `backend/ia/i18n/narrar*.mjs` |
| El banco de casos y el juez | `backend/ia/evaluacion/` (`verificar-evaluacion`) |
| Dictado y voz | `backend/ia/voz.mjs` |
| Los reportes PDF (Plan 44): el catálogo de siempre y la conversación en `reporte.mjs`; las plantillas por `tipo`, sus recolectores, el compositor por bloques y el lienzo de marca | `backend/ia/reportes/` (`generar.mjs`, `plantillas/`, `recolectores.mjs`, `compositor.mjs`, `lienzo.mjs`) · arte en `ia/marca/portadas/` · maquetas en `docs/plantillas-reportes/` |

**La puerta antes de tocar el modelo, el prompt o una herramienta** (§9):

```bash
ICONICS_FAKE=true node scripts/verificar-herramientas.mjs   # 197 correctas · 24 omitidas
ICONICS_FAKE=true node scripts/verificar-chat.mjs           # 72
ICONICS_FAKE=true node scripts/verificar-instrucciones.mjs  # el prompt dice lo que el registro dice
```

Levantan el backend entero sin planta y con un `llama-server` falso. Para
hablar con el asistente de verdad hace falta `llama-server` con `--jinja`
(§7); sin esa opción el modelo no ve las herramientas y contesta de memoria.

**Lo que hay que saber del estado de datos:** la bitácora de casos
(`datos/aprendizaje.json`) se **vació** el 23-09 (13 casos del tanque →
0, copia al lado); `datos/maquinas.json` **no está versionado**: cada equipo
tiene el suyo, y para las pruebas está la espejo. La máquina real de la demo
tiene los apoyos rotulados «Lado acople», «Rodamiento intermedio», «Lado
libre» y puede llevar alias que quien configura escribe en el editor
(`assets[].nombre`, `assets[].alias`); el asistente los resuelve.

**Lo que NO hay que hacer** (todo está en `CLAUDE.md`, pero es lo que más se
tienta al retomar): añadir dependencias; poner texto en español dentro del
JSX (`verificar-textos` lo caza); dejar que el modelo decida una banda, un
orden o una causa (§2.3); tocar el código del tanque; «arreglar» una prueba
omitida; subir un techo para callar un rojo sin medirlo antes.

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

**Desde el 22-09-2026 (noche), en `UI-Limpieza1.0`, la regla 1 cambia.** El
usuario decidió que el tanque se piensa como **otra posible máquina
configurada**, no como una instalación aparte (Plan 42.5 §1):

1. **Su dominio** (`shared/eva/tanque/`) sigue sin borrarse: es la materia
   prima del tipo `estacion-de-llenado` (Plan 43). Se lee y se puede mover.
2. **Sus vistas y su lectura del historiador se sustituyen por genéricas y se
   borran**, con las pruebas que sólo ellas justificaban. Borrar va después
   de sustituir. La **fuente en vivo** del tanque (`EvaProvider`, `evaSource`,
   `useSistemaAgua`) **no**: la consumen siete archivos comunes y la sustituye
   el tipo, no este plan (Plan 42.5 F0).
3. **Lo que no es de ninguna máquina y nadie importa se borra ya**, con la
   evidencia en el commit.

La regla 2 (las pruebas omitidas no se arreglan) sigue igual.

### Qué funciona (verde, medido el 22-09-2026 por la tarde)

| | |
|---|---|
| Suite de frontend | **1180** pruebas · 20 omitidas *(a 23-09 por la noche, tras Plan 44 F3.3; eran 1172 tras el 42.5 y 1102 · 29 el 22-09)* |
| Suite de backend | **433** pruebas (432 verdes seguras; `salud.test.mjs` a veces cae por entorno, ver «Qué está roto») *(a 23-09 por la noche, tras Plan 44 F3.3; eran 401)* |
| Verificadores | **los 41** de `npm run verificar` |
| `verificar-herramientas` | **197** correctas (13 sobre una configurada, 7 de reportes por plantilla) · **24 omitidas** (cierre; las dos últimas, el catálogo del tanque en `generar_reporte`, Plan 44 F3.5) |
| `verificar-chat` | **72** correctas |
| `verificar-riesgos-vibracion` | **46** · **19 reglas** sobre 3 apoyos |
| Lint y types | limpios |
| Bundle | `index` 350,3 KB / 450 · `vendor` 269,1 / 330 · `charts` 326,4 (sin techo) · `three` diferido |

Funcionalmente: el tablero de vibraciones por **máquinas configuradas** (una
sección por máquina con ocho vistas en el menú —Inicio, Planta, Estado
mecánico, Vista 3D, Hallazgos, Avisos, Casos previos, RAG— más el Detalle
sin menú (Plan 42.5), y un arranque que abre la primera configurada en
servicio; el muro se borró y el tanque ya no tiene vistas), el asistente con sus 26
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
`bms-server` real: muro, menú, las siete vistas de entonces y el asistente. De
mirarlo salió un defecto del tipo, corregido el mismo día. **Visto otra vez el
23-09-2026 por la tarde**, con el backend reiniciado y el motor parado: el
arranque, el Inicio con las mudas, la Planta filtrada, el Detalle, Configuración
y Casos previos del Plan 42.5 F6; sin defectos nuevos (los tres que salieron
al mirarlo se corrigieron el mismo día, F6.7).

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

**El historiador contesta, pero a su manera.** Registra **sólo al cambiar**
(Plan 42 F0, medido): una bandera constante deja 8 muestras al día frente a
569 de `vRMS_S1`, y las deja en los minutos en que la recolección rearranca.
Por eso desde el Plan 42 el sondeo verifica una constante **por sus marcas de
tiempo** (`registrada-constante`): el último sondeo del 22-09, tras reiniciar
los servidores, dio **34 propias, 44 constantes registradas, 2 compartidas**
(`OUTPUT VOLTS_BMS` y `Numero de arranques`, pocas marcas: B15), 5 sin
muestras y 1 sin leer, de 86. Las **once banderas de alarma están
verificadas** sin haber alarmado nunca. Las «35 sin variación» de la mañana
ya no existen; y ojo: las constantes que sólo dejan marca al rearrancar
entran y salen de la ventana de 24 h (50 registradas a las 15:30, 38 a las
16:40, 44 tras el reinicio). Lo ganado no se pierde: el sondeo no baja a
`false` lo que ya estaba verificado.

**Las nueve `QC_*` salían «comparten serie con otra»** hasta el reinicio: sus
series eran idénticas en todos los valores. En vivo se midió que llegan como
nueve datos separados, cada uno con su marca (`medir-igualdad-en-vivo`), y el
usuario lo dejó claro: decidir si dos tags con el mismo valor son la misma
fuente es del PLC y de ICONICS, no del tablero. El tipo `vibraciones` declara
ahora las calidades como **series equivalentes** (`seriesEquivalentes`) y el
sondeo las verifica aunque coincidan (`registrada-equivalente`); `aPeak_S1` y
`aRMS_S1` no están en ninguna familia y su cruce se sigue cazando. Tras el
reinicio las nueve salieron **propias por sí mismas**, así que la familia no
tuvo que actuar; queda para cuando vuelvan a coincidir. La causa
`serie-compartida` dice ya «indistinguible de», no «devuelve la de otra».

**El Alarm Server de GENESIS64 da 500 a `AlarmHistory`** para cualquier
punto —del área de vibraciones y del tanque—. Por eso «Alarmas» de la
configurada se cerró sin vista (Plan 41 F4): los 6 contadores del área se leen
en vivo y se enseñan en Inicio; el historial de eventos no existe. Desde el
Plan 42 las banderas SÍ prometen historia y la cadena de flancos está probada
para una configurada; la vista se hará cuando una bandera cambie de verdad
(F11 del backlog de frontend). Hoy daría cero eventos.

### Qué está roto

**Un rojo en backend que no es del código, visto el 22-09 a las 16:25:**
`salud.test.mjs › sin ninguna lectura todavía, lo DICE en vez de pintarlo mal`
cae por **tiempo (5 s)**, también solo y también **sin los cambios del Plan
42** (`git stash` y repetir). En el log aparece una lectura real de
`ac:TDCON/DEMO/NIVEL_TANQUE` contra ICONICS que recibe la página de
reautenticación: la prueba está saliendo a la red desde este entorno. Por
confirmar si es la variable de entorno de la sesión o la prueba; no se tocó.

El otro rojo conocido es intermitente y **no es contención**:
`fuente-de-maquina.test.js` cae a veces en el subconjunto `demo-eva` con un
aserto y nunca solo ni en la suite entera (§9, F10 del backlog de frontend).

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

Tres ramas vivas desde el **23-09-2026**, y su plan, en **§0** («Las ramas, y
el plan del día de la demo»): `UI-Limpieza1.0` (Moisés), `DemoVibraciones4.0`
(la de la presentación; sólo recibe merges) y `AjustesGustavo5.0` (Gustavo, el
asistente). `UI-Limpieza1.0` **sí está en `origin`** (la subió el usuario;
`origin/UI-Limpieza1.0` va en `9f1c44a` a fecha de hoy). `DemoVibraciones4.0`
y `AjustesGustavo5.0` nacieron locales el 23-09-2026 y **se suben sólo cuando
se pida** (CLAUDE.md §6): Gustavo las necesita en el remoto para empezar.
`origin/Vibraciones1.0` sigue en `5529029`.

Hay además **13 ramas locales y 24 remotas anteriores** (`Moises5–7`,
`Gustavo5`, `IntegracionMoises6Gustavo5`, `Mejoras-Demo-6.0`, `Demo3.0`,
`Asistente`…). Son de antes de la modularización y del cierre del tanque:
`POR CONFIRMAR` si alguna sigue en uso; ninguna se ha tocado en este trabajo,
y **no se parte de ellas**: se parte de `DemoVibraciones4.0`.

### Los planes vivos

> **Estado a 23-09-2026 (tarde).** El **Plan 42.5** se completó y archivó
> este día: Planta y Detalle genéricos, la bitácora vaciada, todas las vistas
> del tanque borradas, el código muerto fuera, y la F6 con lo que la máquina
> pidió al mirarla en planta (filtros, mudas listadas, configuración corta,
> nombre y alias por asset, fuera el muro). En `docs/por-completar/` quedan
> el **Plan 33** y el **Plan 44** (reportes por plantilla, escrito ese mismo
> día con su F0 hecha). El siguiente número libre es el **45**; el **43** está
> reservado al tanque como máquina configurada.

**`PLAN-44-REPORTES-POR-PLANTILLA.md`** — el usuario entregó ocho maquetas
Word (técnico, vibraciones, sensores, riesgos, alarmas, ingeniería, energías,
predicciones) para que `generar_reporte` sepa componer cada tipo. F0 hecha:
maquetas en `docs/plantillas-reportes/`, arte en `backend/ia/marca/portadas/`,
decisiones cerradas salvo el criterio de la matriz de riesgos (D15, propuesto).
F1–F7 por hacer: un compositor por bloques, recolectores deterministas, `tipo`
como argumento de la herramienta. **Vive en `backend/ia/`**: su D11 dice qué
archivos calientes toca y cómo avisar.

**`PLAN-33-MODULARIDAD-MAQUINAS.md`** — F1–F8 y F10 completas. Queda **F9**
(estación de llenado como máquina configurada), **bloqueada por la rama**: no
se puede hacer sin tocar el código del tanque. Es el final de la rama, no una
fase.

**Archivados hoy, con su estado reescrito con lo que de verdad pasó:**

- **42** (verificar una bandera que nunca cambió, sin forzarla) — escrito y
  completado el 22-09-2026 por la tarde. F0 midió que el historiador registra
  sólo al cambiar pero escribe las constantes en los mismos minutos que las
  medidas; F1 el criterio `registrada-constante` (la mitad o más de las marcas
  en una serie propia del mismo sondeo) y el campo `historyVerifiedComo`; F2
  trece checks más pruebas de ruta, ficha y espejo, y el sondeo contra planta
  (35 «sin variación» → 0); F3 la cadena de flancos probada y `maq-alarmas`
  aplazada hasta un flanco real. Destapó B14 y B15 y tocó el falso para que
  una configurada sin verificar pueda sondearse contra él.

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

**2 · Re-sondear `vib-motor-03` desde la pantalla** con el backend
reiniciado (Plan 42): el sondeo de la tarde se hizo con un guion suelto y
**sin anotar**; el que anote es el de la ficha. Y otro día, repetir
`medir-cadencia-historiador` para ver si las ventanas de 72 h y 168 h siguen
vacías (B14).

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

### Vaciar la bitácora de casos en un despliegue (Plan 42.5 F3)

`datos/aprendizaje.json` no está versionado: es estado del despliegue. El de
esta máquina nació con 13 intervenciones de la estación de llenado (11
`tanque`, 2 `grupo de bombeo`), y la rama `UI-Limpieza1.0` decidió que
«Casos previos» se llene con lo que se cierre sobre máquinas configuradas. El
vaciado es una decisión de quien opera el despliegue, no del repositorio:

```bash
node scripts/purgar-casos-invalidos.mjs --vaciar-intervenciones             # ver cuántas
node scripts/purgar-casos-invalidos.mjs --vaciar-intervenciones --ejecutar  # vaciar, con copia
```

Deja una copia `datos/aprendizaje.json.antes-de-purga-<fecha>.json`; los
`hechos` y las `propuestas` no se tocan. El índice de casos arranca vacío
sin fallar (tres guardas: `leerAprendizaje` → almacén vacío, `casos.mjs` →
`[]`) y el motor puntúa la fuente como `sin_respaldo`, no como caída. La
caché `datos/embeddings-cache-casos.json` se regenera sola. **Ejecutado en
esta máquina el 23-09-2026 a las 08:05**: 13 → 0, copia en
`datos/aprendizaje.json.antes-de-purga-2026-09-23T14-05-52-089Z.json`. El almacén se lee del disco en cada llamada, así que no hizo
falta parar el backend; conviene reiniciarlo para mirar `GET /api/casos`.

**Efecto que hay que saber**: `DELETE /api/maquinas/:id` desactiva en vez de
borrar cuando la bitácora tiene casos que nombran la máquina. Con la bitácora
vacía, toda máquina pasa a ser borrable de verdad.

## 8. Comportamientos del modelo y trampas conocidas

### Del modelo

**No obedece una instrucción que compita con una plantilla cercana.** Medido:
el narrador abrió **6 de cada 6** respuestas con «no pude consultar los
manuales» pese a que su instrucción lo prohibía, porque la plantilla que tenía
más a mano decía eso. **La corrección no fue insistir, fue decirle con qué
EMPEZAR.** Resultado: 0 de 6.

**Corolario:** una regla que importa se pone en el **código**, no en el prompt.
Por eso el cierre de una máquina es una guarda en `resolverSistema()`.

**Hace lo que dice la descripción del argumento, literalmente.** Medido el
23-09-2026 con `qwen-3.5-4B` (`scripts/medir-tipo-de-reporte.mjs`): la
descripción de `sistema` en `generar_reporte` decía «por omisión "tanque"» y
el modelo escribía `sistema: "tanque"` en 7 de 14 frases en las que nadie
nombró una máquina; el tanque está cerrado y el reporte se negaba. **Una
omisión la resuelve el código** (`reportes/sistemaPorOmision.mjs`), y la
descripción dice «omítelo si el usuario no la nombra». Antes de escribir «por
omisión X» en una descripción, pregúntate si quieres que el modelo escriba X.

**Tras una herramienta que FALLA puede contestar como si otra hubiera tenido
éxito, con un enlace inventado.** Mismo día: ante «pronóstico de fallas» la
herramienta se negó (plantilla pendiente) y el modelo respondió «aquí tienes
el reporte de vibraciones» con `https://ejemplo.com/…`. La guarda de cifras
sin herramienta no lo caza: hubo herramienta y no hay cifras. Paliativo: la
negativa lleva una `nota` para el modelo. **La guarda que falta, en
`chat.mjs`: una URL en la respuesta sin un adjunto emitido en el turno se
bloquea igual que una cifra sin herramienta.** Está pendiente y es de la zona
del asistente (Plan 44 F3.4).

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

**Dos bitácoras según desde dónde se arranque.** `RUTA_APRENDIZAJE` es
`join('datos', 'aprendizaje.json')`, relativa al `cwd`. El puente de
producción arranca desde la raíz (`node --env-file=.env.local
backend/server.mjs`) y lee `datos/aprendizaje.json`; pero `cd backend &&
npm test` corre con `cwd = backend/` y las pruebas de `/api/casos` escriben
en **`backend/datos/aprendizaje.json`**, que el 22-09-2026 acumulaba 30
intervenciones de prueba de `vib-motor-03`. Se borró ese día como artefacto;
si vuelve a aparecer, es la suite, no la planta. Hacer la ruta absoluta y que
las pruebas usen `mkdtemp` como los verificadores es B17.

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

**Criterio de éxito:** `verificar-herramientas` imprime **190 correctas y 22
omitidas**, y «13 de ellas sobre una máquina CONFIGURADA». Las omitidas son
del cierre y el guion las cuenta a propósito; las catorce son la espejo de
vibraciones registrada sólo para su bloque (Plan 39 F0–F2).

### La tanda completa

```bash
npm run lint && npm run types && npm run verificar
cd backend && npm test
cd react-dashboard && npm test
```

**Criterio de éxito, medido el 22-09-2026 por la tarde:**

| | Esperado |
|---|---|
| `npm run verificar` | **Los 41 pasaron** (`sondeo-series` 34 · `vibraciones-configurada` 40) |
| Backend | **432 passed** de 433 (ver «Qué está roto» en §1 sobre `salud.test.mjs`) |
| Frontend | **1180 passed · 20 skipped** *(23-09-2026, tras Plan 44 F3.3)* |
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
| **i18n** | `i18n` (paridad es/en, interpolaciones, rutas y, desde el 23-09-2026, que ninguna clave se quede sin pantalla que la pida) · `textos` |
| **Voz** | `voz` · `manos-libres` |
| **Transporte** | `transporte-falso` |

### Contra planta real

```bash
node --env-file=.env.local scripts/verificar-antiguedad-historico.mjs
```

Sin `--env-file` **falla siempre** con «Falta ICONICS_API_BASE». No es una
regresión.

**Cómo registra el historiador una serie que no cambia** (Plan 42 F0):

```bash
node --env-file=.env.local scripts/medir-cadencia-historiador.mjs            # las 5 del plan
node --env-file=.env.local scripts/medir-cadencia-historiador.mjs --todas    # las 86, 24 h
```

Por serie: muestras, primera y última marca, cadencia mediana, valores
distintos y cuántas marcas coinciden con `vRMS_S1`. Es un `medir-`: mide, no
afirma. De aquí salió `FRACCION_MARCAS_REGISTRADA` de `sondearSeries.mjs`.

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
