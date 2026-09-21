# PLAN 36 — Configurar una máquina marcando el árbol de ICONICS

**Estado:** F1–F3 completadas · vista en el navegador el 21-09-2026 (§4.1)
**Rama:** `Vibraciones1.0`
**Fecha:** 21-09-2026

> **Sale de la F4 del Plan 34**, que quedó recortada por `AUTH_HABILITADA=false`
> — el Plan 35 lo encendió. Al definir el alcance con el usuario, la fase
> resultó ser bastante más que «una pantalla de alta», así que sale a plan
> propio en vez de crecer dentro del 34.
>
> Es el punto **2 de los cuatro de la siguiente demo**: el panel de
> administración.

> Las tres fases están probadas con 34 pruebas de vista, 22 comprobaciones de
> dominio y 9 pruebas de contrato HTTP; el descubrimiento y la exploración se
> ejercitaron contra el servidor real por HTTP. **El usuario abrió la pantalla
> el mismo día y dio de alta una máquina contra planta**; lo que destapó está
> en §4.1 y ya está corregido.

---

## 1. Qué se quiere, dicho por el usuario

> «Mi idea es poder tener estos **3 árboles side to side** —tiempo real,
> historizadas, alarmas—. Generalmente hacen match por nombre, pero en caso de
> que no hicieran match debería haber una manera de leerlas.»
>
> «Al configurar la máquina desde el sistema es la idea, ir **marcando** los
> activos, variables historizadas, variables de tiempo real.»
>
> «Hay que tomar en cuenta que la máquina podría **recibir o eliminar una
> variable después**, por lo que se debería poder **editar** en vez de
> reconstruir toda la máquina completa.»
>
> «Marcar el activo marque todas las variables y el usuario pudiera **ir
> quitando**.»

Es el flujo de quien configura ICONICS, reproducido en el tablero: mirar el
árbol, elegir qué pertenece a esta máquina, y guardarlo.

---

## 2. Los tres árboles, medidos el 21-09-2026

Los tres responden y **sus activos coinciden por nombre**, que es lo que hace
viable el emparejamiento automático.

### 2.1 Tiempo real — `ac:TDCON/DEMO_VIBRACIONES/Vibraciones/`

| Activo | Variables | ¿Entra? |
|---|---:|---|
| S1 · S2 · S3 | 26 cada uno | **sí** |
| V20 | 21 | **sí** |
| Jaritza | 5 | **sí** |
| **Total** | **104** | |
| `Alarm` | 43 | **no** — es del área de alarmas |
| `Pantalla` | 2 | **no** — confirmado por el usuario |

> **Medido otra vez al cerrar F1, por HTTP contra planta:** `Jaritza` no tiene
> 5 variables sueltas sino **3 sueltas y dos subcarpetas**, `L1` (9) y `L2`
> (15). El árbol tiene un nivel más de lo que decía esta tabla, y la pantalla
> lo recorre igual —una carpeta dentro de una carpeta se marca entera con
> la de arriba—. Y la raíz cuelga además un nodo `.Attributes` que no es ni
> carpeta ni señal; se filtra, como ya hacía el explorador de Assets.

### 2.2 Historizadas — `hda:\Configuration\DEMO_VIBRACIONES`

Activos: `S1, S2, S3, Jaritza, V20` + `Overview`. **Los cinco coinciden** con
los de tiempo real.

> **Medido al cerrar F1: las carpetas del historiador NO llevan contrabarra
> final, y con ella el servidor contesta 500.** `browse` de
> `hda:\Configuration\DEMO_VIBRACIONES` devuelve `…\S1`, `…\S2`; pedir
> `hda:\Configuration\DEMO_VIBRACIONES\` da 500 «sin detalle». Es al revés que
> en `ac:`, donde la carpeta lleva la barra. El catálogo escrito a mano guarda
> el grupo CON contrabarra (`GRUPO_HISTORIADOR`), así que quien copie de ahí la
> pegaría igual: la pantalla y el descubridor la quitan antes de explorar
> (`normalizarRaizHistorica`). Ver §7.

### 2.3 Alarmas — `ae:/DEMO VIBRACIONES`

57 hijos: 42 alarmas, 6 contadores y 9 acciones de escritura. Ya los clasifica
`descubrirAlarmas()` (Plan 34 F1), y **sólo los contadores entregan valor**.

### 2.4 Y la rama se ha renombrado OTRA VEZ

`ac:TDCON/DemoVibraciones/` → **`ac:TDCON/DEMO_VIBRACIONES/`**.

Es el **cuarto** nombre que cambia en este servidor en menos de un mes:

| Qué | Antes | Ahora |
|---|---|---|
| Grupo del historiador | `DEMO 3` | `DEMO_VIBRACIONES` |
| Raíz en vivo | `TDCON/Motors/01/` | `TDCON/DemoVibraciones/` |
| Tag de alarma | `Alarrma_S1` | `Alarma_S1` |
| Raíz en vivo, **otra vez** | `TDCON/DemoVibraciones/` | `TDCON/DEMO_VIBRACIONES/` |

**Es el argumento entero de este plan.** Un catálogo escrito a mano caduca
cada vez que alguien reorganiza el árbol, y nadie se entera hasta que una
pantalla sale vacía. Una máquina configurada desde el árbol se vuelve a
configurar en minutos.

> `RAIZ_VIB` se corrigió en el commit anterior a este plan (`e72c0ee`). No es
> el arreglo de fondo: el arreglo es que deje de haber una constante que
> corregir, y eso es lo que F1–F3 construyen.

---

## 3. Lo que YA existía y no se reescribió

| Pieza | Qué aporta |
|---|---|
| `POST /api/maquinas/descubrir` | Recorre los tres árboles y propone (Plan 34 F1) |
| `descubrirAlarmas()` | Clasifica el área en contadores, alarmas y acciones |
| `POST /api/maquinas/:id/sondear` | Verifica qué serie es de verdad suya (F2) |
| `dominioDesdeRoles()` | Hace que la máquina configurada diagnostique (F3) |
| `GET /api/iconics/browse` | Recorre cualquier rama, con rol `visualizador` |
| `Planta › Configuración` | La vista, hasta hoy de sólo lectura |
| RBAC | `administrador` para todo `/api/maquinas` (Plan 35) |

**El backend estaba hecho** y no se reescribió. Lo que sí cambió de sitio son
las **reglas puras** que el descubridor tenía pegadas al recorrido —`nombreFinal`,
`proponerRol`, la clasificación del área, el emparejamiento por nombre—: la
pantalla las necesita también, y reescribirlas en el tablero habría sido dos
copias de la misma regla (`CLAUDE.md` §2.6). Viven ahora en
`shared/eva/comun/arbolIconics.js`; el descubridor las importa y re-exporta.

---

## 4. Las fases

### F1 — Los tres árboles, navegables y marcables ✅

**Completada el 21-09-2026.**

**Objetivo.** Una pantalla con los tres árboles en paralelo, donde marcar
activos y variables.

**El modelo de interacción**, decidido con el usuario:

- **Marcar un activo marca todas sus variables.** Y el usuario va quitando.
- Los tres árboles se **expanden bajo demanda**: `browse` por rama, no un
  volcado entero al abrir.
- El emparejamiento `ac:` ↔ `hda:` se **propone por nombre** y se ve; lo que
  no casa se marca, no se esconde (Plan 34 F1).

**Aceptación.**
- Se ven los tres árboles con sus activos reales. ✅
- Marcar `S1` marca sus 26 variables; desmarcar una deja 25. ✅ (prueba de
  vista con un S1 de 26, y el dominio con uno de 7)
- Lo que no empareja por nombre se señala. ✅
- `Alarm` y `Pantalla` no se ofrecen como activos de máquina. ✅ — con un
  matiz que hay que leer (abajo).

#### Lo que de verdad pasó

**La pantalla no decide nada; lo decide `shared/`.** Todo lo que parece una
decisión en el editor —qué carpeta es un activo, qué `assetId` lleva una
variable, qué rol se le propone, qué serie se le empareja, qué variable
guardada ya no está— lo calcula `shared/eva/comun/configurarDesdeArbol.js`
sobre nodos ya leídos, y se prueba en Node con
`verificar-configurar-desde-arbol.mjs` (22 comprobaciones). El editor pinta y
recoge marcas (`CLAUDE.md` §4.3). Lo que sí sabe de red es un hook de la capa
de datos, `useArbolIconics`, que es una caché de `browse` por carpeta con
tres estados que desde fuera se ven igual: sin pedir, pedida y fallida
(`null`), pedida y vacía (`[]`). Esa distinción es la que F3 necesita.

**«Alarm y Pantalla no se ofrecen como activos» se cumple con una regla del
TIPO, no con una lista.** El código no puede distinguir «Pantalla» de
«Jaritza»: las dos son carpetas cuyas variables el tipo de vibraciones no
reconoce. Lo que sí puede decir es eso, y es lo que dice: la columna de tiempo
real separa **«Activos que el tipo reconoce»** —`S1`, `S2`, `S3`, `V20`, los
que tienen al menos una hoja con rol— de **«Otras carpetas del árbol»** —
`Jaritza`, `Alarm`, `Pantalla`—, con la explicación al lado. Las tres se
ofrecen igual (esconder lo que existe es lo que el Plan 34 F1 prohíbe) y
ninguna viene marcada; `Jaritza` la marca una persona. Es honesto con lo que
el código sabe, y es el criterio que el usuario aplicó al confirmar
`Pantalla`: una decisión humana.

**El emparejamiento manual entró en F1** (§6 lo dejaba abierto). En la columna
del historiador, un tag sin pareja ofrece «Emparejar con…» sobre las
variables marcadas que no tienen serie; y una variable cuyo nombre final
aparece en DOS carpetas del historiador («ambiguo») ofrece elegir cuál. Un
emparejamiento a mano se distingue del propuesto por nombre y se puede quitar.
No complicó la disposición: es un `<select>` en la fila.

**Lo que cambió fuera de la pantalla, y por qué hacía falta:**

- **El transporte falso aprendió a tener niveles.** `browse` devolvía todos
  los puntos como cadenas planas; el descubridor y la pantalla expanden
  carpeta a carpeta y leen `shortName`, y contra aquel fake **veían un árbol
  vacío sin error**. Hoy deriva el árbol del registro (`puntos()`,
  `series.punto`, `raices`) y contesta como el servidor: hijos directos,
  `[]` para una hoja, `ok: false` para una rama que nadie declara. Con eso
  `POST /api/maquinas/descubrir` tiene por fin prueba de contrato sin planta
  (propone 69 en vivo, 36 emparejadas, 65 con rol) y la pantalla se puede usar
  con `ICONICS_FAKE=true`.
- **`nombreFinal` aprendió el `=` de los contadores**
  (`ae:/AREA=ActiveUnackedCount` → `ActiveUnackedCount`).

**Medido contra planta, por HTTP, con el backend en un puerto propio**
(`HANDOFF` §8: «levanta un puerto propio para medir»):

| | |
|---|---|
| `browse` raíz en vivo | 8 hijos: 7 carpetas + `.Attributes` |
| `browse` `S1/` | 26 hojas |
| `browse` hoja | `ok`, `[]` |
| `browse` `hda:\…\DEMO_VIBRACIONES` | 6 carpetas **sin** contrabarra final |
| `browse` `hda:\…\DEMO_VIBRACIONES\` | **500** |
| `browse` `ae:/DEMO VIBRACIONES` | 57 · 6 contadores · 42 alarmas · 9 acciones |
| `descubrir` (las tres raíces) | `VALID` · 172 en vivo · 125 historizadas · 115 emparejadas · 65 con rol · 10 sin reclamar · 0 fallos · 3,0 s |

Los 172 en vivo son 104 + `Alarm` (43) + `Pantalla` (2) + `Jaritza\L1` (9) +
`Jaritza\L2` (15) − 1 (`Jaritza` tiene 3 sueltas, no 5) + `.Attributes` (1).
Los 10 tags sin reclamar son las erratas conocidas (`LOWER LEVEL 1`,
`UPER LEVEL 3`) y los de `Jaritza\L1` que en vivo se llaman distinto: justo lo
que el emparejamiento manual existe para resolver.

**Lo que se rompió a propósito antes de darlo por bueno** (`CLAUDE.md` §6.2):
la comprobación de ids únicos del verificador **falló sola** la primera vez —
dos hojas con el mismo nombre en `Jaritza\L1` y `Jaritza\L2` compartían id— y
destapó que prefijar con la carpeta directa no basta cuando la repetición está
dos niveles más abajo. Hoy el id repetido es la ruta entera bajo la raíz.

---

### F2 — Dar de alta con lo marcado ✅

**Completada el 21-09-2026.**

**Aceptación.**
- Una persona configura vibraciones **sin editar un `.js`**. ✅ — por HTTP;
  en pantalla, pendiente de verse.
- La máquina resultante **diagnostica** (Plan 34 F3). ✅ — las variables
  salen con `rol` y `assetId` = canal, que es lo que `dominioDesdeRoles` lee.
- Todo entra como `acceso: "read"`. ✅ — la pantalla ni lo manda; lo pone el
  servidor.
- `historyVerified` arranca en `false` y se gana sondeando. ✅

#### Lo que de verdad pasó

**Un campo nuevo en la máquina: `arboles`**, las tres raíces desde las que se
configuró. La raíz en vivo y el área se podían deducir de los assets; **el
grupo del historiador no** —los nombres `hda:` no se derivan de nada (B10)— y
sin guardarlo, editar (F3) obligaba a teclearlo otra vez cada vez. Es opcional
en el esquema; una máquina de antes del plan no lo trae y `arbolesDe()` deduce
lo que puede y deja el historiador vacío para que lo rellene una persona.

**La validación se aplica antes de enviar, con la misma función que el
servidor.** `problemasDeMaquina` vive en `shared/` para eso desde el Plan 33
F2, y ésta es la primera pantalla que lo usa: el botón de alta no se activa
mientras haya un problema que bloquee, y la lista dice cuál (falta el PLC,
ninguna variable marcada, id repetido…). Un 400 del servidor se pinta con sus
`problemas` por campo y no borra lo marcado.

**Los assets salen de las marcas:** la raíz, una entrada por carpeta con
alguna variable marcada, y el área si se marcó algún contador. Los contadores
entran como variables **sin rol** —no son roles del tipo, Plan 34 F3— colgadas
del área.

---

### F3 — Editar una máquina existente ✅

**Completada el 21-09-2026.**

**Aceptación.**
- Abrir una máquina existente enseña lo marcado. ✅
- Añadir y quitar variables **conserva** el resto, incluido su
  `historyVerified`. ✅ — y no lo hacía; ver abajo.
- Una variable marcada que desapareció del árbol se señala; no se borra sola. ✅

#### Lo que de verdad pasó

**Lo caro era el backend, como el plan avisaba.** `PATCH /api/maquinas/:id`
sustituía la lista de variables tal como llegaba, y la lista que llega de la
pantalla **no puede traer `historyVerified`** —el esquema lo rechaza a
propósito: prometer historia es una afirmación sobre el servidor que sólo el
sondeo puede hacer—. Así que **añadir una variable borraba la verificación de
las otras 36, sin error**: la máquina seguía válida, sólo que ciega para su
pasado. Lo arregla `fusionarVariables` en el gestor: una variable que llega se
empareja con la anterior por `pointName`; si su `historyPointName` no cambió,
conserva `historyVerified` y `estado`; si cambió, la verificación hablaba de
OTRA serie y vuelve a `false`. Una nueva pasa por `crearVariable`, como en el
alta. Roto a propósito (`historyVerified: false` siempre): la prueba lo caza.

**Tres resultados al comparar con el árbol, no dos.** `compararConArbol`
separa `presentes`, `ausentes` (su carpeta se leyó y la variable no está) y
`sinComprobar` (su carpeta no se pudo leer). Es `UNKNOWN` ≠ `INVALID`
variable a variable: un 500 en `S2/` no da de baja las variables de `S2`. En
pantalla las ausentes salen en un bloque propio, **marcadas**, con «ya no está
en el árbol», y se quitan desmarcándolas; las sin comprobar, en otro, con «no
se pudo comprobar». Ninguna desaparece sola.

**Abrir y guardar sin tocar nada reproduce la misma configuración.** Las
decisiones ya tomadas —el punto histórico y el rol de cada variable— se cargan
como decisiones a mano, así que la propuesta por nombre no las pisa. Está
probado en el dominio: `marcasDe` → `proponerVariables` →
`configuracionDesdeMarcas` devuelve la misma lista.

---

## 4.1 Lo que destapó probarla en el navegador

El usuario abrió la pantalla el mismo día, dio de alta `vib-motor-03` con
`S1`, la comprobó, la sondeó, y la editó para añadir `V20`. La ficha quedó
diciendo tres cosas ciertas en momentos distintos: «44 variables», «las 24
variables declaradas siguen existiendo» y «2 con serie verificada» junto a
«9 de 43 verificadas». Tres defectos, ninguno del editor:

- **La ficha no descartaba la comprobación ni el sondeo de la configuración
  anterior** al guardar una edición. Se descartan.
- **La lista no se volvía a pedir cuando el servidor anotaba algo.** Comprobar
  y sondear escriben en la máquina; la cabecera de la ficha seguía con la
  máquina tal como se listó al entrar. Se recarga cuando `anotado` es cierto.
- **Editar dejaba la máquina en `VALID` con 20 variables en `UNKNOWN`.** El
  veredicto era sobre otra lista. Si cambia QUÉ lee la máquina, su estado
  vuelve a `UNKNOWN`; cada variable conserva el suyo. Re-guardar la misma lista
  no borra nada.

Backend 377 · frontend 1053. La pantalla ya se ha visto correr; lo que queda es
que la revise alguien más que quien la escribió.

## 5. Lo que queda fuera

**Marcar variables como escribibles.** Todo entra como lectura. Habilitar la
escritura sobre la planta es una decisión aparte, con su propia conversación
— y `capacidadesDe` ya la trata así: `WRITABLE_VARIABLES` **nunca se deriva**,
sale de que alguien lo declare variable por variable (Plan 33 §20). El aviso de
arriba de la pantalla lo dice.

**El CRUD de usuarios.** Plan 35 §6: el censo está destinado a desaparecer
cuando se federe contra el IdP de ICONICS (Plan 26), y construirle una
pantalla sería trabajo para tirar.

**Retirar `vibraciones.js`.** Es la F5 del Plan 34, y sólo tiene sentido
cuando una máquina configurada desde aquí haga todo lo que hace el catálogo
—incluidas las alarmas y el estado del sensor, que hoy no lee—.

**Elegir la raíz explorando.** Las tres raíces se teclean. Un explorador para
elegirlas sería la vista de Assets dentro de la de Configuración; se anota,
no se construye sin que alguien lo pida (`CLAUDE.md` §4.8).

---

## 6. Lo que estaba abierto, y cómo quedó

**El emparejamiento manual.** Entró en F1. Ver arriba.

**`Overview` en el historiador.** Existe como carpeta en `hda:` y no tiene
equivalente en vivo. Sondeado el 21-09: está vacío. La pantalla lo enseña
vacío y no lo propone para nada.

---

## 7. Decisiones de este plan

**La carpeta del historiador se define por exclusión: lo que no es tag es
carpeta.** Una regla «carpeta = termina en separador» valía para `ac:` y
rompía `hda:`, donde la carpeta no lleva contrabarra y pedirla con ella da
500. `esCarpetaHistorica` y `esTagHistorico` viven en `shared/` y son las que
usan la pantalla, el descubridor y el transporte falso.

**El transporte falso no disimula lo que el servidor rechaza.** Pedir una
carpeta `hda:` con contrabarra final da `ok: false` también en el fake. Un
fake más permisivo que el servidor enseña a escribir código que sólo funciona
sin planta.

**El `assetId` de una variable es su canal si el tipo lo reconoce, y si no su
carpeta.** `dominioDesdeRoles` busca `rol@canal`; respetar el nombre del canal
aunque la carpeta se llamara distinto es lo que mantiene el diagnóstico.

---

## 8. Lo medido al cerrar

| | |
|---|---|
| `verificar-configurar-desde-arbol` | **22** comprobaciones, sin red |
| `verificar-transporte-falso` | 26 (22 + 4 del árbol con niveles) |
| `verificar-descubrimiento` | 22 (sin cambios: las reglas se movieron, no cambiaron) |
| `npm run verificar` | **los 41** |
| Backend | **376** (368 + 8: `arboles`, `fusionarVariables`, `descubrir` contra el fake) |
| Frontend | **1052** · 29 omitidas (1013 + 16 del editor + 2 de la vista + 21 de otros archivos que ya estaban) |
| `verificar-herramientas` | 169 · 22 omitidas |
| Lint · types | limpios |
| i18n | 1393 claves × 2 idiomas, con paridad · 65 claves nuevas de editor |

**Commits de este plan:** uno por bloque —el dominio y el transporte falso, el
backend, la pantalla— y éste de documentos. Las tres fases comparten el editor
como archivo, así que el corte por fase no era posible sin partirlo
artificialmente; el plan lo dice en vez de fingir tres fases en tres commits.
