# Plan 16 · Diagnóstico de fallas con tres fuentes

> **Objetivo.** Que ante una condición anómala el tablero proponga una causa
> probable cruzando **datos en vivo**, **manuales** y **casos resueltos antes**,
> y que cada intervención de un técnico deje memoria en la planta en vez de
> perderse. Hoy el RAG sólo lee manuales, y la bitácora de intervenciones se
> devuelve por fecha, no por parecido.

> **ESTADO (1-sep-2026)** — Plan aprobado, sin implementar. Las cuatro
> decisiones de arquitectura están tomadas (§2) y la semilla de causas
> candidatas se derivó de lo ya declarado, con lo que el plan perdió su única
> dependencia externa (§3).

---

## 0 · De qué se parte

Todo el RAG actual vive en `backend/ia/documentos.mjs`. En una frase: **cuando
alguien pregunta, el backend busca los fragmentos de manual más parecidos y se
los pasa al modelo como contexto citable.** El modelo nunca recibe un manual
entero — recibe fragmentos con archivo y página, y las instrucciones le obligan
a citar la fuente.

| Paso | Qué hace |
|---|---|
| 1 · Origen | Lee `IA_DOCS_DIR`. Admite `.txt .md .csv .log .pdf .docx` |
| 2 · Extracción | PDF y DOCX sin dependencias, inflando con `zlib`. Detecta el PDF escaneado |
| 3 · Limpieza | Descarta índices de contenidos: envenenan BM25 |
| 4 · Troceado | 900 caracteres, 150 de solape, cortando por párrafo |
| 5 · Indexado | BM25 siempre; embeddings si hay `IA_EMBEDDING_BASE` |
| 6 · Búsqueda | `0,6 × coseno + 0,4 × BM25` |
| 7 · Recarga | Huella de carpeta (nombre+tamaño+fecha), máx. cada 10 s |

El servidor de embeddings es un `llama-server` aparte en **:8081** con
`--embedding` sobre `Qwen3-Embedding-0.6B`. `scripts/ia-local.ps1` ya lo
arranca junto al chat y al dictado.

**Lo que todavía no es RAG:** las intervenciones. `hechos_de_la_planta`
devuelve las **8 más recientes por fecha**. Si el mismo síntoma vuelve dentro
de seis meses y entretanto se anotaron 40 casos, el que importa ya no entra en
la lista. Ésa es la Fuente #3 que falta.

### El cuello de botella que hay que arreglar primero

`recargar()` re-embebe **todos** los fragmentos, de uno en uno, cada vez que la
carpeta cambia. Un manual de 200 páginas son unos 600 fragmentos, o sea 600
llamadas HTTP secuenciales — y añadir un manual nuevo vuelve a embeber los
anteriores.

Hoy eso es una molestia al arrancar. En cuanto exista un botón de «Subir
manual», es una pantalla congelada durante minutos. **La Fase 0 existe por
esto, y bloquea a la UI de carga.**

---

## 1 · El flujo de referencia, traducido a nuestras máquinas

El flujo de origen (un sistema HVAC) arranca en un código de alarma. Aquí no
existe ese código, y ésa es la única diferencia estructural real.

| En el flujo HVAC | Aquí |
|---|---|
| Máquina HVAC-03 | `sistema`: `tanque` o `vibraciones`, de `shared/eva/sistemas.js`. Instalaciones separadas: distinto motor, distinto variador, **distinto PLC** |
| Alarma E17 | **No existe.** El tanque no publica alarmas: los riesgos los calcula `riesgos.js` en el tablero. Vibraciones sí tiene banderas y contadores de AlarmWorX. El disparador es **el riesgo activo** |
| Lectura de sensores | Las 8 señales del tanque, o los canales por apoyo de vibraciones. Con su **calidad**, que aquí es parte del dato |
| Evidence (✓ ✓ ✓) | **Ya existe.** `regla.evidencia(v)` produce lo medido, con cifras, sin interpretar |
| Manual, página 214 | `indiceDocumentos.buscar()` → `{archivo, pagina, texto, score}` |
| Casos históricos | `intervenciones[]` en `datos/aprendizaje.json`, sin recuperación por parecido |
| Contactor K14 | **Falta** taxonomía de componentes. Se deriva (§3) |

### Disparadores que ya existen

- **Estación de llenado** — `derrame`, `marcha-en-seco`, `sobrepresion`,
  `obstruccion`, `bomba-sin-salida`, `posible-fuga`, `tension-fuera-con-motor`.
- **Estación de vibraciones** — reglas ISO 10816 sobre velocidad y aceleración
  eficaces por apoyo, banderas de alarma/aviso/offset y contadores de área.

**La Fuente #3 no arranca vacía por definición:** la bitácora ya acepta casos
hoy, por voz y por chat, con `registrar_intervencion`.

---

## 2 · Las cuatro decisiones de arquitectura

### 1 · El código puntúa, el modelo redacta

La puntuación es aritmética sobre las tres fuentes, reproducible a las 3 de la
mañana y a mediodía. El modelo recibe la lista **ya ordenada** y sólo la narra.

Es el criterio que ya defiende `riesgos.js`: un modelo de lenguaje no debe
decidir si algo puede reventar. Y hay evidencia local — el modelo pequeño ya se
equivoca eligiendo entre dos herramientas parecidas, con las descripciones
diciéndole explícitamente cuál era cuál (ver la cabecera de
`herramientas/aprendizaje/index.mjs`).

### 2 · Aislamiento entre máquinas, duro

Un caso del tanque **nunca** aparece en un diagnóstico de vibraciones. Se
filtra por `sistema` *antes* de puntuar, no se ordena más abajo.

Es la regla `NO_COMPARTEN` que `sistemas.js` existe para proteger, y con
recuperación por parecido el peligro crece: «vibración alta» y «presión alta»
se parecen mucho en un espacio vectorial y no tienen nada que ver.

### 3 · Respaldo en bandas, nunca un porcentaje

Un porcentaje con dos cifras significativas se lee como una medición, y no lo
es. En su lugar, una banda —ALTO / MEDIO / BAJO— y debajo **por qué**: qué
fuentes coinciden y cuáles no.

Es la misma separación evidencia/hipótesis que `riesgos.js` ya obliga a pintar
distinto.

### 4 · Puntuación

```
respaldo(causa) =
  datos    0…3   evidencias esperadas que se cumplen AHORA MISMO
+ manual   0…2   el manual la nombra para este riesgo (según score de recuperación)
+ casos    0…2   casos del MISMO sistema donde ésa fue la causa real
− casos    1     por cada caso donde se intentó y NO funcionó

  ALTO   ≥ 5  y coinciden al menos 2 fuentes
  MEDIO  3–4
  BAJO   ≤ 2, o una sola fuente
```

**El tope que impide que la memoria se vuelva dogma:** los casos previos no
pueden por sí solos llevar una causa a ALTO — hacen falta los datos o el
manual. Un caso es memoria de lo que pasó una vez, no prueba de lo que pasa
ahora. Sin ese tope, el primer caso registrado se vuelve la respuesta
permanente a ese síntoma, y si aquella vez el técnico se equivocó el error
queda cristalizado.

La resta importa tanto como la suma: un caso con `resuelto: false` es alguien
que ya probó eso y no funcionó. Ahorra repetir el intento.

---

## 3 · Las causas candidatas se derivan, no se inventan

El manual da respaldo a una causa, no produce la lista de candidatas — así que
hay que declararlas. Pero **no hace falta entrevistar a nadie: el conocimiento
ya está escrito en el repositorio**, en tres sitios, y todos derivan de los
mismos `umbrales.js`.

| Ya está en el repo | Qué aporta | Ejemplo literal |
|---|---|---|
| `accion` de cada regla · `riesgos.js` | Enumera **qué inspeccionar**. Cada cláusula es una causa candidata | «Revisar la consigna del variador *y* el estado de la válvula de alivio» → **2 causas** |
| `MECANISMOS` · `pronostico.js` | Ya trae `componente`, la física en `mecanismo`, `consecuencia` y `accion`, con `cuando()` atado a umbrales | `cavitacion-acumulada` → componente: «Sello mecánico e impulsor de la bomba» |
| `VIGILANCIAS` · `vibraciones.js` | Los defectos de rodamiento vienen **nombrados uno a uno** | BPFO → «Picado o descascarillado de la pista exterior» |

Son unas **15-18 causas candidatas** entre las dos máquinas, con su componente,
sin preguntarle nada a nadie. El trabajo es *transcribir* lo ya declarado a una
estructura consultable — no es autoría de dominio, y lo puede hacer quien no
conozca la instalación.

```js
// shared/eva/causas.js — SEMILLA, transcrita de lo ya declarado
{
  riesgoId: "bomba-sin-salida",
  causas: [
    {
      id: "valvula-impulsion-cerrada",
      titulo: "Válvula de impulsión cerrada o agarrotada",
      componente: "Válvula de impulsión",
      terminosManual: ["válvula", "impulsión", "cierre"],
      // De dónde salió, para poder auditarla y afinarla luego
      origen: "riesgos.js · accion",
      provisional: true          // hereda PROVISIONALES de umbrales.js
    },
    {
      id: "sin-recirculacion-minima",
      titulo: "Sin línea de recirculación mínima",
      componente: "Línea de recirculación",
      terminosManual: ["recirculación", "caudal mínimo", "by-pass"],
      origen: "riesgos.js · accion",
      provisional: true
    }
  ]
}
```

### La bandera que ya existe hace el resto

Las causas heredan `PROVISIONALES` de `umbrales.js`, hoy en `true`. El tablero
**ya sabe confesar** que esos límites son estimación nuestra y no rangos
confirmados, y ya pinta el aviso. Las causas derivadas entran bajo el mismo
paraguas: no hay que inventar un mecanismo de advertencia nuevo ni mantener un
segundo aviso.

Cuando alguien confirme los rangos reales se corrige la tabla, se pone la
bandera en `false`, y el aviso desaparece solo en todas partes a la vez.

### Lo que la semilla no puede dar, y por qué no importa todavía

Dos causas de la **misma** regla heredan la misma evidencia: «válvula cerrada»
y «filtro colmatado» se ven idénticas en los sensores. La Fuente 1 las puntúa
igual y **empatan**. No es un defecto de la derivación: es la verdad física, y
ninguna cantidad de autoría lo cambiaría sin un sensor más.

Lo que rompe el empate son las otras dos fuentes:

- **La primera vez** — sólo desempata el manual, por los términos de cada
  causa. Es el «no previous cases found» del flujo de referencia.
- **Conforme lleguen casos** — el caso apunta a una causa concreta y el empate
  se rompe solo, sin que nadie toque el código.

**El giro:** como cada caso registra `causaReal`, el sistema acumula por sí
solo el dato que hacía falta para afinar. Después de unos cuantos casos se
puede ver, medido, qué causa gana de verdad en cada riesgo — y *ése* es el
momento de escribir las discriminaciones a mano, con evidencia delante en vez
de suposiciones en una reunión. La autoría no desaparece: **se aplaza, se
informa, y sale del camino crítico.**

Señales para sentarse a refinar:

- Un riesgo cuyos casos apuntan **siempre a la misma causa** → subirle el peso.
- Un riesgo con `diagnosticoCorrecto:false` repetido → falta una causa que
  nadie transcribió.
- Dos causas que **nunca** se distinguen en la práctica → o se fusionan, o hace
  falta un sensor más. Y eso ya es una conversación con evidencia.

---

## 4 · El Caso

Extiende `intervenciones[]` en vez de crear un almacén nuevo —
`normalizarAlmacen` ya tolera campos añadidos.

```jsonc
{
  "id": "CASO-000001",
  "fecha": "2026-09-01T09:41:22.000Z",
  "sistema": "tanque",              // id de sistemas.js, no "HVAC-03"

  "disparador": {
    "tipo": "riesgo",               // "riesgo" | "peticion"
    "riesgoId": "bomba-sin-salida",
    "severidad": "critico"
  },

  "muestraSensores": {
    "presionRelativa": 6.2,
    "caudal": 0.0,
    "cargaMotor": 78,
    "nivelTanque": 61,
    "calidad": { "caudal": "BUENA" }   // la calidad viaja: es parte del dato
  },

  "diagnostico": {
    "propuesta": "valvula-impulsion-cerrada",
    "respaldo": "alto",              // banda, no porcentaje
    "fuentes": ["datos", "manual"],
    "manualCitado": [{ "archivo": "bomba-XY.pdf", "pagina": 214 }]
  },

  "causaReal":  { "componente": "VF-02", "tipo": "valvula-agarrotada" },
  "solucion":   { "accion": "liberacion", "texto": "Se liberó la válvula VF-02, agarrotada." },
  "resultado":  { "resuelto": true, "riesgoDesaparecio": true,
                  "observaciones": "La presión volvió a 3,1 bar." },

  "diagnosticoCorrecto": true,
  "origen": "Técnico · turno mañana",
  "vector": [ ]                      // embedding del texto de recuperación
}
```

### Qué texto se embebe

No el JSON — un JSON embebido recupera fatal. Se construye una **frase de
recuperación** con síntoma + evidencia + causa real + solución, porque eso es
lo que se parecerá a un problema futuro:

```
"Sistema de agua. La bomba gira contra una salida cerrada.
 Presión 6,2 bar sobre banda, caudal nulo, motor cargado al 78 %.
 Causa real: válvula de impulsión VF-02 agarrotada.
 Se liberó la válvula. Funcionó."
```

**`diagnosticoCorrecto: false` es el campo más valioso del esquema.** No es un
fracaso que esconder: es la única señal que permite corregir las causas
derivadas. Un sistema que sólo guarda sus aciertos no aprende nada.

---

## 5 · Fases

### Fase 0 · Arreglar el indexado antes de abrir la puerta

Bloquea la UI de carga. Sin esto, subir un manual congela la indexación.

- **Caché persistente de embeddings** en `datos/embeddings/`, con clave = hash
  del contenido del fragmento. Reindexar deja de re-embeber lo que no cambió.
- **Embeber por lotes** —el endpoint acepta `input: []`— con concurrencia
  acotada, en vez de uno a uno.
- **Indexado incremental**: un archivo nuevo procesa sólo ese archivo.
- `GET /api/rag/estado` con progreso real.

### Fase 1 · Los manuales, asociados a su máquina

- Manifiesto `datos/documentos.json`:
  `{archivo, sistema, titulo, version, estado, subidoPor, fecha}`.
- La recuperación **prioriza el manual del sistema en cuestión**. El manual del
  motor no contesta preguntas del tanque.
- `POST /api/rag/documentos` (subir) · `PUT` (reemplazar) · `PATCH` (archivar).
  **No hay DELETE** — criterio de `routes.jsx`: un botón «Eliminar» no debe
  existir en un tablero de planta.
- Seguridad: allowlist de extensión, tope de tamaño, nombre saneado contra
  *path traversal*.

> **Necesita su propia bandera.** `ICONICS_READ_ONLY` **no cubre esto**:
> protege escrituras al PLC, no al disco del backend. La subida necesita
> `RAG_UPLOAD_ENABLED`, apagada por defecto.

### Fase 2 · El índice de casos · Fuente #3

- `shared/eva/casos.js`: esquema, validación y construcción del texto de
  recuperación.
- `backend/ia/casos.mjs`: índice vectorial con el **mismo** servidor de
  embeddings y el mismo híbrido 0,6/0,4. Incremental por naturaleza — un caso
  nuevo se embebe sólo él.
- `buscarCasosSimilares({ sistema, riesgoId, texto, top })`, con filtro duro
  por sistema.

### Fase 3 · Causas candidatas y puntuación

- `shared/eva/causas.js`: la **semilla transcrita** (§3). Cada causa lleva su
  `origen` y hereda `PROVISIONALES`.
- `backend/ia/diagnostico.mjs`: junta las tres fuentes, puntúa, devuelve la
  lista ordenada con su desglose.
- `scripts/verificar-diagnostico.mjs`: mismas entradas → misma salida. Es la
  propiedad que justifica que puntúe el código.
- Una prueba de que **ninguna regla queda huérfana**: todo riesgo activo tiene
  al menos una causa candidata, o el diagnóstico lo dice en vez de callarse.

### Fase 4 · El modelo narra

- Herramienta `diagnosticar_falla({ sistema, riesgoId })` que devuelve la lista
  **ya ordenada**.
- Instrucción: narrar en el orden dado, citar la fuente de cada causa, decir
  explícitamente cuándo hay un caso previo. **Prohibido reordenar.**
- `preguntaSobreRiesgo()` ya es el puente riesgo → asistente: se extiende.

### Fase 5 · Cierre de caso

- `POST /api/casos` desde el formulario.
- `registrar_intervencion` sigue funcionando por voz y chat, y rellena el mismo
  esquema. **Las dos puertas escriben en el mismo sitio.**

---

## 6 · Las dos vistas nuevas

Los briefs completos —público, tesis, estados, anti-objetivos— están en el
documento de diseño. Resumen:

### UI A · Cierre de diagnóstico

El técnico que **acaba de intervenir**, con prisa, posiblemente en tablet. El
formulario llega **pre-rellenado**: máquina, riesgo, muestra de sensores, hora
y diagnóstico propuesto ya están; nadie los teclea.

Tesis: **dos zonas separadas por autoridad**, igual que `riesgos.js` separa
evidencia de hipótesis. Arriba, hundido y monoespaciado, lo que el sistema ya
sabe (no editable). Abajo, elevado, lo único que aporta la persona.

- Momento focal: **«Causa encontrada»**, no el «¿fue correcto?».
- **Anti-objetivo:** que «¿Diagnóstico correcto? Sí/No» domine la pantalla. El
  valor está en la causa real, no en calificar a la máquina.
- «No funcionó» es camino de primera clase (`resuelto:false`), no un error.
- Sin modal: es una página, porque un modal invita a cerrarlo.
- **Abierto:** las fotos. Guardar binarios es capacidad nueva y sería su propia
  fase.

### UI B · Documentación · sección RAG

Nueva sección de sidebar `sec-rag`, ruta `rag-documentacion`.

La pregunta que contesta no es «¿qué archivos hay?» sino **«¿qué sabe el
asistente?»**. El fallo nº1 que documenta `documentos.mjs` es que el asistente
responde «no lo he encontrado» sobre un manual que *sí está* en la carpeta —
porque era un escaneo del que no se extrajo una palabra. El índice ya devuelve
`ilegibles[]` con el motivo; hoy sólo se ve en un log que nadie mira.

- Cada documento se presenta por **lo que el índice sacó de él**. Un manual con
  0 fragmentos se ve **roto**, con el arreglo concreto, aunque el archivo esté.
- La cabecera muestra el **modo de búsqueda en curso** («embeddings + BM25» o
  «sólo BM25»), que hoy no se ve en ninguna parte y cambia toda la calidad.
- Estados: sin configurar · vacío · subiendo · **indexando** (minutos) ·
  ilegible con su arreglo · embeddings caídos (degradación, no error rojo).
- **Anti-objetivo:** parecer un explorador de archivos.
- **Abierto:** si permitir reindexar a mano — útil, pero dispara minutos de GPU
  compartida con el chat.

---

## 7 · Riesgos del propio sistema

| Riesgo | Mitigación |
|---|---|
| **Un caso equivocado se vuelve permanente** | Los casos no llegan solos a ALTO. Se corrige con un caso posterior, nunca editando el original — lo que pasó, pasó (`aprendizaje.js`). Los `diagnosticoCorrecto:false` señalan qué causa revisar |
| **Cruce entre máquinas** | Filtro duro por `sistema` antes de puntuar. Nunca «ordenar más abajo» |
| **El manual dice una cosa y el caso otra** | Se muestran las dos, separadas y con su fuente. El sistema no resuelve la contradicción: la enseña |
| **Sesgo de anclaje** | Bandas en vez de porcentaje, y las causas 2ª y 3ª siempre visibles, nunca plegadas |
| **La GPU es una sola** | Cola con prioridad al chat — `backend/ia/cola.mjs` ya existe para esto |
| **PDF escaneado** | Ya se detecta; la UI lo hace visible. OCR queda fuera de alcance |

---

## 8 · Orden de trabajo

| # | Entrega | Por qué va aquí |
|---|---|---|
| 1 | **F0** · indexado incremental | Desbloquea todo. Sin esto la UI de carga es inusable |
| 2 | **F1** · manuales por sistema | La vista necesita saber a qué máquina pertenece cada manual |
| 3 | **UI B** · Documentación | **Entrega valor sola**: ver qué sabe el asistente y qué manual está roto |
| 4 | **F2** · índice de casos | Ya tiene qué indexar: la bitácora acepta casos por voz y chat desde hoy |
| 5 | **F3** · causas y puntuación | Necesita las tres fuentes. La semilla se transcribe de lo ya declarado |
| 6 | **F4** · el modelo narra | Primer diagnóstico completo que llega a una persona |
| 7 | **F5 + UI A** · cierre de caso | Van juntas: el formulario necesita un diagnóstico que cerrar. Cierra el ciclo |

**El plan no tiene dependencias externas.** En su primera versión colgaba de
que alguien que conociera la instalación declarara las causas de cada riesgo.
Ya no: la semilla se transcribe de lo que está escrito, y hereda el aviso de
`PROVISIONALES` que el tablero ya sabe pintar. Las siete etapas se pueden
ejecutar de principio a fin sin esperar a nadie.
