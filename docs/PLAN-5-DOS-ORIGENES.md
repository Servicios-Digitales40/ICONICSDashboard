# Plan 5 · De tres orígenes a dos

> **ESTADO (12-ago-2026)** — **Ejecutado y verificado. Las cinco fases.**
>
> Dos orígenes: «En vivo» y «Simulado». `demoSource.js` borrado. La suite pasa
> de 178 a **196 pruebas**.
>
> | Comprobación | Resultado |
> |---|---|
> | Build de planta · `index` / `vendor` | 154.02 / 79.73 KB |
> | Build de planta · rutas experimentales | **ninguna** en el `dist` |
> | Build con banderas · trozos experimentales | 14, todos diferidos |
> | `three` en los dos builds | diferido, sin `modulepreload` |
>
> **Tres cosas que aparecieron al ejecutar y no estaban en el plan:**
>
> 1. `snapshotDemo` lo usaban **dos pruebas de prototipos**, no sólo
>    `demoSource.test.js`. Se movió a `test/fixtures/machinesDemo.js`, que es
>    donde debía estar desde el principio: nunca fue código de aplicación.
> 2. La comprobación de §7 encontró **dos aserciones sin cobertura en otro
>    sitio**, no una. Se trasladaron antes de borrar (ver abajo).
> 3. `useIconicsStats` deja de devolver `null` con datos falsos, así que el
>    contador de red del Topbar ahora funciona también en simulado — sus cifras
>    son las del motor real.
>
> **Dónde acabó la cobertura de `demoSource.test.js`:**
>
> | Qué fijaba | Dónde vive ahora |
> |---|---|
> | Agregados contra la referencia congelada | Ya estaba en `plantModel.golden.test.js` |
> | Invariantes de series (`trendInvariants`) | **Trasladado** a `plantModel.golden.test.js` |
> | Las 10 máquinas y su nomenclatura | **Trasladado** a `lib/iconics/tagCatalog.test.js` (nuevo) |
> | Ciclo de vida de la fuente | Cubierto por `iconicsSource.test.js` y `pollingEngine.test.js` |

Quinto plan. Independiente de los anteriores. No añade funcionalidad: **quita un camino de
datos entero** y desenreda una bandera que hoy hace dos trabajos sin relación.

La tesis, en una frase: **el modo Demo se saltaba justo lo que había que probar, y el
Simulado no se podía encender sin recompilar.** Arreglando lo segundo, lo primero sobra.

**Convención de esfuerzo:** ▁ bajo (horas) · ▄ medio (días) · █ alto (semanas).

---

## 1. El problema, en dos partes

### 1.1 · Hay dos falsos y sólo uno prueba algo

| | Sustituye | Motor de polling | Calidad OPC · reintentos · dato rancio |
|---|---|---|---|
| **Simulado** (`fakeTransport`) | el **transporte** | corre | **se ejercitan** |
| **Demo** (`demoSource`) | la **fuente** entera | se salta | no existen |

`demoSource.js` son 225 líneas que reimplementan `subscribePlant`, `subscribeMachine`,
`readHistory`, `readDay` y `readDailyOee`. Es un segundo camino de datos completo, en
paralelo al real, **que por diseño evita todo lo que puede fallar de verdad**. Como banco de
pruebas de interfaz es estrictamente peor que el simulador, que sí pasa por el motor y trae
caos suave encendido a propósito.

Su propia cabecera lo reconoce, y `fakeTransport.js` lo dice desde el otro lado: *«No basta
con `demoSource`, que sustituye la capa de dominio [...]: el motor vive por debajo y su
trabajo es justamente lo que `demoSource` se salta»*.

### 1.2 · `VITE_ENABLE_DEMO` hace dos trabajos que no tienen nada que ver

```
VITE_ENABLE_DEMO=true  ─┬─► el interruptor de datos del Topbar   (DataSourceProvider)
                        └─► 5 bloques de rutas experimentales    (routes.jsx)
                             · las 12 propuestas de diseño
                             · «Máquina 3D»
```

Hoy no se puede tener las propuestas de diseño sin ofrecer además el interruptor de datos
falsos, ni al revés. **Ésta es la parte que hay que arreglar aunque no se toque nada más**:
borrar el modo Demo sin partir la bandera dejaría una bandera mal nombrada haciendo la mitad
de su trabajo.

---

## 2. Qué se gana, qué se pierde y cómo se recupera

**Se gana**

- Un solo camino de datos. Todo pasa por `iconicsSource` → motor de polling → transporte.
- `demoSource.js` y su prueba desaparecen.
- **El simulador se puede encender en caliente**, que es lo único realmente útil que hoy
  aporta el Demo. Enseñar la interfaz en una pantalla ya desplegada deja de exigir otro build.
- El contador de red del Topbar (`useIconicsStats`) empieza a funcionar también con datos
  falsos: hoy devuelve `null` en demo porque no hay motor que medir. Con el simulador **sí lo
  hay**, y sus cifras son las del motor real.

**Se pierde, y cómo se compensa**

| Se pierde | Compensación |
|---|---|
| Números **fijos**, congelados en una referencia | `VITE_ICONICS_CHAOS=none` — `SIN_CAOS` ya existe en `fakeTransport.js`, sólo falta poder elegirlo |
| Estados **quietos** (Demo asigna uno fijo por máquina) | Se acepta: el simulador los rota cada 7 ciclos, y para las vistas 3D eso es **mejor** —se ven las transiciones— |
| La prueba de referencia congelada de `demoSource` | Verificar antes de borrarla que no cubre nada que `plantModel.golden.test.js` no cubra ya (§7) |

---

## 3. El diseño nuevo

**El interruptor del Topbar deja de conmutar la FUENTE y pasa a conmutar el TRANSPORTE.**

```
ANTES                                  DESPUÉS

mode: live | demo                      transporte: real | simulado
  ├ live  → iconicsSource                ├ real     → iconicsSource + transporte real
  │          ├ transporte real           └ simulado → iconicsSource + transporte falso
  │          └ transporte falso
  └ demo  → demoSource   ← se borra    (un solo camino, siempre por el motor)
```

Cambios concretos:

- `MODOS = { LIVE, DEMO }` desaparece. En su lugar, `TRANSPORTES = { REAL, SIMULADO }`.
- `createTransport()` pasa a recibir cuál quiere: `createTransport(clase)`.
- `origenActual(transporte)` devuelve `ORIGENES.real` o `ORIGENES.simulado`. Se acabó el
  tercer caso, y con él la regla de precedencia *«la demo manda sobre el transporte»*.
- `ORIGENES.demo` se borra. Quedan dos, y **el simulado sigue obligado a anunciarse**.
- `demoSource.js` se borra entero.
- `useIconicsStats` pierde su rama `isDemo`.
- `types.js` pasa de documentar dos implementaciones de `DataSource` a documentar una.

`VITE_ICONICS_FAKE` **conserva el nombre y cambia de significado**: de «usa el simulador» a
«arranca en simulado». Se conserva el nombre a propósito, porque la receta de despliegue del
[Plan 3](PLAN-3-PRODUCCION.md) comprueba que esa variable no esté puesta en producción, y
renombrarla obligaría a tocar esa comprobación sin ganar nada.

Consecuencia que conviene tener escrita: con `VITE_ICONICS_FAKE=true` pero **sin** la bandera
del interruptor, se arranca en simulado y no hay forma de volver a real. Es exactamente el
comportamiento de hoy, así que no es una regresión — pero ahora es una combinación posible y
hay que documentarla.

---

## 4. La partición de la bandera

| Bandera | Gatea | Por defecto |
|---|---|---|
| `VITE_ENABLE_SIMULATOR` | el **interruptor** de origen del Topbar | apagada |
| `VITE_ENABLE_PROTOTYPES` | las **rutas** experimentales: las 12 propuestas de diseño | apagada |
| `VITE_ICONICS_FAKE` | el transporte **inicial** | real |
| `VITE_ICONICS_CHAOS` | `none` · `soft` · `high` | `soft` |

**Dónde viven.** `VITE_ENABLE_PROTOTYPES` **no** puede quedarse en `lib/datasource/`: que una
bandera de rutas se exporte desde el módulo de datos es la conflación misma. Va a un
`src/lib/flags.js` propio, y `routes.jsx` la importa de ahí.

> ⚠️ **La forma exacta importa.** La cabecera de `DEMO_HABILITADO` explica por qué se escribe
> `import.meta.env.VITE_ENABLE_DEMO === "true"` **sin** `?.`: el empaquetador sustituye ese
> acceso por un literal y puede plegar la comparación, y **de ese plegado depende que las
> rutas de propuesta no generen sus trozos en el build de planta**. Con `?.` la expresión
> sobrevive a la compilación y los trozos se emiten igual.
>
> La bandera nueva tiene que respetar eso al pie de la letra, y `routes.test.jsx` más el
> `dist` son quienes lo comprueban.

**Cambio de configuración con ruptura.** `VITE_ENABLE_DEMO` deja de existir. Un `.env.local`
que la traiga dejará de surtir efecto **en silencio**. Hay que actualizar, y está enumerado
en §6: los dos README, el Plan 3 (incluida su comprobación de despliegue en PowerShell) y
`.claude/settings.local.json`.

---

## 5. Invariantes que NO pueden regresar

Son las que costó descubrir y las que la prisa se lleva por delante. Cada una tiene su prueba.

1. **Todo origen que no sea el servidor real se anuncia** (`avisa: true`). Es la regla que
   evita confundir datos inventados con la planta, y los del simulador son plausibles a
   propósito: el OEE es el producto real de sus factores y las piezas crecen.
2. **El interruptor sigue gateado en build.** El motivo original vale igual para el simulador
   que para la demo: en un monitor sin teclado, un botón que sustituye la planta por datos
   inventados sólo puede pulsarse por accidente, y una vez pulsado nadie lo despulsa.
3. **El cierre vive en el MODELO, no en que el Topbar oculte el botón.** Si viviera sólo en la
   interfaz, cualquier consumidor futuro lo reabriría sin enterarse.
4. **Una preferencia guardada de «simulado» se ignora si la bandera está apagada.** Sin esto,
   una pantalla que quedó en simulado antes de apagar la bandera arrancaría en simulado para
   siempre, ya sin botón para sacarla.
5. **Al cambiar de origen los hijos se remontan** (`key`) y la fuente anterior recibe `stop()`,
   o su motor seguiría sondeando en segundo plano y se mezclarían valores.
6. **Sin la bandera, el indicador de origen se queda**; lo que desaparece es que sea pulsable.
   Distinguir servidor real de simulador sigue importando aunque no se pueda cambiar.

---

## 6. Archivos que se tocan

**Se borra**

- `src/lib/datasource/demoSource.js` (225 líneas)
- `src/test/lib/datasource/demoSource.test.js` — previa comprobación de §7

**Código**

| Archivo | Cambio |
|---|---|
| `src/lib/flags.js` | **nuevo** — `PROTOTIPOS_HABILITADOS`, con la nota del plegado |
| `src/lib/datasource/DataSourceProvider.jsx` | `TRANSPORTES` en vez de `MODOS`; sin `demoSource`; `ORIGENES` a dos |
| `src/lib/datasource/index.js` | deja de reexportar `DEMO_HABILITADO` |
| `src/lib/datasource/types.js` | una implementación de `DataSource`, no dos |
| `src/lib/datasource/hooks.js` | `useIconicsStats` pierde la rama `isDemo` |
| `src/lib/iconics/transport.js` | `createTransport(clase)`; preset de caos por variable |
| `src/app/layout/Topbar.jsx` | el botón conmuta transporte; etiquetas y `aria-*` |
| `src/app/routes/routes.jsx` | 5 bloques pasan a `PROTOTIPOS_HABILITADOS` |

**Documentación y configuración** — y esto **no** es opcional, porque el rename es silencioso:

`README.md` (raíz) · `react-dashboard/README.md` · `docs/PLAN-3-PRODUCCION.md` (§ despliegue,
incluida la comprobación PowerShell de la línea 423) · `react-dashboard/src/test/README.md` ·
`.claude/settings.local.json` · `.env.example` si llega a existir.

---

## 7. Pruebas

| Archivo | Cambio |
|---|---|
| `test/lib/datasource/origen.test.jsx` | De **tres** orígenes a dos. Se cae *«la demo manda sobre el transporte»*. Se conservan, reescritas, las cuatro invariantes de §5 que ya cubría |
| `test/lib/datasource/demoSource.test.js` | **Borrar** — ver el aviso de abajo |
| `test/app/routes.test.jsx` | `rutasCon()` deja de manipular `VITE_ENABLE_DEMO` y pasa a `VITE_ENABLE_PROTOTYPES`. Las aserciones de superficie no cambian |
| **nueva** `test/lib/iconics/caos.test.js` | Que `VITE_ICONICS_CHAOS=none` produzca de verdad cero huecos y cero mala calidad. Es lo que sustituye a los números fijos del Demo, así que conviene que esté probado y no supuesto |
| **nueva**, en `origen.test.jsx` | Que una preferencia guardada de «simulado» se ignore sin la bandera (invariante 4) |

> ⚠️ **Antes de borrar `demoSource.test.js`.** Congela los agregados contra una referencia y
> nació para probar que la migración de arquitectura no movía ni un número. Hay que
> **comprobar, no suponer**, que lo que fija está cubierto por
> `plantModel.golden.test.js` — que congela el rollup— y por `machine.test.js` —que fija la
> frontera de saneamiento—. Si queda algo sin cubrir, se traslada la aserción antes de borrar
> el archivo.

---

## 8. Fases

| # | Fase | Entregable | Esfuerzo |
|---|---|---|---|
| **A** | Partir la bandera | `src/lib/flags.js` con `VITE_ENABLE_PROTOTYPES`; `routes.jsx` la usa; `routes.test.jsx` actualizada. **`dist` comprobado**: las propuestas siguen fuera del build de planta | ▁ |
| **B** | El interruptor conmuta transporte | `TRANSPORTES`, `createTransport(clase)`, `origenActual` a dos, Topbar. `demoSource` **todavía existe** pero ya no se alcanza | ▁ |
| **C** | Borrar `demoSource` | El archivo y su prueba, tras la comprobación de §7. `types.js` y `useIconicsStats` simplificados | ▁ |
| **D** | Caos elegible | `VITE_ICONICS_CHAOS` + su prueba. Es lo que devuelve la predecibilidad que daba el Demo | ▁ |
| **E** | Documentación | Los cinco archivos de §6. Sin esto, el rename rompe configuraciones en silencio | ▁ |

El orden importa en un punto: **A va primero y sola**. Es la parte que aporta valor aunque el
resto no se haga nunca, y es la única que toca el mecanismo del que depende que las 12
propuestas no viajen al tablero de planta — conviene verla aislada en el `dist` antes de
mezclarla con nada.

---

## 9. Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| **R-1** | El plegado de la bandera nueva no funciona y las propuestas vuelven al build de planta | Es un fallo **silencioso**: la app funciona igual. Se comprueba en el `dist` al final de la Fase A, buscando `SandboxPage-*.js`. Ya pasó una vez, y está documentado en `routes.jsx` |
| **R-2** | Un `.env.local` con `VITE_ENABLE_DEMO` deja de surtir efecto sin avisar | Fase E, y avisar a quien tenga entornos montados. Vite **no** advierte de variables que nadie lee |
| **R-3** | Perder cobertura al borrar `demoSource.test.js` | El aviso de §7: comprobar antes, trasladar lo que falte |
| **R-4** | La demostración pierde predecibilidad | Fase D. Y conviene ensayarla con `CHAOS=none` **antes** de necesitarla delante de público |
| **R-5** | El interruptor en caliente reintroduce el riesgo que motivó gatear el Demo | No se toca: sigue gateado en build, cerrado en el modelo, y con la preferencia guardada ignorada sin bandera (§5) |
