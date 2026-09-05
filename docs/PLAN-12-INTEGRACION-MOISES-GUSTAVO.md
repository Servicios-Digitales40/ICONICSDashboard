> **Documento histórico.** Describe el alcance y las decisiones de su fecha, incluidas rutas y archivos posteriormente retirados. Para instalación, capacidades y estructura actuales consulta [el índice documental](README.md).

# Plan 12 · Integrar `Gustavo` sobre `Moises` en una rama intermedia

> **Objetivo.** Juntar en una sola rama las dos líneas de trabajo que salieron
> del mismo punto (`99a3809`, `demo-3`) sin tocar ninguna de las dos ramas
> originales: la UI/tablero de `Moises` y el asistente de voz, cola y
> documentación de `Gustavo`. La rama intermedia es
> **`integracion/moises-gustavo`**, creada desde `Moises`.

> **ESTADO (20-ago-2026)** — **MERGE HECHO** en `integracion/moises-gustavo`
> (commit `3980d8d`). Todo lo automatizable está en verde; queda la prueba en
> pantalla del §6, que necesita el servidor ICONICS y los tres procesos de IA.

---

## 1 · El punto de partida, medido

Las dos ramas divergen del mismo commit y ninguna ha visto a la otra:

```
merge-base = 99a3809  (demo-3, "Impeccable y demo base")
  Moises  : 10 commits por delante   (272b3d6 "Mejoras UI Graficas Finales")
  Gustavo :  7 commits por delante   (3dd5f39 "El modo llamada detecta cuándo dejas de hablar")
```

**Qué trae cada una** (archivos tocados desde la base):

| | `Moises` | `Gustavo` |
|---|---|---|
| Frontend | 53 archivos: vista de detalle, selector de rango, temas, sidebar/topbar, rediseño del panel del asistente | Asistente: voz, manos libres, persistencia del hilo |
| Backend | `controlar_bomba` (única escritura del catálogo) | `config.mjs` nuevo, cola de consultas, índice de documentos, Whisper, 5 herramientas nuevas |
| Compartido | — | `shared/eva/estadistica.js`, `shared/eva/graficos.js` |

**Los cuatro choques reales** (`git merge-tree`, medido, no supuesto):

1. `backend/app.mjs`
2. `backend/ia/herramientas.mjs`
3. `react-dashboard/src/features/asistente/components/Asistente.jsx`
4. `react-dashboard/src/test/features/asistente/asistente.test.jsx`

`backend/ia/chat.mjs` y `react-dashboard/src/app/App.jsx` los toca Git solo.

## 2 · Por qué un merge y no siete cherry-picks

Los 7 commits de `Gustavo` son acumulativos sobre los mismos archivos
(`Asistente.jsx` lo tocan cuatro de ellos). Integrarlos uno a uno haría
resolver **el mismo conflicto cuatro veces**, cada vez contra un estado
intermedio que nadie va a ejecutar nunca. Un único merge resuelve cada
archivo una sola vez contra su estado final, y conserva los 7 commits en el
historial igual que antes.

Lo que sí se hace commit a commit es la **revisión**: cada mensaje de
`Gustavo` explica una decisión de diseño, y esas decisiones son las que
gobiernan cómo se resuelve cada conflicto (§3).

## 3 · La decisión que no es mecánica: el dictado, por duplicado

Las dos ramas implementaron dictado por voz **por caminos distintos**:

- `Moises` — `lib/useDictado.js`, Web Speech API del navegador. No pide
  servidor, pero no existe en Firefox y el botón se esconde solo allí.
- `Gustavo` — `useDictado` + `useManosLibres` dentro de `useAsistente.js`,
  grabando audio y transcribiendo contra `whisper-server`
  (`IA_WHISPER_BASE`). Funciona en cualquier navegador y es **la base del
  modo llamada** de `3dd5f39`, que detecta el silencio para cerrar el turno.

**Se queda el de `Gustavo`.** Dos motivos: el de `Moises` no puede sostener el
modo manos libres (la Web Speech API no da el flujo de audio que necesita el
detector de silencio), y mantener los dos dejaría dos micrófonos en la misma
barra haciendo cosas distintas. Se pierde la ventaja de no necesitar el tercer
proceso: sin `IA_WHISPER_BASE` el botón de micro no aparece, igual que antes no
aparecía en Firefox.

El resto de lo que añadió `Moises` al panel —maximizar, adjuntar texto plano,
el trazo de osciloscopio, los temas— **no choca con nada** y se conserva
entero: es la carcasa visual sobre la que se injertan las piezas de `Gustavo`.

## 4 · Fases

### Fase 0 — Línea base, antes de mezclar
Medir qué pasa y qué falla **ya** en `Moises`, para no atribuir al merge algo
que venía roto de antes.

### Fase 1 — Merge y conflictos mecánicos
`git merge origin/Gustavo`, y resolver los tres que son unión de dos añadidos
en el mismo sitio:

- **`app.mjs`** — `createHerramientas` recibe `readOnly` (Moises) **y**
  `indiceDocumentos` (Gustavo); se quedan la cola, la voz y sus rutas.
- **`herramientas.mjs`** — la firma admite los dos parámetros; conviven
  `controlar_bomba` (Moises) y las cinco de Gustavo; `DEFINICIONES` las lista
  todas. La cabecera del archivo mantiene el aviso de Moises sobre la única
  escritura del catálogo.
- **`asistente.test.jsx`** — unión de comprobaciones, con el `localStorage`
  limpio entre pruebas que exige `fc1cfdc`.

### Fase 2 — `Asistente.jsx` a mano
Base: la versión de `Moises`. Se injerta encima, en este orden:

1. `export const NOMBRE = "Tdconcito"` y sus cinco usos (rótulo, `aria-label`
   del botón flotante, cerrar, manos libres, `ErrorBoundary`).
2. El dictado pasa a `useDictado` de `useAsistente.js`; se borra el import de
   `lib/useDictado.js`.
3. Botón de manos libres (`PhoneCall`/`PhoneOff`) con su anillo de nivel.
4. Esperar turno en la cola se pinta como espera, **no** como error.

### Fase 3 — Arreglar lo que la base traía roto
`scripts/verificar-herramientas.mjs` no conoce `controlar_bomba` y por eso
falla en `Moises` desde `2c344a4`. La lista esperada se actualiza aquí, con el
catálogo ya completo de las dos ramas.

### Fase 4 — Documentación de cara al usuario
El `README.md` que gana el merge es el de `Gustavo` y su tabla de herramientas
no menciona `controlar_bomba` ni el rediseño del tablero. Se completa.

### Fase 5 — Verificación
Todo lo automatizable, y el resto anotado para la prueba en pantalla:

| Comprobación | Cómo |
|---|---|
| Frontend | `cd react-dashboard && npm test` |
| Contrato HTTP | `node scripts/verificar-backend.mjs` |
| Herramientas | `node scripts/verificar-herramientas.mjs` |
| Bucle de chat + cola | `node scripts/verificar-chat.mjs` |
| Voz / manos libres | `node scripts/verificar-voz.mjs`, `verificar-manos-libres.mjs` |
| Compilación | `cd react-dashboard && npm run build` |
| Arranque sin 3D | `node scripts/verificar-bundle.mjs` |

## 5 · Resultado por fase

| Fase | Qué pasó | Verificación |
|---|---|---|
| 0 | Línea base medida en `Moises` | 191 pruebas de frontend en verde; `verificar-herramientas.mjs` **ya fallaba** (ver Fase 3) |
| 1 | Merge y los tres conflictos mecánicos | `app.mjs`, `herramientas.mjs` y `asistente.test.jsx` resueltos por unión; `chat.mjs` y `App.jsx` los resolvió Git |
| 2 | `Asistente.jsx` a mano | Carcasa de `Moises` + voz de `Gustavo`; `lib/useDictado.js` borrado |
| 3 | `verificar-herramientas.mjs` puesto al día | 53 comprobaciones, **6 nuevas** sobre `controlar_bomba` |
| 4 | Documentación | `README.md`, `backend/README.md` y `.env.example` |
| 5 | Verificación completa | **205** frontend · **51** contrato · **53** herramientas · **42** chat · **12** voz · **11** manos libres · compila · arranque sin 3D |

### Lo que la Fase 2 encontró y no estaba en el plan

Tres cosas que sólo salen al juntar las ramas, y que ninguna prueba habría
señalado porque ninguna de las dos está mal por separado:

1. **La línea de procedencia se habría quedado muda.** `useAsistente.js` pasó a
   emitir `consultas` en plural y `adjuntos`; el `Asistente.jsx` de `Moises`
   seguía leyendo `mensaje.herramienta`. Sin portar el `Turno`, debajo de cada
   respuesta no habría aparecido de dónde salió el dato —la invariante que
   permite creerse una cifra— y los gráficos no se habrían pintado. Sin error y
   sin aviso.
2. **La bomba no tenía estado que enseñar.** `ESTADO_POR_HERRAMIENTA` es de
   `Gustavo` y no conocía `controlar_bomba`, así que mientras se escribe y se
   relee el punto la pantalla decía «Consultando ICONICS…». Ahora dice
   «Actuando sobre la bomba…».
3. **El clip seguía activo en manos libres.** Un adjunto puesto ahí no viaja con
   ninguna pregunta —el manos libres no pasa por ese formulario— y se habría
   quedado colgado en la barra. Se deshabilita mientras dure la llamada.

### Y lo que venía roto de antes

`scripts/verificar-herramientas.mjs` fallaba en `Moises` desde `2c344a4`:
fijaba «son ocho herramientas, y ninguna escribe», y `controlar_bomba` rompe
las dos mitades de esa frase. La comprobación se reescribe contra lo que ahora
es cierto —nueve, y la escritura está en una sola, comprobada por nombre— y la
única escritura pasa a tener las pruebas que no tenía: solo lectura, tanque
lleno al encender, apagado sin mirar el nivel, escritura rechazada, y el caso
que de verdad importa, **una escritura que el servidor acepta y que el punto no
refleja**.

## 6 · Lo que queda para la prueba en pantalla

Nada de esto lo puede confirmar una prueba automática; necesita el servidor
ICONICS y los tres procesos de IA arriba (recordatorio: GENESIS64 tarda 3-4
minutos en levantar sus servicios tras reiniciar):

- [ ] El panel maximizado, el adjunto de texto y el trazo siguen como en `Moises`.
- [ ] El micrófono transcribe por Whisper y el texto cae en el cuadro de entrada.
- [ ] El modo llamada cierra el turno solo al callarse y responde en voz.
- [ ] Dos pestañas preguntando a la vez: la segunda ve su puesto en la fila.
- [ ] Cerrar el panel y recargar conserva el hilo.
- [ ] `controlar_bomba` sigue encendiendo y apagando contra el tag real.
- [ ] Los tres temas (claro, oscuro, Mitsubishi) siguen bien en el asistente.
