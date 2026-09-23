# PLAN 42.5 — La UI acompaña a las máquinas configuradas, y se limpia lo que ya no sirve

**Estado:** F0–F5 por completar · escrito el 22-09-2026
**Rama:** `UI-Limpieza1.0` (nace de `Vibraciones1.0` tras el Plan 42)
**Origen:** el usuario, al ver la ficha de `vib-motor-03` sondeada: «debería
poder consultar los históricos mediante gráficas como lo hacíamos con el
tanque, y ver el detalle de las variables como se veía con el tanque». Y la
decisión que lo acompaña: **el tanque ya no se piensa como «Tanque», sino
como otra posible máquina configurada.**

> Este plan es de **UI/UX y limpieza**. No convierte el tanque en máquina
> configurada —eso es el Plan 43, que se escribe cuando éste termine— pero
> prepara el terreno: las vistas que aquí se hacen genéricas son las que el
> tanque usará el día que entre por configuración, y lo que aquí se borra es
> lo que ninguna máquina configurada va a necesitar.

---

## 0. Lo que hay hoy, medido

**La máquina configurada tiene siete vistas** (Inicio, Gráficas, Vista 3D,
Hallazgos, Avisos, Casos previos, RAG) y ninguna enseña una **tendencia**.
`Vibraciones.jsx` («Gráficas», 479 líneas) lo dice en su propia cabecera:
*«Ninguna tendencia. […] aquí sigue habiendo sólo el instante»*. Se escribió
cuando el historiador no registraba; hoy `vib-motor-03` tiene **78 series
verificadas** (Plan 42) y la pantalla sigue sin dibujar ninguna.

**El tanque tiene las dos vistas que se piden**, y las dos están cerradas con
la rama:

| Vista | Qué hace | Líneas | De qué depende |
|---|---|---|---|
| `PlantaTanque.jsx` | Cinco bandas: atención (fuera de banda ahora), señales con historia y su tendencia, titular (el nivel y lo que lo mueve), estado de las ocho señales y márgenes, recorrido (topología de los 4 activos), tendencias con escala propia | 265 + `tiles.jsx` 1243 | `useSistemaAgua`, `useSeriesHistoricas`, `domain/senales.js` (claves del tanque), `buildModeloEva` |
| `DetalleActivo.jsx` | Pestañas por activo; una tarjeta por variable con valor evaluado y **gráfica a tamaño real** del historiador; rango vivo / ayer / semana / personalizado; exportar CSV | 392 + `components/detalle/` 2594 | `useDetalleActivo` (`data/tanque/`), `domain/activos.js` (los 4 activos, agrupación NUESTRA), `historizadas()` del catálogo del tanque |

**Lo que las hace del tanque no es la presentación, es la capa de datos.**
`data/tanque/historia.js` (417 líneas) lee el historiador **por clave del
catálogo del tanque** (`puntoHistorico(clave)` de `domain/senales.js`);
`useDetalleActivo` recorre `sistema.activos`, que sólo existe en el tanque; los
tiles reciben el modelo del tanque (`buildModeloEva`). Los componentes de
presentación —`DetalleGrid`, `GraficaComparada`, `SelectorRango`,
`PanelProcedencia`, `piezas`— no saben de qué máquina son.

**Lo que la máquina configurada ya ofrece para sustituir eso**, desde
`construirSistema` (Plan 33 F3 en adelante):

| El tanque tenía | La configurada tiene |
|---|---|
| `ACTIVO_IDS`, `sistema.activos` (4, escritos a mano) | `maquina.assets` (raíz y secundarios: `S1`, `S2`, `S3`, `V20`, `TORRETA`) y cada variable con su `assetId` |
| `senalInfo(clave)` → label, unidad, decimales | `sistema.metaDe(clave)` → `{label, unidad, decimales, naturaleza}` |
| `historizadas()` (lista blanca) | `sistema.series.historizadas()` = las **verificadas por el sondeo** |
| `puntoHistorico(clave)` | `sistema.series.punto(clave)` |
| `evaluarRiesgos(sistema)` | `tipo.evaluarRiesgos` sobre la forma común (`estadoMaquina.js`) |
| el modelo en vivo del tanque | `sistema.estado(lecturas)` y `sistema.modelo(punto, t)` |

**Lo que hay para borrar, medido:**

| Qué | Cuánto | Estado |
|---|---|---|
| Vistas y datos del tanque | 9 archivos, 3450 líneas | Cerradas; sin `nav` |
| Pruebas omitidas por el cierre | 29 (`.skip` en 7 archivos de frontend) + 22 comprobaciones de `verificar-herramientas` | Omitidas con motivo |
| Casos previos de la semilla | 13 (11 del tanque, 2 del grupo de bombeo, HANDOFF §1) | «Casos previos» sale **vacío** en vibraciones |
| `datos/aprendizaje.json` | 1 hecho, 5 propuestas, 13 intervenciones | No versionado; estado del despliegue |
| `features/data/` | altas, escrituras y borrados de puntos | «Existe en el árbol pero nadie lo importa» (PRODUCT.md antiguo) |
| Módulo de Predicción | 6 vistas del compresor por API externa | Oculto del menú el 22-09; rutas abiertas por URL |
| `scripts/plc_opcua.py` | guion suelto | «No está conectado a nada» (CLAUDE.md §2.1) |
| `backend/ia/i18n/narrarEstadoTanque.mjs`, `REGLAS_TANQUE` en el motor, el `switch` de `lib/maquina.mjs` | acoplamientos del motor al tanque | B2 del backlog: desaparecen cuando el tanque entre por tipo |

## 1. La regla de la rama, y en qué cambia

`Vibraciones1.0` decía: *«el código del tanque NO se modifica; cerrado no es
borrado»*. Esa regla existía para no perder el módulo maduro mientras
vibraciones se construía copiándolo. Con vibraciones cerrada (Plan 41) y el
usuario decidiendo que el tanque es «otra posible máquina configurada», la
regla cambia a esto:

1. **El dominio del tanque** (`shared/eva/tanque/`, 3393 líneas: física del
   simulador, reglas de riesgo del agua, activos, umbrales) **no se borra en
   esta rama**: es la materia prima del tipo `estacion-de-llenado` del Plan
   43. Se puede leer y se puede mover; no se destila aquí.
2. **Las vistas y la capa de datos del tanque se sustituyen y se borran.** En
   cuanto una vista genérica haga lo que hacía la del tanque, la del tanque
   sobra, con sus pruebas omitidas.
3. **Lo que no es de ninguna máquina y nadie usa se borra ya** (F5), sin
   esperar al tipo.

## 2. Las decisiones de diseño, marcadas

Las que este plan toma, con su porqué; las que deja abiertas van con **[?]**
y se cierran en la fase que las toca, con lo medido delante.

**D1 · «Genérico» significa dirigido por el registro, no por un `if` por
máquina.** Una vista genérica recibe la entrada del registro de la máquina
que tiene delante (`sistema`, construida por `construirSistema`) y su
configuración, y **todo** lo que enseña sale de ahí: qué activos hay
(`assets`), qué variables tiene cada uno (`assetId`), cómo se rotulan
(`metaDe`), cuáles tienen historia (`series.historizadas()`), cómo se piden
(`series.punto`), qué está fuera de banda (`tipo.evaluarRiesgos`). Si para
pintar algo hace falta saber que la máquina es de vibraciones, ese algo va al
**tipo**, no a la vista. Es la misma regla que ya cumplen `InicioVibraciones`
y `Vibraciones3D` desde el Plan 40 F2.

**D2 · La lectura del historiador se hace agnóstica de máquina, una vez.**
`data/tanque/historia.js` pasa a `data/comunes/historia.js` con la firma
`leerSerie(sistema, clave, rango)` / `leerSeries(sistema, claves, rango)`,
resolviendo el punto con `sistema.series.punto(clave)` y negándose
(`SIN_SERIE`) si `!sistema.esHistorizada(clave)`. Las reglas siguen en
`@shared/eva/comun/historia.js`; aquí sólo cambia **de dónde sale el nombre
del punto**. `useSeriesHistoricas` gana el `sistema` por parámetro. El
tanque, mientras exista, pasa el suyo: no se rompe.

**D3 · El «activo» de una máquina configurada es su `asset`.** Las pestañas
del Detalle son los `assets` de la configuración que tengan al menos una
variable; el rótulo es su `nombre` (los apoyos ya lo tienen desde el Plan 41
F1) o su `id`. No hay agrupación escrita a mano: si la máquina se configuró
con cinco activos, son cinco pestañas. Las variables sin `assetId` van en una
pestaña «Sin activo» que sólo existe si hay alguna. **[?]** Si conviene una
pestaña «Todas» al frente: se decide en F2 mirándola con las 86 de
`vib-motor-03`.

**D4 · Una variable sin serie verificada se enseña, y dice por qué no tiene
gráfica.** La tarjeta muestra el valor en vivo siempre; la gráfica sólo si
`esHistorizada(clave)`; si no, un texto corto con la causa que dejó el sondeo
cuando la haya (`sin-muestras`, `serie-compartida`…) y el enlace a
`Configuración`. Nunca una gráfica vacía ni un cero. Es §2.4 y §2.5 en
pantalla.

**D5 · Qué bandas de «Planta» sobreviven en una máquina cualquiera.** De las
cinco del tanque, tres son genéricas y dos son del tanque:

| Banda | En una configurada |
|---|---|
| Atención (fuera de banda ahora) | **Sí**: los riesgos activos del tipo, que `RiesgosVibracion` ya calcula |
| Señales con historia y su tendencia | **Sí**: las series verificadas, ordenadas por el tipo (**[?]** F1: ¿el tipo declara un orden o basta el de la configuración?) |
| Titular (el nivel y lo que lo mueve) | **Sólo si el tipo declara una señal principal** (`tipo.senalPrincipal`, un rol). Vibraciones no tiene una cifra que resuma el motor como el nivel resume el tanque; sin ella, no hay titular y la banda no aparece |
| Estado de las señales y márgenes | **Sí**: valor evaluado contra los umbrales del tipo, para todas las variables con rol de medida |
| Recorrido (topología de activos) | **No aquí**: es del tipo (`Vibraciones3D` ya enseña el tren de rotor). Queda fuera de este plan |

**D6 · Dónde viven las vistas nuevas en el menú.** `maq-planta` entra en la
sección de cada máquina configurada; `maq-detalle` va **sin `nav`**, como
`eva-detalle`, y se llega desde el botón «Detalle» de Planta y desde la ficha
de un activo en la Vista 3D, con `params.activo`. **[?]** Si `maq-planta`
sustituye a «Gráficas» o convive con ella: «Gráficas» enseña las bandas ISO y
las vigilancias, que son del tipo; se decide en F1 con las dos delante. La
recomendación de partida es **convivir** y renombrar «Gráficas» a lo que es
(«Estado mecánico»), porque hoy su nombre promete lo que Planta va a dar.

**D7 · Los casos previos y el aprendizaje del tanque se retiran de la
semilla, no se pierden.** La semilla de casos (13) pasa a ser una fixture de
pruebas; el índice arranca vacío y se llena con los casos cerrados sobre
máquinas configuradas. `datos/aprendizaje.json` es estado del despliegue y no
está versionado: se documenta cómo vaciarlo, no se toca desde el repo. Los
embeddings de casos se regeneran solos.

## 3. Las fases

### F0 — Inventario y la regla nueva

**Objetivo.** Dejar escrito qué se borra ya, qué se sustituye y qué espera al
tipo, y que CLAUDE.md y HANDOFF digan la regla de esta rama.

**Cómo.** Recorrer los 32 archivos fuera de `tanque/` que lo importan y
clasificar cada acoplamiento: **(a)** se resuelve con D2 (lectura agnóstica),
**(b)** es del motor y espera a B2/Plan 43, **(c)** es de una vista del tanque
que se va a borrar. Listar los candidatos a código muerto de §0 con la
comprobación de que nadie los importa (`grep` + `verificar-bundle`).

**Criterios de aceptación.**
- [ ] Tabla de los 32 acoplamientos con su letra, en este plan.
- [ ] CLAUDE.md §1 y HANDOFF §1 con la regla de §1 de este plan.
- [ ] Lista de borrado de F5 cerrada, con la evidencia de «nadie lo importa».

### F1 — La lectura del historiador y la «Planta» genérica

**Objetivo.** `maq-planta`: la máquina configurada de un vistazo, con sus
tendencias.

**Cómo.**
1. D2: `data/comunes/historia.js` y `useSeriesHistoricas(sistema, claves,
   rango)`. El tanque sigue funcionando pasando el suyo (sus pruebas omitidas
   no se tocan todavía).
2. `views/maquina/PlantaMaquina.jsx` con las bandas de D5, sobre los tiles que
   ya existen (`tiles.jsx`), pasándoles datos derivados del `sistema` y no del
   modelo del tanque. Lo que un tile necesite «saber» del tanque se generaliza
   en el tile o se deja fuera; no se copia el tile.
3. Ruta `maq-planta` por máquina configurada, en su sección.
4. Decidir **[?]** de D5 (orden de las señales con tendencia) y de D6
   (convivencia con «Gráficas»), mirándolas con `vib-motor-03` real.

**Riesgos.** `tiles.jsx` son 1243 líneas escritas para el tanque; el riesgo es
acabar con `if (esTanque)` dentro. La regla: si un tile no se puede alimentar
desde `sistema` + `tipo`, se escribe uno nuevo y pequeño, y el viejo se borra
en F5 con la vista del tanque.

**Criterios de aceptación.**
- [ ] `leerSerie(sistema, clave, rango)` se niega con `SIN_SERIE` para una
      clave no verificada, y para la verificada pide `sistema.series.punto`.
      Probado con una configurada del falso.
- [ ] `PlantaMaquina` con `vib-motor-03` contra planta: tendencias de las
      series verificadas, atención con los riesgos del tipo, sin titular
      (vibraciones no declara señal principal), sin un solo `if` por máquina.
- [ ] Ningún `import` de `data/tanque/` ni `domain/senales.js` en lo nuevo.
- [ ] Pruebas: la vista con una máquina de dos activos y series verificadas
      a medias; una máquina sin ninguna serie verificada enseña el motivo y
      no una gráfica vacía.

### F2 — El «Detalle» genérico

**Objetivo.** `maq-detalle`: pestañas por activo, una tarjeta por variable con
su gráfica real, rango y CSV, para cualquier máquina configurada.

**Cómo.** `useDetalleMaquina(sistema, maquina, assetId, rango, enVivo)` en
`data/comunes/`, con la misma forma que `useDetalleActivo` pero recorriendo
`maquina.assets` y `variables` (D3), y `historiaReal: null` cuando no hay
serie verificada (D4). `views/maquina/DetalleMaquina.jsx` sobre `DetalleGrid`,
`GraficaComparada`, `SelectorRango` y `PanelProcedencia` tal cual. Botón
«Detalle» en `PlantaMaquina` y «Ver detalle completo» en la ficha de un apoyo
de `Vibraciones3D`. Decidir **[?]** de D3 (pestaña «Todas»).

**Criterios de aceptación.**
- [ ] Con `vib-motor-03`: una pestaña por activo con variables; las 78
      verificadas con gráfica; las 8 sin verificar con su causa y sin gráfica.
- [ ] Rango vivo / ayer / semana / personalizado y CSV funcionan igual que en
      el tanque, y los de la URL (`params`) sobreviven a recargar.
- [ ] El contexto de vista para el asistente (`declararContextoDeVista`) lleva
      `sistema` y `activo`, para que «¿cómo va este apoyo?» llegue al apoyo.
- [ ] Pruebas espejo de las que hoy tiene `DetalleActivo`, sobre una
      configurada del falso.

### F3 — Casos previos y aprendizaje

**Objetivo.** Que «Casos previos» y el aprendizaje sean de las máquinas
configuradas, y que la semilla del tanque deje de viajar en el código (D7).

**Cómo.** La semilla de `casos` pasa a fixture de pruebas; el índice arranca
vacío; los verificadores que la usan (`verificar-casos`, `verificar-diagnostico`
y los del asistente) la cargan explícitamente. Documentar en HANDOFF cómo
vaciar `datos/aprendizaje.json` en un despliegue. Comprobar que el motor de
diagnóstico con cero casos puntúa `casos: 0` y lo dice, no que falla.

**Criterios de aceptación.**
- [ ] Ningún caso del tanque en el índice de un backend recién arrancado.
- [ ] `diagnostico` sobre `vib-motor-03` con el índice vacío: causas ordenadas
      por reglas y manuales, «sin casos previos» explícito.
- [ ] Los verificadores que dependían de la semilla siguen en verde con la
      fixture.

### F4 — Retirar las vistas del tanque y sus pruebas

**Objetivo.** Borrar lo que F1 y F2 sustituyen.

**Cómo.** `views/tanque/PlantaTanque.jsx` y `DetalleActivo.jsx`,
`data/tanque/detalleActivo.js` e `historia.js` (ya sustituido por D2), sus
rutas (`eva-planta`, `eva-detalle`) y las pruebas `.skip` que sólo ellas
justificaban. Las otras cuatro vistas del tanque (Inicio, Riesgos, Controles,
Maqueta 3D) **[?]**: se borran si el usuario confirma que el tanque entrará
por configuración con vistas genéricas (Plan 43 D-vistas), o se quedan
cerradas hasta entonces. Se decide aquí, no antes.

**Criterios de aceptación.**
- [ ] Las 29 pruebas omitidas: cada una borrada (con la vista que probaba) o
      reescrita sobre la vista genérica. Ninguna queda en `.skip` sin dueño.
- [ ] `verificar-bundle` en verde con el `index` **más pequeño** que antes, y
      la cifra anotada.

### F5 — Código muerto

**Objetivo.** Borrar lo que ninguna máquina, configurada o no, usa.

**Lista de partida** (se cierra en F0): `features/data/`; `scripts/plc_opcua.py`;
el módulo de Predicción entero si el usuario lo confirma (**[?]**: hoy oculto,
«no se usa en esta demo, para ningún rol»); las puertas de `domain/*.js` cuyo
único consumidor se haya borrado; los `omitir()` de `verificar-herramientas`
cuyo motivo desaparezca; CSS y textos de i18n huérfanos (`verificar-textos` e
`i18n` los cazan).

**Lo que NO entra aquí**, para que nadie lo borre «de paso»: `shared/eva/tanque/`
(Plan 43), `REGLAS_TANQUE` y el `switch` del motor (B2, con el tipo),
`narrarEstadoTanque` (ídem), el transporte falso del tanque (lo usa la puerta
§5.1 mientras el tipo no exista).

**Criterios de aceptación.**
- [ ] Cada borrado con su evidencia en el commit: «nadie lo importa» o «lo
      importaba X, borrado en F4».
- [ ] Lint, types, `npm run verificar`, las dos suites y la puerta §5.1 en
      verde. Los conteos nuevos en HANDOFF §1 y §9.

## 4. Riesgos

- **Generalizar copiando.** El atajo es duplicar `PlantaTanque` y cambiar
  nombres. Cada `if (sistema.id === …)` en una vista genérica es una máquina
  #3 que no entra sin tocar código. Se caza en revisión y con la prueba de
  «dos activos, series a medias».
- **Borrar antes de sustituir.** F4 va después de F1 y F2, y F5 después de
  F0. El orden es el plan.
- **Perder conocimiento con las vistas del tanque.** Las cabeceras de esas
  vistas explican decisiones de diseño (las tres versiones del layout de
  detalle, el ritmo de la rejilla). Lo que siga valiendo se copia a la
  cabecera de la vista genérica antes de borrar.
- **El historiador de planta.** Las tendencias reales dependen de lo que el
  Hyper Historian sirva ese día (B14). La vista tiene que enseñar el hueco
  como hueco, no como una línea a cero.

## 5. Lo que este plan NO hace

- No convierte el tanque en máquina configurada ni escribe su tipo (Plan 43).
- No toca el motor de diagnóstico ni el asistente, salvo el contexto de vista.
- No añade dependencias.
- No rehace la Vista 3D ni el recorrido/topología: son del tipo.
