# PLAN 44 — Reportes por plantilla: ocho tipos que el asistente sabe generar

**Estado:** ESCRITO el 23-09-2026 · F0–F7 por completar · tres decisiones abiertas para el usuario (§6)
**Rama:** `UI-Limpieza1.0`
**Origen:** el usuario entregó en `Documentos/Reportes/` ocho carpetas, una por
tipo de reporte, cada una con un `.docx` de ejemplo (la maqueta) y un `.png`
(el arte de su portada): «cada uno representa un tipo de reporte que el tool
calling tiene que saber responder […] cuando el usuario pregunte "Genérame un
Reporte Técnico sobre el sistema" se tendría que generar un reporte usando ese
como plantilla».

> Este plan es del **asistente y su PDF**. No añade vistas al tablero, no
> toca el tanque y no cambia el reporte que ya existe: el «catálogo entero»
> de hoy pasa a ser un tipo más, y sigue saliendo igual.

---

## 0. Lo que hay hoy, medido

### El reporteo actual

| Pieza | Dónde | Qué hace |
|---|---|---|
| La herramienta `generar_reporte` | `backend/ia/herramientas/historicos/index.mjs` líneas 1393–1759 (≈370 líneas) | Resuelve señales de UNA máquina, lee cada serie del historiador, dibuja un SVG por señal, arma una tabla con el valor actual de las que no tienen serie, y escribe `<uuid>.pdf` en `config.reportes.dir` |
| El compositor | `backend/ia/reporte.mjs` (644 líneas, pdfkit + svg-to-pdfkit, import diferido) | UNA plantilla: portada TDCON (fondo, banner, título, folio), cintillo por página, pie «Folio · Página X de Y», secciones Síntesis / Resumen del asistente / Valores actuales / Tendencias / Notas |
| La definición que ve el modelo | `backend/ia/conversacion/definiciones.mjs` línea 743 | Argumentos `senales[]`, `periodo`, `sistema`, `explicacion`. Sin noción de tipo |
| El prompt | `backend/ia/conversacion/chat.mjs` línea 795 | «Si piden un reporte, un PDF o "expórtame los datos", usa generar_reporte» |
| Rótulos en dos idiomas | `backend/ia/i18n/etiquetasReporte.mjs` | Un mapa fijo por clave, es/en |
| La marca | `backend/ia/marca/` (3 PNG versionados, 1,6 MB) | Su ausencia no truena: se dibuja el reemplazo en vectores |
| Descarga | `GET /api/reportes?id=` con enlace firmado en la frontera (`chatRoutes.mjs`) | El adjunto viaja como `{tipo:'reporte', formato:'pdf', url, titulo}` y el chat pinta `ReporteDescarga` |
| Pruebas | `verificar-herramientas` (13 comprobaciones de `generar_reporte`), `backend/test/reporte-color.test.mjs`, `test/rutas/reportes.test.mjs` | Verifican el reparto gráfico/tabla, la máquina configurada, que no se mezclan máquinas, el idioma, y que el archivo escrito es `%PDF` |

La síntesis del PDF la escribe **código** (`sintesisAutomatica`), la
interpretación de cada gráfico también (`describirTendencia`); el modelo sólo
aporta `explicacion`, opcional y rotulada como suya. Ésa es la regla que este
plan conserva en las ocho plantillas (§2.3 de `CLAUDE.md`).

### Lo que el usuario entregó

| Carpeta | Maqueta (.docx) | Arte (.png) | Folio de la maqueta |
|---|---|---|---|
| Reporte Tecnico | 7 secciones: resumen operativo, indicadores, tendencias, estadísticas, análisis técnico, conclusiones, firmas | 667×295, banner horizontal, 249 KB | `TDCON-TEC-0001` |
| Reporte de Vibraciones | estado general CMS, puntos de medición, espectro, tendencias RMS, diagnóstico, recomendaciones | 426×532, vertical, 531 KB | — |
| Reporte de Lectura de Sensores | variables monitoreadas, lecturas/trazabilidad, tendencia, calibración y calidad de dato, acciones, cierre | 343×429, vertical, 402 KB | `TDCON-SEN-001` |
| Reporte de Riesgos | matriz P×I, principales riesgos, plan de mitigación, riesgo residual, aprobaciones | 431×539, vertical, 620 KB | — |
| Reporte de Alarmas | resumen por severidad, eventos recientes, distribución/tendencia, análisis de causa, plan de acción, cierre | 397×496, vertical, 383 KB | `TDCON-AL-001` |
| Reporte de Ingenieria | resumen del proyecto, avance e indicadores, hallazgos técnicos, evidencia/tendencias, decisiones, plan de acción, aprobaciones | 505×505, cuadrado, 613 KB | `TDCON-ING-0001` |
| Reporte de Energias | consumo energético, tendencia de consumo, balance de variables, eficiencia, oportunidades, conclusión/firmas | 469×545, vertical, 629 KB | `TDCON-ENE-001` |
| Reporte de Predicciones | predicción de fallas, equipos/score, consumo pronosticado, variables influyentes, recomendaciones, seguimiento | 438×578, vertical, 645 KB | — |

Las ocho maquetas comparten una anatomía: **portada** con arte + título +
lema + dos o tres «chips» de dato (PERIODO, FOLIO, PRIORIDAD…), una franja de
cabecera `TDCON | REPORTE DE …`, un pie «TDCON · Página N», y un cuerpo hecho
de **seis tipos de bloque**: tarjetas de indicador (4 en fila, con valor y
subtítulo), tabla, gráfica con rótulo, cuadro de texto («Interpretación»,
«Conclusión»), matriz, y bloque de firmas (Elaboró / Revisó / Aprobó). Esa
anatomía común es lo que hace viable un **solo compositor** (§2, D2).

Los valores de las maquetas —«Nivel 78 %», «Bomba P-101», «12 críticas»— son
**ejemplos de relleno**, no datos. Ninguno se copia (§2, D3).

### Dos hechos de la carpeta que hay que resolver en F0

1. **`Documentos/Reportes/` es la carpeta de SALIDA de `generar_reporte`**
   (`config.reportesDir`, `backend/config.mjs` línea 275), está en
   `.gitignore` (línea 9, `Documentos/`) y la purga borra los `.pdf` con más de
   30 días. Los catorce PDF sueltos con nombre UUID que hay al lado de las
   carpetas son reportes que el asistente generó antes (uno es la
   conversación del 01-09-2026). La purga no toca `.docx` ni `.png`, así que
   las plantillas no corren peligro, pero **no viajan con el repo** y viven
   mezcladas con la salida. Se mueven (F0).
2. **El arte pesa 4,1 MB entre los ocho** y ya viene reducido (el PNG dentro de
   cada `.docx` es el mismo a 2,2–2,8 MB). Se versiona el arte, no las
   maquetas (§2, D6).

### La máquina contra la que se mide

`vib-motor-03` en planta (86 variables, 74 series verificadas) y la espejo en
pruebas (`scripts/lib/vibraciones-espejo.json`: 73 variables, 36 con serie
declarada). Lo que el tipo `vibraciones` sabe medir, por familia de rol:

| Familia | Claves | Sirve a |
|---|---|---|
| `medida` | vRMS, aRMS, aPeak, DKW × 3 apoyos | indicadores, tendencias, puntos de medición, estadísticas |
| `bandera` | alarma, aviso, offset × 3 | alarmas (estado ahora; flancos si la serie está verificada, Plan 42) |
| `variador` | velocidad, frecuencia, tensionSalida, corriente, par, potencia, busCC, fallo, ultimoFallo, aviso, listo, habilitado | régimen, energía (potencia/corriente/tensión), alarmas del variador |
| `vigilancia` | monVRMS, monARMS, monDKW, monEspectroA/V, bpfo, bpfi, ftf × 3 | estado del módulo (sólo en vivo, no se historizan) |
| `calidad` | qcVRMS, qcARMS, qcDKW × 3 | calidad de dato |

Lo que el tipo **no** tiene y varias maquetas piden: temperatura, espectro de
frecuencias (el módulo publica vigilancias, no el espectro), ejes
axial/horizontal/vertical (el SM 1281 mide un eje por sensor), contador de
energía (kWh), factor de potencia, caudal, mecanismos de desgaste declarados
(`pronostico_de_desgaste` se niega), fechas de calibración, probabilidad e
impacto de un riesgo (las reglas dan `nivel`: informativo / atención / crítico,
más `evidencia`, `consecuencia`, `accion` y `norma`). El Alarm Server da 500 a
`AlarmHistory` para cualquier punto (Plan 41 F4), así que las alarmas son
flancos de banderas historizadas, y hoy **ninguna ha alarmado nunca**.

---

## 1. Viabilidad, plantilla por plantilla

Criterio: una sección es **viable** si hoy hay una fuente determinista que la
llene; **parcial** si parte de sus columnas no tienen fuente en esta
instalación (se dibujan con su motivo, D3); **bloqueada** si ninguna la tiene.

| # | Tipo (`tipo=`) | Veredicto | Lo que se llena con lo que hay | Lo que NO hay, y qué se hace |
|---|---|---|---|---|
| 1 | `tecnico` | **Viable** | Indicadores: las 4 medidas de mayor jerarquía del tipo con su valor y su variación contra el período anterior (`comparar_periodos`). Tendencias y Estadísticas (mín/máx/promedio/unidad/cobertura): `leerSerieEnRango` + `resumirSerie`, como hoy. Análisis técnico (variable / condición / observación / recomendación): estado por banda del dominio + `evidencia` y `accion` de la regla activa. Conclusiones: `sintesisAutomatica` + `explicacion` del modelo, rotulada | Nada bloqueado. Firmas: «Elaboró» lo firma el asistente (D10); Revisó/Aprobó en blanco |
| 2 | `vibraciones` | **Parcial alto** | Estado general: estado global del dominio (Normal/Atención/Crítico), vRMS máximo del período con su apoyo, banderas activas ahora. Puntos de medición: una fila por apoyo con vRMS, aRMS, aPeak, DKW y estado (las columnas son las medidas del tipo, no los ejes de la maqueta). Tendencias RMS: gráficas de vRMS por apoyo. Diagnóstico: riesgos activos con `evidencia`, `consecuencia` y `norma`. Recomendaciones: `accion` de cada regla activa, prioridad = `nivel` | «Salud equipo 87 %»: no existe un índice de salud; **no se inventa**, va el estado global. Temperatura: no instrumentada. Espectro: el módulo no lo publica; la sección lo dice y muestra las vigilancias `monEspectro*` en vivo. Responsable/fecha: en blanco |
| 3 | `lectura-de-sensores` | **Viable** | Variables monitoreadas: tarjetas con las medidas y su tag. Lecturas/trazabilidad: tag (`pointName`), variable, rango (la banda del tipo si la declara, si no «—»), lectura, desvío respecto al promedio del período, estado (banda + calidad OPC). Tendencia: gráficas. Calidad de dato: calidad OPC ahora, serie verificada o no y cómo (`historyVerifiedComo`), las QC del módulo | Calibración (última/próxima): no hay dato; la tabla lleva esa columna con «sin registro» y la sección se titula «Calidad de dato» primero. Acciones: en blanco |
| 4 | `riesgos` | **Parcial** | Principales riesgos: `riesgos_activos` (id, título, nivel, evidencia, estado «activo»), más los **no evaluables** y los **sin comprobar** con su motivo (es lo que el dominio ya separa). Plan de mitigación: `accion` de cada regla + intervenciones registradas para esa máquina (`hechos_de_la_planta`). Riesgo residual: `explicacion` del modelo, rotulada | **La matriz P×I no se puede llenar con verdad**: el motor produce un nivel, no una probabilidad ni un impacto. Se sustituye por «Riesgos por nivel» (crítico / atención / informativo) — **decisión abierta §6.1** |
| 5 | `alarmas` | **Parcial** | Resumen: banderas y fallos del variador activos ahora, contados por severidad **derivada del rol** (`bandera:alarma` y `variador:fallo` → crítica; `bandera:aviso` y `variador:aviso` → alta; `bandera:offset` → media), y la tabla lo declara. Eventos recientes: flancos de las banderas **con serie verificada** en el período (la cadena de flancos del Plan 42 F3). Distribución: ocurrencias por intervalo de esos flancos. Análisis de causa: por cada bandera activa, el riesgo del motor que la explica | Hoy no hay flancos porque nada ha alarmado: la tabla dirá «sin eventos en el período» y eso es verdad, no un hueco. Sin Alarm Server (500). Plan de acción: en blanco |
| 6 | `ingenieria` | **Parcial bajo** | Hallazgos técnicos: riesgos activos + hechos vigentes + intervenciones de la máquina, con impacto = `consecuencia` y prioridad = `nivel`. Evidencia/tendencias: gráficas. Indicadores: hallazgos (n), riesgo actual (nivel máximo), señales sin lectura | Avance por disciplina, pendientes, objetivo del proyecto, decisiones de ingeniería, plan de acción: **son de gestión, no de planta**; se dibujan como campos a llenar a mano, y la síntesis lo dice. Es la plantilla con menos dato propio |
| 7 | `energias` | **Parcial bajo** | Lo que el variador da: potencia (kW), corriente, tensión de salida, bus CC — valor ahora, tendencia y mín/máx/promedio. Demanda máxima = potencia máxima del período | kWh: no hay medidor. Se puede **estimar integrando la potencia del variador** sobre las muestras del período, declarado como estimación con su cobertura — **decisión abierta §6.2**. Flujo/agua, PF, meta, ahorro: sin fuente en esta máquina |
| 8 | `predicciones` | **Bloqueada hoy** | Nada: `pronostico_de_desgaste` se niega porque el tipo `vibraciones` no declara mecanismos de desgaste; el módulo Predicción es otra fuente (API externa, §2.1: nunca se mezcla) y está oculto | La herramienta **se niega con motivo** («esta máquina no declara mecanismos de desgaste; el tipo tendría que declararlos») en vez de emitir un PDF con secciones vacías. La plantilla se escribe igual para el día en que un tipo lo declare — **decisión abierta §6.3** |

Resumen: tres plantillas salen completas con los datos de hoy (1, 3 y, con
sus sustituciones dichas, 2), tres salen parciales y honestas (4, 5, 6), una
parcial baja (7) y una bloqueada (8). **Ninguna necesita una dependencia
nueva** ni una fuente distinta de ICONICS.

---

## 2. Decisiones de diseño, marcadas

**D1 · El PDF se sigue dibujando con pdfkit; las maquetas son la
especificación visual, no un archivo que se rellena.** Rellenar el `.docx`
exigiría una librería de plantillas Word más un conversor a PDF
(LibreOffice o similar) en el servidor de planta: dos dependencias nuevas y un
proceso externo, contra §6.2 y §4.8. pdfkit ya está, ya dibuja la marca, y las
maquetas se reproducen con seis tipos de bloque (§0). Lo que se pierde: la
edición posterior en Word. Lo que se gana: ningún proceso externo, y que el
PDF sale igual en cualquier máquina.

**D2 · Una plantilla es un módulo declarativo; hay un solo compositor.**
`backend/ia/reportes/plantillas/<tipo>.mjs` declara `{ id, folioPrefijo,
portada: { arte, titulo, lema, chips[] }, secciones: [{ bloque, titulo,
fuente, columnas… }] }` y `backend/ia/reportes/compositor.mjs` sabe dibujar
cada `bloque` (`indicadores`, `tabla`, `graficas`, `texto`, `lista`,
`firmas`, `ausencia`). Los datos los traen **recolectores** deterministas
(`backend/ia/reportes/recolectores.mjs`) que llaman a las herramientas que ya
existen —`estado_del_sistema`, `riesgos_activos`, `leerSerieEnRango`,
`comparar_periodos`, `hechos_de_la_planta`, la cadena de flancos— igual que
hoy hace `resumen_de_turno`. Añadir la novena plantilla es escribir un módulo
de datos, no tocar el compositor.

**D3 · Una sección sin fuente se dibuja con su motivo; nunca se omite en
silencio ni se rellena con el ejemplo de la maqueta.** «Esta máquina no
instrumenta temperatura», «El módulo publica vigilancias del espectro, no el
espectro», «Sin eventos de alarma en el período». Es §2.4 y §2.5 de
`CLAUDE.md` puestos en papel, que es donde más duran. El bloque `ausencia`
existe para eso, y el manifiesto del PDF (D8) cuenta cuántas secciones
salieron con dato y cuántas sin él, para que la respuesta del asistente lo
diga.

**D4 · `tipo` es un argumento de `generar_reporte`, no ocho herramientas
nuevas.** Un enum con descripción por valor: `catalogo` (lo de hoy, por
omisión: ninguna llamada existente cambia), `tecnico`, `vibraciones`,
`lectura-de-sensores`, `riesgos`, `alarmas`, `ingenieria`, `energias`,
`predicciones`. Ocho herramientas compartirían el 90 % de sus argumentos y
llevarían la lista del modelo de 26 a 34, que es peor para un modelo pequeño
que un enum. Además, un normalizador determinista `tipoDeReporte(texto)`
(«reporte de sensores» → `lectura-de-sensores`, «reporte CMS» →
`vibraciones`, «technical report» → `tecnico`) absorbe que el modelo pase
texto libre en vez del valor exacto. Un tipo irreconocible → `fallo` con la
lista de tipos, no un PDF genérico.

**D5 · Folio por tipo.** Hoy `TDCON-AAAAMMDD-XXXX`; pasa a
`TDCON-<PREFIJO>-AAAAMMDD-XXXX` con los prefijos de las maquetas (TEC, SEN,
AL, ING, ENE) y tres que las maquetas no traen (VIB, RIE, PRE). `catalogo`
conserva el folio sin prefijo. La cola aleatoria se mantiene: el compositor
no escribe en disco (cabecera de `generarFolio`).

**D6 · Se versiona el arte, no las maquetas.** Los ocho PNG (4,1 MB) van a
`backend/ia/marca/portadas/<tipo>.png` y se cargan con la misma tolerancia que
`cargarMarca`: si falta, la portada sale con el fondo azul de hoy. Los
`.docx` (≈20 MB entre los ocho, cada uno con el arte a tamaño completo dentro)
no entran al repo: su contenido está transcrito en §0 y §1 de este plan, que
es lo que el código necesita, y el usuario los conserva en
`Documentos/Plantillas/` (fuera de la carpeta de salida, igual de ignorada).
**Decisión abierta §6.4** si se prefiere versionarlos.

**D7 · Dos portadas, un compositor.** La maqueta del Técnico lleva el arte
como banner horizontal arriba; las otras siete, arte vertical a la izquierda
y el bloque de título con sus chips a la derecha. `portada.arte.disposicion:
"banner" | "lateral"` decide; el resto (lema, chips, folio, firma de marca al
pie) es el mismo código.

**D8 · El compositor devuelve un manifiesto, y eso es lo que se prueba.** No
hay parser de PDF en el backend y no se añade uno. `componerPorPlantilla`
devuelve `{ pdf, paginas, secciones: [{ id, bloque, conDato, motivo }] }`, y
las pruebas afirman sobre el manifiesto y sobre el **modelo de documento**
que el recolector arma (filas, indicadores, ausencias) — no sobre los bytes.
El `%PDF` y el número de páginas siguen siendo la prueba de humo. Lo que el
modelo de documento dice, la respuesta de la herramienta lo repite
(`seccionesConDato`, `seccionesSinDato`) para que el asistente no describa
un PDF que no vio.

**D9 · El modelo redacta una sola caja, y va rotulada.** `explicacion` (ya
existe) cae en «Conclusiones» / «Riesgo residual» / «Diagnóstico probable»
según la plantilla, siempre bajo el rótulo «Redacción del asistente». Nunca
en una tarjeta de indicador, una tabla ni una severidad. La síntesis en código
sigue siendo la primera línea del cuerpo.

**D10 · «Elaboró» lo firma el asistente; el usuario no llega a la
herramienta.** La herramienta corre dentro del bucle del modelo y no sabe
quién preguntó (por eso el enlace se firma en la frontera, `chatRoutes.mjs`).
Pasar `request.usuario` al contexto de `ejecutar` es un cambio en `chat.mjs`,
archivo caliente de Gustavo (D11). Se firma «Asistente de planta TDCON ·
generado automáticamente» y Revisó/Aprobó quedan con línea para firmar a
mano. Si más adelante se quiere el nombre del operador, es una línea en el
contexto y otra en el compositor, y queda anotado en el backlog.

**D11 · Este plan pisa la zona de Gustavo, y lo dice.** Todo vive en
`backend/ia/**`. Lo que es nuevo (`backend/ia/reportes/`,
`backend/ia/marca/portadas/`) no choca con nadie. Lo que se edita de lo
existente: `historicos/index.mjs` (sólo `generar_reporte`),
`definiciones.mjs` (un argumento nuevo: **archivo caliente**, commit pequeño y
avisado), `chat.mjs` línea 795 (una frase sobre los tipos: **caliente**,
igual), `etiquetasReporte.mjs`, `reporte.mjs` (extraer piezas). Antes de F3 y
F5 se avisa a Gustavo qué archivos se tocan; `verificar-herramientas` y
`verificar-chat` son suyos también y reciben comprobaciones nuevas al final
del archivo, en su propio bloque, para que el merge sea trivial.

**D12 · Una plantilla que no tiene NINGUNA sección con dato no emite PDF.**
Es el caso de `predicciones` hoy. Emitir un documento con ocho «sin fuente» es
la degradación silenciosa que §2.5 prohíbe; la herramienta se niega diciendo
qué tendría que declarar el tipo, y el manifiesto lo demuestra en la prueba.
Una plantilla con al menos una sección con dato sí sale, con sus ausencias
dichas (D3).

**D13 · Caracteres fuera de WinAnsi se dibujan, no se escriben.** Las
maquetas usan ▲ y ▼ para la variación de un indicador; las fuentes estándar de
pdfkit (Helvetica) no los tienen y saldrían como cuadrados. Los triángulos se
dibujan con `doc.polygon`, verdes o rojos según el signo, con el número al
lado. `·`, `—`, `°` y `%` sí están en WinAnsi y se siguen escribiendo.

**D14 · Tope de series por plantilla.** El `catalogo` de hoy dibuja todas
las series de la máquina (36 en la espejo, 74 en planta) y tarda lo que tarde
el historiador. Las plantillas nuevas piden **lo que su sección declara**:
4 indicadores, hasta 8 gráficas (las medidas por apoyo, o las del variador
en `energias`), y las estadísticas de las mismas. No se lee lo que no se
dibuja. El tiempo se mide en F7 con `vib-motor-03`.

---

## 3. Las fases

### F0 — Ordenar la carpeta, versionar el arte, cerrar las decisiones abiertas

**Objetivo.** Que las plantillas dejen de vivir en la carpeta de salida, que
el arte viaje con el repo, y que las tres decisiones de §6 tengan respuesta
antes de escribir código que dependa de ellas.

**Pasos.**
1. Mover `Documentos/Reportes/<ocho carpetas>` a `Documentos/Plantillas/`
   (sigue ignorada por `.gitignore` línea 9; lo hace el usuario o este plan
   con `git mv`-equivalente fuera del índice). Los catorce PDF sueltos se
   quedan: son salida, y la purga los gestiona.
2. Copiar los ocho PNG a `backend/ia/marca/portadas/<tipo>.png` con el nombre
   del `tipo` (D4) y actualizar `backend/ia/marca/LEER.txt` con la lista y la
   regla de tolerancia.
3. Registrar el plan en `docs/HANDOFF.md` §5 («los planes vivos», el número 44
   deja de estar libre → el siguiente es el 45) y en `CLAUDE.md` §6.1.
4. Anotar en el plan las respuestas a §6.

**Criterios de aceptación.** Los ocho PNG en el repo con su `IHDR` legible por
`dimensionesPng`; `Documentos/Reportes/` sólo con PDF; HANDOFF y CLAUDE.md
citan el plan. Commit: «Plan 44 F0: el arte de las ocho portadas y la carpeta
de plantillas fuera de la salida».

### F1 — El compositor genérico por bloques, sin cambiar el PDF de hoy

**Objetivo.** Extraer de `reporte.mjs` las piezas de marca y de layout
(portada, cintillo, pie, `tituloSeccion`, `cajaResumen`, la tabla de valores,
el bloque de gráfica) a `backend/ia/reportes/compositor.mjs`, y añadir los
bloques que las maquetas piden: `indicadores` (4 tarjetas con valor, unidad,
subtítulo y variación con triángulo dibujado, D13), `tabla` (columnas
declaradas, anchos por proporción, color por clave como hoy), `texto` (caja
con rótulo de procedencia), `lista`, `firmas`, `ausencia`, y la portada
`lateral` (D7).

**Regla.** `componerReportePdf` y `componerConversacionPdf` siguen exportadas
desde `reporte.mjs` y producen el **mismo documento**: las 13 comprobaciones
de `verificar-herramientas` y `reporte-color.test.mjs` pasan sin tocarlas. El
compositor nuevo se prueba con un modelo de documento sintético.

**Pruebas nuevas** (`backend/test/reportes/compositor.test.mjs`): el
manifiesto cuenta bien secciones con y sin dato; una sección `ausencia` lleva
su motivo; el PDF empieza por `%PDF`; una tabla de 60 filas pagina sin
solapar (se afirma sobre `paginas`, no sobre bytes); el folio lleva el
prefijo del tipo; sin arte, la portada sale (tolerancia de `cargarMarca`).

**Riesgo.** Mover código de layout que hoy funciona. Contramedida: mover sin
reescribir, y correr las comprobaciones existentes antes y después.

### F2 — Los recolectores deterministas

**Objetivo.** `backend/ia/reportes/recolectores.mjs` con una función por
fuente, todas con la misma forma de salida `{ ok, datos } | { ausente:
motivo }`, sin dibujar nada:

| Recolector | De dónde | Para |
|---|---|---|
| `estadoActual(sistema)` | `estado_del_sistema` | indicadores, puntos de medición, lecturas, banderas activas |
| `seriesConEstadisticas(sistema, claves, ventana)` | `leerSerieEnRango` + `resumirSerie` + `calcularTendencia` + cobertura | tendencias, estadísticas, RMS máximo, desvío |
| `variacionContraPeriodoAnterior(sistema, claves, ventana)` | misma lógica que `comparar_periodos` | los ▲▼ de los indicadores |
| `riesgos(sistema)` | `riesgos_activos` + las reglas del tipo (`evidencia`, `consecuencia`, `accion`, `norma`, `nivel`) | riesgos, diagnóstico, análisis técnico, hallazgos |
| `alarmas(sistema, ventana)` | banderas por rol + flancos de las series verificadas (Plan 42 F3) | resumen por severidad derivada, eventos, ocurrencias por intervalo |
| `aprendizaje(sistema)` | `hechos_de_la_planta` (hechos vigentes e intervenciones de esa máquina) | plan de mitigación, hallazgos |
| `energiaDelVariador(sistema, ventana)` | series de `variador:potencia/corriente/tensionSalida/busCC` | energías; la integración de kWh sólo si §6.2 dice sí, y siempre con `estimado: true` y su cobertura |
| `calidadDeDato(sistema)` | calidad OPC del estado + `historyVerified`/`historyVerifiedComo` de la configuración | lectura de sensores |

Cada recolector se prueba con el cliente falso y la espejo
(`backend/test/reportes/recolectores.test.mjs`): con serie → datos; sin serie
→ `ausente` con motivo que nombre la señal; máquina cerrada → el `fallo` de
`resolverSistema` sin envolver.

### F3 — Las tres plantillas completas: `tecnico`, `vibraciones`, `lectura-de-sensores`

**Objetivo.** Escribir los tres módulos de plantilla, el argumento `tipo` en
`generar_reporte` y en `definiciones.mjs` (enum con descripción por valor,
D4), el normalizador `tipoDeReporte(texto)`, el prefijo de folio (D5), los
rótulos es/en de las tres en `etiquetasReporte.mjs`, y la frase del prompt en
`chat.mjs` línea 795 («…y elige el `tipo` que el usuario nombre: técnico,
vibraciones, sensores…»). `catalogo` sigue siendo el valor por omisión.

**Comprobaciones nuevas** en `verificar-herramientas` (bloque propio al final,
D11): `tipo:"tecnico"` sobre la espejo emite PDF con 4 indicadores, N gráficas
y la tabla de análisis, y el manifiesto no trae ausencias salvo firmas;
`tipo:"vibraciones"` trae una fila por apoyo y la sección «Espectro» como
`ausencia` con su motivo; `tipo:"lectura-de-sensores"` trae la columna de
calibración en «sin registro»; `tipo:"inexistente"` → `fallo` con la lista;
`"reporte de sensores"` normaliza a `lectura-de-sensores`; sin `tipo` el
resultado es idéntico al de hoy (mismas `senalesConGrafico`). En
`verificar-chat`: «Genérame un reporte técnico sobre el sistema», «Quiero el
reporte de vibraciones del motor de la última semana» y «Sensor readings
report» llaman a `generar_reporte` con el `tipo` correcto, y la respuesta no
inventa el enlace ni describe secciones que el manifiesto marcó sin dato.

**Antes de tocar `definiciones.mjs` y `chat.mjs`:** la puerta (§5.1 de
`CLAUDE.md`) en verde y aviso a Gustavo (D11). Commit por plantilla si el
diff lo justifica; como mínimo uno por fase.

### F4 — `riesgos` y `alarmas`, con las sustituciones decididas

**Objetivo.** Los dos módulos con lo que §1 dice: riesgos por nivel en lugar
de la matriz P×I (según §6.1), no evaluables y sin comprobar como secciones
propias; alarmas con la severidad derivada del rol y declarada en el pie de
la tabla, flancos del período, ocurrencias por intervalo y análisis de causa
por el motor.

**Comprobaciones.** Sobre la espejo con el falso «en marcha» y una bandera
forzada a 1: el resumen cuenta 1 crítica y lo atribuye al rol; sin flancos en
la ventana, «Eventos recientes» es `ausencia` con «sin eventos en el
período», no una tabla vacía; un riesgo activo sale con `evidencia` y `accion`
literales de la regla; el plan de acción lleva filas en blanco y ningún
responsable inventado.

### F5 — `ingenieria`, `energias`, `predicciones`

**Objetivo.** Los tres módulos restantes con lo que §1 permite: `ingenieria`
con hallazgos derivados y campos de gestión en blanco; `energias` con el
variador (y la integración de kWh sólo si §6.2 lo aprueba, `estimado: true`);
`predicciones` que **se niega con motivo** mientras el tipo no declare
mecanismos de desgaste (D12), y emite si algún día los declara.

**Comprobaciones.** `predicciones` sobre la espejo → `fallo` cuyo texto nombra
«mecanismos de desgaste» y `capacidades`; `energias` sin la integración →
secciones de flujo/PF/meta como `ausencia`; `ingenieria` → indicadores de
hallazgos con `n` igual a riesgos activos + hechos + intervenciones.

### F6 — Inglés, documentación y lo que ve el chat

**Objetivo.** Los rótulos EN de las ocho plantillas (las maquetas están en
español; el inglés lo escribimos nosotros con el mismo criterio que
`etiquetasReporte.mjs`); el título del adjunto lleva el tipo («Reporte
técnico — Nuevo-Modor — la última semana») sin tocar `Asistente.jsx` (ya pinta
`adjunto.titulo`); `docs/HANDOFF.md` §0 (tabla del asistente: dónde viven los
reportes) y §9 (cuentas nuevas de `verificar-herramientas` y `verificar-chat`),
`CLAUDE.md` §5.1 (las cuentas), `backend/README.md` (la carpeta de portadas),
`README.md` (que `Documentos/Plantillas/` no es salida), `marca/LEER.txt`.

### F7 — Contra planta, y cierre

**Objetivo.** Con el backend contra ICONICS y `vib-motor-03`, pedir los ocho
desde el chat con frases naturales, abrir los PDF, y medir: **tiempo** por
plantilla (D14), **tamaño** (el arte añade ~0,5 MB por portada), y que cada
sección sin dato diga su motivo de verdad y no uno genérico. Lo que salga se
escribe en el plan tal como pasó, se archiva en `docs/completados/` y se
actualizan HANDOFF y CLAUDE.md. Si algo se mide mal (una plantilla tarda más
de lo razonable, un PDF pesa demasiado), se decide **con la medida delante**,
no antes.

---

## 4. Riesgos

- **Que el modelo pequeño elija mal el tipo o pase texto libre.** Contramedida:
  el enum con descripción por valor + el normalizador determinista (D4) +
  casos en `verificar-chat`. Si aun así falla, se mide con el banco de
  evaluación antes de tocar el prompt.
- **Tiempo de generación.** Cada plantilla lee sus series del historiador;
  `tecnico` puede pedir 8 series × la ventana. Contramedida: D14 y la medida
  de F7. No se sube ningún timeout sin medirlo.
- **Merge con `AjustesGustavo5.0`.** `definiciones.mjs`, `chat.mjs`,
  `verificar-herramientas.mjs` y `verificar-chat.mjs` son suyos. Contramedida:
  D11 (nuevo en bloques propios al final, avisos antes de F3 y F5, commits
  pequeños con sólo eso).
- **Reproducir la maqueta «a ojo».** Las maquetas son Word; el PDF no será
  idéntico. Se reproduce la anatomía (portada, franja, tarjetas, tablas,
  firmas) y la paleta de marca, no el píxel. El usuario valida en F7 y lo que
  no le convenza se ajusta con el documento delante.
- **Tentación de rellenar.** Una tarjeta vacía «se ve mal». D3 y D12 existen
  para que se vea mal antes que mentir; la prueba del manifiesto lo vigila.

## 5. Lo que este plan NO hace

- No rellena ni emite `.docx`; no hay salida Word.
- No añade dependencias (ni de plantillas, ni de parsing de PDF, ni de imagen).
- No cambia el reporte de hoy: `catalogo` sale igual, byte a byte salvo el
  folio si se decide prefijarlo (no se decide: se queda sin prefijo, D5).
- No pasa el usuario de la sesión a la herramienta (D10); queda en el backlog.
- No toca el tanque ni su fuente en vivo; una plantilla sobre el tanque saldrá
  sola cuando sea máquina configurada (Plan 43).
- No añade vistas ni botones al tablero: el reporte se pide al asistente y se
  descarga desde el chat, como hoy.
- No numera folios de forma consecutiva.

## 6. Decisiones abiertas para el usuario

1. **Riesgos, la matriz P×I.** El motor da `nivel`, no probabilidad × impacto.
   Propuesta: **sustituirla por «Riesgos por nivel»** (crítico / atención /
   informativo, con no evaluables y sin comprobar aparte). Alternativa: dibujar
   la matriz como leyenda vacía y decir que el sistema no la puebla.
2. **Energías, los kWh.** No hay medidor. Propuesta: **estimar por integración
   de la potencia del variador** sobre el período, con `estimado: true`, la
   cobertura y una nota al pie. Alternativa: sólo potencia/corriente/tensión,
   y «Consumo» como ausencia.
3. **Predicciones.** Hoy se niega con motivo (D12). Propuesta: **escribir la
   plantilla igual en F5** para cuando un tipo declare mecanismos de desgaste.
   Alternativa: sacarla del plan y anotarla en el backlog.
4. **Las maquetas `.docx`.** Propuesta: **no versionarlas** (≈20 MB; su
   contenido está en §0–§1) y guardarlas en `Documentos/Plantillas/`.
   Alternativa: versionarlas en `docs/plantillas-reportes/`.
