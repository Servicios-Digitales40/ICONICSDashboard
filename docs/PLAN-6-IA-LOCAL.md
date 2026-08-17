# Plan 6 · Chat con IA local sobre los datos de ICONICS

> **ESTADO (12-ago-2026)** — **Fases 1 a 5 ejecutadas.** Falta la única
> comprobación que necesita el modelo real: medir cuánto tarda de verdad una
> respuesta de punta a punta.
>
> | Comprobación | Resultado |
> |---|---|
> | Suite del frontend | **204 pruebas** (eran 196; 8 nuevas del asistente) |
> | `verificar-backend.mjs` | 51, sin cambios |
> | `verificar-herramientas.mjs` | **21**, nuevo |
> | `verificar-chat.mjs` | **21**, nuevo |
> | Trozo `index` del build | 157,49 KB (era 157,24; techo 170) |
> | Trozo del asistente | `Asistente-*.js`, 7,83 KB, **diferido** |
>
> **Cuatro cosas que aparecieron al ejecutar y no estaban en el plan:**
>
> 1. **`quality.js` también tenía que ir a `shared/`.** El §5 no lo listaba, y
>    sin él la capa de herramientas habría duplicado la regla de qué calidad
>    OPC es buena — justo lo que `shared/` existe para evitar. Un valor de mala
>    calidad llega como 0, así que la copia divergente habría hecho decir al
>    asistente «el OEE es 0 %» de una máquina en marcha.
> 2. **`shared/` necesita su propio `package.json` con `"type": "module"`.** No
>    hay ninguno entre la raíz del repo y el directorio del usuario, así que
>    Node caía en su detección de sintaxis por respaldo: funcionaba, pero
>    avisaba por consola en cada arranque del backend.
> 3. **El `close` de cancelación iba en el objeto equivocado.** Estaba en
>    `request`, que ya había emitido su `close` al consumirse el cuerpo, así
>    que el manejador no se ejecutaba nunca y cancelar no liberaba el hueco.
>    Va en `response`. Lo cazó `verificar-chat.mjs`.
> 4. **Diferir el asistente por su barril rompió `verificar-bundle.mjs`.** El
>    `lazy()` sobre `@/features/asistente` generó un segundo `index-*.js`, y el
>    guion —que busca el trozo de arranque por ese prefijo— midió 7 KB contra
>    un techo de 170 y dio el visto bueno sin comprobar nada. Se arregló
>    importando el componente concreto, y el guion ahora **falla** si un
>    prefijo coincide con más de un trozo.
>
> **Verificado de punta a punta (12-ago-2026)**, con el modelo real y el
> servidor de planta respondiendo:
>
> | Pregunta | Herramienta | Resultado | Tiempo |
> |---|---|---|---|
> | OEE de la Línea 1, 25-mar-2025 | `oee_de_maquina(LIN/1, 2025-03-25)` | Sin datos — **el historiador no llega tan atrás** | 67 s |
> | OEE de la Línea 1, 30-jul-2026 | `oee_de_maquina(LIN/1, 2026-07-30)` | **61,9 %**, del historiador | 85 s |
> | OEE de la Línea 3, 30-jul-2026 | `oee_de_maquina(LIN/3, 2026-07-30)` | «No guarda historial. Solo LIN/1 tiene registros» | 93 s |
>
> En los tres casos el modelo tradujo solo «Línea 1» → `LIN/1` y «25 de marzo
> de 2025» → `2025-03-25`, y citó la procedencia del dato sin que se lo
> pidieran. **Ninguna cifra inventada en los casos sin dato**, que era la
> invariante 2.
>
> **La estimación de §2 se quedó corta por abajo.** Medido con el 9B: **4,2
> tok/s**, cargado a 6,9 GB de los 8 de VRAM —descarga parcial, el resto en
> CPU—. El rango real fue **67-93 s**, no 30-90.
>
> ### Cambio de modelo: 9B Q8 → 4B Q4
>
> Con ese número sobre la mesa se probó `Qwen3.5-4B-UD-Q4_K_XL` (2,85 GB, cabe
> entero en la 4060). **Mismas tres preguntas, mismo resultado, 19× más
> rápido.**
>
> | | 9B Q8_K_XL | 4B Q4_K_XL |
> |---|---|---|
> | Aciertos sobre el banco | 3/3 | **3/3** |
> | Herramienta y argumentos | correctos | **idénticos** |
> | Total de las tres | 245 s | **13 s** |
> | Por pregunta | 67 · 85 · 93 s | **4,3 · 3,7 · 4,8 s** |
>
> No hubo que tocar una línea del proyecto: el modelo lo elige el `-m` de
> llama-server, y el backend solo conoce `IA_BASE`.
>
> El riesgo que se aceptaba al bajar de tamaño —que un 4B eligiera peor— está
> acotado por diseño y no por suerte: si contestara sin consultar, la
> invariante 3 bloquea la respuesta; si inventara una máquina o una fecha, la
> herramienta la rechaza y le devuelve las válidas. **El modo de fallo de un
> modelo más pequeño aquí es decir «no sé», no dar una cifra falsa.**
>
> ### Dos hallazgos del cambio, ya corregidos
>
> **El razonamiento se comía la respuesta.** Qwen3.5 emite sus tokens de
> pensamiento en `reasoning_content`, aparte de `content`, pero **ambos gastan
> del mismo `max_tokens`**. En la primera tanda de pruebas una respuesta llegó
> **vacía**: el modelo consultó el dato, pensó 512 tokens y no le quedó
> presupuesto para escribir. En pantalla eso es una burbuja en blanco,
> indistinguible de una avería.
>
> El arreglo tiene tres partes, y las tres están en `backend/ia/chat.mjs`:
>
> | | |
> |---|---|
> | Pasada 1 (elegir herramienta) | Razonamiento **encendido** —es donde sirve— y presupuesto propio, para que un razonamiento largo no trunque la llamada |
> | Pasada 2 (redactar) | Razonamiento **apagado** con `chat_template_kwargs.enable_thinking=false`. Medido: 0,4 s en vez de 2,1, misma respuesta |
> | Red de seguridad | Si aun así `content` llega vacío, el backend redacta el resultado de la herramienta sin el modelo |
>
> `reasoning_effort: 'none'` **no sirve**: se probó y este build lo ignora.
>
> **El razonamiento no se enseña.** Se descarta `reasoning_content` a
> propósito: es el borrador del modelo, no su respuesta, y no tiene nada que
> hacer en la pantalla de un operador. Hay prueba que lo fija.
>
> **Lo que sigue sin comprobar:**
>
> | Pendiente | Por qué |
> |---|---|
> | El bloqueo con llama-server **sin** `--jinja` | Hay que rearrancarlo a propósito para provocarlo |
> | Comportamiento con la ventana Demo caducada | Solo se ve contra el servidor sin licencia |
> | El empaquetado con `shared/` | El guion vive en el tag `archivo/plan-produccion` |

Sexto plan. Añade una funcionalidad nueva: un chat, disponible en todo momento en
el frontend, que responde preguntas en lenguaje natural sobre los datos de la
planta consultando ICONICS de verdad.

La tesis, en una frase: **el modelo decide _qué_ preguntar, y el backend sabe
_cómo_ preguntarlo.** Todo lo que sale mal en este tipo de integraciones sale de
confundir esas dos responsabilidades.

**Convención de esfuerzo:** ▁ bajo (horas) · ▄ medio (días) · █ alto (semanas).

---

## 1. Decisiones ya tomadas

Estas no se replantean en el plan; se documentan porque el diseño cuelga de ellas.

| Decisión | Consecuencia que hay que asumir |
|---|---|
| **El modelo se queda en `Qwen3.5-9B-UD-Q8_K_XL`** (12,6 GB) | No cabe en los 8 GB de la RTX 4060. Descarga parcial a CPU, **estimado 4-8 tok/s**. Ver §2 |
| **llama.cpp en el mismo servidor** que backend, frontend e ICONICS | Compite por CPU y RAM con el servidor de planta, no por GPU |
| **Alcance: las 10 máquinas desde el principio** | Nueve no tienen historia. Tienen que contestar «no tengo ese dato», no fallar ni inventar |
| Se salta la fase de medición previa | Los números de §2 son estimaciones. La primera medición real es el cierre de la Fase 4 |

---

## 2. El presupuesto de tiempo, y qué obliga a diseñar

Una respuesta con herramientas son **dos pasadas del modelo**: la primera decide
la llamada, la segunda redacta con el dato ya en la mano. Entre las dos, la
consulta a ICONICS —que para un día de historia son **siete peticiones** al
historiador, una por tag.

```
pregunta ──► pasada 1   ~40-80 tokens     ──► tool_call
             ICONICS    7 peticiones      ──► dato
             pasada 2   ~80-150 tokens    ──► respuesta
```

A 4-8 tok/s eso son **30-90 segundos por pregunta**. Es la restricción que manda
en todo el diseño de la interfaz, y de ella salen seis reglas no negociables:

1. **Streaming obligatorio.** SSE desde el primer token. Sin él la pantalla queda
   muerta un minuto y el operador pulsa otra vez.
2. **El estado se enseña con palabras**: «pensando» → «consultando el
   historiador» → «redactando». Una barra indeterminada de 60 s no informa de
   nada; el nombre del paso sí, y además delata dónde se atascó.
3. **Una sola llamada a herramienta por pregunta.** Nada de cadenas. Es la razón
   de que las herramientas de §4 sean gruesas: cada eslabón extra son 30 s más.
4. **Una consulta a la vez.** Con varias pantallas de planta abiertas, dos
   preguntas simultáneas se reparten la GPU y las dos tardan el doble. Cola de
   uno, y a la segunda se le dice que espere — con palabras, no colgándola.
5. **Cancelable.** Un minuto de espera sin botón de abortar es peor que un error.
6. **Contexto corto** (`-c 4096`). El KV cache sale de la misma VRAM que ya va
   justa; un contexto largo se paga en tokens/s en cada pregunta.

> El timeout de ICONICS (`UPSTREAM_TIMEOUT_MS`, 15 s) **no sirve** para el
> modelo. La llamada a llama-server necesita el suyo, del orden de 180 s, o el
> puente cortará todas las respuestas por sistema.

---

## 3. La arquitectura, y el eslabón que no existe

El flujo que se propuso inicialmente decía que *el modelo envía la llamada al
backend* y *la IA se la envía al frontend*. **llama.cpp no puede llamar a nadie**:
es un endpoint HTTP sin estado que escribe texto. Cuando decide usar una
herramienta emite un JSON y se detiene. Alguien tiene que leerlo, ejecutarlo y
volver a invocarle con el resultado.

Ese alguien es código, y va en el backend:

```
frontend ──POST /api/chat──► backend ──────► llama-server :8080
                                │  ◄─────────  tool_call
                                │
                                ├──► client.mjs ──► ICONICS
                                │     (en proceso, no por HTTP)
                                │
                                └──────────────► llama-server
                                   ◄─────────────  texto
frontend ◄────SSE, token a token────┘
```

**Por qué el orquestador va en el backend y no en el navegador:**

| | Frontend habla con llama-server | Backend orquesta |
|---|---|---|
| CORS en llama-server | hay que abrirlo | no hace falta |
| Exposición de llama-server en red | obligatoria | escucha en `127.0.0.1` |
| Esquema de herramientas | en el bundle, editable desde las DevTools | en el servidor |
| Ejecución de la herramienta | el navegador llama al backend igual → un salto de más | en proceso |
| `ICONICS_READ_ONLY` | sigue valiendo, pero deja de ser la única puerta | única puerta |

El backend, además, **ya tiene** el cliente autenticado. Ejecutar la herramienta
es llamar a `client.mjs` directamente: ni un salto HTTP, ni un segundo login.

**Sin dependencias nuevas.** El `fetch` de Node habla con llama-server y el SSE
son escrituras a mano en el `response`. El backend sigue siendo lo que dice su
README: un servidor Node sin dependencias.

---

## 4. La decisión de fondo: qué infiere el modelo

Aquí se gana o se pierde el proyecto.

| | **Modelo construye la llamada REST** | **Modelo llama a herramientas de dominio** |
|---|---|---|
| Emite | `pointName=hda:\Configuration\RESONAC\LIN\1:OEE`, `startDate=…T00:00:00-06:00`, `aggregate=Interpolative`, `interval=01:00:00` | `oee_de_maquina("LIN/1", "2025-03-25")` |
| Reglas que debe acertar | las cinco de [TAGS.md §Lectura del histórico](TAGS.md) | ninguna |
| Y luego | recibe 24 puntos horarios y tiene que reducirlos él | recibe `{oee: 62.4, disponibilidad: 78.1, …}` |
| Acierta | a ratos | siempre: son dos argumentos |

**Herramientas de dominio.** Un modelo de 9B no reproduce de forma fiable cinco
reglas no obvias del historiador —`Interpolative` y nunca `Average`, un día por
petición, desfase horario explícito, tope de 100 muestras, y los contadores
sumados por tramos porque se reinician con el turno—. Las inventará con aplomo.

Y hay una razón más fuerte: **esa lógica ya existe y está probada.** El problema
es que vive en el frontend. De ahí la Fase 1.

### El catálogo de herramientas

> ⚠️ **Esta tabla es el catálogo original y ya no es el vigente.** Sigue aquí
> porque el razonamiento que la rodea —por qué gruesas, por qué de dominio y no
> REST— es el que sostiene el diseño y no ha cambiado. Pero los nombres sí: el
> catálogo de hoy está en el bloque de estado del
> [Plan 7](PLAN-7-ALCANCE-ASISTENTE.md). `listar_maquinas` se retiró,
> `oee_de_maquina` y `comparar_dias` se generalizaron a cualquier período, y se
> añadió `estado_de_planta`.

Cuatro. Gruesas a propósito (regla 3 de §2), y **de solo lectura por
construcción**: el registro no contiene ni una escritura, así que ninguna
instrucción astuta en el chat puede alcanzar `POST /write`.

| Herramienta | Argumentos | Devuelve |
|---|---|---|
| `listar_maquinas` | — | Las 10, con área, nombre visible y **si tienen historia** |
| `estado_actual` | `maquina` | Lectura en vivo: estado, OEE y sus tres factores, piezas, modelo |
| `oee_de_maquina` | `maquina`, `fecha` | Resumen del día: `daySummary()` sobre la lectura del historiador |
| `comparar_dias` | `maquina`, `fechaA`, `fechaB` | Los dos resúmenes y su diferencia |

`maquina` se acepta como id (`LIN/1`) **y** en lenguaje llano («Línea 1»,
«Lineal 1», «Multi 10»): la resolución la hace el backend contra `tagCatalog`, no
el modelo. Un nombre que no resuelva devuelve la lista de los válidos, que es lo
que necesita el modelo para corregirse en la misma pasada.

---

## 5. Qué se mueve a `shared/`

La lógica que las herramientas necesitan está hoy en `react-dashboard/src`. Es
JavaScript puro —sin React, sin `import.meta.env`, sin `fetch`—, así que se mueve
a un `shared/` en la raíz que importan los dos lados.

**Las dos alternativas, y por qué no:**

- **Duplicarla en el backend.** Divergiría. Es exactamente la lección que el
  propio backend ya aprendió con `request()`: *«antes cada operación repetía ese
  bloque, y cada copia podía divergir —de hecho divergían»*.
- **Que el backend importe de `react-dashboard/src`.** Rompe el empaquetado de la
  release, que copia `backend/` y `dist/` pero no el árbol de fuentes del
  frontend.

| Origen | Destino | Qué es |
|---|---|---|
| `lib/iconics/tagCatalog.js` | `shared/tagCatalog.js` | Catálogo, `pointName`, `historyPointName`, `listMachines` |
| `lib/domain/machine.js` | `shared/domain/machine.js` | `calcOEE`, `toNumber`, `hasValue`, saneamiento |
| `lib/domain/estado.js` | `shared/domain/estado.js` | Enum de estados |
| `lib/domain/history.js` | `shared/domain/history.js` | `daySummary()` |
| **parte de** `lib/iconics/transport.js` | `shared/historia.js` | Ver abajo |

De `transport.js` se extrae solo la mecánica pura del historiador, que hoy está
**mezclada con el transporte de red y en su mayoría sin exportar**:

```
exportadas ya:  AGREGADO · INTERVALO · TAGS_FACTOR · TAGS_CIERRE · TAGS_DIA
                isoLocal · marcaLocal · rangoDelDia · rangoDeDias

privadas, hay que exportarlas:
                desplazamiento · totalDelDia · recortarAlPresente · unir
```

Lo que **se queda** en `transport.js`: `createRealTransport`, `createTransport`,
los presets de caos y las banderas de Vite. Es decir, todo lo que toca la red o
el entorno del navegador.

> **Un comentario obsoleto que hay que corregir de paso.** `transport.js:36` dice
> *«Contadores: su cierre del día se toma del último punto de la serie»*, y
> `history.js:11` habla de *«el cierre y no la media»*. **El código no hace eso**:
> `readDay()` llama a `totalDelDia()`, que suma los saltos positivos precisamente
> porque el último valor son las piezas del turno y no las del día — como
> explican bien tanto `totalDelDia` como [TAGS.md](TAGS.md). Los comentarios se
> quedaron atrás. Con la extracción a `shared/` van a leerlos personas nuevas y
> el backend va a depender de ellos: se arreglan en la Fase 1.

---

## 6. Invariantes que NO pueden regresar

1. **La IA nunca escribe.** El registro de herramientas solo contiene lecturas.
   `ICONICS_READ_ONLY` sigue en `true` y sigue siendo la última puerta, pero la
   primera es que la escritura no está en el catálogo.
2. **Un dato que no existe se dice, no se rellena.** Es la regla que el
   comparativo ya respeta: *«una comparación creíble y falsa es peor que un
   hueco»*. Nueve máquinas sin historia y un servidor en modo Demo que caduca
   cada 2 h hacen que este caso sea lo normal, no la excepción.
3. **Toda cifra que el chat diga viene de una herramienta.** Si el modelo
   responde sin haber llamado a ninguna, está recitando de memoria. La respuesta
   lleva **de dónde salió el dato** (máquina, fecha, y que es del historiador),
   que es lo que permite al operador detectarlo.
4. **El chat no inventa máquinas.** `LIN/8`, `REC/12` y `REC/1..9` no existen y la
   numeración tiene huecos reales. Resolver el nombre es trabajo de
   `tagCatalog`, nunca del modelo.
5. **Calidad OPC ≠ 192 es un hueco, jamás un cero.** Vale igual aquí que en el
   tablero: un cero de mala calidad hunde el OEE sin que nadie lo note.
6. **llama-server escucha en `127.0.0.1`.** Nunca en `0.0.0.0`. No tiene
   autenticación de ninguna clase.
7. **Si el modelo no está, el tablero funciona igual.** El chat es aditivo: su
   caída no puede tocar ni una vista existente.

---

## 7. Fases

| # | Fase | Entregable | Esfuerzo |
|---|---|---|---|
| **1** | `shared/` | Extracción de §5, frontend importando de la ubicación nueva, comentarios obsoletos corregidos. **Cero cambios de comportamiento**: las 196 pruebas pasan sin tocar una aserción | ▄ |
| **2** | Herramientas | Las cuatro de §4 en `backend/ia/herramientas.mjs`, sobre `client.mjs` y `shared/`. Verificables **sin modelo delante** | ▄ |
| **3** | `POST /api/chat` | Bucle de tool-calling contra llama-server, SSE, cola de uno, cancelación, timeout propio | ▄ |
| **4** | El chat en el frontend | Panel siempre accesible, estados con palabras, cancelar. **Primera medición real de tok/s** | ▄ |
| **5** | Endurecimiento | Los caminos tristes de §8, y el arranque de llama-server documentado | ▁ |

**El orden importa en dos puntos.** La Fase 1 va sola y primero: es refactor puro
sobre código que el tablero de planta usa hoy, y mezclarlo con funcionalidad
nueva hace imposible saber qué rompió qué. Y las fases 2 y 3 se verifican **sin
el modelo**, con un llama-server falso —igual que `verificar-backend.mjs` levanta
un ICONICS falso—, porque un bucle de herramientas que solo se puede probar
esperando 60 s no se prueba.

### Verificación por fase

| Fase | Cómo se comprueba |
|---|---|
| 1 | `npm test` (196) y `node scripts/verificar-backend.mjs` (51), ambos sin editar aserciones |
| 2 | `scripts/verificar-herramientas.mjs` — **nuevo**, ejecuta las cuatro contra el ICONICS falso |
| 3 | `scripts/verificar-chat.mjs` — **nuevo**, llama-server falso: tool-call bien formado, tool-call inventado, modelo caído, timeout, cancelación |
| 4 | Pruebas de componente del panel; medición con el modelo real |
| 5 | Repaso manual de la tabla de §8 |

---

## 8. Los caminos tristes

Se enumeran porque son el trabajo de verdad. Cada uno tiene que producir una
frase que un operador entienda, nunca un error crudo ni un dato inventado.

| Situación | Qué debe decir el chat |
|---|---|
| Máquina sin historizar (9 de 10) | Que esa máquina no tiene historia, y cuáles sí |
| Fecha anterior a la retención del historiador | Que no hay dato tan atrás, no un cero |
| Ventana Demo de ICONICS caducada | Que el servidor de planta no responde y hay que reiniciar servicios |
| llama-server caído | Que el asistente no está disponible; **el tablero sigue** |
| El modelo no llama a ninguna herramienta | No se emite la respuesta como si fuera un dato |
| El modelo inventa una máquina o un argumento | La herramienta devuelve las opciones válidas y se reintenta **una** vez |
| Segunda pregunta con una en curso | Que hay otra consulta en marcha, con opción de cancelarla |
| El usuario cancela | Se aborta también la petición a llama-server, no solo la de la UI |

---

## 9. Arranque de llama-server

```
llama-server.exe ^
  -m qwen3.5_9B\Qwen3.5-9B-UD-Q8_K_XL.gguf ^
  --jinja ^
  --host 127.0.0.1 --port 8080 ^
  -c 4096 -ngl 99 --parallel 1
```

> ⚠️ **`--jinja` no es opcional.** Activa la plantilla de chat del propio Qwen, y
> **sin ella el modelo no ve las herramientas**: contestará de memoria, con una
> cifra inventada y el mismo aplomo que si la hubiera consultado. Es el modo de
> fallo más peligroso del plan entero, porque parece que funciona. La primera
> comprobación de la Fase 5 es arrancar *sin* la bandera y verificar que la
> invariante 3 de §6 lo detiene.

`mmproj-BF16.gguf` es el proyector de visión del modelo. **No se carga**: aquí no
se procesan imágenes y son 879 MB de RAM a cambio de nada.

`-ngl 99` pide subir todas las capas que quepan; con 12,6 GB de pesos y 8 GB de
VRAM subirá algo más de la mitad y el resto irá a CPU. Es lo esperado, no un
error de configuración.

**Variables nuevas del backend:**

| Variable | Por defecto | Para qué |
|---|---|---|
| `IA_BASE` | *(vacío)* | Base de llama-server. Vacío = chat deshabilitado, tablero intacto |
| `IA_TIMEOUT_MS` | `180000` | Corte de la llamada al modelo. **No** reutiliza `UPSTREAM_TIMEOUT_MS` |
| `IA_MAX_TOKENS` | `512` | Tope de la respuesta |

`IA_BASE` vacío apaga el chat entero y es el valor por defecto, siguiendo la
regla de la casa: *el defecto es el seguro*. Una instalación que no lo configure
no expone un asistente a medias.

---

## 10. Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| **R-1** | 30-90 s por respuesta resulta inusable en planta | Es una decisión tomada (§1) y se mide en la Fase 4. Si no sirve, el remedio conocido es un Q4_K_XL (~6 GB), que entra entero en la 4060 — **no hay que rediseñar nada para cambiarlo** |
| **R-2** | El modelo responde de memoria y nadie lo nota | Invariante 3 de §6 + la comprobación de `--jinja` en la Fase 5. Es el riesgo más grave del plan |
| **R-3** | La extracción a `shared/` rompe el tablero | Fase 1 aislada, sin cambio de comportamiento, con las 247 comprobaciones existentes como red |
| **R-4** | Un 9B falla al elegir herramienta o argumentos | Herramientas gruesas con 1-3 argumentos, resolución de nombres en el backend, y un reintento con las opciones válidas |
| **R-5** | La ventana Demo de 2 h se confunde con un fallo del chat | Fila propia en §8. Ya pasó durante la investigación del historiador y costó tiempo |
| **R-6** | llama.cpp compite por RAM con ICONICS en el mismo servidor | Con descarga parcial son ~5-6 GB de RAM del sistema además de la VRAM. Medir en la Fase 4 |
| **R-7** | El chat se cuela en el build de planta antes de estar listo | `IA_BASE` vacío por defecto lo apaga sin recompilar |
| **R-8** | Texto libre del PLC (`Modelo`) llega al prompt | Riesgo bajo —el resto son números—, pero los valores de herramienta se insertan como datos delimitados, no como instrucciones |
