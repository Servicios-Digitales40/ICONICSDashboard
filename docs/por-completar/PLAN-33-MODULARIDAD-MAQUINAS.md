# PLAN 33 — Modularidad de Máquinas

**Estado:** Fase 0 (auditoría), F1 y F2 completadas · F3 en adelante por completar
**Fecha:** 18-09-2026
**Rama de trabajo actual:** `Vibraciones1.0`

> Este documento nació como **análisis y plan**. La auditoría no modificó
> código; **F1 sí** (18-09-2026, ver §22). Cada
> afirmación sobre el estado actual cita el archivo y la línea donde se
> comprueba. Donde el repositorio no permite afirmar algo, se dice
> `NO IMPLEMENTADO`, `PARCIAL` o `INVESTIGAR` en vez de suponerlo.

---

## 1. Executive Summary

### Lo que hay hoy

El sistema **ya tiene un registro de máquinas y ya descubre dinámicamente**.
Esto es lo más importante del análisis y contradice la premisa de partida de
que «el sistema fue desarrollado para estas máquinas»:

- `shared/eva/comun/sistemas.js` (990 líneas) es un **registro ejecutable**,
  no una lista de nombres. Cada entrada declara `raices`, `puntos()`,
  `parse()`, `modelo()`, `estado()`, `resumen()`, `claves()`, `aliasDe()`,
  `etiquetaDe()`, `esHistorizada()`, `series{}`, `cadenciaMs`, `rutas`,
  `herramientas`, `limitaciones`.
- El asistente **ya descubre** las máquinas: `sistemas_de_la_planta`
  ([registro/index.mjs](backend/ia/herramientas/registro/index.mjs)) recorre el
  registro. No hay lista hardcodeada de máquinas en el prompt.
- Las herramientas **ya son genéricas por máquina**: `estado_del_sistema`,
  `riesgos_activos`, `historia_de_senal` reciben `sistema` como parámetro
  obligatorio. No existe `getVibrationMachineData()` ni equivalente.
- El RAG **ya aísla por máquina**
  ([documentos.mjs:620](backend/ia/indices/documentos.mjs#L620)) y los casos
  previos también, con `sistema` **obligatorio y sin valor por defecto**
  ([casos.mjs:285](backend/ia/motor/casos.mjs#L285)).
- El registro tiene **validación en tiempo de carga** que lanza si una entrada
  está incompleta ([sistemas.js:925](shared/eva/comun/sistemas.js#L925)).

El proyecto ya recorrió una parte sustancial del camino que este documento
pide. Lo hizo en los planes 19 (modularización), 27 (catálogo) y en la
introducción de `estadoMaquina.js` como forma común.

### Lo que falta de verdad

El acoplamiento que queda **no está en `if machineType === ...` repartidos**
—hay 20 ocurrencias y casi todas son de presentación— sino en un sitio más
profundo y más caro:

> **Una máquina se da de alta escribiendo código, no configurando.**
> El catálogo del tanque son 1 414 líneas escritas a mano
> ([tanque/senales.js](shared/eva/tanque/senales.js)); el de vibraciones,
> 1 154 ([vibraciones/vibraciones.js](shared/eva/vibraciones/vibraciones.js)).
> Dar de alta una máquina hoy exige escribir su catálogo, su física, su
> simulador y sus reglas: **~3 300 líneas**, y añadir su `import` al registro.

Ese es el gap real. La arquitectura es modular; el **alta** no lo es.

### Lo que cambiará

La transformación no es «hacer modular un sistema rígido» sino **mover el
origen de las entradas del registro**: de módulos ES escritos a mano, a
configuración persistida y validada contra ICONICS, sin perder ninguna de las
garantías que el registro actual impone (`NO_COMPARTEN`, ausencia≠cero,
validación al cargar, el código puntúa/el modelo redacta).

**El riesgo central de esta fase**, y hay que decirlo al principio: el registro
actual es rígido *a propósito*. Sus cabeceras documentan **dos incidentes
reales** que esa rigidez previene (una máquina nueva sirviendo `value: null` con
calidad BUENA; el asistente ofreciendo «las ocho señales del sistema de agua» al
preguntar por vibraciones, 03-09-2026). Una configuración por UI que permita
declarar menos de lo que hoy exige el código **reintroduce esos fallos**. El
plan de migración está construido alrededor de esa restricción.

---

## 2. Current Architecture

```
ICONICS FrameWorX (REST, OIDC, certificado autofirmado)
        │
        ▼
backend/iconics/client.mjs (1 026 líneas) ── fakeClient.mjs (ICONICS_FAKE)
        │  readPoint(s) · readHistory · browse · search · writePoint(s)
        │  readAlarmHistory · acknowledgeAlarms · readUserInfo · ping
        ▼
backend/routes/*.mjs (12 archivos, 40 endpoints)
        │
        ├── iconicsRoutes   datos, historia, browse, escritura, alarmas
        ├── chatRoutes      el asistente
        ├── diagnosticoRoutes · casosRoutes · ragRoutes · cuadernoRoutes
        └── systemRoutes    salud
        │
        ▼
shared/  (dominio puro, 12 338 líneas, sin React ni fetch — CLAUDE.md §2.7)
        ├── eva/comun/sistemas.js   EL REGISTRO
        ├── eva/tanque/             catálogo, física, reglas, simulador
        ├── eva/vibraciones/        lo mismo
        └── modulos.js              agrupación por FUENTE de datos
        │
        ▼
react-dashboard/src/  (Vite + React)
        ├── Demo-EVA/data/{comunes,tanque,vibraciones}/
        ├── Demo-EVA/views/{comunes,tanque,vibraciones}/
        └── app/routes/routes.jsx   registro de rutas con `nav`
```

**Persistencia**: `IMPLEMENTADO` — sin base de datos, a propósito
(CLAUDE.md §2.2). JSON en `backend/datos/` (documentos, embeddings) y
`datos/` (aprendizaje, cuaderno, tres diarios `.jsonl`). Escritura atómica con
candado en [lib/jsonAtomico.mjs](backend/lib/jsonAtomico.mjs).

**Autenticación**: `IMPLEMENTADO Y APAGADA`. JWT, censo, roles, caducidad, todo
probado con el interruptor encendido. `AUTH_HABILITADA=false` porque el tablero
no sabe pedir token todavía (CLAUDE.md §2.11). La guarda `autenticar` se aplica
**por ámbito** en `app.mjs`, no ruta por ruta; `exigirRol` sí va ruta a ruta.

---

## 3. Current ICONICS Integration

### Cómo se obtiene el árbol — `IMPLEMENTADO`

`GET /api/iconics/browse?path=` →
[client.mjs:702 `browse(path)`](backend/iconics/client.mjs#L702) →
`{apiBase}/Data/Browse`.

**Forma real de la respuesta**, según
[sondear-arbol.mjs:75-84](scripts/sondear-arbol.mjs#L75-L84):

```js
{ pointName: "ac:TDCON/DEMO/SENSORES/" }   // rama: termina en "/"
{ pointName: "ac:TDCON/DEMO/SENSORES/Nivel" }  // hoja
// a veces `browsePointName` en vez de `pointName`
```

> **Hallazgo crítico para todo el §6 de la petición.** El árbol devuelve
> **sólo nombres de punto**. No hay `dataType`, no hay `writable`, no hay
> `historized`, no hay unidad, no hay descripción. Lo confirma la sonda, que
> imprime `JSON.stringify(nodo)` entero para nodos sin `pointName` y sólo
> maneja esos dos campos.
>
> `INVESTIGAR` antes de diseñar el paso 5 de la configuración: si
> `/Data/Browse` admite un parámetro de atributos extendidos. **Nada en este
> repositorio lo demuestra**, y la sonda que existe no los ve.

`GET /api/iconics/points?query=` →`/Data/Search`, también sólo nombres.

### Cómo se obtienen las variables (valores) — `IMPLEMENTADO`

- `GET /api/iconics/data?pointName=`
- `GET /api/iconics/data/batch?points=a,b,c` — lista por comas, contrato que
  ya usa el frontend ([iconicsRoutes.mjs:124](backend/routes/iconicsRoutes.mjs#L124)).

Respuesta por punto: `{ pointName, value, quality }`. La **calidad OPC** se
filtra en la frontera con `isGoodQuality`
([shared/quality.js](shared/quality.js)); un valor de mala calidad se convierte
en `null`, nunca en 0 (CLAUDE.md §2.4).

### Cómo se obtienen los históricos — `IMPLEMENTADO`

- `GET /api/iconics/history` — un tramo de una señal
- `POST /api/iconics/history/batch` — **la ventana entera, varias señales**,
  con troceado en el servidor. Es POST porque los nombres llevan barras
  invertidas y espacios (`hda:\Configuration\DEMO 3:`) que romperían una lista
  por comas ([iconicsRoutes.mjs:157-184](backend/routes/iconicsRoutes.mjs#L157-L184)).

**El hecho más importante para la configuración de variables historizadas:**

> `hda:` es el ARCHIVO, `ac:` es el VALOR EN VIVO. Son **nombres distintos
> para el mismo dato**, y no derivan uno del otro por regla fija.

Y las dos máquinas los nombran **de forma diferente**:

| | tanque | vibraciones |
|---|---|---|
| ruta | `hda:` | `\Configuration\DEMO 3:` (grupo) |
| `punto` | `puntoHistorico()` con tabla rama→carpeta | `puntoHistorico()` con grupo delante |
| agregado | `Average` | `Average` |

Por eso `series.punto` es **obligatorio en el registro** y lanza si falta
([sistemas.js:943](shared/eva/comun/sistemas.js#L943)). Esta asimetría es la
prueba de que la historización **no puede deducirse del árbol** en el estado
actual del servidor.

### Cómo se sabe qué está historizado — `PARCIAL, y es una lista blanca manual`

`series.historizadas()` devuelve una **lista blanca escrita a mano**. No es
`() => true` y el motivo está medido: a dos de las 52 señales del tanque el
historiador les devuelve **la serie de la temperatura del tanque**, con marcas
de tiempo correctas y **sin dar error**
([sistemas.js:210-213](shared/eva/comun/sistemas.js#L210-L213)). En
vibraciones pasa lo mismo con `aPeak_S1`, que devuelve la serie de `aRMS_S1`.

> Consecuencia de diseño, y es dura: **preguntarle al servidor si una variable
> está historizada no basta.** Contesta que sí y devuelve la serie de otra.
> La única forma conocida hoy de saberlo es **sondear punto por punto y
> comparar**, que es lo que se hizo el 28-08-2026 para vibraciones.

### Alarmas — `IMPLEMENTADO, con límite conocido`

- `GET /api/iconics/alarms?pointName=&hours=` → `/AlarmHistory`
- `PUT /api/iconics/alarms/acknowledge` → escritura, entra en el diario

De vibraciones **sólo se leen contadores de área** (`ae:`), no qué alarma se
disparó ([sistemas.js:494](shared/eva/comun/sistemas.js#L494)). Es una
limitación declarada del servidor, no del código.

### Escritura — `IMPLEMENTADA, con tres guardas`

`POST /api/iconics/write` y `/write/batch`
([iconicsRoutes.mjs:307-333](backend/routes/iconicsRoutes.mjs#L307-L333)):

1. **`ICONICS_READ_ONLY`** — rechaza con 403 y `ERROR_READ_ONLY` antes de
   tocar nada ([iconicsRoutes.mjs:88-99](backend/routes/iconicsRoutes.mjs#L88-L99)).
2. **Esquema Zod** sobre el cuerpo.
3. **Confirmación por relectura** — `mismoValor()` compara por valor y no por
   forma, porque ICONICS devuelve `true` como `"True"`, `1` o `true` según el
   tipo del tag ([client.mjs:735-760](backend/iconics/client.mjs#L735-L760)).

Y **el diario**: reconocer una alarma o accionar la bomba quedan anotados en
`datos/diario-accionamientos.jsonl`, con la regla de que **el fallo del diario
no tumba la petición pero tampoco se traga en silencio**.

> **El asistente NO puede escribir variables arbitrarias.** Tiene exactamente
> una herramienta de escritura, `controlar_bomba`
> ([definiciones.mjs:889](backend/ia/conversacion/definiciones.mjs#L889)), con
> su ruta propia y su diario. No existe una herramienta genérica
> `escribir_variable`. **Esto no debe cambiar en esta fase** (§20).

---

## 4. Current Machine Model

### Cómo representa el sistema una máquina hoy

Una máquina es **una entrada del array `SISTEMAS`**, y esa entrada es código:

```js
{
  id, nombre, maquina, plc,          // identidad
  raices: [...],                      // prefijos ICONICS (PLURAL)
  puntos: () => [...],                // todos sus puntos
  parse: (nombre) => ({tipo,clave,canal}) | null,
  modelo: (nombre, ms) => valor,      // simulación
  estado: (valorDe, sistema, ts) => Estado,
  resumen, claves, aliasDe, etiquetaDe,
  esHistorizada, series: { historizadas, ruta, agregado, punto, nota },
  desgaste, cadenciaMs, mide, vocabulario, rutas, herramientas,
  historia, limitaciones: [...],
  cerrado?                            // rama Vibraciones1.0
}
```

### El contrato de tres estados que no puede perderse

`modelo(nombre, ms)` devuelve:

| valor | significado |
|---|---|
| `undefined` | el punto **no es de este sistema** |
| `null` | es suyo y **ahora no entrega valor** |
| otra cosa | el valor |

> «Las dos primeras no son lo mismo y no pueden colapsarse»
> ([sistemas.js:68](shared/eva/comun/sistemas.js#L68)). Colapsarlas produce
> el fallo que este proyecto ya cometió **dos veces**: una máquina nueva
> respondiendo `value: null` con calidad BUENA. «La pantalla no ve un fallo;
> ve una máquina que contesta y no dice nada.»

### Identidad pegada al dato

`parsePuntoDeSistema(punto)` devuelve `{ sistema, tipo, clave, canal }`. La
procedencia **viaja como campo del dato**, no se deduce después mirando el
nombre ([sistemas.js:602-612](shared/eva/comun/sistemas.js#L602-L612)). Es la
defensa estructural contra cruzar máquinas.

Y se prueban **las dos cosas**: que la raíz encaje no basta, el catálogo tiene
que reconocer el punto — «un tag borrado en el servidor sigue empezando por la
raíz correcta, y tiene que verse como dato ausente y nunca como otra señal».

### Acoplamientos reales

`REFACTOR` — dos `switch` por id de máquina en el backend:

| Archivo | Línea | Qué |
|---|---|---|
| [lib/maquina.mjs](backend/ia/herramientas/lib/maquina.mjs#L179) | 179 | `evaluarRiesgosDe` — **documentado como deuda consciente** |
| [motor/diagnostico.mjs](backend/ia/motor/diagnostico.mjs#L55) | 55 | `REGLAS_POR_SISTEMA` — mapa literal |
| [historicos/index.mjs](backend/ia/herramientas/historicos/index.mjs#L153) | 153 | `if (id === 'tanque')` — índice de sinónimos |
| [historicos/index.mjs](backend/ia/herramientas/historicos/index.mjs#L281) | 281 | `if (sistemaId === 'tanque')` |
| [http/esquemas.mjs](backend/http/esquemas.mjs#L198) | 198 | `z.enum(['tanque','vibraciones'])` **literal, no derivado** |

El `switch` de `evaluarRiesgosDe` lleva su propia justificación escrita, y es
honesta: las dos funciones **no reciben lo mismo** —`evaluarRiesgos` espera el
`Sistema` del tanque, `evaluarRiesgosVibracion` espera
`{canales, variador, alarmas}`. Unificarlas «es trabajo real y no está hecho,
así que se dice en vez de fingirlo».

**El `z.enum` literal de `esquemas.mjs:198` sí es un defecto**: el mismo
archivo importa `SISTEMA_IDS` y lo usa en las líneas 414 y 605. Una máquina
nueva pasaría las otras dos validaciones y fallaría en ésta.

---

## 5. Gap Analysis

| Capacidad | CURRENT | TARGET | Gap real |
|---|---|---|---|
| Registro de máquinas | `IMPLEMENTADO` — array en módulo ES | persistido y configurable | **origen de los datos** |
| Descubrimiento por el asistente | `IMPLEMENTADO` — `sistemas_de_la_planta` | igual | ninguno |
| Tools genéricas por máquina | `PARCIAL` — 3 de 26 aceptan `sistema` | todas | ~10 tools |
| Aislamiento RAG | `IMPLEMENTADO` | igual | ninguno |
| Aislamiento casos | `IMPLEMENTADO`, obligatorio | igual | ninguno |
| Motor recibe máquina | `PARCIAL` — mapa literal de reglas | dinámico | forma común de reglas |
| Assets desde ICONICS | `IMPLEMENTADO` — browse | igual | ninguno |
| **Alta por configuración** | `PARCIAL` — persistencia y API (F2) | UI + registro | falta F3 (registro) y F5 (UI) |
| **Capacidad read/write por variable** | `IMPLEMENTADO` (F2) | declarada, deny-by-default | falta la UI (F5) |
| **Detección de deriva vs ICONICS** | **`NO IMPLEMENTADO`** | VALID/DEGRADED/INVALID | mecanismo entero |
| Planta > Configuración | `NO IMPLEMENTADO` | vista nueva | vista + API |
| Rutas `/machines/:id/...` | `NO IMPLEMENTADO` — rutas fijas | dinámicas | router |
| MachineType | `NO IMPLEMENTADO` | ¿separado? | ver §6 |

### Lo que el gap NO es

Conviene decirlo porque cambia el tamaño de la fase: **no hace falta
desacoplar el asistente, ni el RAG, ni los casos previos, ni el aislamiento
entre máquinas.** Eso ya está hecho y probado. La fase es más pequeña de lo que
el documento de partida supone, y más profunda en un punto concreto: el alta.

---

## 6. Proposed Domain Model

### ¿Machine y MachineType separados? — **Sí, pero no como dos entidades persistidas**

Analizado como pide §23, y la respuesta que sale del repositorio es matizada.

**A favor de separar**: hoy hay cosas que claramente son *del tipo* y no de la
instancia — las reglas de riesgo (`riesgosVibracion.js`, 934 líneas), la física
(`vidaRodamiento.js`), las causas (`causas.js`, 966 líneas). Dos motores de
vibración distintos compartirían las 18 reglas enteras.

**En contra de persistir el tipo como dato**: un `MachineType` guardado en JSON
sería una lista de nombres de reglas, y las reglas **son código** — funciones
deterministas que el LLM nunca toca (CLAUDE.md §2.3). Un tipo persistido que
apunte a código por nombre es un registro de plugins con extra pasos, y añade
un modo de fallo nuevo: tipo guardado que apunta a un módulo que ya no existe.

**Propuesta**: el tipo es **código registrado**, la instancia es **configuración
persistida**.

```
MachineType   ─ módulo ES, registrado en un índice   (CÓDIGO)
                declara: reglas, forma de estado, física, categorías
                de variable, capacidades que sabe servir

Machine       ─ JSON validado contra ICONICS         (CONFIGURACIÓN)
                declara: id, nombre, tipo, assets, variables,
                mapeo variable→rol del tipo, capacidades, permisos
```

Esto conserva la propiedad que el proyecto defiende desde el Plan 19: añadir
un **tipo** nuevo es escribir código —y debe serlo, porque son reglas de
diagnóstico—; añadir una **máquina** de un tipo existente es configuración.

Y responde a la pregunta 15 del §44 de forma concreta: **una tercera máquina
de vibraciones** (otro motor) es configuración pura. Una **prensa** es un tipo
nuevo: código.

### Capacidades

Se derivan, **no se declaran a mano**, salvo escritura:

```js
CURRENT_DATA        ⟸ tiene ≥1 variable con lectura viva
HISTORICAL_DATA     ⟸ tiene ≥1 variable con serie VERIFICADA
ALARMS              ⟸ tiene ≥1 asset en un área de alarmas
DIAGNOSTICS         ⟸ su tipo trae reglas Y el mapeo cubre su `necesita`
RAG                 ⟸ hay ≥1 manual con este `sistema` en el manifiesto
PREVIOUS_CASES      ⟸ siempre (puede estar vacío — no es lo mismo)
VIEW_3D             ⟸ su tipo declara maqueta
WRITABLE_VARIABLES  ⟸ DECLARADO A MANO, deny-by-default, nunca derivado
```

Derivar es lo correcto para siete de las ocho: una capacidad declarada a mano
que no se cumple es exactamente el fallo de «una máquina que contesta y no dice
nada». Para escritura es al revés — derivarla sería asumir que se puede
escribir, que es justo lo que §6 de la petición prohíbe.

### Variable

```js
{
  id,                    // estable, nuestro
  pointName,             // ac:... identificador ICONICS en vivo
  historyPointName,      // hda:... o null — NO se deriva (§3)
  historyVerified,       // false por defecto: hasta sondear, no se promete
  assetId,               // a qué asset pertenece
  rol,                   // rol del TIPO: "medida:vRMS", "variador:velocidad"… o null
                         // NUNCA la clave suelta — ver el hallazgo de F1 (§22):
                         // `aviso` existe en dos familias con ámbitos distintos
  alias: [],             // cómo lo llama la gente — alimenta aliasDe()
  unidad, descripcion,   // locales: ICONICS no los da (§3)
  acceso: "read",        // "read" | "write" | "readwrite" — deny by default
  estado                 // VALID | DEGRADED | INVALID | UNKNOWN
}
```

`historyVerified` merece su justificación: **no puede ser un booleano
optimista**. §3 documenta que el servidor contesta afirmativamente y devuelve
la serie equivocada. Arranca en `false` y sólo pasa a `true` tras un sondeo que
compare. Una variable con `historyVerified: false` **existe** y se lee en vivo;
lo que no hace es aparecer en `series.historizadas()`.

---

## 7. Machine Configuration Model

### Dónde se persiste

`datos/maquinas.json`, con `lib/jsonAtomico.mjs` (escritura atómica + candado,
ya existente). Coherente con CLAUDE.md §2.2: sin base de datos.

```json
{
  "version": 1,
  "maquinas": [{
    "id": "vibraciones-motor-01",
    "nombre": "Motor conveyor #4",
    "tipo": "vibraciones",
    "plc": "PLC_2 · ua:DEMO3",
    "assets": [{ "id": "a1", "pointName": "ac:TDCON/Motors/01/", "rol": "raiz" }],
    "variables": [ /* ver §6 */ ],
    "cadenciaMs": 5000,
    "limitaciones": ["..."],
    "capacidades": { "WRITABLE_VARIABLES": false },
    "creada": "2026-09-18T...", "revisada": "2026-09-18T..."
  }]
}
```

### Cómo llega al registro

Aquí está la decisión de diseño que hace que todo lo demás siga funcionando:

> **La configuración no sustituye al registro: lo alimenta.**
> `SISTEMAS` sigue siendo el array que todo el proyecto importa, con las mismas
> funciones. Lo que cambia es que sus entradas se **construyen** a partir de la
> configuración más el tipo, en vez de escribirse a mano.

```
datos/maquinas.json  +  MachineType (código)
        │
        ▼  construirSistema(config, tipo)
   entrada de SISTEMAS con raices/puntos/parse/modelo/estado/series/...
        │
        ▼  validarRegistro()  ← el mismo que ya existe y LANZA
   SISTEMAS
```

Ventaja decisiva: **ni una sola de las ~100 importaciones de `SISTEMAS` cambia**,
y la validación que hoy lanza al cargar sigue lanzando. Las máquinas escritas a
mano y las configuradas conviven porque producen la misma forma — que es
exactamente lo que permite migrar sin big bang (§40 de la petición).

### El problema de `shared/` y por qué no se rompe

`shared/` es dominio puro: **sin `fetch`, sin E/S** (CLAUDE.md §2.7). Leer un
JSON de disco no puede vivir ahí.

Reparto, siguiendo el patrón que ya usan `manuales.js` (forma, en `shared/`) y
`indices/manuales.mjs` (disco, en `backend/`):

- `shared/eva/comun/configuracionMaquina.js` — **forma y validación pura**
- `backend/ia/indices/maquinas.mjs` — **lee y escribe** el JSON
- `shared/eva/comun/sistemas.js` — expone `registrarSistema(entrada)` para que
  el backend inyecte lo construido

El frontend recibe la configuración **por HTTP**, no leyendo disco.

---

## 8. Configuration UX — Planta > Configuración

Flujo en seis pasos. Cada uno dice qué puede fallar, porque la UX de esta vista
**es sobre todo prevención de configuraciones plausibles pero falsas**.

**Paso 1 · Asset raíz.** Árbol real vía `GET /api/iconics/browse`, cargado
perezosamente rama a rama. Reutiliza `AssetsEva.jsx`, que ya lo pinta.
*Falla si*: la raíz elegida solapa la de otra máquina → **se rechaza**. Dos
máquinas que comparten raíz rompen `sistemaDePunto()`, que devuelve **la
primera que encaja**.

**Paso 2 · Tipo.** Lista de tipos registrados. *Falla si*: ninguno encaja →
es código, no configuración. La vista debe decirlo así, sin ofrecer un tipo
«genérico» que produciría una máquina sin reglas.

**Paso 3 · Assets.** Selección múltiple bajo la raíz. Mínimo 1.

**Paso 4 · Variables.** Hojas de los assets elegidos. Mínimo 1.
**Con lectura de prueba en vivo**: se piden por `data/batch` y se enseña valor
y calidad. *Esto no es un adorno*: un punto que existe en el árbol y devuelve
mala calidad se configura igual de fácil que uno bueno, y la diferencia sólo
se ve leyéndolo.

**Paso 5 · Clasificación.** Por variable: rol (del catálogo del tipo), alias,
unidad, acceso. **El acceso arranca en `read` siempre.** Marcar escritura pide
confirmación aparte y queda en el diario.

**Paso 5b · Historización — el paso que el documento de partida no prevé.**
No se puede preguntar al servidor (§3). La vista ofrece **sondear**: pide la
serie de cada candidata y **compara entre sí**; dos variables cuya serie es
idéntica se marcan como sospechosas y quedan en `historyVerified: false`. Es
exactamente lo que se hizo a mano el 28-08-2026, automatizado.

**Paso 6 · Validación y registro.** Reglas duras:

- todo `pointName` existe en ICONICS (verificado, no supuesto)
- ≥1 asset, ≥1 variable
- ninguna raíz solapa con otra máquina
- `plc` declarado — **es lo que hace funcionar `NO_COMPARTEN`**
- el mapeo de roles cubre el `necesita` de las reglas del tipo, o se avisa de
  qué reglas quedarán sin evaluar (y **eso se declara en `limitaciones`**, no
  se calla)

---

## 9. Proposed Backend Architecture

Piezas nuevas, todas siguiendo la separación forma/E-S que el proyecto ya usa:

| Archivo | Responsabilidad |
|---|---|
| `shared/eva/comun/configuracionMaquina.js` | forma, validación pura, estados VALID/DEGRADED/… |
| `shared/eva/tipos/index.js` | índice de tipos; `tipoDe(id)` |
| `shared/eva/tipos/vibraciones.js` | el tipo: reglas, roles, forma de estado |
| `shared/eva/tipos/estacionLlenado.js` | ídem |
| `backend/ia/indices/maquinas.mjs` | leer/escribir `datos/maquinas.json` |
| `backend/lib/verificarConfiguracion.mjs` | contrastar config ↔ ICONICS |
| `backend/routes/maquinasRoutes.mjs` | CRUD + validación |

**Los dos tipos se construyen extrayendo el código existente**, no
escribiéndolo de nuevo: `vibraciones.js` sale de `riesgosVibracion.js` +
`estadoVibraciones.js`; `estacionLlenado.js` de `riesgos.js` +
`estadoTanque.js`. Es refactor, no reescritura — CLAUDE.md §2.3 prohíbe tocar
la lógica del motor sin motivo, y no lo hay.

> **Restricción de rama**: el tipo `estacionLlenado` toca código del tanque.
> La regla 1 de `Vibraciones1.0` lo prohíbe (CLAUDE.md §1). **Esa fase no
> empieza hasta que la rama se reabra**, y el plan lo refleja en §22.

---

## 10. Proposed Frontend Architecture

### Rutas

Hoy son fijas: `eva-inicio`, `vib-inicio`, `eva-riesgos`,
`eva-riesgos-vibracion`… con `nav` declarado por ruta
([routes.jsx](react-dashboard/src/app/routes/routes.jsx)).

Propuesta **conservadora**, y el conservadurismo es deliberado:

```
/machines/:machineId            Inicio
/machines/:machineId/charts     Gráficas
/machines/:machineId/history    Históricos
/machines/:machineId/3d         Vista 3D
/machines/:machineId/alarms     Alarmas
/machines/:machineId/findings   Hallazgos
/machines/:machineId/notices    Avisos
/machines/:machineId/cases      Casos previos
/machines/:machineId/rag        RAG documental
```

Las rutas viejas **se conservan como redirecciones** durante toda la
migración. El registro de rutas ya soporta entradas sin `nav` —es el mecanismo
con el que se cerró la estación de llenado— así que una redirección es una
entrada más.

Las secciones del menú se generan **desde el registro de máquinas**, igual que
hoy se generan desde `buildNav`.

### MachineContext — sí, y por una razón medida

`useSistemaAgua()` ya es un contexto por máquina
([data/comunes/hooks.js:36](react-dashboard/src/Demo-EVA/data/comunes/hooks.js#L36)),
y `EvaProvider` envuelve el Shell entero para que **un solo motor de sondeo**
sirva a todas las vistas.

`MachineContext` generaliza eso: un provider por máquina activa, con
ref-counting, exponiendo `{machine, type, assets, variables, capabilities, estado}`.

> **La trampa que hay que evitar, y ya mordió dos veces**: el sondeo arranca
> por **conteo de referencias** en `subscribeSistema`, **no al montar una
> vista**. Un componente de *chrome* —sidebar, badge— que llame al contexto
> **lee esa máquina en todas las pantallas**. Pasó con el contador de alarmas
> del Topbar (31-08-2026) y con el badge de hallazgos (17-09-2026).
>
> Regla para esta fase: **ningún componente siempre montado suscribe una
> máquina concreta.** La prueba que lo fija tiene que mirar **las
> suscripciones**, no el menú — como hace `llenado-cerrado.test.jsx`.

### Vista 3D — `PARCIAL`

`three-d/components/ActivoEnMaqueta.jsx:41` despacha por `tipo` con un
`switch`, y su cabecera ya dice que es un despacho deliberado. Hay maquetas por
máquina: `MaquetaTanque3D.jsx`, `Vibraciones3D.jsx`.

**Recomendación: `KEEP`.** El modelo 3D es geometría, y la geometría es del
tipo. Que un tipo declare su maqueta es suficiente; mapear variables a
elementos 3D por configuración es una fase posterior, y §15 de la petición ya
avisa contra abrir ese frente ahora.

### Gráficas — `KEEP`, como pide §15

`GraficaHistoria` y `SelectorRango` ya son genéricos. Se les pasa la máquina y
sus variables historizadas. **No se diseña un sistema universal de gráficas en
esta fase**; se documenta la limitación.

---

## 11. Assistant Integration

`sistemas_de_la_planta` ya hace lo que §9 de la petición pide. Cambios:

1. **`resumenDeSistemas()` añade** `estado` de la configuración y
   `capacidades`. Una máquina `DEGRADED` **tiene que decirlo al asistente**:
   es exactamente para lo que existe `limitaciones`, cuyo campo ya está
   documentado como «lo que hay que confesar al contestar».
2. **`getMachine(machineId)`** — `INVESTIGAR si hace falta`. Hoy
   `estado_del_sistema` ya devuelve la máquina entera. Una herramienta más es
   una elección más que el modelo puede equivocar, y el 4B ya demostró que
   encadena mal. **Recomendación: no añadirla** hasta que un caso concreto la
   pida.
3. La guarda `resolverSistema()` se mantiene **tal cual**. Es el cuello por el
   que pasan todas las herramientas de máquina y donde ya vive el cierre por
   mantenimiento. Ahí entra también la negativa de una máquina `INVALID`.

---

## 12. Tool Calling Architecture

Las 26 herramientas actuales, clasificadas:

| Herramienta | ¿Acepta `sistema`? | Acción |
|---|---|---|
| `sistemas_de_la_planta` | n/a | `KEEP` |
| `estado_del_sistema` | **sí, obligatorio** | `KEEP` |
| `riesgos_activos` | **sí, obligatorio** | `KEEP` |
| `historia_de_senal` | sí, opcional | `KEEP` |
| `pronostico_de_desgaste` | sí, defecto `tanque` | `REFACTOR` — quitar el defecto |
| `diagnosticar_falla` | sí | `KEEP` |
| `diagnostico` | sí | `KEEP` |
| `valor_en_momento`, `comparar_periodos`, `analisis_de_senal`, `perfil_de_senal`, `correlacionar_senales`, `tendencia_multiple`, `buscar_evento`, `alarma_sostenida`, `grafico_de_senal`, `generar_reporte` | **no** | `REFACTOR` — **B3 del backlog, ya conocido** |
| `consultar_documentacion`, `limites_del_manual` | sí | `KEEP` |
| `resumen_de_turno` | multi | `REFACTOR` |
| `controlar_bomba` | no — es del tanque | `KEEP`, **sin generalizar** (§20) |
| `hechos_de_la_planta`, `registrar_intervencion`, `cerrar_diagnostico`, `recordar_hecho`, `proponer_regla` | sí | `KEEP` |

**Diez herramientas resuelven nombres contra el catálogo del tanque** y no
aceptan `sistema`. Ya está documentado como **B3 en
`docs/BACKLOG-BACKEND.md`**, con su causa: no hay un índice de sinónimos por
máquina. Es el mismo trabajo que el Plan 32 F6.

> **No se añaden herramientas nuevas.** Con 26, cada una es una elección que un
> modelo pequeño puede fallar — medido en este proyecto. La modularidad se
> consigue **generalizando las que hay**.

---

## 13. RAG Integration — `IMPLEMENTADO`, cambio mínimo

Los manuales ya se asocian a un `sistema` por el manifiesto
`.manifiesto.json`, y `buscar(pregunta, {sistema})` filtra
([documentos.mjs:620](backend/ia/indices/documentos.mjs#L620)).

Detalle de diseño ya resuelto y que conviene **no romper**: `sistema` es
**opcional** en documentos (un manual sin sistema es «de toda la planta») y
**obligatorio** en casos. La asimetría es correcta: una norma ISO aplica a
cualquier motor de vibración; un caso cerrado pertenece a una máquina.

**Estrategia recomendada para la asociación**: `Machine` **y** `MachineType`,
con precedencia. Un manual del tipo (ISO 20816-3) sirve a todas las máquinas de
vibración; uno de la instancia (el manual del variador concreto) sólo a ella.
Es una línea más en el manifiesto y evita re-subir la misma norma por máquina.

`shared/eva/comun/manuales.js·sistemaValido` valida contra `SISTEMAS`, así que
sigue funcionando sin tocarlo.

---

## 14. Diagnostic Engine Integration

El motor ya recibe `sistema` y `riesgoId`. Lo único acoplado es
`REGLAS_POR_SISTEMA` ([diagnostico.mjs:55](backend/ia/motor/diagnostico.mjs#L55)),
un mapa literal → pasa a `tipoDe(maquina.tipo).reglas`.

**Lo que NO se toca**, y es el límite duro de esta fase:

- la aritmética de puntuación (datos 0-3, manual 0-2, casos 0-2/−1)
- los `UMBRAL_*`, que salen de `scripts/medir-calibracion.mjs` contra corpus
  real
- que el modelo narre un resultado **ya calculado**

CLAUDE.md §2.3. El motor recibe otro contexto; **no razona distinto**.

El `switch` de `evaluarRiesgosDe` desaparece cuando las reglas del tipo
consuman la **forma común** (`estadoMaquina.js`) en vez de las dos formas de
dominio distintas. Eso es trabajo real y está declarado como tal desde antes de
este plan.

---

## 15. Database Changes

**Ninguna base de datos** (CLAUDE.md §2.2). Cambios en JSON:

| Archivo | Cambio |
|---|---|
| `datos/maquinas.json` | **NUEVO** |
| `datos/aprendizaje.json` | `KEEP` — ya lleva `sistema` por intervención |
| `<manuales>/.manifiesto.json` | `+ tipo` opcional (§13) |
| `backend/datos/documentos.json` | `KEEP` |
| `datos/diario-accionamientos.jsonl` | `KEEP` — ya cubre escrituras |

**Los casos previos no se migran.** Guardan `sistema: "tanque"` y ese id
**sigue existiendo** como máquina configurada. Es la misma decisión que se tomó
al cerrar la estación de llenado: `SISTEMA_IDS` no se filtró para no invalidar
los 11 casos del tanque. **Ocultar o reconfigurar una máquina no puede
invalidar su historia** ([sistemas.js:511-530](shared/eva/comun/sistemas.js#L511-L530)).

Responde a §20 de la petición: si una máquina cambia, **los casos conservan su
`sistema`**, porque el id es estable y no se deriva de los assets.

---

## 16. API Changes

**Reutilizables sin cambios** (§35 pide comparar antes de proponer):

- `GET /api/iconics/browse` — el árbol, para la configuración
- `GET /api/iconics/points` — búsqueda
- `GET /api/iconics/data/batch` — lectura de prueba del paso 4
- `POST /api/iconics/history/batch` — el sondeo del paso 5b
- `GET /api/iconics/alarms`
- `/api/casos`, `/api/rag/*`, `/api/diagnostico` — **ya filtran por sistema**

**Nuevos** — sólo el CRUD:

```
GET    /api/maquinas              lista con estado de validez
GET    /api/maquinas/:id
POST   /api/maquinas              crear (valida contra ICONICS)
PATCH  /api/maquinas/:id
DELETE /api/maquinas/:id          desactiva; NO borra si tiene casos
POST   /api/maquinas/:id/verificar   re-contrastar con ICONICS
GET    /api/tipos-maquina         tipos registrados
```

**No se crean** `/machines/:id/current-data`, `/historical-data` ni `/alarms`:
duplicarían endpoints que ya existen y funcionan. El frontend resuelve
máquina→puntos con el registro y llama a los de siempre. §39 pide no reescribir
lo que funciona.

`DELETE` **no borra si hay casos asociados** — desactiva. Misma regla que §15.

**Obsoletos**: ninguno. Todos los endpoints actuales siguen sirviendo.

---

## 17. Code Impact Matrix

| Archivo/Módulo | Estado actual | Acción | Motivo |
|---|---|---|---|
| `shared/eva/comun/sistemas.js` | registro ejecutable, 990 líneas | **REFACTOR** | añadir `registrarSistema()`; `SISTEMAS` pasa a poder recibir entradas construidas. Su API no cambia |
| `shared/eva/tanque/senales.js` | catálogo 1 414 líneas | **KEEP** (fase 1-8) → INVESTIGATE | es la máquina madura; migrarla a config es el último paso, y sólo con la rama reabierta |
| `shared/eva/vibraciones/vibraciones.js` | catálogo 1 154 líneas | **REFACTOR** | primera candidata a configuración |
| `shared/eva/tanque/riesgos.js` | 17 reglas, 662 líneas | **REFACTOR** → tipo | mover, no reescribir |
| `shared/eva/vibraciones/riesgosVibracion.js` | 18 reglas, 934 líneas | **REFACTOR** → tipo | ídem |
| `shared/eva/comun/estadoMaquina.js` | forma común | **KEEP** | es ya la abstracción buena |
| `shared/eva/comun/causas.js` | 966 líneas | **KEEP** | por riesgo, no por máquina |
| `shared/modulos.js` | agrupación por fuente | **KEEP** | nivel distinto (§4.7) |
| `backend/iconics/client.mjs` | 1 026 líneas | **KEEP** | no cambia nada |
| `backend/iconics/fakeClient.mjs` | transporte falso | **KEEP** | ya sirve desde `SISTEMAS` |
| `backend/ia/herramientas/lib/maquina.mjs` | guarda + `switch` | **REFACTOR** | el `switch` → tipo. La guarda `cerrado` se queda |
| `backend/ia/motor/diagnostico.mjs` | 963 líneas | **REFACTOR mínimo** | sólo `REGLAS_POR_SISTEMA`. La aritmética NO se toca |
| `backend/ia/herramientas/historicos/index.mjs` | 2 111 líneas, 2 `if` por id | **REFACTOR** | es B3, ya conocido |
| `backend/http/esquemas.mjs:198` | ~~`z.enum` literal~~ | **HECHO (F2)** | corregido a `z.enum(SISTEMA_IDS)` |
| `backend/ia/indices/documentos.mjs` | aislamiento RAG | **KEEP** (+tipo) | ya funciona |
| `backend/ia/motor/casos.mjs` | aislamiento casos | **KEEP** | ya obligatorio |
| `backend/routes/iconicsRoutes.mjs` | 40 endpoints | **KEEP** | se reutiliza tal cual |
| `backend/routes/maquinasRoutes.mjs` | — | **NUEVO** | CRUD |
| `react-dashboard/.../routes.jsx` | rutas fijas | **REFACTOR** | dinámicas + redirecciones |
| `.../data/comunes/EvaProvider.jsx` | provider único | **REFACTOR** | por máquina, con ref-count |
| `.../data/comunes/hooks.js` | `useSistemaAgua` | **REFACTOR** | → `useMaquina(id)` |
| `.../views/comunes/CierreDiagnostico.jsx` | 6 `=== "tanque"` | **REFACTOR** | el peor del frontend |
| `.../views/comunes/{AvisosEva,BandejaEva,TurnoEva}.jsx` | ruta por máquina | **REFACTOR** | `rutaDe(maquina)` |
| `.../three-d/components/ActivoEnMaqueta.jsx` | `switch` por tipo | **KEEP** | geometría = tipo |
| `.../Demo-EVA/views/comunes/AssetsEva.jsx` | árbol ICONICS | **KEEP** + reutilizar | ya pinta el árbol |
| `.../features/asistente/lib/navegacionDelAsistente.js` | 2 `=== "tanque"` | **REFACTOR** | mismo `rutaDe()` |
| `scripts/verificar-catalogo.mjs` | valida catálogo | **REFACTOR** | validar configuraciones |
| `scripts/verificar-transporte-falso.mjs` | 2 máquinas | **KEEP** | sigue valiendo |

---

## 18. Deprecated Code

**Nada se propone eliminar en esta fase.** §29 pide documentar antes de borrar,
y CLAUDE.md §6 pide que los gaps se documenten en vez de ocultarse.

Candidatos **futuros**, sólo tras completar la migración y con la rama
reabierta:

| Candidato | Por qué podría sobrar | Por qué NO todavía |
|---|---|---|
| `shared/eva/tanque/senales.js` | reemplazable por config | 1 414 líneas de conocimiento verificado punto por punto; migrarlo sin sondeo perdería las dos señales que devuelven la serie equivocada |
| `shared/eva/vibraciones/vibraciones.js` | ídem | ídem, verificado el 28-08-2026 |
| `.../views/tanque/InicioTanque.jsx` etc. | vistas por máquina | sólo si la vista genérica cubre lo mismo — hay que demostrarlo, no suponerlo |
| `data/tanque/simulador.js` | `modelo()` del tipo | el simulador tiene física propia |

> El caso del tanque ilustra el riesgo: dos de sus 52 señales **no se
> historizan aunque el servidor conteste**. Ese conocimiento vive en una lista
> blanca escrita a mano. Un borrado que lo pierda produce un tablero que
> enseña la temperatura del tanque bajo el rótulo «eficiencia energética», **sin
> error en ningún log**.

---

## 19. Test Migration

**Estado actual**: 126 archivos de prueba. 8 con omisiones declaradas por el
cierre de la estación de llenado (29 pruebas + 22 comprobaciones de
`verificar-herramientas.mjs`).

### Siguen válidos sin cambios

`verificar-transporte-falso`, `verificar-modulos`, `verificar-diagnostico`,
`verificar-riesgos*`, `verificar-inyeccion`, `verificar-i18n`,
`verificar-codigos`, y **los dos grupos de `NO_COMPARTEN`** (`turno-eva`,
`bandeja-eva`) — que ya están marcados como los primeros a reactivar.

### Necesitan cambios

- `verificar-catalogo.mjs` — validar configuraciones además de catálogos
- `demo-eva/sistemas.test.js` — el registro se construye
- `esquemas.test.mjs` — al sustituir el `z.enum` literal
- `llenado-cerrado.test.jsx` — sigue valiendo; **es el patrón a copiar**

### Nuevos necesarios

**Machine Configuration**: sin assets → rechaza · sin variables → rechaza ·
asset inexistente → rechaza · variable inexistente → rechaza · raíz que solapa
otra máquina → **rechaza** · variable sin `acceso` → queda `read` ·
`historyVerified` arranca en `false` · editar no invalida casos previos ·
desactivar con casos → desactiva, no borra.

**ICONICS**: pérdida de conexión → `UNKNOWN`, **nunca `INVALID`** (distinguir
«no pude mirar» de «ya no está» es el mismo principio que §2.4) · asset
borrado → `INVALID` · variable borrada → `DEGRADED` · árbol reorganizado →
detectado.

**Assistant**: descubre las configuradas · máquina inexistente → error con
lista · máquina `INVALID` → se niega · **no cruza dos máquinas configuradas**
(el `NO_COMPARTEN` de siempre, contra máquinas nuevas).

**RAG**: documentos por máquina · por tipo · aislamiento entre instancias del
mismo tipo — **este es nuevo y es el que más importa**: dos motores de
vibración del mismo tipo comparten manual de tipo y **no** manual de instancia.

**Diagnóstico**: el motor recibe las reglas del tipo correcto · dos instancias
del mismo tipo no comparten casos · una máquina sin mapeo completo **declara
qué reglas no evalúa**.

**Regresión de sondeo**: ningún componente de chrome suscribe una máquina.
Copia directa de `llenado-cerrado.test.jsx`.

---

## 20. Security Considerations

### El límite que no se mueve en esta fase

> **El asistente no gana ninguna capacidad de escritura.**

Hoy tiene exactamente una herramienta que escribe: `controlar_bomba`, con ruta
propia, esquema propio y diario. §33 de la petición dice «si actualmente no
existe escritura desde el asistente, no implementarla automáticamente». Existe,
acotada a un actuador. **Se queda igual de acotada.**

Diseñar para soportarla en el futuro significa que el modelo de variables
**tenga** el campo `acceso`, no que se conecte a una herramienta genérica.

### Deny by default, en cuatro capas

1. `acceso: "read"` por defecto en el modelo de variable; ausencia = lectura
2. `ICONICS_READ_ONLY` — 403 antes de tocar nada, ya existente
3. `exigirRol` en las rutas de configuración — el mecanismo ya existe
4. el diario — toda escritura queda anotada

### Quién puede hacer qué

| Acción | Rol | Nota |
|---|---|---|
| Ver máquinas | cualquiera | |
| Crear/editar | administrador | `exigirRol` |
| Eliminar | administrador | desactiva si hay casos |
| **Marcar variable escribible** | administrador | confirmación aparte + diario |
| **Escribir** | operador+ | `ICONICS_READ_ONLY` manda |
| **El asistente escribe** | **sólo `controlar_bomba`** | sin cambios |

> **Aviso que hay que tener presente durante toda la fase**: `AUTH_HABILITADA=false`.
> Los roles están implementados y probados, pero **hoy no protegen nada, a
> propósito** (CLAUDE.md §2.11). Una vista de configuración que permita marcar
> variables escribibles **necesita la autenticación encendida**, que es el Plan
> 25. **Es una dependencia dura, no una recomendación**: sin ella, cualquiera
> con acceso al tablero puede declarar escribible un tag de planta.

### Riesgo específico de esta fase

La cadena `LLM → Tool Calling → Write Variable → ICONICS` **no debe cerrarse**.
Que exista un registro de variables escribibles no significa que exista una
herramienta que las escriba. **Son dos decisiones distintas y la segunda no se
toma aquí.**

---

## 21. ICONICS Synchronization Strategy

Cuatro estados, y la distinción entre dos de ellos es la que evita el fallo
más caro:

| Estado | Cuándo | Qué hace el sistema |
|---|---|---|
| `VALID` | todo existe y se lee | normal |
| `DEGRADED` | falta parte no esencial | funciona, **lo declara en `limitaciones`** |
| `INVALID` | falta el asset raíz, o ninguna variable responde | se niega, como `cerrado` |
| `UNKNOWN` | **no se pudo comprobar** | mantiene el último estado y lo dice |

> `UNKNOWN` ≠ `INVALID`. ICONICS caído no significa que la máquina ya no
> exista. Colapsarlos daría de baja la planta entera en un corte de red —el
> mismo principio que §2.4: **la ausencia de dato no se disfraza de nada**.

**Cuándo se verifica**: al arrancar (no bloqueante), bajo demanda desde la
vista, y tras cualquier edición. **No** en cada lectura: 40 endpoints y un
limitador de 300 peticiones/minuto por IP.

**Qué NO se hace**: reparar automáticamente. Una variable que desaparece y
reaparece con otro nombre puede ser un renombrado o **otra variable distinta**.
El sistema informa; una persona decide. Es §2.5: «no se inventa lo que falta».

---

## 22. Migration Plan

Nueve fases. Orden derivado de las dependencias reales, no del listado de §40.

**Dependencia que reordena todo**: `estacionLlenado` toca código del tanque, y
la rama `Vibraciones1.0` lo prohíbe. Las fases que la necesitan van al final.

---

### F1 · Modelo de dominio y tipos ✅

**Completada el 18-09-2026.**

**Qué se hizo**: `shared/eva/tipos/vibraciones.js` y `shared/eva/tipos/index.js`,
más `react-dashboard/src/test/demo-eva/tipos.test.js` (18 pruebas).

`configuracionMaquina.js` **no** entra aquí: es la forma de la configuración,
y sin nada que la consuma sería una forma inventada contra un consumidor
imaginario. Va con F2, que es quien la lee y la escribe.

**La regla que define la fase**: el tipo **compone, no copia**. Todo lo que
expone lo importa de donde ya vivía, y las pruebas lo fijan con `toBe` —
identidad de referencia, no igualdad. Una transcripción pasaría un `toEqual`
y sería justo el defecto que §2.6 prohíbe.

#### El hallazgo: `aviso` colisiona

Los cinco catálogos suman **30 entradas y 29 claves distintas**. `aviso` es a
la vez **bandera del módulo** (una por apoyo) y **clave del variador** (una por
máquina).

Indexar los roles por clave hacía que la segunda machacara a la primera **en
silencio**: `ROLES.aviso` quedaba con `ambito: "maquina"` mientras
`ROLES_REQUERIDOS` seguía pidiéndolo porque las reglas necesitan la bandera.
Una configuración construida sobre eso mapearía **una señal de máquina donde
las reglas esperan tres de apoyo**, y el diagnóstico evaluaría la regla
correcta sobre el dato equivocado — sin error en ningún log.

De ahí que un rol se nombre **`familia:clave`** y no `clave`.

#### El error que se cometió al arreglarlo, y la guarda que salió de él

La primera versión de `DESAMBIGUA` resolvió `aviso` a `variador:aviso`, **por
parecido de nombre**. Es falso: la única regla que lo pide es
`aviso-del-modulo`, de `ambito: "canal"`, que lee la bandera del apoyo.

Lo cazó leer la regla, no una prueba — así que se añadió
`comprobarDesambiguaciones()`, que **lanza al cargar** si una regla por canal
resuelve a un rol de máquina. Comprobado en los dos sentidos: con el valor
equivocado el módulo no importa, y el error nombra la regla.

Es la misma disciplina que `validarRegistro()`: mejor que el proceso no
arranque.

**Medido antes y después, idéntico**: `verificar-riesgos-vibracion` 40 ·
`verificar-dominio` 12 · `verificar-transporte-falso` 23 · los 31 verificadores ·
982 pruebas de frontend (29 omitidas) · 348 de backend · lint y types limpios.

---

### F2 · Persistencia y CRUD ✅

**Completada el 18-09-2026.**

**Qué se hizo**: `shared/eva/comun/configuracionMaquina.js` (forma pura),
`backend/ia/indices/maquinas.mjs` (disco), `backend/routes/maquinasRoutes.mjs`
(HTTP), los esquemas, dos códigos de error con sus frases en los dos idiomas,
`scripts/verificar-maquinas.mjs` (38 comprobaciones) y
`backend/test/rutas/maquinas.test.mjs` (16).

`verificarConfiguracion.mjs` **no** entra aquí: contrastar contra ICONICS
necesita red y es F8. Una máquina se guarda bien formada y con estado
`UNKNOWN`, que es exactamente lo que significa — nadie ha mirado todavía.

**Nadie consume esto.** El registro sigue leyendo sus dos máquinas escritas a
mano; construir entradas de `SISTEMAS` desde la configuración es F3.

#### El defecto que encontró la prueba de contrato

`crearMaquina()` guardaba las variables **tal como llegaban**, sin pasarlas por
`crearVariable()`. Por HTTP eso dejaba `acceso: undefined` en vez de `"read"`, y
`historyVerified: undefined` en vez de `false`.

No llegó a ser un agujero —`permiteEscritura(undefined)` es `false`— pero **el
deny-by-default tiene que estar en el dato**: el primer lector que escriba
`if (v.acceso !== "read")` para decidir si pide confirmación abriría la puerta
sin tocar aquella línea.

La prueba del dominio **no lo veía** porque construía sus casos llamando a
`crearVariable` a mano. Lo cazó la de HTTP, que entra por donde entrará la
pantalla.

#### Tres decisiones que no eran obvias

**El id no se puede cambiar al editar.** Es lo que guardan los 11 casos del
tanque (`intervencion.sistema`), y cambiarlo los dejaría apuntando a una
máquina que ya no existe con ese nombre. Se rechaza en el esquema **y** en el
gestor: un esquema que lo ignorara dejaría al cliente creyendo que lo cambió.

**Sin contador de casos, `DELETE` desactiva.** El valor por defecto de
`contarCasosDe` es `1`, no `0`: cero autoriza a borrar, y asumirlo convertiría
una dependencia mal cableada en pérdida de historia. Ante la duda, el error
barato.

**Las capacidades se derivan en la ruta, no se guardan.** Almacenarlas sería
tener dos versiones de la misma verdad, y la guardada quedaría vieja en cuanto
alguien editara una variable.

#### De paso

Se corrigió el `z.enum(['tanque','vibraciones'])` literal de
[esquemas.mjs:198](backend/http/esquemas.mjs#L198) —el defecto que la auditoría
marcó `REPLACE`— por `z.enum(SISTEMA_IDS)`. El archivo ya importaba esa lista y
la usaba dos veces más abajo.

**Medido**: `verificar-maquinas` 38 · rutas de máquinas 16 ·
`verificar-codigos` 40 códigos en 2 idiomas · los 31 verificadores · 364
pruebas de backend (antes 348) · 982 de frontend (29 omitidas) · lint y types
limpios.

Las dos guardas críticas se comprobaron **por mutación**: rompiendo el
deny-by-default y la protección de casos, y confirmando que las pruebas caen.

---

### F3 · El registro acepta configuración

**Objetivo**: `SISTEMAS` puede recibir entradas construidas. **La fase de más
riesgo.**
**Backend**: `registrarSistema()` + `construirSistema(config, tipo)`.
**Tests**: **una máquina configurada y una escrita a mano se comportan igual** —
mismo `parse`, mismo contrato de tres estados en `modelo`, misma validación al
cargar.
**Dependencias**: F1, F2.
**Riesgos**: **alto**. Aquí es donde se reintroducen los dos incidentes
históricos si la validación afloja.
**Aceptación**: `validarRegistro()` **lanza** ante una configuración
incompleta; `verificar-transporte-falso` pasa con una máquina configurada;
`modelo()` distingue `undefined` de `null`.

---

### F4 · Vibraciones como máquina configurada

**Objetivo**: reproducir vibraciones desde `maquinas.json` y **comparar contra
el catálogo escrito a mano**.
**Tests**: **prueba de equivalencia** — los 73 puntos, las 40 series y las 18
reglas idénticos a los del módulo actual.
**Dependencias**: F3.
**Riesgos**: medio. Mitigación: el módulo escrito a mano **no se borra**; se
comparan las dos salidas.
**Aceptación**: diff vacío entre ambas. Ninguna otra prueba cambia.

---

### F5 · Planta > Configuración (UI)

**Objetivo**: la vista de seis pasos.
**Frontend**: vista nueva, reutilizando `AssetsEva.jsx` para el árbol.
**Asistente**: ninguno. **Seguridad**: `exigirRol`.
**Dependencias**: F2. **Bloqueante externo**: marcar variables escribibles
**requiere el Plan 25** (autenticación en el tablero).
**Riesgos**: medio — UX que permita configuraciones plausibles pero falsas.
**Aceptación**: configurar vibraciones **desde cero por la UI**, sin tocar
código, y que salga idéntica a F4.

---

### F6 · Frontend dinámico

**Objetivo**: rutas por máquina y `MachineContext`.
**Frontend**: `routes.jsx` dinámico + redirecciones; `MachineContext`;
quitar los `=== "tanque"` de `CierreDiagnostico`, `AvisosEva`, `BandejaEva`,
`TurnoEva`, `navegacionDelAsistente`.
**Tests**: **la prueba de sondeo de chrome** (copia de `llenado-cerrado`);
las rutas viejas redirigen.
**Dependencias**: F4.
**Riesgos**: **alto — regresión de sondeo**. Ya ocurrió dos veces.
**Aceptación**: ningún componente siempre montado suscribe una máquina; las
rutas viejas siguen funcionando.

---

### F7 · Tool Calling genérico

**Objetivo**: las 10 herramientas de historia aceptan `sistema`. **Es B3 del
backlog**, no trabajo nuevo.
**Backend**: índice de sinónimos por máquina (Plan 32 F6);
`historicos/index.mjs` pierde sus dos `if`.
**Tests**: `verificar-herramientas` con una máquina configurada; el resolvedor
**sigue preguntando ante ambigüedad**.
**Dependencias**: F4.
**Riesgos**: medio — un resolvedor que elija en vez de preguntar contesta
correctamente sobre la máquina equivocada.
**Aceptación**: las 10 herramientas contestan sobre vibraciones; ninguna elige
por el usuario ante ambigüedad.

---

### F8 · Deriva ICONICS

**Objetivo**: VALID/DEGRADED/INVALID/UNKNOWN visibles y respetados.
**Backend**: verificación al arranque y bajo demanda; la guarda de
`resolverSistema` niega `INVALID`.
**Frontend**: estado en la vista de configuración.
**Asistente**: el estado entra en `limitaciones`.
**Dependencias**: F2, F5.
**Riesgos**: medio — confundir `UNKNOWN` con `INVALID`.
**Aceptación**: borrar un punto del ICONICS falso → `DEGRADED`; apagarlo entero
→ `UNKNOWN` y **no** `INVALID`.

---

### F9 · Estación de llenado — **bloqueada por la rama**

**Objetivo**: tipo `estacionLlenado` y el tanque como máquina configurada.
**Dependencias**: F4, F7 **y la reapertura de `Vibraciones1.0`**
(PLAN-32 §2.5).
**Riesgos**: **alto** — el tanque tiene 11 casos previos, 4 `firmaTemporal` y
50 series verificadas.
**Aceptación**: los 11 casos siguen resolviendo; las 50 series siguen dando las
mismas muestras; los dos `NO_COMPARTEN` reactivados y en verde.

---

## 23. Target Architecture

```
                        ICONICS FrameWorX
                               │
                    ┌──────────┴──────────┐
                    ▼                     ▼
            /Data/Browse            /Data, /History,
            /Data/Search            /AlarmHistory, write
                    │                     │
                    ▼                     │
        Planta > Configuración (UI)       │
                    │                     │
                    ▼                     │
          datos/maquinas.json             │
      (validado contra ICONICS)           │
                    │                     │
                    ▼                     │
        construirSistema(config, tipo) ◄── shared/eva/tipos/
                    │                        (CÓDIGO: reglas,
                    ▼                         física, roles)
        ┌──── SISTEMAS (el registro) ────┐
        │   validarRegistro() LANZA      │
        │   NO_COMPARTEN · plc · raices  │
        └────────────┬───────────────────┘
                     │
      ┌──────────┬───┴────┬───────────┬──────────┐
      ▼          ▼        ▼           ▼          ▼
  Frontend   Asistente  Motor de    RAG      Transporte
  Machine    resolver   diagnóstico por      falso
  Context    Sistema()  (determinista) máquina/tipo
      │          │        │           │
      └──────────┴────────┴───────────┘
                     │
              Machine Context
     (estado, capacidades, limitaciones,
      VALID/DEGRADED/INVALID/UNKNOWN)
```

Diferencia con el diagrama de §38 de la petición: **no hay un "Machine
Registry" nuevo**. El registro ya existe y es `SISTEMAS`. Lo que se añade
delante es la construcción desde configuración. Poner un registro nuevo al lado
del que ya funciona crearía dos fuentes de verdad — exactamente lo que
CLAUDE.md §2.6 prohíbe.

---

## 24. Target Folder Structure

Cambios **mínimos**, sólo donde hacen falta:

```
shared/eva/
  comun/        sistemas.js ← + registrarSistema()
                configuracionMaquina.js   ← NUEVO (forma pura)
  tipos/                                   ← NUEVO
    index.js · vibraciones.js · estacionLlenado.js
  tanque/       KEEP (origen del tipo estacionLlenado)
  vibraciones/  KEEP (origen del tipo vibraciones)

backend/
  ia/indices/maquinas.mjs        ← NUEVO (E/S)
  lib/verificarConfiguracion.mjs ← NUEVO
  routes/maquinasRoutes.mjs      ← NUEVO

react-dashboard/src/Demo-EVA/
  views/configuracion/ConfiguracionPlanta.jsx  ← NUEVO
  data/comunes/MachineContext.jsx              ← NUEVO
  views/{tanque,vibraciones}/   KEEP durante toda la migración
```

`shared/eva/{tanque,vibraciones}/` **se conservan**. Son el origen de los tipos
y la referencia contra la que se compara la configuración en F4.

---

## 25. Technical Decisions

**D1 · La configuración alimenta el registro; no lo sustituye**
*Alternativas*: (a) registro nuevo en paralelo; (b) sustituir `SISTEMAS`;
(c) alimentarlo. **Elegida (c).**
*Razón*: ~100 importaciones de `SISTEMAS` y una validación que ya lanza.
(a) crea dos fuentes de verdad (§2.6); (b) es big bang (§45).
*Consecuencias*: máquinas configuradas y escritas a mano conviven; migración
incremental real.

**D2 · MachineType es código; Machine es configuración**
*Alternativas*: (a) ambos persistidos; (b) ambos código; (c) mixto.
**Elegida (c).**
*Razón*: las reglas son deterministas y el LLM no las toca (§2.3). Un tipo
persistido apunta a código por nombre y añade un fallo nuevo.
*Consecuencias*: máquina nueva de tipo existente = configuración; tipo nuevo =
código. Es la respuesta honesta a §44.15.

**D3 · `historyVerified` arranca en `false`**
*Alternativas*: (a) preguntar al servidor; (b) asumir sí; (c) sondear y
comparar. **Elegida (c).**
*Razón*: **medido** — el servidor contesta afirmativamente y devuelve la serie
de otra señal, sin error. Dos casos en el tanque, uno en vibraciones.
*Consecuencias*: el paso 5b existe; una variable no verificada se lee en vivo
pero no promete historia.

**D4 · Escritura deny-by-default, y el asistente no gana nada**
*Alternativas*: (a) derivar de ICONICS; (b) declarar, por defecto lectura;
(c) por defecto escritura. **Elegida (b).**
*Razón*: ICONICS no publica la capacidad en `browse` (§3). (c) es inaceptable.
*Consecuencias*: cuatro capas de guarda; la cadena LLM→escritura **no se
cierra**; marcar escribible depende del Plan 25.

**D5 · `UNKNOWN` separado de `INVALID`**
*Alternativas*: (a) tres estados; (b) cuatro. **Elegida (b).**
*Razón*: mismo principio que §2.4 — no poder mirar no es haber mirado y no
encontrar.
*Consecuencias*: un corte de red no da de baja la planta.

**D6 · No se añaden herramientas al asistente**
*Alternativas*: (a) `listMachines`+`getMachine`; (b) generalizar las que hay.
**Elegida (b).**
*Razón*: ya existe `sistemas_de_la_planta`; con 26 herramientas cada una es una
elección que un modelo de 4B puede fallar, **medido en este proyecto**.
*Consecuencias*: el gap es B3 del backlog, no un catálogo nuevo.

**D7 · Sin base de datos**
*Alternativas*: (a) SQLite; (b) JSON atómico. **Elegida (b).**
*Razón*: CLAUDE.md §2.2. Un puñado de máquinas no justifica un motor, y
`jsonAtomico.mjs` ya resuelve concurrencia.
*Consecuencias*: si llegan cientos de máquinas, se revisa — **con medición**.

**D8 · La estación de llenado se migra al final**
*Razón*: la rama prohíbe tocar su código (CLAUDE.md §1) y es la máquina con
historia real (11 casos, 50 series verificadas).
*Consecuencias*: F9 queda bloqueada por la reapertura, declarado por adelantado.

---

## 26. Risks

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| **Configuración que permite declarar menos que el código** | **alta** | **crítico** | `validarRegistro()` sigue lanzando; F3 prueba equivalencia. **Es el riesgo nº1** |
| **Regresión de sondeo** (chrome suscribe máquina) | **alta** | alto | Ya pasó **dos veces**. Prueba sobre suscripciones, no menú |
| Serie equivocada tomada por buena | media | **crítico** | `historyVerified: false` + sondeo comparativo (D3) |
| Diagnóstico con reglas del tipo equivocado | media | **crítico** | `plc` obligatorio; prueba de aislamiento entre instancias |
| Casos previos huérfanos | media | alto | id estable; DELETE desactiva (§15) |
| RAG cruzando instancias del mismo tipo | media | alto | Precedencia instancia>tipo + prueba nueva (§19) |
| Dos máquinas con raíces solapadas | media | alto | Rechazo en validación: `sistemaDePunto` devuelve **la primera** |
| Escritura habilitada sin autenticación | baja | **crítico** | Dependencia dura del Plan 25 (§20) |
| `UNKNOWN` tratado como `INVALID` | media | alto | D5 + prueba específica |
| Sobreingeniería | media | medio | §25 de la petición: sin microservicios, sin CQRS, sin event bus |
| Rendimiento al verificar | baja | medio | Verificación bajo demanda, no por lectura |
| Perder conocimiento al borrar catálogos | media | alto | §18: no se borra nada en esta fase |

---

## 27. Acceptance Criteria

| # | Caso | Cómo se demuestra | Fase |
|---|---|---|---|
| 1 | Configurar vibraciones desde ICONICS **sin tocar código** | UI de F5; diff vacío contra el módulo actual | F5 |
| 2 | Configurar estación de llenado sin tocar código | ídem; **requiere rama reabierta** | F9 |
| 3 | Ambas aparecen dinámicamente | menú generado desde el registro | F6 |
| 4 | El asistente descubre ambas | `sistemas_de_la_planta` las lista | F4/F9 |
| 5 | **Cada máquina obtiene sólo sus variables** | `parsePuntoDeSistema`; prueba `NO_COMPARTEN` | F3 |
| 6 | Cada una sus históricos | series por `series.punto` de su config | F4 |
| 7 | Cada una sus alarmas | por área declarada | F8 |
| 8 | RAG limitado a una máquina | `buscar(p,{sistema})` + prueba instancia/tipo | F4 |
| 9 | Casos en la máquina correcta | `sistema` obligatorio, ya vigente | ya |
| 10 | El motor recibe el contexto correcto | reglas del tipo; aislamiento entre instancias | F4 |
| 11 | **Tercera máquina con esfuerzo menor** | una segunda de tipo `vibraciones` = **sólo configuración** | F5 |

### Criterios que además deben cumplirse, y no salen de §43

| # | Criterio | Por qué |
|---|---|---|
| 12 | Una configuración incompleta **impide arrancar** | `validarRegistro()` lanza hoy; aflojarlo reintroduce el fallo de `value: null` con calidad BUENA |
| 13 | `modelo()` distingue `undefined` de `null` en máquinas configuradas | el contrato de tres estados (§4) |
| 14 | **Ningún componente de chrome suscribe una máquina** | la regresión que ya ocurrió dos veces |
| 15 | Variables no verificadas **no prometen historia** | el servidor contesta y devuelve otra serie |
| 16 | El asistente **no gana** capacidad de escritura | §20 |
| 17 | La aritmética del motor **no cambia** | CLAUDE.md §2.3 |

---

## 44. Las quince preguntas, respondidas

1. **¿Cómo representa una máquina?** Entrada ejecutable en `SISTEMAS`, con 18
   campos, validada al cargar. No es una lista de nombres.
2. **¿Cuánto está acoplado?** Menos de lo esperado: 5 puntos en backend, ~20 en
   frontend, casi todos de presentación. **El acoplamiento real es el alta**:
   ~3 300 líneas por máquina.
3. **¿Qué da ICONICS?** Nombres de punto (browse/search), valores con calidad,
   historia por nombre `hda:`, alarmas por área, escritura con confirmación.
   **No da**: tipo de dato, unidad, descripción, escribibilidad, ni
   historización fiable.
4. **¿Qué almacenar localmente?** Mapeo assets/variables→máquina, roles, alias,
   unidades, descripciones, acceso, `historyVerified`, `plc`, limitaciones.
5. **¿Machine y MachineType separados?** Sí, pero el tipo es **código** y la
   instancia **configuración** (D2).
6. **¿Capacidades?** Derivadas, salvo escritura, que se declara (§6).
7. **¿Variables?** §6: `pointName` + `historyPointName` separados, porque no
   derivan uno de otro.
8. **¿Permisos de escritura?** Deny by default en cuatro capas (§20).
9. **¿Detectar roto?** VALID/DEGRADED/INVALID/UNKNOWN, verificado bajo demanda
   y al arranque (§21).
10. **¿Cómo descubre el asistente?** Ya lo hace: `sistemas_de_la_planta`.
11. **¿Contexto del motor?** Ya recibe `sistema`; sólo cambia de dónde salen las
    reglas.
12. **¿RAG por máquina?** Ya implementado; se añade precedencia por tipo.
13. **¿Casos?** Ya obligatorio por `sistema`, sin defecto.
14. **¿Migrar vistas?** Rutas dinámicas + redirecciones; las vistas por máquina
    se conservan hasta demostrar que la genérica cubre lo mismo.
15. **¿Una tercera máquina?** De tipo existente: **configuración pura**. De tipo
    nuevo: código, y debe serlo — son reglas de diagnóstico.

---

## Lo que este plan deja fuera, a propósito

- **Sistema universal de gráficas** — §15 de la petición avisa, y el proyecto
  ya tiene `GraficaHistoria` genérico.
- **Mapeo variable→elemento 3D por configuración** — fase posterior.
- **Escritura desde el asistente** — §20.
- **Borrar catálogos escritos a mano** — §18.
- **Tocar la aritmética del motor** — CLAUDE.md §2.3.
- **Base de datos** — CLAUDE.md §2.2, revisable **con medición**.

---

## Antes de empezar F1: cuatro cosas que verificar

Ninguna se puede responder desde el repositorio, y las cuatro cambian el
diseño:

1. **¿`/Data/Browse` puede devolver atributos extendidos?** (tipo, unidad,
   escribibilidad). Si sí, el paso 5 se simplifica mucho. La sonda actual no los
   ve. → extender `scripts/sondear-arbol.mjs` para volcar el nodo crudo.
2. **¿Hay un endpoint de configuración del historiador?** Si expone qué puntos
   registra un grupo, D3 cambia. → probable que ayude con el bloqueo de
   PLAN-32 F2.
3. **¿Los `pointName` son estables ante reorganizaciones?** El 09-09-2026 una
   reorganización rompió el histórico de 12 de 13 ramas (B10). Si no hay id
   estable, la deriva del §21 **es permanente** y hay que diseñar para ella, no
   contra ella.
4. **¿Cuántas máquinas se esperan?** D7 (sin base de datos) es correcto para
   decenas. Para cientos, se revisa — con medición, no por intuición.
