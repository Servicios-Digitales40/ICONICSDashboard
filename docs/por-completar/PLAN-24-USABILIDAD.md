# Plan 24 · Usabilidad

> **Objetivo.** Que el tablero deje de pedirle al operador que sepa cosas que
> la pantalla no le dice: si el dato que está mirando es de ahora, de dónde
> salió, qué hacer cuando algo falla, y cómo llegar a otra vista sin recorrer
> el árbol de navegación con el ratón. Diez entregas: `USO-01` a `USO-10`.

> **De dónde sale.** De [`docs/HOJA-DE-RUTA-60-MEJORAS.md`](../HOJA-DE-RUTA-60-MEJORAS.md),
> Plan 24. Ninguno de sus puntos necesita red a la planta: todo se desarrolla y
> se prueba con `ICONICS_FAKE=true`. Tampoco necesita GPU — a diferencia del
> Plan 23, aquí el asistente sólo aparece como receptor de contexto (`USO-07`),
> y esa entrega se comprueba mirando qué se le manda, no qué contesta.

> **Rama.** `Moises7`, la misma en la que se ejecutó y cerró el Plan 23.

> **ESTADO — EN CURSO (11-09-2026). F0, F1 y F2 hechas**, siete fases por delante. La
> investigación de la §0 está hecha contra el código real, con archivo y línea.
> El resultado de cada fase se anota en la §2 según se cierra.

---

## 0 · Lo que ya se investigó, y por qué cambia el plan

Antes de escribir una sola fase se leyó el código real de `app/App.jsx`,
`app/routes/useNavegacion.js`, `app/modoMuro.js`,
`Demo-EVA/data/comunes/estadoDelDato.js`, `Demo-EVA/lib/exportar.js`,
`Demo-EVA/lib/exportarTodo.js`, `Demo-EVA/views/comunes/AlarmasEva.jsx`,
`i18n/useMensajeDeError.js`, `features/asistente/lib/preguntaExterna.js` y
`scripts/verificar-codigos.mjs`.

**El hallazgo que reordena el plan entero: cuatro de las diez entregas ya
están construidas, en todo o en parte.** La auditoría de `Moises6` que generó
las sesenta propuestas es del 04-09-2026, y desde entonces los planes 20, 21,
22, 22.5, 23 y 27 han pasado por encima del frontend. Escribir este plan como
si el árbol fuera el de la auditoría habría significado reimplementar piezas
que funcionan.

Seis hallazgos concretos:

1. **`USO-02` («estado en la URL») está hecho, y bien.**
   `app/routes/useNavegacion.js` ya usa la History API, ya normaliza la URL de
   arranque, ya atiende `popstate`, y ya filtra a la query string sólo lo
   serializable — con el incidente escrito en su cabecera (`cardVariant` con
   un componente de React dentro acababa como `[object Object]`). Las vistas
   reciben `params` y `onNavigate`.

   Lo que **no** está: que cada vista declare qué parte de SU estado interno
   merece viajar. `AlarmasEva` sí lo hace (`?tab=vivo&activo=<id>`, su
   cabecera lo documenta); el resto no. `USO-02` no es «poner el estado en la
   URL», es **terminar de adoptar el mecanismo que ya existe**, y eso es
   mucho menos trabajo y de otra naturaleza.

2. **`USO-10` («modo muro con latido») está hecho salvo el latido.**
   `app/modoMuro.js` ya da `?muro=1`, escala por `zoom` (con la medición de
   las 199 declaraciones de `fontSize` en `px` que descartó la vía del `rem`),
   rotación opcional entre vistas, y el cromo retirado en `App.jsx`.

   Falta exactamente **el latido**: un wallboard que se congela es
   indistinguible de uno que funciona, y hoy nada en pantalla dice «esto sigue
   vivo». Es media entrega, no una entrega.

3. **`USO-01` («frescura obligatoria») tiene el motor hecho y la adopción a
   medias.** `Demo-EVA/data/comunes/estadoDelDato.js` ya define `FRESCURA`
   (cuatro estados), `UMBRAL_CONGELADO_MS` (60 s, con su razonamiento),
   `presentarValor()` y `estadoHistorial()` (cinco estados). Es dominio de
   presentación correcto y probado.

   **Pero sólo lo consumen cuatro archivos**: `components/tiles.jsx`,
   `components/detalle/DetalleGrid.jsx`, `components/detalle/piezas.jsx` y
   `views/comunes/AlarmasEva.jsx`. De las **diecisiete vistas** de
   `Demo-EVA/views/` y las **siete** de `modulos/prediccion/views/`, la
   mayoría pinta cifras sin pasar por ahí. La palabra de `USO-01` es
   **«obligatoria»**, y hoy es opcional: quien escriba una tarjeta nueva
   puede no enterarse de que este módulo existe. El trabajo es de adopción y
   de **hacer que olvidarlo falle**, no de escribir el mecanismo.

4. **`USO-04` («errores accionables») tiene el canal montado y le falta la
   acción.** El backend tiene catálogo de códigos (`backend/http/codigos.mjs`),
   el tablero tiene `i18n/useMensajeDeError.js` y `errors.json` en los dos
   idiomas, y `scripts/verificar-codigos.mjs` ya falla si un código nace sin
   traducir — incluida la comprobación de que ninguna ruta responde un error
   sin código.

   Lo que falta es la mitad que da nombre a la entrega: hoy un error se
   **nombra** («No se pudo accionar la bomba») pero no dice **qué hacer**. El
   Plan 22 dejó esto escrito explícitamente
   ([`PLAN-22-SEGURIDAD.md`](../completados/PLAN-22-SEGURIDAD.md) línea 207:
   «Plan 24 (`USO-04`, errores accionables), y hasta entonces sale en el
   registro»). `USO-04` es añadir el siguiente paso al código, no el código.

5. **La exportación (`USO-09`) está partida en tres caminos que no se
   conocen.** `Demo-EVA/lib/exportar.js` (CSV y PNG de una señal),
   `Demo-EVA/lib/exportarTodo.js` (CSV largo de las cinco historizadas, con la
   decisión de formato largo bien argumentada tras SEG-05) y el PDF de la
   conversación en `backend/ia/reporte.mjs` con enlaces firmados (SEG-09).
   Tres nombres de archivo, tres criterios de qué metadatos viajan, y ninguna
   vista fuera de Detalle exporta nada.

   «Unificada» no puede significar fusionarlos en un solo módulo: el PDF es
   del backend y los otros dos del navegador. Significa **un solo criterio**
   —nombre, cabecera de procedencia, tratamiento del hueco— y que cualquier
   vista pueda ofrecerlo.

6. **`USO-05` («bandeja de eventos con acuse») tiene ya las dos mitades
   difíciles, y son de fuentes distintas.** `views/comunes/AlarmasEva.jsx`
   tiene dos pestañas deliberadamente separadas —«Historial» (eventos de
   GENESIS64) y «En vivo» (bits de PLC del Plan 27 F6)— y su cabecera
   argumenta por qué fusionarlas repetiría un error ya cometido una vez. Y
   `acknowledgeIconicsAlarms` ya existe en `lib/iconics`.

   **Esto acota `USO-05` de forma dura.** «Bandeja unificada con acuse» choca
   de frente con una decisión escrita y razonada. Y hay un segundo
   impedimento, del Plan 23: el propio cierre de ese plan dejó anotado que
   `estado_de_alarmas` quedó fuera porque **la cobertura es asimétrica** —
   vibraciones trae contadores del servidor de alarmas, el tanque sólo bits
   de PLC, y para el árbol del tanque el puente sigue avisando de que «el
   servidor no publica alarmas». Una bandeja que las junte tiene que resolver
   esa asimetría primero, y resolverla es descubrir la forma real del
   contrato de alarmas — que es `ICO-10`, y **está en el Plan 26 por
   necesitar la planta**.

   Conclusión: `USO-05` **no se puede terminar entero en el Plan 24**. Ver
   §0.2.

## 0.1 · Lo que este plan NO va a hacer, y por qué

- **No reescribe la navegación.** `useNavegacion` cumple; traer un enrutador
  seguiría sin ganarse su sitio en el bundle (su cabecera ya lo argumenta y el
  argumento sigue en pie).
- **No fusiona las dos pestañas de Alarmas.** Ver hallazgo 6.
- **No toca el reparto de vistas por máquina.** La duplicación de
  `Inicio`/`Riesgos`/`Controles` es real y está medida, pero es `F1` de
  [`BACKLOG-FRONTEND.md`](../BACKLOG-FRONTEND.md) y del Plan 26 (`COD-04`),
  no de usabilidad. Parametrizar vistas mientras se les añade procedencia y
  frescura sería mover dos cosas a la vez.
- **No sube el techo del bundle para callar a `verificar-bundle.mjs`.** Si un
  build se pone en rojo, la palanca es cargar sólo el idioma activo (~40 KB,
  `BACKLOG-FRONTEND.md` F5), no mover el número.

  **Matiz del 11-09-2026, y conviene leerlo entero porque roza esta regla.** El
  techo de `index` se subió de 300 a **450**, a petición explícita y como
  decisión de producto: vienen nueve fases de este plan más los planes 25 y 26,
  todos añadiendo interfaz. No es «callarlo» —nada estaba en rojo: `index`
  estaba en 239,83 KB de 300, con 60 KB libres— sino dimensionar por adelantado
  para no volver a discutir el número a mitad de camino.
  
  Lo que no cambia: `vendor` se queda en 270, lo que el guion protege de verdad
  (que la pila 3D no viaje en el arranque) no depende de estos números sino de
  `HUELLAS_3D`, y la palanca del idioma activo sigue pendiente y sigue siendo
  lo correcto. La cabecera de `verificar-bundle.mjs` lo argumenta en largo, con
  el aviso que esa subida se gana: **es la segunda seguida sin una medición que
  la empuje, y una tercera sería que no.**

## 0.2 · `USO-05` se parte, como se partió `SEG-01`

Es exactamente el patrón de la §0 de la hoja de ruta, y se resuelve igual:

- **En el Plan 24 — la bandeja y el acuse sobre lo que ya llega.** Acuse con
  su confirmación y su registro, estado de leído/no leído que sobreviva a la
  navegación, y las dos pestañas **conservando su separación**. Todo esto se
  prueba entero con el transporte falso.
- **En el Plan 26 — la unificación.** Cuando `ICO-10` descubra la forma real
  del contrato de alarmas y se sepa si el tanque puede traer eventos de
  verdad, se decide si las dos pestañas pueden ser una. Antes de eso, decidir
  es inventar.

Se anota aquí y se anota en el Plan 26 el día que se escriba. Un punto
partido que sólo está escrito en un sitio se pierde.

## 0.3 · El criterio de orden

Lo que otras entregas van a necesitar, primero. Lo que sólo añade superficie,
después.

```
F0 USO-01 (frescura)      →  F1 USO-03 (procedencia)  →  F2 USO-04 (errores)
   →  F3 USO-09 (exportación)  →  F4 USO-02 (URL)      →  F5 USO-05 (bandeja)
   →  F6 USO-06 (paleta)       →  F7 USO-07 (contexto) →  F8 USO-08 (táctil)
   →  F9 USO-10 (latido)
```

- **F0 primero** porque `USO-03` (procedencia) y `USO-09` (exportación) tienen
  que decir la misma verdad sobre el dato que `USO-01` decide. Si la tarjeta
  dice «congelado» y el CSV exporta el número sin nota, hay dos respuestas a
  la misma pregunta — que es justo lo que la cabecera de `estadoDelDato.js`
  existe para impedir.
- **F1 antes que F3** porque la cabecera de procedencia del CSV es la misma
  información que el panel de procedencia; se decide una vez.
- **F2 antes que F5** porque el acuse de una alarma es la primera acción
  destructiva-ish de la UI que puede fallar, y tiene que fallar con el
  formato que F2 fije.
- **F4 (URL) después de F1-F3** porque lo que merece viajar en la URL depende
  de qué estado hayan introducido esas fases (rango, pestaña, filtro de
  procedencia).
- **F6 (paleta) después de F4** porque una paleta de comandos que navega
  necesita que los destinos sean direccionables. Navegar a un sitio cuyo
  estado no está en la URL deja al usuario en una vista que no puede
  compartir ni recargar.
- **F7 (contexto al asistente) después de F4** por el mismo motivo: el
  contexto de la vista ES, en buena parte, sus parámetros de URL.
- **F8 y F9 al final** porque no bloquean a nadie y son las dos que más se
  benefician de ver el resto ya puesto: el criterio táctil se aplica sobre
  los controles que las fases anteriores hayan añadido, y el latido del muro
  sobre la frescura que F0 dejó disponible.

## 0.4 · Cómo se comprueba cada fase

Toda fase, sin excepción, cierra en verde con:

```bash
npm run lint && npm run types && npm run verificar
cd react-dashboard && npm test && npm run design:detect && npm run build
node scripts/verificar-bundle.mjs
```

Y las que tocan texto de pantalla, además:

```bash
node scripts/verificar-i18n.mjs      # los dos idiomas dicen lo mismo
node scripts/verificar-textos.mjs    # no queda español fuera del diccionario
node scripts/verificar-codigos.mjs   # cada código del puente se dice en los dos
```

> **Esto no es ceremonia en este plan concreto.** Nueve de las diez entregas
> añaden texto visible. `verificar-textos.mjs` es el que caza el descuido
> real: una cadena en español escrita directa en un `<div>` pasa lint, pasa
> las pruebas, se ve perfecta en la máquina de quien la escribió, y sale rota
> en inglés para siempre.

## 0.5 · La regla de la hoja de ruta, comprobada

Un plan del 21 al 25 está bien cerrado si esto pasa en una máquina sin red a
planta:

```bash
npm run lint && npm run types && npm run verificar
```

Este plan la cumple **con una excepción declarada**: la mitad de `USO-05` que
se va al Plan 26 (§0.2). No queda a medias en el árbol — lo que se entrega en
F5 funciona entero con las dos pestañas separadas; lo que se va al 26 es una
decisión de producto que hoy no se puede tomar, no un trozo de código sin
terminar.

---

## F0 · `USO-01` — frescura obligatoria

**Hoy.** El mecanismo existe (`estadoDelDato.js`, hallazgo 3) y lo usan cuatro
archivos de los muchos que pintan cifras.

**Qué se entrega.**

1. **Adopción en las vistas que faltan.** Toda cifra en vivo de
   `Demo-EVA/views/` pasa por `presentarValor()`, y toda serie por
   `estadoHistorial()`. Se hace vista por vista, empezando por las de más
   superficie (`InicioTanque`, `InicioVibraciones`, `PlantaTanque`,
   `Vibraciones`).
2. **Que olvidarlo falle.** Un `scripts/verificar-frescura.mjs` que recorra
   `Demo-EVA/views/` y `Demo-EVA/components/` y marque todo componente que
   formatee un valor de señal sin haber pasado por el módulo. Es el mismo
   patrón que `verificar-codigos.mjs` y por el mismo motivo: el modo de fallo
   es silencioso y cómodo — una cifra vieja se ve exactamente igual que una
   fresca.
3. **Decidir explícitamente qué pasa en `modulos/prediccion/`.** Su fuente no
   es ICONICS (CLAUDE.md §4.7) y no tiene `receivedAt` del motor de sondeo. O
   se le da su propia noción de frescura, o queda declarado fuera de alcance
   con su motivo escrito. **No puede quedar simplemente sin mirar** — ése es
   el caso en que el verificador nuevo nace con una excepción no razonada.

**El antecedente que manda aquí, y no es teórico.** El 07-09-2026, en planta,
el panel de salud (Plan 20 F10) daba el asistente y el dictado por
**Funcionando** con los dos servicios caídos: `servicio()` equiparaba
«configurado» con «funcionando» —su parámetro `ok` tenía valor por defecto
`true` y nadie lo pasaba nunca— así que no se contactaba a ninguno. Se
arregló fuera de plan. **La lección que hereda `USO-01`**: la frescura no se
pinta a partir de que algo esté declarado; lo que se enseñe tiene que venir de
haber preguntado, y el valor por defecto de una función que informa de salud
nunca puede ser el optimista.

**Cómo se comprueba.** Pruebas de `react-dashboard/src/test/demo-eva/` con
reloj falso (ya existe el patrón en `edad-dato.test.jsx`) más el verificador
nuevo entrando solo en `npm run verificar` — esa tanda **descubre** la carpeta
`scripts/`, no lleva lista.

---

## F1 · `USO-03` — panel de procedencia

**Hoy.** El dominio ya sabe la procedencia: `shared/quality.js` tiene los cinco
códigos medidos (incluido `QUALITY_SIN_DATO = 0x08000000` del incidente del
26-08-2026) y `cobertura` viaja hasta la gráfica (`ICO-09`, Plan 21) — lo pintan
`piezas.jsx` («N/M tramos con dato») y el panel de `tiles.jsx`. Pero está
repartido: no hay un sitio donde preguntar «¿de dónde salió este número?».

**Qué se entrega.** Un panel —abrible desde cualquier señal— que responda, para
ese punto concreto: qué tag de ICONICS es, cuándo llegó la última lectura, con
qué código de calidad, si la serie está historizada o no, y qué cobertura tiene
el rango que se está viendo.

**La regla que lo ata.** No calcula nada. Lee lo que `shared/` ya decidió.
CLAUDE.md §4.3 — una vista que recalcula una banda rompe la capa; un panel de
procedencia que recalcula una calidad la rompe igual.

**Y el límite que hay que respetar.** El panel enseña procedencia **de un punto
de un sistema**, nunca una tabla que ponga dos sistemas uno al lado del otro.
`NO_COMPARTEN` en `shared/eva/comun/sistemas.js` no es una regla de las
herramientas del asistente, es del dominio — y el Plan 23 encontró que esa
guarda no protegía el caso real (10 de 42 etiquetas de vibraciones resolvían a
una señal del tanque, corregido en `98fe465`). Un panel de procedencia es
exactamente el tipo de vista transversal que vuelve a invitar a ese cruce.

---

## F2 · `USO-04` — errores accionables en pantalla

**Hoy.** El error se nombra en los dos idiomas y el código viaja (hallazgo 4).
No se dice qué hacer.

**Qué se entrega.** Que cada código del catálogo pueda llevar, además de su
frase, **un siguiente paso**: qué comprobar, qué reintentar, a quién avisar. Y
que la UI lo pinte donde hoy sólo pinta el título.

**Tres decisiones que hay que tomar explícitamente, no por omisión:**

1. **No todo código tiene acción.** Un `ERROR_VALIDACION` interno no le pide
   nada al operador de planta. Forzar una acción para cada código produce
   texto de relleno, que es peor que nada — enseña que el panel de errores no
   dice nada útil y se deja de leer. La acción es **opcional por código**, y
   `verificar-codigos.mjs` se extiende para comprobar la simetría de las que
   sí existen (si está en español, está en inglés), nunca para exigir que
   existan todas.
2. **La acción es del código, no del sitio.** Vive junto a la frase, en
   `errors.json`, y no repartida por las vistas — si no, el mismo fallo
   sugiere dos cosas distintas según dónde aparezca.
3. **El reintento, cuando lo haya, tiene que ser real.** Un botón «Reintentar»
   que sólo vuelva a pintar el mismo error caído es peor que ningún botón.

**El caso concreto que el Plan 22 dejó apuntado.** Su línea 207 remite aquí y
dice que «hasta entonces sale en el registro»: hay al menos un fallo que hoy
sólo se entera quien lee los logs del servidor. Leer ese punto del Plan 22 es
el primer paso de esta fase, y su caso es el primero que se cubre.

---

## F3 · `USO-09` — exportación unificada

**Hoy.** Tres caminos que no se conocen (hallazgo 5).

**Qué se entrega.** Un solo criterio, y la capacidad extendida:

1. **Un nombre de archivo.** La regla ya existe en `exportar.js`
   (`nombreArchivo`) y `exportarTodo.js` la reusa; se hace explícita y única.
2. **Una cabecera de procedencia en todo lo que salga.** Qué señal, qué rango,
   qué cobertura, y con qué frescura se leyó — lo mismo que F1 pinta. Un CSV
   que sale de este tablero tiene que poder defenderse solo seis meses
   después, cuando nadie recuerde de qué pantalla salió.
3. **El hueco se exporta como hueco.** `datosACSV` ya recibe `cobertura`. Es
   CLAUDE.md §2.4 y es donde más fácil se rompe: una fila que falta en un CSV
   la rellena con cero el siguiente que abra el archivo en Excel.
4. **Más de una vista puede exportar.** Hoy sólo Detalle.

**Lo que NO se hace.** No se vuelve a traer `xlsx`. El Plan 22 F1 lo quitó por
sus avisos conocidos y el motivo sigue en pie; y el formato largo de
`exportarTodo.js` está bien argumentado (alinear cinco ejes de tiempo
distintos sería inventar dato). Si alguien pide un libro de varias hojas, es
una decisión nueva con su propio motivo, no un «volvamos a lo de antes».

---

## F4 · `USO-02` — estado en la URL

**Hoy.** El mecanismo está hecho y bien (hallazgo 1). La adopción por vista no.

**Qué se entrega.** Que cada vista declare qué parte de su estado merece viajar
—rango de tiempo elegido, pestaña, activo seleccionado, filtro— siguiendo el
patrón que `AlarmasEva` ya estableció con `?tab=vivo&activo=<id>`.

**La guarda que ya está puesta y hay que no romper.** `esSerializable()` filtra
a cadenas, números y booleanos. Su cabecera documenta el incidente concreto
(`cardVariant` con un componente de React dentro, URL con
`cardVariant=[object Object]`). Al añadir parámetros nuevos, ninguno puede ser
un objeto — y si la tentación aparece, la respuesta es un id que la vista
resuelva, no relajar el filtro.

**El criterio de qué viaja.** Lo que alguien querría poder **enviar por chat a
un compañero** o **dejar puesto en un kiosco**. No el estado de un desplegable
abierto. La cabecera de `useNavegacion` ya nombra los tres casos que
justificaron el mecanismo (configurar un kiosco, sobrevivir a un reinicio a
las 6 de la mañana, enviar el enlace de una máquina) y son el filtro correcto.

---

## F5 · `USO-05` — bandeja de eventos con acuse

**Alcance acotado — ver §0.2.** Aquí va la bandeja y el acuse sobre lo que ya
llega, con las dos pestañas separadas. La unificación es del Plan 26, detrás de
`ICO-10`.

**Qué se entrega.**

1. **Acuse con confirmación.** `acknowledgeIconicsAlarms` ya existe en
   `lib/iconics`; lo que falta alrededor es el ciclo completo: confirmación
   antes (es una acción sobre la instalación), estado mientras, y error
   accionable si falla — con el formato que F2 fijó.
2. **Leído / no leído que sobreviva a la navegación.** Hoy salir de la vista
   de Alarmas y volver es empezar de cero. Es lo que convierte una lista en
   una bandeja.
3. **El acuse queda registrado.** SEG-08 dejó `backend/lib/diario.mjs` para
   responder «¿qué se le hizo a la instalación?» meses después, y el Plan 23
   encontró que `controlar_bomba` no anotaba en él. Un acuse de alarma es de
   la misma naturaleza: se comprueba si entra ahí, y si no, se dice por qué.

**Lo que hay que respetar sí o sí.** Las dos pestañas no se fusionan y no se
disimula su diferencia de fuente. La cabecera de `AlarmasEva.jsx` lo argumenta
y el cierre del Plan 23 lo confirma desde el otro lado: la cobertura es
asimétrica, y para el árbol del tanque el puente sigue avisando de que «el
servidor no publica alarmas».

---

## F6 · `USO-06` — paleta de comandos

**Hoy.** No existe. Sólo hay `Escape` en el panel del asistente
(`Asistente.jsx` líneas 372-381) y navegación por teclado dentro de `Tabs`.

**Qué se entrega.** Un `Ctrl/Cmd+K` que abra un buscador de acciones: navegar a
una vista, saltar a una máquina, abrir el asistente con una pregunta.

**Cuatro condiciones, y son las que deciden si esto vale la pena:**

1. **Diferida, como el asistente.** `App.jsx` documenta por qué el asistente
   va en `lazy()` y el aviso concreto que dejó: se importa el COMPONENTE y no
   el barril, porque con el barril Rollup nombra el trozo `index.js`, genera
   un segundo `index-*.js` y `verificar-bundle.mjs` medía el que encontrara
   primero — daba 7 KB por bueno y el techo dejaba de comprobar nada. La
   paleta hereda ese cuidado tal cual.
2. **Sin dependencia nueva.** Mismo criterio que `useNavegacion` aplicó al
   enrutador: una dependencia en el bundle de planta tiene que ganarse su
   sitio.
3. **Los destinos salen del registro.** `routes.jsx`, `PAGE_META`,
   `SECCIONES`. Una lista escrita a mano se queda vieja en cuanto entre la
   máquina #3 — es el fallo que `BACKLOG-FRONTEND.md` F4 ya describe para el
   sidebar.
4. **No aparece en modo muro.** Un wallboard no tiene teclado. `App.jsx` ya
   quita el cromo con `muro.activo`; la paleta sigue esa misma puerta.

---

## F7 · `USO-07` — asistente con contexto de la vista

**Hoy.** `features/asistente/lib/preguntaExterna.js` ya permite que una vista
le mande una pregunta al asistente: un `CustomEvent` de una sola dirección y un
solo dato, con su cabecera argumentando por qué no es un atajo sucio (contrato
unidireccional, sin estado compartido, un solo oyente). Lo que viaja hoy es
**el texto ya redactado por quien lanza**, nada más.

**Qué se entrega.** Que el asistente sepa desde qué vista se le pregunta: qué
sistema, qué activo, qué rango de tiempo está en pantalla — para que «¿y esto
por qué sube?» tenga referente.

**Las tres restricciones, y vienen del Plan 23, no de aquí:**

1. **El contexto es de FOCO, no de dato.** El Plan 23 F2 ya entregó `IA-07`
   (memoria del foco) respetando una frontera que estaba escrita en
   `chat.mjs`: `historialAMensajes()` no deja entrar los RESULTADOS de
   herramientas de turnos previos, para que el modelo no mezcle cifras de un
   turno con la pregunta de otro. El contexto de vista tiene que obedecerla
   igual: puede decir **de qué se está hablando** (qué señal, qué sistema,
   qué rango), nunca **cuánto vale ahora** — el valor lo pide la herramienta,
   que es quien lo lee con su calidad y su frescura.
2. **Un contexto no cruza dos sistemas.** Mismo motivo que F1, y con el
   precedente de `98fe465` delante.
3. **El contrato sigue siendo de una dirección.** Lo que hace bueno a
   `preguntaExterna.js` es que no hay estado compartido que pueda
   desincronizarse. Añadir campos al evento lo conserva; abrir un canal de
   vuelta lo rompe.

**Y una consecuencia que hay que asumir.** El contexto de vista es entrada
nueva al bucle del asistente, así que **entra por la validación con Zod** que
el Plan 23 F0 (`IA-04`) puso justo para esto. No se cuela por un lado sin
validar.

---

## F8 · `USO-08` — criterio táctil

**Hoy.** `lib/viewport.js` da `useMediaQuery` (valor inicial síncrono, sin
parpadeo, suscrito a cambios), en el estilo de `usePrefersReducedMotion`. Es la
pieza base y está bien. Lo que no hay es un **criterio**: qué es un objetivo
táctil aceptable en este tablero, y quién lo comprueba.

**Qué se entrega.** El criterio escrito en [`DESIGN.md`](../../DESIGN.md) —área
mínima de pulsación, separación entre controles adyacentes, qué pasa con lo que
hoy sólo responde a `hover`— y su aplicación a los controles existentes, con
prioridad para los que accionan la instalación (`ControlesTanque`,
`ControlesVibraciones`) y los que F5 añade (acuse).

**Por qué esto importa aquí y no es cosmética.** El destino es una pantalla en
planta, con guantes. Un control de accionamiento de bomba que se falla al
pulsar no es una molestia de diseño.

**Dónde se comprueba.** `npm run design:detect` (impeccable) es el guion que
ya existe para antipatrones de diseño; se mira si puede cubrir esto, y si no,
el criterio va a `DESIGN.md` como regla revisable a ojo. **No se inventa un
verificador que mida algo que no se puede medir sobre estilos en línea** —
CLAUDE.md §2.5.

**Ojo con el modo muro.** `zoom` escala todo, así que a 1.6 un objetivo de 36 px
se pinta a 57,6. El criterio se fija en **unidades del sistema**, igual que la
frontera de «ningún texto pasa de 16px» que `modoMuro.js` argumenta que sigue
siendo cierta en esas unidades. Medirlo en píxeles pintados daría por bueno un
control que a escala 1 es inalcanzable.

---

## F9 · `USO-10` — modo muro con latido

**Hoy.** El modo muro está hecho; falta el latido (hallazgo 2).

**Qué se entrega.** Una señal continua y discreta de que el tablero sigue vivo
y de que los datos siguen llegando. No un reloj —un reloj sigue corriendo con
el sondeo caído— sino algo atado a la **última lectura real**, que es lo que F0
dejó disponible: `receivedAt` y `FRESCURA` ya están calculados y ya viajan.

**El fallo que esto existe para evitar es el mismo del 07-09-2026.** Un
wallboard congelado con cifras plausibles en pantalla es indistinguible de uno
que funciona — exactamente como el panel de salud daba «Funcionando» sin haber
preguntado. El latido tiene que venir de haber preguntado.

**Restricciones.**

- **No puede ser una animación que no pare.** `lib/motion.js` tiene
  `usePrefersReducedMotion` y hay que respetarlo; además, algo parpadeando
  toda la noche en una pantalla de planta se convierte en ruido que nadie ve.
- **Degrada al estado peor, no al mejor.** Si no hay `receivedAt`, el latido
  no late. Nunca al revés.
- **Cabe en el cromo retirado.** El modo muro quita sidebar y topbar a
  propósito; el latido no puede traerlos de vuelta por la puerta de atrás.

---

## 1 · Riesgos de este plan

1. **Es el plan con más superficie de UI de los seis, y el bundle tiene
   techo.** Nueve entregas añaden pantalla. Se mide en cada fase, no al final.
   La palanca, si aprieta, es el idioma activo — no el techo.

   **Corregido el 11-09-2026, al medirlo en F0:** este punto decía 195,43 KB
   sobre 300, tomado de la última medición escrita (09-09-2026). El real era
   **239,78 KB de base**, medido con `git stash` para separarlo del coste de la
   fase. No era una regresión de este plan —los 44 KB son anteriores— pero
   dejaba el margen en 60 KB para nueve fases, no en 105.

   **Y ese mismo día el techo subió a 450** (ver §0.1), así que el margen real
   pasa a ~210 KB y este riesgo deja de morder durante este plan. Lo que **no**
   desaparece: el bundle sigue creciendo y nadie ha tomado la palanca del
   idioma activo. El riesgo se ha aplazado, no resuelto — y el propio
   `verificar-bundle.mjs` deja escrito que una tercera subida sin medición no
   toca. Se sigue midiendo en cada fase.
2. **Cuatro entregas son adopción, no construcción, y la adopción se
   abandona a medias.** `USO-01`, `USO-02` y `USO-04` consisten en llevar a
   todas las vistas algo que ya funciona en unas pocas. Es el trabajo que más
   fácil se da por hecho estando al 60 %. Por eso F0 entrega **un verificador
   que hace fallar el olvido**, y no sólo las adopciones.
3. **`USO-05` está partido y la mitad de arriba es tentadora.** Fusionar las
   dos pestañas se ve, desde fuera, como una mejora obvia de usabilidad. Está
   prohibido por dos razones escritas e independientes (§0.2). Si alguien lo
   propone a mitad del plan, la respuesta está aquí.
4. **El asistente ya está cerrado y F7 lo vuelve a abrir.** El Plan 23 cerró
   el 11-09-2026 con seis entregas hechas y dos descartadas. F7 mete entrada
   nueva en su bucle. Pasa por `IA-04` (Zod) y respeta la frontera de
   `historialAMensajes()`; si F7 obligara a relajar cualquiera de las dos, F7
   se replantea — no la regla (CLAUDE.md §2, encabezado).

---

## 2 · Resultado

### F0 · `USO-01` — HECHA el 11-09-2026 (`a301c51`)

**Los tres sitios**, y el orden de importancia no era el que parecía:

- **`ControlesTanque`** es el que cuenta. La cifra de 34 px del nivel se
  convierte en su edad al congelarse (y baja a 20 px: lo que se enseña deja de
  ser una medida). Lo que lo hace grave no es el tamaño sino lo que ya decía su
  propia cabecera — ese nivel es el MISMO dato que la guarda de «nivel de
  tanque alto» del backend mira en el momento de encender, así que con la
  lectura congelada el operador y esa guarda deciden sobre dos números
  distintos.
- **`FichaActivo`** recibe `ahora` como PROP desde un solo reloj arriba. No es
  detalle: la fila se repite una vez por señal del activo, y `useAhora.js` ya
  nombraba ese caso exacto como su antipatrón.
- **`InicioTanque`** tenía una trampa que no estaba prevista: `REJILLA_VISTAS`
  es una constante de MÓDULO, así que su `dato()` es una función pura llamada
  fuera del árbol de React y **no puede usar un hook**. Se resolvió adjuntando
  la señal y aplicando la frescura en `TarjetaVista`. Y sólo la entrada que
  trae una MEDIDA la adjunta: de las tres, dos devuelven CUENTAS («3 en
  aviso»), que siguen siendo ciertas con la lectura vieja. Atenuarlas por igual
  habría sido mentir en la otra dirección.

**`scripts/verificar-frescura.mjs`**, que es la mitad que importa: entra solo en
la tanda por existir (**28 ahora, eran 27**) y se comprobó que **se pone rojo de
verdad** al saltarse la puerta — un verificador que nunca se ha visto fallar no
prueba nada.

**Dos reglas suyas nacieron mal, y salió a cuenta descubrirlo en el acto:**

1. Marcaba `Demo-EVA/lib/formato.js`, que es donde `fmtSenal` **se define**.
   Exigirle a la definición que consulte un reloj no tiene sentido. Ahora es
   `NO_ES_PRESENTACION`, deliberadamente separado de `EXENTOS`: son dos cosas
   distintas y mezclarlas invitaría a colar ahí una vista.
2. Contaba las menciones en COMENTARIOS como llamadas. Dio un falso positivo en
   la cabecera que explica por qué `FilaSenal` recibe `ahora` como prop — es
   decir, **castigaba escribir buenas cabeceras**, en un repo cuya primera
   convención es escribirlas. Se lee el fuente sin comentarios.

**`modulos/prediccion/` queda fuera, con su motivo escrito** — el plan exigía
decidirlo explícitamente y no dejarlo sin mirar. Medido: no usa `fmtSenal` ni
`fmtCifra` en ningún archivo, no pasa por el motor de sondeo y por tanto no
tiene `receivedAt`. Lo que enseña es el histórico de un compresor consultado a
Django, y **un histórico no envejece mientras lo miras**. Darle una frescura
derivada de cuándo se hizo el `fetch` respondería una pregunta distinta de la
que el usuario lee.

**Comprobado.** `lint` 0 errores · `types` · **28 verificadores** ·
`i18n`/`textos`/`codigos` · `build`.

Dos cosas medidas en vez de supuestas, ambas porque la cifra sorprendía:

- **El bundle.** `index` quedó en **239,83 KB** (de 300 entonces; el techo pasó
  a 450 ese mismo día, ver §0.1), y el plan decía 195,43.
  Medido contra la base con `git stash`: **ya estaba en 239,78 antes de esta
  fase**. El coste real de F0 son **0,05 KB**. Los 44 KB son anteriores y no de
  aquí — pero el margen que la §1 daba por bueno es menor de lo que el plan
  creía, y eso importa para las nueve fases que quedan.
- **Una prueba roja que no es mía.** `accesibilidad.test.jsx` («PlantaTanque no
  tiene violaciones graves») da timeout a los 5 s montando axe-core sobre una
  vista con Three.js. Comprobado con `git stash`: **falla igual sin estos
  cambios**. No se toca aquí —no es de esta fase— pero queda anotado.
  **Arreglada en F1**, junto con la segunda que apareció por la misma causa.

### F1 · `USO-03` — HECHA el 11-09-2026 (`d1a9d8d`)

**`shared/eva/comun/procedencia.js`, y lo que importa es que RECOGE.** La
respuesta ya estaba entera en el árbol, repartida en cinco sitios que no se
conocen entre sí: el tag lo sabe `pointName()`, el PLC y la cadencia los
declara `SISTEMAS`, la calidad la interpreta `shared/quality.js`, si hay serie
propia lo decide `esHistorizada()` y la cobertura la calcula `historia.js`.
Para saber de dónde venía un valor había que preguntar a los cinco y saber que
existen.

No calcula nada nuevo, y eso es la diferencia entre un panel de procedencia y
una segunda opinión sobre el dato (§4.3). Consecuencia práctica: si mañana
cambia la cadencia de una máquina o la ruta de su historiador, el panel no se
entera y sigue diciendo la verdad. Las pruebas comparan contra lo que el
registro declara (`SISTEMA.tanque.plc`) y no contra literales — una prueba con
`"PLC_1 · ua:DEMO2"` escrito a mano comprobaría que nadie toca el registro, que
no es lo que importa.

**La unidad es un punto, y la firma no admite lista.** Es la restricción que
§F1 del plan pedía respetar, y la razón es concreta: un panel de procedencia es
transversal por naturaleza, lo que lo convierte en la invitación perfecta a
poner dos sistemas uno al lado del otro «para comparar de dónde vienen». Sin el
tag no se deduce la máquina de la clave — sale `null`, porque deducirla es
exactamente el cruce que el Plan 23 corrigió en `98fe465`. Comprobado con las
dos máquinas: vibraciones contesta con su propio PLC, su cadencia de 5 s y su
ruta `hda:\Configuration\DEMO 3:`, sin que el módulo sepa de ninguna.

**Es un `<details>` nativo, no un modal.** Tres motivos, y el segundo no era
evidente antes de mirar: es información de consulta y no una interrupción
(quien duda de la cifra no quiere perderla de vista); el `ModalProvider` de
esta app maneja un identificador de texto **sin carga útil**, así que habría
que rehacerlo para pasarle una señal; y el plegado accesible con teclado sale
gratis.

**Y calla cuando no sabe** (§2.4), que es la mitad del trabajo: sin lectura no
finge una edad, con lectura buena no arrastra nota de calidad —se leería como
advertencia—, y una cobertura completa no se menciona, porque «48 de 48» es
ruido. Lo que hay que decir es cuándo NO está completa.

**Dos pruebas ajenas que este panel destapó, y ninguna se relajó:**

1. `edad-dato.test.jsx` buscaba `/hace/` y ahora la tarjeta tiene **dos edades
   legítimas** (la cifra sustituida y la fila «Última lectura»). La aserción se
   **estrecha**: identifica la cifra grande por el `title` que sólo ella lleva.
   Aflojarla a `getAllByText(...).length > 0` habría pasado igual con la cifra
   intacta y sólo el panel abierto.
2. `accesibilidad.test.jsx` llevaba **dos fases en rojo por plazo agotado**, no
   por una violación. Timeout explícito a las dos pruebas lentas, sin tocar el
   criterio: siguen exigiendo cero violaciones graves, y `DetalleActivo` las
   pasa **con el panel dentro** —o sea, el panel es accesible—. Se arregla
   porque un rojo permanente que nadie atribuye a nada enseña a ignorar el
   rojo, que es peor que una prueba lenta.

**Comprobado.** `lint` 0 errores · `types` · 28 verificadores · `i18n` con
paridad en los dos idiomas · **683 pruebas en verde, en dos pasadas seguidas**
— la suite entera limpia por primera vez en este plan · `build` con `index` en
**241,41 KB de 450**, o sea **1,63 KB** de coste real para esta fase.

Dos errores propios que `lint` y `types` cazaron antes del commit, y que valen
como recordatorio de para qué están: un import sin usar, y un JSDoc que
declaraba `senal` obligatorio cuando la función admite llamarse sin argumentos
a propósito (hay una prueba para ese caso). El segundo se corrigió en la
dirección correcta —documentar por qué es opcional— y no marcando el parámetro
como requerido para que el tipo callara.

### F2 · `USO-04` — HECHA el 11-09-2026 (`5fe235c`)

**El canal ya estaba montado desde el Plan 22** (catálogo de códigos en el
puente, `errors.json` en los dos idiomas, `verificar-codigos.mjs` fallando si un
código nace sin traducir). Lo que faltaba es la mitad que da nombre a la
entrega: un fallo se **nombraba**, y para saber qué hacer había que conocer el
despliegue por dentro.

`useMensajeDeError` devuelve ahora `accion` como tercer campo, y `AlertBanner`
la pinta **debajo** del detalle. El orden es el del razonamiento de quien lee
—qué falló, con qué dato exacto, y entonces qué hacer—; invertirlo daría una
instrucción antes de decir a qué responde. Con borde y peso de texto normal, no
como un cuarto gris: es lo único de la tarjeta sobre lo que alguien puede
actuar, y un párrafo de apoyo en gris claro es lo que nadie lee.

**Trece de los cuarenta y dos códigos llevan acción, y las tres decisiones que
el plan pedía tomar explícitamente están tomadas:**

1. **No todo código tiene acción, y eso no es trabajo a medias.** La mayoría no
   tiene nada que pedirle a un operador de planta —un `ERROR_VALIDACION`
   interno, un `ERROR_SERVER`—, y rellenar el hueco con «inténtalo de nuevo»
   tiene un coste concreto: enseña que ese hueco no dice nada útil, y entonces
   se deja de leer justo en los trece donde sí lo dice.
2. **La acción es del código, no del sitio**: vive en `errors.json`, junto a la
   frase, así que el mismo fallo no puede sugerir dos cosas distintas según la
   pantalla.
3. **Tres códigos no la llevan aparte porque ya la llevan DENTRO de su frase**
   (`ERROR_ENLACE_CADUCADO` dice «pídele al asistente que te genere otro»,
   `ERROR_CONSULTA_EN_CURSO`, `ERROR_RATE_LIMITED`). Duplicarla se leería como
   dos instrucciones distintas. Esto no estaba previsto en el plan; salió al
   leer los cuarenta y dos textos uno por uno.

Lo del **reintento real** que el plan pedía como tercera decisión no hizo falta:
ningún código de los trece pide un botón. Los que se arreglan reintentando ya lo
dicen en su frase, y los demás son decisiones de despliegue —un botón
«Reintentar» sobre `ERROR_READ_ONLY` volvería a fallar igual, que es exactamente
el «peor que ningún botón» del plan.

**`verificar-codigos.mjs` comprueba la SIMETRÍA de las que existen, nunca que
existan todas.** Dos reglas nuevas, las dos **probadas en rojo a propósito**:
una acción en un solo idioma (el modo de fallo real — quien la añade la escribe
en el idioma en que está pensando, y el operador del otro se queda sin la mitad
útil) y una acción para un código que nadie emite.

**Y se cierra la deuda concreta que el Plan 22 F2 dejó apuntada aquí: los
manuales RECORTADOS.** Su §F2 lo escribió tal cual: «la pantalla de
Documentación aún no la pinta; eso es del Plan 24 (`USO-04`), y hasta entonces
sale en el registro de arranque, que es donde alguien la busca hoy».

El fallo era invisible por una razón precisa: un parcial **tiene fragmentos
buscables**, así que caía en la rama `fragmentos > 0` de `estadoDeFila` y salía
«indexado» en verde — indistinguible de un manual completo, mientras lo que el
asistente puede citar de él está incompleto. Ahora `ragRoutes` expone
`motivoParcial`, la fila sale «recortado» en ámbar (`wait`, no `bad`: no está
roto, está a medias) con el motivo que dice **dónde** se cortó, y se cuentan
aparte de los ilegibles — por el mismo motivo que el backend los mantiene en dos
listas: el arreglo de cada uno es distinto y mezclarlos obligaría a leer el
motivo para saber cuál es cuál.

**Comprobado.** `lint` 0 errores · `types` · 28 verificadores · `i18n` con
paridad (**1136 claves × 2 idiomas**) · `textos` · backend **303 pruebas** ·
frontend **690 pruebas en verde** · `build` con `index` en **245,11 KB de 450**
(**3,70 KB** de coste para esta fase).

Una aserción ajena corregida, y **era correcta al fallar**: el fixture de
`documentacion-rag.test.jsx` tiene un manual activo más, así que sus contadores
dicen 3 y no 2. Se actualizó el número y su comentario; no se relajó la
comprobación a «hay algún número».
