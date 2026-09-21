# PLAN 34 — Las máquinas se configuran desde el árbol de ICONICS

**Estado:** F0, F0.2 y F1 completadas · F2–F5 por completar
**Rama:** `Vibraciones1.0`
**Fecha:** 21-09-2026

> **Mientras dure esta rama, la ESTACIÓN DE LLENADO está cerrada.** Este plan
> migra **sólo vibraciones**. El tanque se mira —es el espejo— y **no se
> toca** (`CLAUDE.md` §1). Su migración es otra rama, y §7 dice por qué no
> puede ser la misma.

---

## 1. Qué se quiere, y por qué no es lo que ya hay

**Que una máquina se dé de alta configurándola desde el árbol de ICONICS, no
escribiendo su catálogo a mano.** El árbol es la fuente de verdad sobre qué
existe: si publica X variables, ésas son las que hay.

El Plan 33 construyó casi toda la maquinaria para esto —el tipo, la forma de
la configuración, el constructor del registro, la vista de Configuración—.
Lo que **falta es la dirección del flujo**. Hoy es:

```
catálogo escrito a mano  →  configuración
```

Y tiene que ser:

```
árbol de ICONICS  →  configuración  →  registro
```

La diferencia no es cosmética. El generador actual lo dice de sí mismo, y es
la frase que justifica este plan entero:

> «`historyVerified` se pone aquí a `true` **copiando la lista blanca del
> catálogo** […] y NO porque este guion lo haya comprobado. Es la diferencia
> entre **heredar una verificación y hacerla**.»
> — `scripts/generar-configuracion-vibraciones.mjs`

Heredar una verificación hereda también sus errores. §2 es la prueba.

---

## 2. Lo que está roto hoy, medido contra el servidor

Medido el **21-09-2026** contra ICONICS real, con el tanque como control en la
misma llamada. Estas cifras son la línea base del plan.

### 2.1 El grupo del historiador dejó de existir

El código pide un grupo que ya no está en el servidor:

| | |
|---|---|
| Lo que pide el código | `hda:\Configuration\DEMO 3:` |
| Lo que hay en el servidor | `hda:\Configuration\DEMO_VIBRACIONES\` |

`DEMO 3` devuelve **500** al explorarlo y `ok=false` al pedir serie.
`DEMO_VIBRACIONES` responde. Listados los 18 grupos del historiador: están
`DEMO TANQUE` y `DEMO_VIBRACIONES`; **no existen `DEMO 3` ni `DEMO DANONE`**
—este último es el grupo de control que usa
`scripts/comprobar-historia-vibraciones.mjs`, así que esa sonda también apunta
a algo que no está—.

**Y cambió la forma, no sólo el nombre.** El grupo viejo era plano
(`DEMO 3:vRMS_S1`); el nuevo tiene **carpeta por apoyo**
(`DEMO_VIBRACIONES\S1:vRMS_S1`).

Es el **incidente B10 otra vez** (09-09-2026): el nombre histórico dejó de
poder deducirse, y el síntoma fue «no hay datos» en vez de un error.

### 2.2 Con la ruta correcta, sí hay datos

Ventana de 7 días, agregado `Average`:

| Tag | Muestras | ≠ 0 |
|---|---|---|
| `S1:aRMS_S1` | 1749 | 1745 |
| `S1:aPeak_S1` | 1754 | 1750 |
| `S1:DKW_S1` | 1754 | 1750 |
| `S3:DKW_S3` | 1760 | 1756 |
| `S1:vRMS_S1` | 326 | 316 |
| `V20:SPEED_BMS` | 381 | 374 |
| **CONTROL `DEMO TANQUE:Tension`** | 1830 | — |

**El historiador nunca dejó de registrar.** La premisa del Plan 32 F2 —«el
grupo `DEMO 3` devuelve 0 muestras, averiguar si dejó de registrar»— queda
contestada: registraba, y le preguntábamos al sitio equivocado.

### 2.3 El registro está detenido desde el 15-09, y eso es de planta

Última muestra de vibraciones: **2026-09-15 23:00**. Última del tanque:
**2026-09-15 23:01**. En vivo, los tres apoyos leen `value: 0` con
`quality: 0`.

Para las dos máquinas a la vez ⇒ **no es de vibraciones y no es nuestro**.
Hay ~6 días sin registro que ningún cambio de código rellena. Se anota aquí y
no se disfraza (`CLAUDE.md` §2.4).

### 2.4 Una ventana larga devuelve vacío SIN dar error

Pedir **30 días** devuelve `ok=true` con **cero muestras** —también en el
tanque, que sí tiene datos dentro de esa ventana—. A 7 días vuelven 1830.

Es el modo de fallo que §2.4 de `CLAUDE.md` prohíbe: ausencia disfrazada de
respuesta buena. **No está diagnosticado** si es del cliente (paginación,
`HISTORY_MAX_PAGINAS`, `HISTORY_MAX_MS`) o del servidor. Ver §8.

### 2.5 Las 40 claves declaradas: 36 existen, 4 no

Cruzadas las 40 de `CON_SERIE` contra los **94 tags** reales del árbol:

| | |
|---|---|
| Con serie real | **36** |
| No existen en el árbol | **4** |

Las cuatro son las de aviso: `Warning_S1`, `Warning_S2`, `Warning_S3`,
`WARNING_BMS`. No están bajo ningún nombre.

### 2.6 `aPeak_S1` devuelve la serie de `aRMS_S1` — al 100%

El catálogo ya lo decía y **queda confirmado con su alcance exacto**:

```
aPeak_S1  n=1812     timestamps comunes: 1805
aRMS_S1   n=1805     valores IDÉNTICOS:  1805  (100,0 %)
```

Contraste que lo confirma: en **S2**, `aPeak_S2` vs `aRMS_S2` coinciden en
**3 de 321**. Ahí sí son señales distintas.

> **Consecuencia para el Plan 32 F4:** el **factor de cresta** `aPeak/aRMS`
> —«la mejor relación valor/esfuerzo del módulo»— **no se puede calcular
> sobre historia en S1**: daría exactamente 1,0 siempre. En S2 y S3 sí. En
> vivo hay que re-verificarlo cuando la máquina gire (hoy todo es 0).

### 2.7 Defecto nuevo: las nueve calidades son la misma serie

No estaba documentado en ninguna parte:

```
QC_vRMS_S1  QC_aRMS_S1  QC_DKW_S1
QC_vRMS_S2  QC_aRMS_S2  QC_DKW_S2   → las NUEVE, huella idéntica
QC_vRMS_S3  QC_aRMS_S3  QC_DKW_S3
```

Las nueve están declaradas en `CON_SERIE` como calidad independiente por
medida y por apoyo. **Devuelven la misma serie.** Importa porque la calidad
manda sobre el veto del motor (`CLAUDE.md` §2.4): un veto por `qcDKW_S3`
estaría leyendo otra cosa.

(`CONECTED 1/2/3` y `NOT 1/2/3` comparten serie igual, pero no se declaran.)

### 2.8 El árbol publica 58 tags que el código no declara

Entre ellos, dos grupos que el Plan 32 pide por su nombre:

- **`MonState_e_f_BPFO/BPFI/FTF_S1..S3`** — las vigilancias de frecuencia de
  defecto que §4.2 del Plan 32 quiere encender.
- **`V20:HorasMarcha`, `Numero de arranques`, `Temperaturadeldevanado`,
  `TOTAL KWH_BMS`** — `HorasMarcha` es exposición acumulada, y hoy vibraciones
  tiene `desgaste: null` por no tener ninguna.

**No entran en este plan.** Son alcance del Plan 32 F4/F5. Se listan porque
son la prueba de que el catálogo a mano se quedó corto respecto al árbol, que
es justamente la tesis de este plan.

---

## 3. Lo que YA existe y no se reescribe

Antes de proponer nada: esto está construido, probado y **se reutiliza tal
cual**. Reescribirlo sería el error.

| Pieza | Qué aporta |
|---|---|
| `shared/eva/tipos/vibraciones.js` | El TIPO: 18 reglas, umbrales, ISO, `ROLES`, `ROLES_REQUERIDOS`. **Por referencia, no copiado** |
| `shared/eva/comun/configuracionMaquina.js` | La FORMA: `pointName` + `historyPointName` **separados**, `historyVerified`, los 4 estados |
| `shared/eva/comun/construirSistema.js` | Configuración → entrada del registro, indistinguible de una escrita a mano |
| `backend/lib/verificarConfiguracion.mjs` | Comprueba contra ICONICS si la configuración sigue siendo CIERTA |
| `Planta › Configuración` (Plan 33 F5) | La vista, hoy de sólo lectura |
| `verificar-vibraciones-configurada.mjs` | Compara las dos (22 comprobaciones) |

**La frontera tipo/instancia ya está decidida**, y su criterio es una sola
pregunta (`tipos/vibraciones.js`):

> «¿Esto seguiría siendo cierto en OTRO motor del mismo tipo?»
> sí → el tipo · no → la instancia

Este plan **no reabre esa frontera**. La usa.

---

## 4. El hueco que hay que cerrar sí o sí

**Una máquina configurada hoy no diagnostica.** Trae `dominio: null` y
`evaluarRiesgosDe` **se niega a evaluar**.

No es un descuido, está medido el 18-09-2026: pasarle un dominio vacío a
`evaluarRiesgosVibracion` devuelve **tres riesgos ACTIVOS falsos** —los tres
`dkw-sin-referencia`, una regla que dispara ante la AUSENCIA de dato—. La
regla es correcta; falso sería afirmarlos sobre apoyos no declarados.

La causa es de forma: las reglas esperan `{canales, variador, alarmas}` y la
configuración da una **lista plana de variables con su rol**.

> Migrar vibraciones sin cerrar esto **pierde el diagnóstico**, que es el
> objetivo 3 del Plan 32. Por eso F3 existe y por eso es la fase de riesgo.

Lo que lo hace viable: `ROLES` y `ROLES_REQUERIDOS` ya están en el tipo, y
`rolDe(familia, clave)` ya lo usa el generador. La información para
reconstruir la forma **está**; falta el adaptador.

---

## 5. Las fases

### F0 — La ruta del historiador dice la verdad ✅

**Completada el 21-09-2026.**

**Objetivo.** Que vibraciones lea su historia del grupo que existe.

Es un arreglo **táctico y deliberadamente provisional**: F5 lo retira. Se hace
igual porque desbloquea la Historización del Plan 32 F3 mientras la migración
avanza, es barato y es reversible.

**Alcance —sólo esto:**

1. `GRUPO_HISTORIADOR` y `puntoHistorico()` en
   `shared/eva/vibraciones/vibraciones.js`, para componer
   `hda:\Configuration\DEMO_VIBRACIONES\<apoyo>:<tag>`. El tag ya no va pelado:
   **lleva su carpeta de apoyo delante**.
2. `CON_SERIE`: fuera las 4 que no existen (§2.5). Las 9 `QC_*` **se quedan**,
   con la salvedad escrita —el árbol manda sobre qué existe (§6)—, y el
   defecto de §2.7 documentado en la `nota` de `series`.
3. La `nota` y las cabeceras se reescriben con lo medido el 21-09. Hoy afirman
   «23 de 24 verificadas punto por punto» sobre un árbol que no existe: una
   cabecera desactualizada es peor que ninguna (`CLAUDE.md` §4.1).
4. `scripts/comprobar-historia-vibraciones.mjs`: su grupo de control
   `DEMO DANONE` tampoco existe → `DEMO TANQUE`.

**No entra:** los 58 tags nuevos, el adaptador de dominio, tocar el tanque.

**Aceptación.**
- `verificar-herramientas` **169 · 22 omitidas**, `verificar-chat` **68**.
- Los **35** de `npm run verificar`; backend **368**; frontend **1013 · 29**.
- Contra planta real: `S1:vRMS_S1` devuelve muestras > 0 en 7 días.
- Un verificador nuevo que **falle si `GRUPO_HISTORIADOR` vuelve a apuntar a
  un grupo inexistente** — sin red, comparando contra la forma esperada.

**Riesgo.** Bajo. El cambio es de composición de nombre, con la suite entera
de testigo.

#### Lo que de verdad pasó

**Cinco archivos, ninguno del tanque.** `vibraciones.js` (el grupo, la
composición del punto, la lista y sus cabeceras), `sistemas.js` (la `nota`,
el campo `historia` y tres `limitaciones` nuevas),
`comprobar-historia-vibraciones.mjs` (grupo, control y carpetas) y el
verificador nuevo.

**Un defecto destapado por el camino, y lo cazó un verificador existente.**
`verificar-instrucciones` se puso rojo: la cifra «40 de los 73» **vivía en dos
sitios**, la `nota` de `series` y el campo `historia` que se le cuenta al
asistente. Corregí la primera y no la segunda. Es exactamente lo que ese guion
existe para evitar —que el modelo afirme una cifra que ya no es cierta— y
funcionó. De ahí salieron además tres `limitaciones` que faltaban: las nueve
calidades, las cuatro señales de aviso y el registro detenido.

**El verificador nuevo se rompió a propósito antes de darlo por bueno**
(`CLAUDE.md` §6.2): devolviendo `GRUPO_HISTORIADOR` a `DEMO 3`, falla **3 de
11** comprobaciones y sale con código 1. Restaurado, vuelve a 11 en verde.

#### Lo medido al cerrar

| | |
|---|---|
| **Las 36 claves contra planta real** | **36 con muestras · 0 vacías · 0 errores** |
| `verificar-herramientas` | 169 · 22 omitidas |
| `verificar-chat` | 68 |
| `npm run verificar` | **los 36** (35 + el nuevo, que entró por existir) |
| Backend | 368 |
| Frontend | 1013 · 29 omitidas |
| Lint y types | limpios |

El número de `npm run verificar` sube de 35 a 36 porque la tanda **descubre**
la carpeta `scripts/`: un verificador nuevo entra por existir.

---

### F0.2 — La raíz EN VIVO también había cambiado ✅

**Completada el 21-09-2026.** La destapó F1: el descubridor no encontraba
**ninguno** de los 73 puntos declarados.

`RAIZ_VIB` decía `ac:TDCON/Motors/01/` y esa rama ya no responde.

| | |
|---|---|
| `browse ac:TDCON/Motors/` | falla |
| `read .../Motors/01/S1/vRMS_S1` | sin valor · calidad **2147483652 (mala)** |
| `read .../DemoVibraciones/.../S1/vRMS_S1` | `value` · calidad **0 (buena)** |

Corregida a `ac:TDCON/DemoVibraciones/Vibraciones/`. **Los 73 puntos
declarados: 73 presentes, 0 ausentes, 72 con calidad buena** (el restante es
un sensor, no la ruta).

Las dos puntas de esta máquina se habían movido el mismo día, y **ninguna
prueba lo vio** porque ninguna comparaba el catálogo contra el árbol.

La rama nueva publica **184 puntos** frente a los 73 del catálogo, con
carpetas que no conoce: `S4` —confirmado por el usuario: no es un apoyo de
esta máquina, está por conveniencia— y `Pantalla`. No entran aquí: el cambio
es de RUTA, no de alcance.

---

### F1 — Descubrir las variables desde el árbol ✅

**Completada el 21-09-2026.**

**Objetivo.** Un lector que recorre ICONICS y **propone** las variables de una
máquina, en lugar de derivarlas del catálogo.

**Dónde vive.** En `backend/` (necesita red). El dominio puro no toca ICONICS
(`CLAUDE.md` §2.7).

**El problema de los dos árboles, y cómo se resuelve.** En vivo `ac:` da 73
puntos; el historiador `hda:` da 94 tags. **Ni el mismo conjunto ni el mismo
nombre.** La intención es que el administrador de ICONICS mantenga las
carpetas iguales, pero el sistema **no puede depender de eso**:

> El emparejamiento `ac:` ↔ `hda:` se **propone** por coincidencia de nombre y
> **se confirma o corrige a mano**. Nunca se deriva por regla fija.

Es la misma prohibición que ya escribe `crearVariable`, y la lección del B10.
Donde el nombre coincide, se sugiere; donde no, lo decide una persona.

**Aceptación.**
- Contra el árbol real, propone las 73 en vivo y las 94 del historiador.
- Toda propuesta nace `historyVerified: false` y `acceso: read` (deny by
  default, Plan 33 §20).
- Lo que no puede emparejar lo dice; **no lo adivina** (§2.5 de `CLAUDE.md`).

**Riesgo.** Medio: los nombres del árbol tienen erratas reales (`LOWERLEVEL 2`
sin espacio, `UPER LEVEL 3` sin la P). Son el argumento de que el
emparejamiento sea editable.

#### Lo que de verdad pasó

**Se amplió el alcance con dos piezas pedidas, y las dos resultaron
necesarias.**

**El ROL.** Conecta una variable con las reglas del tipo, y es por tanto la
pieza que va a cerrar el hueco de F3. Hubo una corrección que cambió el
resultado: **la clave de dominio y el tag del servidor no son el mismo
texto**, y sólo coinciden en una de las cinco familias (`qcVRMS` → `QC_vRMS`,
`aviso` → `Warning`, `velocidad` → `SPEED_BMS`). Preguntando por clave se
resolvían **12 de 184**; por tag, **65**. De ahí `rolesDeTag` en el tipo,
hermano de `rolesDeClave` y con la misma cautela: devuelve LISTA, y con dos
candidatos no se propone ninguno.

Sobre los 73 puntos que el catálogo declara: **64 de 68 con rol, 0
ambiguos**. Los 4 sin rol son erratas que el catálogo ya documenta
(`Sensor_state_1` sin la `S`, `MonState_vRMS_2`).

**Las ALARMAS.** Sondeada `ae:/DEMO VIBRACIONES`: **57 hijos** que no son lo
mismo —42 alarmas, 6 contadores, 9 acciones de escritura—. Se devuelven por
separado porque **sólo los contadores leen**:

| | |
|---|---|
| `=ActiveUnackedCount` | `0` · calidad 0 |
| `=NormalUnackedCount` | `17` · calidad 0 |
| `.Alarm_MonState_vRMS` | sin valor · calidad **2147483682 (mala)** |

El área **lista** sus 42 alarmas y no entrega el estado de ninguna. Confirma
lo que el catálogo decía —«la pantalla dice CUÁNTAS hay y no CUÁL es cada
una»— y lo acota: no es que no estén publicadas, es que no responden. Las
acciones no se proponen para nada: son escrituras, deny by default.

#### Un tercer nombre movido: la errata se corrigió

El descubridor no encontraba `Alarrma_S1`. Medido: **ya no existe**. Hoy el
servidor lo escribe `Alarma_S1` y responde con calidad buena; el nombre viejo
da calidad mala.

La cabecera de aquella excepción dejaba dicho qué hacer —«si se corrige allí,
esta excepción sobra y hay que quitarla»— y su prueba lo cazó. Se retiró
`ERRATAS_DEL_SERVIDOR` con su función traductora, que ya no traducía nada.
`MonState_vRMS_2` y `Sensor_state_1` **siguen irregulares** y se respetan:
comprobado en el mismo sondeo.

Tercer nombre de esta máquina que se mueve el mismo día, tras las dos raíces.

#### Lo medido al cerrar

| | |
|---|---|
| Contra el árbol real | 184 en vivo · 125 en historiador · **122 emparejados** · 0 fallos |
| Roles sobre lo declarado | **64 de 68** · 0 ambiguos |
| Alarmas | 6 contadores · 42 alarmas · 9 acciones |
| `verificar-descubrimiento` | **21** comprobaciones, sin red |
| `npm run verificar` | **los 37** |
| Backend · Frontend | 368 · 1013 (29 omitidas) |

Los 3 tags que no empareja son justo los que ninguna regla de nombres
acertaría —`LOWER LEVEL 1`, `UPER LEVEL 3`, `Jaritza\L1:Tension L-N`—: la
prueba de que el emparejamiento tiene que ser editable.

El verificador se rompió a propósito antes de darlo por bueno
(`CLAUDE.md` §6.2): quitando la guarda de ambigüedad falla la comprobación
del tag duplicado y sale con código 1.

#### Lo que queda para la UI (F4)

El modelo de alta que pediste —nombre, activos, variables, variables
historizadas, alarmas— encaja con lo que hay, **con un matiz**: «variables
historizadas» no es una lista aparte sino **la segunda dirección de cada
variable** (`historyPointName`). Separarlas obligaría a casarlas después, que
es justo lo que se rompió dos veces hoy. En pantalla: una fila por variable
con dos columnas, la del histórico ya rellenada donde el nombre coincide.

Se añaden dos campos a los cinco: el **rol** (sin él no hay diagnóstico) y el
**PLC**, que ya es obligatorio en `crearMaquina` porque es lo que sostiene
`NO_COMPARTEN`.

Los activos de vibraciones, confirmados por el usuario: **Alarm, Jaritza, S1,
S2, S3, V20**. Fuera `S4` y `Pantalla`.

---

### F2 — `historyVerified` se gana sondeando, no heredando

**Objetivo.** Convertir en código el sondeo del 21-09: pedir la serie y
**comparar huellas** para cazar la serie prestada.

**Por qué no basta preguntar.** El servidor contesta que sí y devuelve la
serie de otra, con marcas de tiempo correctas y sin error (§2.6).

**Aceptación, con los números de hoy como caso de prueba:**
- `aPeak_S1` → `false` (1805/1805 idénticos a `aRMS_S1`).
- Las 9 `QC_*` → `false` (huella única entre las nueve).
- `aPeak_S2` → `true` (3 de 321).
- Las 4 `Warning_*` → no existen.
- **Se regenera `datos/maquinas.json`** con el resultado real. Hoy promete
  `historyVerified: true` sobre un grupo que da 500.
- El sondeo **distingue «no pude comprobar» de «comprobado y falso»**
  (`UNKNOWN` ≠ `INVALID`, Plan 33).

**Riesgo.** Medio-bajo. Trampa conocida: con la máquina parada (§2.3) todo
vale 0 y **dos series de ceros parecen la misma**. El sondeo tiene que
negarse a concluir sobre una ventana sin variación, no declarar `false`.

---

### F3 — El adaptador de dominio · **la fase que decide el plan**

**Objetivo.** Reconstruir `{canales, variador, alarmas}` desde los roles, para
que una máquina configurada **diagnostique**.

**Aceptación —de equivalencia, no de funcionalidad:**
- Con la misma lectura, los riesgos de la configurada coinciden con los de la
  escrita a mano **regla por regla**: mismo id, misma banda, mismo orden.
- Una máquina a la que le falta un rol requerido **no evalúa esa regla y lo
  dice**; no la evalúa con un hueco.
- No reaparecen los tres `dkw-sin-referencia` falsos de §4.
- `verificar-riesgos-vibracion` pasa contra las dos.

**Riesgo. Alto, y es el riesgo del plan.** Si la forma de dominio no se puede
reconstruir desde los roles sin perder información, **esta fase lo revela y el
plan se replantea aquí**, no en F5. Se hace antes de retirar nada.

---

### F4 — Configurar vibraciones desde la pantalla

**Objetivo.** Dar de alta la máquina **desde el navegador**, contra el árbol
real, con el emparejamiento de F1 y el sondeo de F2.

La vista de `Planta › Configuración` es hoy de sólo lectura (Plan 33 F5):
aquí gana edición.

**Aceptación.**
- Una persona configura vibraciones **sin editar un `.js`**.
- `verificar-vibraciones-configurada` compara contra **el árbol**, no contra
  el catálogo. Cambia de sentido: hoy pregunta «¿reproduce el catálogo?», pasa
  a preguntar «¿coincide con el servidor?».
- Lo que el árbol publica y la configuración no declara **se ve**, no se calla.

**Riesgo.** Medio, y es de UX: 94 variables en pantalla sin ahogar a quien las
revisa. Aplica `DESIGN.md` —criterio táctil, 44 px para lo que acciona—.

---

### F5 — Retirar `vibraciones.js` como catálogo

**Objetivo.** Que el catálogo escrito a mano deje de ser la fuente. Queda lo
que es **tipo**.

**Sólo cuando F3 y F4 estén verdes.** El Plan 33 §18 ya dice por qué no antes:
esas líneas llevan dentro conocimiento verificado punto por punto contra el
servidor —incluidas las señales a las que el historiador contesta con la serie
de otra— y perderlo **no daría un error: daría un tablero que enseña la señal
equivocada con su rótulo correcto**.

Por eso F2 es requisito: ese conocimiento tiene que estar **en la
configuración, ganado por sondeo**, antes de que el catálogo se vaya.

**Aceptación.**
- Vibraciones funciona entera como máquina configurada: tablero, historia,
  riesgos, asistente.
- El arreglo táctico de F0 desaparece: ya no hay `GRUPO_HISTORIADOR`.
- La suite sigue en sus números, o los que cambien están justificados.

**Riesgo.** Alto si se adelanta; bajo si F3 y F4 cumplieron.

---

## 6. Decisiones de este plan

**El árbol manda sobre QUÉ existe; un sondeo manda sobre SI la serie es
suya.** Son dos preguntas distintas y se resolvieron mezcladas. Una variable
que el árbol publica **existe** y va al catálogo aunque su serie esté
prestada; lo que no hace es **prometer historia**. Por eso las 9 `QC_*` no se
borran: se quedan con `historyVerified: false`.

Corolario: **no hay lista blanca que editar a mano.** `historizadas()` se
deriva de qué variables tienen `historyPointName` + `historyVerified`, como ya
hace `construirSistema.js`. `CON_SERIE` desaparece en F5.

**El emparejamiento `ac:` ↔ `hda:` se propone, no se deriva.** Ver F1.

**F0 es táctico y se sabe.** Se escribe sabiendo que F5 lo borra, y el código
lo dirá en su cabecera. No es deuda accidental: es deuda declarada con fecha
de retirada.

**El tanque no se toca.** Ver §7.

---

## 7. Qué queda fuera

- **Migrar el tanque.** Es rama aparte (`CLAUDE.md` §1). Y hay una razón
  además de la regla: el tanque nombra su punto histórico con una **tabla
  rama→carpeta** de doce entradas y dos nombres que no derivan por regla fija.
  Es un caso más duro, y conviene que vibraciones lo estrene.
- **Los 58 tags nuevos** (§2.8) — Plan 32 F4/F5.
- **Encender BPFO/BPFI/FTF** — configuración del SM 1281, no código.
- **Rellenar los 6 días sin registro** (§2.3) — es de planta.
- **Herramientas nuevas para el asistente.** Con 26, cada una es una elección
  que un modelo pequeño puede fallar (Plan 33).

---

## 8. Abierto, y dicho

**La ventana de 30 días que devuelve vacío sin error** (§2.4). Afecta a las
dos máquinas. No sabemos si es del cliente o del servidor. **No bloquea este
plan** —las ventanas del tablero son más cortas—, pero es un modo de fallo
silencioso y debería tener dueño. Candidato a `docs/BACKLOG-BACKEND.md` si no
entra en el Plan 32.

**El factor de cresta en S1 no se puede calcular sobre historia** (§2.6). El
Plan 32 F4 lo da por hecho de coste cero. Lo es en S2 y S3; en S1 no, y en
vivo está por confirmar con la máquina girando.

**Con la máquina parada no se puede terminar de verificar** (§2.3). F2 puede
clasificar lo que ya tiene historia, pero la verificación en vivo necesita que
el motor gire.
