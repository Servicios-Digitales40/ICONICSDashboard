# PLAN 36 — Configurar una máquina marcando el árbol de ICONICS

**Estado:** F1–F3 por completar
**Rama:** `Vibraciones1.0`
**Fecha:** 21-09-2026

> **Sale de la F4 del Plan 34**, que quedó recortada por `AUTH_HABILITADA=false`
> — el Plan 35 lo encendió. Al definir el alcance con el usuario, la fase
> resultó ser bastante más que «una pantalla de alta», así que sale a plan
> propio en vez de crecer dentro del 34.
>
> Es el punto **2 de los cuatro de la siguiente demo**: el panel de
> administración.

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

### 2.2 Historizadas — `hda:\Configuration\DEMO_VIBRACIONES`

Activos: `S1, S2, S3, Jaritza, V20` + `Overview`. **Los cinco coinciden** con
los de tiempo real.

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

> `RAIZ_VIB` apunta hoy al nombre viejo. Se corrige en F1 —es una constante—
> pero **no es el arreglo de fondo**: el arreglo es que deje de haber una
> constante que corregir.

---

## 3. Lo que YA existe y no se reescribe

| Pieza | Qué aporta |
|---|---|
| `POST /api/maquinas/descubrir` | Recorre los tres árboles y propone (Plan 34 F1) |
| `descubrirAlarmas()` | Clasifica el área en contadores, alarmas y acciones |
| `POST /api/maquinas/:id/sondear` | Verifica qué serie es de verdad suya (F2) |
| `dominioDesdeRoles()` | Hace que la máquina configurada diagnostique (F3) |
| `GET /api/iconics/browse` | Recorre cualquier rama, con rol `visualizador` |
| `Planta › Configuración` | La vista, hoy de sólo lectura |
| RBAC | `administrador` para todo `/api/maquinas` (Plan 35) |

**El backend está hecho.** Lo que falta es la pantalla.

---

## 4. Las fases

### F1 — Los tres árboles, navegables y marcables

**Objetivo.** Una pantalla con los tres árboles en paralelo, donde marcar
activos y variables.

**El modelo de interacción**, decidido con el usuario:

- **Marcar un activo marca todas sus variables.** Y el usuario va quitando.
  Es más rápido que marcar 104 de una en una, y coincide con cómo se piensa
  una máquina: «este apoyo es mío, menos estas tres señales».
- Los tres árboles se **expanden bajo demanda**: `browse` por rama, no un
  volcado entero al abrir.
- El emparejamiento `ac:` ↔ `hda:` se **propone por nombre** y se ve; lo que
  no casa se marca, no se esconde (Plan 34 F1).

**Aceptación.**
- Se ven los tres árboles con sus activos reales.
- Marcar `S1` marca sus 26 variables; desmarcar una deja 25.
- Lo que no empareja por nombre se señala.
- `Alarm` y `Pantalla` no se ofrecen como activos de máquina.

**Riesgo.** Medio, y es de UX: 104 variables en tres columnas sin ahogar a
quien las revisa. Aplica `DESIGN.md` —criterio táctil, 32 px para un control
de chrome— y conviene medir el ancho mínimo antes de dar por buena la
disposición en tres columnas.

---

### F2 — Dar de alta con lo marcado

**Objetivo.** Que lo marcado se convierta en una máquina configurada.

Reúne lo que el Plan 34 dejó listo: el cuerpo de `POST /api/maquinas`, el rol
propuesto por tipo, y el sondeo posterior desde la ficha.

**Aceptación.**
- Una persona configura vibraciones **sin editar un `.js`**.
- La máquina resultante **diagnostica** (Plan 34 F3).
- Todo entra como `acceso: "read"`. Marcar una variable como escribible es
  una decisión con consecuencias sobre la planta y **no entra en este plan**
  (§5).
- `historyVerified` arranca en `false` y se gana sondeando.

**Riesgo.** Bajo: el backend ya está probado.

---

### F3 — Editar una máquina existente

**Objetivo.** La misma pantalla, cargando lo ya marcado.

Es requisito del usuario, no un extra: «la máquina podría recibir o eliminar
una variable después». Y con un servidor que renombra ramas cada semana
(§2.4), reconstruir entera cada vez no es viable.

**Lo que hay que resolver, y no es cosmético:** una variable marcada **que ya
no está en el árbol**. No se puede borrar en silencio —puede ser un corte de
red— ni dejar como si nada. Se marca como ausente y lo decide una persona; es
el mismo criterio que `verificarConfiguracion.mjs` con `UNKNOWN` ≠ `INVALID`.

**Aceptación.**
- Abrir una máquina existente enseña lo marcado.
- Añadir y quitar variables **conserva** el resto, incluido su
  `historyVerified`.
- Una variable marcada que desapareció del árbol se señala; no se borra sola.

**Riesgo.** Medio. Lo caro no es la UI: es no perder información al guardar.

---

## 5. Lo que queda fuera

**Marcar variables como escribibles.** Todo entra como lectura. Habilitar la
escritura sobre la planta es una decisión aparte, con su propia conversación
— y `capacidadesDe` ya la trata así: `WRITABLE_VARIABLES` **nunca se deriva**,
sale de que alguien lo declare variable por variable (Plan 33 §20).

**El CRUD de usuarios.** Plan 35 §6: el censo está destinado a desaparecer
cuando se federe contra el IdP de ICONICS (Plan 26), y construirle una
pantalla sería trabajo para tirar.

**Retirar `vibraciones.js`.** Es la F5 del Plan 34, y sólo tiene sentido
cuando una máquina configurada desde aquí haga todo lo que hace el catálogo
—incluidas las alarmas y el estado del sensor, que hoy no lee—.

---

## 6. Abierto

**El emparejamiento manual.** El usuario lo pidió: «en caso de que no hicieran
match debería haber una manera de leerlas». Hoy el descubridor **señala** lo
que no casa pero no deja corregirlo a mano. Entra en F1 si la disposición lo
permite sin complicarla; si no, es una fase aparte.

**`Overview` en el historiador.** Existe como activo en `hda:` y no tiene
equivalente en vivo. Sondeado el 21-09: está vacío. Se ignora, y se dice.
