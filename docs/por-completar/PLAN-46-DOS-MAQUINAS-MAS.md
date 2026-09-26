# Plan 46 — Dos máquinas más para la demo: el tanque como configurada, y «Sensado»

**Estado:** **F1 y F2 completadas el 24-09-2026 · F3, F4, F4.1, F4.2, F5 y F6 completadas el 26-09-2026 · F6.1, F6.2 y F6.3 (lo que sólo se vio en pantalla) · F7 (el tanque) y F8 (las pantallas) por completar.** Nace de un aviso
de última hora: la demo manejará **dos máquinas más** de las previstas. Ninguna
de las dos se escribe como código: las dos entran por **máquinas configuradas**,
que es justo la capacidad que los Planes 33, 37, 39 y 40 dejaron lista y que
hasta hoy sólo ha usado **una** máquina (`vib-motor-03`).

**Rama:** `UI-Limpieza1.0`. **Fecha objetivo:** 29-09-2026.

---

## §0 De qué va esto, y qué NO va a hacer

Dos máquinas nuevas, con ambición muy distinta:

| | **Tanque** | **Sensado** |
|---|---|---|
| Qué es | La estación de llenado, que existió escrita a mano y hoy está **cerrada** | Cuatro activos de planta nuevos: corriente, ambiente, luz |
| Cómo entra | Reabrir + **reconfigurar** como máquina configurada | Alta nueva, desde cero |
| Tipo | `estacion-de-llenado` (no existe aún) | `sensado` (no existe aún) |
| Riesgos / alarmas | Sí, ya escritos | **NO. Decisión del usuario** |
| Lo que importa | Que vuelva sin reescribirlo | **La visualización**: animación, limpieza, impacto |

**Lo que este plan NO hace, dicho antes de empezar:**

- **No escribe una vista a mano por máquina.** Eso es lo que el Plan 42.5 quitó.
  Si «Sensado» necesita una vista propia, es porque **su tipo** la declara, y
  entonces sirve para cualquier máquina de ese tipo.
- **No inventa umbrales.** Sensado no tiene bandas de riesgo porque el usuario
  dijo que no las tendrá, no porque no nos diera tiempo de calibrarlas. Es una
  decisión, y se escribe como tal (§6 D2).
- **No toca el código del tanque** más de lo que la reapertura exija (`CLAUDE.md`
  §1). Destilar su tipo es mover, no reescribir.

---

## §1 EL FLUJO DE ALTA, DE PUNTA A PUNTA

> El usuario pidió explícitamente: «**debes poder describirme con certeza cuál
> es el flujo para dar de alta una nueva máquina**». Esta sección es esa
> respuesta, verificada contra el código el 24-09-2026, no contra la memoria.

### 1.1 Los tres sitios, y cuál es cuál

Dar de alta una máquina toca **tres** capas, y confundirlas es el error que
`CLAUDE.md` §4.7 existe para evitar:

```
  TIPO      código      shared/eva/tipos/<tipo>.js      ← se escribe UNA vez por CLASE
  MÁQUINA   config      datos/maquinas.json            ← se escribe por INSTANCIA, desde la UI
  SISTEMA   derivado    construirSistema(maquina,tipo) ← NO se escribe: sale de los dos de arriba
```

**El sistema no se escribe nunca.** `construirSistema()` lo produce al arrancar
el backend y tras cada cambio. Quien intente añadir una entrada a mano en
`shared/eva/comun/sistemas.js` para una máquina configurada está trabajando en
contra del diseño.

### 1.2 El flujo real, paso a paso

1. **Existe un tipo** que sepa interpretarla (`shared/eva/tipos/index.js`).
   Si no existe, **no se puede dar de alta**: la validación de
   `problemasDeMaquina()` rechaza un `tipo` desconocido.
2. **Se configura desde la UI** (`EditorDeMaquina.jsx`): se navega el árbol de
   ICONICS, se eligen los assets, se eligen las variables y se les asigna rol.
3. **Se verifican las señales** contra ICONICS (el sondeo): cada variable pasa
   a `VALID`, y su serie del historiador queda `historyVerified`.
4. **Se guarda** en `datos/maquinas.json` (no versionado).
5. **El backend registra** la máquina: `construirSistema(maquina, tipo)` la
   convierte en sistema y la mete en el registro.
6. **Las capacidades se derivan solas** (`capacidadesDe`), y de ellas salen
   **las herramientas del asistente** (`herramientasDeCapacidades`).

### 1.3 La forma exacta de una máquina en `maquinas.json`

Verificada contra `vib-motor-03` el 24-09-2026:

```jsonc
{
  "id": "…", "nombre": "…", "tipo": "…", "plc": "…",
  "arboles": [ … ],
  "assets":  [ { "id", "pointName", "rol": "raiz"|"secundario", "nombre", "alias": [] } ],
  "variables": [ {
      "id": "…", "pointName": "ac:…",
      "historyPointName": "hda:…", "historyVerified": true,
      "assetId": "…", "rol": "familia:clave",
      "unidad": null, "acceso": "read", "estado": "VALID",
      "calibracion": null
  } ],
  "cadenciaMs": …, "limitaciones": [], "estado": "…", "creada": "…", "revisada": "…"
}
```

### 1.4 Las cuatro capacidades, y de qué dependen

`capacidadesDe(maquina, tipo)`, en `shared/eva/comun/configuracionMaquina.js`:

| Capacidad | Se enciende cuando… |
|---|---|
| `CURRENT_DATA` | hay **al menos una variable** |
| `HISTORICAL_DATA` | alguna variable tiene serie **verificada** |
| `DIAGNOSTICS` | **el tipo declara reglas** (`tipo.reglas.length`) |
| `WRITABLE_VARIABLES` | alguna variable permite escritura |

Y se filtran por `tipo.capacidadesPosibles`: **una máquina no puede tener una
capacidad que su tipo no implementa.**

> **Esto es lo que hace que «Sensado sin riesgos» funcione sin trucos.** No hay
> que apagar nada: un tipo sin reglas simplemente no enciende `DIAGNOSTICS`, y
> el asistente deja de ofrecer diagnóstico **por derivación**, no por un `if`.

---

## §2 EL HALLAZGO QUE CONDICIONA TODO EL PLAN

> Medido el 24-09-2026 leyendo `shared/eva/tipos/index.js:112`. **Esto no es una
> suposición: es el código de hoy, y bloquea la F2 si no se resuelve primero.**

`validarTipos()` corre **al importar el índice** y **lanza**:

```js
if (!t.reglas.length) {
  throw new Error(
    `tipos/index.js: «${t.id}» no declara ninguna regla. Un tipo sin reglas produce ` +
      "máquinas que se dan de alta como diagnosticables y nunca dicen nada.",
  );
}
```

**Un tipo sin reglas hoy IMPIDE QUE EL PROCESO ARRANQUE.** Y «Sensado» es, por
decisión del usuario, exactamente eso.

**El matiz importante, y por qué no basta con borrar la comprobación:** esa
guarda **tenía razón cuando se escribió**. Su motivo está en su mensaje: una
máquina que se da de alta «como diagnosticable» y nunca dice nada. Pero ese daño
ya **no puede ocurrir**, porque `capacidadesDe` no enciende `DIAGNOSTICS` sin
reglas — esa derivación llegó **después** que la guarda. Hoy la guarda protege
de algo que el código ya impide por otra vía, y a cambio prohíbe un tipo
legítimo: uno que sólo observa.

**Comprobado, no supuesto (24-09-2026).** Se construyó un tipo observador
(`vibraciones` con `reglas: []`) y se ejecutaron las dos mitades:

```
guarda de validarTipos()            → LANZA «sensado no declara ninguna regla»
capacidadesDe(maq, tipo SIN reglas) → [ CURRENT_DATA ]
capacidadesDe(maq, tipo CON reglas) → [ CURRENT_DATA, HISTORICAL_DATA, DIAGNOSTICS ]
```

Las dos cosas que este plan da por ciertas quedan medidas: la guarda **sí**
bloquea, y `DIAGNOSTICS` **sí** desaparece solo sin reglas. En esa corrida
`HISTORICAL_DATA` tampoco salió, y **no es un defecto**: el tipo de prueba sólo
declaraba `CURRENT_DATA` en `capacidadesPosibles`, así que el filtro del final de
`capacidadesDe` hizo exactamente su trabajo. El tipo `sensado` real declarará
las dos (§3.3).

**Lo que se hace (F1):** no se borra la comprobación, se le cambia la pregunta.
De «¿tiene reglas?» a «**¿declara si diagnostica, y es coherente?**»:

- un tipo que declara `DIAGNOSTICS` en `capacidadesPosibles` **sí** debe traer
  reglas — el error original, intacto;
- un tipo que **no** lo declara es un observador legítimo y pasa.

Así el tipo `sensado` dice en su propia declaración «yo no diagnostico», y el
validador lo comprueba en vez de suponerlo.

---

## §3 LA MÁQUINA «SENSADO»

### 3.1 Los cuatro activos, como los dictó el usuario

**Planta TDCON.** Sin riesgos, sin alarmas. Sólo visualización.

| Activo | Variable | Unidad | Nota del usuario |
|---|---|---|---|
| **Dona de corriente trifásica** | Línea 1 | A | |
| | Línea 2 | A | «la corriente que viene desde la calle» |
| | Línea 3 | A | |
| **Dona monofásica** | Línea 1 | A | «la corriente de las luminarias» |
| **Sensor de Temperatura Demo** | Temperatura | °C | |
| | CO₂ | ppm | |
| | Humedad | % | |
| | Presión barométrica | — | unidad por confirmar (§6 D4) |
| **Sensor de Iluminación** | Iluminación | lux | el usuario dijo «lúmenes» — ver §6 D4 |
| | Batería del sensor | % | |

**Diez variables, cuatro assets.**

### 3.1.1 SONDEADO CONTRA ICONICS REAL — 24-09-2026, 21:10

**D1 resuelta.** La raíz es **`ac:TDCON/DEMO_SENSORES/`**, está **activa** y se
leyó entera con `scripts/sondear-arbol.mjs` (sólo lee, no escribe nada).

El árbol real, tal cual lo devuelve el servidor:

```
ac:TDCON/DEMO_SENSORES/
  [DONA_CORRIENTE_TRIFASICA]  LINEA_1 · LINEA_2 · LINEA_3
  [DONA_MONOFASICA]           LINEA_1
  [SENSOR_TEMPERATURA_DEMO]   TEMPERATURA · CO2 · HUMEDAD · PRESION_BAROMETRICA
  [SENSOR_TEMPERATURA_COCINA] TEMPERATURA · CO2 · HUMEDAD · PRESION_BAROMETRICA
  [SENSOR_ILUMINACION]        LUMEN · BATERIA
```

**Coincide con lo que dictó el usuario, con UNA diferencia: hay un quinto
asset, `SENSOR_TEMPERATURA_COCINA`**, que no estaba en la lista. Sus cuatro
variables existen y leen igual que las del sensor «demo». **El usuario decidió
el 24-09-2026 que NO entra** (D6), y basta con no seleccionarla: ver §3.1.3.

**Las 14 señales leen en vivo, las 14 con `quality: 0` (GOOD).** Valores del
sondeo: `3 · 1 · 2` (trifásica), `4` (monofásica), `8 · 2 · 5 · 7` (demo),
`6 · 9 · 1 · 4` (cocina), `7 · 8` (iluminación).

> **Son dígitos sueltos del 1 al 9: valores fijos de prueba, como avisó el
> usuario.** No son lecturas físicas. Importa dejarlo escrito porque una vista
> que se «ajuste bonito» a estos números quedará mal cuando lleguen los reales:
> 7 lux y 7 A no se parecen en nada. **La vista se diseña para el rango real
> declarado (§3.4), no para lo que se ve hoy en pantalla.**

**Los assets no tienen `.Attributes` con contenido** (devuelven `[]`), así que
**la unidad no viene del servidor**: la pone quien configura, o el tipo. Refuerza
la D4.

### 3.1.3 LA COCINA NO ENTRA, Y NO HACE FALTA HACER NADA MÁS

**D6 resuelta: no entra.** El usuario razonó que, al ser una máquina
configurada, con no seleccionarla en el configurador basta. **Es correcto, y se
comprobó** en vez de darlo por bueno — construyendo la máquina de las dos formas
posibles y preguntándole por un punto de la cocina:

```
parse('…/SENSOR_TEMPERATURA_COCINA/TEMPERATURA')  ->  null
```

`null` en los dos escenarios. La razón es que `construirSistema()` deriva
`puntos()` de las **variables declaradas**, no del árbol: lo que no se
selecciona no existe para el backend, no se lee, no llega al asistente y no
sale en ningún reporte. **Nada que apagar.**

**Pero hay UNA diferencia entre las dos formas de elegir los assets**, y sólo
se nota más adelante:

| Se configura eligiendo… | Raíces que quedan | Si mañana se da de alta la cocina aparte |
|---|---|---|
| **los cuatro assets concretos** | cuatro, una por sensor | **se puede**, sin conflicto |
| **la raíz común `DEMO_SENSORES/`** | una sola | **se RECHAZA**: solape de raíces |

El motivo es `sistemaDePunto()`, que devuelve **la primera máquina cuya raíz
encaja**. Con la raíz común declarada, los puntos de la cocina «caen dentro» de
Sensado aunque no sean suyos, y la validación lo impide por adelantado — con
razón: si dejara pasar las dos, los puntos de una se atribuirían a la otra en
silencio y siempre a favor de la misma, que ni siquiera parece intermitente.

> **Recomendación para la F3: elegir los CUATRO ASSETS, no la raíz.** Hoy da
> igual —la cocina no entra— pero mañana no cuesta nada y deja la puerta
> abierta. Es la diferencia entre una decisión reversible y una que habría que
> deshacer reconfigurando.

### 3.1.2 EL HISTORIADOR: no registraba, y a las 21:25 del 24-09 YA SÍ

El grupo **existe** (`hda:\Configuration\DEMO_SENSORES\`) y refleja el árbol de
assets, con sus hojas en formato `GRUPO:TAG`
(p. ej. `…\SENSOR_ILUMINACION:LUMEN`) — el mismo que ya usa vibraciones.

**Pero las diez series devuelven HTTP 500. Las diez.**

**Y está comprobado que no es un error de la llamada**, que es la trampa fácil
aquí: la misma llamada, en la misma corrida, contra una serie **verificada** de
vibraciones (`…\DEMO_VIBRACIONES\S1:QC_aRMS_S1`) devolvió `ok: true` con **10
muestras**. Control positivo: el camino funciona; estas series no.

**RESUELTO POR PLANTA EL MISMO DÍA.** El usuario desplegó los tags y en el
re-sondeo de las 21:25 las **14 series responden 200 y las 14 traen muestra**.
El control de vibraciones siguió dando 200 en la misma corrida, así que la
comparación es válida en los dos sentidos.

Hubo un intento intermedio en que seguían dando 500: los tags estaban en el
árbol pero aún no publicados. **Merece quedar escrito**, porque «el tag existe
en `hda:`» y «la serie responde» resultaron ser cosas distintas, y verlo sólo
con `browse()` habría dado un falso positivo.

**Una muestra por señal en 24 h, con el valor plano.** Es lo esperado de una
constante recién desplegada, y cae exactamente en el criterio
**`registrada-constante`** que el Plan 42 creó para esto: una serie plana queda
VERIFICADA sin fingir que varía. Así que **`HISTORICAL_DATA` sí se va a encender**, y la F4 puede contar con tendencia — poca, mientras los valores
sean fijos, pero real.

---

## §4 LAS VISTAS: dónde va la animación y el impacto

> «**Importa mucho la visualización** … animaciones, limpieza e impacto visual.»
> Es el requisito distintivo de este plan.

### 4.1 La regla que no se rompe por bonito

La animación vive en **presentación** (`components/`, `views/`). **No** decide
bandas, **no** calcula estados, **no** recalcula un umbral. Pide el valor ya
resuelto al dominio y lo anima (`CLAUDE.md` §4.3).

### 4.2 Dónde encaja sin escribir una vista por máquina

La vista es **del tipo**, no de la máquina. `PlantaMaquina`/`DetalleMaquina`
siguen siendo genéricas, y `sensado` aporta su presentación propia — igual que
`vibraciones` aporta las suyas. Un segundo juego de sensores reutilizaría la
misma vista sin tocar código.

### 4.3 Las cuatro piezas propuestas

1. **Dona de corriente** — literal: un anillo por línea. El usuario ya la llama
   «dona». Las tres fases en un solo anillo concéntrico, la monofásica aparte.
   Animación: transición suave del arco, no salto.
2. **Tarjetas de ambiente** — cuatro lecturas grandes, tipografía protagonista.
   Animación: el número **cuenta** hasta su valor (`tabular-nums`, sin salto de
   ancho).
3. **Medidor de iluminación** — el que «estará ubicado en la demo», así que lo
   verán reaccionar en vivo. Merece la pieza más vistosa: respuesta inmediata y
   visible a que alguien tape el sensor.
4. **Batería** — pequeña, discreta, con su porcentaje.

### 4.4 Tres condiciones que la animación debe cumplir

- **`prefers-reduced-motion`**: se respeta. No es opcional.
- **Un hueco no se anima como un cero.** `CLAUDE.md` §2.4. Si el dato no llegó,
  la pieza se apaga y lo dice; **jamás** anima hasta cero, que se lee como «hay
  cero corriente» cuando significa «no sé».
- **Sin dependencia nueva.** Ninguna librería de animación (`CLAUDE.md` §6.2).
  CSS y `requestAnimationFrame` bastan; si algo no sale, se pide antes.

---

## §5 EL TANQUE VUELVE, COMO CONFIGURADA

> Anotado a petición del usuario en esta misma sesión.

### 5.1 De dónde viene

Cerrado el **17-09-2026** por el rebuild de vibraciones. El **22-09** la rama
`UI-Limpieza1.0` decidió que **se piensa como otra máquina configurada**, no
como instalación aparte. El **23-09** (Plan 42.5 F4) se borraron sus seis
vistas. Su dominio **nunca se borró**, precisamente para esto.

### 5.2 Qué queda hoy — inventario del 24-09-2026

- **`shared/eva/tanque/`**: siete archivos, ~3.400 líneas. **Cuatro de ellos no
  son del tanque** aunque vivan ahí: `estado.js`, `sistema.js`, `senales.js` y
  `simulador.js` los importan los reportes, el motor, las herramientas del
  asistente y el cliente falso. Es vocabulario común que nació ahí.
- **`data/tanque/`**: su fuente en vivo, aún usada por `alarmas.js` y `evaSource`.
- **Su entrada en `SISTEMAS`** con `cerrado` y su motivo.
- **Tres manuales** asignados a `tanque` en el manifiesto.
- **`views/tanque/`**: **no existe.**

### 5.3 Lo que hay que hacer, y en qué orden

Reabrir es **deshacer**, no reescribir (`CLAUDE.md` §1).

1. Quitar `cerrado` de su entrada y la primera de sus `limitaciones`.
2. **Destilar el tipo `estacion-de-llenado`** desde `shared/eva/tanque/`, por
   COMPOSICIÓN, sin transcribir (la regla que hizo honesto a `vibraciones.js`).
   Es la F9 del Plan 33, que quedó bloqueada esperando justo esto.
3. **Configurarla** desde la UI, como cualquier otra.
4. Reactivar sus pruebas omitidas — las que se omitieron **por el cierre**.

### 5.4 La pregunta abierta

**¿Se reconfigura de cero, o se migra su catálogo escrito a mano?** Sus 1.414
líneas de `senales.js` son un catálogo hecho, y reconfigurar 8 señales a mano
desde la UI es tedioso pero honesto. Migrarlo automáticamente es más rápido y
más difícil de verificar. **Decisión pendiente (§6 D3).**

---

## §6 DECISIONES ABIERTAS

| | Pregunta | Por qué importa | Propuesta |
|---|---|---|---|
| ~~**D1**~~ | ~~¿Cuál es la raíz en ICONICS?~~ | — | **RESUELTA 24-09-2026.** `ac:TDCON/DEMO_SENSORES/`, activa y sondeada (§3.1.1) |
| **D2** | Sensado sin riesgos: ¿**decisión** o *pendiente*? | Cambia lo que se escribe en el tipo y lo que dice el asistente | **Decisión.** El usuario lo dijo explícito. Se escribe como tal |
| **D3** | Tanque: ¿reconfigurar de cero o migrar el catálogo? | Coste vs. verificabilidad (§5.4) | Reconfigurar. Es el flujo que la demo enseña |
| **D4** | **Unidades**: ¿lux o lúmenes? ¿hPa, kPa o mbar? | Un eje mal rotulado es un error visible en pantalla | Preguntar a planta. **Lux** mide lo que ve un sensor fijo; lumen es flujo total |
| **D5** | ¿Sensado entra en el **menú** como máquina más, o sólo en su dashboard? | Afecta al Sidebar y a la navegación | Las dos: es una máquina configurada como cualquier otra |
| ~~**D6**~~ | ~~¿Entra `SENSOR_TEMPERATURA_COCINA`?~~ | — | **RESUELTA 24-09-2026: NO entra.** Decisión del usuario. Comprobado que basta con no seleccionarla — ver §3.1.3 |
| ~~**D7**~~ | ~~El historiador no registra~~ | — | **RESUELTA 24-09-2026, 21:25.** Planta desplegó los tags: 14/14 responden con muestra (§3.1.2) |

---

## §7 FASES

### F1 · Que un tipo sin reglas sea legal — ✅ **COMPLETADA 24-09-2026**

La guarda de `validarTipos()` ya no pregunta «¿tiene reglas?» sino «¿lo que
PROMETE y lo que TRAE concuerdan?».

**Lo que no estaba previsto y se añadió: la comprobación del REVERSO.** Al
escribirla se vio que el desajuste tiene dos caras, no una. Declarar reglas y
NO prometer `DIAGNOSTICS` deja reglas escritas que **nunca se evalúan**, porque
la capacidad jamás se enciende — y eso calla igual de bien que el caso
original. Así que ahora lanza en los dos sentidos:

| El tipo… | …y trae | Resultado |
|---|---|---|
| promete `DIAGNOSTICS` | 0 reglas | **lanza** (el error de siempre, con una línea de ayuda nueva) |
| no lo promete | reglas | **lanza** (reglas huérfanas) |
| no lo promete | 0 reglas | pasa — es un observador |
| promete | reglas | pasa |

Un tipo **sin** `capacidadesPosibles` se trata como antes —se le exigen reglas—
para que olvidar el campo no sea una forma silenciosa de saltarse la guarda.

**Vista fallar a propósito** (`CLAUDE.md` §6.2), rompiendo `sensado.js` en las
dos direcciones y restaurándolo después:

```
prometer DIAGNOSTICS sin reglas  -> LANZA «no declara ninguna regla…»
reglas sin prometer DIAGNOSTICS  -> LANZA «declara 1 regla(s) pero no incluye…»
índice restaurado                -> carga: vibraciones, sensado
```

### F2 · El tipo `sensado` — ✅ **COMPLETADA 24-09-2026**

`shared/eva/tipos/sensado.js`: **10 roles** en tres familias, todos de ámbito
máquina, `rolesRequeridos: []`, `reglas: []` y `evaluarRiesgos` que devuelve la
forma vacía. Registrado en el índice, que pasa de uno a dos tipos.

**Medido al terminar:**

```
TIPOS                                  vibraciones, sensado
capacidadesDe(máquina, sensado)        [ CURRENT_DATA, HISTORICAL_DATA ]
DIAGNOSTICS presente                   false
herramientas del asistente             estado_del_sistema, historia_de_senal
estado(): general                      null   (no juzga, y lo dice)
bandaDe('ambiente:co2').esUmbral       false
```

**Cuatro decisiones que merecen leerse antes de tocar este archivo:**

1. **`canales` no se declara.** Sus assets NO son apoyos de una misma pieza: una
   dona de corriente y un sensor de CO₂ no son dos vistas del mismo equipo,
   como sí lo son dos acelerómetros de un motor. `canalesDeMaquina()` ya
   devuelve `[]` sin canales, así que no hay nada que apagar.
2. **`estado().general` es `null`, y no es un hueco.** Un tipo que no diagnostica
   no tiene «estado general» que ofrecer. Devolver «NORMAL porque nada falló»
   sería afirmar que se comprobó algo.
3. **Dos unidades a `null` a propósito** (D4): el tag se llama `LUMEN` pero un
   sensor fijo mide **lux**, y la presión puede ser hPa, kPa o mbar. Los assets
   devuelven `.Attributes` vacío, así que la unidad no viaja con el dato: la
   pone quien configura. Un número sin unidad es honesto; una unidad inventada
   no.
4. **`rolesDeTag('LINEA_1')` devuelve DOS roles**, y es correcto: ese tag existe
   en la dona trifásica (una fase) y en la monofásica (el alumbrado entero).
   Con dos candidatos el descubridor no propone ninguno, en vez de adivinar por
   el orden.

**Una prueba tuvo que cambiar, y no para callarla.** `tipos.test.js` afirmaba
`expect(t.reglas.length).toBeGreaterThan(0)` para TODO tipo — la regla vieja.
Se sustituyó por «un tipo trae reglas **si y sólo si** promete `DIAGNOSTICS`»,
que cubre el caso original y además el reverso. Comprobado que caza los dos
desajustes y deja pasar los dos casos legítimos. 19/19 aislada.

**Tanda completa tras la F2:** lint y tipos limpios · los 41 verificadores ·
la puerta del asistente intacta (**181** herramientas / 45 omitidas, **75**
chat) · backend **442/442** · frontend **1193** (uno más: el nuevo).

### F3 · Configurar la máquina — ✅ **COMPLETADA 26-09-2026**

La dio de alta el usuario desde el front, que es como quiso hacerlo y de paso
fue el ensayo de lo que se enseña en la pantalla 2 (§8).

`sensado-01` · «Sensado TDCON» · tipo `sensado` · `estado: VALID` · **10 variables
con rol, 10/10 roles del tipo cubiertos**, sin problemas de validación. Las 10
señales leen en vivo con calidad GOOD. `SENSOR_TEMPERATURA_COCINA` **no entró**
(D6), y se comprobó de verdad: `parse()` de un punto suyo devuelve `null`.

Capacidades derivadas: `CURRENT_DATA`. **`DIAGNOSTICS` apagado**, que es el punto
entero del tipo observador. El asistente recibe `estado_del_sistema`.

#### Dos defectos que sólo aparecieron al configurarla de verdad

Ninguno se habría visto sin una máquina cuyos assets son **tomas
independientes**: los tags de vibraciones llevan el apoyo en el nombre
(`vRMS_S1`) y nunca se repiten entre carpetas. Aquí `LINEA_1` está en las dos
donas, y eso destapó los dos.

**F3.1 · El selector de rol, comprimido hasta ser inservible** (presentación).
Los dos `<select>` —el de rol y el de serie— se renderizaban, pero `Fila` es un
flex sin envoltura y el nombre lleva `flex: 1`: con dos controles de 160 px el
de rol no se podía usar. **No era un `if` que lo ocultara**, por eso no se veía
leyendo la condición. La fila ahora envuelve y ninguno de los dos se encoge.

**F3.2 · Un rol ausente contaba como decisión tomada** (dominio, y el de
fondo). `marcasDe()` metía en su mapa `roles` **todas** las variables, con `null`
las que no tenían rol. El editor pregunta `roles.has(punto)` para saber si una
persona ya decidió algo, así que ese `null` respondía «sí, se decidió que
ninguno»: la propuesta del tipo no se aplicaba y el selector no se ofrecía.
**Una variable guardada sin rol quedaba sin arreglo posible desde la pantalla.**

> **La lección, que vale para el resto del proyecto:** `null` en un mapa cuya
> pregunta es `has()` colapsa dos afirmaciones distintas —«no hay valor» y «el
> valor es ninguno»—. Es el mismo error de forma que `CLAUDE.md` §2.4 prohíbe
> con los datos de planta, aplicado a una decisión de configuración.

Los dos con prueba propia, **vistas fallar a propósito**: la de F3.1 en
`editor-de-maquina.test.jsx` (con un árbol de tipo `sensado`, porque el de
vibraciones no reproduce el caso), la de F3.2 en
`verificar-configurar-desde-arbol.mjs`.

#### Las series NO se verifican, y la predicción de este plan era incorrecta

§3.1.2 decía que el sondeo las marcaría `registrada-constante`. **Medido el
26-09-2026, no es así**: las diez quedan `sin-variacion`.

```
ventana  24 h -> UNKNOWN  sinVariacion: 10 · sinDatos: 0
ventana  72 h -> UNKNOWN  sinVariacion: 10 · sinDatos: 0
ventana 168 h -> UNKNOWN  sinDatos: 10
```

**Hay dato** —`sinDatos: 0` en 24 h, ya no `sin-muestras` como antes del
despliegue—, pero `registrada-constante` exige un **testigo**: otra serie *de la
misma máquina* que SÍ varíe, para poder afirmar «el historiador escribe ésta en
los mismos minutos en que escribe una que verificó». En vibraciones lo había.
Aquí **las diez son constantes**, así que ninguna puede ser testigo de otra.

**No es un defecto, es el sondeo negándose a prometer lo que no puede
sostener.** Se resuelve solo en cuanto una señal se mueva de verdad.

**Efecto en lo que sigue:** `HISTORICAL_DATA` apagado. El asistente ofrece
`estado_del_sistema` y no `historia_de_senal`, y la F4 se sostiene con el valor
actual — que es como estaba diseñada desde el principio.

### F4 · Las vistas — ✅ **COMPLETADA 26-09-2026**

`views/sensado/InicioSensado.jsx`, con las cuatro piezas de §4.3: la dona
trifásica (tres anillos concéntricos), la monofásica, las tarjetas de ambiente
con su franja de confort, y el medidor de iluminación con halo, que es el que
la gente verá reaccionar porque el sensor está en la demo. La batería va
debajo de la luz, pequeña, como se planeó.

#### El reparto de portadas, que no estaba previsto

La ruta `maq-inicio` apuntaba **directamente** a `InicioVibraciones`, y
funcionaba porque todas las máquinas configuradas eran del mismo tipo. Con
`sensado` deja de funcionar: esa portada habla de apoyos, de velocidad eficaz
y lleva un hero 3D del rotor, así que una máquina de sensores habría abierto
con la portada de un motor y todas sus cifras en blanco.

Se resolvió con `views/maquina/InicioDeMaquina.jsx`: un **repartidor** que
elige portada por TIPO. Un tipo sin portada propia cae en `PlantaMaquina`, que
no supone nada del tipo — pobre pero honesta.

> **Por qué ese `if` no es el que el proyecto prohíbe.** El Plan 42.5 D1 sacó
> de las VISTAS el condicional por máquina, porque repetido en cinco archivos
> se olvida en el sexto. Esto es un solo sitio, por tipo y no por máquina, y su
> única responsabilidad es elegir. La alternativa —que cada portada empezara
> comprobando si la máquina es suya— sí sería el condicional repartido.

#### Y no toda máquina tiene todas las vistas

Sensado heredaba también «Estado mecánico» y «Vista 3D», que no puede pintar.
Ahora cada ruta declara qué capacidad NECESITA (`porMaquina.requiere`) y
`buildNav` la compara con lo que el tipo declara saber servir.

**Se filtra por `capacidadesPosibles` y NO por las derivadas**, y la diferencia
importa: `capacidadesDe()` sólo deriva cuatro, y `VIEW_3D` no está entre ellas
—no se deriva de nada—, así que filtrar por ahí le habría quitado la Vista 3D
al motor, que sí la tiene. La pregunta aquí es «¿este TIPO tiene esta vista?»,
que es justo lo que `capacidadesPosibles` declara desde el Plan 33 y que hasta
hoy **nadie leía**.

El tipo se resuelve en `navParaRol` y no dentro de `buildNav`: la cabecera de
ese archivo dice que vive sin imports con alias para ser JS puro ejecutable en
node, que es lo que permite verificar el orden del menú sin montar la app.

#### Las tres condiciones de §4.4, cumplidas

| | Cómo |
|---|---|
| `prefers-reduced-motion` | `useSinMovimiento`, escuchado EN VIVO: una pantalla de muro puede estar semanas abierta |
| **Un hueco no se anima como cero** | `useNumeroAnimado` devuelve `null` y no interpola; al volver el dato se entra desde el último valor bueno, no desde un cero que nunca se midió |
| Sin dependencia nueva | CSS y `requestAnimationFrame`. Bundle: index 352 KB / 450, vendor 269 / 330 |

#### Una prueba que pasaba sin probar nada

La primera versión de «un hueco no se dibuja como cero» montaba la señal **ya**
sin dato. Al romper el código a propósito (`sinDato ? 0 : valor`) **pasó igual**:
el `if (senal.sinDato)` del render la tapaba antes de llegar al número. No
probaba nada.

El caso que de verdad importa es **una señal que TENÍA valor y lo pierde**, que
es cuando el número animado podría contar hasta cero y dibujar una caída que
nadie midió. Con esa prueba añadida, romper el código falla las dos.

> Es exactamente lo que `CLAUDE.md` §6.2 advierte: «no dar por buena una prueba
> que pasa sin haberla visto fallar». Aquí la lección tiene matiz propio —la
> prueba SÍ se vio pasar, y aun así no valía— porque el escenario elegido
> esquivaba el camino del defecto.

**Otro defecto que cazó la prueba**: `UltimaLectura` recibe el TEMA por prop y
no se le estaba pasando. Lanzaba y dejaba la pantalla en blanco. Sin prueba, se
habría visto en la demo.

**Tanda completa:** lint y tipos limpios · los 41 verificadores · i18n 1273
claves × 2 con paridad · puerta del asistente intacta (181 / 75) · backend
442/442 · frontend **1205** (8 nuevas) · bundle dentro de presupuesto.

### F4.1 · Que una sesión caída se cure sola — ✅ **COMPLETADA 26-09-2026**

No estaba en el plan: salió de un defecto que apareció usando el tablero, y se
hizo antes que la F5 porque en la demo es lo que más se notaría.

**El síntoma.** Cada cierto rato, todas las lecturas vuelven vacías y el
registro se llena de «ICONICS devolvió la página de reautenticación». Se va y
vuelve solo.

**La causa, medida.** Cuando ICONICS invalida la sesión de su lado devuelve la
página de login con un 200. El puente lo detectaba bien y lo convertía en 401
—eso ya lo arreglaba B9—, pero **ahí se quedaba: nadie renovaba el token**.
Y `hasValidToken()` mira NUESTRO reloj (`Date.now() < expiresAtMs`), así que el
puente seguía mandando el mismo token muerto **hasta una hora**. La única cura
era reiniciarlo, y el propio código lo decía en `systemRoutes.mjs`.

Reproducido con un servidor que devuelve la página de login y luego datos:

```
lectura 1: ok=false  status=401  reauth=true
lectura 2: ok=false  status=401  reauth=true
lectura 3: ok=false  status=401  reauth=true
lectura 4: ok=true   status=200
```

Con reintento, la lectura 1 habría acabado en OK. Cada lectura era un intento.

**El arreglo.** `invalidarToken()` en el autenticador, y en el cliente: al
recibir la página de login se tira el token y **se repite la petición una vez**.

**Dos límites, y los dos importan:**

1. **Una sola vez.** Con el servidor de seguridad caído las dos respuestas son
   la página de login, y reintentar en bucle multiplicaría la carga contra un
   servidor que ya va mal. Un intento distingue «la sesión se cayó» (se
   arregla) de «el servidor está mal» (se reporta).
2. **Nunca una ESCRITURA.** Repetir algo que quizá sí llegó a ejecutarse
   accionaría la planta dos veces.

> **El detalle que casi se hace mal:** el primer intento filtraba las
> escrituras con `method === 'GET'`. Es incorrecto — **la lectura en lote es un
> `POST /Data`**, justo el caso de los registros («92 señales»), así que habría
> dejado fuera el caso principal. Lo que separa lectura de escritura es el
> ENDPOINT, no el verbo. Hay una prueba que falla si alguien vuelve al verbo.

**Comprobado.** Tres pruebas nuevas en `backend/test/reautenticacion.test.mjs`
con un servidor de verdad, **vistas fallar a propósito** dos veces: quitando el
reintento (caen 2) y volviendo al filtro por verbo (caen 2).

**Y contra planta real:** se tira el token a mano y la lectura siguiente sale
con las 10 señales de `sensado-01`, sin intervención.

**Tanda:** lint y tipos limpios · los 41 verificadores · asistente intacto
(181 / 75) · backend **445/445** (3 nuevas).

### F4.2 · Cuatro defectos que sólo se vieron MIRANDO la pantalla — ✅ **26-09-2026**

La F4 pasó su tanda entera —lint, tipos, 41 verificadores, 1205 pruebas— y aun
así la pantalla estaba mal. El usuario la abrió y mandó cuatro capturas.

> **La lección, y es la más importante de este plan:** ninguna de las cuatro la
> podía cazar una prueba de las que había, porque las cuatro producían un
> estado que PARECÍA correcto. Las pruebas comprobaban que cada pieza hacía lo
> suyo; nadie había mirado el resultado.

#### 1 · Inicio, vacío — la cabecera contaba 10 señales y no pintaba ninguna

`estadoDeSensado` preguntaba al resolvedor por el ROL entero
(`electrica:corrienteL1`), pero `construirSistema` indexa sus variables por la
CLAVE del rol (`corrienteL1`) — a los de ámbito apoyo les añade el sufijo
(`vRMS_S1`), y la familia nunca entra en esa llave. El resolvedor devolvía
`null` **siempre** y el bucle no emitía ni una señal.

**Por qué no se vio como una pantalla en blanco**: `construirSistema` tiene una
red debajo —«ninguna variable configurada desaparece del estado»— que las
sacaba todas por el camino genérico. Diez señales, con su valor correcto, pero
**sin familia, sin escala y sin banda**. La vista filtra por familia y
encontraba cero.

Es el peor modo de fallo posible: el estado parecía bien y sólo faltaba lo que
cada pieza necesita para dibujarse.

#### 2 · Ni unidad ni activo llegaban al tipo

El resolvedor devolvía `{clave, tag, label, historia}`. La `unidad` la pone
quien configura —el servidor no la publica: los assets de `DEMO_SENSORES`
devuelven `.Attributes` vacío— y el `assetId` dice de qué toma cuelga.
`vibraciones` no los echaba de menos porque recibe sus apoyos por otra vía
(`opciones.apoyos`), pero un tipo cuyos activos NO son apoyos de una misma
pieza no tiene esa vía. Ahora los dos viajan; son campos opcionales y quien no
los lea no cambia.

#### 3 · Un aviso INVENTADO sobre Sensado

La pantalla decía «El valor de daño no tiene referencia aprendida» sobre una
máquina que no mide daño, no tiene apoyos y **declara que no diagnostica**.

`AvisosEva` llamaba SIEMPRE a `evaluarRiesgosVibracion` sin mirar el tipo, y
funcionaba mientras todas las configuradas fueran motores. **Un diagnóstico
falso es peor que ninguno**: manda a revisar algo que no existe.

Ahora pregunta al tipo. Con un matiz que no es cosmético: **sin tipo
reconocible se evalúa como antes**. Callar una máquina sin `tipo` escondería
avisos reales de un motor, y el aviso de más se lee y se descarta mientras que
el de menos no se ve.

#### 4 · Las limitaciones, pintadas dos veces

Tres limitaciones salían seis veces en Planta. La API devuelve `limitaciones`
con las propias YA MEZCLADAS con las derivadas; el frontend reconstruye el
sistema con esa máquina y las derivadas se añadían otra vez. Reproducido:
3 → 6. Se deduplica en `construirSistema`, que cubre también al siguiente que
reconstruya un sistema ya servido.

#### Comprobado

Tres comprobaciones en `verificar-registro-configurado` (la clave del rol, la
deduplicación, el observador sin riesgos) y dos en
`hallazgos-maquina-configurada.test.jsx` (el observador sin avisos de motor, y
su reverso: sin tipo SÍ se evalúa). **Vistas fallar a propósito**, las cinco.

> **Un tropiezo que merece quedar escrito**: la prueba del aviso inventado
> pareció no cazar el defecto dos veces seguidas. No era débil — mis dos
> sustituciones para romper el código no se estaban aplicando. Al romperlo de
> verdad, falló. **Verificar que una prueba caza exige comprobar también que el
> sabotaje llegó a aplicarse**, y esas dos corridas anteriores no probaban nada.

**Tanda:** lint y tipos limpios · los 41 verificadores · asistente intacto
(181 / 75) · backend **445/445** · frontend **1206** (5 nuevas). Cayó la
intermitente de accesibilidad ya documentada, que pasa aislada.

### F5 · El asistente responde sobre Sensado — ✅ **COMPLETADA 26-09-2026**

Salió **casi** gratis de las capacidades, como se esperaba — pero se verificó en
vez de suponerlo, y el verificador no la cubría: todo lo de arriba se comprueba
contra la espejo de VIBRACIONES, que diagnostica.

Se registra ahora una máquina observadora propia en
`scripts/verificar-herramientas.mjs` —cuatro tomas independientes, ninguna serie
verificada—, porque la espejo no puede representar esto: sus tags llevan el
apoyo en el nombre y su tipo trae 19 reglas.

**Ocho comprobaciones `[sensado]`**, y lo que fijan no es que conteste bien sobre
riesgos sino que **no se invente uno**:

| Se comprueba | Por qué importa |
|---|---|
| La ve en el registro, con su nombre | sin esto el asistente diría «no hay ninguna máquina así» |
| **NO se le ofrece diagnóstico** | ofrecer una herramienta que luego se niega gasta un turno del modelo para llegar al mismo sitio |
| Sin serie verificada, tampoco historia | prometerla es el fallo que `capacidadesDe` existe para no cometer |
| Su estado trae familia y unidad | lo que la F4.2 arregló, fijado para que no se pierda |
| **Un punto mudo sale como HUECO** | `CLAUDE.md` §2.4 |
| El resumen le PROHÍBE juzgar | el aviso viaja DENTRO del resumen, no en el prompt general: es de este tipo |
| Los huecos se cuentan aparte | omitir una señal muda se leería como «esta máquina no mide eso» |
| Su tipo no produce riesgos | ni con lecturas delante |

Vistas fallar a propósito disfrazando el hueco de cero: caen dos.

**La puerta obligatoria queda en 191 / 75** (ocho más en herramientas).

### F6 · Reportes de Sensado — ✅ **COMPLETADA 26-09-2026**

Se esperaba una comprobación, no trabajo: `lectura-de-sensores` y `energias` ya
existían del Plan 44 y leen roles, no física de vibraciones. **La comprobación
encontró un defecto**, y de los que sólo se ven generando el PDF de verdad.

#### La plantilla «genérica» conocía un solo tipo

`lectura-de-sensores` filtraba sus sensores así:

```js
fam === 'medida' || fam === 'variador'
```

Ésas son las familias de `vibraciones`. Con `sensado` delante —`electrica`,
`ambiente`, `optica`— **no pasaba ni una señal**, y el PDF salía diciendo «no hay
sensores que listar» de una máquina que lee diez. Tres de sus siete secciones
vacías por eso.

**El criterio correcto no es de qué FAMILIA es**, porque eso obliga a la
plantilla a conocer cada tipo que exista y el siguiente se vuelve a olvidar.
Es **qué CLASE de señal es**: un reporte de lecturas lista lo que tiene un
número y una unidad, y excluye lo booleano y los contadores por lo que son.

#### Medido contra planta, antes y después

```
antes  4 secciones con dato · 3 vacías por «no hay sensores que listar»
ahora  6 secciones con dato · 1 vacía, y su motivo es el correcto:
       «no tiene ninguna serie verificada en el historiador… se puede decir
        cómo está ahora, no cómo estuvo»
```

Y las **10 señales entran en la tabla** con su valor real de planta y su unidad
(3 A, 8 °C, 2 ppm…). Se comprobó mirando las filas que recibe la plantilla —lo
que se imprime—, porque el PDF incrusta sus fuentes y su texto no se puede
extraer para afirmar nada sobre él.

> **La única sección vacía es la correcta y su motivo también**: ninguna serie
> está verificada (F3), así que no hay tendencia que dibujar. El PDF lo dice en
> vez de dejarla en blanco (`CLAUDE.md` §2.5).

**Dos comprobaciones nuevas**: que el reporte se genera y que **toda** sección
vacía trae un motivo escrito; y que pedirle un reporte de VIBRACIONES no le
inventa zonas ISO ni un diagnóstico de un motor que no hay.

**Sin regresión en vibraciones**: su reporte estaba verificado contra planta en
el Plan 44 y sus comprobaciones siguen en verde.

**Tanda:** lint y tipos limpios · los 41 verificadores · puerta **191 / 75** ·
backend **445/445** · frontend **1207**.

### F6.1 · La pantalla se caía: ICONICS entrega CADENAS — ✅ **26-09-2026**

Con la F6 dada por buena, el usuario abrió Sensado y la vista **no existía**:

```
Uncaught TypeError: animado.toFixed is not a function
    at Cifra (InicioSensado.jsx:168)
```

**La causa.** ICONICS entrega sus lecturas como **cadena** —`"7"`, no `7`—, el
tipo las pasaba tal cual y `valor.toFixed(...)` lanza sobre un string. El
ErrorBoundary se comía la pantalla entera.

> **Es el peor modo de fallo que puede tener un tablero de muro: no degrada, no
> avisa, desaparece.** Y en la demo no habría nadie tecleando para recuperarlo.

#### Por qué NINGUNA de las pruebas lo cazó

Ni las 8 de la F5, ni las 8 de la vista, ni los 41 verificadores. Todas pasan
**números**, que es lo que uno escribe sin pensar al fabricar un doble:

```js
senal("electrica:corrienteL1", …, 12.4, …)   // el doble
{ "value": "7" }                             // el transporte real
```

**El doble no se parecía al transporte justo en esto.** Y el dato estaba a la
vista desde el primer sondeo del 24-09 —`"value": "7"` aparece en el volcado que
este mismo plan cita en §3.1.1— sin que nadie lo leyera como un tipo.

#### El arreglo, en dos capas

1. **En la frontera del tipo** (`toNumber`, de `shared/valores.js`), que es donde
   su cabecera dice que va: «saneamiento de las lecturas crudas de ICONICS, en
   la frontera». Una cadena no numérica acaba en `null` → hueco con su motivo,
   nunca un cero.
2. **En la vista**, otra vez, y no sobra: dos líneas para que ningún tipo
   futuro pueda tumbar el tablero por un tipo de dato. Las cinco piezas que
   hacen aritmética con el valor —dona, barra de ambiente, medidor, batería—
   se sanean igual.

#### Comprobado

Tres pruebas nuevas con valores **como los entrega ICONICS**: una cadena
numérica se pinta, una cadena que no es número sale como hueco, y los arcos no
quedan con `NaN` en sus atributos. **Vistas fallar a propósito**: caen las tres.

Y contra planta: el crudo llega `"1"` (string) y las diez señales salen `number`.

> **La lección, que vale más que el arreglo:** un doble que sólo usa la forma
> CÓMODA del dato no prueba la frontera. Cuando el transporte real tiene un
> volcado disponible —y aquí lo había desde el día uno— la fixture debería
> copiarlo, tipos incluidos.

**Tanda:** lint y tipos limpios · los 41 verificadores · puerta **191 / 75** ·
backend **445/445** · frontend **1210**.

### F6.2 · Lo que se vio al mirarla ya funcionando — ✅ **26-09-2026**

Con la vista por fin en pie, el usuario mandó la captura. Funcionaba —las diez
señales, sus valores, sus unidades— y aun así había **tres defectos de lectura**
y una tentación que había que no caer en ella.

#### 1 · Un arco del 3 % se veía como un guion suelto

`strokeLinecap="round"` redondea los dos extremos, y con un arco pequeño se
solapan: la corriente de 3 A sobre 0–100 A se dibujaba como una pastilla
flotando, que se lee como un defecto de pintado y no como un valor bajo. Ahora
el remate es `butt` por debajo del 4 % y `round` cuando hay sitio.

#### 2 · El marcador de la barra salía partido

Llevaba `top: -2` y `height: 10` dentro de una pista de 6 px con
`overflow: hidden`: el navegador le cortaba 2 px arriba y 2 abajo. Ahora cabe
dentro y la pista ya no recorta nada.

#### 3 · La advertencia se repetía tres veces

«La franja es una referencia de confort, no un umbral de alarma» aparecía en
cada tarjeta de ambiente: tres de sus cuatro líneas, compitiendo con el número
—que es lo que se mira desde lejos—. **No se puede quitar** (es lo que impide
leer la franja como una alarma), así que va una sola vez bajo el rótulo de la
sección.

#### 4 · La tentación: encoger las escalas

Cuatro de los siete medidores quedan por debajo del 5 % con los valores de
prueba de hoy:

```
corriente L1      3 sobre [0, 100]     ->  3.0 %
CO2               2 sobre [0, 2000]    ->  0.1 %
iluminación       7 sobre [0, 1000]    ->  0.7 %
```

Lo fácil era apretar las escalas para que «se vean mejor». **Es exactamente lo
que §4 de este plan advierte que no hay que hacer**: la escala sale del rol, y
una ajustada a constantes de prueba se rompe el día que lleguen valores reales
—7 lux y 7 A no se parecen en nada—.

Lo que se arregla es la **lectura**, no la escala: las tres piezas escriben
ahora sus extremos (`0–2000 ppm`, `0–100 A`). Sin ellos una barra casi vacía no
se puede interpretar: 2 sobre 0–2000 y 2 sobre 0–10 se ven igual.

> Es el mismo criterio que `CLAUDE.md` §2.5 aplica al dato: si no se puede
> afirmar algo, se enseña lo que hay y se dice de qué tamaño es la regla.

**Tres pruebas nuevas** (extremos en la tarjeta, rango en la dona, advertencia
una sola vez). Frontend **1212**; cayó la intermitente de
`detalle-maquina-simulada` ya documentada, que pasa aislada 9/9.

### F6.3 · El sondeo guardaba la PEOR de sus tres ventanas — ✅ **26-09-2026**

La ficha decía «**10 sin muestras en el historiador**» de unas series que sí
tienen muestras. El usuario insistió —«el historian sí debería estar
funcionando»— y tenía razón.

**Primero descarté mal.** Culpé a la sesión de ICONICS: su backend llevaba 51
minutos arrancado, de antes del arreglo de la F4.1. Reinició, y **seguía
igual**. El diagnóstico era plausible y estaba equivocado.

**La causa real.** La ruta prueba tres ventanas —24 h, 72 h, 7 días— y
guardaba `intento` en cada vuelta, cortando sólo si algo **verificó**. Con una
máquina cuyas series no pueden verificarse —diez constantes, sin testigo— nunca
cortaba, así que se quedaba con la **última**: la de 7 días.

```
 24 h  -> sinVariacion: 10 · sinDatos:  0    (hay dato, es plano)
 72 h  -> sinVariacion: 10 · sinDatos:  0
168 h  -> sinVariacion:  0 · sinDatos: 10    <- se guardaba ÉSTA
```

> **Lo que hacía daño no era el fallo, era el diagnóstico equivocado.** «Sin
> muestras» manda a revisar el historiador; «sin variación» dice la verdad —la
> señal no se mueve— y no pide arreglar nada.

**La cabecera de esa misma función ya decía la intención**: «se usa la primera
que traiga **material suficiente para comparar**». El código medía
verificación, no material. Ahora se queda con la ventana que más series trajo
con dato, y verificar sigue siendo el corte porque es lo mejor que puede pasar.

**Sin regresión en vibraciones**: 60/92 verificadas antes y después, medido
contra planta en la misma corrida.

**Qué se verá ahora** al sondear Sensado: «10 sin variación en la ventana» en
vez de «10 sin muestras». Sigue sin verificarse —y es correcto: con valores
constantes el sondeo no puede distinguir una serie de otra, y se niega a
prometer historia que no puede sostener—. Se resolverá solo en cuanto planta
mande valores que se muevan.

### F7 · El tanque como configurada — §5.3

### F8 · Las pantallas de la demo — §8

---

## §8 LAS OCHO PANTALLAS

**Lo que hay:** 3 equipos (ICONICS · IA · front+back). 8 pantallas: **2** en
escritorio, **6** en videovigilancia 3×2. Del front+back salen **hasta 4**
señales; de ICONICS **hasta 4, pero lo ideal son 2**.

**Restricción real:** 2+4 = 6 señales cómodas para 6 pantallas del muro, y el
escritorio necesita 2. **Las fuentes no llegan a 8 sin forzar.** De ahí que el
escritorio se sirva del equipo desde el que se opera.

### La propuesta

**Escritorio (2) — desde front+back, es donde se interactúa**

| | Qué | Por qué |
|---|---|---|
| 1 | **El asistente**, a pantalla completa | Es lo que se demuestra en vivo: se le pregunta y responde |
| 2 | **Configuración de máquinas** | Enseña *cómo se da de alta* — el flujo de §1, en directo |

**Muro 3×2 (6) — lo que se mira, no lo que se toca**

| | Qué | Fuente |
|---|---|---|
| 3 | **Dashboard de Sensado** ← *la pieza nueva* | front |
| 4 | **Vibraciones**: estado y tendencia | front |
| 5 | **Tanque** ya configurado | front |
| 6 | **Predicción** (el compresor) | front (4.ª señal) |
| 7 | **ICONICS**: el árbol / pantalla nativa | ICONICS |
| 8 | **ICONICS**: tendencias del historiador | ICONICS |

**El argumento de esta disposición**, y es lo que la hace defendible: la fila
superior cuenta **de dónde viene el dato** (ICONICS) y la inferior **qué hacemos
con él** (nuestro tablero y la IA). Un visitante que entre por el muro entiende
la cadena sin que nadie se la explique.

**Sensado en la 3 y no en la 7** a propósito: es lo más vistoso y lo más nuevo,
y va en el centro del muro, a la altura de la vista.

**Si ICONICS sólo da 2 señales** (lo ideal según el usuario), encajan justas en
7 y 8. Si diera 4, la alternativa es mover Predicción a ICONICS y liberar una
señal del front por si algo falla en vivo — **conviene dejar ese margen**.

---

## §9 RIESGOS DE ESTE PLAN

| Riesgo | Por qué | Mitigación |
|---|---|---|
| ~~D1 sin respuesta~~ | **Resuelta**: raíz sondeada y activa (§3.1.1) | — |
| ~~El historiador no registra~~ | **Resuelto el mismo día** (§3.1.2): 14/14 con muestra | — |
| **Los valores son 1–9 de prueba** | Una vista ajustada a ellos se verá mal con datos reales (§3.1.1) | Escalas desde el rango del rol, nunca desde lo observado hoy |
| **Los sensores no están montados** | «Estará ubicado en la demo» sugiere que aún no; y los valores fijos lo confirman | F3 acepta configuración parcial: `rolesRequeridos` vacío (§3.2) |
| **F4 se come el tiempo** | «Impacto visual» no tiene fondo | Las cuatro piezas de §4.3, en ese orden. Iluminación y dona primero |
| **Reabrir el tanque toca mucho** | Cuatro de sus archivos los importa medio backend (§5.2) | F7 va **al final**. Si no da tiempo, Sensado se entrega igual |
| **Dos máquinas nuevas a 5 días** | Es lo que es | Sensado es la prioridad: es lo nuevo y lo que se pidió con detalle |

---

## §10 ORDEN SUGERIDO

```
  D1 ✔ resuelta (raíz sondeada 24-09)
  F1 ──► F2 ──► F3* ──► F4 ──► F5 ──► F6      (* la configura el usuario, juntos)
                                          └──► F8 (ensayo en las 8 pantallas)
  F7 (tanque) ───────────────────── en paralelo, y es lo primero que se sacrifica
```

**F1 primero y sin discusión**: hasta que un tipo sin reglas sea legal, `sensado`
no se puede ni declarar.
