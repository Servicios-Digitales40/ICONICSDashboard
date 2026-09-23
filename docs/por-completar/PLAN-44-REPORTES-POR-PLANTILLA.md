# PLAN 44 — Reportes por plantilla: ocho tipos que el asistente sabe generar

**Estado:** F0–F3 completadas el 23-09-2026 (las tres plantillas con toda la información —técnico, vibraciones, lectura de sensores— se generan; las otras cinco están declaradas y la herramienta explica por qué no salen todavía) · F4–F7 por completar · las decisiones de §6 cerradas por el usuario el 23-09-2026, salvo el criterio de la matriz P×I (D15), propuesto y pendiente de su confirmación
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
   cada `.docx` es el mismo a 2,2–2,8 MB; las maquetas suman 18,4 MB). Se
   versionan las dos cosas, cada una donde la usa quien la usa (§2, D6).

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
| 4 | `riesgos` | **Parcial** | Principales riesgos: `riesgos_activos` (id, título, nivel, evidencia, estado «activo»), más los **no evaluables** y los **sin comprobar** con su motivo (es lo que el dominio ya separa). Plan de mitigación: `accion` de cada regla + intervenciones registradas para esa máquina (`hechos_de_la_planta`). Riesgo residual: `explicacion` del modelo, rotulada | **La matriz P×I no tiene hoy ni P ni I**: el motor produce un nivel. Se propone un criterio declarado para llenarla con verdad (D15); mientras no se confirme, la sección sale como «Riesgos por nivel» |
| 5 | `alarmas` | **Parcial** | Resumen: banderas y fallos del variador activos ahora, contados por severidad **derivada del rol** (`bandera:alarma` y `variador:fallo` → crítica; `bandera:aviso` y `variador:aviso` → alta; `bandera:offset` → media), y la tabla lo declara. Eventos recientes: flancos de las banderas **con serie verificada** en el período (la cadena de flancos del Plan 42 F3). Distribución: ocurrencias por intervalo de esos flancos. Análisis de causa: por cada bandera activa, el riesgo del motor que la explica | Hoy no hay flancos porque nada ha alarmado: la tabla dirá «sin eventos en el período» y eso es verdad, no un hueco. Sin Alarm Server (500). Plan de acción: en blanco |
| 6 | `ingenieria` | **Parcial bajo** | Hallazgos técnicos: riesgos activos + hechos vigentes + intervenciones de la máquina, con impacto = `consecuencia` y prioridad = `nivel`. Evidencia/tendencias: gráficas. Indicadores: hallazgos (n), riesgo actual (nivel máximo), señales sin lectura | Avance por disciplina, pendientes, objetivo del proyecto, decisiones de ingeniería, plan de acción: **son de gestión, no de planta**; se dibujan como campos a llenar a mano, y la síntesis lo dice. Es la plantilla con menos dato propio |
| 7 | `energias` | **Parcial bajo** | Lo que el variador da: potencia (kW), corriente, tensión de salida, bus CC — valor ahora, tendencia y mín/máx/promedio. Demanda máxima = potencia máxima del período | kWh: no hay medidor. Se **estima integrando la potencia del variador** sobre las muestras del período, declarado como estimación con su cobertura (decidido, §6.2). Flujo/agua, PF, meta, ahorro: sin fuente en esta máquina |
| 8 | `predicciones` | **Bloqueada hoy** | Nada: `pronostico_de_desgaste` se niega porque el tipo `vibraciones` no declara mecanismos de desgaste; el módulo Predicción es otra fuente (API externa, §2.1: nunca se mezcla) y está oculto | La herramienta **se niega con motivo** («esta máquina no declara mecanismos de desgaste; el tipo tendría que declararlos») en vez de emitir un PDF con secciones vacías. La plantilla se escribe igual para el día en que un tipo lo declare (decidido, §6.3). Vale para TODA configurada: `construirSistema` las registra con `desgaste: null` (línea 557) |

Resumen: tres plantillas salen completas con los datos de hoy (1, 3 y, con
sus sustituciones dichas, 2), tres salen parciales y honestas (4, 5, 6), una
parcial baja (7) y una bloqueada (8). **Ninguna necesita una dependencia
nueva** ni una fuente distinta de ICONICS.

### 1.1 · Para cualquier máquina configurada, no para «la de vibraciones»

Una plantilla nunca nombra una máquina ni una clave de señal: nombra
**familias de rol** (`medida`, `bandera`, `variador`, `calidad`) y
**capacidades** (`CURRENT_DATA`, `HISTORICAL_DATA`, `DIAGNOSTICS`), que son
lo que toda configurada trae de su tipo (`capacidadesDe`, `ROLES`). El
recolector pregunta al registro qué variables cumplen el rol que la sección
pide, y si el tipo no tiene esa familia, la sección sale como `ausencia` con
el nombre del tipo. Así, cuando el tanque entre como `estacion-de-llenado`
(Plan 43), el reporte técnico saldrá con nivel, caudal y presión sin que este
plan se toque; y el de vibraciones dirá «este tipo no mide vibración».

Dos cosas que hoy no declara ningún tipo y que la sección correspondiente
pediría al tipo, no a la máquina:

- **Qué medidas son «las principales»** (los cuatro indicadores del Técnico y
  de Sensores). Sin declararlo se toman las primeras cuatro medidas del
  orden del tipo, que en vibraciones es vRMS de cada apoyo y aRMS del
  primero. Declararlo es una línea por tipo (`indicadores: ["medida:vRMS",
  "variador:velocidad", …]`) y se propone hacerlo en F3.
- **El impacto de cada regla** para la matriz de riesgos (D15).

### 1.2 · Qué le dice el técnico al asistente para pedir cada uno

Es la especificación del normalizador `tipoDeReporte(texto)` (D4) y de los
casos de `verificar-chat`. El modelo elige el `tipo` del enum; el
normalizador cubre que pase texto libre o un sinónimo.

| `tipo` | Frases que lo piden | Sinónimos que el normalizador entiende |
|---|---|---|
| `catalogo` (hoy, por omisión) | «Genérame un reporte», «un PDF de todas las señales de esta semana», «expórtame los datos del motor» | reporte, PDF, exportar, «de todas las señales», «del catálogo» |
| `tecnico` | «Genérame un reporte técnico sobre el sistema», «el técnico del mes», «technical report of the last week» | técnico, technical, «de planta», «de monitoreo» |
| `vibraciones` | «Reporte de vibraciones del motor», «el CMS de la última semana», «reporte de condición del rodamiento» | vibraciones, vibración, CMS, «de condición», «de los apoyos» |
| `lectura-de-sensores` | «Reporte de lectura de sensores», «cómo están leyendo los sensores, en PDF», «reporte de instrumentación» | sensores, lecturas, instrumentación, «calidad de dato», sensor readings |
| `riesgos` | «Reporte de riesgos de la máquina», «qué riesgos hay, en un PDF», «análisis de riesgos» | riesgos, risk, «matriz de riesgos», mitigación |
| `alarmas` | «Reporte de alarmas de la última semana», «cuántas alarmas hubo este turno, en reporte», «eventos de alarma» | alarmas, alarms, eventos, avisos, «disparos» |
| `ingenieria` | «Reporte de ingeniería del sistema», «un reporte de hallazgos técnicos», «engineering report» | ingeniería, engineering, hallazgos, proyecto |
| `energias` | «Reporte de energía del variador», «cuánto consumió el motor este mes», «reporte de consumo eléctrico» | energía, energías, consumo, eléctrico, kWh, potencia |
| `predicciones` | «Reporte de predicciones», «pronóstico de fallas en PDF», «cuándo va a fallar, en reporte» | predicción, pronóstico, predictivo, fallas futuras |

Cuando la frase no nombra tipo («hazme un reporte de la máquina») se queda en
`catalogo`, que es lo de hoy. Cuando nombra dos («un reporte técnico de
alarmas») el normalizador devuelve ambiguo y la herramienta pregunta, no
elige. El período y la máquina se resuelven como hasta ahora
(`resolverVentana`, `resolverSistema`: id, nombre o alias).

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

**D6 · Se versionan las maquetas y el arte, cada cosa donde la usa quien la
usa.** El arte (ocho PNG, 4,1 MB) va a `backend/ia/marca/portadas/<tipo>.png`,
porque lo lee el compositor, con la misma tolerancia que `cargarMarca`: si
falta, la portada sale con el fondo azul de hoy. Las maquetas (ocho `.docx`,
18,4 MB) van a `docs/plantillas-reportes/<tipo>.docx` con un `LEER.md` que
las mapea al tipo y al nombre con que se entregaron, porque son la
**especificación** de cada `plantillas/<tipo>.mjs` y el código no las lee. La
propuesta inicial era no versionarlas por el peso; el usuario decidió el
23-09-2026 que «funcionan como plantilla» y tienen que viajar con el repo. La
regla que lo acompaña: quien cambie una maqueta cambia su módulo en el mismo
commit.

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

**D15 · La matriz P×I se llena con un criterio declarado, o no se llena.**
*(Propuesto el 23-09-2026; pendiente de que el usuario lo confirme.)* Hoy el
motor no produce probabilidad ni impacto: una regla trae `nivel` y una
`evidencia`. Para poner un riesgo en una celda hacen falta dos números que
alguien declare, y se propone que salgan así:

- **Impacto (1–5): lo declara la regla del tipo.** Se añade `impacto` a cada
  regla de `riesgosVibracion.js` (y a las de cualquier tipo futuro). Mientras
  una regla no lo declare, se deriva del nivel con una tabla escrita una sola
  vez y citada al pie de la matriz: crítico → 5, atención → 3, informativo →
  1. Es un criterio nuestro, no una medida, y el PDF lo dice.
- **Probabilidad (1–5): se OBSERVA en el período.** Es la fracción del tiempo
  del período en que la condición de la regla estuvo activa, evaluada sobre
  las series historizadas que la regla necesita (`necesita`): < 1 % → 1,
  < 5 % → 2, < 20 % → 3, < 50 % → 4, resto → 5. Es una frecuencia medida, no
  una opinión, y se rotula «probabilidad observada en el período», con la
  cobertura del historiador al lado.
- **Una regla cuyas señales no están historizadas no entra en la matriz**:
  se lista debajo con «sin serie para observar su frecuencia». Ni se le
  inventa una P ni se la calla.

Alternativa si el usuario no acepta el criterio: la sección se queda como
«Riesgos por nivel» y la matriz no se dibuja. Lo que **no** se hace en ningún
caso es pedirle P e I al modelo.

**D14 · Tope de series por plantilla.** El `catalogo` de hoy dibuja todas
las series de la máquina (36 en la espejo, 74 en planta) y tarda lo que tarde
el historiador. Las plantillas nuevas piden **lo que su sección declara**:
4 indicadores, hasta 8 gráficas (las medidas por apoyo, o las del variador
en `energias`), y las estadísticas de las mismas. No se lee lo que no se
dibuja. El tiempo se mide en F7 con `vib-motor-03`.

---

## 3. Las fases

### F0 — Las maquetas y el arte al repo, y las decisiones cerradas · completada el 23-09-2026

**Lo que se hizo.**
1. Las ocho maquetas se copiaron a `docs/plantillas-reportes/<tipo>.docx`
   con un `LEER.md` que las mapea al `tipo` y al nombre con que se
   entregaron (D6, tal como decidió el usuario). El arte, a
   `backend/ia/marca/portadas/<tipo>.png`, y `marca/LEER.txt` lista los ocho
   con sus dimensiones y la regla de tolerancia.
2. Los originales siguen en `Documentos/Reportes/` (ignorada): son del
   usuario y ahora son copias; puede borrarlos. Los catorce PDF sueltos son
   salida de `generar_reporte` y la purga los gestiona.
3. `docs/HANDOFF.md` §0 y §5 y `CLAUDE.md` §6.1 citan el plan; el siguiente
   número libre pasa a ser el 45.
4. Las decisiones de §6 quedaron anotadas: energía estimada (sí),
   predicciones sólo plantilla (sí), maquetas en el repo (sí). La matriz P×I
   no se pudo hacer porque falta información —P e I no existen en el motor—,
   y en su lugar se escribió el criterio D15 para que el usuario lo confirme.

**Comprobado.** Ninguno de los dieciséis archivos cae en `.gitignore`; los
PNG son PNG de verdad (`IHDR` leído) y los `.docx` abren como zip con su
`word/document.xml`.

### F1 — El compositor genérico por bloques, sin cambiar el PDF de hoy · completada el 23-09-2026

**Lo que se hizo.** Las primitivas de `reporte.mjs` (constantes, paleta,
marca, folio, portada, cintillo, pie, sellado, `tituloSeccion`,
`cajaResumen`, colores, `nuevoDocumento`) se movieron **tal cual** a
`backend/ia/reportes/lienzo.mjs` con un guion que cortó por marcas y añadió
`export`; `reporte.mjs` las importa y re-exporta `colorDeFila` para su
prueba. Dos añadidos al lienzo: `generarFolio(fecha, prefijo)` (D5; sin
prefijo, el folio de siempre) y `dibujarGrafico`, que es el bloque de
gráfica que vivía inline en `componerReportePdf` y ahora lo usan las dos
composiciones. `reporte.mjs` pasó de 644 a 337 líneas y su cabecera dice
dónde está cada cosa.

`backend/ia/reportes/compositor.mjs` (nuevo) dibuja los seis bloques
(`indicadores`, `tabla`, `graficas`, `texto`, `lista`, `firmas`), la
`ausencia` con su motivo, la `nota` bajo un título, y las dos portadas (D7:
`banner` con el arte ancho arriba, `lateral` con el arte en un panel a la
izquierda y los chips apilados a la derecha). Los triángulos de variación son
polígonos (D13). El arte se carga de `marca/portadas/<tipo>.png` con la
misma tolerancia que la marca: si falta, la portada sale igual. Devuelve
`{ pdf, paginas, folio, secciones }` (D8), y un bloque desconocido es un
`throw`, no una sección en blanco.

**Medido.** Las 192 comprobaciones de `verificar-herramientas` pasaron antes
y después del traslado sin tocarlas (13 de ellas de `generar_reporte`);
`reporte-color.test.mjs` igual. Seis pruebas nuevas en
`backend/test/reportes/compositor.test.mjs`: manifiesto con y sin dato,
ausencia con motivo y vacía con el texto genérico, sesenta filas paginan
(3+ páginas frente a 2), sin arte sale igual y con arte carga 667×295, bloque
desconocido lanza, folio con y sin prefijo. Lint limpio. Lo que **no** se
pudo hacer aquí: mirar el PDF a ojo (no hay renderizador en esta máquina);
quedan dos muestras en el scratchpad de la sesión y la mirada de verdad es
la F7.

### F2 — Los recolectores deterministas · completada el 23-09-2026

**Lo que se hizo.** `backend/ia/reportes/recolectores.mjs`: piezas puras
(`medidasDe`, `principalesDe`, `variacionDe`, `desvioPorciento`,
`peorEstadoDe`, `recuentoDe`, `banderasActivas`, `formatear`) y
`recolectar()`, que recibe las cuatro fuentes con I/O inyectadas —leer la
máquina, evaluar riesgos, leer una serie, dibujar— y devuelve un solo objeto
con el estado, los riesgos, las series leídas (resumen, tendencia,
cobertura, SVG, interpretación en código), el período anterior de las
principales, y las banderas activas. Se apartó del diseño de abajo en una
cosa: no hay ocho recolectores con `{ ok } | { ausente }` sino uno que trae
todo y **las plantillas deciden qué sección queda ausente**, porque el
motivo de una ausencia («el módulo no publica espectro») es de la plantilla,
no del dato. Ocho pruebas en `recolectores.test.mjs`; una la vio fallar el
propio recolector: sin dominio contaba «una bandera sin lectura» de un
dominio que no existía, y se corrigió a «sin dominio no se busca».

Los ▲▼ salen de comparar el promedio del período con el del **período
anterior de la misma duración, pegado al actual**, y sólo para las
principales con serie; la variación bajo medio decimal es cero, no un
triángulo. Lo que sigue era el objetivo escrito antes de hacerlo:

`backend/ia/reportes/recolectores.mjs` con una función por
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

### F3 — Las tres plantillas completas: `tecnico`, `vibraciones`, `lectura-de-sensores` · completada el 23-09-2026

**Lo que se hizo.** Los tres módulos en `backend/ia/reportes/plantillas/`
(cada uno `{ id, folioPrefijo, portada, claves(ctx), documento(d, ctx) }`,
con `comun.mjs` para lo que comparten), las cinco pendientes declaradas en
`pendientes.mjs` con su esqueleto de secciones y su motivo en dos idiomas,
el registro y el normalizador en `plantillas/index.mjs`
(`tipoDeReporte`: id, sinónimos es/en, «dos tipos» → ambiguo), y el
orquestador `reportes/generar.mjs`, que la herramienta llama con
`await import()` cuando llega un `tipo` que no es `catalogo`. El tipo
`vibraciones` declara `indicadores` por rol (vRMS, aRMS, DKW, velocidad del
variador); una medida por apoyo sale una vez, la mayor, con el apoyo al lado.

Los cuatro enganches en archivos existentes fueron pequeños: la herramienta
(`historicos/index.mjs`, un bloque de delegación; el argumento se llama
`tipoPedido` porque `tipo` ya era el tipo de máquina más abajo), la
definición (`definiciones.mjs`, el argumento `tipo` con enum y descripción
por valor, y `Texto.optional()` en el esquema para que el normalizador
reciba texto libre), el prompt (`chat.mjs`, cuatro líneas), y el cableado
de `evaluarRiesgosDe` hacia la familia `historicos` en
`conversacion/herramientas.mjs` (faltaba: lo cazó el verificador, no las
pruebas unitarias, que inyectan las dependencias).

Sin `sistema`, con una sola configurada en servicio, la elige; con más de
una, pide que se nombre. El tanque cae en la guarda de máquina cerrada antes
de llegar a la plantilla. `SISTEMAS_EN_SERVICIO` no sirve para esto: se
calcula al cargar el módulo y no ve las máquinas registradas después; se
filtra `SISTEMA` en el momento.

**Medido.** `verificar-herramientas`: 192 → **198** (seis en bloque propio
al final, D11), 22 omitidas; `verificar-chat` 71 y `verificar-instrucciones`
en verde tras tocar el prompt; suite del backend 401 → **429** (compositor 6,
recolectores 8, plantillas 5, generar 9). En una tanda que corrió a la vez
que el verificador, una prueba de `generar` y otra de `salud` dieron `timed
out` a 5 s; solas, la de `generar` tarda 0,5 s (contención, §5.3 de
`CLAUDE.md`) y la de `salud` es la B16 del backlog. Los tres PDF de la espejo
salen con 7 secciones con dato (vibraciones: 8 con dato y el espectro sin
dato, con motivo).

**F3.1 · El peso del PDF, medido y corregido.** Los tres PDF de la espejo
pesaban 4,4 · 4,6 · 5,4 MB. La causa no era el arte (0,25–0,65 MB) sino el
**cintillo**: `doc.image(buffer)` de pdfkit abre y registra el PNG en cada
llamada, y el cintillo se estampa en cada página, así que un técnico de
ocho páginas llevaba ocho copias de 358 KB. Eso explica también los 6–11 MB
de los catálogos generados antes del plan. `sellarPaginas` abre ahora la
imagen una vez (`doc.openImage`) y pasa el objeto: 4,4 → **1,76 MB**, 4,6 →
**2,41**, 5,4 → **2,28**. Lo que queda es el fondo de portada (0,9 MB), el
banner y el arte. Tiempo por reporte con el transporte falso: 0,3–0,65 s.

**F3.2 · Mirado a ojo, y lo que se corrigió.** El usuario abrió el técnico y
vio texto solapado en las tarjetas de indicador. Para mirar los PDF sin
instalar nada se renderizaron con la API de Windows (`Windows.Data.Pdf` desde
PowerShell; el guion es `docs/plantillas-reportes/render-pdf.ps1` y sirve
para la F7),
y de ahí salieron seis defectos, todos de layout y todos corregidos en
`compositor.mjs` y `lienzo.mjs`:

1. La etiqueta de una tarjeta saltaba a dos líneas aunque llevaba
   `lineBreak: false` + `ellipsis: true`, y la variación se pintaba encima.
   pdfkit no se dejó convencer; ahora se **mide** (`recortar`, `lineas`): la
   etiqueta y el subtítulo caben en hasta dos líneas medidas a mano, y la
   variación comparte fila con el subtítulo sin pisarlo. Las tarjetas miden
   88 pt fijos.
2. Cabeceras de columna recortadas («ÚLTIMA CALIBR…») → hasta dos líneas.
3. Un título de sección solo al pie con su bloque en la página siguiente →
   `alturaMinima(seccion)`: título más su primer bloque, o pasa entero.
4. Una cabecera de tabla sola al pie → la tabla arranca en la página siguiente.
5. Una serie sin muestras reservaba el alto de la gráfica: media página en
   blanco y la nota debajo → sin SVG no se reserva (`dibujarGrafico`, también
   para el catálogo).
6. La flecha «→» del pie de recomendaciones salía como «!'»: Helvetica no la
   tiene (D13). Se escribe con dos puntos. Grep de `→ ≥ ≤` en los textos: cero.

Y tres de contenido: el chip «Equipo» llevaba la descripción entera del tipo
(un párrafo) y ahora lleva su nombre; «Generado» era sólo la hora y se
repetía en la portada del técnico, ahora es fecha y hora y sale una vez; el
subtítulo de las tarjetas de sensores era el tag completo (no cabía) y ahora
es la clave. La columna «Nivel» partía «Informativo» en dos; se ensanchó.

Lo que sigue era el objetivo escrito antes de hacerlo:

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

**Objetivo.** Los dos módulos con lo que §1 dice: la matriz P×I con el
criterio D15 si el usuario lo confirma (impacto declarado por regla,
probabilidad observada en el período), o «riesgos por nivel» si no; no
evaluables y sin comprobar como secciones propias; alarmas con la severidad derivada del rol y declarada en el pie de
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
variador y los kWh **estimados** por integración de la potencia (`estimado:
true`, cobertura y nota al pie; decidido en §6.2); `predicciones` **sólo la
plantilla** (decidido en §6.3): el módulo declarativo completo, probado con
un modelo de documento sintético, y la herramienta que **se niega con
motivo** mientras la máquina tenga `desgaste: null` (D12). No se escribe
ningún recolector de pronóstico en este plan.

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

## 6. Decisiones del usuario (23-09-2026)

1. **Riesgos, la matriz P×I.** El usuario: «en caso de que tengas toda la
   información, realízalo». **No la hay**: el motor da `nivel`, no
   probabilidad ni impacto, y ninguna regla declara ninguno de los dos. Lo
   que se propone para tenerla es D15 (impacto declarado por regla,
   probabilidad observada en el período). **Pendiente de que lo confirme**;
   si no, «Riesgos por nivel».
2. **Energías, los kWh.** **Sí**: estimar por integración de la potencia del
   variador, declarado como estimación.
3. **Predicciones.** **Sólo la plantilla**, sin recolector de pronóstico.
4. **Las maquetas `.docx`.** **Al repo**, en carpeta propia:
   `docs/plantillas-reportes/` (hecho en F0).

### 6.1 · Qué información haría falta para llenar lo que hoy queda en blanco

Nada de esto bloquea el plan; es lo que convertiría una `ausencia` en dato,
y de dónde tendría que salir cada cosa:

| Hueco | De dónde saldría | Qué habría que hacer |
|---|---|---|
| Impacto de cada riesgo | Del tipo, regla por regla | `impacto` en cada regla (D15); una tarde de criterio de ingeniería por tipo |
| Fechas de calibración de un sensor | De quien mantiene la planta; ICONICS no las tiene | Un campo opcional por variable en `maquinas.json` (`calibracion: {ultima, proxima}`), editable en la ficha. Es dato de despliegue, no de código |
| Objetivo, avance por disciplina, responsables, fechas (Ingeniería, planes de acción) | De gestión del proyecto, no de planta | O se dejan en blanco para llenar a mano (lo que hace este plan), o el operador los dicta en la pregunta y van al PDF rotulados «proporcionado por el operador». Lo segundo es un argumento más de la herramienta y se puede añadir después sin tocar el compositor |
| Temperatura, espectro, ejes (Vibraciones) | De la instrumentación: el SM 1281 no los publica | Sin cambio posible en software |
| Flujo, factor de potencia, meta de consumo (Energías) | De un tipo con medidor de energía o con caudal (la estación de llenado, Plan 43) | Roles `energia:*` en ese tipo; la plantilla ya los pediría por familia |
| Pronóstico de fallas (Predicciones) | De un tipo que declare mecanismos de desgaste con historia verificada | Hoy toda configurada nace con `desgaste: null`; declararlos es del Plan 43 o posterior |
| Nombre de quien elaboró | De la sesión (`request.usuario`) | Una línea en `chat.mjs` (archivo caliente, D10) y otra en el compositor |
