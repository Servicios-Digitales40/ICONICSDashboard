# Backlog · Backend

> **Objetivo de la rama.** Que dar de alta una máquina nueva sea añadir una
> entrada al registro y su catálogo, sin tocar el asistente, sus herramientas
> ni el transporte. Todo lo de aquí se ordena por lo que costaría el día del
> alta de la **máquina #3**, no por lo que parece más grave leyéndolo.

> **Cómo leer esto.** Cada entrada dice qué pasa HOY, qué se rompe cuando llegue
> la #3 y qué tamaño real tiene el arreglo. Lo medido va como medido; lo que es
> una estimación, lo dice. Nada aquí es un deseo: todo sale de código que está
> en el árbol y de pruebas que se ejecutaron.

---

## Estado a 28-08-2026

| Verificador | Comprobaciones |
|---|---|
| `verificar-herramientas` | 110 |
| `verificar-backend` | 73 |
| `verificar-chat` | 44 |
| `verificar-riesgos-vibracion` | 40 |
| `verificar-riesgos` | 30 |
| `verificar-transporte-falso` | 21 |
| `verificar-pronostico` | 18 |
| `verificar-aprendizaje` | 13 |

`herramientas.mjs`: **2844 líneas** (eran 4100). Repartidas hasta la Fase 2.

---

## B1 · Terminar el reparto de herramientas — Fases 3 y 4

**Estado.** Fases 0, 1 y 2 hechas: `lib/formato.mjs`, `lib/respuesta.mjs`,
`lib/limites.mjs`, `aprendizaje/` y `documentacion/`. Faltan las doce
herramientas que cuelgan del `client`.

**Qué queda.** Medido sobre el árbol actual:

| Familia | Herramientas | Líneas | Ata a |
|---|---|---|---|
| `maquina/` | 3 | ~205 | `leerMaquina`, `resolverSistema`, `evaluarRiesgosDe` |
| `historicos/` | 9 | ~1164 | `leerUnTramo` ↔ `leerSerie` ↔ `leerSerieEnRango` |

**Fase 3 — el contexto explícito.** El trío de historia es mutuamente recursivo
y depende de `client` y `historyConcurrencia`. Se mueve JUNTO, dentro de una
factoría, para que su recursión siga compartiendo ámbito:

```js
const ctx = { client, turnos, readOnly, historyConcurrencia, reportes }
const historia = crearAyudantesDeHistoria(ctx)
const maquina  = crearAyudantesDeMaquina(ctx)
```

Lo único que cambia es de dónde sale `client`: de una clausura implícita a un
parámetro con nombre.

**Fase 4 — mecánica una vez hecha la 3.** Las doce se van a sus carpetas
recibiendo `{ ctx, historia, maquina }`. `herramientas.mjs` queda como
ensamblador de ~200 líneas.

**Riesgo.** Es la única fase del reparto con riesgo real. Mitigación: la prueba
de paridad de `verificar-herramientas` detecta cualquier herramienta que se
pierda, y el orden del catálogo está fijado entero — las dos cosas fallaron
durante las Fases 0-2 y las dos veces tenían razón.

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
acepten la proyección común. Después de B1, este `switch` vivirá en un archivo
de ~200 líneas junto a `leerMaquina`, y sustituirlo será un cambio local.

---

## B3 · La resolución de nombres de señal está partida en dos

**Hoy.** Hay dos resolvedores y no hacen lo mismo:

- `resolverSenal` (en `herramientas.mjs`): índice con las cuatro formas del
  catálogo, tabla de `SINONIMOS` escrita a mano y respaldo por contención con
  desempate. **Sólo conoce el tanque.**
- `sistemasDeSenal` (en `shared/eva/sistemas.js`): recorre el registro entero,
  con igualdad, contención literal y cobertura por palabras. **Sirve a todas
  las máquinas pero no tiene sinónimos.**

**El síntoma.** Quien pregunta por «la bomba» o «el voltaje» acierta en el
tanque —tiene sinónimos— y quien pregunta por un equivalente coloquial de
vibraciones, no: `sistemasDeSenal("vibración del motor")` devuelve `[]`.

**Qué cuesta el día de la #3.** La máquina nueva nace sin sinónimos y sus
señales sólo se encuentran por su nombre técnico. No es un fallo silencioso —el
error dice qué máquinas hay— pero sí una asimetría que se nota en la demo.

**El arreglo.** Que `SINONIMOS` sea un campo del registro (`sinonimos: {...}`
por máquina) y que `resolverSenal` delegue en `sistemasDeSenal` con el sistema
como argumento. Es la fase que también saca `resolverSenal` de la clausura y
cierra el ciclo de imports que hoy tiene `documentacion/`.

---

## B4 · `pronostico_de_desgaste` está escrito contra el tanque

**Hoy.** Resuelve el sistema, pero el cuerpo usa `SENALES_PRONOSTICO`
—constante local con claves del tanque—, `esHistorizada` y `leerSerieEnRango`
de `senales.js` e `historia.js`.

Tiene **dos guardas**, y el orden es deliberado: primero la de CAPACIDAD (sin
histórico ni mecanismos declarados, con la razón de dominio), después la de
PARAMETRIZACIÓN (`id !== 'tanque'`), que es la que impide que una máquina con
histórico entre a leer las señales del agua.

**Qué cuesta el día de la #3.** Si declara `series` y `desgaste`, recibe un
error explícito diciendo que la herramienta no está parametrizada. **Correcto
pero limitante:** una máquina con histórico legítimo no puede tener pronóstico.

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

1. **B1 Fase 3-4** — desbloquea B2 y B3, y es lo que más reduce el coste del alta
2. **B3** — la asimetría que más se nota en una demo
3. **B4** — deja de ser una limitación en cuanto haya una segunda máquina con histórico
4. **B5** — decisión de una tarde, pero un verificador en rojo permanente no sirve
5. **B2** — el rediseño de los motores de reglas, cuando B1 lo haya hecho local
6. **B8** — la prueba del sondeo por máquina, antes de que haya tres

**B6 y B7 no son tareas**: son fronteras que vigilar en la revisión de la #3.
