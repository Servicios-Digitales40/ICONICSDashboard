# PLAN 28 — Auditoría y extensión del Motor de Diagnóstico

**Estado:** por completar
**Fecha de redacción:** 14-09-2026
**Origen:** un encargo externo pedía «diseñar un Motor de Diagnóstico Industrial
basado en evidencia». El motor ya existe desde el Plan 16, con la aritmética
calibrada del Plan 17. Este plan es lo que queda de ese encargo **una vez
restados los quince apartados que pedían rediseñar lo que ya está hecho**.

---

## 0. Qué NO se reabre

Antes de tocar nada, léase entero —cabeceras incluidas—:

- [`backend/ia/motor/diagnostico.mjs`](../../backend/ia/motor/diagnostico.mjs)
- [`backend/ia/motor/temporal.mjs`](../../backend/ia/motor/temporal.mjs)
- [`backend/ia/motor/casos.mjs`](../../backend/ia/motor/casos.mjs)

Las decisiones que esos tres archivos documentan están **medidas y fechadas**.
No se reabren en este plan:

| Decisión | Dónde está | Por qué no se toca |
|---|---|---|
| Las cuatro fuentes (`datos`, `manual`, `casos`, `temporal`) | `diagnostico.mjs:553-559` | Es la arquitectura, no una implementación provisional |
| `UMBRAL_COSENO_FUERTE/DEBIL` = 0,46 / 0,36 | `diagnostico.mjs:180-181` | Medido dos veces, sobre corpus 12× distintos. Aguantó |
| `UMBRAL_BM25_*` = 19 / 14,5 | `diagnostico.mjs:182-183` | PROVISIONAL **por naturaleza**, no por falta de medida. Se recalibra con `medir-calibracion.mjs` cuando crezca `Documentacion/`, no a ojo |
| `bandaDe(total, fuentesActivas)` → alto/medio/bajo | `diagnostico.mjs:383-387` | Bloqueado a propósito por falta de disco real. Ver F7a del Plan 17 |
| `UMBRAL_CAMBIO_RELATIVO` = 0,05 | `temporal.mjs:77` | Medido contra ICONICS real el 02-09-2026, 36 ventanas |
| Sin porcentajes de confianza | `herramientas/diagnostico/index.mjs:183` | «di la banda tal cual, no la conviertas en un porcentaje» |
| El motor **no lee sensores** | `diagnostico.mjs:4-9` | Recibe un `riesgoId` de un riesgo YA activo. Quién decide qué variables importan es `evaluarRiesgos()`, determinista |
| El motor **no selecciona variables** | idem | Si el motor «determina qué variables son relevantes según la pregunta», eso lo acaba decidiendo el LLM — la frontera del §2.3 de CLAUDE.md |
| Orden fijo de las causas | `diagnostico.mjs:650` | `sort` estable sobre `respaldo.total`. El modelo tiene prohibido reordenar |
| El conflicto se enseña, no se resuelve | `diagnostico.mjs:421-438` | Plan 17 §Decisión 5 |

**Restricciones heredadas de CLAUDE.md que aplican a todo este plan:**

- Los ejemplos son **tanque y vibraciones**. No hay AHU en esta planta.
- Nombres de campo, comentarios y mensajes de error **en español** (§4.6).
- Nada cruza módulos con distinta fuente de datos (`shared/modulos.js`, §4.7).
- Un umbral no se cambia sin `medir-calibracion.mjs` delante (§2.5).
- Commit por fase, probado antes de pasar a la siguiente (§6).

---

## 1. Lo que el encargo pedía y ya existe

Esta tabla es la parte del encargo que se cierra **verificando**, no
implementando. Si alguna fila resulta falsa al comprobarla, eso es un
hallazgo y entra en la fase que corresponda.

| Pedido | Ya resuelto en |
|---|---|
| Cuatro fuentes cruzadas | `diagnostico.mjs` — `datos`/`manual`/`casos`/`temporal` |
| Evidencia histórica sin predicción | `temporal.mjs` — pendiente por mínimos cuadrados, umbral **relativo** a la escala |
| RAG contextualizado, no genérico | `respaldoDelManual()` busca por título + `terminosManual` **de la causa**, con `sistema` propagado |
| Casos similares, no coincidencia textual | `respaldoDeCasos()` — emparejamiento exacto por id primero, proxy de texto después, dos niveles de peso |
| Hipótesis verificables | `causasDe(riesgoId)` en `shared/eva/comun/causas.js` |
| Evidencia a favor **y en contra** | `evidenciaAFavor[]` / `evidenciaEnContra[]`, con `fuente`, `texto`, `referencia`, `plantilla` |
| Separación evidencia / conclusión | El campo `fuente` de cada entrada de evidencia |
| Niveles de certeza deterministas | `bandaDe()` — sin porcentajes, sin LLM |
| «No hay información suficiente» | `huerfano: true` + `sinCausas: {deliberado, clase, motivo}` |
| Mismo núcleo para chat y vista | `diagnosticoRoutes.mjs:48` y `herramientas/diagnostico/index.mjs:58` llaman al **mismo** `diagnosticar()` |
| Anti-alucinación | Medido y corregido dos veces: el «3 casos previos» inventado (03-09-2026) y la fuga de prompt del `aviso` |
| Pruebas sin ICONICS real | `verificar-diagnostico.mjs`, `verificar-temporal.mjs`, `verificar-casos.mjs`, `verificar-calibracion.mjs` |
| Trazabilidad de la cita | `manualCitado[]` con `archivo`, `pagina`, `texto`, `hash` del contenido |

---

## 2. Los huecos reales

Seis, ordenados por valor. Cada uno es una fase.

### H1 — Un diagnóstico no se puede reproducir ni auditar

`diagnosticar()` es determinista **en su aritmética**, no en sus **entradas**.
El mismo `{sistema, riesgoId}` da otro resultado mañana si alguien sube un
manual o cierra un caso. Y `diagnosticEventId` (`diagnostico.mjs:489`)
identifica el momento **pero no archiva nada**: no hay forma de responder
«¿por qué el sistema concluyó esto el martes?».

### H2 — La calidad del dato no entra en el motor

`shared/quality.js` distingue cuatro motivos de ausencia (`mala`, `incierta`,
`sin_entrega`, `desconocida`) y está medido contra el servidor real. **El motor
no lo consulta.** Un sensor congelado o un punto que dejó de entregar alimenta
el término `datos` exactamente igual que uno sano. Es la grieta más directa
contra el §2.4 de CLAUDE.md dentro del propio motor.

### H3 — El fallo parcial se degrada en silencio

Las tres funciones de respaldo capturan su excepción, escriben un
`logger.warn` y **devuelven 0 puntos** (`diagnostico.mjs:241-247`, `330-336`,
`353-358`). El resultado no distingue «el manual no respalda esta causa» de
«el índice de manuales se cayó». Roza el §2.5: *un servidor sin una pieza
montada se niega y explica qué falta; no degrada en silencio*.

### H4 — No hay clasificación de intención

El catálogo completo —26 herramientas— se entrega al modelo en cada petición
(`chat.mjs:1376`). No hay nada que distinga «¿qué es una bomba?» de
«diagnostica el tanque». `IA_MAX_PASOS` limita las rondas, no el alcance.

### H5 — El modelo de intervención se queda corto

`crearIntervencion()` (`shared/eva/comun/aprendizaje.js:204`) no tiene
`componente`, `variablesAfectadas` ni `evidencia`. Y `causaReal.tipo` mezcla
dos cosas: un id del catálogo cuando el técnico eligió una candidata, y texto
libre cuando escribió la suya — el propio código lo documenta y lo tolera.
Eso obliga a `respaldoDeCasos()` a adivinar.

### H6 — No hay observabilidad

No existe ninguna métrica propia en `backend/`. No se sabe cuántos
diagnósticos salen huérfanos, cuánto tarda el motor, ni con qué frecuencia una
fuente cae.

### H7 (menor) — Un camino escrito que nadie recorre

`valoresSensores` existe, está probado y produce la frase de `datos`
(`diagnostico.mjs:460-464`), pero **no lo trae nadie**: la única entrada de
producción es `GET /api/diagnostico`, cuyo Zod admite sólo `{sistema,
riesgoId}`. El propio archivo lo dice para que no se dé por ejercitado. Se
resuelve como efecto de la F1.

---

## 3. Fases

### F1 — Snapshot de evidencia

**Objetivo.** Que un diagnóstico se pueda reproducir con las entradas que tuvo,
aunque el manual o la bitácora hayan cambiado después.

**Por qué primero.** Es la base de F2 (no se audita lo que no se capturó) y de
F3 (el estado del snapshot es lo que dice qué fuente falló).

**Archivos nuevos**
- `backend/ia/motor/snapshot.mjs`

**Archivos que se modifican**
- `backend/ia/motor/diagnostico.mjs` — `diagnosticar()` devuelve además `snapshot`
- `backend/routes/diagnosticoRoutes.mjs` — admite `valoresSensores` opcional (cierra H7)

**Forma del snapshot** (en español, §4.6; los nombres los fija la F1 al
implementar, esto es la intención):

```js
{
  diagnosticEventId,        // el que ya genera diagnostico.mjs:489
  momento,                  // ISO
  sistema, riesgoId,
  valoresSensores,          // lo que llegó, o null si nadie lo trajo
  calidades,                // por señal: motivoDeCalidad() — insumo de F2/F3
  fragmentosManual,         // los mismos {archivo, pagina, texto, hash} que ya viajan
  casosConsultados,         // ids + fecha, no el texto entero
  seriesTemporales,         // por firma: {senal, ventanaH, nPuntos, pendiente}
  fuentesCaidas,            // [] o los nombres de las que fallaron — ver F3
}
```

**Lo que NO hace.** No cambia una sola cifra del cálculo. `diagnosticar()`
devuelve exactamente las mismas `causas` con y sin snapshot; el snapshot es
**observación de lo que ya ocurría**, no una entrada nueva.

**Pruebas**
- `scripts/verificar-diagnostico.mjs` — extender: dos llamadas con los mismos
  dobles producen el mismo snapshot salvo `diagnosticEventId` y `momento`
- Un caso que confirme que las causas son **byte a byte idénticas** con y sin
  snapshot

**Criterios de aceptación**
- [ ] El snapshot recoge las cuatro fuentes y las calidades
- [ ] `causas` no cambia por existir el snapshot
- [ ] `hash` de cada fragmento citado viaja dentro
- [ ] `GET /api/diagnostico` acepta `valoresSensores` y la frase de `datos` aparece

**Depende de:** nada.

---

### F2 — Persistencia y auditoría

**Objetivo.** Responder «¿por qué el sistema concluyó esto el martes?».

**Archivos nuevos**
- `backend/lib/diarioDiagnosticos.mjs`
- `scripts/verificar-diario-diagnosticos.mjs`

**Archivos que se modifican**
- `backend/routes/diagnosticoRoutes.mjs` — escribe tras resolver
- `backend/ia/herramientas/diagnostico/index.mjs` — idem

**Decisión de diseño: se reutiliza `backend/lib/diario.mjs`, no se inventa nada.**
Ese archivo ya resolvió el problema entero y su cabecera explica por qué JSONL
y no JSON (un array hay que reescribirlo entero; una línea se añade con
`appendFile`), por qué la poda se anota en vez de callarse, y usa
`escribirAtomico`/`conCandado` del Plan 20 F3. **No hay base de datos** (§2.2).

**Qué se escribe.** Una línea por diagnóstico: el snapshot de F1, las causas
resultantes con su banda, el origen (`chat` o `vista`), el usuario si lo hay,
la duración y las fuentes caídas.

**Qué NO se escribe.** El texto completo de los manuales — basta `archivo`,
`pagina` y `hash`, que es lo que permite verificar la cita. Guardar el corpus
por diagnóstico llenaría el disco de la planta sin añadir nada auditable.

**Pruebas**
- Una línea por diagnóstico, legible hasta la penúltima si la última quedó a medias
- La poda anota cuántas entradas se fueron y hasta cuándo llegaban
- Un diagnóstico archivado se puede releer y reconstruir

**Criterios de aceptación**
- [ ] Todo diagnóstico —de chat y de vista— deja línea
- [ ] La línea basta para reconstruir la conclusión sin volver a ICONICS
- [ ] La poda no adelgaza en silencio
- [ ] `datos/` sigue en `.gitignore`

**Depende de:** F1.

---

### F3 — Estados y degradación explícita

**Objetivo.** Que «el manual no respalda» y «el índice se cayó» dejen de ser el
mismo 0.

**Archivos que se modifican**
- `backend/ia/motor/diagnostico.mjs` — las tres funciones de respaldo devuelven además `estado`
- `backend/ia/herramientas/diagnostico/index.mjs` — `comoRedactar` y el aviso al técnico
- `backend/routes/diagnosticoRoutes.mjs`
- `react-dashboard/src/Demo-EVA/views/comunes/CierreDiagnostico.jsx`

**Estados por fuente.** Tres, no más: `consultada` (respondió), `sin_respaldo`
(respondió y no respalda), `caida` (falló o no está montada). El
`logger.warn` se queda — duplicar no estorba — pero **deja de ser el único
sitio donde consta**.

**Estado del diagnóstico completo.** Se deriva, no se declara a mano:

- `completo` — las cuatro fuentes consultadas
- `parcial` — alguna caída, pero al menos `datos` y otra en pie
- `insuficiente` — sólo queda `datos`, o el riesgo es huérfano

**Por qué no la máquina de estados del encargo.** `CREATED →
COLLECTING_EVIDENCE → ANALYZING → COMPLETED` describe un proceso **asíncrono
de larga duración**. `diagnosticar()` es una función que tarda lo que tardan
tres `Promise.all` y devuelve. Modelar estados que ningún consumidor puede
observar es ceremonia. Lo que sí hace falta —y es lo que esta fase da— es que
el **resultado** diga qué fuentes llegaron.

**La regla que esta fase hace cumplir.** Un diagnóstico `insuficiente` **no
propone una causa como si nada**: lo dice, igual que ya hace el caso huérfano.
Ese camino ya está escrito y probado (`sinCausas`), aquí se reutiliza su
criterio.

**Pruebas**
- `scripts/verificar-diagnostico.mjs` — un doble que lanza por cada fuente;
  comprobar que el estado lo refleja y la banda no miente
- Un caso `insuficiente` donde se verifique que no se narra una causa

**Criterios de aceptación**
- [ ] Cada fuente declara su estado
- [ ] El estado global se deriva, no se escribe a mano
- [ ] Un fallo de índice ya no es indistinguible de «no respalda»
- [ ] `insuficiente` se dice al técnico, sin tuteo al modelo (la lección del `aviso`)

**Depende de:** F1 (el snapshot lleva `fuentesCaidas`).

---

### F4 — Calidad del dato dentro del motor

**Objetivo.** Que un sensor congelado deje de respaldar una causa.

**Archivos que se modifican**
- `backend/ia/motor/diagnostico.mjs` — `datosDe()` y la frase de evidencia
- `shared/eva/comun/causas.js` — sólo si hace falta declarar qué señales exige una causa

**Decisión: la calidad es un VETO, no un quinto término.**

Un quinto sumando obligaría a recalibrar `bandaDe()`, que está **bloqueado a
propósito** por falta de disco real (Plan 17 F7a). Un veto no toca la
aritmética: si la evidencia de un riesgo se apoya en una señal cuya calidad no
es buena, ese aporte **no cuenta** y el snapshot dice por qué, con el `codigo`
de `motivoDeCalidad()`.

Es además lo correcto por dominio: un sensor inválido no es evidencia débil de
una falla, es **ausencia de evidencia**. Contarlo como medio punto sería
disfrazar el hueco de dato, que es justo lo que §2.4 prohíbe.

**Frontera.** El motor **no vuelve a leer sensores** (§0). La calidad llega en
`valoresSensores`, que quien llama ya trae de la frontera donde se filtra —el
motor de sondeo en el frontend, la capa de herramientas en el backend—,
exactamente como describe `shared/quality.js`.

**Pruebas**
- `scripts/verificar-diagnostico.mjs` — un doble por cada `MOTIVO`
- Comprobar que un `sin_entrega` produce hueco y no cero

**Criterios de aceptación**
- [ ] Una señal de mala calidad no aporta a `datos`
- [ ] El motivo viaja en el snapshot con su código
- [ ] `bandaDe()` sin tocar
- [ ] Sin `valoresSensores`, el comportamiento es el de hoy

**Depende de:** F1.

---

### F5 — Clasificación de intención

**Objetivo.** Que el modelo no reciba 26 herramientas para contestar «¿qué es
una bomba?».

**Archivos nuevos**
- `backend/ia/conversacion/intencion.mjs`
- `scripts/verificar-intencion.mjs`

**Archivos que se modifican**
- `backend/ia/conversacion/chat.mjs` — filtra el catálogo antes de `instrucciones()`

**Decisión: el clasificador es DETERMINISTA, no una llamada al modelo.**

Es el §2.3 otra vez. Un clasificador LLM añade una ronda de 30-90 s (el coste
que `IA_MAX_PASOS` ya intenta acotar), puede equivocarse en silencio y no es
reproducible. Un clasificador por reglas sobre el texto —verbos de
diagnóstico, nombres de señal del catálogo, referencias temporales— es
auditable y se prueba en Node sin arrancar nada.

**Intenciones y su subconjunto de herramientas:**

| Intención | Herramientas |
|---|---|
| documental | `consultar_documentacion`, `limites_del_manual` |
| dato actual | `estado_del_sistema`, `riesgos_activos`, `sistemas_de_la_planta` |
| histórica | la familia de `historicos/` |
| diagnóstico | `diagnosticar_falla`, `diagnostico`, + actual + histórica |
| intervenciones | `hechos_de_la_planta`, `cerrar_diagnostico`, `registrar_intervencion` |
| general | el mínimo: `sistemas_de_la_planta` |

**El fallo abierto es hacia arriba.** Ante duda, se entrega el catálogo
completo — el comportamiento de hoy. Un clasificador que se equivoca cerrando
deja al modelo sin la herramienta que necesitaba y produce una respuesta
peor; uno que se equivoca abriendo sólo pierde la optimización. Se elige el
error barato.

**Pruebas**
- Banco de frases por intención, en **los dos idiomas** (§4.6, y hay
  `verificar-i18n.mjs` que vigila el par)
- Verificar que ninguna intención deja fuera una herramienta que su propio
  `comoRedactar` menciona — el defecto que ya midió el caso huérfano del tanque

**Criterios de aceptación**
- [ ] Sin llamada al modelo para clasificar
- [ ] Las seis intenciones se distinguen sobre el banco
- [ ] Ante duda, catálogo completo
- [ ] `verificar-instrucciones.mjs` sigue en verde

**Depende de:** nada. Se puede hacer en paralelo a F1-F4.

---

### F6 — Modelo de intervención

**Objetivo.** Que `respaldoDeCasos()` deje de adivinar.

**Archivos que se modifican**
- `shared/eva/comun/aprendizaje.js` — `crearIntervencion()`
- `backend/ia/motor/casos.mjs` — `textoDeRecuperacion`
- `backend/ia/herramientas/aprendizaje/index.mjs` — `cerrar_diagnostico`
- `react-dashboard/src/Demo-EVA/views/comunes/CierreDiagnostico.jsx`

**Campos nuevos, todos opcionales.** La regla del Plan 16 F5 se mantiene: *las
dos puertas escriben en el mismo sitio*. Por voz nadie dicta una lista de
variables afectadas, así que un campo obligatorio rompería la puerta rápida.

- `componente` — qué pieza
- `variablesAfectadas[]` — claves de señal del catálogo
- `evidencia[]` — qué se observó, con la misma forma que la del motor

**Y una separación que hoy falta:** `causaReal.tipo` mezcla id de catálogo con
texto libre. Se separa en `causaReal.id` (del catálogo, o `null`) y
`causaReal.texto` (lo que escribió la persona). **El campo viejo se mantiene**
mientras haya intervenciones guardadas que lo usen — se lee de los dos sitios
y se escribe en los nuevos. Es una migración por lectura tolerante, no un
borrado: *lo que pasó, pasó*.

**Pruebas**
- `scripts/verificar-casos.mjs` — una intervención vieja sigue indexándose igual
- `scripts/verificar-casos-cierre.mjs` — el cierre rellena los campos nuevos
- Una intervención sin ningún campo nuevo no degrada

**Criterios de aceptación**
- [ ] Los campos nuevos son opcionales
- [ ] Una intervención de antes de este plan se lee sin migrar nada
- [ ] `causaReal.id` y `causaReal.texto` separados, con el viejo tolerado
- [ ] La puerta de voz sigue funcionando con los campos de siempre

**Depende de:** nada estructural. Conviene después de F1 para que el snapshot
recoja ya la forma nueva.

---

### F7 — Observabilidad

**Objetivo.** Saber cómo se comporta el motor en planta.

**Archivos nuevos**
- `backend/ia/motor/metricas.mjs`
- Una ruta de lectura en `backend/routes/systemRoutes.mjs`

**Métricas.** Contadores y percentiles en memoria, agregados sobre el diario de
F2. **No se monta Prometheus ni nada externo** — sería el mismo salto que §2.2
prohíbe para la persistencia.

- `diagnosticos.total`, por sistema y por estado (completo/parcial/insuficiente)
- `diagnosticos.huerfanos` — hoy 15 de 18 en vibraciones; conviene verlo caer
- `diagnosticos.duracion` — p50/p95
- `fuente.caida` — por fuente
- `fuente.duracion` — por fuente, para saber cuál es el cuello
- `conflicto.total` — con qué frecuencia dos causas se respaldan por fuentes distintas
- `calidad.vetos` — por código de `MOTIVO` (lo que hace visible F4)

**Criterios de aceptación**
- [ ] Sin dependencia externa nueva
- [ ] Las métricas salen del diario, no de un segundo camino de escritura
- [ ] La ruta lleva `autenticar` por el ámbito (§2.11) y no acciona nada

**Depende de:** F2, F3, F4.

---

## 4. Orden y dependencias

```
F1 snapshot ──┬── F2 persistencia ──┐
              ├── F3 estados ───────┼── F7 observabilidad
              └── F4 calidad ───────┘

F5 intención   (independiente, en paralelo)
F6 intervención (independiente; mejor tras F1)
```

Commit por fase (§6). F1 y F5 pueden empezar a la vez.

---

## 5. Pruebas a correr

Regla de oro (§5): todo cambio en `backend/ia/` corre como mínimo
`verificar-herramientas.mjs` más el verificador de lo que se tocó.

Por fase:

| Fase | Mínimo |
|---|---|
| F1 | `verificar-diagnostico.mjs`, `verificar-herramientas.mjs`, `verificar-backend.mjs` |
| F2 | los de F1 + `verificar-diario-diagnosticos.mjs` (nuevo) |
| F3 | los de F1 + `verificar-temporal.mjs`, `verificar-documentos.mjs`, `verificar-casos.mjs` |
| F4 | los de F1 + `verificar-catalogo.mjs` |
| F5 | `verificar-intencion.mjs` (nuevo), `verificar-chat.mjs`, `verificar-instrucciones.mjs`, `verificar-i18n.mjs` |
| F6 | `verificar-casos.mjs`, `verificar-casos-cierre.mjs`, `verificar-herramientas.mjs` |
| F7 | `verificar-backend.mjs` |

En la raíz, antes de cada commit: `npm run lint`, `npm run types`,
`npm run verificar`. Si F3 o F6 tocan la vista de cierre, además
`npm test` y `npm run build` en `react-dashboard/`.

---

## 6. Riesgos

| Riesgo | Mitigación |
|---|---|
| F1 o F4 alteran una cifra del cálculo sin querer | La prueba de F1 exige `causas` **idénticas** con y sin snapshot. F4 es un veto, no un sumando |
| Presión de «ya que estamos» para recalibrar `bandaDe()` | §0 lo prohíbe. Sigue bloqueado por falta de `Documentacion/` y `aprendizaje.json` reales |
| El diario crece sin control en planta | Poda heredada de `diario.mjs`, que anota lo que se llevó |
| F5 cierra el catálogo de más y empeora respuestas | Fallo abierto hacia arriba: ante duda, catálogo completo |
| F6 rompe intervenciones ya guardadas | Campos opcionales, lectura tolerante, campo viejo mantenido |
| Un agente futuro lee el encargo original y rediseña el motor | Este documento, §0 y §1 |

---

## 7. Fuera de alcance

Lo que el encargo original pedía y **no entra**, con el motivo:

- **Selección dinámica de variables por el motor.** §2.3 — el motor no lee
  sensores ni decide qué mirar. Lo decide `evaluarRiesgos()`.
- **Diagnóstico automático disparado por evento**, con cooldown y cierre de
  caso. Es un plan propio: necesita política de duplicados y de ciclo de vida
  que nada de aquí resuelve.
- **Clasificación de confianza en porcentajes.** Prohibido explícitamente en
  `comoRedactar`. Las bandas son alto/medio/bajo.
- **Machine learning.** §32 del propio encargo lo descarta, y aquí además
  chocaría con §2.3.
- **Máquina de estados asíncrona completa.** Ver F3: se modela el resultado,
  no un proceso que ningún consumidor observa.
- **Base de datos o vector DB.** §2.2.
- **Recalibración de `UMBRAL_BM25_*` y de `bandaDe()`.** Necesita disco real.
  Cuando lo haya: `medir-calibracion.mjs` primero, número después.
