> **Propuestas históricas.** Este documento conserva el análisis de su fecha; sus prioridades y estados no se asumen vigentes. El estado actual está en [el índice documental](README.md) y en el código. Las vistas del antiguo dashboard ya no forman parte de esta rama.

# Mejoras propuestas · Asistente de IA

> **Qué es esto.** Treinta mejoras para el asistente, agrupadas en tres ejes:
> **veracidad de los datos**, **expansión de herramientas** y **expansión de
> capacidades**.

> **Cómo leerlo.** Cada mejora dice qué pasa HOY —medido sobre el árbol, no
> supuesto—, qué cambiaría y qué la bloquea. Las cifras están verificadas el
> 28-08-2026 contra el código y, donde se indica, contra el servidor real.
> Nada de aquí es un deseo: todo sale de un fallo observado, de una limitación
> medida o de una frontera que el propio código declara.

---

## Estado del que se parte

| Métrica | Valor |
|---|---|
| Herramientas | 19 |
| Aceptan `sistema` (sirven a cualquier máquina) | 13 |
| Esquema que lee el modelo | 19 352 car. ≈ **5 529 tokens de los 16 384** del 4B |
| Máquinas | 2 (tanque, vibraciones) |
| Puntos en vivo | 8 + 73 = **81** |
| Puntos con serie histórica | 5 + 40 = **45** |
| Banco de evaluación | 4 preguntas con aserciones (`comparar-modelos.mjs`) |
| Verificadores backend | 355 comprobaciones |

**El margen de contexto es el techo que condiciona casi todo lo demás.** El
esquema ocupa ya un tercio de lo que el modelo puede leer, y está medido que
896 caracteres de más lo rompen: el 28-08-2026, declarar `sistema` en seis
herramientas provocó `Context size has been exceeded` **antes de llamar a
ninguna**. Cualquier mejora que añada texto al catálogo tiene que medirse
contra ese tercio, no suponerse.

---

# A · Veracidad de los datos

> El eje que más incidentes reales ha producido. Los cuatro fallos observados
> en pantalla esta semana fueron de veracidad, no de disponibilidad: el dato
> estaba y el asistente dijo que no.

## A1 · Detección automática de series duplicadas ⭐

**Hoy.** Pedir la serie de una señal no historizada **no da error**: el
servidor devuelve la curva de OTRA, con marcas de tiempo correctas. Pasa en
tres de las ocho del tanque y en `aPeak_S1` de vibraciones, que devuelve la de
`aRMS_S1` muestra por muestra.

Las cuatro se encontraron **a mano**, cruzando series una por una.

**Qué cambia.** Un verificador que cruce todas las series de cada máquina y
falle si dos son idénticas. Es mecánico y da un veredicto claro.

**Por qué primero.** La máquina #3 traerá las suyas, y sin esto se encontrarán
igual: por casualidad, o no se encontrarán.

## A2 · La cobertura, como campo y no como prosa

**Hoy.** `historia_de_senal` devuelve `tramosConDato` y `tramosPosibles`, y
redacta un `avisoCobertura` en texto. Medido contra el servidor: una consulta
de «ayer» sobre `DKW_S1` trajo **4 de 96 tramos** — el 4 % del día.

El modelo lo contó bien esa vez. No hay nada que garantice que lo haga siempre.

**Qué cambia.** Un campo numérico (`cobertura: 0.04`) que la interfaz pueda
pintar y una regla que impida presentar el promedio como representativo del
período cuando baje de un umbral.

## A3 · Distinguir el cero de máquina parada del cero de sensor caído

**Hoy.** Medido el 28-08-2026: los 73 puntos de vibraciones responden con
calidad buena y las medidas dan **0**, porque la máquina está parada. Un sensor
averiado daría exactamente lo mismo.

**Qué cambia.** Cruzar con `velocidad` del variador y etiquetar la lectura como
`en_reposo` en vez de dejar que el modelo lo deduzca.

## A4 · Antigüedad del dato en cada lectura

**Hoy.** `estadoComun` lleva `leidoA` para la máquina entera, no por señal. Un
valor de hace 40 s y uno de hace 4 h se citan igual.

**Qué cambia.** `edadSegundos` por señal, y que las que pasen de un umbral se
declaren como posiblemente estancadas.

## A5 · Validar unidades en toda comparación numérica

**Hoy.** `limites_del_manual` ya devuelve `unidadesCoinciden` —puede ser
`false`, y se informa en vez de fingir que cuadra—. El resto de comparaciones
no lo hacen.

**Qué cambia.** Extender esa comprobación a cualquier cruce de cifras. Un
límite en bar contra una lectura en kPa no es una comparación: es una
coincidencia numérica.

## A6 · Contrato de procedencia obligatorio

**Hoy.** Varias respuestas traen `fuente: 'historiador' | 'tiempo real'`, pero
no todas, y nada lo verifica.

**Qué cambia.** Que **toda** respuesta declare de dónde sale cada cifra
—leída, calculada o estimada— y que una prueba lo exija. Es la base sobre la
que se apoyan A2, A3 y A4.

## A7 · Detectar series congeladas

**Hoy.** Un tag que devuelve el mismo valor durante horas se lee como
estabilidad. Puede ser un sensor que dejó de actualizarse.

**Qué cambia.** Marcar la serie sin varianza en un período largo y decirlo.
Requiere cuidado: una señal booleana en reposo es legítimamente constante.

## A8 · Reconciliar histórico contra vivo

**Hoy.** Una serie que incluye «ahora» y la lectura en vivo se piden por
caminos distintos —`hda:` y `ac:` en vibraciones— y nadie comprueba que
concuerden.

**Qué cambia.** Comparar el último punto con la lectura en vivo y avisar si
divergen más de lo razonable. Detecta desfases de configuración del
historiador sin que nadie los busque.

## A9 · Auditoría de cifras citadas

**Hoy.** Si el modelo inventa un número, solo se descubre leyendo la
conversación.

**Qué cambia.** Registrar las cifras que devolvieron las herramientas y las que
aparecen en la respuesta, y marcar las que no salen de ninguna. No bloquea nada:
deja rastro para revisar.

## A10 · Generalizar la red de seguridad de los avisos

**Hoy.** `mencionaElAviso` comprueba si el modelo contó el aviso y lo añade si
no; elige el patrón por el contenido, lo que ya cubre umbrales y correlación.
Hay **10 avisos** viajando dentro de resultados.

**Qué cambia.** Que la comprobación sea sistemática para los diez, no para dos.

> **Nota de mantenimiento.** Los avisos son texto dentro del resultado, donde
> pesan más que las instrucciones — y por eso caducan mal. El 28-08-2026,
> `estadoVibraciones` seguía diciendo «sin histórico utilizable» **después** de
> que la máquina ganara series, y el asistente se negó a dar un promedio que el
> historiador tenía. Un aviso desactualizado es peor que ninguno.

---

# B · Expansión de herramientas

## B1 · Un solo resolvedor de nombres por máquina ⭐

**Hoy hay tres sitios que deciden lo mismo:**

| Resolvedor | Alcance | Tiene sinónimos |
|---|---|---|
| `resolverSenal` (`herramientas.mjs`) | solo tanque | sí («la bomba», «el voltaje») |
| `sistemasDeSenal` (`shared/eva/sistemas.js`) | todas | no |
| `resolverSenalDeSistema` (`historicos/`) | une los dos | — |

El tercero se escribió como transición y está marcado como tal.

**Qué cambia.** Que `SINONIMOS` sea un campo del registro y exista un único
resolvedor por máquina. Es lo que permitiría sacar `resolverSenal` del
ensamblador — hoy `documentacion/` e `historicos/` lo importan de él, y ese es
el último hilo que las ata al archivo grande.

**Por qué importa.** Dos fallos de esta semana salieron de aquí: «DKW» no
resolvía (tres letras, umbral de cuatro) y «velocidad eficaz» arrastraba su
indicador de confianza. Cada uno se arregló en su sitio; el tercero saldrá del
mismo hueco.

## B2 · Sinónimos por máquina

**Hoy.** Solo el tanque los tiene. `sistemasDeSenal("vibración del motor")`
devuelve `[]`.

**Qué cambia.** Que cada entrada del registro declare los suyos. La máquina #3
nace hoy sin ellos y sus señales solo se encuentran por nombre técnico.

## B3 · Las tres herramientas de documentación, por máquina

**Hoy.** `consultar_documentacion`, `limites_del_manual` y `diagnostico` sirven
solo al tanque, y el índice RAG es **global**: `buscar()` acepta `top` y nada
más.

Con tres PDFs del tanque no molesta. El día que se suba el manual del motor
WEG, una pregunta sobre el tanque podrá traer fragmentos del motor.

**Qué cambia.** Filtrar el índice por máquina y aceptar `sistema` en las tres.

## B4 · `estado_de_alarmas`

**Hoy.** De AlarmWorX solo se leen **4 contadores del área** —y uno de ellos no
entrega valor—. Cuál alarma se disparó no se puede saber.

**Qué cambia.** Leer el historial de eventos. Es la diferencia entre «hay 3
alarmas activas» y «el nivel bajo saltó a las 14:32».

## B5 · `comparar_maquinas`

Misma magnitud en dos máquinas, con la salvaguarda de no correlacionar PLCs
distintos ya implementada en `correlacionar_senales`.

## B6 · `tendencia_multiple`

**Hoy.** Varias señales son N rondas, y el presupuesto es de 4×2. La pregunta
que falló el 28-08-2026 agotó las rondas antes de contestar.

**Qué cambia.** Una llamada, varias señales, un solo viaje.

## B7 · `resumen_de_turno`

Qué pasó en las últimas 8 h en una sola herramienta: rangos, alarmas, tiempo en
marcha. Hoy son cuatro o cinco llamadas encadenadas.

## B8 · `buscar_evento`

«¿Cuándo fue la última vez que la presión bajó de X?» — hoy no hay forma de
preguntarlo sin traerse la serie entera.

## B9 · `espectro_de_vibracion`

**Hoy.** El diagnóstico de rodamientos (BPFO, BPFI, FTF) está **apagado** en los
tres apoyos: el módulo no los vigila, así que un rodamiento picándose solo se
ve cuando ya movió el valor eficaz.

**Qué cambia.** Si el SM 1281 expone el espectro, es la medida que de verdad
diagnostica. **Depende de habilitarlo en el módulo**, no solo de código.

## B10 · `exportar_datos`

CSV o Excel de una serie, sin pasar por el PDF de `generar_reporte`.

---

# C · Expansión de capacidades

## C1 · Mecanismos de desgaste para vibraciones ⭐

**Hoy.** Vibraciones tiene 40 series desde el 28-08-2026 y **`desgaste: null`**.
`pronostico_de_desgaste` se niega —correctamente— porque sin mecanismos
declarados no se sabe a qué avería lleva cada condición.

**Qué cambia.** Declararlos (ISO 10816 + horas de exposición) convierte los
datos nuevos en capacidad de diagnóstico.

**Ojo:** al declararlos se topará con **C2**, porque el cuerpo de
`pronostico_de_desgaste` sigue escrito contra el catálogo del tanque.

## C2 · Parametrizar `pronostico_de_desgaste`

**Hoy.** Tiene dos guardas, en orden deliberado: primero la de **capacidad**
(sin histórico ni mecanismos), después la de **parametrización**
(`id !== 'tanque'`), que impide que una máquina con histórico entre a leer las
señales del agua.

La segunda existe porque `SENALES_PRONOSTICO`, `esHistorizada` y
`leerSerieEnRango` son del tanque.

**Qué cambia.** Que las señales del pronóstico salgan del registro. La segunda
guarda se cae sola cuando no haya un `id` que citar.

## C3 · Motores de reglas contra la forma común

**Hoy.** `evaluarRiesgosDe` es un `switch` por máquina, porque `evaluarRiesgos`
espera el `Sistema` del tanque y `evaluarRiesgosVibracion` espera
`{ canales, variador, alarmas }`.

Desde el reparto vive en `herramientas/lib/maquina.mjs` (156 líneas), así que
sustituirlo es un cambio local.

**Qué cambia.** Que cada entrada declare su `riesgos(estado)` y la #3 herede
riesgos sin tocar código. **Exige reescribir los dos motores** contra la
proyección de `estadoMaquina.js` — es trabajo real, no un renombrado.

## C4 · Memoria proactiva entre conversaciones

**Hoy.** `hechos_de_la_planta` guarda lo confirmado, pero el modelo tiene que
acordarse de consultarlo.

**Qué cambia.** Inyectar los hechos relevantes de la máquina en cuestión sin
que se pidan.

## C5 · Presupuesto de rondas adaptativo

**Hoy.** 4 rondas × 2 herramientas. Cuando una herramienta pide reintento con
otro argumento, esa ronda se consume.

**Qué cambia.** Detectar el patrón «reintenta con X» y no contarlo contra el
presupuesto.

> Aviso: la lección del 28-08-2026 es que **el reintento es frágil de por sí**.
> El 4B no lo hace bien ni con la instrucción delante; lo que funcionó fue
> *no necesitarlo* (auto-resolver el nombre inequívoco). Ampliar el
> presupuesto ayuda, pero no sustituye a eliminar la ronda.

## C6 · No perder los datos cuando el modelo no redacta

**Hoy.** `resumirSinModelo` cubre dos formas —estado e historia de señal— y
para el resto devuelve *«La consulta devolvió datos, pero no he podido
resumirlos»*. Es exactamente el mensaje que se vio en pantalla.

**Qué cambia.** Un resumen seco por cada forma de respuesta. El respaldo hizo
su trabajo —avisó en vez de callarse—; puede hacerlo mejor.

## C7 · Modo «explica tu razonamiento»

Qué herramientas llamó, con qué argumentos y por qué. La traza ya se pinta;
falta el porqué de cada elección. Útil para auditar en demo.

## C8 · Alertas proactivas

Que el asistente avise cuando una regla se dispara, sin que se le pregunte.
Requiere decidir dónde se muestran y cómo se silencian.

## C9 · Ampliar el banco de evaluación ⭐

**Hoy.** `comparar-modelos.mjs` tiene **4 preguntas** con aserciones de lo que
debe y no debe aparecer. Es mejor de lo habitual: una de ellas fija que el
modelo no confunda la aceleración con la velocidad eficaz, un fallo medido tres
veces con el 4B.

**Qué cambia.** Llevarlo a 30–50 preguntas y ejecutarlo en CI. **Las cuatro
respuestas mal de esta semana habrían sido cuatro casos**, y ninguna se habría
repetido.

## C10 · Declarar el modelo y sus límites

**Hoy.** `IA_MODELOS` ofrece cinco, del 0.6B al 9B. El 4B falla en
encadenamiento donde el 9B no —medido—, y la respuesta no dice con cuál se
generó.

**Qué cambia.** Que la respuesta lo declare, y que las capacidades que dependen
del tamaño se degraden explícitamente.

---

# Prioridad sugerida

| # | Mejora | Por qué |
|---|---|---|
| 1 | **A1** duplicados | Encontró un fallo real a mano; automatizarlo protege el alta de la #3 |
| 2 | **C9** banco de evaluación | Las cuatro respuestas mal de esta semana habrían sido casos |
| 3 | **B1** resolvedor único | Dos fallos salieron de ahí; el tercero saldrá del mismo hueco |
| 4 | **C1 + C2** pronóstico de vibraciones | Convierte 40 series nuevas en capacidad |
| 5 | **A2 + A6** cobertura y procedencia | Base para A3, A4 y A8 |
| 6 | **B3** RAG por máquina | Antes de subir el manual del WEG, no después |

**El techo que condiciona todo: el contexto.** B4-B10 añaden herramientas, y
cada una suma texto al esquema que ya ocupa un tercio de lo que el 4B puede
leer. Antes de la siguiente conviene decidir si se recorta el catálogo, se
agrupan herramientas o se pasa al 9B — y medirlo, porque está comprobado que
896 caracteres bastan para romperlo.

---

## Lo que estas mejoras NO tocan

Tres fronteras que el código defiende a propósito y que ninguna mejora debe
erosionar:

- **Un motor de sondeo por sistema.** La unificación es del código, nunca del
  lote: dos máquinas no comparten petición.
- **La identidad del sistema viaja pegada al punto**, no se deduce después
  mirando el nombre.
- **Lo que no está en la lista blanca de series no se pide.** Es lo que impide
  que el historiador devuelva la curva de otra señal sin avisar.
