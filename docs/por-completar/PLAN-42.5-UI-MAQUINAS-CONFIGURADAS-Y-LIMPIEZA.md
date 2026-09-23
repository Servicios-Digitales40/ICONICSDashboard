# PLAN 42.5 — La UI acompaña a las máquinas configuradas, y se limpia lo que ya no sirve

**Estado:** F0–F3 completadas · F4–F5 por completar, **refinadas el 22-09-2026 (noche)** tras leer el código que suponían (D8–D14, §3.6) · escrito el 22-09-2026
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

### Decisiones añadidas en la revisión del 22-09-2026 (noche), tras la F0

Salen de leer el código que F1 y F2 dan por hecho. Cada una corrige una
suposición del plan original que **no era cierta**.

**D8 · La fuente en vivo de una máquina configurada gana la forma común y
el búfer; no se escribe un tercer motor de sondeo.** `createFuenteDeMaquina`
(`data/comunes/fuenteDeMaquina.js`) hoy sólo entrega el dominio de
vibraciones (`canales`, `variador`, `alarmas`): **ni una lectura por
variable, ni `receivedAt`, ni búfer de sesión**. Una tarjeta genérica
necesita las tres cosas. Se añaden a la misma instantánea —`estado =
sistema.estado(valorDe, registro, lastUpdated)` (la forma común de
`estadoMaquina.js`), `buffer` (`createBufferRodante`, el mismo del tanque) y
`leerSerie`/`leerSeries` atados a esa máquina— y `subscribeVibracion` sigue
igual. Es la regla del backlog F2: **un motor por máquina, y la unificación
es del código, nunca del lote**. El atajo descartado es un `useEstadoDeMaquina`
que abra su propio `pollingEngine`: serían dos motores sobre los mismos 86
puntos cada vez que Planta y el banner estén montados a la vez.

**D9 · La tarjeta del Detalle recibe la forma común, adaptada en dominio.**
`TarjetaVariable` (`components/detalle/DetalleGrid.jsx`) está escrita contra
la señal del tanque (`key`, `tag`, `historizado`, `escala`, `tipo:
"booleano"`, `etiquetas`, `subirEsBueno`); la forma común trae `clave`,
`label`, `banda`, `estado`, `historia`. Ni se reescribe la tarjeta a medias
ni se le mete un `if`: una función **pura** en `shared/eva/comun/vistaDeMaquina.js`
—`variablesDeActivo(sistema, maquina, estado, assetId)`— produce lo que la
tarjeta espera a partir de `metaDe`, `tipo.bandaDe(rol)` y la variable
configurada, y se prueba en Node sin React. El tanque **no** pasa por ella
mientras exista: su `detalleActivo.js` ya compone esa forma.

**D10 · Una configurada en origen simulado también tiene historia
simulada.** No existe `readSerie` para una configurada: sólo el tanque lo
tiene (`data/tanque/simulador.js`). Sin él, en «Simulado» toda gráfica
saldría vacía, y las pruebas de vista sin red no podrían enseñar una curva.
Se escribe **una vez**, genérico, en `lib/iconics/transporteSimulado.js`:
`readSerie(nombreDePunto, rango)` muestrea `modelo(nombre, ms)` hacia atrás
sobre la rejilla del rango, con la misma forma `{ datos, motivo, hasMore,
cobertura }` que el lector real. Es lo que el tanque hace con `valorEn`,
sin saber de qué máquina es el modelo. **La guarda `esHistorizada` se
aplica igual en simulado**: una variable sin serie verificada no dibuja nada
tampoco ahí, o la pantalla simulada prometería lo que la real no da.

**D11 · La causa del sondeo se persiste, con un campo, o no se enseña.**
D4 pide enseñar «la causa que dejó el sondeo» (`sin-muestras`,
`serie-compartida`…). Medido: `datos/maquinas.json` guarda `historyVerified`
y `historyVerifiedComo` en las 86 variables de `vib-motor-03`, y **`sondeo`
en ninguna** — la causa sólo viaja en la respuesta HTTP de la ficha y se
pierde al recargar. Dos salidas, y se elige la primera:

- **(elegida)** `crearVariable` declara `historyCausa: null` (el `causa` del
  sondeo) e `historyCompartidaCon: []`; `sondearSeries.mjs` los escribe
  junto a `historyVerified`; la ruta de la ficha los lee de ahí. Es un campo
  aditivo con valor por defecto: una configuración antigua sigue válida.
  Toca `backend/lib/`, no `backend/ia/`; el asistente no se entera.
- (descartada) la vista dice sólo «sin serie verificada» y enlaza a
  Configuración. Es honesto pero obliga a ir a otra pantalla y re-sondear
  para saber **por qué**, y el porqué ya se calculó una vez.

**D12 · Los componentes «que no saben de qué máquina son» sí sabían de una
fuente.** `SelectorRango` (el calendario con días con dato) y
`GraficaComparada` llaman a `useEvaSource()` —la fuente del tanque— y la
segunda además lee `SENALES[clave].escala`. Ganan lo que les falta **por
props**: `leerSerie` en el selector, `comparables: [{ clave, label, escala }]`
y `leerSeries` en la comparada. El tanque se los pasa desde `DetalleActivo`
hasta que F4 lo borre; la genérica se los pasa desde su fuente. Sin esto,
«reutilizar tal cual» habría metido la fuente del tanque dentro del Detalle
de una configurada.

**D13 · La banda de «lo que no se puede decir» entra en Planta.** Es la
cuarta cosa que `Vibraciones.jsx` ya deja clara en pantalla y el plan no
había recogido. `sistema.limitaciones` (`construirSistema.js`) ya redacta
las frases —series declaradas sin verificar, constantes, roles sin cubrir,
sensores sin leer—; Planta las enseña **tal cual, sin recalcular**, debajo de
las tendencias. Una pantalla de tendencias que no dice cuáles faltan invita a
leer 78 curvas como «todo el motor».

**D14 · «Gráficas» convive y se renombra; se decide ya, no en F1.** La
recomendación de D6 pasa a decisión: `maq-graficas` se queda —bandas ISO,
vigilancias, contadores son del tipo, no tendencias— y su rótulo pasa a
«Estado mecánico» en los dos idiomas. Es sólo i18n y evita que el menú
ofrezca dos entradas que suenan a lo mismo.

## 3. Las fases

### F0 — Inventario y la regla nueva · completada el 22-09-2026

**Objetivo.** Dejar escrito qué se borra ya, qué se sustituye y qué espera al
tipo, y que CLAUDE.md y HANDOFF digan la regla de esta rama.

**Cómo se hizo.** Un `grep` de todo `import` que apunte a una carpeta
`tanque/` (directo, `@shared/eva/tanque/…`, o a través de las puertas
`Demo-EVA/domain/*.js`), sobre `shared/`, `backend/`, `react-dashboard/src/` y
`scripts/`, mirando después **para qué** usa cada archivo lo que importa. Los
candidatos a código muerto se comprobaron buscando quién los importa fuera de
pruebas, y se corrieron `verificar-textos` y `verificar-i18n` para saber si hoy
hay textos huérfanos.

**Lo que salió distinto de lo previsto.**

- **No son 32 archivos, son 34 de código** (más 30 de pruebas y 13 guiones).
  Tres de los que el `grep` encuentra sólo citan al tanque **dentro de un
  comentario** (`hallazgos.js`, `AvisosEva.jsx`, `BandejaEva.jsx`: el import
  se dejó comentado al cerrar la rama) y no cuentan.
- **Hacen falta cuatro letras, no tres.** Hay un grupo que no es (a), (b) ni
  (c): código que **vive en `tanque/` pero no es del tanque**. `estado.js`
  (`ESTADOS`, `estadoInfo`, `pideAtencion`, `ESTADOS_ORDEN`) son las claves de
  la forma común y las usan `Vibraciones3D`, `piezas.jsx`, el 3D de los dos y
  el backend; `toBooleano` de `sistema.js` es una utilidad. Se marcan **(d)**:
  se mueven a `shared/eva/comun/` cuando toque —en F1/F2 si lo nuevo los
  necesita, o en el Plan 43— y **no se borran con el tanque**.
- **La «capa de datos del tanque» son dos cosas, y sólo una es de este plan.**
  La lectura del historiador (`data/tanque/historia.js`) es (a) y la resuelve
  D2. La **fuente en vivo** —`EvaProvider` + `evaSource` + `useSistemaAgua` en
  `hooks.js`, con el simulador `data/tanque/simulador.js`— es lo que
  `construirSistema` + `fuenteDeMaquina` sustituyen **el día que el tanque
  entre por tipo**: la consumen `App.jsx`, `LatidoMuro`, `ContextoDeMaquina`,
  `AlarmasEva`, `CierreDiagnostico`, `MuroPlanta` y `TurnoEva`. Es (b), no
  (c): borrarla en F4 exigiría reescribir siete consumidores comunes que no
  están en el alcance de este plan.
- **`eva-alarmas` sigue en el menú** (`nav`, «sec-planta»), y `AlarmasEva` es
  del tanque por dentro: filtra por `ACTIVO_IDS` y lee `useSistemaAgua`. Es
  la única vista del tanque que la rama no cerró. Va a F4 **[?]** junto con
  las otras cuatro.
- **`plc_opcua.py` ya tiene una decisión anterior en contra de borrarlo.** El
  Plan 17 (auditoría) lo dejó por escrito: «herramienta de banco de pruebas;
  correcto, y así se queda». Pasa a F5 como **[?]** para el usuario, no como
  borrado cerrado.

#### Los 34 acoplamientos

Letras: **(a)** lo resuelve D2 o una vista genérica (F1/F2) · **(b)** es del
motor, del asistente o de la fuente en vivo del tanque y espera a B2/Plan 43 ·
**(c)** es de una vista del tanque que se borra en F4 · **(d)** no es del
tanque, vive ahí por historia; se mueve a `comun/`, no se borra.

| # | Archivo | Qué importa del tanque | Para qué | Letra |
|---|---|---|---|---|
| 1 | `shared/eva/comun/sistemas.js` | `senales`, `simulador`, `estadoTanque` | La entrada `tanque` del registro, escrita a mano | (b) |
| 2 | `backend/ia/conversacion/herramientas.mjs` | `SENALES`, `SENAL_KEYS`, `ACTIVOS` | Índice de `resolverSenal`, `catalogoBreve()`, respaldo de `catalogo()` (B3) | (b) |
| 3 | `backend/ia/herramientas/documentacion/index.mjs` | `SENALES`, `historizadas`, `senalInfo`… | Rótulos y claves por defecto de `resumen_documentado` | (b) |
| 4 | `backend/ia/herramientas/historicos/index.mjs` | `SENALES`, `esHistorizada`, `pointName`… | Respaldo del tanque en `historia_de_senal` / `generar_reporte` | (b) |
| 4′ | ídem | `ESTADOS`, `estadoInfo` | Etiqueta humana del estado común | (d) |
| 5 | `backend/ia/herramientas/lib/maquina.mjs` | `evaluarRiesgos` | El `switch` de `evaluarRiesgosDe` (B2) | (b) |
| 6 | `backend/ia/herramientas/maquina/index.mjs` | `toBooleano` | Leer la confirmación de un accionamiento | (d) |
| 7 | `backend/ia/i18n/narrarEstadoTanque.mjs` | `ACTIVO_IDS`, `SENALES` | Narrar el tanque. Fuera de F5 por decisión del plan | (b) |
| 8 | `backend/ia/motor/diagnostico.mjs` | `REGLAS_TANQUE` | Reglas por máquina del motor | (b) |
| 9 | `backend/iconics/fakeClient.mjs` | `SENALES`, `parsePointName`, `mediaDelTramo`… | El transporte falso del tanque, que usa la puerta §5.1 | (b) |
| 10 | `Demo-EVA/data/comunes/EvaProvider.jsx` | `createTransporteEva` (simulador) | La fuente en vivo del tanque en origen simulado | (b) |
| 11 | `Demo-EVA/data/comunes/evaSource.js` | `leerSerie`/`leerSeries` de `historia.js` | Quién lee el pasado según el transporte | (a) |
| 11′ | ídem | `createSistema`, `SENAL_KEYS`, `TODOS_LOS_PUNTOS` | El sondeo en vivo de las ocho señales | (b) |
| 12 | `Demo-EVA/data/comunes/hooks.js` | `VENTANA` de `historia.js`; `useSeriesHistoricas` | Las series para las gráficas | (a) |
| 12′ | ídem | `SISTEMA_VACIO`, `SENAL_KEYS` | `useSistemaAgua` | (b) |
| 13 | `Demo-EVA/data/comunes/alarmas.js` | `leerSerie` | Historial de una alarma por el historiador | (a) |
| 13′ | ídem | `ALARMAS`, `SENALES`, `pointName` | El catálogo de alarmas del tanque y su activo | (b) |
| 14 | `Demo-EVA/domain/senales.js` | puerta | 8 consumidores de código (abajo) | muere con su último consumidor |
| 15 | `Demo-EVA/domain/activos.js` | puerta | `MaquetaHero`, `layout.js`, `AlarmasEva`, `useDominio` | ídem |
| 16 | `Demo-EVA/domain/riesgos.js` | puerta | `CierreDiagnostico`, `MuroPlanta` | ídem |
| 17 | `Demo-EVA/domain/sistema.js` | puerta | `evaSource`, `hooks` | ídem |
| 18 | `Demo-EVA/domain/estado.js` | puerta | 5 consumidores, tres de vibraciones | (d): apunta a `comun/` cuando `estado.js` se mueva |
| 19 | `app/routes/routes.jsx` | 6 vistas de `views/tanque/` | Las rutas `eva-*` sin `nav` (y `eva-detalle`) | (c) |
| 20 | `app/layout/Sidebar.jsx` | `RAIZ` | El pie de la barra enseña la raíz de la instalación | (a): sale del registro o de las máquinas configuradas, no del catálogo del tanque |
| 21 | `i18n/useDominio.js` | `senalInfo`, `activoInfo` | `senal(clave)`, `activo(id)`, `unidad(clave)` para las vistas del tanque | (a)/(c): las genéricas rotulan con `sistema.metaDe`; estas funciones mueren con las vistas del tanque |
| 21′ | ídem | `estadoInfo` | `estado(key)` | (d) |
| 22 | `i18n/useProsa.js` | `senalInfo` | Decimales de una señal en la prosa | (a)/(c), igual que 21 |
| 23 | `Demo-EVA/components/detalle/GraficaComparada.jsx` | `historizadasMedidas`, `SENALES[clave].escala` | Qué señales se pueden comparar y a qué escala | (a): F2 lo alimenta desde `sistema` |
| 24 | `Demo-EVA/components/detalle/piezas.jsx` | `estadoInfo` | El color/texto de la banda de una tarjeta | (d) |
| 25 | `Demo-EVA/lib/modelo.js` | `historizadasMedidas`, `pideAtencion` | `buildModeloEva`, el modelo del tanque para los tiles | (c) con `PlantaTanque`; `delta()` es genérico y lo usan `tiles.jsx` y `detalleActivo.js` |
| 26 | `Demo-EVA/three-d/components/FichaActivo.jsx` | `historizadasMedidas`, `pideAtencion` | Ficha de un activo en la maqueta del tanque | (c) **[?]** F4 |
| 27 | `Demo-EVA/three-d/components/MaquetaHero.jsx` | `ACTIVO_IDS` | Colocar los 4 activos | (c) **[?]** F4 |
| 28 | `Demo-EVA/three-d/lib/layout.js` | `ACTIVO_IDS` | Posiciones de los 4 activos | (c) **[?]** F4 |
| 29 | `Demo-EVA/three-d/lib/comportamiento.js` | `estadoInfo` | Color 3D de un estado; lo usan los dos 3D | (d) |
| 30 | `Demo-EVA/views/comunes/AlarmasEva.jsx` | `ACTIVO_IDS` (+ `useSistemaAgua`) | Chips por activo del tanque | (c) **[?]** F4: es del tanque y sigue en el menú |
| 31 | `Demo-EVA/views/comunes/AssetsEva.jsx` | `RAIZ` | Raíz por defecto del explorador | (a): la raíz de la instalación, no del tanque |
| 32 | `Demo-EVA/views/comunes/CierreDiagnostico.jsx` | `evaluarRiesgos`, `REGLAS_TANQUE` | Dos `sistemaId === "tanque"` | (b): el tipo declara `evaluarRiesgos`/`REGLAS` |
| 33 | `Demo-EVA/views/comunes/MuroPlanta.jsx` | `evaluarRiesgos` (+ `useSistemaAgua`) | El muro del tanque; sin ruta desde el cierre | (c) **[?]** F4 |
| 34 | `Demo-EVA/views/vibraciones/Vibraciones3D.jsx` | `ESTADOS_ORDEN` | Ordenar la leyenda de estados | (d) |

**De segundo orden** (no importan al tanque, importan a quien lo importa):
`app/LatidoMuro.jsx` y `app/layout/ContextoDeMaquina.jsx` (`useSistemaAgua`,
(b)), `TurnoEva.jsx` (`alarmas.js`, (b)), `components/tiles.jsx` (`delta` de
`modelo.js`, genérico).

**Las 30 pruebas y los 13 guiones** no se clasifican uno a uno: una prueba va
con lo que prueba. Las que importan `views/tanque/` (12 archivos: `planta-simulada`,
`detalle-*`, `selector-rango`, `inicio-simulada`, `controles`, `riesgos-*`,
`edad-dato-controles`, `prosa-del-dominio`, `riesgos-vocabulario`,
`accesibilidad`) **no están omitidas**: corren contra el simulador, y en F4 se
borran con la vista o se reescriben sobre la genérica. Las 29 omitidas
(8 bloques `.skip` en 7 archivos) son del Topbar, Alarmas en vivo, Bandeja,
Casos RAG, estado en URL y Turno: dependen de la **fuente en vivo** (b), no de
Planta/Detalle, así que F4 no las cierra todas; las que queden llevan
«para reabrir: Plan 43». De los guiones, 6 `verificar-*` y `generar-historia-simulada`
usan el catálogo del tanque para probar el falso, el motor y las herramientas
(b); los 5 `sondear-*`/`medir-*` son instrumentos contra planta y no se tocan.

#### Lo que sustituye a las vistas del tanque ya existe

`fuenteDeMaquina.js` (`createFuenteDeMaquina`, `fuenteDeMaquinaConfigurada`),
`MaquinaContext.jsx` (`useMaquina`), `maquinasEnVivo.js` y
`data/vibraciones/vibracion.js` (`useDominioVibracion`) son la capa de datos
que ya usan las cuatro vistas de vibraciones. F1 y F2 se construyen sobre
**eso**, no sobre `hooks.js`. Los componentes de presentación del Detalle
(`DetalleGrid`, `PanelProcedencia`, `SelectorRango`) no importan nada del
tanque; `GraficaComparada` y `piezas.jsx` sí (23, 24).

#### Lista de borrado de F5, cerrada

| Qué | Líneas | Evidencia | Decisión |
|---|---|---|---|
| `features/data/` (3 componentes, 4 vistas, índice) | 912 | Ningún `import` fuera de la carpeta; sólo lo citan comentarios de `routes.jsx` y `lib/iconics/index.js`, que se actualizan. `lib/iconics` sigue vivo: 11 consumidores | **Se borra** |
| `modulos/prediccion/` (6 vistas) | 1295 | Sólo lo importa `routes.jsx` (6 rutas sin `nav` desde el 22-09). Arrastra: `lib/queryClient.js` + `QueryClientProvider` en `App.jsx` (`@tanstack/react-query` lo usa también `ExploradorAssets`, así que la dependencia se queda), `VITE_PREDICTION_API_BASE` en `.env.local`, la entrada `prediccion` de `shared/modulos.js` y sus asertos en `verificar-modulos`, `sec-prediccion` en los dos `navigation.json` | **[?] usuario**: borrar el módulo entero o dejarlo oculto. Si se borra, el registro de módulos pierde su segundo ejemplo |
| `scripts/plc_opcua.py` | 188 | Nadie lo ejecuta ni lo cita salvo docs. El Plan 17 decidió conservarlo como banco de pruebas | **[?] usuario**: la decisión del Plan 17 está escrita; se borra sólo si la revoca |
| Puertas `domain/*.js` | 5 × ~13 | Ninguna huérfana hoy (tabla arriba). `pronostico.js`, `umbrales.js`, `vibraciones.js`, `riesgosVibracion.js` tienen consumidor y no son del tanque | Se borra cada una **cuando F4 le quite el último consumidor**; `estado.js` se reapunta a `comun/` |
| `omitir()` de `verificar-herramientas` (22) | — | El motivo es `CERRADA` (la fuente en vivo y las herramientas del tanque, (b)) | **Se quedan** hasta el Plan 43 |
| CSS y textos huérfanos | — | `verificar-textos` y `verificar-i18n` en verde hoy (1415 claves × 2 idiomas, paridad) | Nada que borrar hoy; se vuelven a correr tras F4 |
| Modelos 3D sólo del tanque (`Armario`, `Bomba`, `Columna`, `Valvula`, `Deposito`, `Bastidor`, `Tuberias`, `ActivoEnMaqueta`, `MaquetaHero`, `FichaActivo`, `lib/layout.js`) | 1868 | Sus únicos consumidores son `MaquetaTanque3D` e `InicioTanque`. `comportamiento.js`, `materiales.js` y `rotor.js` los comparten los dos 3D y se quedan | Van con F4 **[?]**, no con F5: son de una vista, no código muerto |

**Criterios de aceptación.**
- [x] Tabla de los acoplamientos con su letra, en este plan (34, no 32; y cuatro letras).
- [x] CLAUDE.md §1 y HANDOFF §1 con la regla de §1 de este plan.
- [x] Lista de borrado de F5 cerrada, con la evidencia de «nadie lo importa» y dos **[?]** para el usuario (Predicción, `plc_opcua.py`).

### F1 — La capa de datos genérica y la «Planta» de una máquina configurada

**Objetivo.** `maq-planta`: la máquina configurada de un vistazo, con sus
tendencias reales y con lo que no se puede decir dicho en pantalla.

**Por qué se reescribió esta fase (revisión del 22-09).** El plan original
suponía que bastaba con «pasar el `sistema`» al lector del historiador y a
los tiles. Leído el código, faltan tres piezas que nadie había escrito: la
fuente de una configurada no entrega lecturas por variable ni búfer (D8), no
hay historia simulada para una configurada (D10) y los tiles de Planta
(`tiles.jsx`, 1243 líneas) reciben el modelo del tanque (`buildModeloEva`) en
todas sus bandas. La fase se parte en pasos con su propia prueba, y **el
primer commit no pinta nada**: deja la capa de datos lista y probada.

**Pasos.**

1. **`data/comunes/historia.js`** (D2). `leerSerie(sistema, clave, rango, {
   crudo })` y `leerSeries(sistema, claves, rango)`: la misma mecánica de
   `data/tanque/historia.js` —`resolverRango`, `enRango`, `cobertura`,
   lotes de `MAX_SERIES_BATCH`, concurrencia acotada— cambiando **sólo** de
   dónde sale el nombre del punto (`sistema.series.punto(clave)`) y la
   guarda (`sistema.esHistorizada(clave)` → `SIN_SERIE`; clave que
   `sistema.metaDe` no conoce → «Señal desconocida»). `rangoAyer`,
   `rangoSemana` y `rangoPersonalizado` se mudan aquí: son reloj de pared,
   no son del tanque. **`data/tanque/historia.js` pasa a ser una puerta**
   que fija `SISTEMA.tanque` como primer argumento y reexporta lo demás, para
   que `evaSource`, `alarmas.js`, `hooks.js` y sus 7 archivos de prueba
   sigan iguales hasta F4. Se comprueba **antes de escribir** que
   `SISTEMA.tanque.series.punto(clave)` devuelve lo mismo que
   `puntoHistorico(clave)` para las 52 claves (una prueba en Node).
2. **Historia simulada genérica** (D10). `readSerie(nombre, rango)` en
   `lib/iconics/transporteSimulado.js`, muestreando `modelo(nombre, ms)`.
   Respeta `hasMore: false`, `cobertura.completa: true` y deja `motivo`
   cuando `modelo` devuelve `undefined` («no es de esta máquina»). Se
   ofrece **sólo si el transporte es simulado**; el real no lo tiene y
   `leerSerie` cae al historiador, igual que hoy en `evaSource`.
3. **La fuente gana la forma común** (D8). En `createFuenteDeMaquina`: el
   `registro` (`construirSistema`) se construye una vez; `instantanea()`
   añade `estado` (forma común con `senales[]`, `sinLectura`, `recuento`),
   `lecturaDe(clave)` → `{ valor, receivedAt, stale, motivo }`, y la fuente
   expone `buffer` (`createBufferRodante` por clave, alimentado en
   `onUpdate`) y `leerSerie`/`leerSeries` ya resueltos por transporte.
   `subscribeVibracion` no cambia de forma: las cuatro vistas de
   vibraciones siguen verdes sin tocarlas.
4. **Hooks genéricos**, en `data/comunes/`: `useEstadoDeMaquina()` →
   `{ sistema, maquina, estado, buffer, lastUpdated, loading, error }` a
   partir de `useMaquina().{registro, configurada}` y la fuente; y
   `useSeriesDeMaquina(claves, rango)` con el **mismo contrato** que
   `useSeriesHistoricas` (`porClave`, `metaPorClave`, `filas`, `cobertura`,
   `hasMore`, `loading`, `error`) pero leyendo de la fuente de la máquina.
   `unir()` y `claveRango()` se extraen de `hooks.js` a un módulo sin React
   para no copiarlos. Sin máquina en contexto devuelven la forma vacía y
   `loading: false`, nunca lanzan (mismo criterio que `useMaquina`).
5. **`views/maquina/PlantaMaquina.jsx`** con **tiles nuevos y pequeños** en
   `components/maquina/` sobre `base.jsx` (`Card`, `Cifra`, `Spark`,
   `PuntoEstado`), `paleta.js` y `piezas.jsx` (`GraficaHistoria`,
   `GraficaAusente`). No se importa `tiles.jsx`: sus ocho componentes leen
   el modelo del tanque y el riesgo del `if (esTanque)` es real. Bandas, de
   arriba abajo:
   - **Atención**: `tipo.evaluarRiesgos(dominio).activos` (lo que ya calcula
     `useMaquinasEnVivo`), con botón a `cierre-diagnostico`.
   - **Señales con historia**: las claves de `sistema.series.historizadas()`
     cuyo `metaDe(clave).naturaleza === "medida"`, cada una con sparkline
     del historiador (`VENTANA`) y su delta; orden: el de `tipo.canales`
     por `assetId`, y dentro, el orden de `tipo.roles`; lo que no cuelga de
     un apoyo, al final en orden de configuración. **Es la respuesta al
     [?] de D5**: el tipo ya declara un orden por apoyo; no hace falta un
     campo nuevo.
   - **Estado de las variables**: cada `senal` de la forma común con su
     `estado` y, si `tipo.bandaDe(rol)` existe, la barra contra la banda.
     Sin banda declarada, sólo el valor: **no se inventa una escala**.
   - **Tendencias**: las mismas series con escala propia, `cobertura` y
     `metaPorClave` (hueco es hueco, B14).
   - **Lo que no se puede decir** (D13): `sistema.limitaciones` tal cual.
   - Sin titular: vibraciones no declara `senalPrincipal`. La banda existe en
     el código sólo si `tipo.senalPrincipal` está definido; hoy no lo está
     en ningún tipo y no se añade.
6. **Ruta y menú.** `maq-planta` con `porMaquina: { icon, apartado:
   "visualizacion" }` **detrás de `maq-inicio`** (que conserva
   `iconoSeccion`). i18n `routes.maq-planta.{title,nav,sub}` en es/en.
   `maq-graficas` se renombra «Estado mecánico» (D14). Botón «Entrar» de
   `InicioVibraciones` **no cambia**: sigue a Estado mecánico; Planta se
   ofrece desde el menú y desde un segundo botón del Inicio.
7. **Contexto del asistente**: `declararContextoDeVista({ sistema:
   maquina.id })`, como hace Estado mecánico.

**F1a hecha (22-09-2026, noche): pasos 1–4, la capa de datos, sin nada visible.**
Lo que de verdad pasó, paso a paso:

1. `data/comunes/historia.js` recibe el `sistema`. La guarda de «señal
   desconocida» no puede usar `metaDe` como decía el plan: la entrada del
   tanque en el registro **no lo tiene**; se usa `claves()`, que sí existe en
   las dos. La puerta `data/tanque/historia.js` **no pasa `SISTEMA.tanque`**
   sino una vista del catálogo vivo (`Object.keys(SENALES)`, `esHistorizada`,
   `puntoHistorico`): dos pruebas del tanque dan de alta una señal sintética
   en el catálogo en caliente y el registro fija su lista al cargar. Con
   `SISTEMA.tanque` fallaban dos pruebas que esta rama no toca; con el
   catálogo, las 115 de los nueve archivos afectados pasan sin cambiar una
   línea. La equivalencia registro/catálogo en las 52 claves se afirma en
   `historia-generica.test.js`.
2. `readSerie(pointName, rango)` en `lib/iconics/transporteSimulado.js`:
   muestrea `modelo` hacia atrás, forma `{ datos, motivo, hasMore, cobertura }`,
   `undefined` del modelo → motivo «no es de esta máquina», `null` → hueco,
   y comparte latencia y `errorPeticion` con `read()`.
3. `createFuenteDeMaquina` construye el `sistema` una vez y añade `estado`
   (forma común) a la instantánea, más `buffer`, `lecturaDe`, `leerSerie`,
   `leerSeries` y `subscribe` (alias de `subscribeVibracion`, que no cambia).
   El búfer se alimenta con un `onUpdate` interno, no por suscriptor. La
   guarda `motivoSinSerie` va antes en los dos caminos.
4. `useSeriesDe(lector, claves, rango)` es el efecto que era
   `useSeriesHistoricas`, con el lector por parámetro; `hooks.js` lo llama con
   `useEvaSource()` y `useEstadoDeMaquina.js` con la fuente de la máquina.
   `unir` y `claveRango` viven en `seriesUnidas.js`. `useEstadoDeMaquina()`
   devuelve `{ sistema, maquina, estado, buffer, lastUpdated, loading, error,
   fuente }` y una fuente que no se puede construir viaja en `error`, no lanza.

Pruebas nuevas: `historia-generica` (9), `transporte-simulado-serie` (7),
`fuente-de-maquina-estado` (5), `estado-de-maquina-hook` (7). Una trampa
encontrada al escribirlas: `lecturaDe` tras soltar el último suscriptor
devuelve «sin dato» porque el motor libera los puntos —es lo correcto
(`motor-por-sistema.test.js`)—, así que se lee dentro de la suscripción.

**F1b hecha (22-09-2026, noche): pasos 5–7, la «Planta» de una máquina
configurada.** Lo que de verdad pasó:

5. `views/maquina/PlantaMaquina.jsx` con tiles nuevos en
   `components/maquina/tilesMaquina.jsx` (banda de series con historia,
   estado de las variables con barra donde el tipo declara banda, tendencias
   con cobertura, limitaciones). La franja de atención reutiliza
   `TarjetaRiesgo` de `components/riesgoVibracion.jsx`: es la tarjeta con la
   que la vista de riesgos pinta un riesgo de una configurada y hoy es la
   única que hay. **Deuda anotada**: la tarjeta de riesgo la debería ofrecer
   el TIPO; `sin-literales-de-maquina.test.js` permite ese import por nombre
   y sólo ése. El orden de las series (**[?] de D5, cerrado**) es del tipo:
   por apoyo en el orden de `tipo.canales`, dentro por rol en el orden de
   `tipo.roles`, lo suelto al final; vive en
   `shared/eva/comun/vistaDeMaquina.js` (`clavesConTendencia`) y se prueba en
   Node. Sin titular, como preveía D5.
6. Ruta `maq-planta` detrás de `maq-inicio` (que conserva `iconoSeccion`),
   con `porMaquina` y apartado de visualización; i18n en es/en;
   `maq-graficas` renombrada «Estado mecánico» (D14). En el Inicio, un
   segundo botón «Entrar a Planta» y su tarjeta en la rejilla. **Hallazgo de
   paso**: las tarjetas del Inicio buscaban `vibration.views.<ruta>.frase`
   con los ids anteriores al Plan 40 (`eva-vibraciones`, `vib-3d`) y
   enseñaban la clave cruda; se renombraron a `maq-graficas`/`maq-3d` en los
   dos idiomas.
7. `declararContextoDeVista({ sistema: maquina.id })`; `useEstadoDeMaquina`
   gana `dominio` (`canales`, `variador`, `alarmas`) para que la vista pida
   `tipo.evaluarRiesgos` sin volver a la fuente.

Pruebas nuevas: `planta-maquina` (11, hooks doblados, fixture espejo con 36
de 73 verificadas), `planta-maquina-simulada` (2, red cortada),
`un-motor-por-maquina` (2: Planta + Estado mecánico abren UN `pollingEngine`;
al desmontar, los puntos se sueltan), `sin-literales-de-maquina` (uno por
archivo genérico), `vista-de-maquina-tendencias` (5). Cuatro pruebas
existentes que enumeran las rutas de máquina se actualizaron con
`maq-planta`, y el Topbar espera «Estado mecánico».

Dos correcciones que salieron de las pruebas: la primera versión del
ciclo de vida afirmaba `stats().corriendo === false` al desmontar, y el
motor no se para al soltar los puntos —los libera y la lectura vuelve a
«sin dato», que es la regla que ya afirmaba `motor-por-sistema.test.js`—;
y `estado?.senales ?? []` sin `useMemo` cambiaba de identidad en cada
render (lo cazó el linter de hooks).

**Riesgos y cómo se cazan.**

- *Generalizar copiando.* La prueba `sin-literales-de-maquina.test.js`
  (§3.6) falla si `views/maquina/`, `components/maquina/` o
  `data/comunes/historia.js` contienen `"tanque"`, `"vib-`, `nivelTanque` o
  `S1`/`S2`/`S3` como literales.
- *Dos motores por máquina.* Prueba del ciclo de vida (backlog F7, se
  escribe **aquí**, antes del segundo consumidor): montar `PlantaMaquina` y
  `EstadoMaquinaBanner` a la vez y afirmar `fuente.stats().ciclos` de una
  sola fuente; desmontar y comprobar que el motor para.
- *El historiador de planta ese día* (B14). La vista enseña
  `tramosConDato/tramos`; una prueba con `cobertura.completa: false` afirma
  el aviso y que la curva no une los bordes.
- *Romper el tanque al mover `historia.js`.* Los 7 archivos de prueba que
  hoy importan `data/tanque/historia.js` **no se tocan en F1** y tienen que
  seguir verdes con la puerta; si uno cae, la puerta está mal, no la prueba.

**Pruebas nuevas** (todas sin red; ver §3.6 para el patrón):
- `historia-generica.test.js` (Node): `SIN_SERIE` para una clave no
  verificada de la fixture espejo; `sistema.series.punto` en la petición;
  «Señal desconocida»; el recorte `enRango` en crudo; equivalencia con el
  tanque en las 52 claves.
- `transporte-simulado-serie.test.js` (Node): `readSerie` devuelve puntos
  crecientes en `t`, respeta el rango, `undefined` del modelo → `motivo`.
- `fuente-de-maquina-estado.test.js`: la instantánea trae `estado.senales`
  con una entrada por variable, `lecturaDe` con `receivedAt`, y el búfer
  crece con cada `onUpdate`.
- `planta-maquina.test.jsx` (mock del hook, patrón §3.3 del informe de F0):
  máquina con **dos activos y series verificadas a medias** → dos apoyos,
  sparkline sólo en las verificadas, `GraficaAusente` con el motivo en las
  otras; máquina **sin ninguna verificada** → la banda de tendencias enseña
  el motivo y ninguna gráfica; riesgo activo → franja de atención; sin
  máquina en contexto → texto de «elige una máquina», no un error.
- `planta-maquina-simulada.test.jsx` (punta a punta con red cortada,
  patrón §3.4): en «Simulado», las verificadas dibujan curva sin que
  `fetch` se llame.

**Criterios de aceptación.**
- [x] `leerSerie(sistema, clave, rango)` se niega con `SIN_SERIE` para una
      clave no verificada y pide `sistema.series.punto` para la verificada,
      probado con la fixture espejo en Node.
- [x] `data/tanque/historia.js` es una puerta de una función por export;
      `historia.test.js`, `hooks-historia.test.jsx`, `fuente.test.js`,
      `simulador.test.js`, `grafica-comparada.test.jsx`, `selector-rango.test.jsx`
      y `eva.live.test.js` **no cambian** y siguen verdes.
- [ ] `PlantaMaquina` con `vib-motor-03` contra planta (backend reiniciado):
      tendencias de las series verificadas, atención con los riesgos del
      tipo, limitaciones visibles, sin titular, sin un solo literal de
      máquina (la prueba lo afirma). **Pendiente de mirar en el navegador**:
      el backend que corre arrancó el 22-09 a las 11:44 y la autenticación
      está encendida; la comprobación manual queda para la sesión con la
      pantalla delante (HANDOFF paso 0). Lo que sí está afirmado por prueba:
      simulado punta a punta, y la fixture espejo con 36 de 73 verificadas.
- [x] En «Simulado», Planta dibuja curvas sin salir a la red (prueba con
      trampa de `fetch`).
- [x] Un solo motor de sondeo por máquina con Planta y «Estado mecánico» montados
      (`un-motor-por-maquina.test.jsx`).
- [x] Lint, types, `npm run verificar`, las dos suites; `verificar-bundle`
      con `index`/`vendor` anotados **antes y después** (la pila de gráficas
      va al trozo `charts`, que hoy no tiene presupuesto: se anota su cifra
      para que F4 tenga con qué comparar). **Tras F1:** `index` 351,3 KB / 450 (+5,8 KB: la capa de datos genérica entra en el arranque porque `fuenteDeMaquina` la importa) · `vendor` 269,1 / 330 (igual) · `charts` 326,4 (igual) · `PlantaMaquina` diferido, 11,5 KB.

**Se comitea en dos**: (a) pasos 1–4 con sus pruebas —capa de datos, nada
visible—; (b) pasos 5–7. Si (b) hay que revertir, (a) sigue siendo útil para
F2.

### F2 — El «Detalle» de una máquina configurada

**Objetivo.** `maq-detalle`: pestañas por activo, una tarjeta por variable
con su gráfica real, rango y CSV, para cualquier máquina configurada; y que
cada variable sin gráfica diga **por qué**.

**Pasos.**

0. **Persistir la causa del sondeo** (D11). `crearVariable` gana
   `historyCausa: null` e `historyCompartidaCon: []`; `sondearSeries.mjs`
   los escribe en cada rama (`sin-muestras`, `serie-compartida` con sus
   ids, `serie-propia`…) sin tocar `historyVerified` donde hoy no lo toca;
   la ficha (`maquinasRoutes`) los lee de la variable persistida. Pruebas:
   `configuracionMaquina` acepta una configuración vieja sin los campos;
   `verificar-sondeo-series` afirma la causa persistida por rama;
   `maquinas.test.mjs` afirma que la ficha la devuelve tras recargar.
   **Se comitea solo**: es backend y tiene su propia puerta.
1. **`variablesDeActivo(sistema, maquina, estado, assetId)`** en
   `shared/eva/comun/vistaDeMaquina.js` (D9): para cada variable con ese
   `assetId` (o sin ninguno, si `assetId === SIN_ACTIVO`), la forma que
   `TarjetaVariable` espera —`key`, `tag` (`pointName`), `label`, `unidad`,
   `decimales`, `banda`, `escala` (de `tipo.bandaDe(rol)` o `null`),
   `historizado` (`esHistorizada`), `historiaCausa`, `tipo`
   (`"booleano"` si el rol es bandera), `texto`, `naturaleza`, `punto`— y
   **sin `subirEsBueno`** (nadie lo declara para una configurada; la tarjeta
   ya lo trata como opcional). Las de `naturaleza: "alarma"` se excluyen,
   como hace el tanque. Pura y probada en Node con la fixture espejo.
2. **`useDetalleMaquina(assetId, rango, enVivo)`** en `data/comunes/`, la
   misma forma que `useDetalleActivo`: `activo`, `activos` (los
   `maquina.assets` con al menos una variable, más «Sin activo» sólo si hay
   alguna), `variables` con `historiaReal` (`null` si no verificada;
   `[]`+`historiaCargando` si sí), `historiaMotivo`/`historiaError`,
   `bufferVivo`, `deltaBuffer`, `historiaHasMore`, `historiaCobertura`.
   En «Tiempo real» lee del `buffer` de la fuente y no pide nada al
   historiador (claves vacías a `useSeriesDeMaquina`).
3. **Componentes compartidos ganan props** (D12): `SelectorRango` recibe
   `leerSerie`; `GraficaComparada` recibe `comparables` y `leerSeries`.
   `DetalleActivo` del tanque se los pasa desde `useEvaSource()` (un cambio
   de tres líneas, permitido por §1.2) para que sus pruebas sigan verdes
   hasta F4. La tarjeta muestra la causa persistida con un texto corto por
   `historyCausa` (i18n) y el enlace a Configuración; sin causa (máquina
   nunca sondeada) dice «sin sondear».
4. **`views/maquina/DetalleMaquina.jsx`**: copia la estructura de
   `DetalleActivo` —rango en el estado de la vista, `leerRangoDeUrl`,
   `parametrosDeRango`, `exportarTodo` con `armarCSVGeneral`— con
   `params.maquina` siempre presente en cada `onNavigate`. `leerRangoDeUrl`
   y `aFechaUrl`/`deFechaUrl` se extraen a `data/comunes/rangoEnUrl.js`
   para no copiarlos (el tanque los importa desde ahí hasta F4). Pestaña
   por defecto: el primer asset con variables, en el orden de
   `maquina.assets`. **[?] D3 «Todas»: NO.** Con `vib-motor-03` una
   pestaña «Todas» son 86 tarjetas y 78 series en un rango: dos lotes de
   `MAX_SERIES_BATCH` cada cambio de rango. Se anota la cifra y se deja
   fuera; si alguien la pide, se mide primero con el historiador real.
5. **Entradas**: botón «Detalle» en `PlantaMaquina` (`{ maquina, activo:
   primero }`); «Ver detalle completo» en la ficha de un apoyo de
   `Vibraciones3D` (`{ maquina, activo: apoyo.id }`). Ruta `maq-detalle` con
   `porMaquina: { oculta: true }`, el patrón de `maq-riesgos`.
6. **Contexto del asistente**: `{ sistema: maquina.id, activo, rango }`
   como `DetalleActivo`.

**F2 hecha (22-09-2026, noche).** Lo que de verdad pasó, paso a paso:

0. **La causa del sondeo se persiste** (D11), en un commit propio:
   `crearVariable` declara `historyCausa: null` e `historyCompartidaCon: []`,
   la ruta de sondeo los escribe junto al veredicto y `fusionarVariables` los
   conserva mientras la serie sea la misma. El esquema de entrada no cambió:
   no es `strict()`, descarta los campos del cliente y `crearVariable` los
   pone a su valor por defecto. Una configuración anterior sin los campos
   carga y construye igual (`verificar-maquinas`, 40). **Nota honesta sobre la
   puerta**: la suite de backend dio 398 verdes y un rojo en
   `salud.test.mjs` por tiempo agotado; corrido solo, también. Es la prueba
   que monta el puente con `ICONICS_API_BASE: https://planta.local/api` y
   `ICONICS_FAKE=false`, y su tiempo depende de la resolución de ese nombre
   en la red de quien la corre —es el «rojo de entorno» que HANDOFF §1 ya
   citaba y que en la línea base de esta noche no apareció. No toca nada de
   F2.0 y no se ha cambiado; queda en el backlog decidir si esa prueba debe
   depender del DNS.
1. **`variablesDeActivo` y `activosConVariables`** (D3, D9) en
   `shared/eva/comun/vistaDeMaquina.js`, con `SIN_ACTIVO`. Dos matices que
   salieron al escribirlo: en la forma común `banda` es el objeto de límites
   y `estado` la clave de color, y en la tarjeta es al revés —el adaptador lo
   traduce y una prueba lo afirma—; y un `assetId` que no está declarado en
   `assets` agrupa igual con su id, en vez de perderse.
2. **`useDetalleMaquina`** en `data/comunes/`, misma forma que
   `useDetalleActivo`; lee de la fuente de la máquina (`lecturaDe`, `buffer`,
   `leerSerie`) y en «Tiempo real» pasa claves vacías.
3. **`SelectorRango` y `GraficaComparada` ganan props** (D12): `leerSerie`;
   `comparables`, `leerSeries` y `seleccionInicial`. Sin ellas caen a la
   fuente del tanque por `useEvaSourceOpcional()` (nuevo, en `EvaProvider`),
   y el tanque las pasa desde `DetalleActivo`. Las cuatro pruebas del tanque
   que las montan siguen verdes sin cambiar. `DetalleGrid` rotula con
   `senal.label` cuando llega (una configurada) y enseña la causa persistida
   con el enlace a Configuración cuando no hay serie verificada.
4. **`DetalleMaquina.jsx`**, con el rango en URL extraído a
   `data/comunes/rangoEnUrl.js` (el tanque lo importa de ahí). **[?] D3
   «Todas»: NO.** `vib-motor-03` tiene 86 variables y 78 series verificadas;
   una pestaña «Todas» pediría 78 series por cambio de rango en dos lotes de
   `MAX_SERIES_BATCH`. Se anota la cifra y se deja fuera.
5. **Entradas**: botón «Detalle» en Planta; «Ver detalle completo de S1» en
   la ficha del apoyo seleccionado de la Vista 3D (sólo con una configurada).
   Ruta `maq-detalle` con `porMaquina: { oculta: true }`, delante de
   `maq-riesgos`.
6. **Contexto**: `{ sistema, activo, rango }`, como `DetalleActivo`.

Pruebas nuevas: `variables-de-activo` (12, Node), `detalle-maquina` (13:
pestañas, causa con enlace, rango en URL y de vuelta, `personalizado`
corrupto → vivo, exportar todo con procedencia, «Sin activo»),
`grafica-comparada-generica` (4: los dos componentes montados SIN
`EvaProvider`; si alguno volviera a exigir la fuente del tanque, lanza).
Las listas de rutas de dos pruebas existentes se actualizaron con
`maq-detalle`.

Hallazgo para F4: la fixture espejo rotula `S1` como «Lado acople»; el
nombre del asset es el rótulo de la pestaña, y las pruebas lo leen de la
configuración en vez de fijarlo.

**Riesgos y cómo se cazan.**

- *Una pestaña vacía o un activo fantasma.* Un asset sin variables no es
  pestaña (prueba). Un `params.activo` desconocido cae al primero, como el
  tanque con un `activo` corrupto (prueba).
- *El CSV de una configurada.* `armarCSVGeneral` recibe `senal` con
  `label`/`unidad` y `punto`: la nota de procedencia declara **una**
  máquina; se afirma que el archivo lleva `maquina.nombre` y el `hda:` de
  cada serie.
- *Ocho variables sin verificar dibujando una línea plana.* La prueba
  «serie no verificada → `GraficaAusente` con la causa y sin `<svg>`».

**Pruebas nuevas.**
- `variables-de-activo.test.js` (Node, fixture espejo con
  `verificadasDelCatalogo: true` y `false`): forma completa, exclusión de
  alarmas, «Sin activo», `escala` sólo con `bandaDe`.
- `detalle-maquina.test.jsx` (mock del hook): pestañas = assets con
  variables; tarjeta con gráfica sólo en verificadas; causa visible;
  `params.activo` desconocido → primera; cambio de pestaña conserva el
  rango en la URL; contexto de vista con `sistema` y `activo`.
- `detalle-maquina-rango.test.jsx`: `vivo`/`ayer`/`semana`/`personalizado`
  desde la URL y de vuelta; `personalizado` con fechas corruptas → `vivo`.
- `detalle-maquina-exportar.test.jsx`: CSV con procedencia de la máquina.
- Espejo de `selector-rango.test.jsx` y `grafica-comparada.test.jsx` con
  `leerSerie`/`comparables` por props (las del tanque siguen igual).
- Backend: las tres del paso 0.

**Criterios de aceptación.**
- [ ] Con `vib-motor-03` contra planta: una pestaña por activo con
      variables; las 78 verificadas con gráfica; las 8 sin verificar con su
      causa persistida y sin gráfica. **Pendiente de mirar en el navegador**
      (misma razón que F1: backend arrancado antes de estos cambios y
      autenticación encendida). Afirmado por prueba con la fixture espejo:
      36 de 73 verificadas con gráfica, las demás con su causa.
- [x] Rango vivo / ayer / semana / personalizado y CSV funcionan como en el
      tanque, y `params` sobreviven a recargar (`maquina` incluido).
- [x] `declararContextoDeVista` lleva `sistema` y `activo`.
- [x] Recargar el backend no pierde la causa del sondeo (prueba de ruta).
- [x] Ninguna prueba del tanque cambia salvo el paso de props en
      `DetalleActivo`; todas verdes.
- [x] Lint, types, verificadores, dos suites, `verificar-bundle` anotado. **Tras F2:** frontend **1188** verdes · 29 omitidas; backend 398 + el rojo de entorno de `salud.test.mjs` (B16); los 41 verificadores; puerta 190/22 y 71; bundle `index` 355,6 KB / 450 (+4,3 KB) · `vendor` 269,1 (igual) · `charts` 326,4 (igual) · `DetalleMaquina` diferido, 6,4 KB. El build cazó un re-export que faltaba en `rangoEnUrl.js` y que Vitest no vio: el build ES parte de la puerta.

### F3 — Casos previos y aprendizaje

**Objetivo.** Que «Casos previos» y el aprendizaje sean de las máquinas
configuradas, sin que el repositorio ni la pantalla den por hecho el tanque.

**Por qué se reescribió esta fase.** El plan decía «la semilla de 13 casos
pasa a fixture de pruebas; el índice arranca vacío». Medido el 22-09 por la
noche: **no hay semilla en código**. Los 13 casos (11 `tanque`, 2 `grupo de
bombeo`) viven en `datos/aprendizaje.json`, que está en `.gitignore`; los
verificadores ya usan `mkdtemp` desde el Plan 16; el índice vacío ya tiene
tres guardas y produce `sin_respaldo` (no `caida`) en el motor; y el prompt
ya prohíbe inventar casos cuando `casosCitados` no viene (03-09-2026). Lo
que queda es **de despliegue, de texto y de pruebas**, no de dominio.

**Pasos.**

1. **Vaciar la bitácora, con guion y con copia.** `purgar-casos-invalidos.mjs`
   gana `--vaciar-intervenciones` reutilizando su copia de seguridad
   (`datos/aprendizaje.json.antes-de-purga-<ISO>.json`); `hechos` y
   `propuestas` no se tocan (`HECHOS_INICIALES` viven en el código). Se
   documenta en HANDOFF §7 y en `backend/README.md` como paso de
   despliegue. `datos/embeddings-cache-casos.json` se borra en el mismo
   paso: se regenera solo.
2. **La copia fantasma.** `backend/datos/aprendizaje.json` (9908 bytes, no
   versionado) existe porque `RUTA_APRENDIZAJE` es relativa al `cwd`. Se
   borra y se anota en HANDOFF §8 (trampas): **arrancar desde `backend/`
   lee otra bitácora**. Cambiar la ruta a absoluta es otra tarea (backlog),
   no ésta.
3. **Textos.** `assistant:rag.cases.emptyOcultos` (es/en) nombra «el sistema
   de vibraciones» y «la estación de llenado» en duro; pasa a interpolar el
   nombre de la máquina en contexto y a contar ocultos sin nombrar de quién
   son. `verificar-textos` e `i18n` lo comprueban.
4. **Comentarios que envejecen**: `backend/test/rutas/maquinas.test.mjs`
   (cita 11), `CasosRag.jsx` (cita 13), `casos-solo-en-servicio.test.jsx`.
   Se reescriben con lo que es cierto tras el vaciado.
5. **Las 5 pruebas omitidas de `casos-rag.test.jsx`** se reabren con casos
   **mockeados** de una configurada (`sistema: "vib-motor-03"`): ya no
   «tapan el hecho», porque el hecho —que la bitácora real no tiene casos
   de vibraciones— deja de ser lo que la rama quiere resolver.
6. **Efecto secundario anotado**: `DELETE /api/maquinas/:id` desactiva en
   vez de borrar cuando hay casos que nombran la máquina. Con la bitácora
   vacía, toda máquina pasa a ser borrable. Se anota en HANDOFF §3 como
   comportamiento esperado y se comprueba en `maquinas.test.mjs` que el
   camino «con casos → desactivar» sigue cubierto con datos falsos.

**F3 hecha (23-09-2026, madrugada).** Lo que de verdad pasó:

1. `purgar-casos-invalidos.mjs` gana `--vaciar-intervenciones`: mismo
   informe en seco, misma copia `.antes-de-purga-<fecha>.json`, mismo
   `--ejecutar` deliberado; `hechos` y `propuestas` no se tocan. Probado
   contra una copia de la bitácora real en un directorio temporal: 13 → 0,
   la copia conserva las 13, y una segunda pasada dice «ya está vacía». **No
   se ejecutó sobre `datos/aprendizaje.json` de esta máquina**: es estado
   del despliegue (D7) y la orden es de quien lo opera; HANDOFF §7 dice cómo.
   Por eso el primer criterio de aceptación queda como pendiente de esa
   decisión, no de código.
2. La copia fantasma `backend/datos/aprendizaje.json` **no era una bitácora
   olvidada: eran 30 intervenciones de prueba de `vib-motor-03`** que
   escriben las pruebas de `POST /api/casos` al correr con `cwd = backend/`
   (`RUTA_APRENDIZAJE` es relativa). El puente real arranca desde la raíz
   (`node --env-file=.env.local backend/server.mjs`, comprobado en el
   proceso vivo) y no la ve. Se apartó junto con el residuo
   `datos/embeddings-cache-casos.json` (200 bytes, de `verificar-casos`);
   HANDOFF §8 lo cuenta como trampa y **B17** pide la ruta absoluta y
   `mkdtemp` en esas pruebas.
3. `assistant:rag.cases.emptyOcultos` (es/en) deja de nombrar «el sistema de
   vibraciones» y «la estación de llenado»: dice «para esta máquina» y «de
   otras máquinas». Tres asertos de `casos-solo-en-servicio` que citaban el
   texto viejo se actualizaron; la vista no cambió de código.
4. Comentarios reescritos con lo que es cierto hoy: `CasosRag.jsx` (dos
   bloques que decían «la bitácora tiene 13»), `maquinas.test.mjs` (el «11
   casos») y la cabecera de `casos-solo-en-servicio`.
5. `casos-rag.test.jsx` **vuelve entera** (5 pruebas): casos de una
   configurada (`vib-motor-03`, «Vibración en zona de daño en S1») con
   `useMaquina` doblado como hacen las demás pruebas de vistas. Las omitidas
   del frontend pasan de 29 a 24.
6. El efecto en `DELETE /api/maquinas/:id` (con bitácora vacía toda máquina
   es borrable) queda anotado en HANDOFF §7 y en el comentario de la prueba.

Lo que NO hizo, y por qué: no tocó el motor ni el índice (las tres guardas
del índice vacío y `sin_respaldo` ya existían, verificado en F0); no midió
la narración con `casos: 0` (es un `medir-*`, necesita el LLM).

**Lo que NO se hace**: tocar el motor, el índice ni las guardas (ya están);
medir la narración con `casos: 0` es un `medir-*` (instrumento, necesita el
LLM) y se deja anotado como recomendable, no como criterio.

**Criterios de aceptación.**
- [ ] Backend recién arrancado tras el vaciado: `GET /api/casos` → `total: 0`;
      «Casos previos» de `vib-motor-03` dice «ninguna intervención» sin
      cifra inventada ni mención al tanque. **Pendiente de que quien opera el
      despliegue ejecute el vaciado** (HANDOFF §7); el guion está probado
      contra una copia y el texto ya no nombra al tanque (prueba).
- [x] `verificar-diagnostico`, `verificar-casos`, `verificar-casos-cierre`,
      `verificar-calibracion` en verde (no dependían de la bitácora).
- [x] `casos-rag.test.jsx` sin `.skip`, 5 pruebas verdes con una configurada.
- [x] No existe `backend/datos/aprendizaje.json`; HANDOFF lo dice (y B17 pide que
      la suite deje de crearlo). **Puerta:** frontend **1193** verdes · **24** omitidas (las 5 de Casos previos vuelven); backend 398 + el rojo de entorno (B16); los 41 verificadores; lint y types limpios.

### F4 — Retirar las vistas del tanque y sus pruebas

**Objetivo.** Borrar lo que F1 y F2 sustituyen, y sólo eso, con la cifra del
bundle antes y después.

**Se borra seguro** (sustituido por F1/F2):
`views/tanque/PlantaTanque.jsx`, `views/tanque/DetalleActivo.jsx`,
`data/tanque/detalleActivo.js`, `data/tanque/historia.js` (la puerta: sus
tres consumidores pasan a `data/comunes/historia.js` con `SISTEMA.tanque`
mientras la fuente en vivo exista), `components/tiles.jsx` (único consumidor:
`PlantaTanque`), `buildModeloEva` de `lib/modelo.js` (queda `delta`),
las rutas `eva-planta` y `eva-detalle` con sus claves i18n, y sus pruebas:
`planta-simulada`, `detalle-activo-simulada`, `detalle-exportar`,
`selector-rango`, `grafica-comparada`, `hooks-historia`, `historia.test.js`,
y las entradas de `accesibilidad.test.jsx` sobre esas dos vistas. Cada una
**ya tiene su espejo escrito en F1/F2** antes de borrarse; una que no lo
tenga, no se borra.

**[?] Decisión del usuario, en esta fase:** las otras cuatro vistas del
tanque (`InicioTanque`, `RiesgosTanque`, `ControlesTanque`,
`MaquetaTanque3D`), `AlarmasEva` (del tanque y **todavía en el menú**),
`MuroPlanta`, los 11 modelos 3D sólo del tanque (1868 líneas) y sus pruebas
(`inicio-simulada`, `controles`, `riesgos-*`, `edad-dato-controles`,
`prosa-del-dominio`, `riesgos-vocabulario`, `alarmas-eva-vivo`,
`muro-planta`, `tres-d`, `rotor-3d` en su parte del tanque). Se borran si
el usuario confirma que el tanque entrará por configuración con vistas
genéricas (Plan 43); si no, quedan cerradas. **Lo que no se borra en ningún
caso aquí**: la fuente en vivo (`EvaProvider`, `evaSource`, `hooks.js`,
`simulador.js`, `transportes.js`) y las puertas `domain/*.js` con consumidor
—son (b) del inventario de F0.

**Conocimiento que se conserva antes de borrar.** Las cabeceras de
`DetalleActivo` (las tres versiones del layout), `PlantaTanque` (rejilla de
12 y ritmo binario), `tiles.jsx` (el mapa contra «Planta · v2») y
`detalleActivo.js` (`historiaReal: null`, nunca `[]`) se leen y lo que sigue
valiendo se copia a la cabecera de la vista genérica **en el commit
anterior al borrado**, para que el diff del borrado sea sólo borrado.

**Criterios de aceptación.**
- [ ] Ninguna prueba `.skip` sin dueño: cada omitida está borrada con su
      vista, reescrita sobre la genérica, o lleva «para reabrir: Plan 43»
      porque depende de la fuente en vivo.
- [ ] `verificar-bundle` en verde con `index` **más pequeño** que la cifra
      anotada en F1, y `charts` anotado.
- [ ] `verificar-i18n` y `verificar-textos` en verde (las claves de las
      rutas borradas se van con ellas).
- [ ] `grep` de `views/tanque/PlantaTanque`, `DetalleActivo`,
      `detalleActivo.js`, `tiles.jsx` en `src/` devuelve cero.

### F5 — Código muerto

**Objetivo.** Borrar lo que ninguna máquina, configurada o no, usa. La lista
se cerró en F0.

**Se borra**: `features/data/` (912 líneas; se actualizan los dos
comentarios que lo citan en `routes.jsx` y `lib/iconics/index.js`).

**[?] Usuario**: `modulos/prediccion/` (1295 líneas, oculto; arrastra
`lib/queryClient.js` y el `QueryClientProvider` de `App.jsx` sólo si
`ExploradorAssets` deja de usar react-query, la entrada `prediccion` de
`shared/modulos.js` con sus asertos en `verificar-modulos`, `sec-prediccion`
en los dos `navigation.json` y `VITE_PREDICTION_API_BASE`); y
`scripts/plc_opcua.py` (el Plan 17 decidió conservarlo).

**Se quedan, y por qué**: las 22 `omitir()` de `verificar-herramientas`
(motivo `CERRADA`: la fuente en vivo del tanque, Plan 43); las puertas
`domain/*.js` con consumidor; `shared/eva/tanque/` entero; `REGLAS_TANQUE`,
el `switch` de `lib/maquina.mjs` y `narrarEstadoTanque` (B2); el transporte
falso del tanque (puerta §5.1).

**Criterios de aceptación.**
- [ ] Cada borrado con su evidencia en el commit: «nadie lo importa» o «lo
      importaba X, borrado en F4».
- [ ] Lint, types, `npm run verificar`, las dos suites y la puerta §5.1 en
      verde; conteos nuevos en HANDOFF §1 y §9; `verificar-textos` e `i18n`
      sin huérfanos.

### 3.6 · QA y contramedidas — la red que acompaña a las cinco fases

**Línea base, medida el 22-09-2026 por la noche** (tras la F0, antes de F1):

| Qué | Resultado |
|---|---|
| `npm run lint` | limpio |
| `npm run types` | limpio |
| Suite de backend | **399 / 399** verdes (el rojo de entorno de `salud.test.mjs` que citaba HANDOFF no apareció) |
| Suite de frontend | **1103** verdes · 29 omitidas (109 archivos verdes, 5 omitidos), 131 s con `maxWorkers: 4` |
| `npm run verificar` | **los 41** en verde (208,6 s); 2 excluidos por diseño |
| Puerta §5.1 (`verificar-herramientas`, `verificar-chat`) | `verificar-herramientas` **190** correctas (13 sobre configurada) · **22 omitidas** (`CERRADA`); `verificar-chat` **71** correctas |
| `verificar-bundle` | `index` 345,5 KB / 450 · `vendor` 269,1 / 330 · `charts` **326,4 KB (sin techo)** · `react` 138,6 · `three` 827,2 diferido |

**Puerta de cada fase** (se corre entera, no «lo que toqué»): lint, types,
`npm run verificar`, las dos suites. La puerta §5.1 se corre además en F2.0
(toca `backend/lib`) y en F3 y F5 (tocan guiones y i18n que el asistente
lee). `verificar-bundle` tras un `build` en F1, F2, F4 y F5, con la cifra
en el commit. **Un rojo nuevo es un defecto** (CLAUDE.md §5.6): esta rama
tiene parte de la suite omitida a propósito, así que no hay «rojo esperado».

**Contramedidas contra regresión**, cada una con la fase que la instala:

1. **Commit por paso, no por fase, cuando el paso ya prueba algo solo**
   (F1a/F1b, F2.0/F2). Sin push. Revertir un paso es un `git revert` limpio.
2. **Las puertas sostienen al tanque hasta F4.** `data/tanque/historia.js`
   como puerta (F1) y el paso de props en `DetalleActivo` (F2) son los dos
   únicos toques al código del tanque antes de borrarlo, y las pruebas del
   tanque **no se modifican** en F1–F3: si una cae, el defecto es de la
   puerta.
3. **`sin-literales-de-maquina.test.js`** (F1): lee `views/maquina/`,
   `components/maquina/`, `data/comunes/historia.js`, `data/comunes/*Maquina*`
   y falla ante `"tanque"`, `"vib-`, `nivelTanque`, `"S1"`…  Es la única
   forma barata de cazar «generalizar copiando» en revisión.
4. **Ciclo de vida del sondeo** (F1, backlog F7): un motor por máquina con
   dos consumidores montados; el motor para al desmontar el último. Se
   escribe **antes** de que haya un segundo consumidor de la fuente.
5. **Trampa de red en simulado** (F1, F2): `fetch` que lanza. Toda vista
   genérica en «Simulado» tiene una prueba así.
6. **Hueco es hueco** (F1, F2): pruebas con `cobertura.completa: false`,
   `motivo: SIN_SERIE`, `error` de petición y `hasMore: true`; en las
   cuatro la pantalla lo dice y no dibuja una recta ni un cero.
7. **Compatibilidad de la configuración** (F2.0): una `maquinas.json` sin
   `historyCausa` carga igual; la ficha muestra «sin sondear», no un error.
8. **Vaciado con copia** (F3): el guion nunca escribe sin dejar el
   `.antes-de-purga-*`; prueba en `mkdtemp`.
9. **Borrar sólo lo sustituido** (F4): antes de borrar un archivo se lista
   su espejo en el commit; `grep` de los nombres borrados en `src/` = 0.
10. **Comprobación manual contra planta**, en F1 y F2, con el backend
    reiniciado (HANDOFF paso 0): `vib-motor-03` en Planta y en Detalle,
    origen real y simulado, rango de ayer y de semana, un CSV abierto. Lo
    visto se anota en la fase con fecha; una captura no hace falta, la
    lista de lo comprobado sí.

**Lo que se mide y se anota, sin umbral nuevo**: `index`/`vendor`/`charts`
en KB por fase; peticiones al historiador al abrir Detalle con `vib-motor-03`
(lotes de `MAX_SERIES_BATCH`); tiempo de la suite de frontend (si sube, mirar
si son `timed out` por contención antes que asertos, CLAUDE.md §5.3).

## 4. Riesgos

> Cada riesgo de abajo tiene su contramedida numerada en §3.6; aquí queda
> el porqué, allí el cómo se caza.

- **Escribir un tercer motor de sondeo.** El atajo natural para F1 es un
  hook que abra su propio `pollingEngine` sobre los puntos de la máquina.
  Serían dos motores por máquina en cuanto Planta y el banner coincidan.
  D8 lo prohíbe; la contramedida 4 lo mide.
- **Enseñar una gráfica simulada como si fuera del historiador.** Con D10,
  en «Simulado» hay curva. La insignia de origen (`InsigniaOrigen`) y la
  cinta del origen simulado son lo que evita leerla como planta; la prueba
  de red cortada afirma que no se mezclan.

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
  Sí toca `backend/lib/sondearSeries.mjs` y `configuracionMaquina.js` en F2.0
  (D11): un campo aditivo, con su prueba de compatibilidad.
- No añade dependencias.
- No rehace la Vista 3D ni el recorrido/topología: son del tipo.
