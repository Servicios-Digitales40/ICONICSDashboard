# PLAN 40 — Retirar la máquina de vibraciones escrita a mano

**Estado:** F0–F3 y F5 completadas · F4 (pasos en planta, del usuario) por completar
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

**Lo que de verdad pasó (22-09-2026, en el mismo commit que F3).**

- Se intentó F1 sola y dejó la puerta en rojo: la entrada escrita a mano no
  tenía `tipo`, así que `esDeVibraciones = s => s.tipo === 'vibraciones'`
  dejaba de reconocerla ANTES de que F3 la retirara. Por eso F1 y F3 van
  juntas: no hay estado intermedio verde.
- `lib/maquina.mjs` pierde su `case 'vibraciones'`; `motor/diagnostico.mjs`
  sólo conoce las reglas del tanque en `REGLAS_POR_SISTEMA` (las de
  vibraciones las trae el tipo); el banco de evaluación pregunta por «la
  máquina de vibraciones», no por el id.
- El narrador inglés (`narrarEstadoVibraciones.mjs`) toma `sistema` del
  resumen y los apoyos del estado. Y la primera limitación —la única que el
  asistente cita en su `aviso`— **ya no se traduce por el id de la máquina**,
  que ahora lo elige quien configura, sino **por su texto**
  (`LIMITACION_EN_POR_TEXTO` en `narrarEstadoTanque.mjs`). Si el texto no está
  en la tabla, sale en español: mejor eso que inventar una limitación.
- El transporte falso sigue publicando la instalación de la demo aunque
  nadie la haya configurado: importa `CATALOGO_VIBRACIONES` y lo usa como
  respaldo en el árbol (`construirArbolFalso`), en la lectura en vivo y en el
  historiador. **Un defecto que apareció al hacerlo:** el respaldo se escribió
  con `??`, que pisaba el `null` («declarado, sin dato») que devuelve una
  configurada para un sensor sin rol; `verificar-transporte-falso` lo cazó
  («el sensor sin rol tiene que ir sin dato») y el respaldo sólo entra con
  `undefined` (nadie lo reclama). El contrato de tres estados de `modelo()`
  aguantó porque había una prueba mirándolo.
- Quedan literales `'vibraciones'` sólo como **tipo** o en cabeceras que
  cuentan la historia; en las pruebas, `SISTEMA.vibraciones` aparece una vez,
  para afirmar que es `undefined`.

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

#### Lo que de verdad pasó (F2)

**El orden cambió: F2 antes que F1.** La F1 sola dejaba la puerta en rojo:
la entrada escrita a mano no tiene `tipo`, y sin el `case 'vibraciones'` por
id dejaba de evaluar reglas y de narrar en inglés hasta que se retirara en
F3. Así que F1 y F3 van en el mismo commit, y el frontend se hizo primero,
con la entrada viva, para reescribir sus pruebas con una red debajo.

**Lo que se retiró del frontend**: las cinco rutas de la escrita a mano
(`vib-inicio`, `eva-vibraciones`, `vib-controles`, `eva-riesgos-vibracion`,
`vib-3d`), `useVibracion()`, `vibracionSource.js`, el simulador de vibraciones
del frontend y `ControlesVibraciones.jsx` (un placeholder sin botones: una
configurada declara sus variables de sólo lectura). La sección
`sec-vibraciones` alojaba además cinco rutas generales —alarmas, bandeja,
avisos, casos y RAG—, así que no desaparece: se llama `sec-planta` («Planta»)
y gana el muro, que pasa a ser la ruta de entrada (`DEFAULT_ROUTE = eva-muro`:
todas las máquinas a la vez, ninguna es «la» de entrada).

**Lo que se añadió para no perder función**: `useMaquinasEnVivo()` —una
suscripción por configurada activa, con conteo de referencias— alimenta el
badge del sidebar, el muro (un panel por máquina) y la bandeja y los avisos
cuando se abren sin máquina delante, que antes eran «la escrita a mano» y
ahora son todas. `maq-riesgos` sustituye a `eva-riesgos-vibracion` como
destino oculto de la bandeja, los avisos y el asistente (`porMaquina.oculta`,
que `buildNav` respeta). La pastilla del topbar se elige por la máquina de la
pantalla y su tipo, no por sección. El transporte SIMULADO de una configurada
simula con la física del tipo (F0) en vez de negarse. Y una tolerancia
nueva, `useTransporteActual()`: el chrome se monta también sin proveedor de
origen —en pruebas, en una pantalla suelta— y lanzar ahí convertía el sidebar
en algo que no se puede montar solo; «no lo sé» cae del lado real.

**Dos `id === "vibraciones"` que eran defectos latentes**: `useEvidencia`
elegía la prosa por id de máquina —una configurada del tipo caía en la del
tanque— y ahora lo hace por tipo desde el provider; `riesgoVibracion.jsx`
llevaba fijo el id en los casos previos y en el cierre de diagnóstico, y ahora
toma la máquina de la pantalla. Son los gemelos en el frontend de los que el
backend ya había arreglado (Plan 38 F1, 39 F1).

**Las pruebas**: 24 archivos rotos tras el cambio, 66 casos. La mayor parte
por un mismo motivo, el proveedor de origen, que resolvió
`useTransporteActual`. El resto se repartió en tres agentes por área, con la
regla de reescribir sobre una configurada y borrar sólo lo que perdió sujeto
(la comparación «con la escrita a mano nada cambia», el panel fijo del muro,
la ruta de la escrita a mano). Los tres se cortaron a media tarea por el
límite de sesión y se retomaron. Lo que cada uno reescribió y lo que
encontró va en el commit.

**Cuatro defectos que las pruebas reescritas destaparon, y se arreglaron
aquí:**

- `AvisosEva` **no narraba nunca** con una máquina configurada delante: la
  reconciliación se hacía dentro del actualizador de estado y sacaba los
  pendientes por un canal lateral, lo que sólo funciona si React ejecuta el
  actualizador en el acto; con otra actualización pendiente en el mismo
  montaje —la de `useDominioVibracion` o `useMaquinasEnVivo`— quedaba vacío.
  Lo cazó una prueba con el hook real, no con el doble. Se reconcilia fuera,
  sobre la lista vigente por referencia.
- «Ver el diagnóstico» en Avisos navegaba sin `maquina`, y Cierre de
  diagnóstico no abría la fuente de la configurada.
- `CasosRag`, `CuadernoEva` y `TurnoEva` filtraban o listaban por
  `SISTEMA_IDS_EN_SERVICIO`, el registro escrito a mano: al retirar la entrada
  en F3, los casos de una configurada habrían desaparecido de la vista de
  planta. Leen ahora `enServicioIds` del contexto de máquina, que suma las
  configuradas.
- Dos bucles de render por identidad de array: `useMaquinasEnVivo` se
  resuscribía con cada array nuevo de máquinas, y `CasosRag` recargaba con
  cada array nuevo de ids. Con el provider real no pasa (memoiza), con un
  doble que recompone sí, y se vio como un worker de vitest sin memoria a los
  4 GB. Las dos dependencias son ahora por contenido.

**Lo que el frontend NO tiene para una configurada y sí tenía la escrita a
mano**, que se ve ahora en pantalla: la sensibilidad de cada sensor y el
rodamiento de cada apoyo salen como hueco declarado; el tren mecánico del 3D
es el del tipo, no de la máquina. Plan 36, segunda vuelta.

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

**Lo que de verdad pasó (22-09-2026).**

- La entrada `vibraciones` de `SISTEMAS` se retiró (258 líneas), con sus
  importaciones y `GRUPO_HISTORIADOR`. Su FORMA se conserva en
  `shared/eva/vibraciones/catalogoDemo.js` como `CATALOGO_VIBRACIONES`,
  reconstruida desde los módulos del tipo y comprobada idéntica a la entrada
  antes de borrarla. No está en el registro: es la referencia contra la que se
  compara la configurada, y lo que el transporte falso publica.
- `shared/modulos.js`: `monitoreo` lista sólo `tanque`; `moduloDeSistema`
  reclama cualquier configurada (es de ICONICS por definición).
  `verificar-modulos` exige que la respuesta sea UNA, venga de la lista o de
  esa regla.
- Los hechos de `aprendizaje.js` que decían `sistema: 'vibraciones'` pasan a
  `sistema: null` (valen para el tipo, no para una máquina concreta) y el que
  hablaba del grupo con espacio se retiró: era del historiador de la
  instalación, no del tipo.
- La fixture `scripts/lib/vibraciones-espejo.json` (73 variables, 36 series
  verificadas) es la máquina de la demo. **Dos cosas que le faltaban y que
  sólo aparecieron con la entrada fuera:** (1) los tres apoyos como assets
  con nombre (`S1` → «Lado acople», `S2` → «Rodamiento intermedio», `S3` →
  «Lado libre»), porque una configurada saca el nombre del apoyo de
  `assets[].nombre` y sin eso el asistente decía «S1 (S1, bearing
  unidentified)»; (2) sus limitaciones reales (la del `aPeak_S1` primero)
  en vez del texto «configuración DERIVADA del catálogo… para comparar», que
  desde esta fase es falso. `datos/maquinas.json` no está versionado: hay que
  volver a sembrarlo (`ICONICS_FAKE=true node scripts/sembrar-espejo.mjs`),
  y en planta darle esos nombres desde el árbol (F4).
- `generar-configuracion-vibraciones.mjs` se retiró (derivaba del catálogo
  que ya no existe); lo sustituye `sembrar-espejo.mjs`, que escribe la
  fixture en `MAQUINAS_RUTA`.
- Verificadores tocados: 15. Los que registran la espejo lo hacen arriba, una
  vez (`verificar-herramientas`, `verificar-transporte-falso`);
  `verificar-vibraciones-configurada` compara ahora contra
  `CATALOGO_VIBRACIONES` y construye su propia configurada SIN verificadas
  para el «sin sondear no promete ninguna serie»;
  `verificar-registro-configurado` calcula el núcleo común entre el tanque y
  el catálogo. Dos asertos cambiaron de sentido y lo dicen: el nombre del
  sistema en inglés es el id de la configurada (un identificador no se
  traduce), y `reglas_evaluadas` puede superar `reglas.length` porque las
  reglas de apoyo se evalúan una vez por apoyo.
- Frontend: seis archivos de prueba registraban la entrada escrita a mano;
  ahora registran la espejo. Una desigualdad se perdió y está anotada en
  `procedencia.test.js`: la ruta del historiador de una configurada es
  `hda:` a secas (el nombre histórico viaja literal por variable), igual que
  la del tanque. Ningún defecto en `src/`.
- Medido al cerrar: puerta 182 correctas + 22 omitidas (herramientas) y 71
  (chat); `npm run verificar` 41 de 41; backend 385; frontend 1090 (+29
  omitidas); lint y types limpios.

### F4 — Planta

**Objetivo.** Que la única máquina de vibraciones en planta sea `Nuevo-Modor`,
con sus series verificadas en marcha.

**Cómo.** Pasos del usuario, escritos aquí: sondear `Nuevo-Modor` con el
motor girando (el sondeo en paro dejó 33 sin muestras), dar de baja
`vibraciones-configurada`, y correr `medir-asistente-configurada`.

**Criterios.** El instrumento sobre `Nuevo-Modor` sin otra vibraciones en el
registro; el número de series verificadas anotado.

**Pendiente (22-09-2026): no se puede hacer desde el repo.** Los tres pasos
necesitan ICONICS delante y se dejan escritos para quien los dé:

1. Con el motor girando, en la ficha de `Nuevo-Modor`, «Sondear sus series».
   Anotar aquí cuántas quedan verificadas (en paro fueron 33 sin muestras).
2. Si `vibraciones-configurada` sigue en `datos/maquinas.json` de planta,
   darla de baja o dejarla inactiva: dos configuradas sobre la misma raíz se
   solapan y el registro se queda con la primera.
3. Y dar nombre a los tres apoyos en el árbol (`S1` → «Lado acople», etc.):
   una configurada saca el nombre del apoyo de `assets[].nombre`, y sin él el
   asistente dice «S1 (S1, bearing unidentified)». Después:
   `node --env-file=.env.local scripts/medir-asistente-configurada.mjs --maquina Nuevo-Modor`
   y anotar cuántas de las 8 preguntas llegan a la máquina.

### F5 — Documentos

`HANDOFF`, `CLAUDE.md` (§4.7 habla de «`tanque` y `vibraciones`»),
`shared/README.md`, `Demo-EVA/README.md`, y el Plan 34 F5 cerrado remitiendo
aquí. El Plan 32 se revisa: lo que pedía para la escrita a mano se reformula
para la configurada o se cierra.

**Lo que de verdad pasó (22-09-2026).**

- `CLAUDE.md`: §4.7 dice que un sistema es el tanque más cada configurada, y
  que no hay vibraciones escrita a mano; el árbol de §3 y la nomenclatura de
  §4.4 ya no listan `ControlesVibraciones` ni un simulador por máquina; §6.1
  añade este plan a los vivos y archiva el 34.
- `HANDOFF`: números medidos hoy, un párrafo en «Qué funciona», F4 en «Qué
  está a medias», el 34 archivado y el 40 entre los planes vivos, y el paso 0
  de «Próximos» incluye el muro de planta y los tres pasos de F4.
- `shared/README.md`: la sección de vibraciones pasa a describir el TIPO y
  `catalogoDemo.js` como referencia fuera del registro.
- `Demo-EVA/README.md`: la fila de la tabla es «una sección por configurada»;
  el párrafo de los dos simuladores cuenta que el segundo se fue con la
  máquina y que una configurada se simula con su tipo.
- Plan 34: F5 cerrada remitiendo aquí y el plan archivado en
  `docs/completados/`. Plan 32: F2–F6 reformuladas para la configurada, con
  una nota de por qué; ninguna se cerró, porque ninguna estaba hecha.
- Lo que este documento no puede cerrar es F4, y lo dice arriba.

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
