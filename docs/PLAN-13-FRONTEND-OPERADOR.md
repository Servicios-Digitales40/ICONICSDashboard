# Plan 13 · Nueve mejoras de frontend: que el operador pueda fiarse de lo que ve

> **Objetivo.** Cerrar F1–F9 de la auditoría del 20-ago-2026. Son nueve cambios
> con un hilo común: hoy el tablero enseña cifras y colores sin decir **de
> cuándo son**, **de dónde sale el color** ni **qué significa un hueco**, y sin
> forma de llevarse nada a un parte. F10 (presupuesto de rendimiento 3D) queda
> fuera por decisión del usuario.

> **ESTADO (21-ago-2026)** — en ejecución. Rama de trabajo: **`Moises2`**
> (no `integracion/moises-gustavo`: esa rama quedó cerrada al fusionarse en
> el Plan 12; el trabajo de este plan sigue en la rama activa del usuario).
>
> | Fase | Entregable | Mejora | Verificación |
> |---|---|---|---|
> | 0 ✅ | `estadoDelDato.js`: una sola derivación de frescura y vacíos | base de F2+F9 | 17 pruebas unitarias puras |
> | 1 ✅ | Arnés de accesibilidad + landmarks + foco visible + color no exclusivo | **F6** | `axe` en la suite (0 violaciones graves) + 7 pruebas |
> | 2 | La edad del dato, en la propia cifra | **F2** | pruebas con temporizadores falsos |
> | 3 | Los tres vacíos, distinguidos | **F9** | una prueba por caso |
> | 4 | Banda de umbral dibujada y rotulada | **F4** | pruebas sobre `GraficaHistoria` |
> | 5 | Exportar CSV y PNG | **F5** | contenido y nombre del archivo |
> | 6 | Dos señales, eje doble | **F3** | pruebas sobre la gráfica comparada |
> | 7 | El rango en la URL | **F7** | `navegacion.test.jsx` ampliado |
> | 8 | Modo muro | **F8** | prueba de escala + revisión en pantalla |
> | 9 | Alarmas del servidor en pantalla | **F1** | contrato + UI con doble |
>
> Suite: **229/235** en verde (era 205 al escribir este plan). Ver §5 para
> los hallazgos que corrigieron la propia auditoría al ejecutar.

---

## 1 · Dos correcciones a la auditoría, antes de empezar

Al leer el código para planificar aparecieron dos cosas que no son como las
conté. Las dos cambian el tamaño del trabajo, y una lo cambia mucho.

**F7 está casi hecho.** Dije que no había forma de compartir un enlace, y sí la
hay: `app/routes/useNavegacion.js` ya sincroniza página y parámetros con la
barra de direcciones usando la History API, el botón «atrás» funciona, y la
pestaña del detalle **ya viaja en la URL** (`params.activo`, empujado por el
`onNavigate` de `Tabs`). Lo único que se queda fuera es el rango: `presetActivo`
y `rango` viven en `useState` dentro de `DetalleActivo.jsx`. F7 pasa de ser una
funcionalidad nueva a una extensión de media hora — con una trampa que el propio
archivo documenta y que la Fase 7 tiene que respetar.

**F1 es más pequeño de lo que prometí, y hay que decirlo.**
`GET /api/iconics/alarms` no devuelve las alarmas **activas**: llama a
`readAlarmHistory` y devuelve el **historial** de una ventana de como mucho 48 h
(`{ ok, alarms: [] }`). Con eso se puede construir «qué ha pasado en la última
hora» y reconocer eventos, que ya es mucho más de lo que hay hoy —que es nada—,
pero **no** un semáforo de «qué está en alarma ahora mismo». Eso necesitaría una
llamada distinta al servidor y, por tanto, trabajo de backend que este plan no
cubre. La Fase 9 entrega el historial y rotula la limitación en la propia
pantalla, en vez de dejar creer que es un panel de alarmas vivas.

## 2 · Reglas que gobiernan las diez fases

No son burocracia: son las que evitan que este plan deje el tablero peor que
como lo encontró.

**`DESIGN.md` manda.** Es un sistema de diseño escrito con reglas con nombre, y
tres de ellas tocan directamente lo que viene:

- *La Regla del Color con Significado* — verde, ámbar y coral **sólo** cuando la
  señal está en ese estado. Un dato viejo (F2) o un hueco (F9) no se pintan de
  coral para llamar la atención: se atenúan. El color semántico es del dato, no
  del estado de la aplicación.
- *La Regla de las Dos Paletas* — los colores de `t.viz.*` son para datos y los
  de interfaz para interfaz, y no se cruzan. En F3, las series comparadas se
  colorean con `viz`; sus etiquetas y controles, no.
- *La Regla de la Máquina en Monoespaciada* — toda marca de tiempo va en IBM
  Plex Mono. El «hace 3 s» de F2 nace en mono, no se convierte después.

**El simulador es un ciudadano de primera.** Las pruebas y buena parte del
desarrollo corren contra el transporte simulado (`lib/iconics/transport.js`,
`Demo-EVA/data/simulador.js`). Toda pieza nueva tiene que producir su estado
también ahí — incluidos los estados feos: dato viejo, sin conexión, sin
historiador. Una funcionalidad que sólo se puede ver con el servidor real
delante es una funcionalidad que no se va a probar.

**Ninguna fase entra sin sus pruebas y sin su accesibilidad.** La Fase 1 monta
el arnés precisamente para que las ocho siguientes no puedan olvidarlo. La
línea base actual es **205 pruebas en verde**, y cada fase la sube.

**Verificación de cada fase, siempre la misma orden:**

```bash
cd react-dashboard && npm test          # la suite entera, no sólo lo nuevo
cd react-dashboard && npm run build     # que compile
node scripts/verificar-bundle.mjs       # el arranque no paga la 3D
cd react-dashboard && npm run design:detect   # el detector del sistema visual
```

---

## 3 · Fases

### Fase 0 — Una sola verdad sobre el estado del dato ✅

**Por qué primero.** F2 y F9 son la misma pregunta contestada en dos sitios
(«¿me puedo fiar de este número?») y si cada componente la responde por su
cuenta acabarán discrepando: el tile diciendo «en banda» mientras la gráfica dice
«sin conexión». Se resuelve una vez, en una función pura, y se consume desde
todas partes.

**Qué se creó.** `Demo-EVA/data/estadoDelDato.js`, sin React, con DOS funciones
—no una sola con seis estados, como decía la versión original de este plan—
porque «¿me fío del valor en vivo?» y «¿me fío de la serie histórica?» resultaron
preguntas con entradas distintas y no una sola tabla:

`frescuraDe({ receivedAt, stale, ahora })`, para el valor en vivo:

| Estado | Cuándo | Qué se hace en pantalla |
|---|---|---|
| `sinDato` | nunca ha llegado una lectura de este punto | hueco explícito |
| `fresco` | dentro del ciclo de sondeo normal | nada, se pinta normal |
| `envejecido` | el motor de sondeo ya lo marcó `stale` | el valor se atenúa, aparece su edad |
| `congelado` | más de un minuto sin refresco | el valor **se sustituye** por su edad |

`estadoHistorial({ motivo, error, loading, datos, minimo })`, para la serie:
`ok` (hay datos, aunque `loading` siga en `true` — ver más abajo) ·
`cargando` · `sinDato` (el historiador respondió vacío) · `sinHistoriador`
(`motivo` trae `SIN_SERIE`) · `sinConexion` (`error`).

La frontera de `congelado` no se calcula por ciclos: se reutiliza el `stale`
que YA calcula `pollingEngine.js` (`staleAfterCycles`) para "envejecido", y se
añade un umbral duro de un minuto de reloj para "congelado" — independiente de
la cadencia de sondeo de la sección (3 s en Demo EVA, no los 15 s por defecto
del motor genérico), que sí podría cambiar sin que la regla del minuto tenga
que moverse con ella.

**Decisión que se toma aquí.** `sinDato` y `sinHistoriador` son distintos y
tienen que seguir siéndolo: el primero puede ser una avería de la sonda, el
segundo es cómo está montada la instalación. Cuatro de las ocho señales no
tienen historia por diseño, y confundir las dos cosas manda a alguien a revisar
un equipo que está bien.

**Verificación.** Pruebas unitarias en `test/demo-eva/estado-dato.test.js`, una
por estado y una por frontera, con el reloj congelado. Sin DOM: si esto necesita
renderizar algo para probarse, está en el sitio equivocado.

---

### Fase 1 — F6 · Accesibilidad: primero el arnés, luego el barrido ✅

**Por qué tan pronto.** Si va al final, las ocho fases anteriores generan deuda
que hay que repasar dos veces. Puesto aquí, cada fase siguiente se comprueba
sola.

**El arnés, tal como se construyó.** `axe-core` directo como dependencia de
desarrollo (no `vitest-axe`: sólo hacía falta el runner, no su matcher de
todo-o-nada, y así son cinco dependencias transitivas menos). El ayudante vive
en `test/a11y.js`, **no** en `test/setup.js`: no es un relleno de entorno como
`ResizeObserver`, es una aserción, y una vista sin
`import { auditarAccesibilidad }` debe seguir siendo una vista sin comprobar,
no una que pasa por descuido de un arnés global. Sólo falla ante violaciones
*serious*/*critical* — medido, las reglas de landmark son *moderate* y un
filtro por gravedad las habría dejado pasar en silencio, así que los
landmarks se comprueban con una aserción propia, aparte del arnés.

**El barrido, con lo que resultó ser cierto y lo que no.** La premisa de
partida —cuatro vistas con cero `aria-`— resultó ser la métrica equivocada:
medido con axe, las tres primeras ya tenían cero violaciones graves (ver §5).
Lo que sí hacía falta:

1. **Landmarks.** No cuatro `<main>`, uno: el `eva-page-shell` de `App.jsx` es
   el envoltorio común de toda ruta. Junto con `<header>` en `Topbar.jsx` y el
   `<aside>`/`<nav>` que `Sidebar.jsx` ya tenía, cierra el juego completo.
2. **Valores que cambian solos.** Deliberadamente **no** se tocó. Un
   `aria-live` en cada cifra que refresca cada 3 s repetiría el antipatrón que
   el propio `Asistente.jsx` ya evita con su estado — bombardear con anuncios
   cada ciclo. Lo que merece anunciarse son TRANSICIONES de estado
   (fresco→envejecido→congelado, conexión→sin conexión), y esas transiciones
   son justo lo que definen las Fases 2 y 9. Queda para entonces.
3. **Foco visible.** Se extendió `.metric-card:focus-visible` (ya existía) a
   `.nav-item` y `.app-btn`, mismos valores del token de foco — no una
   convención nueva.
4. **El color no puede ser el único portador del estado.** Real, pero más
   preciso de lo dicho: no es "verde y ámbar el mismo tile" en general —cada
   `PuntoEstado` del tablero ya iba pegado a su `corto`—, es que `BandaValor` y
   `BarraBanda` (la marca de posición dentro de la banda) eran la única
   excepción. Se cerró con el mismo par punto+texto que usa el resto del
   sistema, no con un glifo nuevo. Ver §5 para la trampa que tuvo (`banda`
   contra `estado`).

**Verificación.** Las cuatro vistas pasan `axe` sin violaciones graves; dos
pruebas explícitas de que el `corto` del estado acompaña a la marca de banda;
una prueba de que `<main>`/`<header>`/`<nav>` aparecen exactamente una vez.
Suite completa
en verde.

---

### Fase 2 — F2 · La edad del dato, en la propia cifra

**El problema, medido.** `useSistemaAgua` ya devuelve `lastUpdated`, y nadie lo
pinta. Con el puente caído, `pollingEngine` reintenta con *backoff* creciente y
la pantalla sigue enseñando el último valor bueno, cada vez más viejo, con el
mismo aspecto que uno recién leído.

**Qué se construye.** Un componente `EdadDato` —marca de tiempo relativa, en
mono por la regla del sistema— y su aplicación en los tres sitios donde se lee
una cifra: `HeroeNivel`, `EstadoSenales` y `RejillaActivos` (`tiles.jsx`).

El comportamiento lo dicta la Fase 0. Lo que importa es la regla dura de
`congelado`: **por encima del minuto, el número desaparece y en su hueco queda su
edad.** Atenuar no basta pasado ese punto — una cifra tenue sigue siendo una
cifra, y alguien la va a leer. Un hueco se nota; un número viejo, no.

**Cuidado con el ruido.** Se actualiza como mucho una vez por segundo y con un
solo temporizador para toda la pantalla, no uno por tile. Ocho temporizadores
repintando ocho tiles cada segundo es exactamente el tipo de cosa que hace que
un tablero de planta caliente un portátil todo el turno.

**Verificación.** `test/demo-eva/edad-dato.test.jsx` con temporizadores falsos:
fresco no muestra nada, envejecido atenúa y muestra edad, congelado sustituye el
valor. Y una prueba de que hay **un** intervalo, no ocho.

---

### Fase 3 — F9 · Los tres vacíos, distinguidos

**Qué falta.** La Fase 5 del Plan 11 ya resolvió esto para las gráficas de
historia: `GraficaAusente` recibe un `mensaje` distinto según la causa. Los
tiles, el panel de estado del 3D (`PanelEstadoEva.jsx`) y el explorador de
activos siguen enseñando los tres casos igual.

**Qué se hace.** Extender ese trabajo consumiendo la Fase 0, con un componente
de hueco compartido y un texto por causa:

- `sinDato` → «Sin lectura válida» + calidad cruda del tag en mono. Es
  diagnosticable: dice si el problema es la sonda o el puente.
- `sinHistoriador` → «Esta señal no tiene serie propia en el servidor». Es un
  hecho del catálogo (`shared/eva/senales.js`, campo `historizado`), y se
  escribe como tal, sin tono de avería.
- `sinConexion` → la causa y qué hacer. Aquí entra el caso que ya conocemos:
  tras reiniciar el equipo, los servicios de GENESIS64 tardan varios minutos, y
  durante ese rato «no se pudo conectar» hace que alguien reinicie cosas que
  están bien. Si el fallo es de conexión y la aplicación lleva poco viva, el
  texto dice que los servicios están levantando.

**Verificación.** Una prueba por causa en cada superficie, contra el transporte
simulado forzado a cada estado. El simulador necesita poder producir los tres:
si no puede, esa parte se construye aquí.

---

### Fase 4 — F4 · La banda de umbral, dibujada y rotulada como lo que es

**El problema.** El estado se comunica por color de tile, pero `GraficaHistoria`
no dibuja dónde están el aviso y el crítico. Se ve una línea subir sin saber
hacia qué.

**Qué se hace.** `ReferenceArea` de recharts para las bandas de aviso y crítica,
leyendo `UMBRALES[clave]` (`{ min, avisoMin, avisoMax, max }`, con nulos
frecuentes: la carga del motor no tiene límite inferior y la eficiencia no tiene
superior — el dibujo tiene que aguantar eso sin inventarse un borde).

**La parte que no es decorativa.** Mientras `PROVISIONALES` valga `true`, esas
bandas son **estimaciones nuestras**, y medidas contra el servidor real no se
parecen a esta instalación: el 91 % de las lecturas de presión cae por debajo del
«crítico». Así que la banda se dibuja **rayada**, no rellena, con la leyenda
«estimado, sin confirmar». El rayado no es un detalle de estilo: es lo que
distingue visualmente un límite medido de uno supuesto, y esa distinción es hoy
la limitación más importante de todo el sistema. El día que `PROVISIONALES` pase
a `false`, el relleno pasa a sólido y la leyenda desaparece **solo**, sin tocar
este componente.

**Verificación.** `grafica-historia.test.jsx` ampliado: aparecen las bandas
cuando hay umbrales, no aparecen cuando la señal no los tiene (`modoVdf`), se
respetan los nulos, y el rótulo de provisional está mientras la bandera lo esté.

---

### Fase 5 — F5 · Llevarse lo que se está viendo

**El problema.** No hay ninguna descarga en el tablero. Una tendencia que va a un
parte de turno se resuelve hoy con una foto del monitor.

**CSV.** Se genera desde los mismos `datos` que la gráfica ya tiene en memoria —
sin volver a pedir nada al historiador— con una fila por muestra: instante ISO,
valor, unidad si el tag la declara, y calidad. **El nombre del archivo es parte
del trabajo**: `nivel-tanque_2026-08-19T14-00_2026-08-20T14-00_average.csv`. Un
CSV sin rango ni agregado en el nombre es un CSV que nadie sabrá interpretar en
noviembre, y el agregado importa: lo que se descarga son medias de intervalo
(`AGREGADO = "Average"`), no lecturas crudas, y el archivo tiene que decirlo.

**PNG.** Recharts renderiza SVG: se serializa el nodo, se pinta en un canvas y se
descarga. Dos cuidados — el SVG hereda color del tema, así que hay que fijar el
fondo antes de exportar o el PNG sale transparente y en oscuro es ilegible sobre
papel blanco; y el título con señal y rango se **dibuja dentro de la imagen**,
porque una imagen pegada en un correo pierde el nombre del archivo.

**Verificación.** Prueba del contenido del CSV y del nombre generado; prueba de
humo del PNG (que se produzca un blob no vacío). La descarga en sí se dispara con
un `<a download>` y no necesita prueba de navegador.

---

### Fase 6 — F3 · Dos señales en la misma gráfica

**Por qué.** «¿La presión cayó cuando cayó la tensión?» es la pregunta de
diagnóstico, y hoy sólo la puede contestar el asistente con
`correlacionar_senales`. No se puede mirar.

**Lo que ya está resuelto y no hay que inventar.** `useSeriesHistoricas(claves,
rango)` existe y lee varias señales con el mismo rango; el alineado por
tolerancia está hecho en el backend. Esta fase es UI, no datos.

**Qué se construye.** `GraficaComparada`: hasta cuatro señales sobre el mismo eje
X, eje Y secundario para la segunda, y un conmutador de **normalizar a porcentaje
de rango** para cuando las magnitudes no se puedan comparar en absoluto
(temperatura contra caudal).

**Dos decisiones.** Los colores salen de `t.viz.*` y sólo de ahí — un token de
interfaz como color de serie es un error de sistema según `DESIGN.md`, no una
preferencia. Y el eje doble se rotula sin ambigüedad: dos ejes sin decir cuál es
de quién es peor que una sola serie, porque invita a leer una escala equivocada
con total confianza.

**Verificación.** Pruebas de que sólo se ofrecen las señales historizadas, de que
la normalización cambia el dominio y no los datos, y de que cada serie encuentra
su eje.

---

### Fase 7 — F7 · El rango, en la URL

**Qué falta exactamente.** `presetActivo` y `rango` en `DetalleActivo.jsx`. Todo
lo demás ya viaja.

**La trampa, que el propio archivo documenta.** `useNavegacion` filtra a la URL
sólo lo serializable —cadenas, números y booleanos— porque un objeto acaba como
`[object Object]` y al recargar ese texto llega al render como si fuera el valor.
Un rango personalizado es `{ inicio: Date, fin: Date }`: **no se puede empujar
tal cual**. Va como `rango=ayer` para los accesos rápidos, y como
`desde=2026-08-19&hasta=2026-08-20` en días para el personalizado, reconstruido
al leer con `rangoPersonalizado`.

**Y la validación al leer.** Un `desde` corrupto en un favorito no puede tumbar
la vista: cae al rango en vivo, que es el mismo criterio que ya usa el archivo
para un id de página desconocido.

**Verificación.** `navegacion.test.jsx` ampliado: ida y vuelta de cada preset y
de un personalizado, recarga que conserva el rango, y valor corrupto que cae al
defecto sin lanzar.

---

### Fase 8 — F8 · Modo muro

**El escenario.** La densidad actual está calculada para un portátil a 60 cm. El
destino real es un monitor colgado a tres metros, sin teclado ni ratón, encendido
el turno entero.

**Qué se hace.** Un modo activado por parámetro de URL —reutilizando la
maquinaria de la Fase 7, que para eso está—: escala tipográfica mayor, sin barra
lateral, sin controles pulsables por accidente, y rotación opcional entre vistas
cada N segundos.

**Aquí hay que romper una regla, y hay que hacerlo por escrito.** `DESIGN.md`
declara *La Regla del Techo de 16px*: ningún texto de la aplicación pasa de 16px,
y la jerarquía se construye con peso y color, no con tamaño. El modo muro
necesita texto más grande — no es un capricho, es la distancia de lectura. La
salida limpia **no** es subir los tokens: es escalar la raíz (un `font-size` de
`:root` mayor con los tamaños en `rem`), de forma que el sistema entero crezca
proporcionalmente y el techo de 16px siga siendo cierto *en las unidades del
sistema*. Si al probarlo eso no basta, entonces se documenta la excepción en
`DESIGN.md` con su motivo. Lo que no se puede hacer es saltarse la regla en
silencio.

**Un detalle que sólo aparece en planta:** un panel fijo veinticuatro horas se
quema. La rotación entre vistas ayuda; conviene además que nada de alto contraste
se quede clavado en el mismo píxel todo el turno.

**Verificación.** Prueba de que el parámetro escala la raíz y oculta la
navegación. El resto es revisión en pantalla — y de las nueve mejoras, ésta es la
que menos se puede juzgar sin ponerla en el monitor de verdad.

---

### Fase 9 — F1 · Las alarmas del servidor, en pantalla

**La más grande, y la única con dependencia fuera del frontend.** Va última por
eso, no por importancia.

**Lo que hay.** `GET /api/iconics/alarms?pointName=&hours=` devolviendo
`{ ok, alarms: [] }` sobre una ventana de hasta 48 h, y
`PUT /api/iconics/alarms/acknowledge` con `{ eventIds, comment }`. No hay
`fetchIconicsAlarms` en `lib/iconics/apiClient.js`: se añade aquí, con la misma
forma que las demás funciones del archivo.

**Lo que se entrega.**

1. **Vista de alarmas** con el historial de la ventana elegida, ordenado, con el
   tag en mono y el instante en mono, y filtro por activo.
2. **Contador en el Topbar** con los eventos de la última hora. Rotulado como lo
   que es —eventos recientes, no alarmas activas— porque prometer un semáforo en
   vivo con un historial detrás sería exactamente el tipo de mentira que este
   tablero evita en todo lo demás.
3. **Reconocer, sólo si se puede.** El *ack* es una escritura y responde 403 con
   `ICONICS_READ_ONLY` activo. El botón se decide con la respuesta de
   `/api/health` (que ya expone `readOnly`) y **no aparece** cuando el puente
   está en solo lectura. Un botón que siempre falla es peor que su ausencia — es
   la misma norma que ya aplica el asistente con el micrófono.

**Tensión con `DESIGN.md`, y hay que resolverla.** El documento dice, entre los
«Don't»: *no introducir affordances de escritura o borrado, el backend es de solo
lectura*. Eso dejó de ser verdad con `controlar_bomba`, y el *ack* de alarmas es
la segunda escritura. La regla no se ignora: se reescribe para decir lo que ahora
es cierto —**la escritura existe, va siempre condicionada a `readOnly` del
servidor, y se anuncia antes de ejecutarse**— igual que se corrigió la cabecera
de `herramientas.mjs` en el Plan 12 cuando dejó de ser un catálogo de solo
lectura.

**El estado que hay que contar bien.** «No hay alarmas en esta ventana» y «no se
pudieron leer las alarmas» son cosas distintas y en una pantalla de planta se
confunden con facilidad. Reutiliza la Fase 3.

**Verificación.** Comprobación de contrato sobre el cliente nuevo; pruebas de UI
con un doble que devuelva lista con eventos, lista vacía y error; prueba de que
el botón de reconocer no existe con `readOnly: true`.

---

## 4 · Las tres tensiones con el sistema de diseño

Resumidas aquí porque son decisiones de diseño, no de programación, y conviene
que estén decididas antes de la fase que las toca:

| # | Tensión | Fase | Salida propuesta |
|---|---|---|---|
| 1 | Un dato viejo o un hueco **no** pueden pintarse de coral (*Regla del Color con Significado*) | 2, 3 | Se atenúan y se rotulan; el color semántico sigue siendo del dato |
| 2 | El modo muro necesita texto por encima del *techo de 16px* | 8 | Escalar la raíz en `rem`, no subir los tokens; si no basta, excepción documentada |
| 3 | `DESIGN.md` prohíbe affordances de escritura, y el *ack* de alarmas es una | 9 | Reescribir la regla: la escritura existe, condicionada a `readOnly` y anunciada |

## 5 · Lo que la ejecución corrigió de la propia auditoría

Cada fase empezó leyendo el código antes de escribirlo. Tres correcciones
salieron de ahí, ninguna prevista al planear:

**Fase 0.** No hacía falta construir la frescura desde cero: `receivedAt` y
`stale` ya los calcula `pollingEngine.js` (`staleAfterCycles`) y ya viajan en
cada señal desde `shared/eva/sistema.js` — sólo que nada en pantalla los leía.
Y `fmtAntiguedad()` para el texto de edad ya existe en `lib/format.js`; de
paso quedó anotado que hay OTRO formateador de "hace N s" casi igual, local a
`base.jsx` (`useTiempoRelativo`), con umbrales distintos (2 s vs 5 s) — para
reconciliar en la Fase 2, sin crear un tercero.

**Fase 1, sobre F6.** "Cero atributos `aria-`" no era la señal correcta:
medido con axe-core contra `InicioEva`/`PlantaEva`/`AssetsEva`, las tres
tenían **cero violaciones graves** ya — los botones tenían nombre accesible
por texto visible o `title`, sin necesitar `aria-*` explícito. Y el hallazgo
de landmarks no pedía tocar cuatro vistas: `Sidebar` ya era `<aside>` +
`<nav>`; sólo faltaban un `<main>` (en `App.jsx`) y un `<header>` (en
`Topbar.jsx`), el envoltorio común de toda ruta — dos archivos, no cuatro.

**Fase 1, el hallazgo que sí era real, y más preciso de lo dicho.**
`BandaValor` y `BarraBanda` sí tenían el color como único portador de su
estado — a diferencia de cada `PuntoEstado` del resto del tablero, que
siempre va con su `corto` al lado. La reparación tuvo una trampa: el texto
tiene que describir `senal.banda`, no `senal.estado` — son cosas distintas a
propósito (una señal `en reposo` puede seguir fuera de banda) y usar
`estado` habría hecho que la marca dijera "En reposo" junto a un color coral.

## 6 · Checklist de revisión en pantalla

Nada de esto lo confirma una prueba automática. Necesita el servidor ICONICS
arriba — y recordar que tras reiniciar, GENESIS64 tarda varios minutos en
levantar sus servicios, así que un error de conexión en ese rato no es una
avería del tablero.

- [ ] Con el puente parado a propósito, ninguna cifra vieja se sigue leyendo como actual.
- [ ] Los tres vacíos se distinguen de un vistazo, sin leer el texto entero.
- [ ] Las bandas de umbral se ven rayadas y el rótulo «estimado» está.
- [ ] Un CSV descargado se abre en Excel con el rango correcto y las comas donde tocan.
- [ ] La gráfica comparada se lee bien en los tres temas, incluido Mitsubishi.
- [ ] Un enlace copiado del detalle abre el mismo activo **y el mismo rango**.
- [ ] El modo muro se lee a tres metros y no tiene nada pulsable por accidente.
- [ ] Las alarmas coinciden con las que muestra GENESIS64 en la misma ventana.
- [ ] Con `ICONICS_READ_ONLY=true` no hay botón de reconocer por ninguna parte.
- [ ] Con el simulador de daltonismo del navegador, verde y ámbar se distinguen.
