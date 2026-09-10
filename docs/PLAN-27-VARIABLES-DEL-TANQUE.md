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
2. **No es una medida: es el mando de mayor alcance de todo el árbol, y ya se
   escribe** — no desde este plan, desde antes. Un `START_STOP_VFD` arranca una
   bomba; `CONTROL` gobierna el proceso entero, y `controlar_bomba` lleva
   tiempo escribiéndolo, guardado por `ICONICS_READ_ONLY` y no por la
   autenticación (que sigue apagada y no protege nada, §2.11). Que ahora viva
   en `SEGURIDAD/` lo dice bien —es la rama del paro de emergencia—, y es la
   razón de que F7 lo trate aparte: de las variables de este plan que SÍ son
   nuevas, ninguna hereda esa escritura por arrastre.

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

### 2.1 ¿No convendría un catálogo de Assets del que todo se derive?

Es la pregunta que hizo el usuario el 09-09-2026, a raíz de ver cuántos
archivos tocó el bugfix de `CONTROL` (commit `4dcc12d`) para mover un solo
punto. La respuesta corta es **sí, y ya es el plan** — pero merece decirse por
qué ese bugfix no lo contradice, sino que señala exactamente dónde faltaba.

`shared/eva/tanque/senales.js` **ya es** ese catálogo: una entrada por señal,
con su `tag`, `label`, `unidad`, `decimales`, `tipo`, `activo` y ahora, con este
plan, su `rama` (F1), su `naturaleza` (§2) y su nombre `hda:` cuando lo tenga
(F6). Mover una señal declarada ahí es cambiar **una línea**, y
`verificar-catalogo --real` (F0, ya en el repo) avisa solo si esa línea se
queda desactualizada frente al servidor.

**Lo que rompió el bugfix de hoy no pasó por ese catálogo — pasó por FUERA de
él, a propósito.** `SEGURIDAD/CONTROL` (el mando maestro del proceso, §1.2) se
diseñó como «vive aparte» porque no es una medida: no tiene escala, ni banda,
ni umbral que evaluar, y `senales.js` sólo sabía describir señales de ese tipo.
El resultado fue un `TAG_CONTROL_BOMBA` y un `TAG_CONTROL` escritos a mano en
dos archivos de producción, sin ningún catálogo detrás — y cuando planta lo
movió, arreglarlo fue un `grep` por el repositorio, no una línea.

Esa es la lección real, y coincide con lo que el usuario pide: **la solución no
es inventar un catálogo nuevo, es que ESTE catálogo deje de tener puntos que
viven fuera de él por no encajar en su forma.** El campo `naturaleza` de §2 ya
resuelve eso — un `mando` como `CONTROL` cabe en el mismo catálogo que un
`medida` como el nivel, sólo que se evalúa distinto — así que **F3** (que ya
era la fase que introduce `naturaleza` y da de alta los primeros puntos de
`SEGURIDAD/`) pasa a incluir también `CONTROL` como una entrada más de
`senales.js` (`naturaleza: "mando"`, sin `escala` ni `umbral`), y con él F7
cambia `TAG_CONTROL_BOMBA`/`TAG_CONTROL` para que lean su punto de
`pointName("control")` en vez de llevarlo hardcodeado cada uno por su lado. No
antes de F3: darlo de alta ya en F1, sin que `createSenal()`/`estadoDeSenal()`
sepan todavía de `naturaleza`, sería evaluarlo con las reglas de una medida que
no es. La próxima vez que planta mueva ese punto, el cambio es una línea en el
catálogo, y `verificar-catalogo --real` lo confirma solo.

**Una cosa que un catálogo no puede prometer, y conviene decirlo para no
generar una expectativa falsa: alguien sigue teniendo que escribir esa línea.**
Nada de lo que hay aquí ni lo que pueda construirse detecta por sí solo que
`SNIVEL_TANQUE` en la carpeta vieja y `NIVEL_TANQUE` en la nueva son la MISMA
señal — eso es conocimiento de planta, no algo que se infiera del árbol. Lo que
el catálogo sí puede prometer, y es lo que pide el usuario, es que ese cambio
sea **un lugar, no varios**, y que el `--real` de F0 lo señale el mismo día que
ocurre, en vez de descubrirse por una pantalla que deja de leer.

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

## 4 · ⛔ El diagnóstico anterior estaba mal enfocado: hacía falta el namespace `hda:`, no `ac:`

Las dos primeras versiones de esta sección decían que el historiador estaba
caído, con `/History` devolviendo 500 de forma intermitente incluso en
vibraciones. **Ese síntoma era real, pero la conclusión era la equivocada**: no
se estaba preguntando mal el servidor, se estaba preguntando por el árbol
equivocado.

El 09-09-2026 el usuario aportó la pieza que faltaba: un ejemplo de cómo se lee
un histórico de verdad, `hda:\Configuration\DEMO TANQUE\INSTRUMENTACION_PROCESO:NIVEL_TANQUE`,
y la captura del árbol de Hyper Historian. **`/History` no habla el mismo
namespace que `/Data` y `browse()`.** Las lecturas en vivo y la navegación de
activos usan `ac:TDCON/DEMO/…` (AssetWorX); el historiador tiene su PROPIO
árbol, `hda:\Configuration\DEMO TANQUE\…`, y es ahí donde hay que pedir la
serie — no hay traducción automática de uno a otro para `/History`, y todos
los sondeos de las dos versiones anteriores preguntaban por el nombre `ac:`.
Es la misma pista que ya estaba escrita en la cabecera de `senales.js` desde
agosto —`INDICE_DESVIACION_VOLTAJE` se historiza contra
`hda:\Configuration\DEMO DANONE:Tension`— y que no se había generalizado a
todo el árbol nuevo hasta ahora.

**Confirmado por `browse()` el 09-09-2026**, el árbol `hda:` mira exactamente
las mismas doce ramas que `ac:TDCON/DEMO/`, con los mismos nombres de carpeta:

```
hda:\Configuration\DEMO TANQUE
    ├─ INSTRUMENTACION_PROCESO       (NIVEL_TANQUE, TEMPERATURA_TANQUE,
    │                                 FLUJO_INSTANTANEO, PRESION_RELATIVA)
    ├─ MANDO_DEL_VARIADOR_VFD, SOLENOIDE_1, SOLENOIDE_2, BOMBA_DE_AIRE,
    │  AUTOMATISMO_LLENADO_VACIADO, LECTURA_VARIADOR_MODBUS_RTU,
    │  MEDIDOR_DE_ENERGIA, ALARMAS, ADVERTENCIAS_ESTADO_OPERACION,
    │  CONTADORES_VARAIBLES_MAQUINA, SEGURIDAD
    └─ (sueltos, en la raíz): Flujo Lmin, Presion mBar, Tension  ← ver abajo
```

**Con la ruta correcta, `/History` deja de dar 500.** Devuelve `ok: true` para
los ocho puntos probados de `INSTRUMENTACION_PROCESO`, `MEDIDOR_DE_ENERGIA` y
`SEGURIDAD`, en ventanas de 1 h a 30 días. Eso descarta que el servicio de
historial esté caído — la conclusión de las dos versiones anteriores de esta
sección era el diagnóstico equivocado.

**Lo que `/History` no ha devuelto todavía, en ninguna ventana probada, es una
sola muestra.** Ni las cuatro carpetas nuevas ni los tres puntos sueltos de la
raíz (`Flujo Lmin`, `Presion mBar`, `Tension` — que por nombre y forma son el
resto de la reubicación que ya afectó a `INDICE_DESVIACION_VOLTAJE` en agosto,
del área `DEMO DANONE` renombrada a `DEMO TANQUE`) tienen ni una muestra en 1 h,
6 h, 24 h, 7 días o 30 días. Y una ventana de sólo 15 minutos sobre un punto
nuevo sí volvió a dar 500, con cualquier agregado — el mismo síntoma
intermitente de siempre, ahora en un caso más estrecho.

**No se puede concluir todavía si esto es «la colección empezó hace muy poco y
aún no hay nada que devolver» o «algo más sigue sin funcionar».** Lo primero
es lo más probable dado que el usuario confirma haber historizado estas
variables el mismo día; lo segundo no se descarta con lo medido hasta ahora
para los tres puntos que deberían traer casi un mes de historia previa
(`Flujo Lmin`, `Presion mBar`, `Tension`) si el renombrado de área conservó los
datos archivados — y devuelven cero muestras igual que las carpetas
recién creadas.

**Por eso F6 sigue fuera del camino crítico, pero por un motivo distinto al que
decía esta sección antes: ya no es «el servidor no contesta», es «contesta, y
de momento no trae nada».** Todo el catálogo nuevo se sigue declarando
`historizado: false` hasta que una consulta `hda:` devuelva al menos una
muestra que se pueda contrastar contra la lectura en vivo del mismo punto —el
mismo criterio de siempre: que `/History` conteste no basta, hay que comprobar
que la serie es la SUYA, no la de otro tag (así se descubrió en agosto que tres
señales devolvían la temperatura del tanque). La sonda que hizo este sondeo
sale reforzada en F6: recorre `ac:` para el valor en vivo y `hda:` para la
serie, y ahora sabe construir el segundo nombre a partir del primero.

### 4.1 · 09/10-09-2026 — Las trece ramas SÍ tienen serie propia, y julio ya estaba (parcialmente) ahí

Dos sesiones después, con el árbol reorganizado ya un día más maduro, se repitió
el sondeo por rama y cambió la conclusión de arriba en dos puntos:

**Las doce ramas nuevas ya devuelven muestras reales**, no cero. Cada una
—`INSTRUMENTACION_PROCESO`, `SOLENOIDE_1`, `SOLENOIDE_2`, `BOMBA_DE_AIRE`,
`AUTOMATISMO_LLENADO_VACIADO`, `LECTURA_VARIADOR_MODBUS_RTU`,
`MEDIDOR_DE_ENERGIA`, `ALARMAS`, `ADVERTENCIAS_ESTADO_OPERACION`,
`CONTADORES_VARAIBLES_MAQUINA`, `SEGURIDAD`, `MANDO_DEL_VARIADOR_VFD`— tiene ya
al menos una muestra reciente por punto. Pero ninguna era todavía una historia
*contigua*: bloques de horas separados por huecos de medio día a un día
completo, compatibles con una colección que se enciende y apaga, no con un
fallo. Comprobado con `NIVEL_TANQUE` en detalle: tres tramos densos de ~6-7 h
cada uno entre el 07-09 16:30 y el 10-09, y nada en absoluto antes de eso —hasta
donde se sondeó, 96 h atrás.

**Ese "nada antes" resultó ser incompleto, no falso.** El sondeo de `NIVEL_TANQUE`
sólo miró 96 h hacia atrás; nunca llegó a julio. Sondeando los tres puntos
sueltos de la raíz (`Flujo Lmin`, `Presion mBar`, `Tension` — el resto de la
reubicación de `INDICE_DESVIACION_VOLTAJE`) con ventanas de meses sí apareció lo
que el usuario recordaba: **historia real y contigua del 2026-07-01 al
2026-08-07**, con un patrón de lunes a viernes (fin de semana sin muestra) y
sólo ~11 de 24 horas activas por día — compatible con una instalación que sólo
corría en horario de trabajo. Desde el 08-08 esos tres puntos están muertos.
Son casi con toda seguridad los antecesores, con el nombre de área viejo
(`DEMO DANONE`), de `flujoInstantaneo`, `presionRelativa` y `tensionLinea` —
que hoy ya no leen de ahí.

**Nombres `hda:` que no derivan del `ac:` por regla fija — confirmado con dos
casos concretos**, no sólo en teoría: `DP_ENERGIA_APARENTEL1` (catálogo) es
`DP_EENERGIA_APARENTEL1` en el servidor (typo, doble E), y `Modo_AM_VDF`
(catálogo) es `MODO_AM_VDF` en mayúsculas. Los dos se confirmaron con
`browse()` sobre la carpeta, no adivinando.

### 4.2 · 10-09-2026 — Julio insertado a propósito en las 50 señales del árbol actual

A petición del usuario, y con las dos correcciones de arriba ya mapeadas, se
insertó un mes completo simulado (2026-07-01 a 2026-07-31, horario laboral
07:00-17:00, cada 5 min) contra el servidor real, con
`node scripts/generar-historia-simulada.mjs --todas` (ahora soporta ese modo,
más `--solo <clave>` para repetir una sola señal). Usa la física ya calibrada
de `shared/eva/tanque/simulador.js` —la misma que ve la demo en vivo— en vez de
duplicar fórmulas, y escribe contra `hda:` con la tabla rama→carpeta de este
archivo. Quedan fuera a propósito `cargaMotor` y `eficienciaEnergetica`: no
tienen serie propia, comparten la de `temperaturaTanque` (§ cabecera de
`senales.js`).

49 de 50 señales escribieron sus 2.783 muestras a la primera. `nivelTanque`
falló las 2.783 con `"Bad - Entry Exists"` — porque, a diferencia de las 49
restantes, **ya tenía datos reales de julio de una campaña anterior** (valores
que no coinciden con la física nueva), y el borrado previo no llegó a limpiarlos
a tiempo antes del reintento de escritura — contención transitoria, al ser el
punto más activo de todo el árbol (colección en vivo cada pocos segundos). Un
segundo ciclo borrar→escribir, ya sin esa contención, lo resolvió por completo
(el script ahora reintenta esto solo). Esto significa que la conclusión de
§4.1 sobre `NIVEL_TANQUE` — "nada antes del 07-09" — estaba incompleta: sólo no
se había mirado lo bastante atrás.

**Sigue pendiente de este lado del usuario**: confirmar en la consola de
ICONICS que el `Min Time Extent` del Data Logger sigue alto (ver la cabecera de
`generar-historia-simulada.mjs`, incidente del 26-08) — si volvió a bajar,
julio entero puede purgarse solo, sin ningún error visible, y habría que
repetir la inserción.

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

- Se añade `RAMAS` (mapa de id de rama → prefijo), con las trece.
- Cada entrada del catálogo declara su `rama`, y `pointName()` la compone.
- `parsePointName()` deja de hacer un `startsWith(RAIZ)` único: resuelve contra
  las trece ramas. **Sigue devolviendo `null` ante lo desconocido** — un punto
  que no se reconoce es dato ausente, nunca una asignación a la señal
  equivocada.
- `sistemas.js`: `raices: [RAIZ]` → las trece.

`CONTROL` **no entra al catálogo en esta fase.** §2.1 explica por qué debe
entrar —es la señal que cierra el hueco del bugfix de hoy—, pero meterlo ya
significaría que `createSenal()`/`estadoDeSenal()` lo evaluaran como una señal
de `naturaleza` desconocida, que es precisamente el mecanismo que F3 construye
todavía. Entra ahí, como parte de esa primera cosecha, no antes.

`RAIZ` **no desaparece, pero cambia lo que significa**: de la única raíz del
sistema (`SENSORES/`, hoy con sólo 3 de las 66 variables) pasa a ser el prefijo
común de las trece — `ac:TDCON/DEMO/`. No es un capricho: tres sitios lo
importan hoy sólo para MOSTRARLO, nunca para resolver un punto —
`AssetsEva.jsx` (el botón que salta al árbol de la demo en el explorador de
Assets), `MaquetaTanque3D.jsx` (el pie de foto «datos de…» bajo la maqueta) y
`estadoTanque.js` (el campo `raiz` del resumen que lee el asistente) — y para
los tres, «la raíz de la instalación» es justo el `ac:TDCON/DEMO/` que ya
calculaba `Sidebar.jsx` a mano (`RAIZ.replace(/\/?SENSORES\/?$/, "")`, ahora
innecesario: ya no hay que quitarle nada). Es la única puerta de §4.2 real de
esta fase: mismo nombre exportado, valor corregido, tres importadores que
ganan precisión sin que se les toque una línea.

Nada de esto añade una sola variable al catálogo. Es la fase que hace posible
el resto, y se prueba con las ocho de siempre.

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
rama es el único activo del tablero que enseña un mando además de un estado —
y ya escribible desde antes de este plan, no por él (F7).

### F6 · ✅ La historia, con el namespace `hda:` — cerrado el 10-09-2026

Cincuenta de las cincuenta y dos señales del catálogo tienen hoy `historizado:
true`, con su nombre `hda:` propio en `puntoHistorico()`
(`shared/eva/tanque/senales.js`). Quedan fuera, a propósito y para siempre,
`cargaMotor` y `eficienciaEnergetica`: el historiador les sigue devolviendo la
serie de `temperaturaTanque`, el mismo cruce que documenta la cabecera de
`senales.js` desde agosto.

**La tabla rama→carpeta**, confirmada con `browse()` contra el servidor real:
las trece carpetas son las mismas en `ac:` y en `hda:`, salvo que cuatro
pierden la partícula `_DE_`/`_INFERIOR`/`_SUPERIOR` en `hda:`
(`INSTRUMENTACION_PROCESO`, `SOLENOIDE_1`, `SOLENOIDE_2`,
`AUTOMATISMO_LLENADO_VACIADO`). **Dos nombres no derivan por regla fija**, tal
como anticipaba esta sección: `DP_ENERGIA_APARENTEL1` es
`DP_EENERGIA_APARENTEL1` en el servidor (typo real de planta, doble E) y
`Modo_AM_VDF` es `MODO_AM_VDF` (mayúsculas). Los dos se confirmaron con
`browse()`, no se adivinaron.

**El transporte falso (`ICONICS_FAKE=true`) necesitó su propio ajuste**:
`fakeClient.mjs` resolvía el histórico con `parsePointName` (sólo reconoce
`ac:`), y con el histórico pidiéndose ya por `hda:` dejó de encontrar la
clave. `parsePuntoHistorico()` es su espejo, y `readHistory` prueba los dos.

**Un efecto colateral real, no un bug**: `historizadas()` pasó de cinco a
cincuenta, y varias piezas de la UI —la banda de KPIs (`Demo-EVA/lib/modelo.js`),
el selector de "comparar señales" (`GraficaComparada.jsx`)— asumían que
"tiene serie propia" equivalía a "es una medida continua que tiene sentido
graficar o normalizar a 0-100 %". Con alarmas y mandos booleanos historizados,
esa asunción rompía con `TypeError: v.toFixed is not a function`. Se separó en
`historizadasMedidas()` (`tipo: "real"` sin `naturaleza` especial): doce
señales, la banda de KPIs y el comparador. El selector de rango de
`DetalleActivo.jsx` no necesitó el mismo filtro — mostrar un rango de fechas
para ver la historia de una alarma sigue siendo una pregunta razonable, y
ahora "Bombeo" también la puede contestar.

La sonda de julio (`scripts/generar-historia-simulada.mjs --todas`) ya
escribió un mes completo contra las cincuenta con este mismo mapeo, antes de
que el mapeo se moviera al catálogo — ver el hallazgo de julio en §4.2.

### F7 · ⛔ La escritura de las DIECINUEVE variables nuevas NO entra en este plan

Diecinueve de las variables nuevas son escribibles: `START_STOP_VFD`,
`MTTO_S1`, `SETPOINT_LLENANDO`, `ARRANQUE_PARO_VACIADO`…

**`SEGURIDAD/CONTROL` no es una veinteava: ya se escribe hoy, desde antes de
este plan**, y su corrección de tag (commit `4dcc12d`) fue un bugfix urgente,
no parte de esta fase. `controlar_bomba` (herramienta del asistente) y el botón
de «Controles» del tablero llevan tiempo escribiendo ese punto — corregido para
que apunten a `SEGURIDAD/CONTROL` en vez de a la ruta que planta ya retiró.
Vale la pena decir esto sin rodeos porque cambia el riesgo: no es una capacidad
que este plan podría abrir, es una que YA estaba abierta y que un cambio de
árbol dejó apuntando a un tag fantasma.

Y su guarda no es la que se podría suponer. **No es `AUTH_HABILITADA`** —esa
sigue apagada porque el tablero no sabe pedir un token (§2.11, Plan 25) y no
protege nada hoy— **es `ICONICS_READ_ONLY`**, que en el entorno de desarrollo
de este plan está en `false`: la escritura está activa ahora mismo. Confundir
las dos guardas fue el error de la versión anterior de esta sección, que
declaraba `CONTROL` como algo pendiente de exponer.

El puente sabe escribir (`writePoint`, con confirmación por relectura, Plan 21
F5) y sabe registrar quién lo hizo (diario de accionamientos, Plan 22 F3) — es
la infraestructura que ya usa `controlar_bomba`. Lo que este plan sí decide es
no EXTENDER esa superficie a las diecinueve variables nuevas: un tablero sin
autenticación que además pudiera mover un set point de llenado o forzar un
solenoide en un banco físico no es una función pendiente, **es un riesgo
mayor** que el que ya existe con la bomba. Éstas se declaran `mando` y **se
leen**; su escritura es un plan posterior, después del Plan 25, y con su propia
conversación sobre quién puede hacer qué.

`SEGURIDAD/CONTROL` sigue siendo un caso aparte dentro de esa conversación
futura: es el mando de mayor alcance del árbol —gobierna el proceso entero, no
un equipo— y vive junto al paro de emergencia. Cuando llegue el Plan de
autenticación, merece revisarse primero y con más cuidado que el resto, no
heredar sus guardas por arrastre.

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
