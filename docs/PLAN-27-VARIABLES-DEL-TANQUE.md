# Plan 27 · El tanque tiene sesenta y seis variables, no ocho

Fecha de apertura: 09-09-2026. Origen: el árbol de AssetWorX bajo
`ac:TDCON/DEMO/` se reorganizó en planta, y el tablero lee hoy **cinco de sus
ocho señales**.

Este plan no es «añadir variables». Es reconocer que el contrato con ICONICS
que describe [`shared/eva/tanque/senales.js`](../shared/eva/tanque/senales.js)
—«el servidor ofrece ocho señales planas de un solo sistema, sin estado, sin
OEE»— **dejó de ser cierto**, y que la frase está copiada, con esas mismas
palabras, en unos treinta sitios del repositorio, incluido el prompt del
asistente.

---

## 0 · Qué pasó, y cómo se supo

El 08-09-2026 el equipo de planta publicó bajo `ac:TDCON/DEMO/` **trece ramas**
que reproducen, una a una, las secciones del DB del banco hidráulico
documentadas en [`Lista-variables.pdf`](Lista-variables.pdf) §1.1–§1.12. Tres
de los ocho puntos que este tablero declara se movieron o se renombraron en esa
reorganización:

| Declarado hoy | Qué pasó | Dónde está ahora |
|---|---|---|
| `SENSORES/SNIVEL_TANQUE` | movido **y renombrado** (pierde la `S`) | `INSTRUMENTACION_DE_PROCESO/NIVEL_TANQUE` |
| `SENSORES/SFLUJO_INSTANTANEO` | movido **y renombrado** (pierde la `S`) | `INSTRUMENTACION_DE_PROCESO/FLUJO_INSTANTANEO` |
| `SENSORES/Modo AM VDF` | movido **y renombrado** (espacios → `_`) | `MANDO_DEL_VARIADOR_VFD/Modo_AM_VDF` |

Los otros cinco siguieron en `SENSORES/` y por eso el tablero no se cayó del
todo: falló justo lo suficiente para parecer un problema de red.

**El árbol siguió moviéndose mientras se escribía este plan.** Entre el primer
sondeo y el tercero, el 09-09-2026, se retiraron los dos duplicados de
`SENSORES/`, se corrigieron dos erratas de nombre del servidor
(`FECUENCIA_VFD` → `FRECUENCIA_VFD`, `DP_EENERGIA_APARENTEL1` →
`DP_ENERGIA_APARENTEL1`) y `SNIVEL_TANQUE` perdió su `S`. Todo lo que sigue
está medido contra **el tercer sondeo**, y ese vaivén es en sí mismo el
argumento de F0: un catálogo que se comprueba a mano una vez no protege de un
árbol que cambia entre dos sondeos del mismo día.

**Esto lo detecta una herramienta que ya existe.** `verificar-catalogo.mjs
--real`, escrita en el Plan 20 F8 para exactamente esta deriva, lo dice por su
nombre y sin ambigüedad:

```
  Tanque y grupo de bombeo
    declarados 8 · en el servidor 7
    3 declarado(s) que el servidor NO tiene:
      · ac:TDCON/DEMO/SENSORES/SNIVEL_TANQUE
      · ac:TDCON/DEMO/SENSORES/Modo AM VDF
      · ac:TDCON/DEMO/SENSORES/SFLUJO_INSTANTANEO
```

No se ejecutó porque vive en la lista de «la sesión con planta» del Plan 26
([`HOJA-DE-RUTA-60-MEJORAS.md`](HOJA-DE-RUTA-60-MEJORAS.md)), pendiente de una
sesión que aún no ha ocurrido. **La lección no es que falte la herramienta: es
que una comprobación que sólo corre cuando alguien se acuerda no protege de
nada.** Ver F0.

### 0.1 Y el verificador tampoco lo habría visto entero

`verificar-catalogo --real` recorre **las raíces declaradas**, y la única raíz
del tanque es `ac:TDCON/DEMO/SENSORES/`. Las doce ramas nuevas son *hermanas*
de esa raíz, no hijas. Así que el verificador ve los tres puntos que faltan,
pero **es estructuralmente incapaz de ver las cincuenta y ocho variables
nuevas**: para él no existen. Eso también se arregla en este plan (F0).

---

## 0.2 ¿Estaba contemplado? No, y conviene decir en qué se parecía

Se han revisado los planes 19, 20, 21, 22, 26 y los dos backlogs. **Ningún plan
contempla un cambio de catálogo de esta magnitud.** Lo que hay es tres cosas
que se le parecen y no lo son:

1. **La «modularización» del Plan 19 es por FUENTE DE DATOS, no por entrada.**
   `shared/modulos.js` separa `monitoreo` (ICONICS) de `prediccion` (API
   externa). Eso responde a «¿de dónde viene este dato?», no a «¿cómo está
   organizado el árbol de la máquina?». El tanque sigue siendo un solo sistema
   dentro de un solo módulo, antes y después de este plan. No hay nada que
   reabrir del no-negociable §2.1: **las sesenta y seis variables entran por
   `backend/iconics/client.mjs`, igual que las ocho.**

2. **El Plan 21 arregló la MECÁNICA del sondeo, dando el catálogo por estable.**
   Cadencia desde el registro, un solo motor, calidad OPC, caché por punto,
   cobertura. Todo eso sigue valiendo y este plan se apoya en ello: nada de F1
   a F8 toca el motor de sondeo. Lo que el Plan 21 no previó es que el
   catálogo cambiara debajo.

3. **El no-negociable §2.10 sí anticipó *algo* parecido, y hay que leerlo con
   cuidado antes de invocarlo.** Dice:

   > «La agrupación en 4 activos es NUESTRA, no del servidor. Bajo
   > `ac:TDCON/DEMO/SENSORES/` no hay equipos, sólo señales sueltas. Si el
   > servidor publica equipos de verdad algún día, se sustituye
   > `shared/eva/activos.js` y ninguna vista se entera.»

   **Esa condición NO se ha cumplido.** Las trece ramas nuevas no son equipos:
   son las secciones del bloque de datos del PLC —«Alarmas», «Contadores»,
   «Lectura Modbus»— agrupadas por *cómo está escrito el programa*, no por qué
   pieza física hay en el banco. Un activo llamado «Lectura del variador por
   Modbus RTU» no responde a ninguna pregunta que se haga quien opera.

   Así que **la agrupación sigue siendo nuestra y `activos.js` se conserva**.
   Lo que cambia es que ahora hay piezas físicas de verdad que antes no
   asomaban (dos electroválvulas, una bomba de aire, un paro de emergencia), y
   eso sí obliga a hacer crecer la lista. Ver F5.

---

## 1 · El inventario real, medido

Sondeado contra `bms-server` el 09-09-2026 con `browse()` rama por rama,
**tercer sondeo**, ya sin duplicados. **Sesenta y seis puntos distintos.** El
tablero declara ocho.

| Rama | Puntos | §PDF | Naturaleza |
|---|---:|---|---|
| `SENSORES/` | 3 | — | KPIs de ICONICS |
| `SEGURIDAD/` | 2 | §1.1 · uno sin documentar | seguridad + mando maestro |
| `INSTRUMENTACION_DE_PROCESO/` | 4 | §1.2 | medida |
| `MANDO_DEL_VARIADOR_VFD/` | 6 | §1.3 | mando + estado |
| `SOLENOIDE_1_INFERIOR/` | 4 | §1.4 | mando + estado |
| `SOLENOIDE_2_SUPERIOR/` | 4 | §1.5 | mando + estado |
| `BOMBA_DE_AIRE/` | 4 | §1.6 | mando + estado |
| `AUTOMATISMO_LLENADO_VACIO/` | 5 | §1.7 | mando + consigna |
| `LECTURA_VARIADOR_MODBUS_RTU/` | 10 | §1.8 | medida (sin escalar) |
| `MEDIDOR_DE_ENERGIA/` | 7 | §1.9 | medida |
| `ALARMAS/` | 8 | §1.10 | alarma |
| `ADVERTENCIA_ESTADO_DE_OPERACION/` | 3 | §1.11 | aviso |
| `CONTADORES_VARIABLES_DE_MAQUINA/` | 6 | §1.12 | contador + sin instrumento |

### 1.1 `SENSORES/` no es una rama vieja que se pueda tirar

Es el hallazgo que ordena el resto, y el tercer sondeo lo dejó en su forma más
nítida. `SENSORES/` conserva **tres puntos, y los tres son los mismos que no
aparecen en `Lista-variables.pdf` en absoluto**: `CARGA_TRABAJO_MOTOR`,
`KPIEFICIENCIA_ENERGETICA` e `INDICE_DESVIACION_VOLTAJE`.

No están en el bloque de datos del PLC porque **no son variables del PLC**: son
cálculos del lado de ICONICS. Si `SENSORES/` desapareciera, desaparecerían con
ella y no hay dónde ir a buscarlas.

Así que la rama no es un residuo de la reorganización: es **la capa de KPIs de
ICONICS**, y la separación con las doce ramas nuevas —que son el DB del PLC, una
sección por rama— es exacta. Las dos versiones anteriores de este plan la veían
borrosa porque `SENSORES/` aún cargaba con `CONTROL` (§1.2) y con dos alias de
`INSTRUMENTACION_DE_PROCESO`; ambas cosas se retiraron en planta el 09-09-2026.

> Los duplicados existieron y conviene dejar la medición escrita, porque es la
> que demostró que lo eran: `SENSORES/STEMPERATURA_TANQUE` y
> `INSTRUMENTACION_DE_PROCESO/TEMPERATURA_TANQUE` devolvían `24.755861` bit a
> bit en el mismo instante, y `SPRESION_RELATIVA`/`PRESION_RELATIVA`,
> `-0.8517795`. Retirarlos fue lo correcto: dos nombres para un tag son dos
> maneras de contarlo dos veces.

**Conclusión: el tanque deja de tener una raíz y pasa a tener trece.** No es
que la raíz se mude; es que la raíz única deja de ser un concepto válido para
esta máquina.

### 1.2 `CONTROL` es el mando maestro, y ya está en `SEGURIDAD/`

En la primera versión de este plan `SENSORES/CONTROL` figuraba como el punto
desconocido del árbol: booleano, `false`, sin aparecer en el PDF ni en el DB
exportado. **Ya no es una incógnita.** Lo aclaró quien conoce la instalación el
09-09-2026: es el bit que **enciende y apaga el proceso**, y en esa misma
conversación se movió a `ac:TDCON/DEMO/SEGURIDAD/CONTROL`, junto al paro de
emergencia. Vuelto a sondear el árbol después de ese cambio: `SENSORES/` ya
no lo lista y `SEGURIDAD/` sí.

Dos consecuencias, y las dos importan más que el cambio de rama:

1. **Sigue sin estar en `Lista-variables.pdf`.** Su significado lo sabemos por
   una conversación, no por el documento ni por el DB. Así que se declara con
   esa procedencia escrita —igual que la nota del 25-08-2026 sobre la red
   208Y/120 en `senales.js`— y no como si el servidor lo hubiera dicho.
   Conviene además que entre en la próxima revisión del PDF, porque hoy el
   catálogo de variables no lo recoge.
2. **No es una medida: es el mando de mayor alcance de todo el árbol.** Un
   `START_STOP_VFD` arranca una bomba; `CONTROL` gobierna el proceso entero.
   Que ahora viva en `SEGURIDAD/` lo dice bien —es la rama del paro de
   emergencia—, y refuerza F7: de las variables escribibles, ésta es la que
   **por ningún motivo** se expone antes de que la autenticación esté encendida.

### 1.3 Anomalías del servidor, que se declaran como son

Ninguna de estas se «corrige» en el catálogo: se declara el nombre real y se
anota el porqué, que es la regla de §4.6 y §2.5.

| Qué | Detalle |
|---|---|
| `TENSION_L1_N` = **266,5** | el otro punto que dice medir L1-N (`INDICE_DESVIACION_VOLTAJE`) da ~122,5 V sobre una red 208Y/120 confirmada. Ni 276 (primer sondeo) ni 266 son plausibles como fase-neutro. **Falta el divisor.** No se pinta como voltios hasta confirmarlo |
| Modbus RTU sin escalar | el PDF §1.8 lo dice explícito: «el factor de escala lo aplica el FB de lectura, no el DB». Los diez registros llegan crudos |
| Cuatro contadores sin instrumento | PDF §3.9.3: no hay sensor de temperatura de devanado, de corriente por fase ni de presión de aspiración en el banco. Los cuatro leen `0` |
| §1.11 incompleta | el PDF declara cinco avisos; el servidor publica **tres**. `Encendido-IA` y `encendido` no están |
| Estado `0` | PDF §1.6: el valor inicial `0` no es ningún estado. **Es «sin dato», no «apagado»** |

Ya **no** están en esta tabla las dos erratas de nombre del servidor
(`FECUENCIA_VFD` sin `R`, `DP_EENERGIA_APARENTEL1` con doble `E`): se
corrigieron en planta el 09-09-2026, entre el primer sondeo y el tercero. El
catálogo declarará los nombres corregidos.

Las dos últimas filas y la de los contadores son el mismo no-negociable de
siempre (§2.4): **la ausencia de dato nunca se disfraza de cero.** Un contador
de horas de marcha que vale `0` porque no hay instrumento detrás no es «cero
horas», y un `Estado = 0` no es «apagado». Pintarlos como número sería el mismo
fallo que este proyecto ya cometió y ya arregló dos veces.

---

## 2 · La decisión que ordena el plan

**No todas las variables nuevas son señales, y meterlas todas por
`createSenal()` sería el error de diseño de este plan.**

`shared/eva/tanque/sistema.js` construye hoy ocho objetos idénticos: valor
saneado, banda de umbral, estado, margen consumido. Eso funciona porque las
ocho son medidas continuas de un sensor. De las cincuenta y ocho nuevas,
**menos de la mitad lo son**. Un bit de alarma no tiene banda; una consigna de
llenado no tiene estado «crítico»; un `Estado S1` es un enumerado de cuatro
valores, no un número que se compare contra un umbral.

Por eso el catálogo gana un campo **`naturaleza`**, y cada naturaleza tiene su
propia evaluación:

| `naturaleza` | Qué es | Cómo se evalúa | Ejemplos |
|---|---|---|---|
| `medida` | lectura continua de un instrumento | como hoy: banda + margen | nivel, caudal, presión, tensión |
| `estado` | enumerado de equipo (§1.6) | tabla de códigos; `0` ⇒ sin dato | `DP_ESTADO_VFD`, `ESTADO_S1` |
| `alarma` | bit de alarma del PLC | verdadero/falso, sin banda | `NIVEL_ALTO_ALTO`, `BAJO_FLUJO` |
| `mando` | orden o modo, **escribible** | sólo lectura en este plan (ver F7) | `START_STOP_VFD`, `MTTO_S1` |
| `consigna` | set point del automatismo | valor + su papel en la histéresis | `SETPOINT_LLENANDO` |
| `contador` | acumulador | valor + antigüedad | `HORAS_MARCHA` |
| `crudo` | leído sin escalar | **no se pinta con unidad** hasta tener divisor | los diez de Modbus RTU |
| `sin_instrumento` | declarado en el DB, sin sensor detrás | se declara y **no se pinta como medición** | `TEMPERATURA_DELDEVANADO` |

Esto es dominio puro y va en `shared/` (§2.6, §2.7). Es también lo que impide
que el plan degenere en «sesenta y seis tarjetas iguales», que sería la vista
de Assets otra vez, con más ruido.

---

## 3 · Lo que queda por preguntar a planta

Quedan dos.

1. **⛔ ¿Cuál es el divisor de cada registro Modbus, y el de `TENSION_L1_N`?**
   Es la pregunta 2 del propio PDF §3.9. Sin ella, los once puntos se declaran
   `crudo` y se pintan sin unidad. Bloquea F4, no el resto.
2. ¿Unidades de `NIVEL_TANQUE`, `FLUJO_INSTANTANEO` y los dos set points?
   (PDF §3.9.1.) Sigue sin respuesta: `.Attributes` **está vacío en el
   servidor**, comprobado en los tres sondeos del 09-09-2026. Las `nota` de
   «unidad no declarada» del catálogo actual siguen vigentes, no se retiran.

**Resueltas el 09-09-2026**, las dos en planta y no en el código:

- **Qué es `CONTROL`** — ver §1.2. Queda el rastro documental: el PDF sigue sin
  recogerlo.
- **Los duplicados** — se retiraron de `SENSORES/`, así que ya no hay que
  elegir canónico: sólo hay uno. Ver §1.1.

**La tercera —¿el historiador sirve las ramas nuevas?— se dio por resuelta en
planta, y no se ha podido confirmar.** Ver §4, que cambia de contenido pero no
de conclusión.

---

## 4 · ⛔ La historización se hizo en planta, y no se ha podido confirmar

El 09-09-2026 se historizaron las variables y se expusieron a la API. **Este
plan no puede darlo por bueno todavía**, y conviene ser preciso sobre por qué,
porque el motivo no es el trabajo hecho en planta.

Tres sondeos contra `/History` a lo largo del día, con la lectura en vivo
funcionando con normalidad en los tres (los sesenta y seis puntos responden con
`quality: 0`):

| Cuándo | Qué contestó `/History` |
|---|---|
| 19:47Z, 25 puntos | HTTP 500 en **todos** |
| Después de la historización, 25 puntos | HTTP 500 en **todos** |
| Variantes sobre un punto | `average`, `Interpolative`, `Raw` y sin agregado: **`ok` con cero muestras**; al repetir, 500 otra vez |
| Ventanas de 1 h, 6 h, 24 h, 7 d y 30 d | 500 en casi todas; la que contestó, cero muestras |

Dos hechos que, juntos, apuntan al servidor y no al árbol:

1. **Falla igual en `ac:TDCON/Motors/01/S1/vRMS_S1`**, de la máquina de
   vibraciones, que este plan no toca y que servía historia hasta ahora.
2. **El fallo es intermitente.** La misma petición da 500 y, repetida, `ok` con
   cero muestras. Un punto sin historizar no se comporta así: contesta de forma
   estable, con o sin datos.

Es la misma situación que ya se diagnosticó en este proyecto días atrás, cuando
FrameWorX devolvía 500 con cuerpo vacío en casi todos sus extremos: hoy `/Data`
se ha recuperado y `/History` no.

Consecuencia directa: **no se puede saber todavía qué puntos tienen serie
propia**, que es exactamente el dato que `historizadas()` lleva un año
protegiendo — la puerta que impide que una gráfica de «Carga del motor» pinte
la curva de la temperatura del tanque con otro rótulo.

**Por eso F6 sigue fuera del camino crítico y todo el catálogo nuevo se declara
`historizado: false`.** No es desconfianza hacia lo que se hizo en planta: es
que `historizado: true` es una afirmación medida, y hoy la medición no se puede
tomar. En cuanto `/History` responda de forma estable, F6 lo comprueba punto
por punto y el catálogo se corrige — con la sonda, que ya está escrita.

> **Y hay que comprobarlo punto por punto, no en bloque.** Que `/History`
> conteste no basta: en agosto de 2026 tres señales de este mismo árbol
> devolvieron la serie de la temperatura del tanque, con marcas de tiempo
> correctas y sin dar error. Por eso la sonda de F6 contrasta la última muestra
> contra la lectura en vivo del mismo punto: si la serie es de otro tag, no se
> parecen.

---

## 5 · Las fases

Commit por fase (§6 de CLAUDE.md). El orden no es negociable en F0→F3; de F4 en
adelante sí se puede reordenar según lo que conteste planta.

### F0 · Que esto no vuelva a pasar en silencio

**Antes de arreglar nada.** Si sólo se corrigen los tres tags, el tablero vuelve
a funcionar y el mecanismo que dejó pasar la deriva sigue intacto.

- `verificar-catalogo --real` deja de recorrer sólo las raíces declaradas:
  recorre también **el padre de cada raíz**, un nivel arriba, y lista las ramas
  hermanas que no conoce. Es lo que le habría hecho ver las doce ramas nuevas.
- Un guion nuevo, `sondear-arbol.mjs`, en la línea de
  `sondear-paginacion-historico.mjs`: vuelca el árbol real de una raíz para
  dejarlo escrito. Es el que produjo el inventario de §1.
- Se anota en [`HOJA-DE-RUTA-60-MEJORAS.md`](HOJA-DE-RUTA-60-MEJORAS.md) que
  `verificar-catalogo --real` no es una comprobación de una sesión con planta
  sino **una rutina periódica**: es la única que ve el contrato desde fuera.

Sin red no cambia nada, así que F0 entra en CI igual que hoy.

### F1 · El tanque deja de tener una raíz

`shared/eva/tanque/senales.js`:

- `RAIZ` (cadena) → `RAMAS` (mapa de id de rama → prefijo). `RAIZ` se conserva
  como puerta de una línea (§4.2) mientras haya quien la importe.
- Cada entrada del catálogo declara su `rama`, y `pointName()` la compone.
- `parsePointName()` deja de hacer un `startsWith(RAIZ)` único: resuelve contra
  las trece ramas. **Sigue devolviendo `null` ante lo desconocido** — un punto
  que no se reconoce es dato ausente, nunca una asignación a la señal
  equivocada.
- `sistemas.js`: `raices: [RAIZ]` → las trece.

Nada de esto añade una sola variable todavía. Es la fase que hace posible el
resto, y se prueba con las ocho de siempre.

### F2 · Los tres puntos rotos, y sólo ésos

Con F1 hecho, apuntar las tres señales rotas a su nombre actual:

| Clave de dominio | Punto nuevo |
|---|---|
| `nivelTanque` | `INSTRUMENTACION_DE_PROCESO/NIVEL_TANQUE` |
| `flujoInstantaneo` | `INSTRUMENTACION_DE_PROCESO/FLUJO_INSTANTANEO` |
| `modoVdf` | `MANDO_DEL_VARIADOR_VFD/Modo_AM_VDF` |

Y de paso, las otras dos que ahora viven en `INSTRUMENTACION_DE_PROCESO/`
porque su alias de `SENSORES/` se retiró: `temperaturaTanque` y
`presionRelativa`. **El tablero vuelve a leer 8 de 8.**

Es deliberadamente una fase suya: es la que quita el fallo de la pantalla, y
tiene que poder entregarse sin esperar a las respuestas de §3.

Ya no hay que elegir canónico entre duplicados —planta los retiró (§1.1)—, pero
la regla que se habría aplicado se deja escrita porque volverá a hacer falta:
**ante dos nombres para un tag, manda la rama del PLC**, y `SENSORES/` es la
capa de KPIs de ICONICS.

### F3 · `naturaleza`, y las alarmas del PLC

La fase de diseño de §2, más la primera cosecha de variables nuevas: **las ocho
alarmas y los dos puntos de `SEGURIDAD/`**. Se eligen primero porque son las
que más cambian lo que el tablero puede afirmar.

Hasta hoy `sistemas.js` declara, entre las limitaciones del tanque:

> «El servidor no publica alarmas para este árbol: el estado de cada señal es
> un cálculo del tablero, no un dato de ICONICS.»

**Con `ALARMAS/` publicada, esa frase deja de ser verdad**, y una limitación
declarada que ya no aplica es peor que ninguna: el asistente la repite. Se
sustituye por lo que sí es cierto — que ahora hay dos fuentes, el bit del PLC y
la banda calculada por el tablero, y que **no siempre van a coincidir**, porque
los umbrales del tablero son estimaciones nuestras y los del PLC son los del
programa.

Ese desacuerdo no se esconde ni se promedia: se enseña. Es información de
diagnóstico, no un conflicto que resolver.

⚠️ **El motor de diagnóstico no se toca en esta fase.** Que haya una fuente
nueva no autoriza a que puntúe: §2.3, el código puntúa y el modelo redacta, y
cambiar la puntuación es un plan aparte con su calibración medida.

### F4 · Lo que se mide de verdad: energía, variador y automatismo

Las veintidós de `MEDIDOR_DE_ENERGIA`, `LECTURA_VARIADOR_MODBUS_RTU` y
`AUTOMATISMO_LLENADO_VACIO`.

Depende de la pregunta 3 de §3. **Sin divisor confirmado entran como `crudo`**:
se leen, se enseñan, y se pintan **sin unidad**, con la nota de que el factor de
escala está sin confirmar. Es lo mismo que ya se hace con el caudal y la
presión desde agosto, y por el mismo motivo: preferimos un rótulo que confiesa
la duda a uno que inventa autoridad.

`TENSION_L1_N` = 276 V es el caso más claro: **no se rotula en voltios.**

### F5 · Los activos crecen de cuatro a seis

Aparecen dos piezas físicas que antes no asomaban por ninguna parte —las dos
electroválvulas y la bomba de aire— y un circuito de seguridad. Propuesta, a
confirmar con quien opera:

| Activo | Pregunta que responde |
|---|---|
| Tanque *(existe)* | ¿Hay agua, y en qué condiciones? |
| Bombeo *(existe)* | ¿Se está impulsando, y quién manda? |
| Distribución *(existe)* | ¿Sale agua, y con qué presión? |
| Eléctrico *(existe)* | ¿Con qué calidad de energía? |
| **Válvulas y aire** | ¿Por dónde está circulando, y en qué modo? |
| **Seguridad** | ¿Está el proceso habilitado, y se puede arrancar? |

Sigue siendo agrupación NUESTRA, por pregunta y no por sección del programa
(§0.2.3). Las trece ramas del servidor **no** se convierten en trece activos.

La pregunta del activo «Seguridad» tiene dos mitades porque la rama tiene dos
puntos, y responden a cosas distintas: `CONTROL` dice si el proceso está
habilitado, `PARO_DE_EMERGENCIA` si se puede arrancar. Con `CONTROL` en esta
rama es el único activo del tablero que **enseña un mando** además de un
estado — leído, nunca escrito (F7).

### F6 · ⛔ La historia, cuando el historiador vuelva

Bloqueada por §4, y **sólo por el servidor**: la historización ya se hizo en
planta el 09-09-2026. Lo que falta es poder medirla.

Cuando `/History` responda de forma estable: recorrer punto por punto qué serie
devuelve de verdad, contrastando la última muestra contra la lectura en vivo
del mismo tag —que es como se descubrió en agosto que tres señales devolvían la
temperatura del tanque sin dar error—, y sólo entonces poner
`historizado: true` donde corresponda.

La sonda ya está escrita y es la que produjo la tabla de §4; entra en
`scripts/` junto a la de F0. El catálogo no se toca hasta que ella conteste:
una serie declarada de oídas es peor que una gráfica que falta.

### F7 · ⛔ La escritura NO entra en este plan

Veinte de las variables nuevas son escribibles: `START_STOP_VFD`, `MTTO_S1`,
`SETPOINT_LLENANDO`, `ARRANQUE_PARO_VACIADO`… y `SEGURIDAD/CONTROL`, que
enciende y apaga el proceso entero (§1.2).

El puente sabe escribir (`writePoint`, con confirmación por relectura, Plan 21
F5) y sabe registrar quién lo hizo (diario de accionamientos, Plan 22 F3). Lo
que **no** está encendido es la autenticación: `AUTH_HABILITADA=false`, porque
el tablero todavía no sabe pedir un token (§2.11, Plan 25).

Un tablero sin autenticación que pueda arrancar una bomba o mover un set point
de llenado en un banco físico no es una función pendiente: **es un riesgo.**
Este plan las declara `mando` y **las lee**; no expone ni un control de
escritura. La escritura es un plan posterior, después del Plan 25, y con su
propia conversación sobre quién puede hacer qué.

Y dentro de esa conversación, `SEGURIDAD/CONTROL` no es una más de las veinte:
es la de mayor alcance del árbol, y vive en la rama del paro de emergencia. Aun
con la autenticación encendida, merece decidirse aparte —quién, con qué
confirmación, y si el tablero debe poder hacerlo siquiera— en lugar de entrar
por arrastre con el resto de los mandos.

### F8 · Que el texto deje de decir «ocho»

`grep "ocho señales"` da hoy una treintena de aciertos, y no son comentarios
decorativos:

- `backend/ia/conversacion/chat.mjs` **instruye al modelo** con «hay 8 señales,
  5 en banda y 3 en reposo, di exactamente eso; no restes, no sumes». Con
  sesenta y seis variables esa instrucción es falsa y el asistente la obedecerá.
- `verificar-instrucciones.mjs` existe para cazar justo eso: que el prompt no
  se contradiga con el registro. **Debería fallar cuando F3 aterrice**, y si no
  falla, el que está mal es el verificador.
- Las cabeceras de `senales.js`, `sistema.js`, `estadoTanque.js`, `riesgos.js`,
  `activos.js`, `modulos.js` y `config.mjs`. §4.1: si el motivo de la cabecera
  ya no es cierto, se corrige **en el mismo commit** que lo invalida. Así que
  esta fase no es una limpieza final: es una obligación repartida por F1–F5, y
  F8 sólo barre lo que quede.
- i18n: cada `label`, `corto` y `nota` nueva necesita sus dos idiomas.
  `verificar-i18n.mjs` y `verificar-textos.mjs` lo exigen, y son los que
  convierten «se me olvidó traducir una» en un rojo.

---

## 6 · Lo que este plan NO hace

- **No reabre §2.1.** Todo esto entra por ICONICS. No hay OPC-UA ni Modbus
  directo: `LECTURA_VARIADOR_MODBUS_RTU` es Modbus **que el PLC ya leyó** y
  publicó en su DB; nosotros lo tomamos de ICONICS como todo lo demás.
- **No crea un sistema ni un módulo nuevos.** Sigue siendo el sistema `tanque`
  del módulo `monitoreo` (§4.7). Más variables de la misma máquina, con la
  misma fuente.
- **No toca vibraciones.** Sale en §4 sólo como prueba de que el fallo del
  historiador es del servidor. Su propia deriva —166 puntos en el servidor sin
  declarar, que el verificador ya lista— es otro asunto y otro plan.
- **No toca el motor de diagnóstico** (§2.3, y F3).
- **No expone escritura** (F7).
- **No inventa unidades, divisores ni umbrales.** Lo que no está medido entra
  como `crudo` o con `nota`, nunca con un número puesto a ojo (§2.5).

---

## 7 · Cómo se comprueba cada fase

Además de la tanda de siempre (`npm run lint && npm run types && npm run
verificar` en la raíz, `npm test` en los dos paquetes):

| Fase | Lo que tiene que pasar |
|---|---|
| F0 | `verificar-catalogo --real` lista las ramas hermanas no declaradas |
| F1 | los ocho puntos siguen resolviéndose; `parsePointName` sigue dando `null` ante lo ajeno |
| F2 | `verificar-catalogo --real` no reporta ningún declarado que el servidor no tenga |
| F3 | `verificar-riesgos.mjs`, y `verificar-instrucciones.mjs` **falla** hasta que el prompt se corrige |
| F4 | `verificar-transporte-falso.mjs`: el simulador sirve **todos** los puntos declarados, o el fallo silencioso de §0 vuelve por la otra puerta |
| F5 | `verificar-dominio.mjs` + las vistas de planta y la maqueta 3D |
| F6 | la sonda de historia, contra el servidor de verdad |
| F8 | `verificar-i18n.mjs`, `verificar-textos.mjs`, `verificar-instrucciones.mjs` |

Y en cada una: `verificar-modulos.mjs`, que es el que garantiza que nada de
esto cruza la frontera con Predicción.
