# Plan 7 · El alcance del asistente

> **ESTADO (12-ago-2026)** — **Las tres fases ejecutadas y verificadas contra
> el servidor real.**
>
> | Comprobación | Antes | Ahora |
> |---|---|---|
> | Suite del frontend | 204 | **206** |
> | `verificar-backend.mjs` | 51 | 51 |
> | `verificar-herramientas.mjs` | 21 | **35** |
> | `verificar-chat.mjs` | 21 | **28** |
>
> **Conversación real, con el Qwen 4B y ICONICS respondiendo:**
>
> | Pregunta | Herramienta | Respuesta | Tiempo |
> |---|---|---|---|
> | «¿Cómo va la planta ahora mismo?» | `estado_de_planta` | 37,9 % · 1 operando, 9 sin comunicación | 10,3 s |
> | «¿Y qué máquina va peor?» | `estado_de_planta` | Entendida en contexto | 9,8 s |
> | «¿OEE de la Línea 1 el 30 de julio de 2026?» | `oee_de_maquina(LIN/1, 2026-07-30)` | **61,9 %** | 4,9 s |
> | **«¿Y el día anterior?»** | `oee_de_maquina(LIN/1, **2026-07-29**)` | **85,8 %** | 4,2 s |
>
> La última es la que resume el plan: sin memoria esa frase no significaba
> nada, y ahora resuelve máquina y fecha y **vuelve a consultar**.
>
> **Tres cosas que aparecieron al ejecutar y no estaban en el plan:**
>
> 1. **«Servidor caído» se contaba como «tag sin coleccionar».** Con los
>    servicios GENESIS apagados, los siete tags del día fallaban y
>    `leerDia()` concluía que la máquina no está historizada — mandando a
>    revisar el Data Historian cuando lo que había que hacer era levantar los
>    servicios. Ahora se distingue por el código: 500 es «no coleccionado»,
>    502/504 son «no se llegó al servidor». Es la misma distinción que el
>    puente ya hacía entre 502 y 504, y por el mismo motivo.
> 2. **El 4B hacía mal las cuentas al redactar.** Con datos correctos
>    (`total: 10, operando: 1, sinDato: 9`) escribió «las otras 9 de Lineales y
>    las 3 de Rectificadoras» — que son 12. Se añadió una regla al prompt:
>    *no hagas aritmética, cita los números tal y como vienen*. Verificado
>    después: «De las 10 máquinas: 1 operando, 9 sin comunicación».
> 3. **`shiftModel.js` no se movía entero.** Mezcla aritmética de turno con
>    formateo (`fmtHM`, `bandColor`), y llevárselo todo habría arrastrado
>    `lib/format.js` a `shared/`. Se partió: `shared/turno.js` lleva la
>    aritmética, el formateo se queda en el frontend.
>
> **Tres fallos más, encontrados usándolo en planta** (pregunta real: «¿cuál
> fue el OEE más alto en el mes de julio de la Línea 1?»):
>
> 4. **El marcado de una segunda herramienta salía como texto.** El modelo
>    llamó a `listar_maquinas`, vio que no le bastaba y en la pasada de
>    redactar —que no lleva herramientas— intentó llamar a otra. llama-server
>    no lo interpretó y su `<tool_call>` crudo apareció en la burbuja. Ahora se
>    filtra durante el flujo, reteniendo unos caracteres para que un marcador
>    partido entre dos trozos no se cuele, y el dato ya consultado se cuenta
>    con el resumen de respaldo.
> 5. **Sin herramienta y sin texto: burbuja vacía.** La red del Plan 6 cubría
>    la pasada de redactar pero no este brazo. Con preguntas que no encajan en
>    ninguna herramienta, el 4B gastaba 16 s pensando y devolvía contenido
>    vacío. Ahora responde enumerando lo que sí se puede preguntar.
> 6. **El aviso de bloqueo culpaba a `--jinja` sin base.** Estaba cableado, y
>    con la bandera bien puesta mandaba a revisar algo que no tenía nada que
>    ver. Ahora dice lo accionable —qué SÍ se puede consultar— y solo sugiere
>    revisar la bandera, en condicional, si el modelo no ha usado herramientas
>    en todo el proceso.
>
> **Lo que esos tres fallos dejan claro:** la pregunta de rango («el máximo de
> julio») no es un caso raro, es de las primeras que hace cualquiera. Hoy se
> contesta con honestidad —«solo puedo días sueltos»— pero no se responde. Es
> el argumento para desempolvar la **tendencia multi-día** de §6, que estaba
> aparcada esperando justo esta evidencia.
>
> **Una desviación deliberada del §3.3.** El plan decía excluir del historial
> el texto de la red de seguridad —el que redacta el backend cuando el modelo
> no escribe—. Se decidió **incluirlo**: es una respuesta veraz, derivada de
> una consulta real, y es la que el usuario vio. Excluirla rompía el hilo sin
> ganar nada. Lo que sí queda fuera son los turnos bloqueados y los que
> fallaron, que es donde el argumento del plan sí se sostiene.

> **ESTADO (17-ago-2026)** — **La tendencia multi-día, que este plan aparcaba
> en §6, se construyó.** Fue el argumento del propio §6 el que la desbloqueó:
> «el máximo de julio» no es una pregunta rara, es de las primeras que hace
> cualquiera.
>
> | Comprobación | 12-ago | Ahora |
> |---|---|---|
> | Suite del frontend | 206 | **212** (6 omitidas) |
> | `verificar-backend.mjs` | 51 | 51 |
> | `verificar-herramientas.mjs` | 35 | **49** |
> | `verificar-chat.mjs` | 28 | **35** |
> | `verificar-bundle.mjs` | 157,49 KB | **157,59 KB** (techo 170) |
>
> ### El catálogo cambió entero
>
> Las cuatro herramientas del [Plan 6 §4](PLAN-6-IA-LOCAL.md) y la de §5.2 de
> este plan ya no son las que hay. **El catálogo vigente es éste:**
>
> | Herramienta | Argumentos | Devuelve |
> |---|---|---|
> | `estado_de_planta` | — | La planta entera: OEE y factores, producción, resumen por área, ranking de las 10 |
> | `estado_actual` | `maquina` | Lectura en vivo. Las 10 máquinas |
> | `datos_de_maquina` | `maquina`, `periodo`, `metrica?` | Histórico de **cualquier** período |
> | `comparar_periodos` | `maquina`, `periodoA`, `periodoB`, `metrica?` | Los dos resúmenes y su diferencia |
>
> `oee_de_maquina` y `comparar_dias` no se ampliaron: se **generalizaron**. Un
> día es un caso particular de período, y mantener una herramienta por forma de
> período —día, hora, turno, mes— era multiplicar las ocasiones de que el 4B
> eligiera mal, que es el R-6 de este plan.
>
> **`listar_maquinas` se retiró.** Gastaba la única llamada del turno (regla 3
> del Plan 6 §2) en pedir lo que el modelo ya tiene delante en las
> instrucciones, y lo dejaba sin poder consultar el historiador. La lista, con
> la marca de cuáles tienen historia, va en el prompt del sistema.
>
> ### `shared/periodo.js`, y por qué es código y no prompt
>
> Es la pieza nueva, y la que sostiene lo demás. Todo período —«ayer a las 12»,
> «turno de la mañana del 20 de julio», «julio 2026», «últimos 7 días»— se
> reduce a una sola forma: `{ tipo, diaDesde, diaHasta, horaDesde, horaHasta }`.
> Un día es `0 → 24`; una hora suelta, `12 → 13`. Así el que lee no tiene cuatro
> caminos, solo dos: mismo día o barrido de varios.
>
> Es la misma regla del §3.4 llevada hasta el final —**resolver es del backend,
> elegir es del modelo**—, y aquí importa más que en ningún otro sitio: pedirle
> a un 4B que convierta «julio de 2026» en un rango de 31 días es pedirle
> aritmética de calendario, y **ese fallo no se ve**. Devuelve datos reales del
> período equivocado, indistinguible de la respuesta correcta.
>
> Cuando el período abarca varios días, `datos_de_maquina` devuelve además el
> máximo, el mínimo y el promedio de `metrica`, **cada uno con su fecha**. Es
> exactamente la pregunta que el bloque anterior no sabía contestar.
>
> ### Dos variables nuevas
>
> | Variable | Por defecto | Para qué |
> |---|---|---|
> | `IA_MAQUINAS_CON_HISTORIA` | `LIN/1` | Qué máquinas tienen historia de verdad. Era una constante; ahora se declara |
> | `IA_TURNOS` | *(vacío)* | `manana=6-14,tarde=14-22,noche=22-6`. **Vacío a propósito**: un turno inventado devolvería datos reales de horas equivocadas, el peor fallo posible aquí. Sin configurar, preguntar por un turno responde que no lo está |
>
> `IA_MAQUINAS_CON_HISTORIA` es lo que desbloqueó la tendencia multi-día sin
> esperar a que nadie marque «Is Collected»: la restricción se declara en vez de
> descubrirse a media respuesta.
>
> ### En el panel
>
> Reintentar el último turno cuando acabó en nada —el 409, el corte por tiempo,
> la cancelación—, porque reescribir la pregunta a mano tras esperar minuto y
> medio es la peor forma de perder ese minuto y medio. Cancelar deja de contar
> como error y se pinta en gris: es una decisión del usuario, no una avería. Y
> debajo de cada respuesta se dice ahora **con qué** se consultó —máquina y
> período, en crudo—, que es lo que delata una consulta hecha sobre la máquina
> equivocada.
>
> Una exclusión nueva en el hilo, hermana de las del §3.3: **la respuesta
> cancelada a medias**. El corte cae a menudo dentro de una cifra («el OEE fue
> del 6») y esa cifra a medias es justo la que el modelo citaría después.
>
> ### Dos cosas que aparecieron al comprobar, y no estaban previstas
>
> 1. **`verificar-catalogo.mjs` y `verificar-historia.mjs` llevaban rotos desde
>    el Plan 6.** El movimiento a `shared/` los dejó importando de
>    `react-dashboard/src/lib/iconics/`, que ya no existe: fallaban en el primer
>    `import`. No lo cazó nadie porque son los dos únicos guiones que necesitan
>    ICONICS levantado, así que no entran en ninguna suite. Es el precio de una
>    comprobación que no se puede automatizar.
> 2. **La descripción de `datos_de_maquina` seguía invitando a llamar a
>    `listar_maquinas`.** Las descripciones son lo único que el modelo lee para
>    decidir, así que le pedía por escrito justo lo que la retirada quería
>    impedir. El registro devuelve las válidas y el turno se recupera, pero se
>    va una pasada entera del modelo en ello.
>
> **Lo que sigue sin comprobar:** una conversación real contra este catálogo
> nuevo con el modelo cargado. Todo lo verificable sin él está en verde, y el
> servidor real confirma hoy lo de siempre —los 7 tags de LIN/1 con sus 24
> muestras del día, y las otras nueve sin recolectar—.

Séptimo plan. No arregla nada roto: el asistente del Plan 6 hace bien lo que
sabe hacer. Lo que amplía es **cuánto sabe hacer**.

La tesis, en una frase: **el asistente no falla por el modelo, falla por lo que
no le hemos dado.** El 4B acierta la herramienta el 100 % de las veces que la
herramienta existe —3/3 en el banco de referencia, con argumentos idénticos a
los del 9B—. Lo que no puede es preguntar dos veces seguidas, ni mirar la
planta entera.

**Convención de esfuerzo:** ▁ bajo (horas) · ▄ medio (días) · █ alto (semanas).

---

## 1. Qué se puede preguntar hoy

| Pregunta | Hoy |
|---|---|
| «¿Cómo está la Línea 1?» | ✅ `estado_actual` |
| «¿OEE de la Línea 1 el 30 de julio?» | ✅ `oee_de_maquina` |
| «Compara el 29 y el 30 en la Línea 1» | ✅ `comparar_dias` |
| «¿Qué máquinas hay?» | ✅ `listar_maquinas` |
| **«¿Y el día anterior?»** | ❌ no hay memoria |
| **«¿Y la Línea 2?»** | ❌ no hay memoria |
| **«¿Cómo va la planta?»** | ❌ no hay herramienta de planta |
| **«¿Qué máquina va peor?»** | ❌ lee de una en una |
| **«¿Y ayer?»** | ⚠️ el modelo tiene que calcular la fecha |
| «¿Qué alarmas tuvo?» | ❌ ninguna herramienta las toca |
| «¿Cómo ha ido la semana?» | ❌ no hay tendencia multi-día |

Las cuatro primeras en negrita son las que trata este plan. Las dos últimas
esperan a la Fase B (§5), y el porqué es la parte importante de este documento.

---

## 2. El hueco que domina: cada pregunta es una isla

En [`backend/ia/chat.mjs`](../backend/ia/chat.mjs), el bucle construye la
conversación así:

```js
const messages = [
  { role: 'system', content: instrucciones(catalogo) },
  { role: 'user', content: pregunta },
]
```

No hay turno anterior. Ninguno. Un operador que pregunta por la Línea 1 y
después escribe «¿y la 2?» recibe una respuesta sobre nada, porque para el
modelo esa frase llega sin contexto.

**Y es la forma natural de hablar.** Nadie repite «¿cuál fue el OEE de la Línea
1 el 30 de julio de 2026?» cambiando una palabra; se pregunta una vez y luego
se tira del hilo. Mientras eso no funcione, cada consulta cuesta una frase
completa y la gente deja de explorar.

Lo que lo hace la primera fase no es solo el valor, es la relación: el frontend
**ya guarda** la conversación en `useAsistente`. Es mandarla y acotarla.

---

## 3. Fase A · Memoria de conversación

### 3.1 · Qué se manda, y qué no

`POST /api/chat` acepta un `historial` además de la pregunta:

```json
{ "pregunta": "¿y el día anterior?",
  "historial": [
    { "rol": "usuario",   "texto": "¿OEE de la Línea 1 el 30 de julio de 2026?" },
    { "rol": "asistente", "texto": "El OEE de la Línea 1 el 30 de julio fue del 61,9 %." }
  ] }
```

**Va el TEXTO de los turnos, nunca el JSON de las herramientas.** Es la
decisión que hay que respetar aunque parezca conservadora: devolver los
resultados crudos de consultas anteriores invita al modelo a mezclarlos con la
pregunta nueva y a citar la cifra del turno pasado como si fuera la de este.
El texto ya dice lo que hay que saber para entender el hilo, y no se puede
confundir con un dato recién leído.

### 3.2 · El tope, y por qué existe

**Cuatro turnos.** No es una cifra bonita: la primera pasada —la que elige la
herramienta— es la cara del bucle (2,3-3,6 s medidos), y crece con el prompt.
Un historial sin tope convierte una conversación larga en una lenta,
exactamente al revés de lo que la gente espera.

El tope se aplica en el **backend**, no en el frontend. Un cliente que mande
cincuenta turnos no puede degradar el servicio para el resto de pantallas.

### 3.3 · Los turnos que NO entran

- Los que se **bloquearon** por venir sin herramienta. Meter en el historial
  una respuesta que se decidió no dar es contradecirse.
- Los que acabaron en **error**. No aportan hilo y gastan prompt.
- El texto de la **red de seguridad** cuando el modelo no redactó, que es
  nuestro y no suyo.

### 3.4 · Fechas relativas

La memoria hace esto urgente, no opcional: en cuanto se puede preguntar «¿y
ayer?», el modelo tiene que resolver una fecha relativa — y un 4B lo va a
fallar.

El arreglo es el mismo patrón que ya usan los nombres de máquina, y conviene
enunciarlo como regla: **resolver es trabajo del backend; elegir es trabajo del
modelo.** `oee_de_maquina` pasa a aceptar `fecha: "ayer"`, `"anteayer"`,
`"hoy"` y los días de la semana, y los convierte en `validarFecha()` con la
misma zona horaria local que usa el resto del historiador.

`herramientas.mjs` ya resuelve «Línea 1» → `LIN/1` por esta misma razón; esto
es cerrar la simetría que faltaba.

---

## 4. Fase B · Saber qué se pregunta

Es la fase más barata del plan y la que decide las siguientes.

Hoy se registra la herramienta y si funcionó, pero **no la pregunta**:

```
INFO Chat respondido herramienta=null bloqueada=false duracionMs=31927
```

Esa línea —real, de la primera sesión con el 9B— no permite saber qué se
preguntó ni por qué no hizo falta herramienta. Añadiendo el texto:

| Campo | Para qué |
|---|---|
| `pregunta` | Qué se pidió de verdad |
| `herramienta` | Si hubo consulta y cuál |
| `ok` | Si el dato existía |
| `bloqueada` | Si el modelo intentó recitar |
| `duracionMs` | Ya está |

El log del backend ya sale en **JSON estructurado** fuera de TTY
(`logger.mjs`), así que no hace falta infraestructura nueva: una semana en
planta y un `Select-String` dicen qué herramienta falta, con datos en vez de
con intuición.

> **Sobre el contenido.** Son preguntas sobre máquinas, no datos personales.
> Aun así es texto que escribe una persona y acaba en un log del servidor:
> conviene decidirlo a propósito y no descubrirlo después.

---

## 5. Fase C · La planta entera

**El número grande del tablero es invisible para el asistente.** El OEE de
planta, sus tres factores y el reparto por área —lo primero que mira cualquiera
que se pone delante del panel— no se pueden preguntar.

### 5.1 · Reutilizar, no recalcular

El cálculo existe y tiene criterio: en
[`plantModel.js`](../react-dashboard/src/features/dashboard/lib/plantModel.js),
`buildPlantSummary()` documenta por qué los factores se promedian sin ponderar,
por qué el OEE de planta es D×R×C de los agregados y no la media de los OEE, y
por qué el FTY difiere de la calidad media. Tiene además prueba de referencia
congelada (`plantModel.golden.test.js`).

Recalcularlo en el backend produciría **dos cifras de planta distintas**, y la
del chat contradiría la de la pantalla que el operador tiene delante. Eso no es
un bug menor: es exactamente lo que destruye la confianza en el asistente.

Así que se mueve a `shared/`, como el resto del Plan 6:

| Se mueve | Nota |
|---|---|
| `buildPlantSummary`, `summaryByArea` | Puras |
| `lib/shiftModel.js` | Lo arrastra `buildPlantSummary` (`tiemposTurno`) — **es el trabajo real de la fase** |

`plantTrend` y `productionTrend` **no** se mueven: dependen de
`getMachineHistory`, que genera series simuladas, y no tienen nada que hacer en
una respuesta del asistente.

### 5.2 · Una herramienta, gruesa

```
estado_de_planta()  →  OEE de planta, D/R/C, producción y rechazos,
                       resumen por área, y el ranking de las 10 máquinas
```

**Gruesa a propósito.** Tres herramientas finas —`oee_de_planta`,
`peor_maquina`, `resumen_por_area`— responderían lo mismo y triplicarían las
ocasiones de que el 4B elija mal. Con una que lo devuelve todo, «¿cómo va la
planta?» y «¿qué máquina va peor?» son la misma llamada y el modelo solo tiene
que redactar la parte que le preguntaron.

Es una lectura en lote de las 10 máquinas, y la caché de `readPoints()` ya
colapsa esa ráfaga con lo que estén pidiendo las pantallas.

---

## 6. Lo que NO se construye todavía

No por falta de valor, sino porque la Fase B existe justamente para no
adivinarlo:

| Idea | Qué falta antes |
|---|---|
| **Alarmas** | El cliente ya tiene `readAlarmHistory`, pero el direccionamiento `ae:` está en `docs/TAGS.md` con **un solo ejemplo y sin verificar**. Hay que comprobar contra el servidor que esos puntos responden — o se repite la historia de las nueve máquinas sin historizar |
| **Tendencia multi-día** | `readDailyOee` existe en el transporte del frontend. Pero solo `LIN/1` tiene historia, así que hoy respondería de una máquina de diez |
| **Comparar dos máquinas** | Mismo problema: comparar históricos exige historia en las dos |
| **Turnos** | No hay tag de turno en el catálogo; habría que darlo de alta en el servidor primero |

Las tres primeras se desbloquean solas el día que alguien marque «Is Collected»
en el resto de máquinas. Conviene no construirlas antes.

---

## 7. Invariantes que NO pueden regresar

Las seis del [Plan 6](PLAN-6-IA-LOCAL.md) siguen vigentes. La memoria añade dos:

1. **Una respuesta bloqueada o fallida no entra en el historial.** Si entrara,
   el modelo la trataría como algo que ya dijo y construiría sobre ella.
2. **El historial se acota en el servidor.** Un cliente no puede alargar el
   prompt indefinidamente ni degradar el servicio de las demás pantallas.

Y una que hay que **vigilar**, porque la memoria la pone a prueba:

3. **Toda cifra sigue viniendo de una herramienta.** Con historial, el modelo
   tiene cifras a la vista en su propio contexto y la tentación de repetirlas
   sin consultar es nueva. La red del Plan 6 ya lo cubre —una respuesta con
   cifras y sin herramienta no sale—, pero conviene comprobar que sigue
   disparándose en el caso nuevo, y que **no** se dispara de más (§9, R-2).

---

## 8. Fases

| # | Fase | Entregable | Esfuerzo |
|---|---|---|---|
| **A** | Memoria y fechas relativas | `historial` en `/api/chat`, tope en servidor, turnos excluidos, `fecha: "ayer"` resuelta en el backend | ▄ |
| **B** | Registro de preguntas | La pregunta en el log estructurado | ▁ |
| **C** | La planta entera | `shared/plantModel.js` + `shared/shiftModel.js`, herramienta `estado_de_planta` | ▄ |

**El orden importa.** B va **antes** que C aunque C valga más: son horas, y
empieza a recoger datos mientras se construye lo demás. Un mes de registro
vale más que cualquier discusión sobre qué herramienta hace falta.

### Verificación por fase

| Fase | Cómo se comprueba |
|---|---|
| A | `verificar-chat.mjs` — turnos que sí y que no entran, el tope, la resolución de fechas relativas. Y **medir** cuánto crece la primera pasada con 4 turnos |
| B | Una pregunta real y su línea de log completa |
| C | `verificar-herramientas.mjs` con el cliente falso; y que el OEE de planta del chat **coincida con el del tablero**, que es la razón de moverlo en vez de recalcularlo |

Todo con el modelo apagado, salvo la medición de A.

---

## 9. Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| **R-1** | El historial ralentiza la primera pasada y una conversación larga se arrastra | Tope de 4 turnos y medición al cerrar la Fase A. Si crece de más, se baja el tope antes que quitar la memoria |
| **R-2** | La memoria dispara **bloqueos de más**: el modelo repite una cifra que él mismo dijo y la red del Plan 6 lo corta | Es la cara incómoda de la invariante 3. Hay que medirlo con conversaciones reales antes de tocar nada: relajar la regla es peor que un bloqueo ocasional |
| **R-3** | El modelo contesta un seguimiento con el dato viejo en vez de volver a consultar | Por eso el historial lleva solo texto y no resultados de herramienta (§3.1) |
| **R-4** | Mover `shiftModel` a `shared/` rompe el tablero | Misma receta que el Plan 6: fase aislada, sin cambio de comportamiento, con `plantModel.golden.test.js` como red |
| **R-5** | La cifra de planta del chat difiere de la del tablero | Es el motivo de reutilizar `buildPlantSummary`. Tiene comprobación propia en la Fase C |
| **R-6** | Añadir herramientas degrada la elección del 4B | Una sola herramienta nueva, y gruesa. Si la Fase C empeora el banco de referencia del Plan 6, el problema es ése y no otro |
