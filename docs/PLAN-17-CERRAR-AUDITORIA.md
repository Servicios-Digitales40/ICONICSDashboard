# Plan 17 · Cerrar la auditoría del diagnóstico

> **Objetivo.** Que la banda que ve el técnico signifique lo que dice
> significar. Hoy el ciclo completo del Plan 16 existe y no está simulado
> —recorrido de punta a punta con datos reales—, pero está **conectado y mal
> calibrado**: de los tres términos de la puntuación, dos no discriminan y el
> tercero cita casos de otro riesgo. Este plan no reescribe nada: arregla el
> tramo que va de «cómo se escribe un caso» a «cómo se lee».

> **ESTADO (02-09-2026)** — Ejecutando el orden offline (§7 tramo 1). Parte de
> la auditoría integral sobre `Moises6` @ `f8f12c4`, que ejecutó el motor
> contra los manuales y los casos reales en disco en vez de leer el código y
> suponer. Alcance decidido: los **cuatro gaps críticos**, los **siete
> importantes** y el **cuarto término temporal**. Fuera: autenticación del
> cierre (§9).
>
> El orden de trabajo (§7) es el **offline**: ocho de las doce entregas —entre
> ellas G1, G3 y G4 enteros— se hacen sin llama-server, sin Whisper, sin
> servidor de embeddings y sin ICONICS. Lo que espera a un servidor es
> calibración, no funcionalidad. Ver §10.
>
> **Requisito previo completado** — `backend/node_modules` estaba incompleto
> en esta copia de trabajo (78 paquetes, sin `pino`/`fastify`/`zod`/`vitest`);
> `npm install` en `backend/` lo resolvió (142 paquetes añadidos). Línea base
> confirmada sin tocar código: 153/153 vitest, 8/8 `verificar-diagnostico`,
> 8/8 `verificar-casos`, 5/5 `verificar-casos-cierre`, 10/10
> `verificar-documentos`, 116/116 `verificar-herramientas` — todo en modo
> BM25/dobles de prueba, sin ningún servidor encendido.
>
> **Fase 0 completada** — `registrar_intervencion`
> (`backend/ia/herramientas/aprendizaje/index.mjs`) valida `sistema` contra
> `SISTEMA_IDS` y devuelve `fallo()` con la lista de válidos, igual que
> `POST /api/casos` ya hacía con `z.enum`; `null` (toda la planta) sigue
> siendo válido. `crearIntervencion` (`shared/eva/aprendizaje.js`) no valida
> — sigue siendo un constructor puro, la validación vive en las dos puertas.
> Nuevo `scripts/purgar-casos-invalidos.mjs`: lista en seco por defecto,
> `--ejecutar` escribe copia de seguridad con marca de tiempo y purga.
> Probado extremo a extremo con datos de prueba (4 intervenciones, 2 con
> `sistema: "grupo de bombeo"`): detecta las 2 inválidas, no toca nada sin
> `--ejecutar`, y con `--ejecutar` purga exactamente esas 2 y conserva la
> copia de seguridad con las 4 originales. **No había nada que purgar en
> esta copia real** — `datos/` está gitignored y no existe aquí; el guion
> queda listo para cuando haga falta. Dos comprobaciones nuevas en
> `scripts/verificar-herramientas.mjs` (124/124 en total, antes 116).
>
> **Fase 1 completada** — `buscarCasosSimilares` (`backend/ia/casos.mjs`)
> gana `riesgoId` opcional: excluye, ANTES de puntuar (mismo criterio que
> `sistema`), cualquier caso cuyo `disparador.riesgoId` sea de OTRO riesgo;
> un caso sin `disparador` —todo lo registrado por voz o chat— no se
> excluye, porque "no se sabe de qué riesgo era" no es "es de otro".
> `respaldoDeCasos` (`backend/ia/diagnostico.mjs`) recibe el `riesgoId` que
> ya tenía en `diagnosticar()` y no propagaba, y separa dos niveles de peso:
> `disparador.riesgoId` coincidente pesa completo (tope 2, como siempre);
> sin `disparador` pesa reducido (tope 1, nunca 2), para que una fuente sin
> confirmar no pueda por sí sola sostener lo que antes sostenía una
> confirmada. Los dos topes se combinan sin superar el tope global de 2 —
> "casos 0…2" sigue siendo la promesa del módulo—. Ocho comprobaciones
> nuevas que reproducen el escenario medido en la auditoría (un caso de
> `sobrepresion` excluido de un diagnóstico de `derrame`; dos casos sin
> `disparador` topando en 1 en vez de 2) repartidas entre
> `scripts/verificar-casos.mjs` (12/12, antes 8) y
> `scripts/verificar-diagnostico.mjs` (11/11, antes 8). Sin regresiones:
> 153/153 vitest, 124/124 herramientas, 5/5 casos-cierre, 10/10 documentos.
>
> **Fase 2 completada** — `respaldoDeCasos` (`backend/ia/diagnostico.mjs`)
> empareja por id ANTES de caer a texto: `causaReal.tipo === causa.id`
> confirma —sin depender del score, un id no compite por parecido—, y
> `diagnostico.propuesta === causa.id` con `diagnosticoCorrecto === false`
> refuta, sin tope, sea cual sea `resuelto`. La proxy de texto de la Fase 0
> del Plan 16 sólo se usa ya para lo que no trae esos campos —el histórico
> de antes de la Fase 5 y todo lo que no diferencia por id—. `textoDeRecu
> peracion` (`shared/eva/casos.js`) añade «El sistema propuso X; la causa
> real fue Y» cuando ambos campos existen, para que el caso se pueda
> ENCONTRAR al buscar por el título de cualquiera de las dos causas —el
> emparejamiento exacto no sirve de nada si el caso ni siquiera aparece
> entre los candidatos que devuelve `buscarCasosSimilares`—. La caché de
> embeddings de casos no necesitó versionarse a mano: ya está indexada por
> hash del CONTENIDO del texto (`cache.vectores[item.hash]`,
> `backend/ia/embeddings.mjs`), así que un texto de recuperación distinto
> produce un hash distinto y un fallo de caché limpio por sí solo — el
> riesgo que anotaba el plan ya estaba resuelto por el diseño existente.
> Nueve comprobaciones nuevas reproducen el escenario medido en la
> auditoría —`consigna-variador-alta` refutada dos veces baja de banda
> ella sola (MEDIO → BAJO), sin tocar ninguna otra causa— repartidas entre
> `scripts/verificar-diagnostico.mjs` (15/15, antes 11) y
> `scripts/verificar-casos-cierre.mjs` (7/7, antes 5). Sin regresiones:
> 153/153 vitest, 124/124 herramientas, 12/12 casos, 10/10 documentos.
>
> **Fase 5 completada** (adelantada del 7.º al 4.º lugar del orden offline,
> §7 tramo 1 — no depende de ningún servidor). `manualCitado` deja de
> recortar `texto`/`hash` que `documentos.mjs · buscar()` ya calculaba y
> tiraba: el `hash` es del CONTENIDO del fragmento —no del PDF entero—, así
> que identifica el trozo exacto cuando una página se parte en varios y
> avisa si el PDF cambió desde que se citó, sin abrir el archivo.
> `casosCitados` gana `resumen` (la causa, o el síntoma si no hay causa) —
> antes sólo `{id, fecha, resuelto}`, sin poder saber por qué se citó sin
> ir a `aprendizaje.json`. `diagnosticar()` emite `diagnosticEventId`, uno
> por LLAMADA —no por causa—; no rompe el determinismo (el test lo separa
> del contenido y comprueba las dos cosas: los ids difieren, el resto es
> idéntico). El motor ahora expone el top-N con banda+respaldo listo para
> persistir, no sólo la ganadora.
>
> `CitaManualSchema`/`DiagnosticoPropuestoSchema` (`backend/http/
> esquemas.mjs`) ganan `texto`/`hash` opcionales y un `CitaCasoSchema` +
> `diagnosticEventId` + `candidatas` nuevos — sin esto, Zod los habría
> descartado en silencio al guardar un cierre (comportamiento por defecto:
> "strip"), y lo persistido habría perdido justo lo que esta fase añade.
> `CierreDiagnostico.jsx` reenvía `casosCitados`, `diagnosticEventId` y el
> top-N completo (`causasCandidatas.map(...)`) al cerrar — antes sólo
> mandaba `manualCitado` de la ganadora. Nuevo test de frontend que
> comprueba los tres campos llegan al `POST /api/casos` (6/6 en
> `cierre-diagnostico.test.jsx`, antes 5).
>
> Instalado también `react-dashboard/node_modules` (faltaba
> `@tanstack/react-query`, mismo síntoma que el backend en §10). Sin
> regresiones: 153/153 vitest backend, **509/509 vitest frontend** (antes
> 497 + 1 nuevo — corría en 2 archivos fallidos por la dependencia
> faltante, no por código), `npm run build` limpio, 15/15 diagnóstico,
> 12/12 casos, 7/7 casos-cierre, 124/124 herramientas, 10/10 documentos.
>
> **Fase 3a completada, con una reserva que hay que leer.**
> `documentos.mjs`/`casos.mjs` devuelven `scoreCrudo` (BM25 sin normalizar)
> y, con embeddings, `coseno` sueltos — el `score` mezclado sigue
> ordenando, sin tocar; `puntosDeScore` corta sobre lo absoluto:
> `UMBRAL_COSENO_*` (0,55/0,20, los de siempre) con embeddings,
> `UMBRAL_BM25_*` sin ellos.
>
> **La reserva:** no hay un solo PDF real en esta copia de trabajo contra
> el que calibrar `UMBRAL_BM25_*` —`Documentos/` sólo tiene `Reportes/`—,
> así que salieron de un experimento con un corpus SINTÉTICO (cuatro
> párrafos de manual escritos a mano sobre causas reales de `causas.js`,
> ampliado a ~45 fragmentos con ruido para aproximar la escala medida en
> la auditoría). El experimento reveló algo que el plan original no
> preveía: **el score crudo de BM25 no es invariante al tamaño del
> corpus** —su `idf` crece con el número de documentos para un término
> raro—, así que un umbral fijo aquí se descalibra según crezca
> `Documentacion/`, a diferencia del corte por coseno (F3b), que sí es
> estable. `UMBRAL_BM25_FUERTE=8`/`UMBRAL_BM25_DEBIL=2` son una suposición
> razonada, no una medida — quedan explícitamente marcados así en el
> código, y **F7a sigue siendo obligatoria**, no un ajuste fino, antes de
> declarar cerrado el modo BM25 de C11.
>
> **G7 (aislamiento documental)**: el manifiesto YA tenía `sistema` por
> archivo desde el Plan 16 Fase 1 —`documentos.mjs` simplemente nunca lo
> leía—. `NOMBRE_MANIFIESTO` se movió a `shared/eva/manuales.js` (evita un
> ciclo: `manuales.mjs` ya importa `MAX_BYTES` de `documentos.mjs`).
> `buscar()` gana `sistema` opcional, refrescado en cada `recargar()` —
> independiente de la huella de contenido, para que reasignar un manual
> en el manifiesto no exija tocar el archivo—; sin manifiesto en la
> carpeta, nada se excluye (compatibilidad con instalaciones sin catálogo).
> `respaldoDelManual` propaga el `sistema` que ya tenía `diagnosticar()`.
>
> **G8 (dedupe)**: por hash de CONTENIDO del fragmento —ya se calculaba—,
> antes de recortar a `top`, para que un duplicado no le robe el sitio a
> un resultado distinto.
>
> Diez comprobaciones nuevas en `scripts/verificar-documentos.mjs` (16/16,
> antes 10): aislamiento por sistema (4), dedupe (2), más los reordenos
> de la suite existente. Sin regresiones: 153/153 vitest backend, 509/509
> vitest frontend, 15/15 diagnóstico, 12/12 casos, 7/7 casos-cierre,
> 124/124 herramientas.
>
> **F7a: bloqueada por falta de datos, NO completada.** El usuario decidió
> explícitamente (2026-09-02) no recalibrar `bandaDe`/`UMBRAL_*` sin
> medición real: se escribió `scripts/verificar-calibracion.mjs` —las seis
> comprobaciones del §5, contra el motor real completo
> (`createIndiceDocumentos` + `createIndiceCasos` + `createMotorDiagnostico`,
> sin dobles), corriendo hoy contra un corpus SINTÉTICO por falta de
> `Documentacion/` real— y **no se tocó ni un número** en `bandaDe` ni en
> `UMBRAL_BM25_*`/`UMBRAL_COSENO_*`. `diagnostico.mjs · bandaDe` queda con
> un comentario explícito de por qué sigue sin recalibrar.
>
> De camino salió un hallazgo que no estaba en el plan original: el primer
> diseño del check 1 («dos causas no empatan en `manual`») estaba mal
> planteado — con manual DEDICADO Y GENUINO para las dos causas, empatar en
> `manual: 2` es correcto, no el fallo H2 (que era tocar el techo SIN
> encaje real). Corregido para comparar una causa CON manual dedicado
> contra una SIN ninguno, que es lo que H2 medía de verdad. De paso quedó
> demostrada empíricamente la sensibilidad de BM25 al tamaño del corpus que
> ya advertía la Fase 3a: con sólo 2 documentos, un match genuino
> (`scoreCrudo` 4,2-4,6) no llegaba a `UMBRAL_BM25_FUERTE=8` —calibrado a
> escala de ~45—, y sólo se separó al ampliar el corpus de prueba a esa
> misma escala.
>
> 7/7 en `scripts/verificar-calibracion.mjs`. Sin regresiones: 153/153
> vitest backend, 15/15 diagnóstico, 12/12 casos, 7/7 casos-cierre, 124/124
> herramientas, 16/16 documentos.
>
> **Fase 4 completada** — `evidenciaAFavor[]`/`evidenciaEnContra[]` por
> causa (`{fuente, texto, referencia}`): `manual` con el extracto del
> fragmento; `casos` confirmados a favor, refutados en contra (por primera
> vez algo puede pesar EN CONTRA con una frase, no sólo restar un punto);
> `datos` sólo cuando quien llama trae `valoresSensores` —opcional, porque
> el motor no lee sensores por su cuenta (ver su propia cabecera) y ni
> `diagnosticar_falla` ni `GET /api/diagnostico` tienen hoy acceso a
> lecturas en vivo; el PUNTO de `datos` no depende de esto, sólo la frase—.
>
> `conflicto: true|false` a nivel de diagnóstico: la fuente que más
> respalda la 1ª causa frente a la que más respalda la 2ª. **Hallazgo de
> implementación que no estaba en el plan**: `datos` quedó DELIBERADAMENTE
> fuera de esa comparación — es la misma cifra para todas las causas de un
> riesgo por diseño, así que nunca puede ser lo que las distingue; incluirla
> hacía que "datos" ganara casi siempre por ser el número más alto y
> enmascarara el desacuerdo real entre `manual` y `casos`, que es el que
> importa. Detectado por un test que fallaba con la intención correcta y una
> asunción equivocada.
>
> `diagnosticar_falla` propaga los tres campos nuevos (sólo cuando no están
> vacíos, mismo criterio que `manualCitado`/`casosCitados`) y `comoRedactar`
> gana la instrucción de citar `evidenciaEnContra` con la misma seguridad
> que la de a favor, y de **enseñar** un `conflicto: true` en vez de elegir
> un ganador o suavizarlo. `CierreDiagnostico.jsx` —primer cambio de
> frontend del plan— muestra las dos listas bajo cada causa y un
> `AlertBanner` de aviso cuando hay conflicto; aditivo, nada de lo que ya
> se veía desaparece.
>
> Nueve comprobaciones nuevas en `scripts/verificar-diagnostico.mjs`
> (24/24, antes 15) y dos en `cierre-diagnostico.test.jsx` (8/8, antes 6).
> Sin regresiones: 153/153 vitest backend, 511/511 vitest frontend, `npm
> run build` limpio, 12/12 casos, 7/7 casos-cierre, 124/124 herramientas
> (fixture de prueba actualizado con los campos nuevos), 16/16 documentos,
> 7/7 calibración.
>
> **Fase 6 completada — la última del tramo offline (§7).** Nuevo
> `backend/ia/temporal.mjs`: pendiente por mínimos cuadrados sobre la serie
> de `crearAyudantesDeHistoria().leerSerie` —el MISMO ayudante que ya usan
> `historia_de_senal`/`correlacionar_senales`, sin cliente propio—, umbral
> de ruido RELATIVO al valor de partida (`UMBRAL_CAMBIO_RELATIVO = 0.05`,
> marcado `PROVISIONAL` por el mismo motivo que `UMBRAL_BM25_*`: evita
> desde el diseño el error de un corte absoluto entre señales de escalas
> distintas, en vez de descubrirlo tarde como pasó con BM25 en la Fase 3a).
> `shared/eva/causas.js` gana `firmaTemporal` opcional en `causaTanque()`;
> una causa (`sin-recirculacion-minima`) la declara,
> **transcrita** de la propia `consecuencia` de la regla `bomba-sin-salida`
> en `riesgos.js` ("la temperatura del líquido atrapado puede subir
> rápidamente") — no inventada, mismo criterio que el resto del archivo.
>
> `createMotorDiagnostico` gana `evaluadorTemporal` opcional; el cuarto
> término entra en `total`, en `fuentesActivas` y en
> `evidenciaAFavor`/`evidenciaEnContra`. `hayConflicto` (Fase 4, G9) suma
> `temporal` a la comparación de dominancia —a diferencia de `datos`, sí
> varía por causa—. `bandaDe` sigue sin recalibrar (F7c, necesita ICONICS
> real además de manuales/casos reales — nada de eso existe aquí); el
> máximo teórico sube de 7 a 9 y queda documentado en el propio código.
>
> Wireado en `app.mjs`: `crearAyudantesDeHistoria({client,
> historyConcurrencia})` se construye ahora también fuera de
> `createHerramientas()` —sin estado compartido que duplicar, es una
> envoltura sin memoria propia sobre `client`— para que
> `motorDiagnostico` (que se monta antes que las herramientas) tenga su
> propio `leerSerie`. `diagnosticar_falla`/`GET /api/diagnostico` heredan
> el término automáticamente sin cambio propio: leen `resultado.causas`
> tal cual lo da el motor. `CierreDiagnostico.jsx` añade "· temporal N" a
> la línea de respaldo cuando el campo está presente.
>
> Nuevo `scripts/verificar-temporal.mjs` (9/9): a favor cuando coincide, en
> contra CON FRASE cuando la tendencia real es la opuesta a la declarada
> —no en silencio—, silencio (ni a favor ni en contra) con serie plana,
> pocos puntos o `leerSerie` fallido, y la prueba explícita de que el
> mismo delta absoluto cuenta distinto según la escala de partida. Cuatro
> comprobaciones de integración nuevas en `verificar-diagnostico.mjs`
> (28/28, antes 24): sólo la causa CON firma consulta al evaluador, el
> término suma al total, ausencia de evaluador no rompe nada, un
> evaluador que lanza tampoco. Sin regresiones: 153/153 vitest backend,
> 511/511 vitest frontend, `npm run build` limpio, 12/12 casos, 7/7
> casos-cierre, 124/124 herramientas, 16/16 documentos, 7/7 calibración.
>
> **Con esto se completa el tramo 1 del orden offline (§7): las ocho
> entregas que no dependen de ningún servidor.** Quedan F3b/F7b (servidor
> de embeddings) y F7c (ICONICS real + manuales/casos reales) — los tres
> bloqueados por falta de infraestructura o de datos en esta copia de
> trabajo, no por trabajo pendiente de diseño o código.

---

## 0 · De qué se parte

La auditoría midió, no supuso. Su veredicto: **PARCIAL, con el esqueleto
correcto**. Lo que está bien está muy bien y no se toca en este plan:

- El **LLM está subordinado** — el código puntúa, el modelo narra y tiene
  prohibido reordenar (`comoRedactar`). No inventa causas ni manuales, no
  escribe en el PLC.
- El **aislamiento entre sistemas** es un filtro duro *antes* de puntuar
  (`casos.mjs:227`), con `sistema` obligatorio sin valor por defecto.
- El **human-in-the-loop** está cableado de verdad, no maquetado:
  `CierreDiagnostico.jsx` → `GET /api/diagnostico` → `POST /api/casos` →
  `aprendizaje.json`, verificado extremo a extremo.
- **Arranque con 0 casos**: degrada a `medio` sin fallar, y `bandaDe` exige
  ≥2 fuentes para `alto`, así que la memoria no puede volverse dogma.
- **Honestidad**: un riesgo sin causas lo dice (`huerfano`), un escaneo se
  declara ilegible en vez de fingir OCR, un sensor de mala calidad se vuelve
  `sinDato` en vez de un `?? 0` que diga «vibración cero, todo perfecto».

Y el diagnóstico del problema, en una frase: **la Fase 5 enriqueció lo que se
ESCRIBE en un caso y la Fase 2/3 sigue leyendo el caso por el texto plano de
la Fase 0.** El puente entre las dos mitades del ciclo es una proxy de texto
libre, y el propio `diagnostico.mjs` lo confiesa en su cabecera («es la mejor
proxy disponible hoy»). Ya no lo es: `disparador.riesgoId`, `causaReal.tipo`,
`diagnostico.propuesta` y `diagnosticoCorrecto` existen y están llenos.

### Los tres hallazgos, medidos

| | Hallazgo | Medición real |
|---|---|---|
| **H1** | Los casos se citan **cruzados entre riesgos** | El diagnóstico de `derrame` cita dos casos de `sobrepresion`, y son los +2 que lo suben de `medio` a `alto` |
| **H2** | El término `manual` **casi siempre vale 2** | Las 3 causas de tanque probadas sacaron `manual: 2`, incluso con el índice de casos vacío |
| **H3** | La corrección del técnico **se guarda y no se lee** | `consigna-variador-alta` fue refutada dos veces y hoy sigue saliendo en banda `alto` |

---

## 1 · Lo que este plan NO revisa, y por qué

La auditoría listó como ausencias «no hay MQTT, no hay OPC-UA en el backend,
no hay Node-RED, no hay event bus, no hay base de datos ni vector DB». Eso es
correcto como observación y **equivocado como gap**. Queda declarado aquí para
que ninguna auditoría posterior lo vuelva a levantar:

> **ICONICS FrameWorX es el punto de entrada de datos y la fuente de verdad.**
> Los sensores llegan al sistema por ahí y sólo por ahí. Un bus MQTT, un
> servidor OPC-UA propio o un Node-RED intermedio no añadirían un dato que
> ICONICS no tenga ya: añadirían una segunda copia de la verdad, con su propia
> latencia y su propia forma de desincronizarse. La pregunta «¿de dónde sale
> este número?» tiene hoy una sola respuesta posible, y eso es una propiedad,
> no una carencia.

Consecuencias concretas para la matriz de capacidades:

| ID | Capacidad | Estado en la auditoría | Estado real |
|---|---|---|---|
| **C02** | Ingesta de sensores | `Implementado` · «sólo REST; sin MQTT/OPC-UA» · Prioridad Baja | **Implementado · sin reserva.** REST sobre ICONICS es la arquitectura, no una etapa intermedia |
| — | Event bus / Node-RED | «no existe» | **Fuera de alcance por decisión.** El camino de datos es `client.mjs → quality → sistema*.js → estadoMaquina.js` |
| — | `scripts/plc_opcua.py` | «guion suelto, no está en el camino de datos» | **Correcto, y así se queda.** Es una herramienta de banco de pruebas; no debe entrar al camino de datos |
| — | Base de datos / vector DB | «persistencia JSON» | **Fuera de alcance.** Con 5 intervenciones y 44 fragmentos, un JSON con índice incremental es la respuesta proporcionada. Se revisará cuando la bitácora pase de ~1.000 casos, no antes |
| — | WebSocket | «el frontend sondea REST» | **Fuera de alcance.** El sondeo cubre el caso de uso; un socket es complejidad sin síntoma |
| **C13** | OCR | `No implementado` | **Fuera de alcance, deliberado.** `documentos.mjs:540-549` lo detecta y lo declara. Mentir sería el fallo; callarse, también. No hace ninguna de las dos |

Lo que sí queda pendiente **fuera de este plan** está en §9.

---

## 2 · La tesis

Un caso se escribe rico y se lee pobre. Todo lo demás se sigue de ahí.

```
ESCRITURA (Fase 5, hoy)              LECTURA (Fase 2/3, hoy)
  disparador.riesgoId       -----X    (no se mira)
  diagnostico.propuesta     -----X    (no se mira)
  causaReal.tipo            -----X    (no se mira)
  diagnosticoCorrecto       -----X    (no se mira)
  resuelto                  -----+--> respaldoDeCasos: "se arregló"
  sintoma / causa / solucion ----+--> textoDeRecuperacion -> BM25 + coseno
```

El sistema **parece** aprender, y a veces acierta, porque `causa` es texto
libre y el técnico escribió una frase parecida al título de la causa correcta.
Si hubiera escrito «cambié la válvula», el emparejamiento se habría perdido y
la causa refutada habría quedado primera. Eso no es aprendizaje: es suerte
léxica.

**La solución está en el lector, no en el escritor** — que es la buena
noticia. El esquema de datos no cambia. El frontend no cambia (salvo lo que
gana de nuevo en §F4 y §F5). El LLM no cambia.

---

## 3 · Las siete decisiones de diseño

### 1 · El filtro por riesgo tiene tres niveles, no dos

El arreglo obvio de H1 es filtrar `disparador.riesgoId === riesgoId` igual que
ya se filtra `sistema`. **No sirve tal cual**, y por un motivo que no está en
la auditoría: `registrar_intervencion`
(`backend/ia/herramientas/aprendizaje/index.mjs:201`) acepta
`{ sintoma, solucion, causa, sistema, resuelto, origen }` y **nunca** un
`disparador`. Un caso registrado por voz o por chat —la vía más rápida, la que
se usa con las manos sucias— jamás tendrá `riesgoId`. Un filtro duro los
condenaría a todos a la invisibilidad, que es exactamente el fallo de G4 con
otro disfraz.

Tres niveles, entonces:

| Caso | Trato | Por qué |
|---|---|---|
| `disparador.riesgoId === riesgoId` | Entra con **peso completo** | Es experiencia del mismo riesgo: lo que la puntuación quiere medir |
| Sin `disparador` | Entra con **peso reducido** (máx. 1 punto, nunca 2) | No sabemos de qué riesgo era. Es evidencia débil, no evidencia falsa |
| `disparador.riesgoId !== riesgoId` | **No entra** | Es la §15 aplicada al nivel correcto. Un caso de `sobrepresion` no respalda `derrame` |

`riesgoId` queda **opcional** en `buscarCasosSimilares`: sin él, el
comportamiento es el de hoy, y las búsquedas de toda la planta —el asistente
preguntando «¿nos ha pasado algo parecido?»— siguen funcionando.

### 2 · El corte del manual va sobre magnitud absoluta, no sobre el ranking

H2 no es un fallo del ranking: es un fallo de la **conversión a puntos**.
Dividir por el máximo de la consulta (`documentos.mjs:768`, `casos.mjs:236`)
es lo correcto *para ordenar* —el score crudo de BM25 no tiene techo y no se
puede mezclar con un coseno— y es lo peor posible *para puntuar*, porque
garantiza que el primer fragmento saque 1,00 ≥ `UMBRAL_FUERTE` siempre que
haya una sola palabra en común.

Se separan las dos cosas. `buscar()` y `buscarCasosSimilares()` devuelven
también `scoreCrudo` (BM25 sin normalizar) y, cuando hay embeddings, el
`coseno` por separado. El ranking sigue usando el mezclado normalizado —no se
toca—. `puntosDeScore` pasa a cortar sobre lo absoluto:

- Con embeddings: sobre el **coseno**, que ya es absoluto y comparable entre
  consultas.
- Sin embeddings: sobre el **BM25 crudo**, con un umbral calibrado en §F7
  contra el índice real de `Documentacion/`, no elegido a ojo.

**Anti-objetivo:** cambiar el orden de los resultados. Si el orden cambia, el
arreglo está mal hecho.

### 3 · Causa ↔ caso se emparejan por id, y el texto queda de red de seguridad

`respaldoDeCasos` hace hoy dos cosas mal a la vez: usa `resuelto` («la avería
se arregló») donde hace falta `diagnosticoCorrecto` («acertamos»), y empareja
por parecido de prosa cuando el id estructurado está guardado.

El orden nuevo, dentro de la misma función:

1. **Emparejamiento exacto.** `causaReal.tipo === causa.id` → confirma (+).
   `diagnostico.propuesta === causa.id` con `diagnosticoCorrecto === false` →
   **refuta** (−), y esto es nuevo: hoy nada puede restarle a una causa salvo
   un `resuelto:false`.
2. **Parecido de texto**, sólo para los casos que no traen los campos
   estructurados. La proxy de la Fase 0 deja de ser el mecanismo y pasa a ser
   la compatibilidad hacia atrás.

`resuelto` no desaparece: sigue midiendo lo suyo —la calidad del caso, §26—,
pero deja de hacer el trabajo de `diagnosticoCorrecto`. Son cosas distintas y
el encargo las separa explícitamente en su §22 y §24.

Y `textoDeRecuperacion` (`shared/eva/casos.js`) añade el desmentido a la
frase: «El sistema propuso X; la causa real fue Y». Los dos canales —el
estructurado y el textual— dejan de contar historias distintas.

### 4 · La evidencia son frases, no un entero

La §11 del encargo declara este punto obligatorio y hoy no existe. La salida
por causa es `respaldo: {datos: 2, manual: 2, casos: 2, total: 6}`: es
exactamente el `score = 7` que la §11 declara insuficiente.

`regla.evidencia(v)` **ya produce las frases con cifras** — sólo hay que
pasarlas. Cada causa pasa a llevar `evidenciaAFavor[]` y
`evidenciaEnContra[]`, cada entrada con `{fuente, texto, referencia}`. El
entero se queda: sirve para ordenar. Deja de ser lo único.

Y por primera vez existe un camino para la evidencia **en contra**: una causa
refutada por un cierre anterior (decisión 3), o una señal que contradice la
causa —presión normal frente a una causa de sobrepresión—.

### 5 · El conflicto se enseña, no se resuelve

Hoy las tres fuentes se suman en un número, así que un desacuerdo —sensores
apuntan a A, el manual a B, el historial a C— es **matemáticamente
indistinguible** de un acuerdo. El sistema no puede mostrar el conflicto
porque no lo representa.

Como el `respaldo` ya viene desglosado por fuente, basta con marcar
`conflicto: true` cuando la fuente que más respalda a la causa 1.ª no es la
misma que respalda a la 2.ª, y decírselo al modelo y a la UI. **El sistema no
elige un ganador.** Es la misma tesis que ya defiende el Plan 16 §7: «el
manual dice una cosa y el caso otra → se muestran las dos, separadas y con su
fuente».

### 6 · El término temporal es una firma declarada, no una prosa del LLM

`historia_de_senal`, `correlacionar_senales` y `pronostico.js` existen y
funcionan, pero viven dentro de la herramienta `diagnostico({sintoma})`, que
produce **un dossier en prosa para el modelo**. El motor determinista no ve
una sola serie, y la secuencia que la §8 pone de ejemplo —corriente ↓ → parada
→ temperatura ↑ → presión ↑ → alarma— no se puede detectar hoy.

Meter la herramienta de prosa dentro del motor rompería el determinismo, que
es la propiedad que sostiene todo lo demás. En su lugar:

- Cada causa de `causas.js` puede declarar una **firma temporal**:
  `firmaTemporal: [{ senal: 'presion', direccion: 'sube', ventanaH: 4 }]`.
  Es declarativa, auditable y opcional — una causa sin firma saca `temporal: 0`
  y no se penaliza por ello.
- Un módulo nuevo `backend/ia/temporal.mjs` la evalúa contra `leerSerie` de
  `crearAyudantesDeHistoria` (`herramientas/lib/historia.mjs`), el mismo
  ayudante que ya usan los históricos. Aritmética pura sobre la serie:
  pendiente, signo, ventana.
- Devuelve `temporal: 0..2` **y sus frases**, que entran en
  `evidenciaAFavor[]` / `evidenciaEnContra[]` de la decisión 4.

Esta es la fuente que **de verdad discrimina entre causas del mismo riesgo**,
que es justo lo que `datos` no puede dar —misma evidencia física para todas,
y eso es verdad física, no un defecto— y lo que `manual` dejará de dar por
accidente en cuanto se calibre.

### 7 · No hay migración: los datos son de prueba

La auditoría midió 2 de 5 intervenciones con `sistema: "grupo de bombeo"`, un
id que no existe, invisibles para siempre, y proponía un guion de migración.
**No hace falta:** el sistema no está en producción y esas intervenciones son
de prueba. Se **purgan**, con copia de seguridad previa y un informe de qué se
borró, y la validación de §F0 impide que vuelvan a entrar.

Esto simplifica el plan de verdad, no de forma cosmética: la advertencia de la
auditoría —«aplicar G1 sin G4 hace que ningún caso antiguo entre nunca»—
desaparece, porque no hay histórico que preservar. **La ventana para hacer
esto se cierra el día que entre el primer caso real.** Es el argumento más
fuerte para ejecutar §F0 primero y ya.

---

## 4 · Fases

### Fase 0 · La puerta y la purga · G4

**Problema.** Dos puertas escriben en el mismo sitio con dos reglas distintas:
`POST /api/casos` valida con `z.enum(SISTEMA_IDS)`
(`backend/http/esquemas.mjs:350`) y `registrar_intervencion` acepta texto
libre. El filtro de sistema es exacto y va antes de puntuar, así que un id
inválido hace el caso invisible **sin error, sin aviso**.

- `registrar_intervencion` valida `sistema` contra `SISTEMA_IDS` y devuelve
  `fallo()` con la lista de ids válidos. El modelo pequeño ya sabe reaccionar
  a un `fallo` — es el mismo mecanismo que usan las demás herramientas.
- `crearIntervencion` (`shared/eva/aprendizaje.js:178`) **no** valida: es un
  constructor puro de `shared/`, y meter ahí el catálogo de sistemas
  invertiría la dependencia. La validación va en las dos puertas, que es donde
  hay a quién contestarle.
- `scripts/purgar-casos-invalidos.mjs`: copia de seguridad con marca de
  tiempo, informe de qué se borra y por qué, y **no se ejecuta solo** — se
  invoca a mano tras leer el informe.

**Entregable verificable.** Un `registrar_intervencion({sistema: 'grupo de
bombeo'})` responde con la lista de ids válidos en vez de escribir un registro
condenado.

### Fase 1 · Aislamiento por riesgo · G1

- `buscarCasosSimilares({ sistema, riesgoId, texto, top })` — `riesgoId`
  opcional, aplicado en el mismo filtro previo que ya existe para `sistema`
  (`backend/ia/casos.mjs:227`), con los tres niveles de la decisión 1.
- `diagnostico.mjs · respaldoDeCasos` le pasa el `riesgoId` que ya recibe y
  hoy no propaga.
- Los casos sin `disparador` topan en 1 punto.

**Resultado esperado, medible:** `derrame` deja de citar casos de
`sobrepresion`; su `total` baja de 6 a 4 y su banda de `alto` a `medio` — que
es lo correcto, porque no hay experiencia previa de ese riesgo.

### Fase 2 · El feedback vuelve al pipeline · G3

- `respaldoDeCasos`: emparejamiento exacto primero, texto como red de
  seguridad (decisión 3).
- Una causa refutada **resta**, y la resta no tiene tope, igual que ya no lo
  tiene la de `resuelto:false`.
- `textoDeRecuperacion` incorpora `causaReal` y el desmentido.
- **La caché de embeddings de casos hay que versionarla.** Hoy la huella
  incremental es sólo el `id`, con la justificación correcta de que una
  intervención no se edita nunca. Al cambiar la *función* que genera el texto,
  los vectores guardados dejan de corresponder al texto actual: se versiona
  igual que ya se versiona por modelo de embeddings.

**Resultado esperado:** `consigna-variador-alta`, refutada dos veces, baja de
banda **sola**. El sistema deja de aprender sólo de la prosa de quien lo
corrigió.

### Fase 3 · Calibración del manual · G2 + G7 + G8

**Partida en dos entregas por dependencia de servidor** (§10): `F3a` no
necesita nada encendido, `F3b` exige el servidor de embeddings.

**F3a · sin servidores**

- `scoreCrudo` por separado en las dos búsquedas; `puntosDeScore` corta sobre
  el BM25 crudo cuando no hay embeddings (decisión 2), con el umbral calibrado
  contra los PDF que ya están en `Documentacion/`.
- **G7 · aislamiento documental.** `casos.mjs` protege el cruce entre sistemas
  y `documentos.mjs` no: un manual de vibraciones puede respaldar una causa
  del tanque. Es una asimetría que el proyecto no se había visto. El
  manifiesto `Documentacion/.manifiesto.json` **ya existe** (Plan 16 F1): se
  le añade `sistema` por archivo y `buscar()` gana un filtro opcional.
  Opcional, no obligatorio: un manual general de la planta debe seguir
  respaldando a los dos sistemas.
- **G8 · dedupe.** Dos pares de PDF byte a byte idénticos hacen que
  `manualCitado` presente dos referencias del mismo documento, que al técnico
  le parecerán dos confirmaciones independientes. Se deduplica por hash de
  contenido al indexar — **el hash ya se calcula** para la caché de
  embeddings.

**F3b · con el servidor de embeddings**

- `coseno` por separado y el corte sobre él, que es la magnitud absoluta buena
  y la que usa producción. Se **escribe** en F3a, detrás de `usaEmbeddings`,
  con el umbral marcado `PROVISIONAL: true` — el mismo patrón que `umbrales.js`
  ya usa para lo estimado frente a lo medido. Se **calibra** aquí.
- Regla dura: mientras el umbral esté marcado provisional, nadie puede decir
  que C11 está cerrada. Un corte sin medir es exactamente el defecto que este
  plan vino a arreglar, con otro número.

### Fase 4 · Evidencia y conflicto · G6 + G9

- `evidenciaAFavor[]` / `evidenciaEnContra[]` por causa (decisión 4).
- `conflicto: true|false` por diagnóstico (decisión 5), y en `comoRedactar` la
  instrucción de **enseñar** el desacuerdo, no de resolverlo.
- `CierreDiagnostico.jsx` gana las dos listas. Es el primer cambio de
  frontend del plan, y es aditivo: nada de lo que hoy se ve desaparece.

### Fase 5 · Trazabilidad · G10 + persistencia del diagnóstico

- `manualCitado` y `casosCitados` llevan un **extracto** del fragmento y del
  caso, no sólo la referencia. Hoy nadie puede verificar una cita sin salir
  del sistema — y como se vio en H1, cuando uno va a mirar a veces el respaldo
  es de otro riesgo.
- `chunkId` y **hash del PDF** junto a `{archivo, pagina}`: sin él, una cita
  de hace seis meses puede apuntar a otro contenido con el mismo nombre y la
  misma página.
- `diagnosticEventId` y persistencia del **top-N completo** con sus
  puntuaciones. Hoy el cierre sólo guarda la primera candidata, y un
  diagnóstico no se puede reconstruir dentro de seis meses.

### Fase 6 · El cuarto término · G5

`firmaTemporal` en `causas.js`, `backend/ia/temporal.mjs`, y el término
`temporal: 0..2` en el respaldo (decisión 6). Va **la última de las que
suman** a propósito: es la fase más grande, y sin las anteriores estaría
añadiendo una cuarta señal a una fórmula que todavía no sabe leer las tres que
tiene.

### Fase 7 · Recalibración medida

**Esta fase no es opcional y no es papeleo.** Las fases 1-3 y 6 cambian *qué
entra* en la fórmula, y por tanto la distribución de los totales:

| | Hoy | Tras F1-F3 | Tras F6 |
|---|---|---|---|
| Máximo teórico | 3+2+2 = **7** | 7 | 3+2+2+2 = **9** |
| `manual` típico | 2 casi siempre | 0..2 real | 0..2 real |
| `casos` típico | inflado por cruce | sólo del mismo riesgo | ídem |
| Corte de `alto` | `≥5` y ≥2 fuentes | **desalineado** | **desalineado** |

Si se dejan los cortes como están, `alto` pasa de sobrepoblado a
prácticamente inalcanzable, y el técnico deja de creerse la banda por el
motivo contrario. Los cortes de `bandaDe` y los `UMBRAL_*` se recalibran
**contra la salida real** del motor sobre los manuales y los casos que haya en
disco ese día, con la distribución medida anotada en el commit. La regla
«`alto` exige ≥2 fuentes activas» se conserva pase lo que pase: es el tope que
impide que la memoria se vuelva dogma.

**Tres pasadas, no una** — porque cada una mide una cosa distinta y dos de
ellas dependen de un servidor:

| | Qué recalibra | Cuándo | Servidor |
|---|---|---|---|
| **F7a** | Bandas en modo **BM25 solo**, tras F1-F3a | En cuanto F3a esté | Ninguno |
| **F7b** | Bandas en modo **embeddings + BM25** — el de producción | Con F3b | Embeddings |
| **F7c** | Bandas con el **cuarto término**, máximo 9 | Con F6 | Embeddings + ICONICS real |

F7a no es trabajo tirado que F7b repita: fija la forma de la distribución y el
guion que la mide (`verificar-calibracion.mjs`), y deja el sistema coherente
en el modo degradado, que es un modo real —es lo que corre cuando el :8081 se
cae, y hoy no está calibrado para nada—.

---

## 5 · La prueba que falta

`scripts/verificar-diagnostico.mjs` pasa sus 8 comprobaciones y está bien
escrito, pero usa **dobles de prueba** que devuelven scores controlados
(`{score: 0.9}`). Nunca ejerce la normalización real de BM25 — que es
exactamente donde vive H2. **Las pruebas verifican la aritmética, no la
calibración.** Por eso ocho pruebas en verde convivieron con tres defectos
medibles.

`scripts/verificar-calibracion.mjs`, nuevo, corre contra el índice **real** de
`Documentacion/` y afirma lo que los dobles no pueden:

1. Dos causas del mismo riesgo **no empatan** en `manual`.
2. Un caso de otro riesgo **no aparece** en `casosCitados`.
3. Una causa refutada por un cierre anterior **queda por debajo** de la que el
   técnico señaló como real.
4. Un manual de vibraciones **no respalda** una causa del tanque.
5. `manualCitado` no contiene dos entradas del mismo documento.
6. Con `Documentacion/` vacía, todo sigue funcionando y `manual` sale 0 — la
   degradación que ya está verificada, que no se rompa al calibrar.

Los dobles se quedan donde están: verifican el determinismo y la aritmética,
que es lo suyo. Lo que faltaba era una prueba que tocara disco.

**Las seis corren sin ningún servidor**, en modo BM25, contra los PDF que ya
están en `Documentacion/` — el guion se escribe en el tramo 1 (§7). Cuando
vuelva el servidor de embeddings, las mismas seis se ejecutan en modo
«embeddings + BM25» sin tocar una línea: es la prueba que valida F3b y F7b, y
por eso se escribe antes de necesitarla.

Sin regresiones en lo que ya pasa: `verificar-backend` (73),
`verificar-casos` (8), `verificar-diagnostico` (8), `verificar-documentos`
(10), `verificar-herramientas` (116), `verificar-casos-cierre`, y la suite de
vitest.

---

## 6 · Riesgos del propio plan

| Riesgo | Mitigación |
|---|---|
| **F1 esconde los casos de voz** — nunca traerán `disparador` | Tres niveles, no filtro binario (decisión 1). Un caso sin disparador entra con peso reducido, nunca se descarta |
| **Recalibrar deja `alto` inalcanzable** | F7 es una fase con entregable propio, medida contra datos reales, no un ajuste al vuelo |
| **Un cierre equivocado refuta una causa correcta para siempre** | La refutación resta, no elimina. Se corrige con un cierre posterior, nunca editando el original — «lo que pasó, pasó» (`aprendizaje.js`) |
| **El cambio de `textoDeRecuperacion` invalida la caché de embeddings** | Se versiona la caché por versión de la función, igual que ya se versiona por modelo. Previsto en F2, no descubierto en producción |
| **La firma temporal se convierte en un lenguaje de reglas** | Se queda en `{senal, direccion, ventanaH}`. Si una causa necesita más expresividad que eso, es señal de que hace falta una regla en `riesgos.js`, no un campo nuevo aquí |
| **Tocar el ranking al arreglar el corte** | Anti-objetivo explícito (decisión 2), y `verificar-calibracion` afirma el orden además de los puntos |

---

## 7 · Orden de trabajo

El orden es **el offline**: cada entrega va lo más pronto que su dependencia
de servidor permite, no lo más pronto que su valor pediría. Los detalles de
qué necesita cada una están en §10.

### Tramo 1 · Sin ningún servidor encendido

| # | Entrega | Por qué va aquí |
|---|---|---|
| 0 | **`npm install` en `backend/`** | Requisito previo, y no lo cubre ningún servidor de planta: necesita el registro de npm. Ver §10 |
| 1 | **F0** · puerta + purga | **La ventana se cierra con el primer caso real.** Hoy se puede borrar; mañana habría que migrar |
| 2 | **F1** · aislamiento por riesgo | El defecto más visible para el técnico: una banda `alto` sostenida por otro riesgo. Es un filtro por id — no hay nada semántico que consultar |
| 3 | **F2** · el feedback vuelve | El dato más caro del sistema empieza a servir para algo. Emparejamiento por id exacto: tampoco necesita embeddings |
| 4 | **F5** · trazabilidad | **Adelantada.** Los extractos, el `chunkId` y el hash del PDF salen del índice y del disco. Antes iba la 7.ª por valor; es de las que menos depende de nada |
| 5 | **F3a** · manifiesto, dedupe y corte BM25 | Con F1 y F2 hechas ya hay dos términos que discriminan; éste añade el tercero en el modo que se puede medir hoy |
| 6 | **F7a** · recalibrar bandas en modo BM25 | **Hecha el 02-09-2026.** El bloqueo era falso: `IA_DOCS_DIR` apunta a `Documentacion/`, que sí tenía manuales — la nota miraba `Documentos/`. Medido con `scripts/medir-calibracion.mjs`; `UMBRAL_BM25_FUERTE` 8 → 6 |
| 7 | **F4** · evidencia y conflicto | Convierte «datos 2, manual 2, casos 2» en algo que una persona puede juzgar. **Completa sin ningún servidor**: `valoresSensores` es opcional y hoy ningún llamador real lo trae (ver la Fase 4 en el registro de cambios) |
| 8 | **F6** · término temporal | **Completa.** `firmaTemporal`, `temporal.mjs`, wireado en `app.mjs`. Umbral relativo marcado provisional; `bandaDe` sin recalibrar (F7c) |

### Tramo 2 · Cuando vuelva el servidor de embeddings

| # | Entrega | Por qué espera |
|---|---|---|
| 9 | **F3b** · corte sobre coseno | **Hecha el 02-09-2026**, contra el :8081 real. Los cortes viejos (0,55/0,20) repartían 2:4% · 1:96% · 0:0% — `manual` valía 1 casi siempre, el defecto de la auditoría con el signo cambiado. Ahora 0,46/0,36 → 2:12% · 1:64% · 0:24% |
| 10 | **F7b** · recalibrar en modo embeddings + BM25 | **Medida el 02-09-2026, pero C11 SIGUE ABIERTA.** El corpus medible son 2 documentos ÚNICOS y 44 fragmentos: alcanza para ver la forma de la distribución y corregir un corte demostrablemente malo, no para llamarlo calibración de producción. Los umbrales siguen `PROVISIONAL`, y la regla de §4·F3b es que con eso C11 no se cierra |

### Tramo 3 · Cuando vuelva ICONICS real

| # | Entrega | Por qué espera |
|---|---|---|
| 11 | **F7c** · umbrales de las firmas temporales | La física del simulador sirve para escribir el módulo, no para fijar una pendiente |
| 12 | **Comprobación de narración** | Que el modelo obedezca la instrucción de conflicto de F4 exige llama-server. Es lo único que necesita el servidor IA en todo el plan |

**Sin dependencias humanas.** Ninguna fase espera a que nadie declare nada:
las causas ya están transcritas, el manifiesto ya existe, las series ya se
leen, y los campos estructurados ya están guardados y llenos. Todo el plan es
volver a leer lo que ya se escribe.

**Ocho de las doce entregas caen en el tramo 1**, y con ellas G1, G3 y G4
enteros y G2 en su rama medible. Lo que espera a un servidor es calibración,
no funcionalidad — con una excepción que hay que decir en voz alta: **C11
(scoring reproducible) no se puede declarar cerrada hasta F7b**, porque el
modo que corre en producción es el de embeddings y su corte seguirá sin
medir.

---

## 8 · Qué queda cerrado

De la matriz de 36 capacidades de la auditoría:

| ID | Capacidad | Antes | Después |
|---|---|---|---|
| C10 | Evidencia a favor/en contra | No implementado · **Crítica** | Implementado (F4) |
| C11 | Scoring reproducible | Incorrecto · **Crítica** | Implementado (F3a+F7a en modo BM25; **cerrada sólo con F3b+F7b**) |
| C15 | Aislamiento por riesgo | No implementado · **Crítica** | Implementado (F1) |
| C27 | Casos con diagnóstico incorrecto | Parcial · **Crítica** | Implementado (F2) |
| C28 | Feedback → pipeline | Parcial · **Crítica** | Implementado (F2) |
| C17 | Validación de `sistema` | Incorrecto · Alta | Implementado (F0) |
| C07 | Análisis temporal | Parcial · Alta | Implementado (F6) — umbral provisional, `bandaDe` sin recalibrar (F7c) |
| C12 | Document RAG | Implementado con reservas · Alta | G7+G8 sin reservas (F3a); corte BM25 **provisional** hasta F7a — sin corpus real que calibrar en esta copia |
| C30 | Conflicto entre fuentes | No implementado · Alta | Implementado (F4) |
| C31 | Trazabilidad | Parcial · Alta | Implementado (F5) |
| C29 | Calidad de casos | No implementado · Media | Implementado (F2 — `resuelto` recupera su papel) |
| C32 | Reproducibilidad | Parcial · Media | Implementado (F5) |
| C08 | Diagnostic Engine | Implementado, sin `diagnosticEventId` | Sin reservas (F5) |
| C02 | Ingesta de sensores | «sin MQTT/OPC-UA» | **Sin reserva, por decisión** (§1) |

Y de las diez respuestas de la §45 del encargo, las tres que cambian: **A**
(¿puede diagnosticar hoy?) de *Parcial* a **Sí**; **D** (¿la retroalimentación
vuelve al sistema?) de *Parcial — el fallo grande* a **Sí, por los campos
estructurados**; **H** (¿es explicable?) de *Parcial* a **Sí, con las frases y
no sólo los números**.

---

## 9 · Fuera de alcance, y dónde va cada cosa

| Pendiente | Dónde |
|---|---|
| **G11 · Autenticación y autoría del cierre** — `AUTH_HABILITADA` declarada pero inactiva; los cierres se firman `anonimo` | **Plan aparte.** Es transversal a todas las rutas, no sólo a `/api/casos`, y no bloquea ninguna corrección de este plan. Importa: el registro de quién determinó la causa real hoy no existe |
| **MachineState explícito** (§6) — sobre todo `MAINTENANCE`, para silenciar riesgos mientras el técnico trabaja | Mejora Media. Merece su propia fase: el técnico que repara genera riesgos falsos mientras repara |
| **Adjuntos en el cierre** (§21) — fotos y mediciones | Guardar binarios es capacidad nueva, ya declarada fuera de alcance en el Plan 16 §6 |
| **Salida forzada del LLM** (`grammar` de llama.cpp) | Recuperaría la §19 *después* del modelo. La UI de cierre no la necesita (usa `GET /api/diagnostico` directamente); el chat sí |
| **Detección de valores congelados** (`stale`), outliers, frecuencia de muestreo | Mejora Baja. Requiere que la calidad viaje como grado y no como frontera binaria |
| **Métricas de acierto del motor** | Con `diagnosticoCorrecto` ya leído (F2) se puede medir la tasa de acierto. Es el uso más obvio del campo y sale casi gratis después de F2 |
| **OCR, MQTT, OPC-UA, Node-RED, event bus, base de datos, WebSocket** | §1 · fuera por decisión de arquitectura, no por falta de tiempo |

---

## 10 · Trabajo sin servidores

Este plan se puede ejecutar casi entero **sin llama-server, sin Whisper, sin
el servidor de embeddings y sin ICONICS**. No es una concesión: es una
propiedad que el proyecto ya se ganó y que conviene no perder.

### Requisito previo, y no es ninguno de los cuatro

`backend/node_modules` puede estar incompleto —medido el 01-09-2026 en esta
copia: 78 paquetes, sin `pino`, `fastify`, `zod` ni `vitest`—, y entonces
cualquier guion muere en `ERR_MODULE_NOT_FOUND` antes de tocar nada. **`npm
install` en `backend/` necesita el registro de npm**, que es una dependencia de
red distinta de los cuatro servidores y hay que resolverla primero. Es la
entrega 0 de §7.

### Qué sustituye a qué

| Servidor | Sustituto | Fidelidad |
|---|---|---|
| **ICONICS** | `ICONICS_FAKE=true` → `backend/iconics/fakeClient.mjs` | **Alta.** Misma firma que el cliente real (`readPoint`, `readPoints`, `readHistory`, `readAlarmHistory`, …), paginación real (`X-ICO-CONTINUATION`), calidad mala y huecos con la misma probabilidad que el simulador, y las tres señales que devuelven la serie de otra — un fake que sólo sirviera datos buenos escondería la trampa |
| **Embeddings (:8081)** | `usaEmbeddings = Boolean(embeddingBase)` → todo cae a **BM25 solo** | **Funcional, no calibrable.** El sistema busca y puntúa; lo que no se puede es medir el corte sobre el coseno |
| **llama-server (:8080)** | — | No hace falta: **ninguna fase cambia el papel del LLM** |
| **Whisper** | — | No hace falta: sólo vive en `/api/voz`. La «puerta de voz» de F0 es la herramienta `registrar_intervencion`, invocable directamente |

Ojo con una trampa: `scripts/generar-historia-simulada.mjs` **escribe en el
historiador real** (`POST /History/AddSamples`, exige `ICONICS_READ_ONLY=false`)
y por tanto **no** es la vía offline para F6. La vía offline es `readHistory`
del transporte falso.

### Dependencia por fase

| Fase | Sin servidores | Qué queda esperando |
|---|---|---|
| **F0** · puerta + purga | **Completa** | — |
| **F1** · aislamiento por riesgo | **Completa** | — |
| **F2** · feedback estructurado | **Completa** | — |
| **F5** · trazabilidad | **Completa** | — |
| **F3a** · manifiesto + dedupe + corte BM25 | **Completa** | — |
| **F7a** · bandas en modo BM25 | Herramienta completa, medición **bloqueada** | Sin servidor: falta un `Documentacion/` real, no un servidor |
| **F4** · evidencia + conflicto | **Completa, sin ningún servidor** | Que el modelo obedezca la instrucción nueva de `comoRedactar` — lo único de F4 que de verdad pide llama-server |
| **F6** · término temporal | **Completa** | F7c: recalibrar `bandaDe` con el cuarto término, contra series reales |
| **F3b** · corte sobre coseno | **No** | Servidor de embeddings |
| **F7b** · bandas en modo producción | **No** | Servidor de embeddings |

### Por qué esto sale tan bien, y qué no hay que leer de más

Que los dos gaps críticos más graves —F1 y F2— no necesiten embeddings **no es
suerte**: son exactamente los que arreglan lo que *no* era semántico. Un
filtro por `riesgoId` y un emparejamiento por `causaReal.tipo === causa.id` son
comparaciones de identificadores. La tesis del plan (§2) es que el sistema
estaba usando parecido de prosa para algo que ya tenía un id, y un id se
compara sin GPU.

Lo que **no** se puede concluir: que el plan esté terminado al acabar el tramo
1. Un umbral escrito y no medido es una decisión pendiente disfrazada de
código, y este plan existe precisamente porque `UMBRAL_FUERTE = 0.55` llevaba
meses pareciendo una decisión tomada. Mientras `F3b` y `F7b` no se hayan
ejecutado, el estado honesto de C11 es **provisional**, y se marca en el
código con el mismo `PROVISIONAL: true` que el tablero ya sabe pintar.
