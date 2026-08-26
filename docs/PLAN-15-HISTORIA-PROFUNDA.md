# Plan 15 · Historia profunda: paginación real del historiador

> **Objetivo.** Que cualquier período que el servidor guarde se pueda leer
> completo y con la resolución máxima que ese período permita —un día, un
> trimestre o un año— en vez de la ventana de 7 días y la única página de 100
> muestras que hoy son el techo de todo el proyecto.

> **ESTADO (25-ago-2026)** — Fase 0 pendiente de servidor. La sonda
> (`scripts/sondear-paginacion-historico.mjs`) está escrita y no se ha podido
> ejecutar: `ICONICS_FAKE=true`, sin servidor real disponible.

---

## 1 · El diagnóstico, y por qué no es el que parecía

La hipótesis de partida era «la API topa en 100 puntos por consulta, hay que
inventar paginación troceando el tiempo». **La mitad es falsa y la otra mitad
ya está hecha.**

### 1.1 · 100 no es un tope: es un tamaño de página

De la documentación de ICONICS:

> API calls can only return one "page" of data at a time, up to 100 records
> per page. (This limit is configurable as `MaxItemCount` in the
> `IcoOData.json` file, located in the
> `ICONICS\GENESIS64\WebSites\IcoWebAPIService\` folder.) If more than 100
> records are available, the call returns a continuation token
> (`X-ICO-CONTINUATION` header). The next API call can use this continuation
> token to request the next 100 items. This can be repeated until the call
> returns no continuation token.

Tres consecuencias, y las tres tocan código escrito:

1. **Existe paginación oficial.** No hay que simularla.
2. **El proyecto la detecta y la tira.** `backend/iconics/client.mjs` lee la
   cabecera sólo para saber *si estaba*, y devuelve
   `hasMore: Boolean(result.headers.get(CONTINUATION_HEADER))`. El token —lo
   único que sirve para traer el resto— se descarta en esa misma línea.
3. **`X-ICO-MAX-ITEM-COUNT: 100` que enviamos no sube nada.** El tope vive en
   `IcoOData.json` del servidor. Nuestra cabecera puede pedir *menos*, nunca
   más. Subirlo es una gestión de administración de la planta, no un cambio
   de código — y aun subiéndolo sigue haciendo falta paginar.

### 1.2 · El troceado que propones ya existe… tres veces

La idea de «divide el día en ~100 buckets» y «para rangos largos, varias
consultas» está implementada en tres sitios, con **tres reglas distintas**:

| Dónde | Regla | Densidad |
|---|---|---|
| `Demo-EVA/data/historia.js` → `trocear()` | escalones: 1 día/tramo ≤14 d, 3 d ≤60, 7 d ≤180, 30 d después | 96 puntos por tramo |
| `backend/ia/herramientas.mjs` → `leerSerieEnRango()` | siempre 1 día por tramo | `min(100, segundos/900)` |
| `scripts/verificar-antiguedad-historico.mjs` | `DIAS_TRAMO = 3` | intervalo fijo `01:00:00` |

Que la misma regla viva tres veces con tres valores es la razón de que la
misma pregunta dé respuestas distintas según quién la haga: la gráfica, el
asistente y el script no leen el mismo histórico.

### 1.3 · Lo que de verdad impide leer datos antiguos

No es el tope de 100. Son cuatro cosas, en este orden de importancia:

1. **Nadie sigue la continuación.** Toda lectura de este proyecto se queda en
   la primera página, siempre. Cuando el servidor dice «hay más», se pinta un
   aviso y se abandona.
2. **El asistente se niega antes de intentarlo.** `MAX_HORAS_VENTANA = 24 * 7`
   rechaza cualquier período de más de 7 días con un error redactado
   (`"…abarca más de 7 días. Con el tope de 100 muestras…"`). El tope que
   justifica esa negativa es, precisamente, el que resulta no ser un tope.
   `MAX_DIAS_PERFIL = 30` y `MAX_DIAS_REPORTE = 31` son la misma negativa con
   otro número.
3. **La patología del rango ancho con intervalo fino.** Medida y documentada
   en `trocear()`: sobre 14→24 de agosto, `interval=02:24:00` devolvió 1
   punto; `00:15:00` devolvió **cero** con `hasMore=true`. El servidor agota
   su única página recorriendo buckets vacíos del principio y nunca llega a
   los días con muestras. Con continuación esto deja de ser un callejón sin
   salida: se siguen pidiendo páginas hasta atravesar el hueco.
4. **Nadie sabe hasta dónde llega la historia.** ICONICS no publica «cuál es
   la primera muestra». Sin ese dato, «no hay datos antiguos» y «pedí mal los
   datos antiguos» son indistinguibles desde la interfaz — y ahora mismo se
   confunden.

### 1.4 · Veredicto sobre el approach propuesto

**Correcto en la forma, incompleto en el fondo.** El troceado temporal hay que
conservarlo (evita la patología de 1.3.3 y acota el coste por petición), pero
por sí solo no arregla nada: ya está, y el problema no era ése. Lo que falta
añadir es la paginación real por debajo, y **unificar** las tres copias del
troceado en una sola regla.

La corrección importante al planteamiento: *«entre más largo sea el tiempo,
obviamente traeremos menos datos»* ya no tiene por qué ser cierto. Con
continuación, un trimestre puede traerse con la misma densidad que un día —90
días × 96 puntos = 8.640 puntos— a cambio de tiempo y de peticiones. Lo que
hay que decidir no es «cuánta resolución sacrificamos», sino **cuánto
presupuesto de peticiones gastamos**, que es una decisión distinta, acotable y
declarable al usuario.

---

## 2 · Arquitectura

Una regla, un lector, tres consumidores:

```
  shared/eva/rango.js         planificar(inicio, fin, objetivo) -> [tramos]
        │                     (LA regla de troceado, única, testeable sin red)
        ▼
  backend/iconics/client.mjs  readHistory() sigue X-ICO-CONTINUATION
        │                     hasta agotar el rango o el presupuesto
        ▼
  ┌─────────────┬──────────────────────┬────────────────────────┐
  │ gráficas    │ asistente (IA)       │ scripts de verificación│
  │ historia.js │ herramientas.mjs     │                        │
  └─────────────┴──────────────────────┴────────────────────────┘
```

---

## 3 · Fases

### Fase 0 · Confirmar el protocolo contra el servidor real

`scripts/sondear-paginacion-historico.mjs` (ya escrito). Responde:

- **A** · `MaxItemCount` real de ESTA planta (100, o ya lo subieron).
- **B** · Semántica exacta del token: ¿se reenvía en cabecera del mismo
  nombre? ¿la segunda página *avanza* o repite? ¿el token sobrevive a que
  cambien los parámetros de la consulta? ¿aparece también en consultas
  **agregadas**, o sólo en las crudas?
- **C** · Coste por página en ms — el número que fija el presupuesto de la
  Fase 1.

**Nada de las fases siguientes se escribe antes de tener B.** Si el token
resultara valer sólo para lecturas crudas y no para agregadas, la Fase 1
cambia de forma: la paginación serviría para el descubrimiento y el troceado
seguiría siendo el mecanismo de las gráficas.

### Fase 1 · `readHistory` sigue la continuación

En `backend/iconics/client.mjs`, convertir la llamada única en un bucle de
páginas. Devuelve `{ data, paginas, truncada, motivoCorte }`.

**El presupuesto no es opcional; es la parte importante de esta fase.** El
historiador guardó 26.754 muestras del nivel del tanque en un solo día
(medido, documentado en `shared/eva/historia.js`): en crudo eso son 268
páginas por día, y un año son ~97.000 peticiones. El bucle corta por lo
primero que se cumpla de:

- `maxPaginas` (arranque sugerido: 20 → 2.000 muestras por tramo),
- `maxMuestras`,
- **un plazo total**, distinto de `upstreamTimeoutMs` — esos 15 s son *por
  fetch*; veinte páginas encadenadas pueden tardar mucho más y hoy no hay nada
  que lo acote.

`truncada` deja de significar «el servidor recortó» y pasa a significar
**«nos quedamos nosotros, y aquí está por qué»** (`motivoCorte`). Es la
diferencia entre un aviso que el operador no puede accionar y uno que sí.

Los ~60 usos de `hasMore` (14 archivos) siguen funcionando: el campo se
conserva con el mismo nombre y semántica compatible.

### Fase 2 · Una sola regla de troceado, en `shared/eva/rango.js`

```js
planificar({ inicio, fin, objetivoPuntos }) -> {
  tramos: [{ desde, hasta, interval }],
  segundosPorPunto,          // la resolución REAL que va a salir
  peticionesEstimadas,       // para poder avisar antes de lanzar
}
```

Sustituye a `trocear()` + `resolverRango()` del frontend, a
`leerSerieEnRango()` del backend y a `DIAS_TRAMO` del script. Sin red dentro,
así que se prueba entera con tablas — que es como debería haberse podido
probar esta regla desde el principio.

Aquí vive, escrita una vez, la decisión que hoy está repartida: qué resolución
corresponde a qué longitud de período, y cuántas peticiones cuesta.

### Fase 3 · Concurrencia acotada

`leerSerieEnRango()` lanza hoy **todos los días a la vez** con `Promise.all`;
`historia.js` hace lo mismo con los tramos. Un trimestre a un día por tramo
son 90 peticiones simultáneas contra el historiador de la planta — y con la
Fase 1 cada una puede ser 20 peticiones encadenadas.

Sustituir por una cola con tope de concurrencia (6 sugerido, ajustable con lo
medido en Fase 0.C). Sin esto, el Plan 15 convierte una mejora en una forma
nueva de tumbar el servidor de producción.

### Fase 4 · Levantar los topes que ya no se sostienen

- `MAX_HORAS_VENTANA`: de 7 días a meses. El texto del error se reescribe: ya
  no se niega el período, se **declara la resolución** con que se va a
  contestar («un trimestre, con cada punto como promedio de 6 h»).
- `MAX_DIAS_PERFIL` (30) y `MAX_DIAS_REPORTE` (31): re-derivar del presupuesto
  de peticiones de la Fase 1, no de `MAX_PUNTOS`.
- `MAX_PUNTOS = 100` en `shared/eva/historia.js`: deja de ser «el tope del
  servidor» y pasa a ser «el tamaño de página». El comentario que hoy dice que
  pedir más hace que el servidor recorte **sin decirlo** es lo que hay que
  reescribir: sí lo dice, en la cabecera que tirábamos.

### Fase 5 · Caché de días cerrados

Un día pasado no cambia nunca. Con rangos largos, la misma consulta vuelve a
pedir los mismos 89 días cada vez que alguien mueve el calendario un día.
Cachear por `(punto, día, intervalo)` —memoria en el backend, y disco si se
quiere sobrevivir a reinicios— es lo que hace que un trimestre sea usable la
segunda vez. **Sólo días cerrados**: el día en curso nunca se cachea, por la
misma razón por la que `Demo-EVA/data/historia.js` no cachea hoy.

### Fase 6 · «Desde cuándo hay historia», como dato de primera clase

`scripts/verificar-antiguedad-historico.mjs` ya sabe encontrar el borde de la
historia, y su cabecera documenta los dos intentos fallidos de hacerlo con
búsqueda binaria — ese conocimiento no puede quedarse en un script.

Promoverlo a capacidad del backend, con caché larga, y consumirlo en:

- el calendario de `SelectorRango`: deshabilitar lo anterior al primer dato,
  igual que hoy se deshabilita el futuro;
- el asistente, para que «no hay datos de marzo» sea una afirmación verificada
  y no una consulta vacía mal interpretada.

### Fase 7 · Progreso incremental en la gráfica

Con rangos de meses, `Promise.all` deja la pantalla en blanco durante todo el
barrido. Pintar por tramos según llegan, con la cobertura actualizándose. La
infraestructura de cobertura ya está en ambos lados (`cobertura()`); lo que
falta es entregarla por partes.

---

## 4 · Riesgos

| Riesgo | Mitigación |
|---|---|
| Tormenta de peticiones contra el historiador de producción | Fase 3 antes que la 4. No levantar topes sin la cola. |
| El token de continuación no aplica a consultas agregadas | Fase 0.B lo determina antes de escribir nada. |
| Un rango largo tarda minutos y parece colgado | Plazo total (Fase 1) + progreso incremental (Fase 7). |
| Resolución declarada que nadie lee | El aviso de cobertura ya existe y está redactado para el asistente; extenderlo, no reinventarlo. |
| Regresión silenciosa en los ~60 usos de `hasMore` | Semántica compatible en Fase 1; el simulador (`fakeClient.mjs`) tiene que aprender a paginar, o las pruebas dejarán de cubrir el camino real. |

---

## 5 · Orden recomendado

**0 → 1 → 3 → 2 → 4** es el camino corto hasta «puedo leer tres meses».
5, 6 y 7 son lo que lo hace *usable*, y ninguna bloquea a las otras.
