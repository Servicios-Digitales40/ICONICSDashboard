> **Documento histórico.** Describe el alcance y las decisiones de su fecha, incluidas rutas y archivos posteriormente retirados. Para instalación, capacidades y estructura actuales consulta [el índice documental](README.md).

# PLAN-19 — Modularización: Monitoreo y Diagnóstico / Predicción

## 0. Por qué

Hoy el repo tiene **un** producto con dos máquinas. La demo va a tener **dos
módulos**, y el segundo no se parece al primero en lo único que de verdad
importa: **de dónde vienen sus datos**.

- **Monitoreo y Diagnóstico** — dos máquinas de planta que instrumentamos
  nosotros, leídas por ICONICS FrameWorX, en producción.
- **Predicción** — un compresor que NO instrumentamos, consumido por la API
  de Leonardo Carrasco (Django), hoy una sola pantalla en beta.

El síntoma de que la frontera no existe está en el código:

1. `PrediccionBeta.jsx` vive en `Demo-EVA/views/comunes/`, la carpeta que
   [`CLAUDE.md`](../CLAUDE.md) §3 define como «todo lo que sabe de las dos
   máquinas de planta». Un compresor de otra API no es ninguna de las dos.
2. En el sidebar cuelga de `sec-general`, junto a Assets y Alarmas: archivado
   como si fuera una vista transversal de la planta.
3. `lib/api/predictionApi.js` llama a Django **directamente desde el
   navegador** (`window.location.hostname:8000`). Monitoreo no hace eso: todo
   pasa por el puente `:3001`.

Ninguna de las tres es un error de quien lo escribió — eran lo correcto cuando
Predicción era una prueba. Dejan de serlo en cuanto es un módulo.

## 0.1 El no-negociable que este plan toca

`CLAUDE.md` §2.1 dice: **«ICONICS FrameWorX es la única fuente de datos y la
única fuente de verdad.»** Predicción introduce una segunda fuente. La regla no
se salta por conveniencia (§2), así que se **acota explícitamente**, y el
cambio de redacción es parte de la F1:

> ICONICS FrameWorX es la única fuente de datos **de sensores de planta**. Un
> módulo que consume otra fuente la declara en el registro de módulos y **nunca
> mezcla su dato con el de planta** en el mismo registro, el mismo lote de
> lectura ni la misma herramienta del asistente.

Es la misma regla que ya separa tanque de vibraciones (`NO_COMPARTEN` en
`shared/eva/comun/sistemas.js`), subida un nivel: allí impide cruzar dos
máquinas con distinto PLC; aquí impide cruzar dos módulos con distinta fuente.

## 0.2 La decisión que ordena todo lo demás

**El compresor NO entra en `SISTEMAS` (`shared/eva/comun/sistemas.js`).**

Ese registro no es una lista de máquinas: es ejecutable. Declara `raices`,
`puntos()`, `parse()`, `modelo()`, `esHistorizada()` y `cadenciaMs` — todo ello
sobre el supuesto de que hay tags de ICONICS detrás. Meter ahí una máquina que
se lee por REST desde Django obligaría a que cada una de esas funciones tuviera
una rama «esta no es de ICONICS», que es exactamente el `if` repetido en cinco
archivos que ese registro existe para evitar.

Predicción tendrá **su propio registro**, con su propia forma.

## 1. Alcance y orden

Siete fases, cada una probada y commiteada por separado (CLAUDE.md §6). Orden
por dependencia: primero la frontera conceptual, luego el movimiento de
archivos, luego lo que hace falta construir.

| Fase | Qué hace | Bloqueada por |
|---|---|---|
| F1 | La frontera: CLAUDE.md §2.1 acotado, sección propia en el sidebar | — |
| F2 | Sacar Predicción de `Demo-EVA/` a `src/modulos/prediccion/` | F1 |
| F3 | Registro de módulos (`shared/modulos.js`) | F1 |
| F4 | El puente: `backend/prediccion/` para que el navegador deje de llamar a Django | **Contrato de la API** |
| F5 | Familia de herramientas `backend/ia/herramientas/prediccion/` | F3, F4 |
| F6 | Aislamiento entre módulos: guarda y verificador | F3, F5 |
| F7 | Incertidumbre en pantalla, con el vocabulario que ya existe | F4 |

**F1, F2 y F3 no necesitan nada de Leonardo** y se pueden hacer ya. De F4 en
adelante todo depende de información que hoy no tenemos (§9).

---

## 2. F1 — La frontera conceptual

Sin mover un archivo. Es el commit más barato y el que más se nota en la demo.

1. **`CLAUDE.md` §2.1**: aplicar la redacción acotada de §0.1 de este plan, con
   una línea que remita aquí para el porqué.
2. **`CLAUDE.md` §3**: el árbol de estructura gana un nivel `modulos/` y una
   frase que diga qué es un módulo y en qué se distingue de un sistema.
3. **`routes.jsx`**: nueva sección `sec-prediccion` en `SECCIONES`, y
   `PrediccionBeta` se mueve de `sec-general` a ella. Un icono propio.

**Criterio de aceptación**: en el sidebar, Predicción deja de estar entre
Assets y Alarmas y pasa a ser una sección hermana de las dos estaciones.

**Pruebas**: `npm test` en `react-dashboard/` (hay pruebas sobre la tabla de
rutas), `npm run build`.

---

## 3. F2 — Sacar Predicción de Demo-EVA

```
react-dashboard/src/
├── Demo-EVA/                       ← se queda donde está, es Monitoreo
└── modulos/
    └── prediccion/
        ├── README.md                     qué es, de dónde viene su dato, qué no hace
        ├── data/predictionApi.js          (desde lib/api/)
        ├── components/
        │   └── PantallaPendiente.jsx       el placeholder honesto
        └── views/
            ├── InicioCompresor.jsx          dato real: salud del backend y limitaciones
            ├── EventosCompresor.jsx         dato real (era PrediccionBeta.jsx)
            ├── VariablesCompresor.jsx       pendiente
            ├── HistoricoCompresor.jsx       pendiente
            ├── CorrelacionCompresor.jsx     pendiente
            └── PronosticoCompresor.jsx      pendiente
```

Los nombres llevan el sufijo `Compresor` por CLAUDE.md §4.4 —el archivo se
distingue por MÁQUINA— y porque `PrediccionBeta` nombraba la fase del proyecto,
no lo que la pantalla enseña. Los ids de ruta pasan de `eva-prediccion` a
`pred-*`: el prefijo `eva-` es de Demo-EVA, que es justo de lo que se separa.

**Las cuatro pantallas pendientes no dibujan datos de ejemplo.** Dicen qué
enseñarán y qué falta exactamente para construirlas. Un placeholder con curvas
plausibles en un tablero de planta no se lee como un boceto, se lee como una
medida — es §2.5 del CLAUDE.md, y aplica también a lo que todavía no existe.

**Por qué `Demo-EVA/` no se renombra a `modulos/monitoreo/`**: PLAN-18 acaba de
mover esa carpeta entera y todo el repo apunta ahí. Renombrarla otra vez es
churn sin valor: la separación que este plan busca se consigue **sacando lo que
no pertenece**, no reubicando lo que sí. Si más adelante hay un tercer módulo,
se reconsidera — y entonces con motivo.

`predictionApi.js` sale de `lib/api/` a propósito: `lib/` es infraestructura
compartida, y este cliente sólo lo usa un módulo. Los otros tres (`apiBase`,
`casosApi`, `ragApi`) se quedan.

**Ojo al mover** (CLAUDE.md §6): comprobar si algo más importa
`predictionApi.js`. Hoy lo menciona `lib/queryClient.js` en un comentario —
comentario que hay que actualizar en el mismo commit (§4.1).

**Pruebas**: `npm test`, `npm run build`, `node scripts/verificar-bundle.mjs`
(el techo de `vendor` va hoy a 203 KB sobre 210: margen de 7 KB, así que
cualquier movimiento de chunks se comprueba).

---

## 4. F3 — El registro de módulos

`shared/modulos.js`, hermano de `sistemas.js` y con la misma filosofía: que dar
de alta un módulo sea añadir una entrada, no tocar cinco archivos.

Forma propuesta de cada entrada:

```
id            'monitoreo' | 'prediccion'
nombre        cómo se llama para una persona
fuente        'iconics' | 'api-externa'  ← lo que impide el cruce
origen        descripción legible del origen del dato
sistemas      ids de sistemas que contiene (Monitoreo: tanque, vibraciones)
herramientas  familias del asistente que aplican
limitaciones  lo que hay que confesar al contestar sobre este módulo
```

`limitaciones` no es documentación: es lo que el asistente **dice en voz alta**,
igual que en `sistemas.js`. Para Predicción arranca con lo que ya sabemos:
horizonte no validado, máquina que no instrumentamos, sin dato en vivo.

**Y arregla un defecto ya medido**: el campo `herramientas` de `sistemas.js` es
hoy **metadato informativo que no restringe nada** (sólo se usa en
`sistemas.js:865`, para describirle el sistema al modelo). Vibraciones declara
tres herramientas cuando le aplican ocho, y el 03-09-2026 el modelo contestó a
una pregunta sobre los tres apoyos **enumerando las señales del tanque**. El
registro de módulos es el sitio donde ese campo pasa a significar algo.

**Pruebas**: verificador nuevo `scripts/verificar-modulos.mjs` — que cada
sistema pertenezca a exactamente un módulo, que no haya ids repetidos, que
todo módulo declare `fuente`.

---

## 5. F4 — El puente de Predicción ⛔ bloqueada

Hoy el navegador llama a Django directamente. Eso rompe la propiedad que hace
defendible la arquitectura de Monitoreo: **el navegador sólo habla con `:3001`**,
y ni credenciales ni servicios internos quedan expuestos al cliente.

Propuesta: `backend/prediccion/cliente.mjs` + `backend/routes/prediccionRoutes.mjs`,
mismo patrón que `backend/iconics/`. El frontend pasa a llamar a `/api/prediccion/*`.

**Decisión que hay que tomar antes de escribir código** — no la tomo yo:

| Opción | A favor | En contra |
|---|---|---|
| **A. Proxy por el puente** | Una sola superficie, sin CORS, la API-key no viaja al navegador, se puede cachear y registrar | El puente pasa a depender de un servicio que no controlamos; hay que decidir qué hace si Django no responde |
| **B. Llamada directa** (hoy) | Cero trabajo | CORS, clave en el bundle, dos superficies que explicar en la presentación |

**Recomiendo A**, por coherencia con lo que ya defendemos de Monitoreo. Pero
depende de si Django es alcanzable desde el servidor del puente y no sólo desde
el navegador del técnico — ver §9.

---

## 6. F5 — Herramientas del asistente ⛔ bloqueada

`backend/ia/herramientas/prediccion/`, una carpeta por familia (CLAUDE.md §3).
Es **el paso que convierte una pantalla en un módulo**: hoy las 22 herramientas
hablan con ICONICS y ninguna con la API de Leonardo, así que el asistente no
puede contestar «¿cómo se comportará esta variable en X días?».

Herramientas previstas, a confirmar contra el contrato real:

- `variables_del_compresor` — qué se puede consultar, con unidades y limitaciones
- `historia_del_compresor` — serie de una variable en un periodo
- `prediccion_de_variable` — el pronóstico, **con su incertidumbre**
- `eventos_del_compresor` — el historial de eventos que hoy ya sirve la API

Dos reglas heredadas, no negociables:

1. **El código puntúa, el modelo redacta** (§2.3). Si aparece algo parecido a un
   diagnóstico, lo calcula código determinista.
2. **La ausencia de dato no se disfraza** (§2.4). Y ojo con la lección del
   03-09-2026: el modelo convirtió un **500 del historiador** en «esta señal no
   registra datos históricos» —un fallo transitorio narrado como hecho
   estructural—. Toda herramienta de esta familia necesita, desde el primer día,
   la guarda explícita de no inventar la causa de un resultado vacío.

---

## 7. F6 — Aislamiento entre módulos

Lo que `NO_COMPARTEN` hace entre tanque y vibraciones, un nivel más arriba.

- Una herramienta de un módulo no acepta un id del otro.
- `correlacionar_senales` se niega a cruzar señales de módulos distintos, y lo
  explica: no comparten instalación, ni fuente, ni reloj.
- Verificador `scripts/verificar-aislamiento-modulos.mjs` que lo pruebe con
  ambos sentidos del cruce.

Esto no es teórico: el 03-09-2026, preguntado por los tres apoyos de
vibraciones, el asistente contestó ofreciendo *«las ocho señales del sistema de
agua»*. La defensa actual lo bloqueó, pero por el motivo secundario (no había
consultado datos), no por el cruce. Con dos módulos y dos fuentes, el fallo
equivalente sería mucho peor.

---

## 8. F7 — La incertidumbre en pantalla ⛔ bloqueada

Una predicción sin su margen es una afirmación falsa. El proyecto **ya tiene
vocabulario** para esto y no hace falta inventar otro:

- `provisional: true` — cuando el umbral es estimación nuestra
- huecos con `motivo` y `cobertura` — cuando falta el dato
- `evidenciaAFavor` / `evidenciaEnContra` — cuando hay tensión

La regla que hereda de Monitoreo: **no poner plazo a una avería** sin base. El
sistema de vibraciones ya se niega a hacerlo (`desgaste: false`), y sería
incoherente que el módulo vecino lo hiciera con menos respaldo.

---

## 9. Información que hace falta

Lo que sigue **bloquea F4 en adelante**. F1, F2 y F3 no esperan a nada.

### 9.1 Contrato de la API — lo más urgente

Hoy el cliente sólo conoce **dos endpoints**: `/api/v1/health/` y
`/api/v1/event-history/` (con `eventId` de 1 a 4 y `hoursBefore` hasta 168).
Todo lo demás que se le quiere pedir al módulo **no existe todavía**.

1. Lista de **variables** consultables: id, nombre legible, unidad, rango válido.
2. Endpoint de **serie histórica**: parámetros, formato de la muestra, ventana
   máxima, paginación, qué devuelve un tramo sin dato.
3. Endpoint de **predicción**: qué horizontes admite, y sobre todo **qué
   devuelve como incertidumbre** — ¿intervalo de confianza, desviación,
   probabilidad de evento? Sin esto, F7 no se puede diseñar.
4. **Correlación**: ¿la calcula la API, o le pedimos las series y la calculamos
   nosotros con lo que ya existe en `historicos/`?
5. **Autenticación**: `VITE_PREDICTION_API_KEY` existe en el cliente. ¿Se exige?
   ¿Qué esquema (header, bearer)? ¿Caduca?
6. **Forma del error**: qué código y qué cuerpo devuelve un fallo, para
   distinguir «no hay dato» de «el servicio falló» — precisamente la distinción
   que se perdió el 03-09.
7. Semántica de `health`: qué significa cada estado.

### 9.2 Qué es el compresor, exactamente

**La pregunta que más cambia lo que se puede prometer en la presentación.**
¿Es una máquina real de esta planta, o el conjunto de datos público MetroPT-3
(unidad de producción de aire de un tren de metro)? El nombre del backend
—«MetroPT-3 V4.4»— apunta a lo segundo.

Si es un dataset público, es un **caso de estudio** legítimo pero hay que
decirlo así: no se puede enseñar junto a las dos máquinas de planta como si
fuera una tercera instalación nuestra.

### 9.3 El modelo predictivo

1. Qué algoritmo, y sobre qué se entrenó.
2. **Error validado** — la cifra concreta. Sin ella no hay forma honesta de
   redactar una predicción.
3. Qué significan los **eventos 1 a 4** que la vista ya consulta.
4. ¿El dato es estático (dataset cerrado) o entra dato nuevo?

### 9.4 Despliegue

1. **En qué máquina corre Django.** El código tiene dos respuestas distintas:
   `defaultBase()` usa `window.location.hostname:8000` (o sea, asume que Django
   está en el mismo host que el dashboard), pero el respaldo sin navegador es
   `10.10.21.11:8000`. Las dos no pueden ser ciertas.
2. ¿Es una **cuarta computadora**, o comparte con alguna de las tres actuales?
3. ¿Es alcanzable **desde el servidor del puente**, o sólo desde la red del
   navegador? De esto depende que la opción A de F4 sea viable.

### 9.5 Producto y responsabilidad

1. ¿Predicción vive en **la misma aplicación** —mismo sidebar, mismo asistente—
   o es una app aparte que se enseña por separado?
2. ¿El asistente debe poder hablar de **los dos módulos en una conversación**?
   Si sí, F6 no es opcional.
3. ¿Podemos **pedir cambios de endpoints** a Leonardo, o hay que adaptarse a lo
   que hay? Cambia por completo el diseño de F4 y F5.

---

## 10. Lo que este plan NO hace

- **No renombra `Demo-EVA/`.** Ver el razonamiento en F2.
- **No mete el compresor en `SISTEMAS`.** Ver §0.2.
- **No construye el modelo predictivo.** Se consume el de Leonardo.
- **No activa la autenticación.** Sigue siendo su propio plan (G11 en
  [`PLAN-17`](PLAN-17-CERRAR-AUDITORIA.md)).
- **No arregla los tres defectos medidos el 03-09-2026** (narración de un 500
  como ausencia de historial; metadato `herramientas` obsoleto; `analisis_de_senal`
  aceptando `DKW` sin apoyo). Son de Monitoreo y van por su cuenta — aunque F3
  toca el segundo de refilón.
