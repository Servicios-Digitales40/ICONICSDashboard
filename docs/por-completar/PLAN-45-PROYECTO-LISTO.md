# PLAN 45 — Dejar el proyecto listo: lo que falta para cerrar Vibraciones como producto

**Estado:** **F0 (auditoría) completada el 24-09-2026** · F1–F6 por completar. Fecha objetivo: **29-09-2026**. Lo de §0 está **medido** contra el repo, contra la planta real (`bms-server`) y contra el modelo real (`qwen-3.5-4B` en `10.10.17.18`); lo que es una suposición lo dice.
**Rama:** `UI-Limpieza1.0` (Moisés). `DemoVibraciones4.0` recibe el resultado; `AjustesGustavo5.0` es la del asistente (Gustavo). Ver `HANDOFF.md` §0.
**Origen:** el usuario pidió el 24-09-2026 revisar alcances, capacidades y problemas del proyecto, con pruebas, y después acotó: «no pensemos en la presentación, sino en el contenido del proyecto y en cómo funciona. Quiero dejar el proyecto listo. ¿Qué faltaría?».

> «Listo» aquí significa: **lo que el producto promete** (`PRODUCT.md`, el
> ciclo configurar → verificar → documentar → consultar → diagnosticar) **hace
> lo que dice sobre la máquina configurada, sin restos de la máquina cerrada,
> y lo que no puede hacer lo declara** (`CLAUDE.md` §2.5). No es «sin deuda»:
> es sin mentiras y sin sorpresas. Lo que mejora el producto sin ser necesario
> para eso va a los backlogs, no aquí.

---

## 0. Lo que hay hoy, medido (24-09-2026)

### 0.1 La tanda entera

| Qué | Resultado | Nota |
|---|---|---|
| `npm run lint` · `npm run types` | limpios | |
| `cd backend && npm test` | **439 de 440** en la primera tanda | El rojo es `test/rutas/registro-configurado.test.mjs › el alta automática de punta a punta` (esperaba `VALID`, llegó `DEGRADED`). Repetido **tres veces solo: 1 de 3 falla**. Es **intermitente por diseño**: monta la app contra el transporte falso sin fijar `rnd`, y el falso tiene `CAOS.ausente = 0,01` por punto (`fakeClient.mjs:87`). `HANDOFF.md` §8 ya avisa que afirmar un veredicto contra el falso produce intermitentes. Es la prueba, no el código → **F2.2** |
| `cd react-dashboard && npm test` | **1192 correctas · 20 omitidas** | |
| `npm run verificar` | **los 41 pasaron** (206 s) | |
| `verificar-herramientas` | **178 correctas · 45 omitidas** | `HANDOFF.md` §9 sigue diciendo «190 y 22» → **F4** |
| `npm run build` + `verificar-bundle` | `index` 343,8 / 450 · `vendor` 268,3 / 330 · `three` diferido | |

### 0.2 Los servicios externos

| Servicio | Estado | Detalle |
|---|---|---|
| ICONICS `https://bms-server/fwxapi/rest/v1` | alcanzable, token válido | `/api/health` del backend de `:3001` |
| `llama-server` `10.10.17.18:8080` | arriba, cinco presets | `qwen-3.5-4B` cargado; `ctx-size 65536`. **La caché de prefijo funciona**: con un prefijo de 19 227 tokens, la primera llamada procesa el prompt en 8,8 s y la segunda en **0,13 s** (`cache_n: 19213`). Generación: **44 tokens/s** |
| Embeddings `:8081` · Whisper `:8082` | arriba | Índice de manuales en «embeddings + BM25»: 6 documentos, 1016 fragmentos |
| API de Predicción `10.10.17.13:8000` | no responde | Irrelevante: módulo oculto desde el 22-09 y nadie lo sondea |

### 0.3 La planta, ahora mismo

**El motor está parado y el variador apagado.** Leídos los 76 puntos a las
08:51: `SPEED_BMS` 0, `FREQ OUTPUT` 0, **`DC BUS VOLTS` 0**, `READY TO RUN` 0,
`FAULT` 0; en los apoyos `vRMS` 0,009–0,027 mm/s y `aRMS` ≈ 0,096 m/s², calidad
buena. El HANDOFF describe la instalación girando a 602 rpm sin carga; hoy no
gira. No es del tablero, pero **condiciona lo que se puede verificar**: un
sondeo del historiador con la máquina parada compara ruido cerca de cero
(incidente del 22-09, `HANDOFF.md` §8) → **F1.4** espera a que gire.

**Seis puntos del V20 sin valor, calidad `2147483667` (Bad):** `HorasMarcha`,
`Numero de arranques`, `Temperaturadeldevanado`, `Corriente fase 1`,
`Corriente fase 2`, `Presion de aspiracion`. Son los que hacen que
`/api/health` diga **`degraded`** de forma permanente («70 de 76 trajeron
valor»), que la vista Salud salga en ámbar y que **cada respuesta del asistente
sobre el estado termine con «6 de 76 puntos no entregan lectura: eso no es una
máquina tranquila, es una máquina callada»** (`estadoVibraciones.js:355`).
Son tags que existen en ICONICS y no tienen fuente detrás → **F1.1**, decisión **D1**.

### 0.4 La máquina configurada

`datos/maquinas.json`: **una** máquina, `vib-motor-03` «Motor Vibraciones»,
alias «Pitt», tipo `vibraciones`, PLC `PLC_2 · ua:DEMO3`, **76 variables**,
seis activos: `Vibraciones` («Motor Vibraciones»), `S1` «Lado acople», `S2`
«Rodamiento intermedio», `S3` «Lado libre», **`V20` y `TORRETA` sin nombre**.
Una limitación propia («gira sin carga acoplada»).

**Amaneció en `UNKNOWN`** con la limitación derivada «La última revisión
(2026-09-24) no pudo comprobar esta máquina contra ICONICS». Comprobada desde
una sonda a las 08:46: **`VALID`, 76 de 76**, y quedó anotado (§0.8). Leído el
código, hay un camino que produce exactamente ese texto **sin que nadie haya
intentado comprobarla**:

1. `editar()` vuelve la máquina a `UNKNOWN` cuando cambia qué lee
   (`indices/maquinas.mjs:274`) y no toca `revisada`. Correcto.
2. `POST /sondear` anota las variables con **`estado: maquina.estado ?? UNKNOWN`**
   y `anotarRevision` estampa **`revisada: ahora`** (`maquinasRoutes.mjs:491`,
   `maquinas.mjs:366`).
3. `construirSistema.js:650` lee `UNKNOWN` + `revisada` y redacta «la última
   revisión no pudo comprobar», que es la frase de un corte de red, no la de
   «se editó y nadie volvió a verificar». Un fallo real de `/verificar` **no se
   anota nunca** (`maquinasRoutes.mjs:262`), así que ese texto sólo puede
   venir del paso 2.

El asistente cita esa limitación en cada respuesta. Quitar una variable (F1.1)
y sondear lo reproduce → **F2.3**.

**Series:** 62 de 76 verificadas. Las **14 sin verificar**: `MonState_a_f_S1/S2/S3`,
`MonState_v_f_S1/S2/S3`, **`aPeak_S3`, `aRMS_S3`**, las seis muertas del V20 y
`ESTADO_TORRETA`. Las `MonState_*_f` y `ESTADO_TORRETA` son constantes que el
criterio `registrada-constante` gana cuando dejan marca en la ventana. **`aRMS_S3`
y `aPeak_S3` son medidas del tercer apoyo sin historia verificada**: el Detalle
las enseña sin gráfica y `historia_de_senal` se niega a servirlas. → **F1.4**.

### 0.5 El asistente, contra el modelo real y la planta real

`node --env-file=.env.local scripts/medir-asistente-configurada.mjs --maquina vib-motor-03`
(349 s, 9 casos):

| Caso | Tiempo | Rondas | Llegó | Lo que dijo |
|---|---|---|---|---|
| inventario («¿qué máquinas hay?») | 25,6 s | 2 | — | **«En esta planta hay dos máquinas independientes… Tanque y grupo de bombeo»** |
| por nombre | 41,3 s | 2 | ✓ | «El Motor Vibraciones está en reposo» |
| riesgos por nombre | 37,2 s | 2 | ✓ | «4 riesgos activos» |
| desde su pantalla | 41,6 s | 2 | ✓ | «parada (0 rpm, 0 Hz, 0 kW)» |
| riesgos desde su pantalla | 31,7 s | 2 | ✓ | |
| apoyos | 40,4 s | 2 | ✓ | Cita valores con unidad |
| historia («Velocidad eficaz · Lado acople», 7 días) | 28,6 s | 2 | ✓ | El alias derivado funciona |
| manual («¿qué límites da la norma?») | **71,0 s** | 3 | ✓ | **12 llamadas a `limites_del_manual`** + `consultar_documentacion` |
| reporte | 31,7 s | 2 | ✓ | `generar_reporte(sistema, periodo="esta semana")` |

**9 de 9 llegan a la máquina, 0 se van a otra.** El encaminamiento está
resuelto. **El tiempo no**: 25–71 s por respuesta; el diario real (189
conversaciones con el 4B, 113 desde el 20-09) da **p50 39 s · p90 61 s ·
máximo 129 s**. Con la caché de prefijo activa y 44 tok/s, 35 s son ~1 500
tokens generados en dos rondas: la primera pasada razona (`pensar: true`,
`chat.mjs:1340`) con `IA_MAX_TOKENS=1536`, y `IA_MAX_PASOS=20` en `.env.local`
(defecto 3) permite las 13 llamadas del caso «manual» → **F3**, decisión **D2**.

**Restos del tanque que todavía llegan a la pantalla.** El Plan 44 F3.6 quitó
las ramas del tanque de las herramientas, pero no de estos sitios:

| Dónde | Qué dice | Cuándo se ve |
|---|---|---|
| `shared/eva/vibraciones/estadoVibraciones.js:355` (`aviso`) | **«OTRA MÁQUINA, no el tanque: no relaciones estas vibraciones con su caudal, presión ni nivel…»** | Al final de **cada** `estado_del_sistema`: el modelo lo lee dentro del resultado y lo copia (§A) |
| `chat.mjs:1987` `avisoDeBloqueo()` | «Puedo leer el estado actual de las N señales del **sistema de agua**…» | Cuando la guarda bloquea una respuesta con cifras sin herramienta. Pasó el 23-09 17:30 («¿Qué es vivi?», bloqueada) |
| `chat.mjs:1966` `noSeQueContestar()` | «…toda la instalación de **agua** —sus N señales—…» | Cuando el modelo se queda mudo |
| `historicos/index.mjs:685` `perfil_de_senal` | `leerMaquina(SISTEMA.tanque)` para «el valor de ahora» | En todo perfil de una señal de vibraciones |
| `registro/index.mjs:56` `sistemas_de_la_planta` | `resumenDeSistemas()` (`sistemas.js:968`) no expone `cerrado` | «¿qué máquinas hay?» enumera el tanque |
| `lib/formato.mjs:133` `avisoDeUmbrales` | «estimaciones nuestras para un **sistema de agua** genérico» | Con `PROVISIONALES`, en `historia_de_senal`, `comparar_periodos`… |

Y dos cosas más de la misma respuesta (§A): inventa la causa de los seis
puntos sin lectura («probablemente alarmas o contadores del servidor de
alarmas»: son los del V20), y el primer riesgo que narra es «**Crítico**: el
diagnóstico de rodamientos está apagado en los tres apoyos», que es cierto
(`MonState_e_f_*` en posición 0 en el SM 1281, `HANDOFF.md` §6) y es
configuración del equipo, no del tablero.

### 0.6 Los datos del despliegue

| Archivo | Estado | Efecto |
|---|---|---|
| `datos/aprendizaje.json` | **1 intervención** de `vib-motor-03` (23-09 23:44, «Vibración alta en el apoyo S1…», **`causa: null`**), **1 hecho** («suministro eléctrico: 220 V», 03-09) y **5 propuestas** de la era del tanque («carga del motor > 85 % y caudal < 20»…) | «Casos previos» enseña la intervención con la causa vacía; `hechos_de_la_planta` devuelve el hecho del tanque al modelo; las propuestas no se pintan en el tablero |
| `datos/diario-conversaciones.jsonl` | 2 630 entradas, **2 441 de las pruebas** (`modelo-de-prueba`, `local`) | La suite de backend escribe en **`datos/` del despliegue**: los diarios se resuelven desde `PROJECT_ROOT` (`config.mjs:744`), no desde el `cwd`. Ninguna vista lee este diario, pero es la B17 con otra cara → **F2.1** |
| `datos/diario-diagnosticos.jsonl` | Entradas `huerfano: true` de la tanda de hoy | Idem |
| `backend/datos/aprendizaje.json` | **16 intervenciones** de prueba, otra vez (se borró el 22-09) | La B17 tal cual |
| `Documentacion/.manifiesto.json` | ISO 20816-3 (47 fragmentos), TS001.9 (4), `v20 siemens.pdf` (917) en **`tipo:vibraciones`**; tres manuales en `tanque` | Correcto |

### 0.7 Las ramas

`UI-Limpieza1.0` (`33a6f6b`, igual en `origin`) va **16 commits por delante**
de `DemoVibraciones4.0` (`872df57`), que es su ancestro: el merge es
fast-forward. `AjustesGustavo5.0` (`9854c71`) **no tiene commits propios** y va
2 por detrás de la de la demo. Sin conflicto posible hoy.

### 0.8 Lo que esta auditoría cambió en el despliegue

Se levantó un backend propio en `:3101` con `AUTH_HABILITADA=false` contra la
planta real, para leer la máquina sin credenciales. Desde él,
**`POST /api/maquinas/vib-motor-03/verificar`** → `VALID` 76/76, **anotado en
`datos/maquinas.json`** (`estado`, `revisada`): la máquina pasó de `UNKNOWN` a
`VALID`. Dos preguntas al asistente quedaron en el diario de conversaciones.
Se apagó al terminar. Las tandas dejaron además la basura de §0.6. No hay
commit: el plan se entrega sin comitear.

---

## 1. Definición de «listo», y dónde está cada punto

El ciclo de `PRODUCT.md`, punto por punto. ✓ = hace lo que dice y está
medido · ◐ = funciona pero con un resto que desmiente algo · ✗ = falta.

| | Promesa | Hoy | Qué falta |
|---|---|---|---|
| ✓ | **Configurar** desde el árbol (`ac:`/`hda:`/`ae:`), roles del tipo, nombre y alias por activo, limitaciones | Probado en planta el 22 y 23-09 | Nombrar `V20` y `TORRETA` (F1.2) |
| ◐ | **Verificar**: cada punto existe, cada serie es la suya | 76/76 `VALID`; 62/76 series | Seis tags sin fuente (F1.1, D1); `aRMS_S3`/`aPeak_S3` sin historia (F1.4); una máquina editada dice «no pudo comprobar» sin haberlo intentado (F2.3) |
| ✓ | **Documentar**: manuales al tipo, búsqueda semántica + BM25 | 3 manuales en `tipo:vibraciones`, índice cargado | — |
| ◐ | **Consultar**: 26 herramientas sobre la máquina de delante, sin inventar | 9/9 llegan; cita unidades; se niega a lo que no puede | Restos del tanque en seis sitios (F2.4, F3.1–3.4); causa inventada de los puntos mudos (F2.4); 25–71 s por respuesta (F3.5, D2); guarda de URL inventada pendiente (F3.6) |
| ◐ | **Diagnosticar y aprender**: motor determinista, cierre con causa, casos previos | 19 reglas, cierre probado | La única intervención tiene `causa: null`; hecho y propuestas del tanque en la bitácora (F1.3, D3) |
| ✓ | **Reportes** por plantilla | 7 de 8 contra planta, 5–6 s | `predicciones` apagado a propósito y declarado (Plan 44 D12) |
| ✓ | **La ausencia de dato no se disfraza** | Mudas listadas, huecos con motivo | — |
| ◐ | **Lo que no puede hacer, lo declara** | Alarmas sin vista (Plan 41 F4), sin carga, sin pronóstico: declarados | La declaración de UNKNOWN miente (F2.3); `HANDOFF.md` declara como bloqueante algo que ya no lo es (F4) |
| ◐ | **La tanda dice la verdad** | 41 verificadores, dos suites | Una prueba intermitente (F2.2); la suite ensucia el despliegue (F2.1) |
| ✓ | **Cerrado no es borrado** (tanque) | Dominio intacto, vistas borradas, pruebas omitidas con motivo | — |

**Lo que se queda como límite declarado**, y no entra en este plan porque no
depende del código o ya está decidido:

- **Alarmas de la máquina configurada**: el Alarm Server da 500 a `AlarmHistory`
  y las banderas nunca cambiaron; la cadena de flancos está probada y la vista
  se hace con el primer evento real (F11 del backlog de frontend).
- **Pronóstico**: sin mecanismos de desgaste declarados no hay plazo (Plan 44 D12).
- **Factor de cresta y «con carga»**: el motor gira sin nada acoplado.
- **Diagnóstico de rodamientos**: apagado en el SM 1281. Es del equipo.
- **El tanque como máquina configurada**: Plan 43, reservado; es el final de la rama.
- **Predicción**: oculto, otra fuente, su API no responde.

---

## 2. Fases

### F0 · Auditoría — **completada el 24-09-2026**

Lo de §0. Tres decisiones quedan para el usuario:

| # | Decisión | Bloquea |
|---|---|---|
| **D1** | Las seis variables del V20 sin fuente (`HorasMarcha`, `Numero de arranques`, `Temperaturadeldevanado`, `Corriente fase 1/2`, `Presion de aspiracion`): ¿se conectan en el PLC/ICONICS, o se quitan de la máquina? Si no hay fecha para conectarlas, quitarlas: un tag que existe sin fuente no es una medida | F1.1 |
| **D2** | Presupuesto del asistente: ¿Gustavo mide `pensar` acotado e `IA_MAX_PASOS` menor esta semana, o se acepta 25–71 s como está? Es su zona | F3.5 |
| **D3** | La bitácora: ¿se cierra bien la intervención de `vib-motor-03` (o se purga) y se purgan el hecho y las cinco propuestas del tanque? | F1.3 |

Y una de trámite: ¿el plan se comitea tal cual?

### F1 · El despliegue, completo y sin ruido

**Objetivo.** Que lo configurado sea exactamente la máquina que hay.
**Dependencias:** D1, D3, y que el motor gire para F1.4. **Sin commit**
(`datos/` no se versiona).

1. **Las seis variables sin fuente** (D1). Si se quitan: editor → la máquina
   vuelve a `UNKNOWN` por diseño → **Verificar** → `VALID` con 70. Evidencia:
   `/api/health` en `ok`; el pie del asistente deja de contar puntos mudos.
2. **Nombrar `V20` y `TORRETA`** en el editor. Evidencia: Planta y el
   asistente los llaman por su nombre.
3. **La bitácora** (D3): cerrar la intervención desde Cierre de diagnóstico
   con su causa, o purgarla con
   `scripts/purgar-casos-invalidos.mjs --vaciar-intervenciones --ejecutar`
   (deja copia). Para el hecho y las propuestas del tanque no hay guion: se
   edita `datos/aprendizaje.json` con copia al lado y se anota aquí.
4. **Sondear con el motor girando**. Evidencia: `aRMS_S3` y `aPeak_S3`
   verificadas; «sin verificar» baja de 14 a las constantes que no dejaron
   marca en la ventana, y ninguna «compartida».
5. **Vaciar los diarios de prueba** (`datos/diario-conversaciones.jsonl`,
   `datos/diario-diagnosticos.jsonl`, copia al lado) y borrar
   `backend/datos/aprendizaje.json`. Hasta F2.1, no correr `npm test` del
   backend en el equipo que sirve.

**Criterio de aceptación:** `GET /api/maquinas/vib-motor-03` en `VALID`, seis
activos con nombre, `/api/health` en `ok`, «Casos previos» con lo decidido.

### F2 · Defectos en la zona de Moisés (`shared/`, rutas, pruebas)

Un commit por punto, cada uno con su prueba que falla sin él (`CLAUDE.md` §6.2).
Antes de tocar `shared/eva/**`, la tanda de vibraciones (§5.6).

- **F2.1 La suite no escribe en el despliegue.** `montarApp` ya usa un
  `maquinas.json` propio; hacer lo mismo con los tres diarios y la bitácora
  (`mkdtemp`, como los verificadores). Es la B17 ampliada. Evidencia: `npm test`
  no cambia `datos/*.jsonl` ni crea `backend/datos/aprendizaje.json`.
- **F2.2 `registro-configurado.test` determinista.** Inyectar `rnd: () => 0.99`
  en el cliente falso de esa prueba (como ya hace su línea 131). Verlo fallar
  con `rnd: () => 0` antes de darlo por bueno.
- **F2.3 Una máquina editada dice la verdad.** (a) `POST /sondear` no estampa
  `revisada` con un estado que no midió: anota las variables sin tocar
  `estado`/`revisada`, o sólo cuando `estado` es `VALID`/`DEGRADED`.
  (b) `construirSistema.js:650`: el `UNKNOWN` con `revisada` pasa a decir «sin
  comprobar desde que cambió su lista de variables (fecha)». **Archivo
  caliente** (`HANDOFF.md` §0): commit solo y aviso a Gustavo.
- **F2.4 El pie de `estadoVibraciones.js:355`** deja de nombrar al tanque y
  de dejar que el modelo invente la causa de los puntos mudos: dice lo que SÍ
  (historia de medidas, banderas y variador), lo que NO (plazo a una avería)
  y **cuáles** puntos no entregan lectura (por id), sin «OTRA MÁQUINA». Es
  dominio, pero cambia lo que ve el asistente: aviso a Gustavo antes;
  `verificar-herramientas` y `verificar-riesgos-vibracion` como puerta.
- **F2.5 `resumenDeSistemas()` expone `cerrado`** (`sistemas.js:968`) para que
  la herramienta de Gustavo (F3.2) pueda filtrar o marcar. Una línea; archivo
  caliente; commit solo.

**Criterio de aceptación:** las tres suites y `npm run verificar` verdes
**tres tandas seguidas** (por F2.2), sin cambios en `datos/` tras correrlas.

### F3 · El asistente (zona de Gustavo; aquí se entrega la lista, no se toca)

Todo en `backend/ia/**`, con línea y reproducción. Prioridad por lo que
desmiente la promesa de «sobre la máquina de delante».

| Pri. | Qué | Dónde | Reproducción / arreglo |
|---|---|---|---|
| 1 | **F3.1** `avisoDeBloqueo()` y `noSeQueContestar()` hablan del sistema de agua y cuentan las señales del tanque | `chat.mjs:1966`, `:1987` | Preguntar algo sin herramienta desde la pantalla de la máquina. Derivar el texto de `contexto.sistema` o de `SISTEMAS_EN_SERVICIO` |
| 1 | **F3.2** `sistemas_de_la_planta` enumera el tanque cerrado | `registro/index.mjs:56` | «¿qué máquinas hay?» → «dos máquinas». Con F2.5, filtrar por `!cerrado` o decir que está cerrada |
| 2 | **F3.3** `perfil_de_senal` lee `SISTEMA.tanque` para «el valor de ahora» | `historicos/index.mjs:685` | Usar `SISTEMA[sistemaId]` |
| 2 | **F3.4** `avisoDeUmbrales` «sistema de agua genérico» | `lib/formato.mjs:133` | Redactar por tipo, o genérico |
| 2 | **F3.5** Tiempo por respuesta 25–71 s (D2) | `chat.mjs:1340` `pensar: true`; `.env.local` `IA_MAX_PASOS=20`, `IA_MAX_TOKENS=1536` | `medir-asistente-configurada.mjs` antes y después. La caché de prefijo ya funciona; el coste es razonamiento y rondas. Probar `pensar` acotado y `IA_MAX_PASOS` en 3–5 (el caso «manual» hizo 13 llamadas) |
| 3 | **F3.6** Guarda de URL inventada (pendiente del Plan 44 F3.4) | `chat.mjs` | Una URL en la respuesta sin adjunto emitido en el turno se bloquea como una cifra sin herramienta |
| 3 | **F3.7** Tras F1.1 y F2.4, re-medir juntos `verificar-herramientas` y `medir-asistente-configurada` | | |

**Criterio de aceptación:** la puerta (`CLAUDE.md` §5.1) verde, y
`medir-asistente-configurada` en 9 de 9 con ninguna respuesta que nombre al
tanque.

### F4 · La documentación dice lo que el código hace

Un commit. Lo desactualizado, con línea:

- `HANDOFF.md:531` «El historiador de vibraciones no devuelve nada» como
  **bloqueante**: falso desde el Plan 44 (62 series, siete reportes contra
  planta). `:813` «190 correctas y 22 omitidas» → 178 y 45. §1: el motor está
  parado desde el 24-09; los seis tags del V20 sin fuente; qué se hizo aquí.
- `README.md:97` «Node.js 18» → 24 (`.nvmrc`); `:43` «sin histórico
  utilizable» para vibraciones; `:50` «dar de alta una es añadir una entrada
  en `sistemas.js`» → es configuración desde `Planta › Configuración`.
- `docs/DEMO-MODULOS.md`: 22 herramientas y el tanque abierto. Una nota al
  principio remitiendo a `PRODUCT.md` y a este plan, o moverlo a
  `docs/obsoletos/`.
- `CLAUDE.md` §5.1 y `backend/README.md`: comprobar cifras tras F2.

**Criterio de aceptación:** ninguna cifra de pruebas en los tres documentos
distinta de la que imprime la tanda ese día.

### F5 · Cierre: lo que queda declarado

**Objetivo.** Que cada límite de §1 esté escrito en el sitio donde alguien lo
va a buscar, no sólo en un plan.

1. Las **limitaciones propias** de `vib-motor-03` en el editor: «sin carga
   acoplada» (ya), «diagnóstico de rodamientos apagado en el SM 1281» (hoy es
   una regla del tipo que sale como riesgo «Crítico»; si el equipo no lo va a
   activar, la limitación lo dice y el asistente lo cita como configuración,
   no como avería) — decisión del usuario.
2. **Alarmas**: la ficha de la máquina o Inicio dicen ya por qué no hay
   historial (Plan 41 F4). Comprobar que el texto sigue siendo cierto.
3. Los **backlogs**: volcar lo que este plan no hace (B14, B15, F7/F8 del
   backlog de frontend, la B17 si F2.1 no la cierra entera).

### F6 · Merge y etiqueta

Cuando F1–F4 estén verdes: traer a `UI-Limpieza1.0` lo que Gustavo haya
empujado a `DemoVibraciones4.0`; `git merge UI-Limpieza1.0` allí (hoy
fast-forward) y `AjustesGustavo5.0` si trae algo; tanda completa y puerta en
esa rama; `npm run build` + `verificar-bundle`; `git tag vibraciones-listo-2026-09-29`.
**Push sólo si se pide en ese turno.** Después, este plan se reescribe con lo
que pasó y se archiva en `docs/completados/`.

---

## A. La respuesta completa que hoy da el asistente

«¿Cómo está esta máquina ahora mismo?», con `contexto.sistema = vib-motor-03`,
37,2 s, 2 rondas, `estado_del_sistema` una vez. Texto íntegro:

> La máquina **Motor Vibraciones** está **parada** (0 rpm, 0 Hz).
>
> Aquí está el estado actual:
>
> - **Estado de operación:** La máquina está en reposo. No hay carga (0 kW, 0% de par) y el variador está en 0.
> - **Vibraciones:** Lado acople: Velocidad eficaz 0.014 mm/s, Aceleración eficaz 0.096 m/s². Rodamiento intermedio: 0.014 mm/s, 0.097 m/s². Lado libre: 0.026 mm/s, 0.096 m/s². *Nota:* Las vibraciones son muy bajas, lo cual es esperado al estar parada.
> - **Problemas detectados (Riesgos):** 1. **Crítico:** El diagnóstico de rodamientos (frecuencias BPFO, BPFI, FTF) está **apagado** en los tres apoyos. 2. **Atención:** Hay medidas que se publican pero no se comparan con ningún límite. 3. **Informativo:** La máquina gira demasiado despacio (0 rpm) para aplicar la norma ISO 10816-1, que requiere al menos 600 rpm. 4. **Informativo:** La máquina gira sin carga.
> - **Datos faltantes:** No se pudieron leer 6 de las 76 señales (probablemente alarmas o contadores del servidor de alarmas).
>
> **Resumen:** La máquina está parada y en vacío. Aunque las vibraciones medidas son normales para ese estado, hay una alerta crítica de que el sistema no está vigilando las frecuencias de defecto de los rodamientos.
>
> ⚠ OTRA MÁQUINA, no el tanque: no relaciones estas vibraciones con su caudal, presión ni nivel. SÍ hay histórico de sus medidas, banderas y variador: se puede consultar con historia_de_senal(sistema="vib-motor-03"). Lo que NO se puede es poner plazo a una avería: esta máquina no tiene mecanismos de desgaste declarados. Ahora mismo 6 de 76 puntos no entregan lectura: eso no es una máquina tranquila, es una máquina callada.

Lo que está bien: valores con unidad, apoyos por su nombre, ninguna cifra
inventada, «parada» porque el variador publica cero. Lo que este plan corrige:
la causa inventada de los seis puntos (F1.1, F2.4), el pie del tanque (F2.4),
los 37 s (F3.5), y que «Crítico» sea configuración del equipo (F5.1).

## B. Cómo se midió (para repetirlo)

```bash
# La tanda (§0.1)
npm run lint && npm run types && npm run verificar
cd backend && npm test          # ojo §0.6: escribe en datos/ hasta F2.1
cd react-dashboard && npm test && npm run build && node ../scripts/verificar-bundle.mjs

# Planta y modelo (§0.2–0.5), desde la raíz
curl -s http://localhost:3001/api/health
curl -s http://10.10.17.18:8080/v1/models
node --env-file=.env.local scripts/medir-asistente-configurada.mjs --maquina vib-motor-03
node --env-file=.env.local scripts/medir-reportes-en-planta.mjs

# Leer la máquina sin credenciales: un backend propio sin autenticación en otro puerto
AUTH_HABILITADA=false PORT=3101 node --env-file=.env.local backend/server.mjs
curl -s "http://localhost:3101/api/maquinas/vib-motor-03"
curl -s "http://localhost:3101/api/iconics/data/batch?points=<los 76 pointName, separados por coma>"
```

La caché de prefijo de `llama-server` se midió con dos llamadas seguidas a
`/v1/chat/completions` con el mismo `system` de 19 227 tokens y
`max_tokens: 16`, leyendo `timings.cache_n` y `timings.prompt_ms`.
