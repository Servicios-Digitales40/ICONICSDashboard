# PLAN 31 — De reactivo a activo: avisos narrados

**Estado:** por completar
**Fecha:** 15-09-2026
**Alcance:** el tablero y el asistente. No toca el motor de diagnóstico —el
Plan 28 lo dejó con todo lo que esto necesita.

---

## 1. El hueco, dicho con precisión

Hoy el sistema es **reactivo en la última milla**. Conviene separar qué es
reactivo y qué no, porque no es todo:

| | ¿Automático? |
|---|---|
| Detectar un riesgo (`evaluarRiesgos`) | ✅ en cada sondeo |
| Reunirlo en la Bandeja (`hallazgos.js`) | ✅ |
| **Diagnosticarlo** (causas puntuadas) | ❌ sólo si alguien pulsa |
| **Narrarlo** en prosa | ❌ sólo si alguien pregunta |

Lo que la Bandeja enseña hoy es **verdadero y dinámico** —`riesgo.evidencia` se
compone con las cifras medidas en ese instante— pero contesta tres preguntas y
se queda a mitad de la cuarta:

- qué pasa → `evidencia` ✅
- qué puede pasar → `consecuencia` ✅
- qué mirar → `accion` ✅
- **por qué está pasando** → ❌

La cuarta la contesta `motorDiagnostico.diagnosticar()`, que existe, está
probado y **la Bandeja ya llama**.

> **Corrección del 15-09-2026, al empezar F1.** Este plan decía «la Bandeja no
> llama», y era falso. `useCasosDeRiesgosActivos` pedía `/api/diagnostico` por
> cada riesgo activo y se quedaba con esto:
>
> ```js
> .then((data) => ({ riesgoId, casos: data?.causas?.[0]?.casosCitados ?? [] }))
> ```
>
> Es decir: pedía el diagnóstico entero —causas puntuadas, bandas, respaldo de
> las cuatro fuentes, estado— y conservaba los casos citados de la primera
> causa. **La cuarta pregunta llevaba meses calculada y pagada en esta
> pantalla, y sin enseñarse.**
>
> Eso hace F1 más barata de lo planeado y mueve dónde está el trabajo: no es
> «añadir una llamada al motor», es dejar de tirar el resultado. La llamada no
> cambia; cambia el `.then`.

## 2. Lo que este plan NO hace, y es la mitad del diseño

### 2.1 El modelo no diagnostica

Narra un resultado **ya calculado**. Es el §2.3 —*el código puntúa, el modelo
redacta*— y no es teórico: el 03-09-2026 el modelo escribió «3 casos previos»
cuando `respaldo.casos` valía 0 en el mismo objeto. Si se le deja presentar la
conclusión como suya, la inventa cuando no la tiene.

Así que un aviso **no** dice «mi diagnóstico es que hay una fuga». Dice:

> «Hay un hallazgo nuevo en el tanque: caudal alto con presión baja y la bomba
> impulsando. La causa más respaldada es **fuga o rotura en la red** (banda
> ALTO) — el manual la respalda y un caso de enero tuvo lo mismo.»

Cada afirmación tiene detrás un número del motor. La diferencia entre las dos
frases no es de estilo: la primera es del modelo, la segunda es del motor con
voz del modelo.

### 2.2 Un aviso no acciona planta

Mismo criterio que ya defiende `BandejaEva`: se navega a `ControlesTanque`, no
hay botón propio. Y el texto no lleva órdenes de maniobra — `accion` en
`riesgos.js` es siempre «qué conviene mirar», nunca «haz esto». «No te olvides
de checarlo» es tono, no información.

### 2.3 No se diagnostica lo que nadie va a mirar

El diagnóstico se dispara **al abrir la vista**, no al activarse el riesgo.
Decidido el 15-09-2026, y con un precedente que lo respalda: el contador de
alarmas del Topbar lleva desactivado desde el 31-08 porque *«sigue sondeando
`/api/iconics/alarms` cada 30 s en TODAS las pantallas»*.

Generar en cada flanco tendría el mismo defecto multiplicado: cada riesgo
cuesta una llamada al modelo (30-90 s con el 4B), y un riesgo que parpadea las
multiplica. Se deja la puerta abierta para F3, con cooldown, si alguna vez hace
falta.

---

## 3. Fases

### F1 — El badge, y el diagnóstico al abrir

**Objetivo.** Que el técnico SEPA que hay algo sin abrir nada, y que al abrir
vea la causa más probable.

**El badge es gratis.** Cuenta lo que ya está calculado: `evaluarRiesgos()`
corre en cada sondeo, así que contar sus activos **no añade ni una petición**.
Es justamente lo que pedía la nota del contador retirado:

> *«Un contador aquí que tuviera sentido leería `activo.alarmas.activas` del
> sistema en vivo, no `useAlarmCount()`»*

**Dónde.** El punto de estado del sidebar (`Sidebar.jsx:130`), que ya existe,
está probado y funciona con la barra colapsada a 72 px. No el Topbar: arrastra
la historia del contador que se quitó.

**Qué cuenta, y qué NO dice.** Cuenta hallazgos —riesgos activos y casos
proactivos—, que son hechos ya calculados. **No** dice «N diagnósticos»: los
diagnósticos no existen hasta que se abre la vista, y prometerlos sería
afirmar algo que no se ha hecho (§2.4).

**Archivos**
- `react-dashboard/src/app/layout/Sidebar.jsx` — el badge
- `react-dashboard/src/Demo-EVA/views/comunes/BandejaEva.jsx` — llamar al motor
- `react-dashboard/src/Demo-EVA/data/comunes/` — el hook que cuenta

**Pruebas**
- El badge no dispara ninguna petición nueva (contar `fetch`)
- Con cero hallazgos no se pinta nada — un badge en «0» es ruido
- El diagnóstico se pide al MONTAR la vista, no en cada render

**Criterios de aceptación**
- [x] El badge no añade peticiones
- [x] Cuenta hallazgos, no diagnósticos
- [x] La vista enseña la causa más respaldada, con su banda
- [x] Sin LLM: F1 entera es determinista

**Estado: COMPLETADA el 15-09-2026.** 12 pruebas nuevas, 943 en verde, 30/30
verificadores.

Lo que se construyó, que no es exactamente lo planeado:

- `data/comunes/hallazgos.js` — `useConteoHallazgos()`, sobre el snapshot que
  los dos sondeos ya traen. Cero peticiones, con prueba que cuenta `fetch`.
- `lib/vistoPorMi.js` — **le faltaba `suscribir()`**. El plan daba por hecho
  que el badge podía leer la misma clave que la Bandeja y enterarse de los
  descartes; no podía. Hasta ahora quien marcaba y quien leía eran el mismo
  componente, así que su `useState` bastaba. El badge vive en otro árbol de
  React, y el evento `storage` del navegador no sirve —por estándar sólo se
  dispara en las OTRAS pestañas, nunca en la que escribió—.
- `Sidebar.jsx` — el badge, en el punto de estado que ya existía. También en la
  **cabecera del grupo**, que el plan no preveía: con la barra colapsada a 72px
  o el grupo plegado los hijos no se pintan, y el badge habría desaparecido
  justo en los dos estados donde más falta hace.
- `BandejaEva.jsx` — la línea de causa, con su banda y con el estado del
  diagnóstico cuando no es `completo` (Plan 28 F3).

**El defecto que estuvo a punto de colarse.** El primer borrador del hook
llamaba a `vistoPorMi.clave` y `vistoPorMi.suscribir()` dando por hecho que
existían. Ninguno de los dos existía, y **ninguno habría dado error**:
`evento.key === undefined` simplemente no se cumple nunca, y `baja?.()` se
traga la ausencia. El badge habría contado bien al montar y no habría bajado
jamás al descartar. Lo atrapó leer el archivo en vez de asumir su forma.

### F2 — La vista de avisos narrados

**Objetivo.** Que el técnico lea en una frase qué le está pasando a la planta.

**Vista nueva**, no una pestaña de la Bandeja. El tono es distinto: la Bandeja
es un inventario —«esto está pendiente de mirar»—; esto es un aviso —«oye, mira
esto». Mezclarlos haría que la lista larga se leyera con la urgencia del aviso,
o al revés.

**Qué narra.** El resultado del motor, con la instrucción que ya usa
`diagnosticar_falla`: causas en el orden dado, sin reordenar, banda tal cual y
sin porcentajes. Si `estado` no es `completo` (Plan 28 F3), lo dice.

**El botón.** Lleva al detalle del diagnóstico. No acciona nada.

**Archivos nuevos**
- `react-dashboard/src/Demo-EVA/views/comunes/AvisosEva.jsx`
- Una entrada en `routes.jsx` con su `nav`

**Archivos que se modifican**
- `backend/ia/conversacion/chat.mjs` o una ruta propia — por decidir en F2

**Pruebas**
- Sin servidor de IA, la vista enseña el diagnóstico SIN narrar — no se queda
  en blanco (§2.5: degradar diciéndolo)
- La narración no inventa causas que el motor no dio
- Los dos idiomas

**Criterios de aceptación**
- [ ] El modelo narra, no diagnostica
- [ ] Sin LLM la vista sigue siendo útil
- [ ] Ningún botón acciona planta
- [ ] `verificar-i18n` y `verificar-textos` en verde

### F3 — Ciclo de vida del aviso

**Objetivo.** Que la vista no se llene de ruido.

Lo que hay que decidir, y por eso es fase aparte:

- **Cooldown** — un riesgo que parpadea no puede generar cien avisos.
- **Duplicados** — ¿el mismo riesgo re-diagnosticado es uno nuevo o el mismo
  actualizado?
- **Cierre** — ¿el aviso desaparece cuando el riesgo deja de estar activo, o se
  queda hasta que alguien lo lea?
- **Persistencia** — `vistoPorMi` es por dispositivo (`localStorage`). ¿Basta,
  o el descarte debe ser de la planta?

**Lo que ya está resuelto y no hay que inventar:** el diario del Plan 28 F2
guarda cada diagnóstico con su `diagnosticEventId`, su snapshot y su duración.
Esa era la pieza que faltaba — la cabecera de `hallazgos.js` decía que los
«diagnósticos sin cerrar» no se podían construir porque *«no hay ningún sitio
donde conste qué diagnósticos se calcularon»*. **Desde el 15-09-2026 sí lo
hay.**

---

## 4. Riesgos

| Riesgo | Mitigación |
|---|---|
| El modelo presenta la conclusión como suya | §2.1; la instrucción de `diagnosticar_falla` ya lo prohíbe y se reutiliza |
| El badge sondea y encarece todas las pantallas | F1 cuenta lo ya calculado; hay una prueba que cuenta peticiones |
| La vista se llena de ruido y se deja de mirar | F3, y hasta entonces el alcance es sólo lo que ya filtra `vistoPorMi` |
| Narrar cada hallazgo satura el servidor de IA | Se narra al abrir, no al activarse; con el 4B una llamada son 30-90 s |
| Un aviso se lee como una orden | §2.2: sin botones de maniobra, y `accion` nunca es una orden |

## 5. Lo que queda fuera

- **Notificaciones fuera del tablero** (correo, push). Otro problema.
- **Diagnóstico en el flanco de activación.** Puede entrar en F3 con cooldown,
  no antes.
- **Vibraciones.** Tiene 15 huérfanos de 18 riesgos: un aviso narrado sobre un
  riesgo sin causas diría «no hay nada que diagnosticar», que es correcto y
  también inútil. Primero el catálogo.
