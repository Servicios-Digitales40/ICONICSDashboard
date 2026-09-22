# PLAN 42 — Verificar una bandera que nunca cambió, sin forzarla

**Estado:** F0–F4 completadas el 22-09-2026 · escrito y cerrado el mismo día
**Rama:** `Vibraciones1.0`
**Origen:** B13 del backlog de backend, destapado al cerrar la F4 del Plan 41

> El usuario preguntó si esto se podía hacer **sin ir físicamente a la
> máquina a forzar una alarma**. La respuesta es que ése es exactamente el
> objetivo de este plan: que el sondeo pueda dar por registrada una serie que
> no ha cambiado, con fundamento y sin fingir. Lo que no se puede hacer sin
> planta queda escrito como tal.

---

## 0. El problema, medido

`backend/lib/sondearSeries.mjs` existe porque **el historiador miente sin dar
error**: pedir `aPeak_S1` devolvía la serie de `aRMS_S1` con marcas de tiempo
correctas (1805 de 1805 valores idénticos, 21-09-2026); las nueve `QC_*` de
los tres apoyos son **una sola serie**. Una gráfica con el número equivocado
bajo el rótulo correcto no se nota mirándola. Por eso `historyVerified` arranca
en `false` y sólo sube tras **comparar** cada serie con las demás de la máquina
(`firmaDe` → `mismaSerie`).

Comparar exige que la serie **varíe** (`tieneVariacion`, línea 179): una serie
plana no tiene firma (`l.firma = null`) y sale como `sin-variacion`, nunca como
`serie-propia`. Es la salvaguarda correcta contra el cruce de señales. Pero
tiene una consecuencia que el 22-09-2026 quedó a la vista en tres sondeos de
`vib-motor-03`:

```
21 propias · 11 compartidas · 35 SIN VARIACIÓN · 12 sin muestras · 7 no se pudieron leer
```

Las 35 «sin variación» son casi todas **banderas y estados**: `Alarma_S1/S2/S3`,
`Warning_S1/S2/S3`, `MonState_*`, `FAULT_BMS`, `WARNING_BMS`,
`Sensoroffset_*`, `LOWER/UPPER_LEVEL_*`. Son constantes **porque la máquina
está bien** —ninguna alarma ha saltado—, no porque el historiador falle. El
criterio no distingue «registrada y tranquila» de «no registrada»: las dos son
una línea plana.

**Lo que cuesta hoy.** Las once banderas de alarma de la máquina tienen serie
declarada y **ninguna verificada**, y con este criterio **no pueden estarlo
hasta que algo falle de verdad**. Como el Alarm Server de GENESIS64 da 500 a
`AlarmHistory` para cualquier punto (Plan 41 F4), unas «Alarmas» de la máquina
configurada tendrían que ser **flancos** de esas series —igual que hace el
tanque con `eventosDeAlarma`— y hoy no hay ninguna de la que derivarlos.

## 1. Lo que NO se va a hacer, y por qué

- **Marcar verificada una constante «porque es booleana».** Dos banderas
  constantes en 0 son indistinguibles entre sí, y el servidor ya ha servido
  una serie por otra. Sería la afirmación que el sondeo existe para no hacer
  (`CLAUDE.md` §2.4).
- **Escribir el bit por ICONICS.** Las banderas son de sólo lectura (`acceso:
  read`, declarado en las limitaciones), y aunque se pudiera sería falsificar
  un dato de planta.
- **Bajar el `historyVerified` de una constante a `false` al re-sondear.** Hoy
  no se toca (línea 274: «no se pudo leer: no se baja»), y eso se conserva.

## 2. Las tres vías, y cuál elige este plan

| Vía | Qué exige | Qué deja |
|---|---|---|
| **A · Marcas de tiempo** (este plan) | Código en el sondeo, y una medida previa (F0) | Distingue «registrada y tranquila» de «ausente». No distingue dos constantes idénticas entre sí |
| **B · Bajar un umbral en el SM 1281 / Workbench** | Una intervención de configuración, no física; restaurar después | Una alarma real en el historial y los contadores. El sondeo la vería variar y la verificaría por el camino actual |
| **C · Que una bandera alarme de verdad** | Planta | Es lo que este plan quiere evitar como requisito |

**Este plan ejecuta A.** B queda escrita como plan de contingencia si la F0
dice que el historiador no da marcas que comparar. C no es una fase.

## 3. Las fases

### F0 — La medida que decide el criterio

**Objetivo.** Saber si el grupo `DEMO_VIBRACIONES` registra **periódicamente**
(muestras a intervalos aunque el valor no cambie) o **sólo al cambiar** (una
muestra por flanco, o ninguna). De eso depende todo lo demás: si es sólo al
cambiar, una constante no tiene marcas de tiempo que comparar y la vía A pasa
a ser otra cosa (§3, F0 «si sale al cambiar»).

**Cómo.** Desde el repo, con el backend que hay y **por la misma vía que usa
`sondearSeries`** (`client.readHistory` con `aggregate: 'Average', interval:
0`; el endpoint HTTP `/api/iconics/history` dio 500 el 22-09 mientras el
sondeo interno leía bien, así que la medida se hace con un guion que monte el
cliente, no con `curl`). Sobre `vib-motor-03`, misma ventana (las de
`VENTANAS_HORAS` de la ruta), leer:

| Serie | Qué es | Qué se espera si el grupo registra periódicamente |
|---|---|---|
| `vRMS_S1` | verificada, varía | N muestras, cadencia c |
| `Alarma_S1` | constante 0 | ~N muestras a la misma cadencia c, todas 0 |
| `MonState_vRMS_S1` | constante 1 | ídem |
| `FAULT_BMS` | constante 0, otra carpeta | ídem |
| `MonState_aRMS_S2` | salió **sin muestras** hoy | 0 muestras (es la que hay que entender) |

**Qué se anota aquí, con cifras:** por serie, cuántas muestras, primera y
última marca, cadencia mediana entre muestras, y **cuántas marcas de tiempo
tiene en común con `vRMS_S1`** (misma lógica de `mismaSerie`, pero sobre
marcas, no valores). El guion se guarda como `scripts/medir-cadencia-historiador.mjs`
—un `medir-`, no un `verificar-`: mide, no afirma (`CLAUDE.md` §5.4)—.

~~**Si sale periódico:** F1 es «coincidencia de marcas con una serie verificada
del mismo grupo».~~ **Descartado con la cifra:** `Alarma_S1` tiene 8 muestras en
24 h frente a 569 de `vRMS_S1`. No es periódico.

**Si sale al cambiar:** ~~una constante no tiene marcas, y lo único que el
sondeo puede afirmar es que el tag `hda:` existe en el grupo~~. **Tampoco fue
así del todo, y eso es lo que salvó la vía A:** la constante SÍ tiene marcas —
pocas— y **todas caen en marcas de la serie verificada**. Ver abajo.

#### Lo que de verdad pasó (22-09-2026, tarde)

El guion es `scripts/medir-cadencia-historiador.mjs`, escrito y corrido en el
día. Va por `client.readHistory` con `aggregate: 'Average'` e `interval: 0`,
exactamente como el sondeo. Primero las cinco de la tabla, después `--todas`
(las 86 de `vib-motor-03`, 24 h).

| Serie | n | primera | última | cadencia | distintos | marcas comunes con `vRMS_S1` |
|---|---|---|---|---|---|---|
| `vRMS_S1` | 569 | 21-09 22:01 | 22-09 21:19 | 60 s | 564 | (testigo) |
| `Alarma_S1` | 8 | 21-09 23:21 | 22-09 17:09 | ~2 h, irregular | 1 (=0) | **8 de 8** |
| `MonState_vRMS_S1` | 2 | 22-09 14:40 | 22-09 17:09 | — | 1 (=1) | **2 de 2** |
| `FAULT_BMS` | 8 | 21-09 23:21 | 22-09 17:09 | ~2 h, irregular | 1 (=0) | **8 de 8** |
| `MonState_aRMS_S2` | **0** | — | — | — | — | 0 |

**Lo que dice la tabla.**

1. **El grupo registra sólo al cambiar.** Una bandera constante deja 8
   muestras al día, no 569. La cadencia «mediana» de esas 8 no significa
   nada (los saltos son de 15 min a 6 h): no hay cadencia que tolerar, y la
   «tolerancia de cadencia» que preveía la F1 **no existe**.
2. **Pero cuando escribe una constante, lo hace en el mismo minuto que
   escribe las medidas.** Las 8 marcas de `Alarma_S1`, `Warning_S1` y
   `FAULT_BMS` son **las mismas 8** (23:05, 23:20, 23:43, 23:52, 01:05, 05:06,
   11:07, 17:09 en la primera pasada), y son los instantes en que `vRMS_S1`
   **reanuda tras un hueco**: el historiador escribe todo el grupo cuando la
   recolección (re)arranca. Sobre las 86: las banderas coinciden 8/8, 9/9 ó
   10/10; los `MonState` 2/2, 1/1 y tres en 1/2. **Ninguna constante con
   muestras tiene menos de la mitad de sus marcas en el testigo.**
3. **Las marcas van alineadas a la petición, no al reloj del PLC.** La
   primera pasada dio todas las marcas en «:42.624»; la segunda en «:01». Es
   la rejilla de 60 s del agregado `Average`, anclada en `startDate`. Así que
   «misma marca» quiere decir **escrita en el mismo minuto**, no al
   milisegundo. La F1 lo dice así.
4. **`MonState_aRMS_S2` no tiene muestras porque el historiador nunca escribió
   nada de ella** en la ventana: ni al arrancar ni al cambiar. `HorasMarcha`
   igual. Es distinto de `S1/ACTUAL_SPEED`, que en la primera pasada devolvía
   «History request failed» (**no recolectada**) y en la segunda ya
   contestaba. Tres estados distintos que el criterio viejo aplanaba en dos.

**Dos cosas más que salieron de medir, y que no son de este plan:**

- **Las ventanas de 72 h y 168 h devolvieron 0 muestras con 20 páginas
  vacías** (`truncada`, continuación tras continuación sin datos) en las
  cinco series, la misma tarde en que 24 h traía 569. Por la mañana el
  sondeo de 7 días sí traía material. El historiador se mueve; la ruta
  `/sondear` prueba 24 → 72 → 168 y hoy las dos últimas le cuestan 40
  páginas para nada. Anotado en el backlog (B14), no tocado aquí.
- Con el agregado a 60 s, `aPeak_S1` (grupo de 1 s) sale con 1337 marcas y
  `vRMS_S1` con 569: las dos comparten 565. Es la razón de que el sondeo
  compare por marca y no por posición (Plan 41), vista otra vez.

**Decisión: F1 sigue la rama «al cambiar» reforzada.** El criterio no es
«existe en el grupo» (demasiado débil: `MonState_aRMS_S2` existe y no se
escribe) ni «misma cadencia» (no la hay), sino **«la mitad o más de sus marcas
son marcas de una serie propia de este mismo sondeo»**. Lo que afirma:
«el historiador escribe esta variable, en los mismos minutos en que escribe
una que sí verificó». Lo que no afirma, y se declara: que sea distinta de
otra constante igual.

**Criterios de aceptación.**
- [x] Tabla de arriba rellena con las cifras del historiador real.
- [x] Explicado por qué `MonState_aRMS_S2` no tiene muestras: el historiador
      no escribió nada de ella en 24 h, ni al reanudar la recolección. No
      es «no recolectada» (eso da 500) ni «constante» (eso deja marcas).
- [x] Decidido y escrito cuál de las dos ramas sigue F1.

### F1 — El criterio nuevo en el sondeo

**Objetivo.** Que `sondearSeries` pueda dar una serie plana por **registrada**
cuando el historiador demuestra que la escribe, sin dejar de cazar el cruce de
señales.

**Cómo (rama «periódico»).** Una serie sin variación deja de ser terminal:

1. Se toma como **testigo** una serie del mismo grupo que **sí** varió y quedó
   `serie-propia` en este mismo sondeo (nunca una que se haya verificado en
   otro sondeo: la ventana tiene que ser la misma).
2. Se comparan sus **marcas de tiempo**: si la constante tiene al menos
   `MIN_MARCAS_COMUNES` marcas coincidentes con el testigo y su cadencia
   mediana es la del testigo (con tolerancia), la constante queda como
   **`registrada-constante`**, una causa NUEVA, y `historyVerified: true`.
3. Si no hay testigo (ninguna serie varió: máquina parada todo el sondeo),
   se queda `sin-variacion` y **no se toca** `historyVerified`, igual que hoy.

**Lo que sigue sin poder afirmarse, y se declara.** Dos constantes idénticas
—`Alarma_S1` y `Alarma_S2`, las dos en 0 con las mismas marcas— no se pueden
distinguir entre sí. Se verifican las dos como registradas y la limitación de
la máquina lo dice: *«Las banderas constantes se han comprobado como
registradas por el historiador, no como distintas entre sí: si el servidor
sirviera una por otra, mientras no cambien no se notaría»*. Es la misma
honestidad que la puerta `mismaCifra` de la cresta (Plan 41 F3).

**Las constantes que hay que decidir, con su porqué escrito en el archivo:**
`MIN_MARCAS_COMUNES` (cuántas coincidencias bastan; la verificación por
valores ya tiene su umbral en `mismaSerie` —ver el check «pocas marcas en
común no bastan para acusar»— y éste debe ser al menos tan exigente) y la
**tolerancia de cadencia**. Las dos salen de la F0, no se inventan.

~~**Cómo (rama «al cambiar»).** El criterio es «existe en el grupo del
historiador»~~. **Descartado por la F0:** `MonState_aRMS_S2` existe en el
grupo y el historiador no escribió nada de ella; «existe» no distingue eso de
una bandera escrita. El criterio que sí lo distingue es el de las marcas.

#### Lo que de verdad se hizo (22-09-2026)

**El criterio, en `backend/lib/sondearSeries.mjs`.** Una serie plana con
muestras se compara, por MARCAS DE TIEMPO, con cada **testigo** —las series
que en este mismo sondeo quedaron `serie-propia`; ni las compartidas ni las
verificadas en otro sondeo—. Se elige el testigo con más marcas en común, y
si **la mitad o más** de las marcas de la constante son suyas
(`FRACCION_MARCAS_REGISTRADA = 0.5`), la constante queda
`registrada-constante`, `historyVerified: true`, estado `VALID`. El `motivo`
dice con qué testigo y cuántas de cuántas: *«Serie constante y registrada: 8
de sus 8 marcas de tiempo coinciden con las de vRMS_S1, verificada como
propia en este mismo sondeo…»*. Si no llega a la mitad, sigue
`sin-variacion` y el motivo dice también con quién se comparó y cuánto
coincidió; sin ningún testigo, el motivo dice que no hubo con quién.

**Por qué una fracción y no las «`MIN_MARCAS_COMUNES` al menos tan exigentes
que `mismaSerie`» que pedía el plan.** Porque con registro al cambiar una
constante tiene entre 1 y 10 marcas en 24 h. Exigir 8 absolutas dejaría fuera
todos los `MonState` (1 ó 2 marcas) y sería una cifra copiada de otra
pregunta. La mitad sale de la F0: lo medido fue 8/8, 9/9, 10/10, 2/2, 1/1 y
tres en 1/2; nada por debajo. Y la **tolerancia de cadencia** no existe:
no hay cadencia en 8 muestras irregulares. Las dos constantes del plan se
quedaron en una, y está escrita con su porqué en el archivo.

**El «cómo» de la verificación viaja con el dato.** Para que la máquina pueda
confesar cuáles de sus series verificadas son constantes, la variable lleva
**`historyVerifiedComo`**: `'serie-propia'`, `'registrada-constante'` o
`null`. Lo pone el sondeo (`crearVariable` lo arranca en `null`, el esquema
no lo acepta del cliente, `fusionarVariables` lo conserva con la
verificación y lo retira si cambia el punto histórico). Es un campo más en la
variable, no una tabla aparte, porque es la explicación de `historyVerified`
y va donde va él.

**La limitación, en `construirSistema.js`:** *«N de sus series verificadas son
constantes (Alarma_S1, Warning_S1, …): se han comprobado como REGISTRADAS por
el historiador, no como distintas entre sí. Si el servidor sirviera una por
otra, mientras no cambien no se notaría. Su historia dice "no ha cambiado",
no "es suya"»*. La lee el asistente y la enseña la ficha.

**El resumen** gana `constantes` y el motivo del sondeo dice «68 de 86 series
verificadas (18 propias y 50 constantes registradas por el historiador)».
`verificadas` **incluye** las constantes —las dos prometen historia— y el
desglose va aparte para que nadie las sume como propias sin verlo. La ficha
de `Configuración › Planta` añade una línea con ese desglose
(`machines:config.probeConstant`, es/en).

**Y una cosa que hubo que tocar fuera del alcance previsto: el transporte
falso.** `fakeClient.serieDeOtraMaquina` decidía si «el servidor recolecta» un
tag preguntando `esHistorizada` a la entrada del registro que lo declara.
Para una máquina configurada eso es «el sondeo ya la verificó» — así que una
máquina recién dada de alta **no podía sondearse nunca contra el falso**: el
falso le negaba las series que el sondeo necesita para verificarlas. Ahora,
entre las entradas que conocen el nombre, manda la que lo historiza (el
catálogo del tipo, que hace de servidor); si ninguna, el 500 de siempre. Es
lo que permite la prueba de la ruta y el check de la espejo; el caso
«configurada con su propio grupo que el catálogo no conoce → 500» sigue
cubierto en `verificar-transporte-falso` (29 verdes).

**Criterios de aceptación.**
- [x] Causa nueva `registrada-constante` en `sondearSeries`, con `motivo` en
      español que dice **con qué testigo** y cuántas marcas coincidieron
      (también `testigo`, `marcasComunes` y `marcas` como campos).
- [x] `historyVerified: true` para esas series; `serie-compartida`,
      `sin-muestras` y `no-se-pudo-leer` **no cambian** (checks 10, 11, 12 y
      los 21 que ya había, en verde).
- [x] Sin testigo, todo igual que hoy (check 6; y la marca previa no baja,
      check 9).
- [x] `resumen.constantes` y el `motivo` del sondeo lo dicen.

### F2 — Las pruebas

Todas en `scripts/verificar-sondeo-series.mjs`, con el mismo `check` y las
mismas fábricas de series que ya tiene (`firmaDe`, `mismaSerie`,
`tieneVariacion`, un `leerSerie` falso por variable). **Cada una se rompe a
propósito una vez antes de darla por buena** (`CLAUDE.md` §6.2).

| # | Comprobación | Qué demuestra |
|---|---|---|
| 1 | Una constante con las **mismas marcas** que una propia del sondeo queda `registrada-constante` y `historyVerified: true` | El criterio funciona |
| 2 | El `motivo` **nombra el testigo** y cuántas marcas coincidieron | No se deja adivinar, como en `serie-compartida` |
| 3 | Una constante **sin marcas en común** con el testigo sigue `sin-variacion`, `historyVerified` intacto | No se afirma sin coincidencia |
| 4 | Una constante con **pocas** marcas en común (por debajo de `MIN_MARCAS_COMUNES`) sigue `sin-variacion` | Coincidir en tres instantes no es estar registrada |
| 5 | Una constante con las mismas marcas pero **otra cadencia** (submuestra del testigo) sigue `sin-variacion` | La cadencia también cuenta |
| 6 | **Sin ninguna serie propia** en el sondeo (máquina parada entera), las constantes siguen `sin-variacion` y **nada** cambia | Sin testigo no hay criterio |
| 7 | El testigo tiene que ser **propio en este sondeo**: una serie `serie-compartida` no vale como testigo | No se hereda confianza de una serie sospechosa |
| 8 | **Dos constantes idénticas** con el mismo testigo: las dos quedan registradas **y** la máquina gana la limitación que dice que no se distinguen | Lo que no se puede afirmar, se declara |
| 9 | Una constante que **ya estaba** `historyVerified: true` y ahora no tiene testigo **no baja** a `false` | Misma regla que «si la lectura falla no se toca» |
| 10 | Las nueve `QC_*` (misma serie, **con** variación) siguen saliendo `serie-compartida` | El criterio nuevo no abre la puerta al cruce que ya se caza |
| 11 | `aPeak_S1` idéntica a `aRMS_S1` sigue `serie-compartida` | Ídem, el caso original |
| 12 | Una serie **`sin-muestras`** no se convierte en registrada por tener un testigo | Sin muestras no hay marcas; nada que comparar |
| 13 | El `resumen` cuenta las registradas aparte y el `estado` del sondeo las trata como verificadas (una máquina con sólo constantes registradas y propias es `VALID`, no `DEGRADED`) | El veredicto refleja el criterio |

**Hechas las trece** (22-09-2026), numeradas igual en
`scripts/verificar-sondeo-series.mjs`, que pasa de 21 a **34** comprobaciones.
La 5 cambió de sentido con la F0: ~~«otra cadencia (submuestra del testigo)
sigue `sin-variacion`»~~ no tiene sentido cuando toda constante ES una
submuestra del testigo; ahora la 5 fija el borde del umbral («la mitad justa
sí basta», que es el caso medido `MonState_a_f_S3`, 1 de 2) y la 4 fija que
por debajo no. **Se rompieron a propósito dos veces**: con la fracción a 1,1
cayeron la 1, 2, 5, 8 y 13; dejando que una `serie-compartida` valga de
testigo cayeron la 7 y la 11. Las demás no dependen de esas dos líneas.

Y **fuera del verificador**:

| Dónde | Qué pasó |
|---|---|
| `backend/test/rutas/maquinas.test.mjs` | **3 pruebas nuevas** (31 en el archivo). Se da de alta la **espejo** —la fixture— porque el falso sólo simula lo que está en el registro y el alta lo registra. `POST …/sondear` devuelve `constantes > 0`, ninguna registrada entre las `pendientes`, y en disco queda `historyVerifiedComo` con la limitación redactada. Editar conserva el cómo; cambiar el punto histórico lo retira; el cliente no puede declararlo |
| `backend/iconics/fakeClient.mjs` | No hacía falta una serie plana nueva: `alarma_S2` (el apoyo 2 no supera la banda) y `fallo` ya lo son. Lo que hacía falta era **que el falso las sirviera** a una máquina sin verificar — ver F1, «una cosa que hubo que tocar» |
| `scripts/verificar-vibraciones-configurada.mjs` | **3 checks nuevos** (de 36 a 39, más el de F3): la espejo sin sondear, registrada y sondeada contra el falso sin caos, da constantes registradas con testigo y cifras; las propias siguen `serie-propia`; y `construirSistema` sobre el resultado anotado las ofrece en `historizadas()` y declara la limitación con su nombre |
| `react-dashboard` · `test/demo-eva/configuracion-planta.test.jsx` | **2 pruebas nuevas** (20 en el archivo): con `constantes: 2` la ficha dice «3 de 3 verificadas como propias» y debajo «De ellas, 2 son constantes registradas…», sin pintar nada como pendiente; con `constantes: 0` no habla de ellas |
| **Contra planta** | Hecho el 22-09-2026 a las 16:30 con el criterio nuevo sobre `vib-motor-03`, 24 h, **sin escribir** (guion suelto sobre `sondearSeries` + cliente real). Ver abajo |

**El sondeo contra planta.** `DEGRADED · 68 de 86 series verificadas (18
propias y 50 constantes registradas por el historiador). 15 comparten serie
con otra, 0 no varían en la ventana, 2 sin muestras y 1 no se pudieron leer.`

| Antes (mañana, criterio viejo) | Ahora |
|---|---|
| 21 propias | 18 propias |
| — | **50 registradas constantes** |
| 11 compartidas | 15 compartidas |
| **35 sin variación** | **0 sin variación** |
| 12 sin muestras | 2 sin muestras (`MonState_aRMS_S2`, `HorasMarcha`) |
| 7 no se pudieron leer | 1 (`ESTADO_TORRETA`) |

Las 50, con su testigo: las **once banderas de alarma** (`Alarma_S1/2/3`,
`Warning_S1/2/3`, `FAULT_BMS`, `LAST FAULT_BMS`, `WARNING_BMS`) y los
`LOWER/UPPER_LEVEL_*` coinciden **9/9 ó 10/10 con `vRMS_S1`**; los `MonState_*`
y `Sensor_state_*` **2/2 ó 1/1 con `aPeak_S1`** (el grupo de 1 s, que tiene más
marcas), y cinco en **1/2**: `Sensor_state_3`, `MonState_a_f_S3`,
`MonState_e_f_BPFI/BPFO/FTF_S3`. Esas cinco pasan por el borde exacto del
umbral, y es deliberado que pasen: la marca que no coincide es la de un
minuto en que el testigo tenía hueco, no otro reloj.

**Lo que el criterio admite y hay que saber:** `Temperaturadeldevanado`,
`Corriente fase 1/2` y `Presion de aspiracion` quedaron registradas con **1/1**
—una sola muestra, a 0, escrita al reanudar—. Están registradas, sí; su
«historia» es un cero en un instante. La limitación de la máquina ya dice
que la historia de una constante «dice no ha cambiado, no es suya».

**Lo que cambió por otra causa entre la mañana y la tarde**, y no es de este
plan: `aRMS_S3` y `aPeak_S3` pasaron de propias a **compartidas** entre sí
(el mismo cruce que `aPeak_S1`/`aRMS_S1` tenía el 21-09, ahora en el apoyo 3:
102 muestras de `aRMS_S3` desde las 19:32 y todas iguales a las de `aPeak_S3`
en esas marcas); y `UPPER_LEVEL_2`, `ACTUAL PWR_BMS`, `OUTPUT VOLTS_BMS` y
`Numero de arranques` salieron compartidas entre ellas con 9–14 marcas cada
una y 2–7 valores distintos. Con tan pocas marcas y valores enteros, ocho
coincidencias son alcanzables por azar entre series que apenas cambian; el
umbral `MINIMO_COMUNES = 8` de `mismaSerie` se escribió pensando en cientos
de marcas. **Anotado como B15 del backlog**; no se toca aquí porque no es del
criterio nuevo y porque hoy prefiere callar (no promete historia) a afirmar.

### F3 — Lo que la verificación abre: flancos de las banderas

**Objetivo.** Que `eventosDeAlarma` pueda correr sobre las banderas
verificadas de una configurada, que es lo que la F4 del Plan 41 dejó
esperando.

**Alcance mínimo, y por qué no más.** Con las banderas registradas y sin
eventos, una vista de alarmas enseñaría **cero flancos con fundamento** y los
6 contadores que Inicio ya enseña. Antes de crear ruta y vista se comprueba
—con el `fakeClient` sirviendo una bandera con un flanco— que la cadena
`leerSerie(crudo) → eventosDeAlarma` funciona para una configurada igual que
para el tanque. Si funciona, la vista `maq-alarmas` se decide **entonces**, con
la regla de §4.8 delante y no antes.

#### Lo que de verdad pasó (22-09-2026)

**La cadena funciona para una configurada.** Un check en
`verificar-vibraciones-configurada` lee del falso la bandera `alarma_S3` de la
espejo —la del apoyo que en la simulación SÍ alarma: su vRMS mete un pico en
algunos ciclos— por `readHistory` con `interval: 0`, la pasa por `normalizar`
(`shared/eva/comun/historia.js`) y por `eventosDeAlarma`, y exige que la
serie tenga 0 y 1, que salga al menos un evento **cerrado** con `inicio` y
`fin` como fechas, `duracionMs === fin − inicio` y `activa: false`. No fue
`Alarma_S1` como decía el plan: en la espejo `alarma_S1` no tiene serie (el
catálogo la retiró el 21-09 porque el servidor le contestaba con otra) y la
del apoyo 2 no alarma nunca en el falso. La del apoyo 3 sí, y es la misma
cadena. Hubo que elegir la ventana: la última hora, porque el paso de 1 s
del falso con 20 páginas cubre 33 min y el pico cae ahí; con 6 h se leía un
tramo plano y el check decía «no hay flanco que probar» — que es lo que debe
decir, no un verde vacío.

**Decisión: `maq-alarmas` NO se crea todavía.** Con las once banderas de
`vib-motor-03` registradas, `eventosDeAlarma` sobre cualquiera de ellas da
**cero eventos** — son constantes precisamente porque nunca alarmaron—. Una
vista hoy enseñaría una lista vacía con fundamento y los 6 contadores del
área que Inicio ya enseña: es el «rótulo, no nivel de menú» de §4.8. Lo que
sí queda hecho es lo que faltaba para poder crearla en una tarde cuando haga
falta: las banderas prometen historia (`clavesConSerie`), el asistente puede
pedirlas con `historia_de_senal`, y la cadena está probada. **La vista se
decide cuando una bandera cambie de verdad** —el sondeo la verá pasar de
`registrada-constante` a `serie-propia`— o cuando alguien la pida con un
caso delante. Anotado en el backlog de frontend (F11) con este criterio.

**Criterios de aceptación.**
- [x] Un check en `verificar-vibraciones-configurada` demuestra un flanco
      0→1→0 de una bandera de la espejo convertido en un evento con entrada,
      salida y duración (es `alarma_S3`, no `Alarma_S1`; ver arriba).
- [x] Decidido y escrito si se crea `maq-alarmas`: no, hasta que haya un
      flanco real que enseñar; el porqué está arriba.

### F4 — Cerrar

- [x] Limitación nueva redactada en `construirSistema` (la lee el asistente;
      la ficha enseña el desglose del sondeo). No es del tipo sino de la
      máquina, porque depende de qué series le salieron constantes.
- [x] B13 del backlog marcado hecho con la cifra de planta (35 → 0 «sin
      variación», 50 registradas). B14 y B15 nuevos con lo que la medida
      destapó; F11 en el de frontend con el criterio para la vista.
- [x] `HANDOFF.md` §1, §5 y §9 al día; `CLAUDE.md` §5 con las cifras; este
      plan a `completados/`.

**Lo que hay que saber para volver a esto.** El sondeo es una **foto con
fecha** también para las constantes: a las 16:40 del mismo día, una hora
después del sondeo de 50, otro dio **38** registradas, 11 «sin muestras» y 3
«sin variación» — doce `MonState_*`/`Sensor_state_*` cuya única marca (el
rearranque del 21-09 a las 14:37–14:40) había salido de la ventana de 24 h.
No es un defecto del criterio: es que esas variables sólo dejan marca cuando
la recolección rearranca, y la ventana se mueve. Volverán a entrar con el
siguiente rearranque; y `sondearSeries` nunca baja a `false` una constante
que ya estaba verificada (check 9), así que lo que se ganó no se pierde
entre sondeos.

**Lo que no se hizo, y no hace falta:** la vía B (bajar un umbral en el SM
1281) queda como forma de verificar **una** bandera como `serie-propia` y
calibrar contra ella, si algún día se quiere; la vía C nunca fue una fase.

## 4. Riesgos

- **Abrir la puerta al cruce de señales.** Es el riesgo que importa. Se acota
  exigiendo testigo **propio en el mismo sondeo**, coincidencia de marcas por
  encima de un mínimo que sale de la F0, y misma cadencia; y las pruebas 7,
  10 y 11 existen para que no se relaje sin que salte algo.
- **Que la F0 diga «al cambiar».** Entonces el criterio es más débil y hay que
  decirlo así; la vía B (bajar un umbral, con quien gestione ICONICS al lado)
  queda como forma de verificar de verdad **una** bandera y calibrar contra
  ella.
- **Que el historiador registre la constante con otra cadencia que las
  medidas** (por ejemplo, un grupo de banderas cada 60 s y medidas cada 5 s).
  La tolerancia de cadencia tiene que salir de la F0, no de una suposición.

## 5. Lo que este plan NO hace

- No fuerza alarmas en el PLC ni escribe bits por ICONICS.
- No toca el código del tanque (`CLAUDE.md` §1); `eventosDeAlarma` es común.
- No crea la vista de alarmas de la configurada sin la F3 delante.
- No añade dependencias.
