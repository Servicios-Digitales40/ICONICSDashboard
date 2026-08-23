Catálogo de mejoras candidatas · Asistente de IA (post Plan 14)

Esto NO es un plan de ejecución como Plan 13/14 — es un catálogo de 30 mejoras
candidatas para el razonamiento, la calidad de respuesta y la generación de
documentación del asistente, con hardware actual (9B en una sola GPU) y con
hardware futuro (Fase 1 del Plan 14: máquina de IA propia, 16 GB dedicados).
Cada entrada dice QUÉ, POR QUÉ vale la pena, y CÓMO encajaría en este código
concreto — no son ideas genéricas de "mejora tu LLM".

Convención de prioridad: 🟢 barato (días, sin nuevas dependencias ni
hardware) · 🟡 medio (una semana, puede pedir una dependencia nueva) · 🔴
caro o depende de hardware que hoy no está.

────────────────────────────────────────────────────────────────────────────
A · Razonamiento del modelo — decidir mejor, no sólo redactar mejor
────────────────────────────────────────────────────────────────────────────

1. 🟢 Ejemplos few-shot en el prompt de sistema. Dos o tres pares
   pregunta/respuesta IDEALES (un diagnóstico bien separado en medido/
   hipótesis, un gráfico bien interpretado) fijos en `instrucciones()` de
   `chat.mjs`, escritos por nosotros, no generados. Es la palanca más barata
   que existe para un 9B: mejora consistencia de formato sin tocar una línea
   de `herramientas.mjs`. Riesgo: sube el tamaño del prompt, hay que medir
   contra `verificar-chat.mjs` que no se coma el presupuesto de `IA_MAX_TOKENS`.

2. 🟢 Verificador de consistencia numérica (anti-alucinación de cifra).
   Una pasada SIN LLM, después de que el modelo redacta: extraer los números
   de la respuesta final y comprobar que aparecen en el resultado crudo de
   las herramientas que se llamaron. Si un número no cuadra, se marca
   `cifraSospechosa: true` en el registro (no se le oculta al operador, pero
   queda trazado). Mismo espíritu que la "red de seguridad" que ya existe
   para el aviso de umbrales en `chat.mjs`, aplicada a cifras en vez de a la
   advertencia de procedencia.

3. 🟡 Auto-crítica de una pasada antes de enviar. Un segundo turno interno
   —sin volver a tocar el historiador, sólo relee su propio borrador— contra
   una checklist corta: "¿separé medido de hipótesis? ¿cité tendencia/banda
   en vez de inventar? ¿mencioné un límite sin decir que es candidato?". Cabe
   dentro del presupuesto de `IA_MAX_PASOS` como un paso más, pero cuesta un
   turno completo de latencia extra — hay que medir si vale la pena en un 9B
   (en un 14B+ el criterio cambia, ver F.24).

4. 🟡 Plan explícito antes de ejecutar, para preguntas compuestas. Pedirle al
   modelo que declare la lista de herramientas que va a llamar ANTES de
   llamarlas, validarla contra el catálogo real (`herramientas.nombres`), y
   sólo entonces ejecutar. Reduce llamadas desperdiciadas dentro del
   presupuesto de 4 pasos — hoy `diagnostico()` ya hace este plan pero fijo
   en código; esto lo generalizaría a preguntas que NO encajan en una
   herramienta compuesta existente.

5. 🟢 Repair hint estructurado cuando falla resolverSenal/resolverVentana.
   Hoy el error ya sugiere alternativas en texto (`ALTERNATIVAS`, la lista de
   señales conocidas); formalizarlo como un campo `sugerencias: string[]`
   aparte del mensaje de error, para que el modelo no tenga que parsear
   prosa para corregirse — mismo principio que ya usa `senalDesconocida()`,
   extendido a todos los fallos de resolución, no sólo el de señal.

────────────────────────────────────────────────────────────────────────────
B · Calidad y consistencia de la respuesta
────────────────────────────────────────────────────────────────────────────

6. 🟢 Calibración de confianza generalizada. El patrón "medido / documentado
   / hipótesis" que ya rige `diagnostico()` (ver la regla en `chat.mjs`) se
   podría exigir en TODAS las respuestas que citan una cifra, no sólo en
   diagnóstico — hoy `estado_del_sistema` y `historia_de_senal` no fuerzan
   esa distinción porque casi nunca hace falta, pero en `analisis_de_senal`
   (con proyección y tendencia) sí importa y hoy no está reforzado en el
   prompt.

7. 🟢 Plantillas de respuesta por tipo de pregunta. Estado / diagnóstico /
   comparación / reporte cada uno con una forma esperada (qué va primero, qué
   va en negrita, cuándo usar viñetas) escrita en `instrucciones()`, para que
   el formato no dependa del humor del modelo turno a turno. Se puede medir
   con una prueba de forma —no de contenido— sobre `verificar-chat.mjs`.

8. 🟡 Vocabulario de planta configurable. `SINONIMOS` en `herramientas.mjs`
   es un objeto fijo en código, escrito con lo que el equipo cree que dice un
   operador. Exponerlo como archivo de configuración (o poblarlo con
   correcciones reales capturadas en producción) para que el asistente hable
   como habla ESTA planta y no como se imaginó que hablaría.

9. 🟢 Prueba de consistencia pantalla-vs-chat. Automatizar la comparación
   entre la cifra que pinta la vista de Planta (React) y la que cita el chat
   para la MISMA lectura en el mismo instante — hoy se comparte
   `redondear()`/decimales del catálogo por diseño, pero no hay una prueba
   end-to-end que lo demuestre; sería una regresión continua barata.

10. 🟢 Guarda contra "cortesía vacía". `verificar-chat.mjs` ya cubre "ni
    herramienta ni texto: nunca una burbuja vacía", pero no cubre el caso de
    una respuesta que SÍ tiene texto pero es puro relleno ("¡Claro, aquí
    tienes!" sin ningún dato) cuando la pregunta pedía una cifra concreta.
    Se podría detectar con una regla simple: si hubo llamada a herramienta
    pero la respuesta no contiene ningún número de los que la herramienta
    devolvió, marcarlo.

────────────────────────────────────────────────────────────────────────────
C · Documentación técnica generada — el PDF de generar_reporte
────────────────────────────────────────────────────────────────────────────

11. 🟢 Resumen ejecutivo automático al inicio del PDF. 3-4 líneas compuestas
    por `reporte.mjs` (no el modelo) que agreguen el estado general de las
    señales incluidas, reusando `estadoInfo`/`UMBRALES` — mismo criterio que
    ya resume `estado_del_sistema()` para el chat, aplicado como párrafo fijo
    en la portada del reporte.

12. 🟢 Anexo de anomalías en el PDF. `generar_reporte` ya calcula
    `calcularTendencia()` por señal (desde este mismo commit); añadir
    también `detectarAnomalias()` y listarlas en una tabla al final del
    documento con su hora, en vez de que sólo aparezcan citadas en el chat de
    `grafico_de_senal`.

13. 🟡 Comparación entre períodos dentro del mismo reporte. Reutilizar
    `comparar_periodos` (ya existe) para una sección "este mes vs. mes
    pasado" cuando el usuario lo pida, con la diferencia calculada por el
    backend —igual que ya hace esa herramienta para el chat— y no por el
    modelo.

14. 🟡 Plantillas de reporte por audiencia. Una versión "operador" (gráficos
    + tabla de valores, como hoy) y otra "gerencia" (resumen ejecutivo +
    tendencias, sin gráficos ni ruido técnico) — mismo dato, dos
    maquetaciones distintas en `reporte.mjs`, elegidas con un parámetro nuevo
    en `generar_reporte`.

15. 🔴 Export a Word/HTML además de PDF. `pdfkit` no sirve para esto — haría
    falta una ruta de exportación aparte (plantilla HTML → .docx con una
    librería nueva), con el mismo cuidado de carga perezosa (`await
    import()`) que ya se aplicó a `pdfkit`/`svg-to-pdfkit` para no repetir el
    incidente de `chartjs-node-canvas`. Vale la pena sólo si mantenimiento
    necesita EDITAR el reporte antes de archivarlo, no sólo leerlo.

────────────────────────────────────────────────────────────────────────────
D · Documentación de planta (RAG) — consultar_documentacion, limites_del_manual
────────────────────────────────────────────────────────────────────────────

16. 🟡 OCR para manuales escaneados. Hoy `documentos.mjs` detecta un PDF-
    imagen y dice que no se puede leer, en vez de indexar basura —correcto,
    pero deja ese manual fuera del todo. Tesseract.js corre en WASM sin
    dependencia nativa, así que respeta la regla de "sin dependencias
    pesadas" que ya rompió `chartjs-node-canvas`; el costo es tiempo de
    indexado, no arranque frágil.

17. 🟡 Extracción de tablas de especificaciones. `limites_del_manual` busca
    candidatos con regex sobre texto corrido (número + palabra de límite);
    muchos manuales ponen los límites en TABLAS, que el extractor de texto
    actual (zlib de Node, sin dependencias) probablemente aplana mal. Vale la
    pena medir cuántos límites reales se están perdiendo así antes de
    invertir en un extractor de tablas.

18. 🟢 Reindexado incremental por `mtime`. La carga de `indiceDocumentos` es
    perezosa (no retrasa el arranque) pero re-trocea TODOS los PDF en la
    primera consulta tras cada reinicio del backend. Con una carpeta de
    manuales grande, detectar sólo los archivos nuevos o modificados evitaría
    reprocesar lo que no cambió.

19. 🟡 Cross-reference entre reporte y manual. Cuando `diagnostico()` cita un
    límite del manual, hoy esa cita vive sólo en el chat — no llega al PDF de
    `generar_reporte`, que hoy no toca `limites_del_manual` en absoluto.
    Enlazar los dos (el reporte de una señal cita su límite documentado, con
    archivo y página) cerraría el círculo entre "lo que se generó" y "lo que
    dice el manual".

20. 🔴 Ranking de relevancia ajustado con datos reales. El mezclado 60%
    semántico / 40% léxico de `documentos.mjs` es un número fijo, elegido a
    priori. Una vez haya servidor de embeddings activo en producción (Fase 1
    del Plan 14), vale la pena medirlo contra preguntas reales de la planta
    y ajustarlo con datos en vez de a ojo — depende de tener el servidor de
    embeddings, así que es 🔴 hoy y 🟡 después de la Fase 1.

────────────────────────────────────────────────────────────────────────────
E · Memoria, aprendizaje continuo y confiabilidad medible
────────────────────────────────────────────────────────────────────────────

21. 🟡 Suite de evaluación con preguntas doradas. Un conjunto fijo de 30-50
    preguntas con respuesta esperada —extendiendo lo que ya existen como los
    dos escenarios de diagnóstico en `verificar-herramientas.mjs`— para medir
    de forma repetible si un cambio de modelo o de prompt mejora o empeora.
    Hoy esa validación es manual (como las pruebas con curl de esta sesión);
    formalizarla es lo que permite subir de 9B a 14B con confianza real en
    vez de impresión.

22. 🟡 Métrica de tasa de alucinación, en el tiempo. Automatizar el punto A.2
    (verificador de consistencia numérica) y trackear su tasa como KPI del
    proyecto, no sólo como una comprobación puntual — es la métrica que
    debería gobernar la decisión de subir de tamaño de modelo, más que la
    latencia.

23. 🟡 Bitácora de incidentes searchable. Guardar cada `diagnostico()` con su
    resultado real reportado después por el operador (¿acertó? ¿qué fue de
    verdad?) en un almacén simple (podría ser tan sencillo como archivos
    JSON en disco, sin base de datos nueva). Con eso, un diagnóstico futuro
    podría citar "esto ya pasó el 12 de julio, fue por X" en vez de partir
    de cero cada vez — el precedente son los propios manuales indexados por
    BM25, aplicado a incidentes propios en vez de a documentación de
    fábrica.

24. 🟢 Panel de salud del asistente. Latencia por tipo de pregunta, tasa de
    `sinRespuesta`/`bloqueada`, herramientas más usadas — la telemetría ya
    existe parcialmente en los logs de `chat.mjs` (`logger.info('Chat
    respondido', ...)`); falta agregarla en un panel, no capturarla de
    nuevo.

────────────────────────────────────────────────────────────────────────────
F · Con hardware mejor y modelos más grandes (Fase 1-2 del Plan 14)
────────────────────────────────────────────────────────────────────────────

Todo lo de aquí abajo asume que ya pasó la Fase 1 (máquina de IA separada,
§1 del Plan 14) y hay margen de VRAM real —no los 7,5 GB ajustados de hoy—
para experimentar sin arriesgar el servicio.

25. 🔴 Modelo más grande (14B–32B clase Qwen3) con contexto de 16-32k. Ya es
    la Fase 2 del propio Plan 14 (hoy en pausa: se decidió seguir con el 9B).
    Con más contexto, `diagnostico()` podría dejar de recortar el dossier
    para caber en 8k y el modelo tendría más margen para el razonamiento
    encadenado de varios pasos sin perder las instrucciones del sistema.

26. 🔴 Fine-tuning ligero (LoRA) sobre datos reales de esta planta. Una vez
    exista la bitácora de incidentes (E.23) y algo de historial de
    correcciones del operador (B.8 aplicado), un LoRA entrenado sobre
    ejemplos reales de ESTA instalación —vocabulario, patrones de avería
    reales— probablemente rinda más que subir el tamaño del modelo base a
    secas. Requiere GPU con margen para entrenar, no sólo para inferir.

27. 🔴 Arquitectura planificador + ejecutor + crítico (multi-agente). Hoy un
    solo modelo decide QUÉ herramienta llamar y luego redacta; con más
    cómputo disponible, separar "qué preguntar" de "cómo redactar" en dos
    pasadas (o dos modelos, uno pequeño y rápido para orquestar, uno más
    grande para redactar) podría bajar el costo de los pasos intermedios sin
    sacrificar calidad en la respuesta final.

28. 🔴 Modelo de visión para fotos de equipo y esquemas. Un operador que
    manda una foto de una válvula o un panel —hoy el asistente sólo lee
    texto e historiador— podría preguntarle "¿qué le pasa a esto?" con
    contexto visual real. Necesita un modelo multimodal servido aparte
    (misma arquitectura de "segundo llama-server" que ya existe para
    embeddings, `IA_EMBEDDING_BASE`), y manuales con diagramas ya indexados
    para cruzar la imagen con la documentación.

29. 🟡→🔴 Dictado y voz mejorados. `whisper small` hoy es suficiente para
    frases cortas en español; con más VRAM libre, `whisper medium` (ya
    contemplado en el propio §0.1 del Plan 14) mejora precisión, y con eso
    resuelto tendría sentido evaluar texto-a-voz para que el asistente
    RESPONDA hablado en la sala de control, no sólo escuche.

30. 🔴 Reranking semántico dedicado para la documentación. Con el servidor
    de embeddings ya asumido como "siempre encendido" (no como hoy, opt-in),
    se podría añadir un modelo de reranking pequeño que reordene los
    candidatos de `consultar_documentacion`/`limites_del_manual` antes de
    dárselos al modelo principal — mejora medible en RAG técnico, y barato
    en cómputo comparado con subir el tamaño del modelo generativo.

────────────────────────────────────────────────────────────────────────────
Cómo priorizar esto

No es una lista para hacer de arriba a abajo. El criterio de este proyecto
hasta ahora (ver Plan14.md) ha sido: primero lo que no depende de hardware
nuevo (A, B, D.16-19, E), después lo que depende de la Fase 1 (D.20, F). De
los 🟢 de arriba, A.1 (few-shot) y A.2 (verificador de cifras) son los que
más impacto barato tienen sobre la queja original de esta sesión —que el
modelo interpretara en vez de repetir cifras— y serían el punto natural de
continuar.
