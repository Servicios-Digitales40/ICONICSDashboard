# PLAN 42 — Verificar una bandera que nunca cambió, sin forzarla

**Estado:** F0–F4 por completar · escrito el 22-09-2026
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

**Si sale periódico:** F1 es «coincidencia de marcas con una serie verificada
del mismo grupo». **Si sale al cambiar:** una constante no tiene marcas, y lo
único que el sondeo puede afirmar es que **el tag `hda:` existe en el grupo**
(el descubrimiento ya lo sabe: 117 series del árbol); entonces F1 se
reescribe con ese criterio, más débil, y **se dice más débil** en la
limitación. Las dos ramas se dejan escritas; la que no se dé se tacha con la
cifra que la descartó.

**Criterios de aceptación.**
- [ ] Tabla de arriba rellena con las cifras del historiador real.
- [ ] Explicado por qué `MonState_aRMS_S2` no tiene muestras (¿no está en el
      grupo? ¿nunca escribió?).
- [ ] Decidido y escrito cuál de las dos ramas sigue F1.

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

**Cómo (rama «al cambiar»).** El criterio es «existe en el grupo del
historiador» (el descubrimiento lo devuelve como `historico` emparejado). La
causa se llama igual pero la limitación dice más: *«…comprobadas como
existentes en el grupo, no como escritas: el historiador sólo registra al
cambiar y estas nunca han cambiado»*.

**Criterios de aceptación.**
- [ ] Causa nueva `registrada-constante` en `sondearSeries`, con `motivo` en
      español que diga **con qué testigo** y cuántas marcas coincidieron.
- [ ] `historyVerified: true` para esas series; las `serie-compartida` y las
      `no-se-pudo-leer` **no cambian de comportamiento**.
- [ ] Sin testigo, todo igual que hoy.
- [ ] `resumen` incluye el conteo nuevo y `motivo` del sondeo lo dice.

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

Y **fuera del verificador**:

| Dónde | Qué |
|---|---|
| `backend/test/rutas/maquinas.test.mjs` | `POST /api/maquinas/:id/sondear` con el `fakeClient` sirviendo una constante y una propia con marcas iguales devuelve la constante verificada; la respuesta lleva la causa nueva |
| `backend/iconics/fakeClient.mjs` | Que el falso sepa servir **una serie plana con la cadencia de las demás** (hoy sirve las del espejo; hay que ver si alguna ya es plana). Si hay que añadirla, es una línea en la fixture, no una rama |
| `scripts/verificar-vibraciones-configurada.mjs` | Con la espejo sondeada contra el falso, las banderas declaradas salen registradas y `construirSistema` las ofrece como historia (`clavesConSerie`) |
| `react-dashboard` · `test/demo-eva/configuracion-planta.test.jsx` | La ficha enseña el conteo nuevo («N registradas sin cambios») y no lo mezcla con «sin sondear» |
| **Contra planta** | Re-sondear `vib-motor-03` desde la pantalla: anotar aquí cuántas de las 35 pasan a registradas, cuáles no y por qué. **Es la única prueba que necesita ICONICS**, y no necesita forzar nada |

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

**Criterios de aceptación.**
- [ ] Un verificador (`verificar-flancos-configurada` o un check en
      `verificar-vibraciones-configurada`) demuestra un flanco 0→1→0 de
      `Alarma_S1` de la espejo convertido en un evento con entrada, salida y
      duración.
- [ ] Decidido y escrito si se crea `maq-alarmas`, con el porqué.

### F4 — Cerrar

- Limitación nueva del tipo/máquina redactada y visible en la ficha y en el
  asistente.
- B13 del backlog marcado hecho con la cifra de planta.
- `HANDOFF.md` §1 y §5 al día; este plan a `completados/`.

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
