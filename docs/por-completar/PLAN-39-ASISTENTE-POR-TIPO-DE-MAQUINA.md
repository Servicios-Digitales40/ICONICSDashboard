# PLAN 39 — El asistente sirve a cualquier máquina configurada

**Estado:** F0–F3 completadas · F4–F6 por completar
**Rama:** `Vibraciones1.0`
**Fecha:** 21-09-2026

> Sale del Plan 38 F3, que midió por primera vez al asistente sobre una
> máquina configurada: 6 de 7 preguntas llegan a `Nuevo-Modor`, pero lo que
> contesta al llegar es poco —`estado_del_sistema` devuelve cuatro
> recuentos y ningún valor— y varias herramientas siguen fijadas al tanque.
> El usuario pidió el plan:
>
> > «El objetivo es que las herramientas que se habían definido previamente
> > para el tanque y vibraciones se adapten ahora a funcionar con máquinas
> > configurables. Me imagino que el registro o "contrato" que le da el
> > contexto al asistente se tendría que generar de manera dinámica. […] De
> > manera que cuando se configure una nueva máquina y se valide que hay
> > datos, el asistente pueda responder preguntas respecto a la nueva máquina
> > también automáticamente.»

---

## 0. La idea en tres líneas

El registro **ya es dinámico**: `SISTEMAS` se llena al arrancar y tras cada
alta, y el prompt, los esquemas y las herramientas lo leen en vivo (Plan 38
F1 y F3). Lo que NO es dinámico es **lo que una entrada configurada sabe
hacer**: `construirSistema` rellena el contrato a medias —puntos, claves,
series, riesgos— y deja vacío lo que el tanque y vibraciones traen escrito a
mano: resumen con valores, estado con bandas, unidades, términos de manual,
desgaste, reporte. Cada hueco es una herramienta que hoy contesta poco o se
niega.

**La fuente de todo eso es el TIPO** (`shared/eva/tipos/`), que ya existe
para vibraciones y ya exporta `estado`, `resumen`, `evaluarRiesgos`,
`reglas`, `canales`, `roles` y `capacidadesPosibles`. Este plan hace que la
entrada configurada le pida al tipo lo que le falta, y que cada herramienta
pregunte «¿esta entrada tiene X?» en vez de «¿es el tanque?». Cuando eso esté,
dar de alta una máquina de un tipo conocido es dar de alta una máquina que
el asistente entiende entera, sin tocar el asistente.

---

## 1. Lo que hay, medido el 21-09-2026

### 1.1 Lo que ya llega a una configurada

Medido contra planta y modelo reales con `medir-asistente-configurada.mjs`
(Plan 38 F3), y leído herramienta por herramienta:

| Herramienta | Llega | Con qué calidad |
|---|---|---|
| `sistemas_de_la_planta` | sí | id, nombre, `mide`, `limitaciones`, `herramientas` (por capacidad) |
| `estado_del_sistema` | sí | **sólo recuentos**: `senales`, `recuento`, `sinLectura`, `puntosPedidos`. Ni un valor. El modelo dijo «no tiene lecturas disponibles» con 64 de 94 leyendo |
| `riesgos_activos` | sí | completo: `evaluarRiesgosDe` evalúa por tipo (Plan 38 F1) |
| `diagnosticar_falla` | sí | `reglasDe` cae al tipo |
| `historia_de_senal` y las 8 de historia | sí, con `sistema` | **sin unidad** (`metaDe` devuelve `''` para todo lo que no es el tanque) y con etiquetas repetidas (tres «Velocidad eficaz») |
| `consultar_documentacion` | sí | filtra por id vivo |
| `cerrar_diagnostico`, `registrar_intervencion`, `hechos_de_la_planta`, `recordar_hecho`, `proponer_regla` | sí | por `SISTEMA_IDS` vivo |

### 1.2 Lo que se niega o degrada, y por qué

| Herramienta | Qué pasa | Dónde está el `if` |
|---|---|---|
| `limites_del_manual` | se niega si la señal no es del tanque | `documentacion/index.mjs:414` |
| `diagnostico` (dossier) | sólo `SISTEMA_DEL_DOSSIER = 'tanque'` | `documentacion/index.mjs:51, 567` |
| `pronostico_de_desgaste` | `desgaste: null` en toda configurada; además `id !== 'tanque'` | `construirSistema.js` (`desgaste: null`), `historicos/index.mjs:392` |
| `generar_reporte` | sólo sabe dibujar el PDF del tanque | `historicos/index.mjs:1366` |
| `alarma_sostenida` | `sistemaId !== 'tanque'` → se niega | `historicos/index.mjs:1973` |
| `resumen_de_turno` | pide `series.claves()` donde no existe: lista vacía para TODAS | `historicos/index.mjs:2071` |
| `lib/historia.mjs` | un id desconocido cae en silencio al tanque | `historia.mjs:89` (`?? SISTEMA.tanque`) |

### 1.3 Lo que el prompt le enseña al modelo

- El **inventario** sale del registro, con nombre e id (Plan 38 F3).
- El **catálogo de señales** («Las señales de la instalación») sale de
  `SENALES` del tanque, y sólo de ahí (`herramientas.mjs`, `catalogo()`). El
  modelo no sabe que existe `vRMS_S1` hasta que una herramienta se lo dice.
- El **contexto de pantalla** nombra la máquina y ordena pasar su id. Con
  una pregunta sin máquina («¿hay algún riesgo activo?») el modelo aún llama
  a `sistemas_de_la_planta` —que `intencion.mjs` mete SIEMPRE— y barre las
  cuatro.
- Coste fijo medido: ~14 330 tokens (prompt + 26 herramientas); está
  comprobado que 896 caracteres de más rompen al 4B.

### 1.4 Cómo entra hoy una configurada al registro

`sincronizarRegistroConfigurado` corre al arrancar y tras `crear`, `editar`,
`eliminar` y `anotarRevision`. Registra toda máquina con `activa !== false`,
**sin mirar su `estado`** (`VALID`, `DEGRADED`, `INVALID`, `UNKNOWN`). Una
máquina recién creada y nunca revisada (`UNKNOWN`) o una a la que no responde
ningún punto (`INVALID`) sale igual en `sistemas_de_la_planta`, y sus
`limitaciones` no lo dicen.

### 1.5 Lo que el tipo ya tiene y nadie consume desde una configurada

`TIPO_VIBRACIONES` exporta `estado: estadoDeVibraciones`, `resumen:
resumenVibracionesParaAsistente`, `canales`, `roles` (con `label`, `corto`,
`unidad`), `umbrales`, `contadoresAlarma`, `peorZona`. Los dos primeros
están escritos sobre las constantes de la máquina a mano (`CANALES`,
`createSistemaVibraciones(valorDe)` con sus tags fijos): **saben componer,
pero sólo su propia máquina.** `dominioDesdeRoles` ya reconstruye
`{canales, variador, alarmas, sinDato, puntosPedidos}` para una configurada;
lo que falta es que el tipo acepte ese dominio en vez de fabricarlo.

Las causas (`shared/eva/comun/causas.js`) se indexan por `riesgoId` y las de
vibraciones ya traen `terminosManual` («desequilibrio», «desalineación»,
«aflojamiento»). La ISO 20816-3 está indexada: 47 fragmentos.

---

## 2. Decisiones

**D1 · El contrato es el TIPO, y se rellena al construir la entrada.** Todo lo
que una herramienta necesita de una máquina —cómo resumirla, cómo poner
bandas a su estado, qué unidades tienen sus señales, qué términos buscar en
el manual, cómo dibujar su reporte— lo declara el tipo una vez y
`construirSistema` lo cuelga de la entrada. El registro no cambia de forma:
sigue siendo `SISTEMAS` con las mismas funciones; sólo que una entrada
configurada ya no deja huecos. Ésa es la lectura literal de «el contrato se
genera de manera dinámica»: dinámico por MÁQUINA, escrito una vez por TIPO.

**D2 · Ninguna herramienta pregunta «¿es el tanque?». Pregunta «¿esta entrada
tiene X?».** Los `if (id !== 'tanque')` de §1.2 se convierten en comprobaciones
de capacidad sobre la entrada: `sistema.desgaste`, `sistema.reporte`,
`sistema.dossier`, `sistema.series`. Una entrada sin la pieza se niega con un
`fallo(...)` que dice qué falta y qué tipo la traería. El tanque sigue
teniendo las suyas escritas a mano: **no se toca** (rama). Vibraciones a mano
tampoco: la escrita a mano manda hasta el Plan 34 F5.

**D3 · Validado es registrado, y lo que falta se confiesa.** Una máquina
entra en el registro cuando está activa y **no es `INVALID`**: sin un punto
que responda no hay nada que contestar, y aparecer en la lista sería fingir.
`UNKNOWN` y `DEGRADED` entran, con una limitación generada («Sin revisar
todavía: N puntos declarados, ninguno comprobado» / «M de N puntos ausentes
en la última revisión»). La revisión (`anotarRevision`) ya resincroniza el
registro, así que **el alta es automática de verdad**: configurar, revisar,
preguntar. Sin reiniciar nada.

**D4 · El catálogo del prompt es el de la máquina que se tiene delante.**
Generar el catálogo de señales para TODAS las máquinas desde el registro es
directo, pero cuesta contexto (§1.3). Se genera para el `contexto.sistema`
del turno cuando lo hay, y para el tanque cuando no (lo que hoy hay). Se
mide en tokens antes y después, y si con dos máquinas de 94 variables no
cabe, se recorta a las claves con serie o se quita: el instrumento dice si
hacía falta.

**D5 · La regla de «¿hay algún riesgo activo?» va en código.** Con
`contexto.sistema` y una pregunta que no nombra otra máquina, `intencion.mjs`
deja `sistemas_de_la_planta` fuera del catálogo del turno. Es la regla de
`HANDOFF.md` §8: una regla que importa no se insiste en el prompt (ya se
insistió, y siguió barriendo).

**D6 · Se mide con el instrumento, antes y después de cada fase.**
`medir-asistente-configurada.mjs` gana los casos que ejercitan lo que cada
fase abre (valores por apoyo, unidad en una serie, límite del manual,
reporte). Cada fase termina con la tabla antes/después en este documento,
como la F3 del Plan 38.

**D7 · Primero lo que cambia lo que el modelo contesta.** Orden: estado y
resumen (F1) antes que documentación (F3) antes que reporte (F4). El
pronóstico de desgaste **queda fuera**: exige mecanismos de desgaste por
tipo, que es la mejora C1 y es trabajo de dominio, no de asistente. Se deja
la negativa honesta y por capacidad.

---

## 3. Las fases

### F0 — Una configurada en el transporte falso, para las pruebas ✅

**Completada el 21-09-2026.**

**Objetivo.** Que `verificar-herramientas` y `verificar-chat` monten una
máquina configurada y la ejerciten sin red. Hasta hoy ninguno lo hacía: las
169 comprobaciones eran sobre las escritas a mano, y todo lo de este plan se
habría probado sólo contra planta.

- `scripts/lib/configuracionEspejo.mjs`: la derivación de la configurada
  espejo de vibraciones, sacada del guion `generar-configuracion-vibraciones`
  a un módulo puro. El guion la llama y conserva `--sondear`, el archivo de
  salida y el recuento; produce el mismo JSON que antes (comparado campo a
  campo, salvo la marca de tiempo).
- `verificar-herramientas`: bloque «La máquina configurada» con 9
  comprobaciones. Registra la espejo, la ejercita, la da de baja. Imprime
  «9 de ellas sobre una máquina CONFIGURADA».
- `verificar-chat`: 3 comprobaciones sobre lo que el asistente le cuenta al
  modelo de una configurada (inventario con id, contexto con nombre y orden,
  baja). Se vieron fallar contra el `chat.mjs` anterior al Plan 38 F3.

#### Lo que de verdad pasó (F0)

**Se registra en el proceso, no por `maquinas.json`.** El plan decía escribir
un `maquinas.json` privado y dejar que la app lo registrara. Se hizo más
corto: los dos guiones importan el módulo y llaman a `registrarSistema` con
`toleraSolapeConEscritas`, **sólo para su bloque**, y `desregistrarSistema`
al salir. Registrarla para todo el guion habría cambiado lo que las otras 169
miden —ver el hallazgo de las etiquetas—, y eso no es una fixture, es un
cambio de fondo que hay que ver aparte.

**`verificadasDelCatalogo`, una opción que el guion no usa.** `crearVariable`
fuerza `historyVerified: false` a propósito (una serie se promete después de
sondearla). Contra el transporte falso ese sondeo no dice nada: el falso
sirve exactamente lo que el catálogo declara historizado. La opción marca
esas 36 series como verificadas y sólo la pasan los verificadores; el guion
sigue sondeando contra planta. La cabecera del módulo lo explica.

**El historiador falso no sirve la historia de vibraciones, ni a mano ni
configurada.** `readHistory` del falso sólo reconoce los nombres `hda:` del
tanque (`parsePuntoHistorico`); los de vibraciones caen en «unknown point».
Por eso la comprobación de historia no exige `ok: true`: exige que la
configurada reciba **la misma respuesta** que la escrita a mano, que su punto
del historiador sea **literalmente el mismo**, y que nunca se le niegue por
desconocida. Servir la historia de vibraciones en el falso es trabajo de F2,
y ahí se mide de verdad la unidad.

**La simulación depende de la hora, y la primera lectura lo escondió.** En
un ensayo salieron 30 de 73 puntos sin lectura y se atribuyó a las
vigilancias codificadas; era falso —`construirSistema` ya las decodifica con
`tipo.decodificarVigilancia`—. El simulador de vibraciones alterna marcha y
paro en un ciclo de diez minutos (`enMarchaVib`) y en paro el variador y las
velocidades no entregan: la misma lectura, minutos después, dio 2 de 73 en
las dos entradas. Por eso el aserto de estado fija un instante EN MARCHA con
`ahora` del transporte falso y compara la configurada con la escrita a mano
**en ese mismo instante**, en vez de exigir un número.

**`estado_del_sistema` de una configurada no traía `apoyos`.** F0 lo dejó
fijado con un aserto (`r.apoyos === undefined`, «F1 ya trae apoyos: actualiza
esta comprobación») para que F1 tuviera que pasar por ahí a la vista. Pasó.

**La etiqueta tiene dos dueños.** Con la espejo registrada,
`sistemasDeSenal('Velocidad eficaz · Lado acople')` devuelve `vibraciones` y
`vibraciones-configurada`. Es la situación de planta —dos entradas para la
misma instalación hasta el Plan 34 F5— y explica por qué una pregunta por la
etiqueta sin decir máquina no puede resolverse sola. Queda fijado como
comprobación para que retirar el catálogo tenga que pasar por ella.

**`diagnosticar_falla` necesita el motor montado** (`motorDiagnostico`); la
comprobación usa uno de mentira que devuelve lo que se le pasa, como las del
tanque. Lo que se prueba es que la herramienta acepte el id de una configurada
y llegue al motor, que es lo que el Plan 38 F1 generalizó.

**Recuentos**: `verificar-herramientas` 169 → **178** (22 omitidas siguen);
`verificar-chat` 68 → **71**; `verificar-vibraciones-configurada` 25, igual;
los 41 verificadores en verde; lint limpio.

### F1 — Estado y resumen por tipo ✅

**Completada el 21-09-2026.**

**Objetivo.** Que `estado_del_sistema` sobre una configurada devuelva lo que
devuelve sobre la escrita a mano: apoyos con sus medidas y su banda ISO,
variador, alarmas, y un resumen que el modelo pueda redactar.

- `estadoDeVibraciones(valorDe, registro, leidoA, opciones)` acepta el
  dominio ya reconstruido, los apoyos de la máquina y un `resolver` que dice
  cómo se llama aquí cada señal canónica del tipo; sin opciones, la escrita a
  mano sale igual que antes. `resumenVibracionesParaAsistente` lee los apoyos
  del estado y remite a `historia_de_senal(sistema="<su id>")`.
- `construirSistema`: `estado()` llama a `tipo.estado` con el dominio, los
  apoyos (`canalesDeMaquina`) y el resolvedor por rol; `resumen()` llama a
  `tipo.resumen` y deja encima la identidad y los recuentos; lee los
  contadores del área (`contadoresDeMaquina`) y se los entrega al dominio;
  `etiquetaDe` compone «rótulo · apoyo» cuando no hay descripción; `mide` no
  repite.
- El narrador inglés sigue a los apoyos del estado, no traduce el id de una
  configurada y remite a su id en el aviso.
- Pruebas: 7 checks nuevos en `verificar-vibraciones-configurada` (25 → 31,
  con uno reescrito), 1 más en `verificar-herramientas` (178 → 179) y el de
  estado reescrito con reloj fijo. Seis de los siete se vieron fallar sin F1.

#### Lo que de verdad pasó (F1)

**El resolvedor, y no sólo los apoyos.** El plan decía «acepten el dominio y
los canales». Faltaba lo tercero: en planta, la frecuencia del variador de
`Nuevo-Modor` se llama `FREQ OUTPUT_BMS`, y su id de dominio es ése, no
`frecuencia`. Si el tipo hubiera nombrado las señales con sus claves
canónicas, la historia, los casos y las series —que van por el id de la
variable— no habrían encontrado la señal que el estado enseñaba. El
`resolver` traduce cada clave canónica a la variable de la máquina por ROL y
apoyo, y la señal sale con SU id, SU tag literal y si tiene serie. Hay un
check que renombra el variador como en planta y lo comprueba.

**Los contadores de alarma entraron aquí, no en F4.** El comentario de
`construirSistema` decía que recogerlos era «trabajo de F4, cuando la
pantalla permita declarar el área». La pantalla ya lo permite desde el Plan
36, el tipo ya declara sus sufijos desde el Plan 37 F2 y el frontend ya los
leía; sólo el backend los pasaba como `null`. Con ellos, `dominio.sinRoles`
de la espejo pasa de `['alarmas', 'sensores']` a `['sensores']`, y el check
que fijaba lo primero se reescribió diciendo por qué. Sin ningún contador
marcado sigue siendo `null`, y el check lo comprueba quitándolos.

**La escrita a mano no cambió ni un valor.** `verificar-vibraciones` (13),
`verificar-dominio-configurado` y las 385 del backend pasan igual; el check
de la espejo compara señal por señal contra la escrita a mano en el mismo
instante del simulador y coinciden todas.

**El estado genérico se queda para un tipo sin `estado`.** No hay ninguno
hoy; existe para que dar de alta un tipo nuevo sin narrador no rompa el
alta. Lo que cambió en ese camino es que la etiqueta lleva el apoyo.

**Lo que todavía no hace una configurada de este tipo**, y se quedó dicho en
el código: el estado del sensor por apoyo (`sensores`), que no tiene rol ni
sufijo; la sensibilidad y el rodamiento de cada apoyo (el resumen dice
«rodamiento sin identificar»); y `enReposo`, que el tipo no sabe para
ninguna de las dos.

**Sólo lo que la máquina declara, y todo lo que declara.** La primera versión
emitía el catálogo canónico entero del tipo: una máquina de prueba con dos
variables salía con veinte señales «sin dato» de apoyos y variador que no
tenía, y `verificar-registro-configurado` la cazó (tres checks). Con
resolvedor, una clave que la máquina no declara no se emite —no es un hueco,
es inventar la ausencia de algo que nadie declaró—; y lo que la máquina
declara y el tipo no coloca (una bandera, una vigilancia, una medida sin
apoyo) sale igual, sin criterio y agrupado por su activo. Ninguna variable
desaparece del estado por no tener sitio en el catálogo del tipo. El check de
la banda se reescribió en dos: sin apoyo declarado no hay banda; con apoyo y
velocidad, la velocidad eficaz lleva ISO y la aceleración no.

**Contra el modelo real** (`medir-asistente-configurada --maquina
vib-motor-03`, con el caso nuevo «¿qué vibración tiene cada apoyo?»; la
máquina seguía parada, 0 rpm):

| Caso | Antes de F1 (Plan 38 F3) | Con F1 |
|---|---|---|
| ¿Cómo está esta máquina? (contexto) | `vib-motor-03`, pero «no he podido resumirlos» | `vib-motor-03`: «La máquina Nuevo-Modor (vib-motor-03) está parada» |
| ¿Qué vibración tiene cada apoyo? (contexto) | — (caso nuevo) | `vib-motor-03`, **cita valores con unidad** (mm/s), y dice que está en reposo a 0 rpm |
| ¿Cómo está Nuevo-Modor? | `vib-motor-03`: «no tiene lecturas disponibles» | `vib-motor-03`: «Nuevo-Modor está parado» |
| ¿Hay algún riesgo activo? (contexto) | barría las cuatro | sólo `vib-motor-03` (2 rondas) |
| ¿Cómo ha ido Velocidad eficaz · S1…? (contexto) | `vib-motor-03`, pedía desambiguar | **`"vibraciones"`**: se fue a la escrita a mano |
| Documentación (contexto) | `vib-motor-03`, 6 rondas, sin redactar | `vib-motor-03`, 3 rondas, redacta |

**7 de 8 llegan** (antes 6 de 7). Ninguna respuesta acabó en «no he podido
resumirlos»: con apoyos redactados el 4B tiene algo que contar. Dos cosas
que no se pueden atribuir a F1 y se anotan tal cual: el barrido de «¿hay
algún riesgo?» no apareció en esta tanda y sí en las dos anteriores —es
variación del modelo, no un arreglo, y F5 sigue en pie—; y la pregunta de
historia, que ahora nombra la señal con su apoyo («Velocidad eficaz · S1»)
gracias a las etiquetas nuevas, se fue a `"vibraciones"` por primera vez.
La etiqueta compuesta coincide con la de la escrita a mano y la máquina
configurada es la misma instalación: es el hallazgo de las dos dueñas del
Plan 34 F5, ahora visible desde el modelo. Una tanda no decide; se vuelve a
medir al cerrar F2.

**Depende de** F0.

### F2 — Historia por tipo ✅

**Completada el 21-09-2026.**

**Objetivo.** Que las nueve herramientas de historia traten a una configurada
como a la escrita a mano: unidad, decimales, etiqueta única, y ningún camino
que caiga al tanque sin decirlo.

- `metaDe(clave)` en las dos entradas de vibraciones: la escrita a mano desde
  su catálogo (`sistemas.js`), la configurada desde su variable y su rol
  (`construirSistema`). Devuelve rótulo, unidad, decimales y `naturaleza`
  (`alarma` para una bandera booleana, `medida` para el resto). Las
  herramientas de historia lo usan en el resolvedor y en su propio `metaDe`;
  sin él, caen a la unidad VACÍA de antes, nunca a una inventada.
- `lib/historia.mjs`: un id que no está en el registro es un fallo con nombre;
  ya no se convierte en el tanque.
- `resumen_de_turno` pide `claves()` a la entrada. `alarma_sostenida` se niega
  por la naturaleza de la señal, no por la máquina.
- El historiador falso sirve las series de las máquinas que no son el tanque
  preguntando al registro de quién es un nombre `hda:`, con la media por tramo
  de su simulación; una serie declarada y no verificada sigue dando el 500 del
  servidor.
- Los roles del variador llevan `decimales`; la bandera «real» (desviación del
  sensor) tiene tres.
- Pruebas: `verificar-transporte-falso` 26 → 28 (una reescrita), `verificar-
  vibraciones-configurada` 31 → 33, `verificar-herramientas` 179 → 183 (el de
  historia reescrito: ahora exige `ok`, unidad y la misma serie que la escrita
  a mano). Las nueve nuevas o reescritas se vieron fallar sin F2.

#### Lo que de verdad pasó (F2)

**La escrita a mano también viajaba sin unidad.** `metaDe` en `historicos/`
devolvía `unidad: ''` para TODO lo que no fuera el tanque, así que la
velocidad eficaz de la vibraciones escrita a mano llegaba al modelo sin
«mm/s» desde el 28-08-2026, cuando empezó a tener series. Es de esta rama y
se arregló en las dos: el catálogo ya sabía la unidad, nadie se la pedía.

**El historiador falso negaba lo que ya existe.** Negaba toda serie que no
fuera del tanque «porque el grupo `DEMO 3` no entrega». Ese grupo ya no
existe y `DEMO_VIBRACIONES` registra 36 series verificadas; el comentario
llevaba semanas siendo falso y dejaba sin probar, sin red, todo lo que las
herramientas de historia hacen con otra máquina —incluida la caída al tanque
de `lib/historia.mjs`, que sólo se veía con planta—. Ahora pregunta al
registro (`serieDeOtraMaquina`): la entrada cuya `series.punto(clave)` sea el
nombre pedido, con serie verificada y un punto en vivo que simular. La
comprobación que fijaba la negativa se reescribió en tres: pedir por el nombre
en vivo falla (B10), una historizada se sirve, y una declarada sin verificar
sigue fallando. Para esta última hizo falta una configurada con un grupo que
sólo ella reclame: la escrita a mano tiene el mismo nombre `hda:` verificado
y, en el orden del registro, la habría servido.

**Los decimales no estaban en el rol.** Los roles del variador copiaban
`unidad` pero no `decimales`, y una configurada redondeaba la frecuencia a
cero decimales donde la escrita a mano daba dos. El check que compara los
metadatos clave por clave entre las dos entradas lo cazó (siete claves
distintas), junto con la desviación del sensor: una bandera de tipo `real`
lleva tres decimales, no cero como las booleanas.

**`alarma_sostenida` se niega igual, pero por lo que es.** Sobre una
velocidad eficaz dice «es una medida continua», no «sólo evalúa alarmas del
tanque». Ninguna máquina de vibraciones tiene hoy una bandera booleana con
serie —las de aviso no existen en el árbol—, así que el camino positivo
queda sin ejercitar hasta que alguna la tenga; el check fija la negativa
correcta.

**`resumen_de_turno` tenía la tendencia vacía para todas las máquinas** desde
que existe, por pedir `series.claves()`. Con `claves()` trae la tendencia de
las cuatro primeras series con historia; la desviación del sensor viaja entre
ellas sin unidad, que es la que tiene.

**Contra el modelo real** (`medir-asistente-configurada --maquina
vib-motor-03`; el caso de historia mira ahora si el texto cita mm/s):

| Caso | Con F1 | Con F2 |
|---|---|---|
| ¿Cómo ha ido Velocidad eficaz · S1 en 7 días? (contexto) | `"vibraciones"`: la escrita a mano | `vib-motor-03`, **cita mm/s**: «La señal Velocidad eficaz · S1 en el sistema vib-motor-03 ha mostrado…» |
| ¿Qué vibración tiene cada apoyo? (contexto) | cita mm/s | cita mm/s, «en el sistema vib-motor-03 (Nuevo-Modor)» |
| ¿Hay algún riesgo activo? (contexto) | sólo `vib-motor-03` | sólo `vib-motor-03` |
| Documentación (contexto) | redacta | 4 rondas, «no he podido resumirlos» |
| Los otros cuatro | llegan | llegan |

**8 de 8 llegan; ninguna se fue a otra máquina.** Con contexto de pantalla,
5 de 5. Dos cosas que decir tal cual: la pregunta de historia volvió a
`vib-motor-03` —la tanda de F1 la había visto irse a `"vibraciones"`— y una
tanda no decide en ningún sentido; y en «¿cómo está Nuevo-Modor?» el modelo
escribió «no se pudo obtener el estado actual» tras una llamada que en las
otras tres preguntas del mismo minuto contestó «parada»: el instrumento no
guarda el resultado de la herramienta, así que no se sabe si falló la lectura
de planta en ese instante o si el modelo leyó mal. Guardar el resultado de
cada llamada, como hace `medir-asistente.mjs` reejecutándola, es lo que
haría falta para distinguirlo; queda para F6, que amplía el instrumento.

**Depende de** F0. Independiente de F1.

### F3 — Documentación por tipo

**Objetivo.** Que `limites_del_manual` y el dossier sirvan a una configurada
cuando su tipo tiene manual que citar.

**Cómo.** `limites_del_manual` acepta `sistema`, resuelve la señal en la
entrada (`sistemasDeSenal` ya la encuentra) y busca los términos que el TIPO
declara para ese rol —los de la ISO 20816-3 ya indexada— en vez de negarse
por no ser el tanque. El dossier (`diagnostico`) se niega por capacidad:
«este tipo no declara dossier», con lo que habría que declarar. Es la mejora
B3 del backlog del asistente y el Plan 32 F5, acotados a lo que necesita
una configurada.

**Criterios.** El caso «¿qué dice la documentación sobre los límites de
vibración de esta máquina?» del instrumento cita la ISO con archivo y página
para `vib-motor-03`; `limites_del_manual(senal="vRMS_S1", sistema=...)` no
se niega.

**Depende de** F1 (etiquetas y roles por señal).

**Lo que de verdad pasó (22-09-2026).**

- **`limites_del_manual` ya no se niega para una configurada.** La etiqueta y
  la unidad salen de la máquina (`metaDe(clave)`, que ahora dice también qué
  `rol` cumple la variable) y las anclas del TIPO: cada medida de
  `vibraciones.js` declara `terminosManual` («velocidad eficaz», «velocidad
  rms», «mm/s»…) y el rol lo lleva. La búsqueda se acota a la máquina de la
  señal, como ya hacía con el tanque. El extractor gana las unidades de
  vibración (`mm/s`, `m/s²`); el cierre del patrón pasa de `\b` a `(?!\w)`
  porque tras «²» o «%» no había frontera de palabra y el número salía sin
  unidad. El dossier sigue negándose, ahora **por capacidad**: nombra el tipo
  y dice qué tendría que declarar.
- **Lo que la medición destapó no estaba en el plan: los manuales de
  vibraciones eran invisibles para toda configurada.** La primera corrida
  contra el modelo real llegó a `Nuevo-Modor` pero «la documentación no
  contiene límites». Sondeado el índice real: con `sistema="vib-motor-03"`,
  cero fragmentos para cualquier consulta. La causa: en
  `Documentacion/.manifiesto.json` la ISO 20816-3, el manual del SM 1281 y el
  del V20 estaban asignados a `vibraciones`, la máquina escrita a mano que el
  Plan 40 retiró ese mismo día. El filtro del índice sólo dejaba pasar «el
  mismo id» o «sin asignar», así que un id que ya no existe no era de nadie.
- **La respuesta es un alcance nuevo: el TIPO.** Una norma no es de un motor,
  es de toda máquina que se vigile por vibraciones y de ninguna bomba. El
  alcance se escribe `tipo:vibraciones` en el mismo campo `sistema` del
  manifiesto —ni la forma ni la API cambian— y la regla de quién respalda a
  quién vive UNA vez, en `shared/eva/comun/manuales.js·manualSirveA`: la usan
  el índice al filtrar y la pantalla al listar. `sistemaValido` acepta el
  alcance de tipo; la pantalla de manuales ofrece «Todas las de Vigilancia de
  vibraciones» en los dos selectores, y filtrar por una máquina enseña los
  suyos y los de su tipo. `estado()` del índice declara los manuales cuyo
  alcance no es ninguna máquina ni ningún tipo (`conSistemaDesconocido`),
  para que la próxima retirada no se pierda en silencio.
- **El dato local se reasignó**: los tres manuales pasan a `tipo:vibraciones`
  en `Documentacion/.manifiesto.json` (no versionado). En planta hay que
  hacer lo mismo desde la pantalla de manuales.
- **Medido.** Antes: 3 rondas, dos `consultar_documentacion` sin resultado,
  «no contiene límites». Después: `consultar_documentacion(sistema=
  "vib-motor-03")` encuentra la ISO y el modelo la cita para `Nuevo-Modor`
  («La documentación técnica (ISO-20816-3) que consulté para esta máquina…
  establece…»). El modelo eligió texto libre, no `limites_del_manual`; las
  dos resuelven el caso.
- **Lo que `limites_del_manual` NO puede con esta guía, y lo dice.** Sobre el
  índice real, `vRMS_S1` encuentra las páginas 1, 3 y 6 de la ISO y devuelve
  «ninguna tiene un número junto a una palabra de límite»: las fronteras de
  zona están en una TABLA («A/B 1,4 22 2,3 37 B/C 2,8 45 4,5 71»), sin
  «máximo» ni «no debe exceder» al lado. Es la limitación conocida del
  extractor por patrón, y remite a `consultar_documentacion`, que es lo que
  el modelo hizo. Leer tablas de fronteras es otro trabajo (Plan 32 F5).
- Comprobaciones nuevas: 4 en `verificar-herramientas` (la señal de una
  configurada resuelve con la unidad, la aceleración no se cuela como
  velocidad, el desempate por apoyo, el dossier por capacidad), 2 en
  `verificar-documentos` (alcance de tipo; id que ya no existe declarado) y 2
  en `rag.test` (asignar a un tipo; a un tipo que no existe da 400).

### F4 — Reporte por tipo

**Objetivo.** Que `generar_reporte` dibuje el PDF de una configurada.

**Cómo.** El reporte se compone desde `estado.senales` agrupadas por `grupo`
(el apoyo, el variador, el área) y desde las series que la entrada declara;
el tipo aporta el orden y los rótulos de los grupos. El del tanque sigue
siendo el suyo, sin tocar. `generar_reporte` deja de omitir `sistema` en su
esquema Zod (hoy pasa por `.passthrough()`).

**Criterios.** `generar_reporte(sistema=vib-motor-03, senales=[vRMS_S1])`
devuelve un enlace firmado y el PDF abre con los tres apoyos; el caso
«hazme un reporte de esta semana» del instrumento llega.

**Depende de** F1 y F2.

### F5 — El prompt habla de la máquina que se tiene delante

**Objetivo.** Que el modelo tenga delante las señales de la configurada de su
pantalla, y que una pregunta sin máquina no barra la planta.

**Cómo.** `catalogo()` recibe el `contexto.sistema` y devuelve el catálogo de
esa entrada (claves, etiqueta, unidad, `historia`) cuando es configurada, el
del tanque cuando no. `intencion.mjs` deja `sistemas_de_la_planta` fuera del
turno cuando hay `contexto.sistema` y la pregunta no menciona otra máquina
del registro. Se mide el tamaño del prompt en tokens con `Nuevo-Modor` (94
variables) antes de darlo por bueno.

**Criterios.** «¿Hay algún riesgo activo?» desde la pantalla de `Nuevo-Modor`
llama a `riesgos_activos` **sólo** con `vib-motor-03` (hoy: las cuatro);
el prompt con catálogo de 94 variables se mide y queda escrito aquí; el
instrumento pasa de 6 de 7 a 7 de 7 en la tanda base.

**Depende de** F1 (etiquetas únicas), independiente del resto.

### F6 — El alta automática, de punta a punta

**Objetivo.** Configurar una máquina nueva de un tipo conocido, revisarla, y
preguntarle al asistente sin reiniciar nada, con lo que falte dicho.

**Cómo.** `sincronizarRegistroConfigurado` omite `INVALID` y registra
`UNKNOWN`/`DEGRADED` con una limitación generada desde la última revisión
(§2 D3). `construirSistema` añade a `limitaciones` lo que la validación sabe:
puntos ausentes, series sin verificar, roles requeridos que faltan. Una
prueba de contrato recorre el ciclo con el transporte falso: crear →
`sistemas_de_la_planta` la trae con «sin revisar» → `anotarRevision` VALID
→ la limitación desaparece → `estado_del_sistema` contesta. Y el instrumento
se corre entero contra planta sobre `Nuevo-Modor`, con los casos nuevos de
F1–F5, y su tabla cierra este plan.

**Criterios.** La prueba de contrato del ciclo pasa; una máquina `INVALID` no
aparece en `sistemas_de_la_planta` y el log dice por qué; el instrumento
imprime la tabla final y va aquí, con lo que siga sin llegar.

**Depende de** F1–F5.

---

## 4. Riesgos

**El contexto del 4B.** F5 añade texto al prompt; F1 añade valores al
resultado de `estado_del_sistema`. Los dos empujan contra un techo medido.
Por eso F5 se mide en tokens antes de aceptarse, y F1 conserva los recuentos
arriba del resumen para que, si el modelo no redacta el resto, lo primero
que diga siga siendo cuántos puntos no contestaron.

**Dos entradas para la misma instalación** hasta el Plan 34 F5. Una respuesta
sobre `vibraciones` parece correcta por los números aunque se pidiera
`vib-motor-03`. El instrumento mira a qué id fue cada herramienta, no lo que
dicen las cifras; es la única forma de cazarlo.

**El tanque no se toca** (rama). Todo lo de este plan generaliza por la rama
`sistema.configurada`; el tanque conserva sus caminos escritos a mano y los
`if` que le sirven a él siguen ahí hasta el Plan 33 F9. Un `if (id ===
'tanque')` NUEVO sí es un defecto.

**Refactorizar `estadoDeVibraciones` para que acepte el dominio** toca la
escrita a mano de vibraciones, que sí es de esta rama. Sus pruebas
(`verificar-vibraciones`, `verificar-vibraciones-configurada`, 25 checks)
tienen que seguir dando lo mismo; F1 no cambia ni un valor de la escrita a
mano, sólo por dónde le entra el dominio.

**Tiempo de medición.** Cada tanda del instrumento son 6–8 minutos con el
modelo real, y cada fase pide dos. Se corre al cerrar la fase, no en cada
cambio; entre medio, F0 da la cobertura sin GPU.

---

## 5. Lo que queda fuera

- **`pronostico_de_desgaste` para vibraciones.** Exige mecanismos de
  desgaste por tipo (horas en zona C/D de la ISO, arranques). Es **C1** del
  backlog del asistente y trabajo de dominio; aquí sólo se deja la negativa
  por capacidad.
- **El tanque como tipo** (Plan 33 F9). Bloqueado por la rama.
- **Retirar `vibraciones.js`** (Plan 34 F5). Cuando F1–F4 estén, la
  configurada hará todo lo que hace el catálogo en el asistente, que era la
  condición.
- **El badge del sidebar por configurada** y **Alarmas de la máquina** (Plan
  37 F4): son del tablero, no del asistente.
- **Sinónimos por máquina** (B2) y **un solo resolvedor** (B1): mejoran cómo
  el modelo encuentra una señal por su nombre coloquial; no hacen falta para
  que una configurada conteste.

---

## 6. Orden y tamaño

| Fase | Tamaño | Qué desbloquea |
|---|---|---|
| F0 | pequeña | probar todo lo demás sin planta |
| F1 | media | `estado_del_sistema` con valores; las etiquetas |
| F2 | pequeña | unidades en historia; tres defectos de herramienta |
| F5 | pequeña | el barrido; el catálogo de la máquina |
| F3 | media | límites del manual para vibraciones |
| F4 | media | el PDF |
| F6 | pequeña | el alta automática con sus límites dichos, y la tabla final |

F0 → F1 → F2 → F5 → F3 → F4 → F6. F2 y F5 pueden ir en paralelo a F1 si hace
falta; F3 y F4 no, porque leen las etiquetas y grupos que F1 fija.
