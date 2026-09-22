# PLAN 41 — Cerrar Vibraciones 1.0: lo que de verdad queda

**Estado:** **F0 y F2 completadas** (22-09-2026: navegador confirmado, Plan 38 archivado, `decodificarVigilancia` y el índice de sinónimos en el tipo) · F1 a medias (sondeo en marcha hecho; quedan los pasos 2–4 en planta) · F3–F5 por completar · escrito el 22-09-2026 tras sondear los cinco planes vivos
**Rama:** `Vibraciones1.0`
**Fecha:** 22-09-2026

> Nace de un encargo del usuario: «vuelve a sondear estos planes, hay cosas que
> ya no se necesitan / ya se arreglaron». El sondeo se hizo contra el código,
> no contra lo que los planes dicen de sí mismos, y **encontró tres fases dadas
> por pendientes que ya estaban hechas y una que es imposible**. Este plan
> recoge sólo lo que sobrevivió a esa comprobación.

---

## 0. Qué encontró el sondeo

La razón de que este plan exista es que **los planes vivos exageraban lo que
faltaba**. Cinco documentos abiertos sugerían un mes de trabajo; lo que de
verdad queda son **dos fases de código, un paso en planta y una confirmación
en pantalla**.

| Se daba por pendiente | Lo que se midió el 22-09-2026 | Veredicto |
|---|---|---|
| **32 F4** · `necesita` en 8 reglas | Las **17** reglas de `riesgosVibracion.js` lo declaran, y el motor lo consume en la línea 811 | ✅ ya estaba |
| **32 F4** · factor de cresta | `aPeak_S1` **es** la serie de `aRMS_S1`: 1805 de 1805 idénticas (`vibraciones.js:1151`) | ⛔ imposible en S1 |
| **32 F5** · `terminosManual` | Declarados en las 4 medidas (`vibraciones.js:523-567`) y propagados por el tipo; Plan 39 F3 cerró los manuales por TIPO | ✅ ya estaba |
| **32 F2** · historiador | `sondearSeries.mjs` gana `historyVerified` por variable; el esquema lo rechaza del cliente | ✅ el código; falta planta |
| **38 F2** · registro | 8 rutas `maq-*` en `routes.jsx`, no las 3 que el Plan 37 describía | ✅ ya estaba |
| **32 F6** · sinónimos | `vocabulario` llega a la configurada pero **sólo alimenta el dictado** (`voz.mjs:79`) | ⬜ queda |
| **37 F4** · Alarmas | No existe ruta `maq-alarmas`; `AlarmasEva` lee las señales del **tanque** | ⬜ queda |

**Lo que se archivó en el mismo encargo**, por no ser trabajo vivo:

- **Plan 13** — borrado. Cero referencias en el árbol.
- **Plan 19** — a `completados/`. F4/F5/F7 dependen de una API que no llegó, y
  Predicción ya salió del menú (`b06ba57`). **No se borró**: lo citan 7
  archivos de código, uno de ellos lo **enseña en pantalla al usuario**.
- **Plan 8** — a `completados/`. Sólo quedaba `PROVISIONALES = true`, que es
  una confirmación de planta y además intocable con el tanque cerrado.
  **No se borró**: es el único registro de por qué esa bandera está en `true`.

### La línea base, medida hoy

Antes de tocar nada, todo en verde. Cualquier rojo que aparezca durante este
plan es de este plan:

```
npm run verificar                      →  41/41 pasaron (213,7 s)
verificar-herramientas (ICONICS_FAKE)  →  190 correctas · 22 omitidas
                                          (13 de las 190 sobre una configurada)
```

---

## 1. Las fases

Ordenadas por lo que desbloquean. **F0 y F1 no son de código** y son las que
más cierran: entre las dos confirman tres planes.

---

### F0 — Confirmar en el navegador lo que ya está escrito ✅

**Completada el 22-09-2026.** El usuario recorrió el muro, el menú y las siete
vistas con `vib-motor-03` y el asistente delante; todo pintó. Salió **un
defecto del tipo**, corregido en esta misma fase (abajo).

**Objetivo.** Cerrar la confirmación pendiente de los Planes 37, 38 y 40 sin
escribir una línea.

**Por qué primero.** Las siete vistas de la sección de `Nuevo-Modor` caían en
el primer render el 21-09; **está corregido y nadie ha vuelto a entrar**. Hasta
que alguien mire, tres planes siguen abiertos por una pantalla, no por código.

**Cómo.** Con el backend arrancado, entrar a la sección de `Nuevo-Modor` y
recorrer las **siete** vistas: Inicio, Gráficas, Vista 3D, Hallazgos, Avisos,
Casos previos y RAG documental. Después el **muro de planta**, que desde el
Plan 40 F2 es la ruta por defecto.

**Criterios de aceptación.**

- [x] Las siete vistas pintan sin caerse, y pintan **sus** apoyos, con el
      nombre que tengan en el árbol (hoy S1/S2/S3 sin nombre, como en planta).
- [x] El muro de planta enseña **un panel por configurada** («Nuevo-Modor ·
      Sin lectura · El valor de daño no tiene referencia aprendida»).
- [x] Lo que la máquina no tiene sale como **hueco, no como cero**: los tres
      apoyos dicen «Sensibilidad de esta sonda sin confirmar», y el estado de
      alarmas «—» donde no hay severidad.
- [x] El asistente, preguntado desde esa pantalla, contestó sobre
      `Nuevo-Modor`: tres apoyos en zona A, 604 rpm en vacío, 17 alarmas
      vueltas a normal sin reconocer, «3 de 95 señales sin lectura», y con el
      aviso de OTRA MÁQUINA (no relacionarla con el tanque).

#### Lo que se vio, y lo que salió de mirar

**«92 / 95, 3 sin dato».** Los tres se identificaron leyendo los puntos en
vivo (`/api/iconics/data/batch`) y reproduciendo el cálculo de la vista con
`construirSistema(...).estado(...)`:

| Punto | Qué pasa | Veredicto |
|---|---|---|
| `S3/MonState_vRMS_S3` | calidad `2147483660` (bit alto OPC: *bad*), sin valor; también fue «sin muestras» en el historiador | **punto muerto en el servidor**, en vivo y en histórico |
| `ae:…=ActiveAckedMaxSeverity` | calidad buena, sin valor | legítimo: **0 alarmas activas**, no hay severidad máxima |
| `ae:…=ActiveUnackedMaxSeverity` | ídem | ídem |

*Observación, no arreglo:* contar «no hay alarmas» como «sin dato» es honesto
por §2.4 pero discutible; se deja anotado. El **95** (la máquina se grabó con
94) era el usuario editando desde la pantalla: añadió `TORRETA` y después
quitó los 6 contadores del área → **89 variables**, sin el asset del área de
alarmas. Es su decisión; consecuencia declarada: el panel «Servidor de alarmas
de ICONICS» se queda sin fuente y `alarmas-activas` / `alarmas-sin-reconocer`
pasan a no evaluables.

**El defecto del tipo, corregido aquí.** `decodificarVigilancia`
(`shared/eva/vibraciones/vibraciones.js`) sólo entendía la **cadena base64**
del arreglo de bytes, que es como publicaba el módulo en el catálogo a mano.
Los 24 `MonState_*` de la configurada llegan como **entero** con calidad
buena —`1` en vRMS/aRMS/DKW/a_f/v_f, `0` en BPFI/BPFO/FTF—, exactamente las
posiciones medidas el 26-08 como `[0 1 0 0]` y `[1 0 0 0]`: el servidor
publica el índice en vez del arreglo. Con el decodificador viejo, el dominio
marcaba **24 vigilancias como sin dato teniendo valor** (el fallo inverso a
§2.4). Ahora acepta las dos formas; las posiciones 2 y 3 siguen sin
confirmar en ambas; un booleano sigue siendo `null` a propósito.

Medido con la lectura real: `dominio.sinDato` pasó de **24 a 2**. Los dos
que quedan son de la instalación, no del tablero: `MonState_vRMS_S3` (muerto,
arriba) y **`vigilancia:monVRMS@S2`**, porque el servidor llama a ese tag
`MonState_vRMS_2` —sin la `S`— y el reconocimiento de roles no lo emparejó.
**Para quien configure**: asignarle el rol en el editor, o añadir el alias en
`aliasDeTags.js`. Es el paso 4 de F1 en otra forma: nombres del árbol.

La prueba nueva en `verificar-riesgos-vibracion.mjs` se vio **fallar** con el
arreglo retirado (`Cannot read properties of null`) antes de darla por buena.
Después: puerta §5.1 verde (190/22 herramientas, 71 chat), `riesgos-vibracion`
41, `dominio-configurado` 13, `vibraciones-configurada` 35, lint, tipos y la
carpeta `test/demo-eva` (712). Un rojo intermitente en
`fuente-de-maquina.test.js` no se repitió ni solo ni en la segunda tanda:
contención, como describe `HANDOFF.md` §9.

**Al cerrarse:** el Plan 38 queda **completado** (no le queda código); el Plan
37 pierde su nota de «falta volver a entrar».

#### Preparación local, 22-09-2026

**El backend local arrancó sin ninguna máquina.** `datos/maquinas.json` nació
vacío a las 11:44, en el mismo arranque (36 bytes), y `GET /api/maquinas`
contestó `cuantas: 0`. Sin embargo el diario de diagnósticos guarda **192
entradas de `vib-motor-03` en las últimas 24 h**: la máquina existió en este
mismo backend el 21-09 y hoy no estaba. La `Nuevo-Modor` de la que habla el
Plan 40 F4 es la del `maquinas.json` **de planta**; aquí había que recrearla.

Se recreó **por el mismo camino que la pantalla**, contra el `bms-server`
real, sin tocar el editor: `POST /api/maquinas/descubrir` sobre
`ac:TDCON/DEMO_VIBRACIONES/Vibraciones/` con `hda:\Configuration\DEMO_VIBRACIONES`
y `ae:/DEMO VIBRACIONES`, y el cuerpo del alta armado con las mismas funciones
del dominio que usa `EditorDeMaquina.jsx` (`configuracionDesdeMarcas`,
`normalizarRaizHistorica`, `problemasDeMaquina`).

Lo que devolvió el árbol, medido: **174 puntos en vivo, 117 series en el
historiador, 101 emparejadas por nombre**; 65 con rol. De los 174, se dejaron
fuera —igual que haría quien marca el árbol— el espejo de alarmas `Alarm/`
(43), los medidores de energía `Jaritza/L1` y `L2` (18), `Pantalla`,
`TORRETA` y los `.Attributes` de cada carpeta (nodo de sistema, no señal).
Se dejaron S1, S2, S3 y la carpeta del variador `V20`, **más los tres
`Sensoroffset_S*` que cuelgan de `NOT_USED/`**: el tipo exige `bandera:offset`
y sin ellos `problemasDeMaquina` avisaba. Resultado: **94 variables, las
mismas que el Plan 37 registra para la de planta**; 65 con rol, 73 con serie;
6 assets (raíz, S1, S2, S3, V20 y el área de alarmas), **todos sin `nombre`**,
que es como está la de planta hasta el paso 4 de F1.

`POST …/verificar`: **VALID, 94 de 94 presentes en ICONICS.**

Un tropiezo propio, anotado para que no se repita: el primer alta grabó
`arboles.historico` como `hda:ConfigurationDEMO_VIBRACIONES` —bash se comió
las barras al pasar por `node -e`—; se corrigió con `PATCH` y la máquina
siguió VALID. Las `historyPointName` por variable no se vieron afectadas
porque venían del descubrimiento.

**Lo que falta de F0 es exactamente el navegador**, con estas URLs:

```
http://localhost:5173/eva-muro                        el muro (ruta por defecto)
http://localhost:5173/maq-inicio?maquina=vib-motor-03
http://localhost:5173/maq-graficas?maquina=vib-motor-03
http://localhost:5173/maq-3d?maquina=vib-motor-03
http://localhost:5173/maq-hallazgos?maquina=vib-motor-03
http://localhost:5173/maq-avisos?maquina=vib-motor-03
http://localhost:5173/maq-casos?maquina=vib-motor-03
http://localhost:5173/maq-rag?maquina=vib-motor-03
```

---

### F1 — Los pasos en planta (Plan 40 F4), con sus criterios

**Objetivo.** Que la única máquina de vibraciones en planta sea `Nuevo-Modor`,
con sus series verificadas en marcha.

**Por qué aquí.** Es lo único que desbloquea la **F2 del Plan 32**, y por tanto
su F3. No se puede hacer desde el repo: **necesita ICONICS delante**.

**Cómo.** Cuatro pasos, del usuario:

1. **Con el motor girando**, en la ficha de `Nuevo-Modor`, «Sondear sus
   series». En paro quedaron **33 sin muestras**; anotar aquí cuántas quedan
   verificadas ahora.
2. Si `vibraciones-configurada` sigue en el `datos/maquinas.json` de planta,
   **darla de baja o dejarla inactiva**: dos configuradas sobre la misma raíz
   se solapan y el registro se queda con la primera.
3. En `Planta › Documentación`, pasar la **ISO 20816-3**, el manual del **SM
   1281** y el del **V20** a «Todas las de Vigilancia de vibraciones». Siguen
   asignados a `vibraciones`, que ya no existe, así que hoy **no los ve
   ninguna máquina**.
4. **Dar nombre a los tres apoyos en el árbol** (`S1` → «Lado acople», etc.).
   Una configurada saca el nombre del apoyo de `assets[].nombre`, y sin él el
   asistente dice «S1 (S1, bearing unidentified)».

**Criterios de aceptación.**

- [ ] `medir-asistente-configurada` corre sobre `Nuevo-Modor` **sin otra
      vibraciones en el registro**, y su resultado se anota aquí.
- [ ] El número de series verificadas queda escrito (el «33 sin muestras» del
      sondeo en paro es la referencia contra la que se compara).
- [ ] El asistente nombra los apoyos por su nombre, no por `S1`.

**Al cerrarse:** el Plan 40 queda **completado**. El Plan 32 F2 y F3 se cierran
detrás, sin trabajo de código.

#### Línea base del sondeo EN PARO, local, 22-09-2026

Al recrear la máquina (F0) se sondeó contra el historiador real con el motor
parado. Es la referencia contra la que se compara el sondeo en marcha del
paso 1, y tardó **20 s** para 73 series:

```
20 verificadas como propias   13 comparten serie   37 no varían   3 sin muestras   0 fallos
→ estado DEGRADED · «53 de 73 series declaradas están sin sondear» va a limitaciones
```

- **Verificadas (20):** las 12 medidas de los tres apoyos (`vRMS`, `aRMS`,
  `aPeak`, `DKW` × S1–S3) y 8 del variador (`FREQ OUTPUT`, `SPEED`, `CURRENT`,
  `TORQUE`, `TOTAL KWH`, `DC BUS VOLTS`, `ENABLED`, `READY TO RUN`).
- **Compartidas (13):** las **nueve `QC_*` son una sola serie** —el defecto ya
  escrito en `vibraciones.js`—, más **dos parejas entre carpetas distintas**:
  `UPPER_LEVEL_2 ↔ ACTUAL PWR_BMS` y `OUTPUT VOLTS_BMS ↔ Numero de arranques`.
  **Sospecha, no afirmación:** con el motor parado, dos series constantes
  coinciden en todos sus valores sin ser la misma. El sondeo en marcha dirá
  si es un defecto del servidor o un falso positivo del criterio en paro.
- **Sin variación (37):** las `MonState_*`, los `LOWER/UPPER_LEVEL`, los tres
  `Sensoroffset`, el estado del variador (`FAULT`, `WARNING`…) y las señales
  del motor (`Temperaturadeldevanado`, corrientes, presión). Es lo esperable
  con el motor parado y **la razón de que el paso 1 exija sondear girando.**
- **Sin muestras (3):** `MonState_aRMS_S2`, `MonState_vRMS_S3`, `HorasMarcha`.

#### Lo que ya se dio de F1, 22-09-2026 (tarde)

El usuario puso el motor en marcha (603 rpm, **en vacío**: par −0,05 %,
0 kW) y se repitió el sondeo: **19 propias, 13 compartidas, 37 sin variación,
12 sin muestras, 8 no se pudieron leer**, sobre las 89 variables que la
máquina tenía en ese momento (el usuario la estaba editando). Lecturas:

- **`aPeak_S1` volvió a salir como serie PROPIA**, distinta de `aRMS_S1`. Dos
  sondeos (paro y marcha) contra la medida del 21-09. Va a F3.
- Las 37 «sin variación» son casi todas **banderas y estados que deben ser
  constantes** (MonState, Alarma, Warning, offsets, FAULT): es un límite del
  criterio del sondeo, no un fallo de la máquina. Una serie constante no se
  puede distinguir de otra constante, y el sondeo lo dice así.
- Las dos parejas compartidas entre carpetas (`UPPER_LEVEL_2 ↔ ACTUAL
  PWR_BMS`, `OUTPUT VOLTS_BMS ↔ Numero de arranques`) **persisten en marcha**.
  Con el motor en vacío la potencia sigue en 0, así que la sospecha del falso
  positivo por constantes sigue en pie; se re-mide **con carga**.
- Los 8 «no se pudieron leer» son tags con grafías raras del árbol
  (`ACTUAL_SPEED`, `QC_SPEED` por apoyo, `actual_Speed`, `MonState_vRMS_2`,
  `ESTADO_TORRETA`).

**Y dos cosas las arregló el usuario en ICONICS, no el tablero:**
`MonState_vRMS_S3` **ya entrega valor** (era el punto muerto de F0), y
`MonState_vRMS_2` **se está renombrando a `_S2`** en el servidor: era un
error de nombre, y con la `S` el reconocimiento de roles lo emparejará solo.

Quedan de F1 los pasos 2 (dar de baja la espejo en planta), 3 (manuales al
tipo) y 4 (nombres de los apoyos), y repetir el sondeo **con carga**.

**Una discrepancia que hay que re-medir en marcha, y que importa para F3:**
este sondeo dio **`aPeak_S1` verificada como serie PROPIA**, distinta de
`aRMS_S1`. El 21-09 se midieron 1805 de 1805 valores idénticos entre las dos
(`vibraciones.js:1151`), y sobre eso descansa «el factor de cresta es
imposible en S1». El sondeo de hoy compara en «la ventana donde hay datos»
(commit `7367642`), que puede no ser la del 21-09. **No se cambia el
veredicto con una sola medida en paro**: se repite el sondeo girando y, si
las dos series siguen siendo distintas, F3 recupera el factor de cresta en S1
y se corrige la cabecera de `vibraciones.js`.

---

### F2 — El índice de sinónimos (Plan 32 F6) ✅

**Completada el 22-09-2026.** Resultó más pequeña de lo que el Plan 32 F6
pintaba, y el motivo está medido: **el resolvedor ya existía**.
`sistemasDeSenal` (`shared/eva/comun/sistemas.js`) cruza desde el Plan 34 los
`aliasDe(clave)` de cada máquina —clave, descripción, etiqueta, rótulo del
rol, corto y los alias declarados—. Lo que fallaba es que **una máquina dada
de alta desde el árbol nace sin ninguno**: `vib-motor-03` tenía `alias: []`
y `descripcion: null` en las 94, así que «la velocidad eficaz del lado
acople» no encontraba «lado acople» en ningún sitio. La espejo sí los traía
porque el Plan 40 F3 los **derivó** del catálogo a mano antes de retirarlo
(`catalogoDemo.js` → `aliasDe`: rótulo × {id, nombre, «sensor N», «apoyo N»}).

**Lo que se hizo:** esa derivación vive ahora en el TIPO —`tipo.aliasDe(variable,
apoyo)` en `shared/eva/tipos/vibraciones.js`— y `construirSistema.aliasDe` la
suma a lo declarado. Los nombres del rol (rótulo, corto y una tabla corta de
**palabras del oficio** que la pantalla no enseña: «rpm», «torque», «daño»,
«pista exterior»…) por las formas del apoyo (id, `assets[].nombre`, «sensor
N», «apoyo N»). Lo gana toda configurada de vibraciones sin escribir un alias.

**Lo que NO se hizo, a propósito:**
- El rótulo a secas («velocidad eficaz») no se combina con nada: ya lo ofrece
  `construirSistema`, con tres apoyos da tres candidatas y el resolvedor
  **pregunta cuál**. Sigue siendo la regla que no se toca.
- «vibración» a secas no entra en la tabla: sería las tres medidas de los tres
  apoyos, y ponerla no mejoraría la pregunta que ya se hace.
- **El tanque no se tocó** (`CLAUDE.md` §1): su `SINONIMOS` escrito a mano y
  su resolvedor siguen donde estaban. La unificación de los dos resolvedores
  que pide B3 queda para la reapertura; lo que B3 llamaba «la máquina nueva
  nace sin sinónimos» **ya no pasa** para el tipo vibraciones.
- Un apoyo **sin nombre en el árbol no responde por un nombre que no tiene**
  (§2.5): con «rodamiento intermedio» resuelve la máquina cuyo S2 se llama
  así, no una en la que S2 es sólo `S2`. Es el paso 4 de F1 en planta.

**Un cambio de expectativa declarado:** «601 rpm» resolvía a `[]` en dos
pruebas (una guarda de que el «1» de «601» no dispare el apoyo 1). Con «rpm»
como palabra del oficio, resuelve a la velocidad del variador —que es lo que
pregunta quien dice «¿va a 601 rpm?»—. La guarda se conserva con «cota 601».

**Medido:** `sistemas.test.js` +5 pruebas sobre una máquina **sin alias**
(28), `verificar-vibraciones-configurada` +1 (36: con los alias y la
descripción quitados, el tipo deriva todos los del catálogo a mano), puerta
§5.1 verde (190/22 y 71), backend 390, frontend 1097, los 41 verificadores.

**Para verlo en el asistente hace falta reiniciar el backend**: el que corre
cargó `shared/` antes de este cambio. Y para que «lado acople» resuelva en
`vib-motor-03`, el apoyo tiene que tener ese nombre en la configuración
(editor → assets), que es F1 paso 4.

**Objetivo.** Que el asistente entienda «el apoyo del motor» como el tanque
entiende «la bomba».

**Qué hay hoy, medido.** El tipo trae `vocabulario`
(`shared/eva/tipos/vibraciones.js:575`) y llega a cada configurada por
`construirSistema.js:553`. **Pero sólo alimenta el dictado**: el único
consumidor es `backend/ia/voz.mjs:79`, que se lo pasa a Whisper como contexto.
Nadie lo usa para resolver a qué se refiere **quien escribe**.

**Lo que NO es esta fase.** `shared/eva/vibraciones/aliasDeTags.js` ya existe y
**resuelve otro problema**: cómo llama el **servidor** a un tag (`VEL_RMS` →
rol `vRMS`), con la comparación ya insensible a mayúsculas, guiones y
espacios. Esta fase es cómo lo llama una **persona**. Confundirlas llevaría a
meter jerga de operario en un índice que existe para reconocer nomenclatura de
PLC.

**Cómo.** El índice cruza dos cosas que ya viajan: el `vocabulario` del TIPO y
los alias de cada variable que vienen en la **configuración** de la máquina.
Vive en el tipo, así que **lo gana toda configurada de vibraciones a la vez**.

**Riesgos.** Un sinónimo demasiado goloso («el motor») haría que una pregunta
sobre la máquina entera se resuelva a una variable. Prefiérase no resolver a
resolver mal: sin coincidencia clara, que el asistente pregunte.

**Criterios de aceptación.**

- [ ] Preguntas con jerga de operario («el apoyo del acople», «cómo va el lado
      ventilador») llegan a la variable correcta de `Nuevo-Modor`.
- [ ] Un sinónimo ambiguo **no** resuelve a ciegas.
- [ ] `verificar-herramientas` y `verificar-chat` siguen verdes (**la puerta**,
      `CLAUDE.md` §5.1).
- [ ] La prueba se rompe a propósito una vez para verla cazar (`CLAUDE.md` §6.2).

---

### F3 — Normalizar por rpm (lo que queda del Plan 32 F4)

**Objetivo.** Que el diagnóstico de vibraciones tenga en cuenta la velocidad de
giro al juzgar una medida.

**Alcance, ya recortado por el sondeo.** De los tres puntos que pedía el Plan
32 F4, **éste es el único vivo**: `necesita` ya está en las 17 reglas, y el
factor de cresta es imposible en S1 por un defecto del servidor
(`vibraciones.js:1151`: `aPeak_S1` devuelve `aRMS_S1`, 1805 de 1805 valores
idénticos, así que `aPeak/aRMS` daría **1,0 siempre**).

**Dónde.** `shared/eva/vibraciones/riesgosVibracion.js`, que es del TIPO. Las
constantes de rpm ya están ahí (`RPM_MINIMA_ISO`, `RPM_BORDE_ISO`,
`RPM_MINIMA_MODULO`) y tres reglas ya se apoyan en ellas.

**Riesgo, y es el de siempre.** El motor es determinista y **el modelo no lo
toca** (`CLAUDE.md` §2.3). Cambiar una banda sin medición delante es
exactamente lo que ese punto prohíbe: si no hay dato para calibrar, la regla
sale `provisional: true` y lo dice, no se inventa el umbral.

**Criterios de aceptación.**

- [ ] `verificar-riesgos-vibracion` verde, con casos nuevos para la
      normalización.
- [ ] Una medida por debajo de `RPM_MINIMA_ISO` sigue diciendo que la norma no
      se pronuncia, en vez de puntuar igual.
- [ ] Ningún umbral nuevo sin medición o sin `provisional: true`.

---

### F4 — Alarmas de la máquina (Plan 37 F4)

**Objetivo.** Que `maq-alarmas` enseñe el área de alarmas que la máquina
declaró (`arboles.alarmas`), no la del catálogo.

**Por qué se aplazó, y sigue valiendo.** `AlarmasEva` lee el historial con
`leerAlarmas()` sobre las señales de alarma **del TANQUE**
(`ALARMAS_HISTORIZABLES` de `senales.js`) y trae una pestaña en vivo
desconectada. **No es una vista que se parametrice con un prop.** Hoy la
sección de una configurada tiene **tres** entradas de Visualización, no cuatro,
y el menú lo dice así — no hay ruta `maq-alarmas` en `routes.jsx`.

**El paso previo es medir, no escribir.** Hay que ver **cómo contesta
`/api/iconics/alarms` a un área `ae:` entera**, y con eso decidir si esto es
una vista nueva y pequeña o una parametrización. Escribir antes de esa medida
es diseñar a ciegas.

**Cuidado con el tanque.** `AlarmasEva` es código del tanque. **No se
modifica** (`CLAUDE.md` §1): si la medida dice que hay que tocarlo, esta fase
se convierte en una vista nueva junto a él, o se anota y se deja para la
reapertura.

**Primera medida, 22-09-2026 (de paso, al descubrir la máquina para F0).**
`POST /api/maquinas/descubrir` ya clasifica el área `ae:/DEMO VIBRACIONES`, y
contestó **VALID** con este reparto:

```
 6 contadores que SÍ leen     =ActiveAckedCount  =ActiveAckedMaxSeverity
                              =ActiveUnackedCount =ActiveUnackedMaxSeverity
                              =NormalUnackedCount =NormalUnackedMaxSeverity
42 alarmas que el área LISTA pero NO ENTREGA   ae:/DEMO VIBRACIONES.Alarm_MonState_vRMS, …
 9 acciones de escritura      \Acknowledge \Silence \LatchReset \ShelvedOn …
```

Las 42 son las mismas que en `ac:` cuelgan de `Vibraciones/Alarm/` (43 hojas,
ninguna con rol). Esto acota el trabajo de F4 antes de empezarlo: **los
contadores del área sí se leen; las alarmas individuales del área no** —lo
que se puede pintar de una configurada es lo que `/api/iconics/alarms` diga
del área, y eso es lo que queda por medir. Los 6 contadores ya viajan en la
máquina como variables sin rol (`assetId: "DEMO VIBRACIONES"`).

**Criterios de aceptación.**

- [ ] Escrito aquí qué contesta `/api/iconics/alarms` a un área `ae:` entera.
- [ ] Si sale adelante: `maq-alarmas` enseña las alarmas de **su** máquina, la
      sección pasa a cuatro entradas, y las pruebas de inventario del menú se
      actualizan **a propósito**.
- [ ] Ni una línea del tanque modificada.
- [ ] La regresión de sondeo vigilada: ningún hook nuevo que dependa de
      `useMaquina()` montado fuera de la vista de esa máquina (Plan 37 §4).

---

### F5 — Cerrar y archivar

**Objetivo.** Que al terminar esto no queden planes abiertos por inercia.

**Cómo.**

- Plan 38 → `completados/` en cuanto cierre **F0**.
- Plan 40 → `completados/` en cuanto cierre **F1**.
- Plan 32 → `completados/` con F2/F3 cerradas por F1, F5 ya completada, F4
  cerrada con su parte imposible **escrita** (no borrada: quien vuelva al
  factor de cresta tiene que encontrar por qué no se hizo).
- Plan 37 → `completados/` en cuanto cierre **F4**.
- Plan 33 → **se queda abierto**, con su F9 bloqueada. Es correcto: exige
  reabrir la estación de llenado, que es el final de la rama.
- `HANDOFF.md` §5 reescrito con lo que quede, y `CLAUDE.md` §6.1 con la lista
  de planes vivos al día.

**Criterio de aceptación.**

- [ ] `docs/por-completar/` contiene **sólo** el Plan 33 (bloqueado) y este
      plan mientras dure.

---

## 2. Lo que este plan NO hace

- **No reabre la estación de llenado.** Es el final de la rama, no una fase
  (`CLAUDE.md` §1). Con ella siguen bloqueadas la **F9 del Plan 33** y las 22
  comprobaciones omitidas de `verificar-herramientas`.
- **No toca el código del tanque.** Ni siquiera en F4, donde la vista que
  estorba es suya.
- **No añade dependencias** (`CLAUDE.md` §6.2). Si alguna pareciera necesaria
  —no se espera—, se pide antes con el motivo y qué se descartó.
- **No calcula el factor de cresta en S1.** Está medido que daría 1,0 siempre.
  Vuelve a la mesa el día que el servidor publique `aPeak_S1` de verdad.
- **No sube ningún techo para callar un rojo** (`CLAUDE.md` §6.2).

---

## 3. Orden sugerido

**F0 y F1 primero, y son del usuario**: entre las dos cierran tres planes sin
escribir código, y F1 desbloquea dos fases más del Plan 32.

Si se prefiere avanzar en código mientras tanto, **F2 y F3 no dependen de
planta**: viven en el tipo y lo que ganen lo gana cualquier configurada de
vibraciones. **F4 va la última** porque su primer paso es una medida contra el
servidor, no una decisión de diseño.
