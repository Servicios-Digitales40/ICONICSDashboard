# Plan 23 · Asistente

> **Objetivo.** Que el bucle del asistente deje de confiar a ciegas en lo que
> el modelo manda, se defienda a sí mismo de repetir trabajo entre turnos, y
> cubra las cuatro consultas que hoy exigen encadenar varias herramientas a
> mano. Ocho entregas: `IA-02`, `IA-04`, `IA-05`, `IA-06`, `IA-07`, `IA-08`,
> `IA-09`, `IA-10`.

> **De dónde sale.** De `docs/HOJA-DE-RUTA-60-MEJORAS.md`, Plan 23. Ninguno de
> sus puntos necesita red a la planta: sólo `llama-server`, que con
> `ICONICS_FAKE=true` se puede tener sin GPU dedicada para el desarrollo
> offline y con GPU real para medir contra el modelo (`medir-asistente.mjs`).

> **Rama.** `Moises7`, sacada de `IntegracionMoises6Gustavo5` (commit `ed89864`)
> el 11-09-2026.
>
> Este plan se escribió sobre `Mejoras-Demo-6.0`, pero esa rama se quedó atrás:
> su punta es `8a9ef8d` y el trabajo real siguió por `IntegracionMoises6Gustavo5`
> (Plan 22.5, ya cerrado). Ejecutarlo sobre la rama donde se escribió habría
> significado aplicarlo a un árbol sin la integración de Gustavo5.

> **ESTADO — SIN EMPEZAR (10-09-2026).** Este documento es el plan, no su
> ejecución. La investigación previa a cada una de las ocho entregas sí está
> hecha —contra el código real, no supuesta— y es la base de cada fase.
>
> **Revisado contra el código el 11-09-2026.** Los cinco hallazgos de la §0
> siguen siendo ciertos, archivo y línea incluidos. Se corrigieron cinco
> desajustes de detalle —marcados abajo con su fecha— que no cambian ninguna
> fase pero sí lo que hay que creerse al leerlas.
>
> (Este bloque decía «las ocho investigaciones de la §0». La §0 tiene **cinco**
> hallazgos numerados, no ocho; el ocho son las ENTREGAS. Se arregla porque es
> justo el tipo de contradicción interna que `verificar-instrucciones.mjs`
> existe para atrapar en el prompt, y aquí estaba en el plan.)

---

## 0 · Lo que ya se investigó, y por qué cambia el plan

Antes de escribir una fase se leyó el código real de `chat.mjs`,
`definiciones.mjs`, `herramientas.mjs`, `medir-asistente.mjs` y `config.mjs`.
Cinco hallazgos concretos, con archivo y línea, que fijan el alcance de abajo:

1. **El bucle ya tiene una guarda anti-repetición, pero sólo dura el turno.**
   `firmaDe()` + `firmasVistas` (`chat.mjs` líneas 749-772, 1042) evita
   re-ejecutar una llamada idéntica DENTRO del mismo turno — le devuelve al
   modelo una nota (`yaConsultado: true`) en vez de volver a golpear ICONICS.
   Es exactamente el mecanismo que `IA-06` necesita extender más allá del
   turno; no hay que inventarlo desde cero, hay que hacerlo sobrevivir.

2. **El JSON Schema de las 22 herramientas es sólo para el modelo — nada lo
   valida en el backend.** `definiciones.mjs` manda `parameters` a
   llama-server como `tools` (`chat.mjs` líneas 903-905), pero
   `herramientas.mjs` (`ejecutar()`, líneas 1032-1046) llama la función
   directo con lo que el modelo mandó, sin verificar tipos ni campos
   requeridos. Cada herramienta valida a mano lo que le importa —ejemplo,
   `controlar_bomba` con `typeof encender !== 'boolean'`
   (`herramientas/maquina/index.mjs` línea 231)— y **Zod ya existe en el
   proyecto** para esto exacto: `ControlBombaSchema` en `http/esquemas.mjs`
   valida el mismo campo `encender` para la ruta HTTP del botón físico, sin
   que la herramienta del asistente lo reutilice. `IA-04` no introduce Zod,
   destapa por qué dos caminos al mismo dato tienen dos calidades de
   validación distintas.

3. **No hay streaming de la primera pasada, y es a propósito, no un olvido.**
   `pasadaConHerramientas()` (`chat.mjs` línea 905) fija `stream: false`
   explícitamente; el comentario de cabecera (líneas 9-18) defiende que sea
   así de «gruesa» para minimizar el número de llamadas al modelo. `IA-05` no
   puede ser «activar streaming ahí» sin romper esa decisión — tiene que ser
   un progreso que no dependa de leer tokens parciales de una respuesta que
   sigue llegando entera.

4. **La memoria de turno anterior es deliberadamente sólo texto.**
   `historialAMensajes()` (línea 79-89) convierte los últimos 8 mensajes a
   `user`/`assistant`, y el comentario (líneas 68-73) explica que los
   RESULTADOS de herramientas de turnos previos nunca entran, para que el
   modelo no mezcle cifras de un turno con la pregunta de otro. `IA-07`
   («memoria del foco») tiene que respetar esa frontera: puede recordar DE
   QUÉ se hablaba —qué señal, qué sistema— sin resucitar el dato viejo.

5. **`controlar_bomba` no anota en el diario de accionamientos (SEG-08).**
   `backend/lib/diario.mjs` sólo lo importa `controlRoutes.mjs` (el botón del
   tablero); la herramienta del asistente en
   `backend/ia/herramientas/maquina/index.mjs` no lo toca. Hoy una bomba
   encendida por el chat no queda en el diario que existe justo para
   responder «¿qué se le hizo a la instalación?» meses después. Es un hallazgo
   colateral de investigar `IA-10`, y entra en su alcance porque es el mismo
   patrón (una línea persistente, JSONL, con poda) aplicado a un hueco real.

## 0.1 · El criterio de orden

Offline y sin dependencias primero; lo que exige medir contra el modelo real,
después; lo que más cambia el contrato de la herramienta, al final.

```
F0 IA-04 (validación)  →  F1 IA-06 (caché)  →  F2 IA-07 (foco)
   →  F3 IA-09 (herramientas nuevas)  →  F4 IA-02 (auditoría real)
   →  F5 IA-05 (progreso)  →  F6 IA-10 (registro)  →  F7 IA-08 (router)
```

- **F0 primero** porque valida lo que entra: si una llamada mal formada se
  detecta antes de ejecutar la herramienta, todas las fases siguientes
  trabajan sobre argumentos ya limpios.
- **F1 y F2 antes que F3** porque las cuatro herramientas nuevas de F3 son
  candidatas naturales a beneficiarse de la caché y del foco — construirlas
  después evita que hereden el problema que F1/F2 resuelven.
- **F4 (IA-02) necesita que F0-F3 ya estén cerradas**: auditar cifras contra
  el modelo real con herramientas que todavía cambian de forma sería medir un
  blanco móvil.
- **F5 (progreso) y F6 (registro) son observabilidad pura**, sin relación de
  dependencia entre sí ni con lo anterior — van después porque no bloquean
  nada y no hay prisa en tenerlas antes que la validación o la caché.
- **F7 (router de modelo) va al final** porque su mayor restricción de diseño
  (§7) depende de cómo hayan quedado F1/F2: un router que cambia de modelo a
  media conversación necesita saber qué de la memoria de foco/caché sobrevive
  al cambio.

## 0.2 · Cómo se comprueba cada fase

Sin servidor de IA:
```bash
npm run lint && npm run types && npm run verificar
node backend/... # el verificador específico de cada fase, listado abajo
```

Con `llama-server` (para F4, F5, F7 — las que se miden contra el modelo real):
```bash
node --env-file=.env.local scripts/medir-asistente.mjs
```
No es un verificador y no da código de error — mide. `IA-02` es precisamente
la fase que le añade dientes a esta medición.

---

## 1 · F0 — `IA-04`: validar argumentos de herramienta con Zod

**Qué hace hoy.** `herramientas.mjs` ejecuta `fn(argumentos)` con lo que el
modelo mandó, tal cual venga del `JSON.parse` de `chat.mjs` (línea 1099-1112,
que además cae a `{}` en silencio si el JSON viene roto). Cada herramienta
valida lo suyo, a mano, con la calidad que a quien la escribió le pareció
necesaria en ese momento.

**Qué cambia.** Un esquema Zod por herramienta, colocado junto a su
`DEFINICIONES` (mismo archivo o uno hermano — decidir al implementar si
`definiciones.mjs` pasa a exportar también el esquema de validación, para que
las dos formas del mismo contrato —la que lee el modelo y la que valida el
backend— no puedan divergir por accidente). La validación corre en
`ejecutar()`, antes de llamar a la función real:

- Si falla, se devuelve un `fallo(...)` con el mismo formato que ya usan las
  herramientas para errores de negocio — el modelo lo lee igual que
  cualquier otro fallo, no como una excepción distinta.
- `controlar_bomba` es el caso de prueba obligado: migrar su `typeof
  encender !== 'boolean'` a un esquema Zod, y decidir si ese esquema se
  DERIVA de `ControlBombaSchema` (`http/esquemas.mjs`) o si se declara aparte
  a propósito — son dos entradas al mismo campo con consecuencias iguales
  (escribe en la planta), y que compartan la validación es lo que evita que
  una se endurezca y la otra se quede atrás.

**Lo que NO resuelve.** No valida el *significado* de un argumento (que
`sistema="tanque"` sea correcto para esa pregunta) — eso sigue siendo trabajo
del resolvedor de nombres (`resolverSenal`, `resolverSistema`). Zod valida
FORMA (tipos, campos requeridos, enums), no intención.

**Pruebas.** Un caso por herramienta con argumento de tipo equivocado, uno con
campo requerido ausente, uno válido — sobre las 22. Extiende
`scripts/verificar-herramientas.mjs`.

> **HECHA el 11-09-2026.** `ESQUEMAS` (22, en `definiciones.mjs` junto a
> `DEFINICIONES`) + validación en `ejecutar()`. Verde: 147 comprobaciones en
> `verificar-herramientas.mjs`, los 27 verificadores, 299 pruebas de backend,
> lint y tipos. Tres decisiones que el plan dejaba abiertas, y una que corrige:
>
> **1 · `controlar_bomba` DERIVA de `ControlBombaSchema`**, no declara el suyo.
> Son las dos puertas al único punto que escribe en la planta —el botón por
> `POST /api/control/bomba` y el asistente— y ahora comparten esquema y
> mensajes. El acoplamiento `ia/` → `http/esquemas.mjs` es real y se acepta a
> cambio de que endurecer una no deje la otra atrás.
>
> **2 · Un requerido ausente NO lo rechaza la validación.** Es la corrección
> al plan tal y como estaba escrito. `estado_del_sistema({})` ya contestaba
> «hay que decir de qué sistema» **con la lista de ids válidos dentro**, y
> `diagnosticar_falla` sin `riesgoId` remite a `riesgos_activos`. Interceptar
> eso con un «falta el campo sistema» genérico cambia un error del que el
> modelo se recupera por otro del que no: se rechazaría antes y se contestaría
> peor. Se para la FORMA imposible (`encender: "sí"`, una cadena donde va una
> lista); la pregunta incompleta sigue siendo del dominio. Dos pruebas la
> fijan, para que nadie la revierta por parecer más estricta.
>
> **3 · Los rangos no se tocan.** `dias` y `horizonteMinutos` ya se recortan
> donde se usan (`Math.max(1, Math.min(90, …))`). Un `.max(90)` en el esquema
> convertiría un `dias: 500` —que hoy contesta con 90— en un rechazo: cambiar
> el comportamiento con la excusa de validarlo. Zod valida forma, no rango.
>
> **Hallazgo colateral:** Zod 4 ya no publica `received` ni `input` en el
> issue, así que «ausente» y «tipo equivocado» llegan idénticos salvo por el
> final del mensaje en inglés. Distinguirlos por esa cadena ataría el
> comportamiento a la redacción de una dependencia, así que se mira el
> argumento que nos mandaron. Por el mismo motivo el mensaje dice el tipo que
> llegó de verdad: leyendo `received` decía «llegó vacío» de un `dias:
> "muchos"` que había llegado como texto.

---

## 2 · F1 — `IA-06`: caché entre turnos

**Qué hace hoy.** `firmasVistas` (`chat.mjs` línea 1042) vive dentro de
`responder()`: nace y muere con el turno. Preguntar dos veces «¿cómo está el
tanque?» en la misma conversación relee ICONICS las dos veces.

**Qué cambia.** La misma firma (`firmaDe()`, ya escrita) como clave de una
caché con **tiempo de vida corto y explícito** — no eterno: un valor de
ICONICS de hace cinco minutos citado como «ahora mismo» sería inventar
frescura que no hay. El tiempo de vida depende de la naturaleza del dato:

| Tipo de llamada | Vida sugerida | Por qué |
|---|---|---|
| `estado_del_sistema`, `riesgos_activos` | ~10-15 s | Tiempo real: caduca casi de inmediato |
| `historia_de_senal`, `analisis_de_senal`, `perfil_de_senal` sobre un período YA CERRADO (p. ej. «ayer») | el resto de la conversación | El pasado no cambia |
| `historia_de_senal` sobre un período que incluye «ahora» | igual que tiempo real | Sigue creciendo |
| `sistemas_de_la_planta`, `limites_del_manual` | toda la sesión del proceso | No dependen de un instante |

La caché vive por **conversación**, no por proceso: dos pestañas del tablero
preguntando lo mismo no deben compartir caché, porque nada en el turno
identifica hoy de qué conversación viene una llamada salvo el `historial` que
manda el cliente — hay que decidir al implementar si se deriva un id de
conversación (hash del primer turno, o un id que el frontend ya genere) para
no filtrar caché entre usuarios distintos del mismo backend.

**Lo que NO resuelve.** No cachea across-conversación (dos personas
preguntando lo mismo a la vez no comparten caché) — eso sería un cambio de
alcance mayor (caché compartida = superficie de fuga de datos entre sesiones)
que este plan no abre.

**Pruebas.** Dos preguntas idénticas en el mismo turno YA están cubiertas por
`firmasVistas`; el caso nuevo es la misma pregunta en el TURNO SIGUIENTE de la
misma conversación, con y sin que haya pasado el tiempo de vida.

> **HECHA el 11-09-2026.** `cacheDeConsultas` en la clausura de `createChat`,
> con `ejecutarConCache` dentro de `responder()`. Verde: 51 comprobaciones en
> `verificar-chat.mjs` (5 nuevas), los 27 verificadores, 299 pruebas de backend,
> lint y tipos.
>
> **1 · El id lo manda el cliente, y es la decisión de la fase.** `ChatSchema`
> gana un `conversacionId` **opcional**; el tablero lo genera junto al hilo en
> `persistencia.js` (`localStorage`, misma vida que la conversación) y muere
> con `borrar()`. La alternativa —derivarlo del historial en el backend— se
> descartó con el código delante: el bucle sólo ve los OCHO últimos turnos
> (`historialAMensajes`), así que el hash del «primer turno» cambia solo en
> cuanto la conversación se alarga, y la caché dejaría de acertar justo en las
> conversaciones largas **sin un error que lo delate**. Además dos pestañas que
> empiezan con la misma pregunta compartirían clave, que es la fuga entre
> sesiones que el §9 dice no abrir.
>
> Sin id no hay caché y todo funciona como antes: un cliente viejo, o un
> navegador que no puede guardar nada, no se entera.
>
> **2 · Lo que NUNCA entra en la caché**, y está probado: las de
> `HERRAMIENTAS_DE_ESCRITURA` —servir un `controlar_bomba` de caché sería
> contestar «bomba encendida» sin tocar la planta—, los fallos —una avería de
> red pasajera se volvería una respuesta fija durante media hora— y las notas
> de repetición, que no son un dato.
>
> **3 · La vida la decide la VENTANA, no la herramienta.** Se le pregunta a
> `resolverVentana` —importado, no reinterpretado aquí— y se compara su `fin`
> contra `limits.historyCacheMargenMs`, el mismo criterio de `tramoCerrado()`
> en `iconics/client.mjs`. «Ayer» no puede cambiar y vive 30 min; «las últimas
> 6 horas» termina en ahora y vive 15 s. Tres knobs nuevos:
> `IA_CACHE_VIVO_MS`, `IA_CACHE_CERRADO_MS`, `IA_CACHE_MAX`.
>
> El patrón es el de `historyCache`: `Map` con `{expiraEn, valor}`, poda de lo
> caducado y, si sobra, de lo más viejo. No se inventó infraestructura.

---

## 3 · F2 — `IA-07`: memoria del foco

**Qué hace hoy.** Nada. `historialAMensajes()` da al modelo el TEXTO de los
turnos anteriores y una regla (`REGLAS`, línea 433-436) que le pide
"resolver a qué señal y a qué momento se refieren" sin ayuda mecánica. Si el
modelo lo resuelve mal, no hay red de seguridad.

**Qué cambia.** Un campo de estado por conversación —no por turno— con la
última señal y el último sistema mencionados explícitamente (por el usuario o
citados por una llamada a herramienta exitosa). Se pasa como un hecho, no
como una sugerencia:

```
"El turno anterior habló de: señal=nivelTanque, sistema=tanque.
Si esta pregunta no nombra una señal ni un sistema, es MUY probable
que se refiera a estos. Si el usuario dice «y la presión», resuelve
la señal (presión) pero mantén el sistema (tanque) salvo que la nueva
señal exista en otro."
```

Esto es prosa nueva en las instrucciones del turno (no en `REGLAS`
permanentes — `REGLAS` es para lo que aplica siempre; el foco cambia cada
turno), construida en `chat.mjs` a partir del ÚLTIMO resultado de herramienta
exitoso del turno anterior — nunca su valor, sólo su identidad (qué señal, qué
sistema), respetando el hallazgo §0.4: los resultados de turnos previos no
resucitan.

**Lo que NO resuelve.** No es una memoria semántica general ("de qué se ha
hablado en toda la conversación") — es literalmente "cuál fue la última señal
y el último sistema", lo mínimo que hace que "¿y ayer?" o "¿y la presión?"
funcionen sin que el usuario repita el sustantivo completo cada vez.

**Pruebas.** Conversación de 2 turnos: "¿cómo está el nivel del tanque?"
seguido de "¿y hace tres horas?" sin nombrar la señal — la segunda llamada
tiene que resolver a `nivelTanque`/`tanque` sin que el modelo tenga que
adivinarlo solo del texto.

> **HECHA el 11-09-2026.** `focoDeConversacion` en la clausura de `createChat`,
> `instrucciones()` con un cuarto argumento opcional, y `textoDelFoco()` con la
> prosa. Verde: 56 comprobaciones en `verificar-chat.mjs` (5 nuevas), los 27
> verificadores, 299 pruebas de backend, lint y tipos.
>
> **1 · La identidad sale del RESULTADO, no de los argumentos.** El modelo
> escribe «nivel» o «el nivel del tanque»; lo que conviene recordar es a qué
> resolvió eso, y el resultado ya lo trae con su nombre de catálogo
> (`meta.label`). Se toma el ÚLTIMO resultado con identidad del turno: si la
> pregunta encadenó estado y luego historia de otra señal, de lo que se acabó
> hablando es de lo último.
>
> **2 · Un turno sin herramientas no borra el foco.** Preguntar «¿y eso es
> grave?» no cambia de qué se estaba hablando. Tampoco lo fija una consulta que
> falló: si no salió, no se llegó a hablar de nada.
>
> **3 · Vive donde la caché de F1 y se poda igual** —clave por conversación,
> mismo tope—: es el mismo tipo de estado y tiene el mismo riesgo si crece sin
> techo o si se comparte entre pantallas. Sin `conversacionId` no hay foco,
> igual que no hay caché.
>
> **La frontera del §0.4, probada:** el bloque del foco no contiene ni un
> dígito. Recordar de qué se hablaba no reabre la puerta que
> `historialAMensajes` cierra; recordar cuánto medía, sí.

---

## 4 · F3 — `IA-09`: las cuatro herramientas nuevas

**Decisión de alcance.** `docs/MEJORAS-ASISTENTE.md` (28-08-2026) propone
siete candidatas (B4-B10); revisado contra el código de hoy, B4
(`estado_de_alarmas`) quedó **parcialmente cubierta** de forma indirecta, por
dos vías DISTINTAS según la máquina, y no hay herramienta dedicada a SÓLO
alarmas ni a su historial. Las otras seis siguen totalmente vigentes. Este
plan construye estas cuatro:

> **Corregido el 11-09-2026.** Aquí se decía que «`estado_del_sistema` ya
> expone las alarmas reales del PLC desde el Plan 27», y eso mezclaba dos
> cosas que no son la misma:
>
> · **Vibraciones** sí trae contadores del **servidor de alarmas de ICONICS**
>   (`activasSinReconocer`, `activasReconocidas`, `normalSinReconocer`) —
>   `shared/eva/vibraciones/estadoVibraciones.js` línea 251.
> · **El tanque** no tiene nada de eso. Lo del Plan 27 F3 es otra cosa: las
>   ocho señales de `ALARMAS/` con `naturaleza: "alarma"`, que son **bits del
>   PLC** juzgados por polaridad en `shared/eva/tanque/estado.js` línea 141.
>   Para ese árbol el aviso de `herramientas/lib/formato.mjs` línea 111 sigue
>   diciendo, hoy, que «el servidor **no** publica alarmas para este árbol».
>
> La decisión (no construir la herramienta en este plan) no cambia. Pero el
> motivo escrito era inexacto justo en la frase que la deja fuera, y una
> herramienta de alarmas de verdad tendría que resolver esa asimetría entre
> las dos máquinas antes que nada — no es un envoltorio de algo ya uniforme.

### 4.1 · `tendencia_multiple`

**Por qué primero.** Causó un fallo real y medido: una pregunta el
28-08-2026 agotó las rondas de `IA_MAX_PASOS` pidiendo varias señales una por
una en vez de en un viaje. `historia_de_senal` sigue siendo de UNA señal
(`definiciones.mjs` línea 351) — no cambió desde entonces.

> **Corregido el 11-09-2026.** Aquí decía «`IA_MAX_PASOS` (4×2)». El valor por
> defecto es **3** (`config.mjs` línea 179, `DEFAULTS.iaMaxPasos`), y el tope
> de herramientas por turno es `IA_MAX_PASOS*2` — o sea 3×2 con la config de
> hoy. El 4 venía de la medición del 28-08, con otro valor puesto a mano; tal
> y como estaba escrito parecía describir la configuración actual.

**Forma.** Mismo patrón que `correlacionar_senales` (que ya acepta un array
`senales` de 2 a 4): un array de nombres, un período, devuelve el resumen de
cada una por separado — a diferencia de `correlacionar_senales`, sin
coeficiente ni cruce, porque la pregunta que la motiva es "¿cómo van estas
tres?", no "¿se mueven juntas?".

### 4.2 · `resumen_de_turno`

**Por qué.** "Qué pasó en las últimas 8 h" hoy son 4-5 llamadas encadenadas:
`estado_del_sistema` + `riesgos_activos` + `historia_de_senal` de cada señal
relevante. Cada llamada de más es contexto gastado y una oportunidad de que
el modelo se pierda a media cadena.

**Forma.** Una herramienta que internamente llama a las piezas que ya existen
(reutiliza `leerMaquina`, `evaluarRiesgosDe`, y el ayudante de historia) y
devuelve un resumen ya compuesto: rango de cada señal con serie propia,
riesgos que estuvieron activos, tiempo en marcha/reposo. Mismo patrón que
`diagnostico` (herramienta compuesta que junta varias fuentes en una
llamada) — no una fuente de datos nueva, una composición de las que ya hay.

### 4.3 · `buscar_evento`

**Por qué.** "¿Cuándo fue la última vez que la presión bajó de X?" no se
puede preguntar hoy sin traerse la serie entera y que el MODELO la escanee —
que es exactamente lo que las reglas de veracidad prohíben (el modelo no
hace aritmética ni inspecciona series, cita lo que la herramienta ya calculó).

**Forma.** Recibe señal, condición (`por debajo de`/`por encima de`/`igual
a`), valor umbral, y un período de búsqueda; devuelve el primer/último
instante en que se cumplió, con su valor exacto. Se apoya en el mismo
ayudante de lectura de historia que `historia_de_senal`, agregando un
recorrido de la serie ya traída en vez de un cálculo estadístico.

### 4.4 · `comparar_maquinas`

**Por qué.** Comparar la misma magnitud entre el tanque y vibraciones hoy no
tiene atajo — hay que pedir el estado de cada máquina por separado y que el
modelo compare a ojo, que es aritmética informal sobre dos fuentes distintas.

**Forma.** Recibe una magnitud conceptual (p. ej. "temperatura", "corriente")
y resuelve en CADA sistema la señal que corresponde (reutilizando el
resolvedor de nombres de cada máquina), trae los dos valores/resúmenes y los
presenta lado a lado — nunca los resta ni calcula una diferencia: eso sería
inventar una magnitud que ninguna de las dos declaró comparable. La
salvaguarda de `correlacionar_senales` contra cruzar PLCs distintos NO aplica
aquí de la misma forma — comparar dos máquinas por magnitud es legítimo (dos
temperaturas se pueden poner una junto a otra); correlacionarlas causalmente
no lo es. La descripción de la herramienta tiene que decir esta distinción
explícitamente, o el modelo la usará para inferir causalidad entre máquinas.

**Lo que queda fuera de F3, anotado para después:** `espectro_de_vibracion`
(B9) — depende de habilitar el módulo SM 1281, no sólo de código, así que no
es una herramienta que este plan pueda completar por su cuenta — y
`exportar_datos` (B10) — menor urgencia medida, sin un fallo real que lo
empuje como a `tendencia_multiple`.

**Pruebas.** Las cuatro entran a `scripts/verificar-herramientas.mjs` con el
mismo rigor que las 22 existentes: casos de éxito, de señal no encontrada,
de período sin datos. `verificar-instrucciones.mjs` tiene que seguir en
verde con 26 herramientas en el registro.

> **PARCIAL — TRES DE CUATRO, el 11-09-2026.** `tendencia_multiple`,
> `buscar_evento` y `resumen_de_turno` están hechas: 162 comprobaciones en
> `verificar-herramientas.mjs` (11 nuevas), los 27 verificadores, 299 pruebas
> de backend, lint y tipos. El registro tiene **25**, no 26:
> `comparar_maquinas` sigue pendiente — ver abajo.
>
> **1 · El inventario literal sí había que tocarlo**, como avisaba §4: la lista
> de nombres a mano de `verificar-herramientas.mjs` y su título. Ahora dice
> «veinticinco». Las tres van al final de la familia de historia, que es el
> orden real del registro; se pensaron detrás de `correlacionar_senales` y el
> sitio se cedió al orden de verdad en vez de reordenar el objeto para que
> cuadrara con la intención.
>
> **2 · `resumen_de_turno` NO calcula «tiempo en marcha / en reposo»**, que el
> §4.2 mencionaba. Esta planta no publica un contador de marcha, y deducirlo
> del promedio de una señal sería una hipótesis presentada como medición — lo
> que el §2.5 del CLAUDE.md prohíbe. Compone lo que las piezas existentes ya
> saben decir, y declara la parte que falte en vez de darla por vacía.
>
> **3 · `tendencia_multiple` no devuelve correlación, y hay una prueba que lo
> exige.** Es la diferencia con su pareja: una contesta «¿cómo van?» y la otra
> «¿se mueven juntas?». Colar un coeficiente invitaría a leer una causa donde
> nadie preguntó por ninguna.
>
> **4 · Escribir esta fase destapó un fallo grave preexistente**, corregido
> aparte en su propio commit (`98fe465`): la guarda que impide cruzar las dos
> máquinas **no protegía el caso real**. 10 de las 42 etiquetas de vibraciones
> resolvían a una señal del tanque, porque el índice del tanque engancha
> «velocidad» dentro de «Velocidad eficaz · Lado acople» por contención, y a
> `sistemasDeSenal` sólo se le preguntaba cuando el índice NO resolvía. Así,
> `correlacionar_senales` cruzaba dos PLC y contestaba `ok: true` con la señal
> de la otra máquina renombrada. La prueba que lo cubría usaba claves técnicas
> (`vRMS_S1`), que no colisionan.
>
> De paso se deshizo una regresión del F0 de este mismo plan: el esquema
> `z.array()` había dejado inalcanzable la tolerancia a `senales: "nivel,
> presión"` que el 4B necesita, y la prueba escrita entonces **fijaba la
> regresión como si fuera lo correcto**.
>
> **5 · `comparar_maquinas` se DESCARTA de este plan** (11-09-2026), y con eso
> F3 cierra en tres de cuatro. No se queda a medias: las tres que entraron
> tenían un fallo real detrás, la que sale no lo tiene — el mismo criterio con
> el que este plan eligió cuatro de las siete candidatas y dejó fuera
> `exportar_datos` por «sin un fallo real que lo empuje».
>
> Los otros dos motivos, que sólo se supieron al construir las hermanas: es la
> única que resuelve el MISMO nombre en dos catálogos a la vez —justo donde
> vivía el cruce silencioso de `98fe465`, y el arbitraje de aquel commit
> resuelve el caso contrario al que ésta necesita—, así que pasa por B1/B3;
> y su uso correcto depende de que un modelo pequeño lea bien un matiz
> («compararlas sí, correlacionarlas no») del que depende la regla nº 1 del
> proyecto.
>
> Lo que se pierde es comodidad, no capacidad: «¿cuál está más caliente?» se
> contesta con dos llamadas y el modelo citando las dos cifras, que no es
> aritmética prohibida. Y desde F3 esas dos pueden ser dos `resumen_de_turno`.
>
> Queda anotada en `docs/MEJORAS-ASISTENTE.md` (B5) con su motivo, junto a
> `espectro_de_vibracion` y `exportar_datos`. Cuando B1 esté hecha, construirla
> será casi gratis.

> **Añadido el 11-09-2026 — el inventario es literal, y hay que tocarlo.**
> `verificar-herramientas.mjs` línea 2665 lleva un `check` cuyo TÍTULO dice
> «son veintidós herramientas, y sólo una escribe en la PLANTA» y cuya
> comprobación es un `assert.deepEqual` contra la lista de los 22 nombres
> **escritos a mano, en orden**. No es un recuento automático: añadir las
> cuatro de F3 sin actualizar esa lista Y su título deja el verificador en
> rojo por un desajuste que parece un fallo de implementación y no lo es.
>
> El orden de esa lista tampoco es libre: los comentarios de dentro explican
> que `sistemas_de_la_planta` abre y las de manuales cierran, a propósito.
> Las cuatro nuevas se colocan por familia, no al final por comodidad.
>
> Lo que sí sale solo es la invariante de que toda definición anunciada tenga
> implementación y al revés (línea 2832): esa compara `h.definiciones` contra
> `h.nombres` y no lleva número escrito.

---

## 5 · F4 — `IA-02`: auditar cifras tras redactar, contra el modelo real

**Qué hace hoy.** `medir-asistente.mjs` documenta su propio hueco en dos
comentarios (líneas 132-147, 172-181): el flujo SSE lleva qué herramienta se
llamó y con qué argumentos, pero NO su resultado, así que la auditoría de
cifras del guion se desactiva pasándole TODOS los números del texto como
válidos (línea 183-186) — hoy no puede fallar nunca, lo cual anula de facto
la comprobación de invención de cifras contra el modelo real.

**Qué cambia.** Exactamente lo que el propio comentario recomienda: el guion
reconstruye las herramientas con `createHerramientas` (mismo patrón que
`scripts/verificar-herramientas.mjs`) y vuelve a llamar `ejecutar(nombre,
argumentos)` con los argumentos YA capturados del flujo SSE — sin tocar el
camino de producción, sin pedirle nada nuevo a `chat.mjs`. El resultado real
se compara contra los números citados en el texto de la respuesta: cualquier
cifra que no salga de ese resultado (ni de la lista de recuentos que ya
perdona `contieneCifras`) es una invención y el caso falla.

**Depende de F0-F3.** Auditar contra herramientas que todavía están
cambiando de forma (nuevos esquemas Zod, caché, foco, cuatro herramientas
nuevas) mediría un blanco en movimiento — por eso va después.

**Pruebas.** No es un verificador (`medir-asistente.mjs` no da código de
error, mide). El criterio de éxito es que el banco
(`backend/ia/evaluacion/banco.mjs`, **20 casos** — `BANCO`) deje de
tener el pase libre de cifras y el reporte muestre una tasa real de invención
— sea cero, sea la que sea, por primera vez medida de verdad.

> **Corregido el 11-09-2026, y RECORREGIDO el mismo día.** El plan original
> decía «20 casos»; yo lo cambié a 21 contando mal (un `grep -c "id:"` que
> incluía una línea de más) y lo repetí en dos commits. **Son 20**, medido
> con `BANCO.length`: 18 estables y 2 marcados `dependeDelEstado`
> (`reposo-no-es-averia`, `diagnostico-medido-vs-hipotesis`).
>
> Queda dicho porque es exactamente el fallo que este plan persigue en el
> asistente —dar una cifra sin haberla leído— cometido por quien lo escribe.
> Y sirve de recordatorio para el resumen: la tasa se reporta sobre el banco
> entero y también sin los que dependen del estado, que ya es lo que hace el
> guion.

> **HECHA el 11-09-2026, contra `qwen-3.5-4B` en `10.10.17.18:8080`.** El
> guion reconstruye las herramientas con `createHerramientas` y reejecuta cada
> llamada con los argumentos que ya viajaron por el flujo SSE. Sin tocar el
> camino de producción, como el plan pedía.
>
> **La medición, por primera vez de verdad:**
>
> | | |
> |---|---|
> | Casos que pasan | **12 de 20 (60 %)** · sin los que dependen del estado: 12 de 18 (67 %) |
> | Fallos de cifra | 4 |
> | De ellos, **deriva** de señal viva | **4** |
> | **Invenciones reales** | **0** |
>
> Antes esta comprobación **no podía fallar nunca**: se le pasaban todos los
> números del texto como válidos. Ahora puede, y no falla — que es un resultado
> distinto de no haberlo mirado.
>
> **1 · Deriva no es invención, y la diferencia se DICE.** El modelo contestó
> «73.6 %» y la reejecución, treinta segundos después, devolvió 73.4 %. El
> nivel del tanque es una señal viva (tres lecturas seguidas: 73.4, 73.5,
> 73.5). No se perdona con una tolerancia —un margen a ojo en la única
> comprobación que existe para impedir números a ojo taparía justo las
> invenciones pequeñas, que son las creíbles—: se clasifica. «73.4 ≈ 73.5
> (deriva de señal viva)» frente a «sin nada parecido en el resultado».
>
> **2 · El instrumento se destapó a sí mismo tres falsos positivos**, y esto es
> lo que más enseñó. La primera tanda acusó de inventar tres cifras que eran
> correctas:
>
> · `sin-comprobar-no-es-verde` — el «4» de «**4. Informativo: …**». El filtro
>   de ordinales de lista no lo veía porque los asteriscos de markdown van
>   DELANTE del número.
> · `limite-del-manual` — «5.8 psi» y «3.3», citados con archivo y página.
> · `reporte-en-pdf` — el «7» de «últimos 7 días», el período que el modelo
>   pidió.
>
> Los dos últimos por el mismo atajo mío: no le pasé `indiceDocumentos` ni
> `reportes` a la instancia de auditoría, razonando que las herramientas sin
> sus dependencias «se niegan solas y no aportan números falsos, sólo no
> aportan ninguno». **Es falso.** Una herramienta que no puede correr no deja
> el resultado vacío: deja la auditoría CIEGA, y una auditoría ciega acusa. Es
> exactamente lo que la cabecera del guion advertía —«un evaluador que da
> falsos positivos se apaga a la semana»— reintroducido por el atajo.
>
> Corregido: la auditoría recibe todo lo que el turno pudo usar (el `diario` no,
> y ése sí a propósito: reejecutar no es accionar), un turno cuya reejecución
> falló se marca **NO VERIFICABLE** en vez de acusar, y el filtro de ordinales
> admite el marcado. Tras los tres arreglos, los tres casos pasan.
>
> **3 · Lo que el banco dice del MODELO**, que es para lo que existe: falla en
> decir que los límites son estimaciones nuestras (`de-donde-sale-el-limite`),
> en llamar «avería» a una máquina en reposo, y en encadenar siete herramientas
> donde se esperaba `diagnostico`. Y **varía entre tandas**: el mismo caso pasa
> y falla según el turno. Por eso este instrumento se lee comparando corridas,
> nunca leyendo una — como dice su propia cabecera.

---

## 6 · F5 — `IA-05`: progreso durante la primera pasada

**Qué hace hoy.** Entre el `{tipo:'estado', valor:'Pensando…'}` inicial y que
el modelo devuelva su decisión de herramienta, no hay ningún evento
intermedio — es una espera ciega de decenas de segundos. `pasadaConHerramientas`
usa `stream: false` a propósito (§0.3), así que esto no se resuelve
activando streaming ahí sin romper esa decisión.

**Qué cambia.** Dos señales de progreso que NO dependen de leer tokens
parciales de una respuesta que llama-server todavía no completó:

1. **Un `{tipo:'estado'}` con tiempo transcurrido**, emitido a intervalos
   fijos (p. ej. cada 5s) mientras se espera la respuesta de la pasada 1 —
   no dice QUÉ está decidiendo el modelo (eso no se sabe hasta que termina),
   dice que el proceso sigue vivo. Evita el mismo síntoma que
   `chatRoutes.mjs` ya resuelve para la cola (¿cuántos delante?): que una
   espera larga sin señal se lea como colgado.
2. **Si `llama-server` expone alguna métrica de progreso por properties del
   endpoint** (a confirmar contra la versión real del router — es la única
   parte de esta fase que podría necesitar un chequeo contra el servidor de
   IA antes de comprometerse a un diseño), usarla; si no, quedarse con el
   punto 1 y decirlo en la cabecera de la implementación en vez de simular
   un progreso que no se puede medir.

**Pruebas.** `verificar-chat.mjs` ya tiene un llama-server falso con
`retrasoMs` configurable — extenderlo para confirmar que el evento de
progreso llega mientras la pasada 1 está en curso y no antes ni después.

---

## 7 · F6 — `IA-10`: registro por turno, y el hueco de `controlar_bomba`

**Qué hace hoy.** `logger.debug`/`logger.warn` puntuales dentro de `chat.mjs`
son para diagnóstico operativo (Pino, rotativo), no un registro estructurado
y persistente por turno con fines de auditoría. El diario de accionamientos
de SEG-08 (`backend/lib/diario.mjs`) es el patrón correcto —JSONL, poda por
tamaño, retención por días— pero es de OTRO dominio (qué se le hizo a la
planta) y sólo lo alimenta `controlRoutes.mjs`, el botón físico.

**Qué cambia — dos piezas separadas:**

1. **El hallazgo real (§0.5), primero y aparte del diseño nuevo:**
   `controlar_bomba` no anota en `diario.mjs`. Esto se corrige llamando al
   mismo diario desde `herramientas/maquina/index.mjs` tras una escritura
   confirmada — mismo formato de entrada que ya usa `controlRoutes.mjs`, con
   el origen marcado como "asistente" en vez de la IP/usuario del botón, para
   que quien lea el diario meses después sepa por qué canal se accionó.
2. **El registro de turno nuevo**, en su propio archivo JSONL
   (`datos/diario-conversaciones.jsonl`, mismo directorio que
   `datos/aprendizaje.json`): una línea por turno completo, con la pregunta,
   qué herramientas se llamaron y con qué argumentos (no sus resultados
   completos — eso duplicaría datos de planta en disco sin necesidad; basta
   el nombre y los argumentos para poder reconstruir "qué se le preguntó al
   asistente y por dónde fue a mirar"), y si terminó en error o bloqueo.

**Por qué van juntas.** Es el mismo patrón de infraestructura (JSONL con
poda) aplicado a dos huecos del mismo vecindario — separarlas en dos fases
completas sería repetir la parte de diseño de "cómo se escribe un JSONL con
poda" dos veces.

**Pruebas.** Extiende el patrón de pruebas de `diario.mjs` (poda por tamaño,
formato de línea) al archivo nuevo; una prueba de integración que confirme
que `controlar_bomba` vía chat deja una línea en `diario-accionamientos.jsonl`
igual que el botón físico.

> **HECHA el 11-09-2026.** Las dos piezas. Verde: 166 comprobaciones en
> `verificar-herramientas.mjs` (4 nuevas), 79 en `verificar-backend.mjs`, los
> 27 verificadores, 299 pruebas de backend, lint y tipos.
>
> **1 · El hueco real, cerrado.** `controlar_bomba` anota en el mismo diario
> que el botón, con `origen: "asistente"`. Se anotan el éxito y **todos** los
> rechazos —solo lectura, nivel alto, lectura fallida, escritura no aceptada y
> escritura sin efecto—, porque «no la encendí porque el tanque estaba al 92 %»
> contesta a la misma pregunta que «la encendí». La única salida que NO se
> anota es la llamada sin `encender`: no llegó a ser una orden sobre la
> instalación, y anotarla llenaría el diario de tanteos del modelo.
>
> **2 · Y un defecto que apareció al hacerlo.** El botón del tablero **pasa por
> esta misma herramienta** (`controlRoutes.mjs` lo dice en su cabecera: llama a
> `ejecutar('controlar_bomba', …)` para no duplicar las guardas). Así que la
> primera versión dejaba **dos líneas por pulsación**, y la segunda decía
> `origen: "asistente"` de algo que había hecho una persona en el tablero. Un
> diario que duplica es malo; uno que miente sobre el canal manda a buscar una
> conversación que no existe.
>
> Se corrige con un tercer parámetro de `ejecutar(nombre, argumentos,
> contexto)`: la ruta pasa `{ yaAnota: true }` y la herramienta se calla, porque
> quien tiene el `request` delante anota mejor —sabe la IP y el usuario—. El
> contexto va **aparte de `argumentos`** a propósito: eso lo escribe el modelo y
> esto no, y mezclarlos le dejaría pedir `yaAnota: true` para borrar su propio
> rastro del diario.
>
> **3 · El registro de turno, en su propio archivo.** `datos/diario-conversaciones.jsonl`,
> con el mismo mecanismo de `lib/diario.mjs` y tope propio (4 MB: un turno pesa
> más que un accionamiento y se producen muchos más). Archivo aparte porque son
> dos dominios y dos lectores: uno contesta «¿qué se le hizo a la instalación?»
> y otro «¿qué se le preguntó al asistente?».
>
> Guarda la pregunta, qué herramientas se llamaron y cómo terminó —contestada,
> bloqueada, cancelada o con error—, **nunca los resultados**: son datos de
> planta, a veces series enteras, y con el nombre y los argumentos se
> reconstruye la consulta. Es la misma frontera que ya defiende
> `separarAdjuntos`. Los turnos que fallan o se cancelan se anotan igual, por el
> mismo motivo que los rechazos del otro diario.
>
> **4 · Un falso positivo que conviene conocer.** `verificar-codigos.mjs` se
> puso en rojo por un comentario mío que contenía el literal `ok: false` —el
> guion rastrea texto de rutas, no AST—. Se reescribió el comentario, no el
> verificador: hacía bien su trabajo, y relajarlo para acallarlo es justo lo que
> este proyecto no hace.

---

## 8 · F7 — `IA-08`: router de modelo

**La restricción que ya impone la arquitectura, antes de diseñar nada.** El
modelo activo es HOY una variable de estado del SERVIDOR ENTERO
(`usarModelo()`, `chat.mjs` líneas 1349-1360), deliberadamente global y no
por sesión — el comentario de cabecera explica que el router de llama-server
carga modelos bajo demanda sin VRAM para dos a la vez, y que dejar que cada
pantalla elija el suyo forzaría recargas constantes. **Un router automático
por pregunta chocaría de frente con esa decisión** si cambiara de modelo a
media conversación: cada cambio sería una recarga de varios segundos, y dos
pantallas preguntando cosas de distinta complejidad al mismo tiempo se
pisarían la VRAM entre sí.

**Qué cambia, dado esa restricción.** El router NO decide por pregunta
individual — decide **una vez por conversación, en el primer turno**, y se
queda fijo el resto de esa conversación (coherente con que el modelo activo
ya es una variable de sesión larga, no de turno). La heurística de
complejidad se basa en señales baratas de calcular sin invocar ningún
modelo: longitud de la pregunta, si nombra una herramienta compuesta
(`diagnostico`, `resumen_de_turno` de F3) versus una simple
(`estado_del_sistema`), si el historial ya es largo. Modelos candidatos: los
que ya declara `IA_MODELOS` (`config.mjs` línea 616-624) — el router elige
ENTRE los ya configurados, no introduce un modelo nuevo.

**Lo que NO resuelve.** No cambia de modelo a mitad de conversación aunque la
pregunta 5 sea mucho más simple que la 1 — eso reabriría el problema de VRAM
compartida que la arquitectura actual evita a propósito. Si en el futuro se
quiere routing por turno, es un plan aparte que primero tiene que resolver
la contención de VRAM entre pantallas (posiblemente parte de Plan 26,
`COD-08` telemetría del sondeo, si esa telemetría revela que el patrón de uso
real lo justifica).

**Pruebas.** Casos sintéticos de pregunta corta/simple vs. larga/compuesta,
confirmando que el router elige el modelo esperado de la lista de
`IA_MODELOS` — sin necesitar `llama-server` real para esto, porque la
heurística no invoca ningún modelo para decidir.

> **DESCARTADA el 11-09-2026, y en su lugar se MIDE.** Esta fase no se
> implementa. El motivo no es que sea difícil: es que, con el código delante,
> **la propuesta de esta misma sección no se sostiene**.
>
> **1 · «Una vez por conversación» no resuelve el choque, lo esconde.** El §8
> ya parte de que el modelo activo es global al servidor por VRAM, y propone
> decidir por conversación para no cambiarlo a media charla. Pero si la
> elección es por conversación y el modelo es global, dos pantallas con
> conversaciones distintas se pisan igual: la A elige el 9B, la B el 4B, y cada
> turno alterna → una recarga de varios gigas por mensaje. Es exactamente el
> escenario que `usarModelo` documenta como inaceptable. Para que funcionara,
> el modelo tendría que dejar de ser global — que es la decisión que el propio
> §8 dice no reabrir.
>
> **2 · `IA_MODELOS` viene VACÍO por defecto**, dato que no estaba en el plan.
> Sin dos modelos configurados no hay entre qué elegir, así que la heurística
> no se ejecutaría nunca en una instalación normal.
>
> **3 · Y no hay nada que diga cuál es «el capaz».** `readModelos` sólo
> garantiza que el primero es el de por defecto; la lista es de nombres, sin
> orden semántico. Un router tendría que inferirlo del nombre («4B» / «9B»),
> que es frágil y específico de Qwen, o inventarse una convención que nadie
> escribió.
>
> **Lo que sí se hizo, y es la parte útil.** La pregunta de fondo —¿hay
> preguntas que de verdad necesiten el modelo grande?— es buena, y no se
> contesta suponiendo. El diario de conversaciones de F6 registra ahora las
> tres señales baratas que esta heurística iba a usar: `caracteresPregunta`,
> `rondas` (cuántas llamadas al modelo costó el turno, que no es lo mismo que
> cuántas herramientas) y `turnosDeContexto`, junto al `modelo` y la
> `duracionMs` que ya guardaba.
>
> Con semanas de uso real eso contesta si las preguntas largas o las que gastan
> varias rondas son de verdad las lentas. Si lo son, un router tendrá algo que
> decidir y se diseñará sobre datos; si no, se habrá ahorrado. Es el mismo
> orden que `medir-calibracion.mjs` impuso para los umbrales del motor: primero
> se mide, después se pone el número.

---

## 9 · Lo que este plan NO hace

- **No construye `espectro_de_vibracion` ni `exportar_datos`** (B9/B10 de
  `MEJORAS-ASISTENTE.md`) — quedan anotadas para cuando F3 de un plan
  posterior las retome; B9 además depende de habilitar hardware, no sólo de
  código.
- **No unifica los tres resolvedores de nombre** (`B1` de
  `MEJORAS-ASISTENTE.md`, confirmado vigente el 11-09-2026: `resolverSenal`
  en `backend/ia/conversacion/herramientas.mjs` línea 508, `sistemasDeSenal`
  en `shared/eva/comun/sistemas.js` línea 691 y `resolverSenalDeSistema` en
  `backend/ia/herramientas/historicos/index.mjs` línea 133 siguen siendo tres
  sitios distintos). Es un refactor real con su propio riesgo — cualquiera de
  las ocho fases de este plan podría tropezar con esos tres sitios y no
  arreglar los tres a la vez sería peor que no tocarlos. Queda para un plan
  aparte, o para cuando `IA-09`/F3 obligue a tocarlos por necesidad, no por
  limpieza.

  > **Matizado el 11-09-2026: F3 casi con seguridad los toca.** Esto estaba
  > escrito como hipótesis («o para cuando F3 obligue»), pero medido contra el
  > código es lo más probable: `resolverSenalDeSistema` ya se llama en **ocho**
  > puntos de `historicos/index.mjs` (líneas 171, 431, 533, 609, 652, 743, 925
  > y 1171), y las cuatro herramientas de F3 caen justo encima —
  > `buscar_evento` resuelve una señal dentro de un sistema, y
  > `comparar_maquinas` resuelve **la misma magnitud en los dos** (§4.4),
  > que es exactamente el caso que hoy no tiene un solo dueño.
  >
  > No se reabre aquí el refactor. Pero al llegar a F3 conviene decidirlo a
  > propósito —unificar, o añadir el noveno y décimo uso sabiendo que se
  > añaden— en vez de descubrirlo a mitad de la fase.
- **No hace routing de modelo por turno**, sólo por conversación (§8) — el
  routing más fino requeriría resolver primero la contención de VRAM.
- **No toca la caché entre CONVERSACIONES distintas** (§2) — sería compartir
  estado entre sesiones de usuarios distintos, una superficie de fuga que
  este plan no abre.
- **No enciende `AUTH_HABILITADA` ni depende de que esté encendida** — todo
  lo de aquí funciona igual con la autenticación apagada, porque ninguna
  fase decide QUIÉN puede preguntar, sólo CÓMO se responde.
