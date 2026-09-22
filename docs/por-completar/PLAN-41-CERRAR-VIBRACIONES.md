# PLAN 41 — Cerrar Vibraciones 1.0: lo que de verdad queda

**Estado:** F0–F5 por completar · escrito el 22-09-2026 tras sondear los cinco planes vivos
**Rama:** `Vibraciones1.0`
**Fecha:** 22-09-2026

> Nace de un encargo del usuario: «vuelve a sondear estos planes, hay cosas que
> ya no se necesitan / ya se arreglaron». El sondeo se hizo contra el código,
> no contra lo que los planes dicen de sí mismos, y **encontró tres fases dadas
> por pendientes que ya estaban hechas y una que es imposible**. Este plan
> recoge sólo lo que sobrevivió a esa comprobación.

---

## 0. Qué encontró el sondeo

La razón de que este plan exista es que **los planes vivos exageraban lo que
faltaba**. Cinco documentos abiertos sugerían un mes de trabajo; lo que de
verdad queda son **dos fases de código, un paso en planta y una confirmación
en pantalla**.

| Se daba por pendiente | Lo que se midió el 22-09-2026 | Veredicto |
|---|---|---|
| **32 F4** · `necesita` en 8 reglas | Las **17** reglas de `riesgosVibracion.js` lo declaran, y el motor lo consume en la línea 811 | ✅ ya estaba |
| **32 F4** · factor de cresta | `aPeak_S1` **es** la serie de `aRMS_S1`: 1805 de 1805 idénticas (`vibraciones.js:1151`) | ⛔ imposible en S1 |
| **32 F5** · `terminosManual` | Declarados en las 4 medidas (`vibraciones.js:523-567`) y propagados por el tipo; Plan 39 F3 cerró los manuales por TIPO | ✅ ya estaba |
| **32 F2** · historiador | `sondearSeries.mjs` gana `historyVerified` por variable; el esquema lo rechaza del cliente | ✅ el código; falta planta |
| **38 F2** · registro | 8 rutas `maq-*` en `routes.jsx`, no las 3 que el Plan 37 describía | ✅ ya estaba |
| **32 F6** · sinónimos | `vocabulario` llega a la configurada pero **sólo alimenta el dictado** (`voz.mjs:79`) | ⬜ queda |
| **37 F4** · Alarmas | No existe ruta `maq-alarmas`; `AlarmasEva` lee las señales del **tanque** | ⬜ queda |

**Lo que se archivó en el mismo encargo**, por no ser trabajo vivo:

- **Plan 13** — borrado. Cero referencias en el árbol.
- **Plan 19** — a `completados/`. F4/F5/F7 dependen de una API que no llegó, y
  Predicción ya salió del menú (`b06ba57`). **No se borró**: lo citan 7
  archivos de código, uno de ellos lo **enseña en pantalla al usuario**.
- **Plan 8** — a `completados/`. Sólo quedaba `PROVISIONALES = true`, que es
  una confirmación de planta y además intocable con el tanque cerrado.
  **No se borró**: es el único registro de por qué esa bandera está en `true`.

### La línea base, medida hoy

Antes de tocar nada, todo en verde. Cualquier rojo que aparezca durante este
plan es de este plan:

```
npm run verificar                      →  41/41 pasaron (213,7 s)
verificar-herramientas (ICONICS_FAKE)  →  190 correctas · 22 omitidas
                                          (13 de las 190 sobre una configurada)
```

---

## 1. Las fases

Ordenadas por lo que desbloquean. **F0 y F1 no son de código** y son las que
más cierran: entre las dos confirman tres planes.

---

### F0 — Confirmar en el navegador lo que ya está escrito

**Objetivo.** Cerrar la confirmación pendiente de los Planes 37, 38 y 40 sin
escribir una línea.

**Por qué primero.** Las siete vistas de la sección de `Nuevo-Modor` caían en
el primer render el 21-09; **está corregido y nadie ha vuelto a entrar**. Hasta
que alguien mire, tres planes siguen abiertos por una pantalla, no por código.

**Cómo.** Con el backend arrancado, entrar a la sección de `Nuevo-Modor` y
recorrer las **siete** vistas: Inicio, Gráficas, Vista 3D, Hallazgos, Avisos,
Casos previos y RAG documental. Después el **muro de planta**, que desde el
Plan 40 F2 es la ruta por defecto.

**Criterios de aceptación.**

- [ ] Las siete vistas pintan sin caerse, y pintan **sus** apoyos, con el
      nombre que tengan en el árbol.
- [ ] El muro de planta enseña **un panel por configurada**.
- [ ] Lo que la máquina no tiene sale como **hueco, no como cero**
      (`CLAUDE.md` §2.4): sin sensor de estado, sin rodamiento declarado, sin
      sensibilidad. La ficha ya lo confiesa en `limitaciones`.
- [ ] Preguntar al asistente **desde esa pantalla** y comprobar que contesta
      sobre `Nuevo-Modor`, no sobre otra máquina.

**Al cerrarse:** el Plan 38 queda **completado** (no le queda código); el Plan
37 pierde su nota de «falta volver a entrar».

---

### F1 — Los pasos en planta (Plan 40 F4), con sus criterios

**Objetivo.** Que la única máquina de vibraciones en planta sea `Nuevo-Modor`,
con sus series verificadas en marcha.

**Por qué aquí.** Es lo único que desbloquea la **F2 del Plan 32**, y por tanto
su F3. No se puede hacer desde el repo: **necesita ICONICS delante**.

**Cómo.** Cuatro pasos, del usuario:

1. **Con el motor girando**, en la ficha de `Nuevo-Modor`, «Sondear sus
   series». En paro quedaron **33 sin muestras**; anotar aquí cuántas quedan
   verificadas ahora.
2. Si `vibraciones-configurada` sigue en el `datos/maquinas.json` de planta,
   **darla de baja o dejarla inactiva**: dos configuradas sobre la misma raíz
   se solapan y el registro se queda con la primera.
3. En `Planta › Documentación`, pasar la **ISO 20816-3**, el manual del **SM
   1281** y el del **V20** a «Todas las de Vigilancia de vibraciones». Siguen
   asignados a `vibraciones`, que ya no existe, así que hoy **no los ve
   ninguna máquina**.
4. **Dar nombre a los tres apoyos en el árbol** (`S1` → «Lado acople», etc.).
   Una configurada saca el nombre del apoyo de `assets[].nombre`, y sin él el
   asistente dice «S1 (S1, bearing unidentified)».

**Criterios de aceptación.**

- [ ] `medir-asistente-configurada` corre sobre `Nuevo-Modor` **sin otra
      vibraciones en el registro**, y su resultado se anota aquí.
- [ ] El número de series verificadas queda escrito (el «33 sin muestras» del
      sondeo en paro es la referencia contra la que se compara).
- [ ] El asistente nombra los apoyos por su nombre, no por `S1`.

**Al cerrarse:** el Plan 40 queda **completado**. El Plan 32 F2 y F3 se cierran
detrás, sin trabajo de código.

---

### F2 — El índice de sinónimos (Plan 32 F6)

**Objetivo.** Que el asistente entienda «el apoyo del motor» como el tanque
entiende «la bomba».

**Qué hay hoy, medido.** El tipo trae `vocabulario`
(`shared/eva/tipos/vibraciones.js:575`) y llega a cada configurada por
`construirSistema.js:553`. **Pero sólo alimenta el dictado**: el único
consumidor es `backend/ia/voz.mjs:79`, que se lo pasa a Whisper como contexto.
Nadie lo usa para resolver a qué se refiere **quien escribe**.

**Lo que NO es esta fase.** `shared/eva/vibraciones/aliasDeTags.js` ya existe y
**resuelve otro problema**: cómo llama el **servidor** a un tag (`VEL_RMS` →
rol `vRMS`), con la comparación ya insensible a mayúsculas, guiones y
espacios. Esta fase es cómo lo llama una **persona**. Confundirlas llevaría a
meter jerga de operario en un índice que existe para reconocer nomenclatura de
PLC.

**Cómo.** El índice cruza dos cosas que ya viajan: el `vocabulario` del TIPO y
los alias de cada variable que vienen en la **configuración** de la máquina.
Vive en el tipo, así que **lo gana toda configurada de vibraciones a la vez**.

**Riesgos.** Un sinónimo demasiado goloso («el motor») haría que una pregunta
sobre la máquina entera se resuelva a una variable. Prefiérase no resolver a
resolver mal: sin coincidencia clara, que el asistente pregunte.

**Criterios de aceptación.**

- [ ] Preguntas con jerga de operario («el apoyo del acople», «cómo va el lado
      ventilador») llegan a la variable correcta de `Nuevo-Modor`.
- [ ] Un sinónimo ambiguo **no** resuelve a ciegas.
- [ ] `verificar-herramientas` y `verificar-chat` siguen verdes (**la puerta**,
      `CLAUDE.md` §5.1).
- [ ] La prueba se rompe a propósito una vez para verla cazar (`CLAUDE.md` §6.2).

---

### F3 — Normalizar por rpm (lo que queda del Plan 32 F4)

**Objetivo.** Que el diagnóstico de vibraciones tenga en cuenta la velocidad de
giro al juzgar una medida.

**Alcance, ya recortado por el sondeo.** De los tres puntos que pedía el Plan
32 F4, **éste es el único vivo**: `necesita` ya está en las 17 reglas, y el
factor de cresta es imposible en S1 por un defecto del servidor
(`vibraciones.js:1151`: `aPeak_S1` devuelve `aRMS_S1`, 1805 de 1805 valores
idénticos, así que `aPeak/aRMS` daría **1,0 siempre**).

**Dónde.** `shared/eva/vibraciones/riesgosVibracion.js`, que es del TIPO. Las
constantes de rpm ya están ahí (`RPM_MINIMA_ISO`, `RPM_BORDE_ISO`,
`RPM_MINIMA_MODULO`) y tres reglas ya se apoyan en ellas.

**Riesgo, y es el de siempre.** El motor es determinista y **el modelo no lo
toca** (`CLAUDE.md` §2.3). Cambiar una banda sin medición delante es
exactamente lo que ese punto prohíbe: si no hay dato para calibrar, la regla
sale `provisional: true` y lo dice, no se inventa el umbral.

**Criterios de aceptación.**

- [ ] `verificar-riesgos-vibracion` verde, con casos nuevos para la
      normalización.
- [ ] Una medida por debajo de `RPM_MINIMA_ISO` sigue diciendo que la norma no
      se pronuncia, en vez de puntuar igual.
- [ ] Ningún umbral nuevo sin medición o sin `provisional: true`.

---

### F4 — Alarmas de la máquina (Plan 37 F4)

**Objetivo.** Que `maq-alarmas` enseñe el área de alarmas que la máquina
declaró (`arboles.alarmas`), no la del catálogo.

**Por qué se aplazó, y sigue valiendo.** `AlarmasEva` lee el historial con
`leerAlarmas()` sobre las señales de alarma **del TANQUE**
(`ALARMAS_HISTORIZABLES` de `senales.js`) y trae una pestaña en vivo
desconectada. **No es una vista que se parametrice con un prop.** Hoy la
sección de una configurada tiene **tres** entradas de Visualización, no cuatro,
y el menú lo dice así — no hay ruta `maq-alarmas` en `routes.jsx`.

**El paso previo es medir, no escribir.** Hay que ver **cómo contesta
`/api/iconics/alarms` a un área `ae:` entera**, y con eso decidir si esto es
una vista nueva y pequeña o una parametrización. Escribir antes de esa medida
es diseñar a ciegas.

**Cuidado con el tanque.** `AlarmasEva` es código del tanque. **No se
modifica** (`CLAUDE.md` §1): si la medida dice que hay que tocarlo, esta fase
se convierte en una vista nueva junto a él, o se anota y se deja para la
reapertura.

**Criterios de aceptación.**

- [ ] Escrito aquí qué contesta `/api/iconics/alarms` a un área `ae:` entera.
- [ ] Si sale adelante: `maq-alarmas` enseña las alarmas de **su** máquina, la
      sección pasa a cuatro entradas, y las pruebas de inventario del menú se
      actualizan **a propósito**.
- [ ] Ni una línea del tanque modificada.
- [ ] La regresión de sondeo vigilada: ningún hook nuevo que dependa de
      `useMaquina()` montado fuera de la vista de esa máquina (Plan 37 §4).

---

### F5 — Cerrar y archivar

**Objetivo.** Que al terminar esto no queden planes abiertos por inercia.

**Cómo.**

- Plan 38 → `completados/` en cuanto cierre **F0**.
- Plan 40 → `completados/` en cuanto cierre **F1**.
- Plan 32 → `completados/` con F2/F3 cerradas por F1, F5 ya completada, F4
  cerrada con su parte imposible **escrita** (no borrada: quien vuelva al
  factor de cresta tiene que encontrar por qué no se hizo).
- Plan 37 → `completados/` en cuanto cierre **F4**.
- Plan 33 → **se queda abierto**, con su F9 bloqueada. Es correcto: exige
  reabrir la estación de llenado, que es el final de la rama.
- `HANDOFF.md` §5 reescrito con lo que quede, y `CLAUDE.md` §6.1 con la lista
  de planes vivos al día.

**Criterio de aceptación.**

- [ ] `docs/por-completar/` contiene **sólo** el Plan 33 (bloqueado) y este
      plan mientras dure.

---

## 2. Lo que este plan NO hace

- **No reabre la estación de llenado.** Es el final de la rama, no una fase
  (`CLAUDE.md` §1). Con ella siguen bloqueadas la **F9 del Plan 33** y las 22
  comprobaciones omitidas de `verificar-herramientas`.
- **No toca el código del tanque.** Ni siquiera en F4, donde la vista que
  estorba es suya.
- **No añade dependencias** (`CLAUDE.md` §6.2). Si alguna pareciera necesaria
  —no se espera—, se pide antes con el motivo y qué se descartó.
- **No calcula el factor de cresta en S1.** Está medido que daría 1,0 siempre.
  Vuelve a la mesa el día que el servidor publique `aPeak_S1` de verdad.
- **No sube ningún techo para callar un rojo** (`CLAUDE.md` §6.2).

---

## 3. Orden sugerido

**F0 y F1 primero, y son del usuario**: entre las dos cierran tres planes sin
escribir código, y F1 desbloquea dos fases más del Plan 32.

Si se prefiere avanzar en código mientras tanto, **F2 y F3 no dependen de
planta**: viven en el tipo y lo que ganen lo gana cualquier configurada de
vibraciones. **F4 va la última** porque su primer paso es una medida contra el
servidor, no una decisión de diseño.
