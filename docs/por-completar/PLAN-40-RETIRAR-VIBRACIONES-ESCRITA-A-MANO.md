# PLAN 40 — Retirar la máquina de vibraciones escrita a mano

**Estado:** F0 completada · F1–F5 por completar
**Rama:** `Vibraciones1.0`
**Fecha:** 21-09-2026

> Es la F5 del Plan 34, que decía «sólo cuando F3 y F4 estén verdes»: el
> catálogo escrito a mano lleva dentro conocimiento verificado punto por
> punto, y perderlo «no daría un error: daría un tablero que enseña la señal
> equivocada con su rótulo correcto». Ese conocimiento ya vive en la
> configuración, ganado por sondeo (Plan 34 F2, Plan 36), y con las F0–F2 del
> Plan 39 la configurada hace en el asistente todo lo que hacía el catálogo.
> El usuario lo pidió así:
>
> > «La máquina de vibraciones escrita a mano ya no debería existir, no?
> > Ahora vamos a manejar todo desde las configuradas.»

---

## 0. Qué se retira y qué se queda

Se retira **la ENTRADA** `vibraciones` del registro (`shared/eva/comun/sistemas.js`):
sus raíces, `puntos()`, `parse()`, `modelo()`, `series` y todo lo que en el
backend, el frontend y los guiones la nombra por su id. La misma instalación
queda **sólo como máquina configurada** (`Nuevo-Modor`, `vib-motor-03`, en
planta), construida por `construirSistema` desde `datos/maquinas.json` con el
tipo `vibraciones`.

Se queda **el TIPO** (`shared/eva/tipos/vibraciones.js`) y los módulos que lo
definen (`shared/eva/vibraciones/*.js`): roles, reglas, estado, resumen,
umbrales, decodificación de vigilancias, y —desde este plan— la simulación.
Eso no es «escrito a mano» en el sentido que se retira: es la definición de
qué es una máquina de este tipo, y una configurada la necesita entera.

El **tanque** no se toca: sigue escrito a mano y cerrado (rama).

---

## 1. Lo que hay, medido el 21-09-2026

| Dónde | Qué depende de la entrada |
|---|---|
| `shared` | La simulación del transporte falso es su `modelo` (`valorVibracionEn`, que parsea los tags de ESA máquina). `sistemaDePunto` la elige primero para los tags que comparte con la configurada. `NO_COMPARTEN`, `SISTEMAS_EN_SERVICIO`. |
| Backend | 6 archivos importan su catálogo; 7 nombran el id: `esDeVibraciones`, el `switch (sistema.id)` de `lib/maquina.mjs`, `MACHINES_EN.systems.vibraciones` en el narrador inglés, el motor, los esquemas, el prompt. |
| Frontend | 17 archivos importan el catálogo; 9 nombran el id fuera de pruebas; el badge del sidebar, `useVibracion`, `vibracionSource`, el muro de planta y el 3D leen la escrita a mano; 47 pruebas la usan. |
| Guiones | 15 verificadores y `configuracionEspejo` derivan de ella. |
| Planta | `Nuevo-Modor` tiene 17 series verificadas de 94 (sondeada en paro); el catálogo declara 36. |

El inventario detallado, archivo por archivo, va en cada fase.

---

## 2. Decisiones

**D1 · La simulación es del tipo, no de la máquina.** El transporte falso da
valores a un punto preguntándole al registro (`sistemaDePunto().modelo()`).
Hoy sólo la escrita a mano sabe simular, porque `valorVibracionEn` parsea SUS
tags. El simulador ya calcula por clave y apoyo; lo que se hace es exponerlo
por DESCRIPTOR (`{tipo, clave, canal}`) y que la entrada configurada
traduzca cada variable a su descriptor por rol. Cualquier configurada de
tipo vibraciones, con cualquier tag, simula. Es el prerequisito: sin esto no
hay desarrollo sin planta después de retirar la entrada.

**D2 · Nada distingue por `id === 'vibraciones'`; se distingue por tipo o
por capacidad.** Lo que hoy pregunta por el id pasa a preguntar
`sistema.tipo === 'vibraciones'` (o lo que la entrada declare). El tanque
conserva sus `id === 'tanque'` hasta el Plan 33 F9.

**D3 · El menú es el de las configuradas.** La sección escrita a mano
(`eva-*` de vibraciones) desaparece; quedan las secciones `maq:<id>` del
Plan 37. Lo que la escrita a mano tenía y la configurada no —Alarmas (Plan
37 F4), el badge del sidebar— se completa aquí, porque retirar sin
completar sería perder función.

**D4 · El badge cuenta por configurada activa.** Se había dejado fuera
porque «exigiría un motor por máquina montado en todas las pantallas». Es lo
que hay: un motor por configurada, con conteo de referencias, compartido con
la sección de esa máquina cuando está abierta. Con una o dos máquinas es lo
mismo que hoy; con veinte se mide y se decide.

**D5 · La espejo pasa a ser una fixture, no una derivación.** Hoy
`configuracionEspejo` se deriva del catálogo en cada arranque de los guiones.
Sin catálogo, se congela UNA vez en JSON con el conocimiento del sondeo
dentro (`historyVerified`), y los guiones la leen. Un guion de siembra la
escribe en `MAQUINAS_RUTA` para quien arranque sin planta.

**D6 · Los datos de planta los toca quien los tiene.** Dar de baja la espejo
`vibraciones-configurada` de `datos/maquinas.json` y volver a sondear
`Nuevo-Modor` en marcha son pasos del usuario desde el tablero. El plan los
deja escritos con lo que hay que mirar; no los ejecuta por él.

**D7 · Commit por fase, y la suite en sus números o con los cambios
justificados** (criterio del Plan 34 F5).

---

## 3. Las fases

### F0 — La simulación al tipo

**Objetivo.** Que una máquina configurada de tipo vibraciones tenga valores
en el transporte falso, con sus propios tags.

**Cómo.** `valorVibracionDe(descriptor, ms)` en el simulador, con
`valorVibracionEn(nombre, ms)` como envoltorio que parsea y delega. El tipo
expone `simular(descriptor, ms)`. `construirSistema.modelo(nombre, ms)`
traduce la variable a su descriptor por rol y apoyo —y los contadores del
área por su sufijo— y llama al tipo; sin tipo que simule, `null` como hoy.

**Criterios.** Una configurada con raíz propia (no la del catálogo) responde
en el falso con valores de buena calidad; para el mismo instante, cada uno
coincide con el que da el catálogo al tag equivalente; el sensor, que no
tiene rol, sigue siendo hueco declarado.

**Completada el 21-09-2026.** `valorVibracionDe(descriptor, ms)` en el
simulador; `descriptorDe(rol, apoyo)` y `simular` en el tipo;
`construirSistema.modelo(nombre, ms)` traduce por rol y apoyo, y los
contadores por su clave.

#### Lo que de verdad pasó (F0)

**68 de 73 puntos de la espejo dan exactamente el mismo valor que el
catálogo** en el mismo instante; los cinco que callan son los que el catálogo
también calla (`DKW_S1` y su calidad, medidos el 25-08-2026 como mudos) o
los que no tienen rol (los tres sensores). Una configurada con raíz
`ac:OTRA/PLANTA/` —tags que ningún catálogo conoce— simula igual, contadores
del área incluidos, y el transporte falso la sirve con calidad buena.

**Una medida de apoyo sin apoyo no se simula.** La física es POR apoyo (S3
vibra más que S1); una variable con rol `medida:vRMS` y sin `assetId` no
tiene qué simular y queda en hueco, no en el valor de un apoyo cualquiera.
El check que fijaba «sin física devuelve null» se reescribió en dos: sin
apoyo, hueco; con apoyo, el valor del tipo para ese apoyo.

**Los tags del catálogo llevan el sufijo del apoyo** (`S3/vRMS_S3`, no
`S3/vRMS`): un check nuevo lo asumió al revés y falló contra `undefined`,
que es lo que el catálogo dice de un tag que no es suyo. Corregido el check,
no el código.

**Pruebas**: `verificar-registro-configurado` 33 → 34,
`verificar-vibraciones-configurada` 33 → 35, `verificar-transporte-falso`
28 → 29; backend 385, frontend 1083, lint y tipos.

### F1 — El backend sin el id

**Objetivo.** Que ningún camino del backend necesite que exista `vibraciones`.

**Cómo.** `esDeVibraciones` y el `switch` de `lib/maquina.mjs` por tipo; el
narrador inglés toma el nombre de la entrada; el motor, los esquemas y el
prompt sin el id literal; `intencion.mjs` y el banco de evaluación revisados.
Las pruebas del backend que pedían `sistema: 'vibraciones'` pasan a la espejo
registrada.

**Criterios.** Con la entrada retirada (F3), `backend/test` y la puerta en
verde sin un solo `'vibraciones'` como id de sistema fuera del tipo.

### F2 — El frontend sin la sección escrita a mano

**Objetivo.** Que el tablero enseñe vibraciones sólo por sus máquinas
configuradas, sin perder función.

**Cómo.** Se retiran las rutas `eva-*` de vibraciones y lo que sólo ellas
usaban; `useVibracion` y `vibracionSource` desaparecen o pasan a la
configurada; el badge suma las configuradas activas (D4); Alarmas de la
máquina configurada (Plan 37 F4) entra aquí; el muro de planta y el 3D
leen la configurada. El transporte SIMULADO del frontend usa `modelo()` de
la entrada (F0) en vez de negarse. Las 47 pruebas se reescriben sobre la
configurada o se retiran con la sección, y cada retirada se anota.

**Criterios.** La sección `Nuevo-Modor` tiene todo lo que tenía la escrita a
mano; el badge cuenta sus hallazgos; en SIMULADO pinta valores; la suite en
verde con los cambios justificados.

### F3 — Retirar la entrada; guiones y fixture

**Objetivo.** Quitar `vibraciones` de `SISTEMAS` y que los guiones sigan
probando lo mismo sobre la configurada.

**Cómo.** La espejo se congela en `scripts/lib/vibraciones-espejo.json` con
sus 36 series verificadas; `configuracionEspejo` la lee; un guion la siembra
en `MAQUINAS_RUTA`. Los 15 verificadores que la nombraban se reescriben:
`verificar-vibraciones-configurada` deja de comparar contra el catálogo y
fija lo que la configurada hace; `dominio-configurado`, `transporte-falso`,
`herramientas`, `registro-configurado` cambian su referencia. La entrada, sus
raíces y `GRUPO_HISTORIADOR` se van; `generar-configuracion-vibraciones` se
retira con su motivo escrito.

**Criterios.** Los 41 verificadores (o los que queden, con el cambio
escrito), sin `SISTEMA.vibraciones` en ningún guion.

### F4 — Planta

**Objetivo.** Que la única máquina de vibraciones en planta sea `Nuevo-Modor`,
con sus series verificadas en marcha.

**Cómo.** Pasos del usuario, escritos aquí: sondear `Nuevo-Modor` con el
motor girando (el sondeo en paro dejó 33 sin muestras), dar de baja
`vibraciones-configurada`, y correr `medir-asistente-configurada`.

**Criterios.** El instrumento sobre `Nuevo-Modor` sin otra vibraciones en el
registro; el número de series verificadas anotado.

### F5 — Documentos

`HANDOFF`, `CLAUDE.md` (§4.7 habla de «`tanque` y `vibraciones`»),
`shared/README.md`, `Demo-EVA/README.md`, y el Plan 34 F5 cerrado remitiendo
aquí. El Plan 32 se revisa: lo que pedía para la escrita a mano se reformula
para la configurada o se cierra.

---

## 4. Riesgos

**El conocimiento del sondeo.** Las 36 series verificadas del catálogo
existen porque alguien las sondeó; `Nuevo-Modor` tiene 17 porque se sondeó
en paro. Retirar el catálogo no pierde nada en el código —la fixture las
conserva— pero en PLANTA el tablero lee lo que la configuración diga. Por
eso F4 pide sondear en marcha antes de dar por cerrado.

**El badge.** Un motor por configurada en todas las pantallas. Con veinte
máquinas habría que medirlo; hoy hay una.

**El frontend en SIMULADO.** Hoy se niega para una configurada; con F0 puede
simular, y es la primera vez que el simulador del tipo sirve a una máquina
con tags distintos de los del catálogo. Se prueba en el falso antes que en
el navegador.

**Lo que el tipo no sabe de una máquina concreta**: sensibilidad de los
sensores, rodamiento de cada apoyo, tren mecánico del 3D. Hoy salen del
catálogo; una configurada los tiene como hueco declarado. Retirar la entrada
hace ese hueco visible en el tablero. Se anota lo que la configuración
tendría que poder declarar (Plan 36, una segunda vuelta), no se inventa.
