> **Propuestas históricas.** Este documento conserva el análisis de su fecha; sus prioridades y estados no se asumen vigentes. El estado actual está en [el índice documental](README.md) y en el código. Las vistas del antiguo dashboard ya no forman parte de esta rama.

# Backlog · Backend

> **Objetivo de la rama.** Que dar de alta una máquina nueva sea añadir una
> entrada al registro y su catálogo, sin tocar el asistente, sus herramientas
> ni el transporte. Todo lo de aquí se ordena por lo que costaría el día del
> alta de la **máquina #3**, no por lo que parece más grave leyéndolo.

> **Cómo leer esto.** Cada entrada dice qué pasa HOY, qué se rompe cuando llegue
> la #3 y qué tamaño real tiene el arreglo.

> **Lo específico del asistente vive aparte**, en
> [`MEJORAS-ASISTENTE.md`](MEJORAS-ASISTENTE.md): treinta mejoras de veracidad,
> herramientas y capacidades. Este backlog es del backend como sistema; aquél,
> de lo que el modelo puede preguntar y de cuánto se puede confiar en lo que
> contesta. Lo medido va como medido; lo que es
> una estimación, lo dice. Nada aquí es un deseo: todo sale de código que está
> en el árbol y de pruebas que se ejecutaron.

---

## Estado a 28-08-2026

| Verificador | Comprobaciones |
|---|---|
| `verificar-herramientas` | 114 |
| `verificar-backend` | 73 |
| `verificar-chat` | 44 |
| `verificar-riesgos-vibracion` | 40 |
| `verificar-riesgos` | 30 |
| `verificar-transporte-falso` | 21 |
| `verificar-pronostico` | 18 |
| `verificar-aprendizaje` | 13 |

`herramientas.mjs`: **1123 líneas** (eran 4100). Reparto **completo**: las 19
herramientas viven en `backend/ia/herramientas/`, una subcarpeta por familia.

---

## B1 · Reparto de herramientas — **COMPLETADO (28-08-2026)**

Las cinco fases están hechas. `herramientas.mjs` pasa de **4100 a 1123 líneas**
y las diecinueve herramientas viven en `backend/ia/herramientas/`, una
subcarpeta por familia:

| Familia | Herramientas | Líneas | Recibe |
|---|---|---|---|
| `aprendizaje/` | 3 | 211 | nada |
| `registro/` | 1 | 48 | nada |
| `maquina/` | 3 | 304 | `client`, `readOnly`, ayudantes de máquina |
| `historicos/` | 9 | 1298 | `client`, `turnos`, `reportes`, ayudantes |
| `documentacion/` | 3 | 515 | `indiceDocumentos` |

Con `lib/` compartido: `formato`, `respuesta`, `limites`, `maquina`, `historia`.

**Lo que quedó pendiente de esta tarea** está ahora en B3 (el índice de nombres
de señal, que sigue en el ensamblador porque su reparto depende de
parametrizarlo por máquina) y en B7 (`diagnostico` como orquestador).

> **Dos cosas que el reparto destapó, y que la suite atrapó:**
>
> - **La ruta del `import()` diferido de `reporte.mjs`.** Al mover
>   `generar_reporte` a su familia, `await import('./reporte.mjs')` dejó de
>   resolver. El error era el mensaje amable de «faltan las dependencias del
>   backend», así que en producción se habría visto como un problema de
>   instalación de `pdfkit`, no como una ruta rota.
> - **`estado_del_sistema()` sin argumento.** `generar_reporte` lo llamaba sin
>   `sistema`, que es obligatorio desde que las herramientas sirven a cualquier
>   máquina. El reporte caía al respaldo «sin dato» **en silencio**: la tabla
>   salía vacía sin decir por qué.

---

## B2 · `evaluarRiesgosDe` sigue siendo un `switch` por máquina

**Hoy.** [`herramientas.mjs`] mantiene un `switch (sistema.id)` con una rama
por instalación. Está documentado, no escondido, y desde el commit
«La máquina que aún no existe dejaba de salir en verde» su `default` ya no
produce una respuesta en verde: `riesgos_activos` devuelve `fallo()` cuando
`evaluadas === 0`.

**Por qué sigue ahí.** Las dos funciones NO reciben lo mismo: `evaluarRiesgos`
espera el `Sistema` del tanque y `evaluarRiesgosVibracion` espera
`{ canales, variador, alarmas }`. Declarar `riesgos: evaluarRiesgos` en el
registro exige que las dos acepten la forma común de `estadoMaquina.js`, es
decir, reescribir los dos motores de reglas.

**Qué cuesta el día de la #3.** Una línea en el `switch` — y si nadie la añade,
un error explícito en vez de un silencio. **No bloquea el alta.**

**El arreglo de verdad.** Que cada entrada del registro declare su
`riesgos(estado)` y el `switch` desaparezca. Depende de que los dos motores
acepten la proyección común. Con B1 hecho, este `switch` ya vive en
`herramientas/lib/maquina.mjs` —156 líneas, junto a `leerMaquina`— así que
sustituirlo es ahora un cambio local y visible.

---

## B3 · La resolución de nombres de señal está partida en dos

**Hoy.** Hay dos resolvedores y no hacen lo mismo:

- `resolverSenal` (en `herramientas.mjs`): índice con las cuatro formas del
  catálogo, tabla de `SINONIMOS` escrita a mano y respaldo por contención con
  desempate. **Sólo conoce el tanque.**
- `sistemasDeSenal` (en `shared/eva/sistemas.js`): recorre el registro entero,
  con igualdad, contención literal y cobertura por palabras. **Sirve a todas
  las máquinas pero no tiene sinónimos.**

`historia_de_senal` los une a mano desde el 28-08-2026
(`resolverSenalDeSistema` en `historicos/index.mjs`): con `sistema` usa el
registro, sin él el índice del tanque. Funciona y está documentado como
transición, pero es un tercer sitio donde se decide lo mismo.

**El síntoma.** Quien pregunta por «la bomba» o «el voltaje» acierta en el
tanque —tiene sinónimos— y quien pregunta por un equivalente coloquial de
vibraciones, no: `sistemasDeSenal("vibración del motor")` devuelve `[]`.

**Qué cuesta el día de la #3.** La máquina nueva nace sin sinónimos y sus
señales sólo se encuentran por su nombre técnico o su etiqueta.

**Y hay ocho herramientas que siguen sin `sistema`.** `analisis_de_senal`,
`perfil_de_senal`, `correlacionar_senales`, `grafico_de_senal`,
`generar_reporte`, `valor_en_momento` y `comparar_periodos` sólo sirven al
tanque, aunque las demás máquinas ya tengan series que podrían alimentarlas.
Añadir el argumento a cada una es mecánico —el patrón está en
`historia_de_senal`— pero son ocho, y el arreglo bueno es que compartan un solo
resolvedor en vez de repetirlo.

**El arreglo.** Que `SINONIMOS` sea un campo del registro (`sinonimos: {...}`
por máquina), que exista UN resolvedor por máquina, y que las ocho lo usen.
Es también lo que permitiría sacar `resolverSenal` del ensamblador: hoy
`documentacion/` e `historicos/` lo importan de él, y ése es el último hilo que
las ata al archivo grande.

---

## B4 · `pronostico_de_desgaste` está escrito contra el tanque

**Hoy.** Resuelve el sistema, pero el cuerpo usa `SENALES_PRONOSTICO`
—constante local con claves del tanque—, `esHistorizada` y `leerSerieEnRango`
de `senales.js` e `historia.js`.

Tiene **dos guardas**, y el orden es deliberado: primero la de CAPACIDAD (sin
histórico ni mecanismos declarados, con la razón de dominio), después la de
PARAMETRIZACIÓN (`id !== 'tanque'`), que es la que impide que una máquina con
histórico entre a leer las señales del agua.

**Qué cuesta HOY, y ya no es hipotético.** Vibraciones tiene series desde el
28-08-2026. Le falta `desgaste` —sus mecanismos no están escritos— así que hoy
la para la primera guarda, la de capacidad. El día que se declaren, la parará la
segunda: **la máquina tendrá datos suficientes para un pronóstico y no podrá
tenerlo** porque el cuerpo lee el catálogo del agua.

Ha dejado de ser una limitación teórica: es la siguiente en el camino.

**El arreglo.** Que `SENALES_PRONOSTICO` salga del registro (`series.pronostico`
o derivarlo de `series.historizadas()`) y que la lectura de series use la ruta
y el agregado que declara cada máquina. La segunda guarda se cae sola cuando ya
no haya un `id` que citar.

---

## B5 · Presupuesto de bundle incumplido *(preexistente)*

**Hoy.** `verificar-bundle` **falla**: `vendor` ocupa 161.84 KB sobre un techo
de 90 KB.

**Medido.** Se comprobó contra HEAD sin los cambios de esta rama: da el **mismo
tamaño byte a byte**. Es anterior y no lo introdujo ningún trabajo reciente.

**Decisión.** Se deja como está y se anota aquí en vez de arreglarlo de paso:
mezclar un presupuesto de bundle con un barrido de código muerto o con un
reparto de módulos habría hecho ilegibles los tres.

**Qué hay que decidir.** O se sube el techo con una razón escrita, o se parte
`vendor`. Lo que no puede quedarse es un verificador que falla siempre: un
verificador en rojo permanente deja de leerse, y entonces no avisa el día que
diga algo nuevo.

---

## B6 · La forma común no la usan los motores de reglas

**Hoy.** `estadoMaquina.js` proyecta toda máquina a una forma única, y las
herramientas la usan. Pero `evaluarRiesgos` y `evaluarRiesgosVibracion` siguen
recibiendo el dominio crudo de cada máquina vía `estado.dominio`.

**Por qué está bien hoy.** Es deliberado y su cabecera lo explica: si la forma
común sustituyera al dominio, cada máquina nueva presionaría para meter ahí su
particularidad —el factor de cresta, el modo del variador, el reposo del
tanque— y en cinco máquinas sería un objeto con treinta campos opcionales que
no describe bien a ninguna.

**Qué vigilar.** Que `extra` de `estadoComun` no se convierta en el vertedero
que la separación evita. Hoy tiene un uso legítimo por máquina; si la #3 añade
el tercero sin una razón escrita, la frontera se está erosionando.

---

## B7 · `diagnostico` orquesta herramientas de otras familias

**Hoy.** Vive en `documentacion/` pero llama a `estado_del_sistema`,
`historia_de_senal` y `correlacionar_senales`, que siguen en la clausura
grande. Recibe `dameHerramientas()` —una función, no el objeto— porque cuando
se construye su familia el catálogo todavía no existe.

**Qué cuesta.** Nada funcionalmente; la indirección es de una línea y está
documentada. Pero significa que `documentacion/` **no es del todo
independiente**, y conviene revisarlo después de B1: cuando las otras tres
vivan en sus familias, hay que decidir si `diagnostico` se queda aquí (es quien
cruza manual y medida) o sube al ensamblador.

**Recomendación.** Que se quede. Cruzar lo documentado con lo medido es su
razón de ser, y el ensamblador debería ensamblar, no diagnosticar.

---

## B8 · Cobertura: lo que ninguna prueba mira

**Lo que sí está cubierto.** El alta de una máquina nueva tiene ya dos pruebas
que registran máquinas ficticias (`prensa` sin motor de reglas, `horno` con
histórico declarado) y comprueban que **no contesten en verde**.

**Lo que no.**

- **El ciclo de vida del sondeo por máquina.** Ninguna prueba comprueba que dos
  sistemas con `cadenciaMs` distinta sondeen por separado y no acaben en el
  mismo lote. Es la regla que `sistemas.js` declara innegociable y no tiene red.
- **`SISTEMA` es una instantánea.** Se construye con `Object.fromEntries` en el
  import: empujar a `SISTEMAS` no lo actualiza. En producción no importa —el
  registro es estático—, pero no hay nada que lo diga en el código, sólo el
  comentario del verificador.
- **El backend contra ICONICS real.** Los verificadores corren con
  `fakeClient`. Los scripts `comprobar-*` existen para el servidor real pero no
  están en ningún flujo: se invocan a mano y nadie se acuerda.

---

## Orden sugerido

1. ~~**B1**~~ — hecho el 28-08-2026
2. **B3** — la asimetría que más se nota en una demo
3. **B4** — deja de ser una limitación en cuanto haya una segunda máquina con histórico
4. **B5** — decisión de una tarde, pero un verificador en rojo permanente no sirve
5. **B2** — el rediseño de los motores de reglas, ya local gracias a B1
6. **B8** — la prueba del sondeo por máquina, antes de que haya tres

**B6 y B7 no son tareas**: son fronteras que vigilar en la revisión de la #3.
