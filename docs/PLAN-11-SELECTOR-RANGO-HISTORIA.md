# Plan 11 · Selector de rango de tiempo en el historiador

> **Objetivo.** Que cada subvista de detalle (`DetalleActivo`, pestañas
> tanque/bombeo/distribución/eléctrico) con señales historizadas deje elegir
> el rango de tiempo que consulta —Tiempo real, Ayer, Hace una semana, o un
> rango personalizado de días— en vez de la ventana fija de 6 h que traía
> `VENTANA`.

> **ESTADO (20-ago-2026)** — **PLAN CERRADO.** Fases 0-7 completas (3 y 4
> se hicieron juntas, ver §3); checklist de §5 confirmado en pantalla por
> el usuario, incluidos los dos últimos ítems (persistencia de rango al
> cambiar de pestaña, envoltura en ancho angosto). El recorte de `fin` a
> "ahora" y la escala fija del eje Y quedaron además verificados contra el
> servidor real, en vivo — no sólo contra el simulador de las pruebas.
>
> | Fase | Entregable | Verificación |
> |---|---|---|
> | 0 | Descubrimiento + brief confirmado (`/impeccable shape`) | este documento, §2 |
> | 1 | `historia.js`: rango absoluto + escalado de intervalo | **9 pruebas** en `historia.test.js`, suite completa en verde (168 ok) |
> | 2 | Hooks: refetch por rango + fix del simulador | **+4 pruebas** (`simulador.test.js`, `hooks-historia.test.jsx`), suite completa en verde (172 ok) |
> | 3+4 | `SelectorRango`: accesos rápidos + calendario + puntos de «hay dato» | **+7 pruebas** en `selector-rango.test.jsx`, suite completa en verde (179 ok) — confirmado en pantalla por el usuario |
> | 5 | Carga sin vaciar, mensaje según causa, `hasMore`, eje X real | **+4 pruebas** en `grafica-historia.test.jsx`, suite completa en verde (183 ok) + detector de diseño sin hallazgos |
> | 6 | Verificación completa | `npm test` (183 ok) + `verificar-bundle.mjs` (✔ arranque no paga la 3D) + detector de diseño (sin hallazgos) |
> | 7 | «Hoy» → «Tiempo real»: el búfer en vivo, no el historiador | **+4 pruebas** netas + fix del recorte de `fin` futuro + fix del eje Y a escala fija, **191 pruebas en verde** — confirmados en pantalla y contra el servidor real por el usuario |

**Nota de investigación en vivo (20-ago-2026):** entre las Fases 4 y 5 se
confirmó contra el servidor real —ver
[[demo-eva-historico-reciente]] en memoria— que el historiador de esta
instalación arrancó a coleccionar apenas el 19-ago, ~16:07 UTC. Los puntos
de «hay dato» del calendario y los estados de carga/vacío de esta fase no
son higiene anticipada: con el histórico así de joven, «Hace una semana» y
casi cualquier rango personalizado van a devolver muy pocas muestras durante
un tiempo, y es justo el caso que la Fase 5 tiene que cubrir bien.

---

## 1 · Por qué ahora, y qué es lo que realmente falta

Hoy las tres gráficas del tablero (`GraficaHistoria` en la vista de detalle,
`TendenciaNivel` y `PanelTendencia` en Planta) piden siempre la misma ventana
fija: `VENTANA = { horas: 6, puntos: 24 }`
(`react-dashboard/src/shared/eva/historia.js`). El punto de entrada es
`leerSerie()`:

```js
// react-dashboard/src/Demo-EVA/data/historia.js:57-75
export async function leerSerie(clave, { horas, puntos } = VENTANA) {
  ...
  const fin = new Date();
  const inicio = new Date(fin.getTime() - h * 3600 * 1000);   // ← siempre "ahora menos N horas"
  const respuesta = await fetchIconicsHistory(pointName(clave), {
    startDate: inicio.toISOString(),
    endDate: fin.toISOString(),
    aggregate: AGREGADO,
    interval: intervaloHMS((h * 3600) / n),
  });
  ...
}
```

Pero **el backend y el cliente de API ya aceptan cualquier rango absoluto**,
sin ningún cambio:

- `fetchIconicsHistory()` (`react-dashboard/src/lib/iconics/apiClient.js:52-60`)
  ya manda `startDate`/`endDate`/`aggregate`/`interval` tal cual se le pasen.
- `GET /api/iconics/history` (`backend/routes/iconicsRoutes.mjs:96-117`) ya
  valida y reenvía esos cuatro parámetros arbitrarios a ICONICS FrameWorX.
- `client.readHistory()` (`backend/iconics/client.mjs:229-254`) ya pega
  directo a `/History` y ya devuelve `hasMore` cuando el servidor trunca por
  `X-ICO-MAX-ITEM-COUNT` — hoy nadie lee ese campo.

Es decir: **todo el camino de red ya soporta esto.** Lo único que falta es
frontend puro — `leerSerie()` calculando el rango solo, los hooks pidiendo
una sola vez al montar, y ninguna UI para elegirlo.

---

## 2 · El brief confirmado (resumen)

Discutido y confirmado por Israel el 20-ago-2026 vía `/impeccable shape`:

- **Alcance:** solo `DetalleActivo`/`DetalleGrid`/`GraficaHistoria`. Los
  mini-paneles de Planta (`TendenciaNivel`, `PanelTendencia` en `tiles.jsx`)
  quedan con su ventana fija de 6 h, sin selector, en esta iteración.
- **Un control por pestaña, no por gráfica.** Vive en la cabecera de
  `DetalleActivo`, gobierna todas las tarjetas historizadas de la pestaña
  activa a la vez (`useSeriesHistoricas` ya las trae juntas).
- **Accesos rápidos:** Hoy (00:00→ahora) · Ayer (día completo anterior) ·
  Hace una semana = **ventana móvil de 7 días** terminando ahora (no un día
  puntual) · Personalizado.
- **Personalizado = dos días completos**, sin hora exacta — el usuario
  marca día de inicio y día de fin, no una hora.
- **Sin teclado sigue vigente** (criterio ya documentado en
  `routes.jsx`/PRODUCT.md para toda la app): el calendario de rango
  personalizado es de clic puro, sin campo de texto. No hay librería de
  fechas instalada (`package.json` no trae `date-fns`/`dayjs`/
  `react-datepicker`); se construye a mano, en el estilo ya usado para
  `Spark`/`GraficaBufer`.
- **Gate de dominio intocable:** el control solo aparece si la pestaña activa
  tiene ≥1 señal con `historizado: true` (`senales.js`, `esHistorizada()`).
  Hoy eso es tanque (nivel, temperatura) y distribución (caudal, presión);
  bombeo y eléctrico no lo muestran, igual que hoy no muestran
  `GraficaHistoria`.
- **Por defecto:** "Hoy" al entrar a una pestaña; el rango elegido se
  conserva al cambiar de pestaña dentro de la misma sesión (no se resetea).
- **Techo de muestras:** `MAX_PUNTOS = 100` (`shared/eva/historia.js`) obliga
  a escalar el intervalo de agregación con la duración total del rango —
  igual que hoy ya lo hace para 6 h → 15 min — para que "hace una semana" no
  pida 168 h a 15 min y trunque en silencio.

---

## 3 · Fases

### Fase 1 — `historia.js`: aceptar rango absoluto ✅

- `leerSerie(clave, rango)` acepta `{ inicio: Date, fin: Date }` además de
  `{ horas, puntos }` (`Demo-EVA/data/historia.js`), vía un `resolverRango()`
  interno; con rango absoluto pide siempre `MAX_PUNTOS` y escala el intervalo
  a la duración real. El camino `{horas, puntos}` de siempre queda bit a bit
  igual — probado explícitamente para no regresarlo.
- **Desviación del plan original:** los presets (`rangoHoy`, `rangoAyer`,
  `rangoSemana`, `rangoPersonalizado`) se escribieron en
  `Demo-EVA/data/historia.js`, **no** en `shared/eva/historia.js` como decía
  este documento antes de ejecutar la fase. Razón: `shared/eva/historia.js`
  son reglas del *protocolo* del historiador, compartidas con el lado Node
  del asistente (`backend/ia/herramientas.mjs`), que corre en otro huso
  horario que el navegador de quien mira la demo. «Hoy» y «Ayer» son
  aritmética del reloj de pared de **quien mira la pantalla**, no una regla
  del servidor — mezclarlas en `shared/` le habría dado al asistente una
  noción de «hoy» potencialmente equivocada sin que nadie lo pidiera.
- `rangoPersonalizado(diaInicio, diaFin)` se adelantó de la Fase 4 a esta,
  porque es la misma familia de cálculo (día completo → `{inicio, fin}`) y
  así la Fase 4 sólo tiene que construir el calendario y llamarlo.
- Pruebas: `src/test/demo-eva/historia.test.js` (nuevo archivo, no
  `dominio.test.js` — ese archivo prueba `domain/`, no `data/`), 9 casos:
  los tres presets, el personalizado con día único y con rango de varios
  días, y `leerSerie` con los tres tipos de rango (incluida la guarda de
  `esHistorizada` con rango absoluto). Suite completa: 168 pruebas en verde,
  0 fallos.

### Fase 2 — Hooks: dejar de fetchear solo al montar ✅

- `useSerieHistorica`/`useSeriesHistoricas` (`Demo-EVA/data/hooks.js`) ya no
  derivan `horas`/`puntos` para las dependencias del efecto: reciben el
  `rango` opaco (`{horas,puntos}` o `{inicio,fin}`) y lo reducen con una
  nueva `claveRango()` interna a una clave primitiva estable — un `Date` es
  un objeto nuevo en cada render aunque represente el mismo instante, así que
  no puede ir tal cual en el array de dependencias sin refetchear en bucle.
  El efecto sigue usando el `rango` real (no la clave) para llamar a
  `source.leerSerie`.
- `useDetalleActivo(activoId, rango)` ahora recibe el rango y se lo pasa a
  `useSeriesHistoricas`.
- **El estado del rango se colocó en `DetalleActivo.jsx` (el componente de
  vista), no dentro de `useDetalleActivo`** — mismo resultado que proponía
  este documento, mecanismo más simple del previsto: `Shell` (`app/App.jsx`)
  monta la página con `key={nav.page}`, no `key={nav.page + params}`, así que
  cambiar de pestaña (que sólo cambia `params.activo`) **no remonta**
  `DetalleActivo`. Un `useState` normal ahí ya sobrevive al cambio de
  pestaña sin ningún mecanismo de persistencia adicional.
- **Bug encontrado y corregido, no estaba en el plan original:** el
  simulador (`data/simulador.js`, `readSerie`) desestructuraba
  `{ horas, puntos } = VENTANA` — con un rango absoluto `{inicio, fin}` eso
  da `{horas: undefined, puntos: undefined}`, y el simulador servía siempre
  la ventana de 6 h por defecto **sin avisar**. El selector de rango habría
  parecido funcionar contra el servidor real y no habría hecho nada con el
  origen «Simulado» puesto — justo el modo que PRODUCT.md exige que no falle
  nunca delante de un cliente. Se añadió `resolverRangoSimulado()`,
  simétrico al `resolverRango()` de la Fase 1.
- Sin cambios en `DetalleGrid`/`piezas.jsx` todavía: sin selector visible
  (llega en la Fase 3), la vista sigue mostrando lo mismo que antes, sólo que
  con el rango por defecto «Hoy» en vez de «últimas 6 h».
- Pruebas: **no** se extendió `detalle-activo-simulada.test.jsx` como decía
  este documento —esos tests montan la vista sin forma de disparar un cambio
  de rango antes de que exista el control de la Fase 3—; en su lugar:
  - `simulador.test.js`: +2 casos para el rango absoluto (incluida la
    regresión del bug de arriba).
  - `hooks-historia.test.jsx` (nuevo): +2 casos montando
    `useSeriesHistoricas` sobre el origen Simulado real, comprobando que
    cambiar el VALOR del rango sí repite la lectura y que un objeto nuevo con
    el MISMO valor no la repite (el bucle que `claveRango()` existe para
    evitar).
  - Suite completa: 172 pruebas en verde, 0 fallos.

### Fase 3+4 — `SelectorRango`: accesos rápidos y calendario, juntos ✅

**Desviación del plan:** se hicieron en un solo paso en vez de dos. Separarlas
habría dejado un estado intermedio con un botón «Personalizado» que abre un
popover sin contenido útil — un a medias que el propio criterio de este
proyecto rechaza («no half-finished implementations»). Las dos fases
comparten además un solo componente y un solo archivo de pruebas, así que
partirlas no habría aislado nada que verificar por separado.

- **`Demo-EVA/components/detalle/SelectorRango.jsx`** (nuevo): la fila de 4
  controles (Hoy · Ayer · Hace una semana · Personalizado), visualmente
  emparentada con `components/ui/Tabs.jsx` (mismo fondo `t.hover`, mismo
  estado activo `t.panel`/`t.accent` con anillo interior) pero sin reusar ese
  componente — su patrón ARIA de tabs asume que un clic siempre cambia de
  valor al instante, y «Personalizado» no: abre un calendario y sólo pasa a
  activo cuando el usuario confirma un rango dentro de él.
- El calendario (`CalendarioRango`, mismo archivo) es un mes con navegación
  prev/siguiente (siguiente deshabilitado en el mes de hoy, para no poder
  navegar al futuro), selección de inicio/fin en dos clics con vista previa
  al pasar el cursor, días futuros deshabilitados, y botones Cancelar/Aplicar
  (Aplicar deshabilitado hasta tener los dos días). Cero campos de texto.
  Construido a mano, sin dependencia nueva en `package.json`.
- Se cierra al tocar fuera (un `mousedown` en `document`, comparado contra un
  `ref` que envuelve el control y el popover) y al aplicar o cancelar.
- **`DetalleActivo.jsx`**: además del `rango` de la Fase 2, ahora guarda
  `presetActivo` (`"hoy" | "ayer" | "semana" | "personalizado"`) para saber
  cuál marcar activo; `PRESETS_RANGO` mapea las tres claves a
  `rangoHoy`/`rangoAyer`/`rangoSemana`. El selector sólo se renderiza cuando
  `activo.senales.some(s => s.historizado)` — Bombeo y Eléctrico no lo
  muestran, igual que ya no muestran `GraficaHistoria`.
- Pruebas: `src/test/demo-eva/selector-rango.test.jsx` (nuevo), 7 casos —
  dónde aparece y dónde no, qué acceso rápido queda marcado activo, que
  «Aplicar» no se habilita sin los dos días, que confirmar cierra el popover
  y marca «Personalizado», que «Cancelar» no toca el rango vigente, y el
  indicador de días con dato de abajo. Suite completa: 179 pruebas en verde,
  0 fallos.

**Añadido durante la Fase 3+4, a pedido explícito, no estaba en el brief
original:** puntos de acento en el calendario marcando qué días tienen
muestras reales del historiador, para que elegir un rango personalizado no
sea una apuesta a ciegas.

- `useDiasConDato(claveSonda, mesVisible, hoy)` (mismo archivo): UNA consulta
  por mes visible —no por día—, pidiendo el mes entero con `leerSerie(clave,
  {inicio, fin})` (el rango absoluto de la Fase 1) y agrupando las muestras
  devueltas por fecha de calendario (`Date.toDateString()`). Se relee sólo al
  cambiar de mes, nunca al abrir el popover con el mismo mes ya visible.
- **No existe ningún endpoint que diga «desde cuándo hay serie».** La única
  forma honesta de saberlo es preguntarle al historiador el mes en cuestión y
  ver qué contesta — no se inventa una fecha de arranque de planta ni se
  asume nada.
- `DetalleActivo.jsx` calcula `claveSonda = activo.senales.find(s =>
  s.historizado)?.key` — la primera señal historizada del activo, porque las
  dos de un mismo activo (p. ej. nivel y temperatura del tanque) comparten
  fuente física y preguntar por las dos sería una segunda consulta sin
  información nueva.
- Un punto de 4px, en `t.accent`, bajo el número del día — nunca un fondo de
  celda, para no compartir lenguaje visual con el propio resaltado de
  selección (`accent`/`accentSoft`) y confundir «este día está elegido» con
  «este día tiene dato». Blanco en vez de `accent` cuando el día ya es un
  extremo de la selección, por contraste sobre su fondo sólido. Leyenda
  («Hay muestras del historiador») debajo de la rejilla.

### Fase 5 — Estados de la gráfica ✅

- **Carga sin vaciar:** `useSerieHistorica`/`useSeriesHistoricas`
  (`hooks.js`) ahora recuerdan, con un `useRef`, qué señal(es) pidieron la
  última vez. Si sólo cambió el RANGO, el estado anterior se conserva
  (`{...prev, loading: true}`) mientras llega la respuesta nueva — la
  gráfica no parpadea en blanco. Si cambió la SEÑAL (cambio de pestaña), sí
  se vacía de inmediato: mostrar la curva del activo anterior bajo la
  etiqueta del nuevo, aunque fuera un instante, sería mentir sobre el dato.
- **`GraficaHistoria`** (`piezas.jsx`) recibe un nuevo prop `cargando`. Con
  datos ya pintados, sólo añade una insignia «Actualizando…» en la esquina —
  la curva sigue ahí. Sin datos suficientes, el mensaje de `GraficaAusente`
  distingue **"Consultando el historiador…"** (`cargando: true`, primera
  carga) de **"No hay muestras del historiador en este rango."**
  (`cargando: false`, el servidor ya contestó y no hay nada) — antes era un
  único mensaje genérico que no distinguía las dos causas.
- **`hasMore`**: `leerSerie()` (Fase 1) y el simulador ahora lo devuelven de
  verdad (antes se descartaba). `useSeriesHistoricas` lo agrega con `some()`
  sobre las señales pedidas; `DetalleActivo.jsx` muestra un aviso discreto
  bajo el selector cuando es `true`. Debería ser rarísimo en la práctica —el
  intervalo ya se calcula para caber en `MAX_PUNTOS`— pero si el servidor
  redondea distinto, se dice en vez de fingir que la gráfica está completa.
- **Eje X a tiempo real** (se hizo, no se dejó para después): con el hallazgo
  de que el histórico real apenas tiene ~1 día de antigüedad (ver nota de
  arriba), un rango de "Hace una semana" iba a mezclar puntos de días
  distintos bajo la misma etiqueta `HH:MM` sin fecha — confuso incluso con
  poco dato, y roto en cuanto el histórico crezca. `XAxis` pasó a
  `type="number"`/`scale="time"` sobre el timestamp crudo, con un
  `tickFormatter` que muestra hora si el rango cabe en 36 h y fecha si no; el
  tooltip (`labelFormatter` en el `<Tooltip>`, `ChartTooltip` no se tocó)
  siempre muestra fecha y hora completas. Sólo afecta a `GraficaHistoria`;
  las gráficas de Planta (`TendenciaNivel`, `PanelTendencia`) no se tocaron.
- Pruebas: `src/test/demo-eva/grafica-historia.test.jsx` (nuevo), 4 casos —
  las combinaciones de `cargando`/`datos` y qué mensaje o insignia
  corresponde a cada una, probando `GraficaHistoria` aislada con datos de
  mentira (la integración real ya la cubren las pruebas anteriores). Suite
  completa: 183 pruebas en verde, 0 fallos. Detector mecánico de diseño
  (`detect.mjs`) sobre los cuatro archivos tocados: sin hallazgos.

### Fase 6 — Verificación ✅ (automatizado; falta la revisión en pantalla)

- `npm test` (vitest): **183 pruebas en verde, 0 fallos, 6 saltadas** (las
  `LIVE=1` contra el servidor real, que no corren en este modo).
- `npm run build` + `node scripts/verificar-bundle.mjs`:
  ```
  ✔ index       27.99 KB  (techo 170 KB)
  ✔ vendor       80.8 KB  (techo 90 KB)
  ✔ three      827.21 KB  (diferido)
  ✔ El arranque no paga la pila 3D.
  ```
  `DetalleActivo` (con `SelectorRango` y su calendario ya dentro) es su
  propio trozo perezoso, ~17 KB (gzip ~6.3 KB) — no engorda `index` ni
  `vendor`, que es lo que el script protege.
- Detector mecánico de diseño (`detect.mjs`) sobre los cuatro archivos de UI
  tocados en todo el plan: sin hallazgos, en las Fases 3+4 y otra vez al
  cierre de la Fase 5.
- **Investigación de campo, no prevista en el plan original:** al confirmar
  la Fase 3+4 en pantalla, una captura llevó a verificar contra el servidor
  real si el historial de la instalación era más largo de lo que la app
  mostraba. Se cerró con evidencia directa (consultas crudas y agregadas
  contra `ac:` y `hda:`, ver [[demo-eva-historico-reciente]] en memoria): el
  historial real y usable arrancó el 19-ago ~16:07 UTC, y un arranque de
  prueba aislado del 14-ago no es recuperable con el agregado que usa la
  app. No motivó ningún cambio de código — confirmó que `GraficaAusente` y
  los puntos de «hay dato» ya se comportan como deben.
- **Bug encontrado en la revisión en pantalla y corregido (no en el plan
  original):** el tooltip de `GraficaHistoria` mostraba el epoch en
  milisegundos crudo (`1787243915000`) en vez de una fecha legible.
  `labelFormatter` en `<Tooltip>` de Recharts sólo se aplica al tooltip por
  defecto — con un `content` propio (`ChartTooltip`, compartido con otras
  gráficas), Recharts pasa el `label` tal cual. Se corrigió envolviendo
  `ChartTooltip` en un nuevo `TooltipHistoria` (mismo archivo) que formatea
  el label si es numérico, sin tocar el componente compartido. +1 prueba en
  `grafica-historia.test.jsx`. Suite completa: 184 pruebas en verde.
### Fase 7 — «Hoy» → «Tiempo real»: el búfer en vivo, no el historiador ✅

**No estaba en el plan original.** Surgió en la revisión en pantalla: con
«Hoy», el usuario forzó el nivel del tanque a 102 % y la gráfica nunca lo
mostró. Causa (no era bug): `rangoHoy()` calcula `fin = new Date()` **una
sola vez**, al pulsar el botón, y ese `fin` queda congelado hasta el próximo
clic — el número grande de la tarjeta sí sigue en vivo (viene de
`useSistemaAgua`, que sondea sin parar), pero la gráfica no vuelve a pedirle
nada al historiador. Es el mismo límite que ya tenía la ventana fija de 6 h
antes de este plan, documentado desde el principio en `historia.js` («el
borde derecho lo cubre el valor en vivo»). En vez de hacer que «Hoy»
refresque solo (tráfico extra, y el historiador de todos modos tiene
latencia — Fase 6 ya probó que puede tardar en absorber una muestra), se
reemplazó por un preset que lee de una fuente que YA se repinta sola.

- **`lib/buffer.js` ya tenía lo necesario**: `puntosDe(clave, {puntos})`
  devuelve `[{t: Date, valor}]` —con marca de tiempo, a diferencia de
  `serie()`— pensado para «gráficas con eje temporal» pero sin ningún
  consumidor hasta ahora. No hizo falta tocar el búfer.
- **`useDetalleActivo(activoId, rango, enVivo)`** (`detalleActivo.js`) gana
  un tercer parámetro. En modo vivo: no le pide nada al historiador (pasa
  `[]` a `useSeriesHistoricas`, que resuelve de inmediato sin red) y arma
  `historiaReal` desde `source.buffer.puntosDe(...)`, recalculado en cada
  `lastUpdated` nuevo — el mismo patrón de memoización por marca de tiempo
  que ya usaba `useSistemaAgua` para las sparklines.
- **`SelectorRango`**: el primer preset pasó de `{key:"hoy", label:"Hoy"}` a
  `{key:"vivo", label:"Tiempo real", Icono: Radio}` — el mismo icono
  `Radio` que `InsigniaOrigen` ya usa para «Sesión actual», para que el
  vocabulario de iconos sea el mismo en los dos sitios en vez de inventar
  uno nuevo. Arranca activo por defecto, igual que «Hoy» antes.
- **`GraficaHistoria`/`DetalleGrid`**: nuevo prop `enVivo`. La insignia de
  origen de la tarjeta (`InsigniaOrigen`) ahora refleja de dónde sale el
  dato que se está viendo AHORA, no si la señal es historizable — en modo
  vivo dice «Sesión actual», igual que ya decía para las señales sin serie
  propia. El mensaje de ausencia también se ramifica: «Sin muestras
  todavía en esta sesión.» en vivo, en vez del genérico del historiador.
- **`rangoHoy()` se eliminó** de `data/historia.js` — sin ningún llamador
  tras el cambio, mantenerla habría sido código muerto especulativo. Las
  pruebas que la usaban como «un rango cualquiera» (Fase 2) pasaron a usar
  `rangoSemana()`; su prueba dedicada (Fase 1) se quitó con ella.
- Pruebas: +6 nuevas en `selector-rango.test.jsx`/`grafica-historia.test.jsx`
  sobre el modo vivo (insignia correcta al entrar y al cambiar a «Ayer»,
  mensaje de sesión antes de que lleguen 2 muestras), −1 prueba dedicada a
  `rangoHoy()` eliminada con la función, y 1 ajuste en
  `detalle-activo-simulada.test.jsx` (esa prueba asumía que Tanque siempre
  afirma «Historiador»; ahora hay que elegir «Ayer» primero, porque el
  modo por defecto es «Tiempo real»). Neto: +4. Suite completa: **187
  pruebas en verde, 0 fallos.** `verificar-bundle.mjs` y el detector de
  diseño, repetidos: sin hallazgos.
- **Bug encontrado en la revisión en pantalla y corregido (no en el plan
  original):** elegir «Personalizado» con HOY como día de fin (día 20 y
  20, en la prueba del usuario) sólo pintaba 14 muestras en vez de las que
  cabrían en un día. Causa: `rangoPersonalizado` redondea el día de fin a
  su medianoche SIGUIENTE sin saber qué hora es, así que el rango pedido
  incluía las horas que faltan del día — que jamás pueden tener muestra— y,
  como `MAX_PUNTOS` se reparte por igual entre `inicio` y `fin`, esas horas
  futuras le robaban resolución a las horas que sí tenían dato. Se corrigió
  en `resolverRango()` (`data/historia.js`): un `fin` en el futuro se
  recorta a `ahora`, así que el intervalo se recalcula sobre el tramo real,
  no sobre el nominal. Efecto colateral bueno: también afina
  `useDiasConDato()` del calendario, que tenía el mismo patrón. +1 prueba
  (`historia.test.js`, con reloj simulado para que sea determinista). Suite
  completa: **188 pruebas en verde, 0 fallos.**
- **Bug encontrado en la revisión en pantalla y corregido (no en el plan
  original):** en «Tiempo real», una oscilación de ruido de ~0.1 (p. ej.
  102.01 a 102.12, sobre un valor forzado para probar) se veía como un
  desplome dramático. Causa: el eje Y usaba `domain={["dataMin",
  "dataMax"]}` — cualquier variación, por mínima que sea, se estira a la
  altura entera del recuadro. Se corrigió fijando el dominio a
  `senal.escala` (la misma escala 0-100/0-60/etc. que ya usa `BandaValor`
  arriba de la gráfica, `dominioY()` nueva en `piezas.jsx`), expandiéndose
  sólo si el dato real se sale de esa escala — así un valor fuera de rango
  no desaparece del recuadro, pero el ruido normal ya no parece un colapso.
  +3 pruebas sobre `dominioY()`. Suite completa: **191 pruebas en verde, 0
  fallos.** Detector de diseño: sin hallazgos.
- **Verificación final contra el servidor real, en vivo (no en el plan
  original):** el usuario reportó que "Personalizado 14→20 ago" no
  mostraba ni el 20 de agosto ni el valor forzado al 102 %. Se investigó con
  la Network tab: el `endDate` enviado ya llegaba correctamente hasta "ahora"
  (confirma el fix de arriba) y la respuesta sí traía una fila del 20 de
  agosto — sólo que el historiador tenía muy pocas cubetas con dato
  utilizable en ese rango tan amplio, ninguna cercana al 102 % en ESE
  momento. Se verificó el "Signal Name" de "Nivel porc" en el Data Explorer
  nativo de ICONICS: apunta al mismo `ac:TDCON/DEMO/SENSORES/SNIVEL_TANQUE`
  que usa la app, así que no era un punto distinto. Al repetir la misma
  consulta un rato después (el colector de ese punto loguea cada 10 s), el
  102 % sí apareció. Conclusión: nunca hubo bug — el valor forzado sí llega
  al historiador, sólo que la primera consulta se hizo antes de que el
  colector absorbiera esa muestra. Cierra la duda sobre si el recorte de
  `fin` y la escala del eje Y funcionan de verdad contra el servidor real, no
  sólo contra el simulador de las pruebas.

---

## 4 · Decisiones abiertas para quien ejecute

- Formato exacto del popover de calendario (uno o dos meses visibles a la
  vez) — sin restricción de producto, a criterio de implementación. Se
  construyó de un mes, con navegación prev/siguiente.
- Si el eje X de `GraficaHistoria` pasa a tiempo real en esta fase o se deja
  para después (ver Fase 5) — se hizo en la Fase 5, no se dejó pendiente.

---

## 5 · Checklist de revisión en pantalla

Lo único que falta para cerrar el plan entero. En `eva-detalle`:

- [x] **Tanque** y **Distribución**: aparece la fila de 4 controles (Tiempo
      real · Ayer · Hace una semana · Personalizado) sobre la rejilla de
      tarjetas, con «Tiempo real» activo al entrar.
- [x] **Bombeo** y **Eléctrico**: el control NO aparece.
- [x] **«Tiempo real»**: la insignia de la tarjeta dice «Sesión actual», y
      forzar un valor en vivo (el 102 % que motivó esta fase) sí terminó
      apareciendo en la curva — confirmado con capturas reales.
- [x] Clic en «Ayer» y en «Hace una semana»: cambia el marcado activo, la
      insignia pasa a decir «Historiador», y la gráfica se actualiza sin
      parpadear en blanco.
- [x] «Personalizado»: abre el calendario; los días con muestras reales
      llevan el punto de acento; «Aplicar»/«Cancelar» funcionan — y de
      paso se verificó contra el servidor real que el recorte de `fin` a
      "ahora" y la escala fija del eje Y funcionan de verdad, no sólo en
      las pruebas.
- [x] Cambiar de pestaña (p. ej. Tanque → Distribución) conserva el preset
      elegido — no vuelve a «Tiempo real» por defecto.
- [x] El eje X de las gráficas se lee bien tanto en modo vivo/«Ayer»
      (horas) como en un rango de varios días (fechas), y el tooltip
      muestra fecha y hora, no un número crudo — confirmado con capturas.
- [x] Se ve correcto en modo oscuro y en el tema Mitsubishi — confirmado
      con capturas de ambos.
- [x] Ancho angosto (ventana estrecha o el sidebar plegado): el grupo de 4
      controles envuelve en dos filas en vez de encogerse hasta ilegible.

**Plan 11 cerrado el 20-ago-2026**, confirmado por el usuario ("Sí, todo
funciona"). Ocho fases (una fusión 3+4, más la Fase 7 no prevista), 191
pruebas en verde, dos bugs reales encontrados y corregidos en la revisión
(tooltip con epoch crudo; eje Y estirando ruido), y una investigación de
campo contra el servidor real que confirmó — sin necesidad de cambiar
código — que el historiador de esta instalación es joven y que el recorte
de rango funciona de punta a punta.
