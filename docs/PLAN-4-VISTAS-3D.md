# Plan 4 · Vistas 3D (React Three Fiber)

> **ESTADO (11-ago-2026)** — **Fases 0 a 4 ejecutadas y verificadas.**
>
> Las dos vistas funcionan en el build de demo con datos reales del origen
> activo. La suite pasa de 142 a **177 pruebas**. El arranque de planta no
> paga la pila 3D: `index` 149.67 KB y `vendor` 75.43 KB, **idénticos** al
> build anterior a instalar `three`.
>
> | Fase | Entregable | Verificación |
> |---|---|---|
> | 0 | Dependencias, trozo `three`, `Escena` | `verificar-bundle.mjs` + pantalla |
> | 1 | `estadoVisual.js`, los 11 estados | 18 pruebas en node |
> | 2 | Vista «Máquina 3D» | pantalla, los 11 comportamientos |
> | 3 | Vista «Maqueta 3D» | 8 pruebas de layout + pantalla |
> | 4 | `frameloop` bajo demanda, respaldo sin WebGL | 5 + 4 pruebas |
>
> **Dos correcciones sobre lo planificado**, las dos documentadas en su sitio:
> se retiraron tres bucles de animación que no informaban de nada (§4), y el
> reparto de trozos necesitó fijar `__vitePreload` a mano (§7).
>
> **Fase 5 ejecutada, y corregida después.** La **sección 3D entera** va en los
> dos builds (§8). Se hizo en dos pasos: primero sólo «Maqueta 3D», y luego
> «Máquina 3D» al detectar que estaba detrás de la bandera de prototipos por
> **herencia** del antiguo modo demo, no por ser un prototipo.
>
> Se promovió **sin la medición de FPS** que el plan pedía como requisito. Es
> una decisión tomada a sabiendas, y el riesgo está acotado por lo que ya hay:
> respaldo sin WebGL, `frameloop` bajo demanda y `dpr` con techo. **La medición
> sigue pendiente** (§9) y es lo que dirá si hace falta compartir geometría o
> pasar a `<Instances>`.
>
> **Pendiente:**
>
> - Medir FPS y memoria en el wallboard (§9). Es lo único que queda del §9.
> - Compartir geometría y materiales entre las diez máquinas (§9). **No hecho**:
>   ahorraría memoria y tiempo de subida, pero **no llamadas de dibujo**, así
>   que sin la medición sería optimizar a ciegas.
> - Fase 6, los modelos GLB: bloqueada por D-1 —confirmado que no existen— y
>   aplazada por decisión, no por falta de tiempo.
> - D-6, las coordenadas reales del plano de planta.

Cuarto plan. **Independiente de los [1](PLAN-1-CONEXION-ICONICS.md),
[2](PLAN-2-MEJORAS.md) y [3](PLAN-3-PRODUCCION.md)**: no toca el puente con ICONICS
ni el despliegue. Añade superficie nueva, y por eso lo primero que hace es
justificar por qué esa superficie no le cuesta nada al tablero de planta.

Lo pedido:

1. Una sección **«3D»** en el sidebar con dos vistas.
2. **«Máquina 3D»** — un modelo que *se comporta distinto* según el estado del equipo.
3. **«Maqueta 3D»** — la planta entera en miniatura, con un modal por máquina que
   enseñe **OEE, Disponibilidad, Rendimiento y Calidad**.

**Convención de esfuerzo:** ▁ bajo (horas) · ▄ medio (días) · █ alto (semanas).

---

## 1. Lo que hay hoy, medido

| Comprobación | Resultado |
|---|---|
| React | **18.3.1** — determina qué mayor de r3f se puede instalar (§6) |
| Dependencias de runtime | 6 (`d3-sankey`, `d3-shape`, `lucide-react`, `react`, `react-dom`, `recharts`) |
| Bundle de planta (`dist/assets`, 11-ago) | `index` 163 KB · `charts` 382 KB · `react` 142 KB · `vendor` 81 KB ≈ **770 KB** |
| Partición del bundle | ya existe: `manualChunks` por ruta de módulo en [vite.config.js:63](../react-dashboard/vite.config.js#L63) |
| Carga diferida por ruta | ya existe: `lazy()` + `<Suspense>` en [App.jsx:100](../react-dashboard/src/app/App.jsx#L100) |
| Estados canónicos | **6**, en [lib/domain/estado.js:27](../react-dashboard/src/lib/domain/estado.js#L27) |
| Máquinas reales | **10**: LIN 1–7 y REC 10/11/13, en [tagCatalog.js:25](../react-dashboard/src/lib/iconics/tagCatalog.js#L25) |

Tres cosas del código ya existente que este plan **reutiliza en vez de reinventar**:

- **El dato ya llega normalizado.** `usePlantData()` y `useMachineData(id)` devuelven la
  forma `Machine` del dominio. Las vistas 3D no hablan con ICONICS ni con el modo demo:
  se enganchan al mismo hook que las tarjetas, y funcionan igual en los dos orígenes.
- **El estado ya tiene color.** `estadoInfo(key).token` da un nombre de token del tema
  (`success`, `coral`, `amber`…) que se resuelve contra `theme[token]`. El 3D usará **el
  mismo**, no una paleta paralela, y así hereda claro/oscuro y la validación de daltonismo.
- **La regla de movimiento ya está escrita.** [lib/motion.js:6](../react-dashboard/src/lib/motion.js#L6):
  *«una animación en bucle es una alarma, y todo lo demás se anima una sola vez»*. Un
  tablero que se mira ocho horas. Esa frase es la restricción de diseño más fuerte de todo
  este plan y §4 está construido alrededor de ella.

---

## 2. Antes de nada: el vocabulario de estados no es el que dice el encargo

Los siete estados de la petición no son los que emite el servidor. Son una **mezcla de dos
vocabularios**, uno de los cuales ya se retiró:

| Estado pedido | ¿Existe hoy? | Dónde |
|---|---|---|
| Operando | **Sí** | `running`, código 1 |
| Alarma | **Sí** | `alarma`, código 4 |
| Sin comunicación | **Sí** | `commfail`, código 3 |
| Mantenimiento Correctivo | No | sólo en `lib/machines.js`, el mock heredado |
| Limpieza | No | ídem |
| Paro de Emergencia | No | ídem |
| Receso | No | ídem (equivale a `standby`) |
| — | Sí, y falta en la lista | `setup` (código 2), `standby` (código 0), `unknown` |

`lib/machines.js` es el mock anterior y su cabecera lo dice: *«las vistas de producción no
lo leen»*. `demoSource.js` ya traduce esos nombres a los cinco códigos reales, y explica por
qué: *«enseñar en la demo un estado que ICONICS nunca manda sería mostrar una pantalla que
no existe»*.

**Decisión.** No se repite ese error en 3D, pero tampoco se recorta lo pedido:

- La tabla de comportamiento se **indexa por la clave canónica del dominio**
  (`running`, `alarma`, `commfail`, `setup`, `standby`, `unknown`). Es lo que la Maqueta 3D
  pinta con datos reales.
- La tabla admite además **claves extendidas** (`correctivo`, `preventivo`, `limpieza`,
  `paro_emergencia`) que ICONICS no emite hoy. La vista «Máquina 3D» las expone en su
  selector, rotuladas como tales, para poder enseñar los siete comportamientos.
- El día que esos estados se den de alta en el servidor, se añaden a `estado.js` con su
  código y **el 3D ya los cubre** sin tocar nada más.

Consecuencia visible: en «Máquina 3D» el selector separa *«Estados del servidor»* de
*«Estados propuestos (aún no los emite ICONICS)»*. Es una línea de UI que evita que la demo
prometa algo que en planta no va a pasar.

---

## 3. Arquitectura

Un módulo de feature nuevo, con la misma forma que `features/machines/`:

```
src/features/three-d/
  index.js                       barrel: exporta las dos vistas
  lib/
    estadoVisual.js              ⭐ estado → descriptor de comportamiento (puro)
    layout.js                    posición XZ de cada una de las 10 máquinas
    useComportamiento.js         hook: aplica el descriptor fotograma a fotograma
    webgl.js                     ¿hay WebGL? (sonda, sin dependencias)
  components/
    Escena.jsx                   <Canvas> configurado (cámara, dpr, frameloop, luces)
    Luces.jsx                    luces explícitas — NO <Environment preset> (§6)
    Piso.jsx                     suelo + rejilla, con tokens del tema
    MaquinaModel.jsx             ⭐ la geometría — el punto de sustitución por GLB
    Baliza.jsx                   torreta de señalización (el canal principal, §4)
    MaquinaAnimada.jsx           MaquinaModel + descriptor de estado
    TarjetaKpi.jsx               el modal pequeño de la maqueta (drei <Html>)
    SelectorEstado.jsx           los botones de la vista Máquina 3D
    Sin3D.jsx                    respaldo cuando no hay WebGL
  views/
    Maquina3D.jsx
    Maqueta3D.jsx
```

### La pieza central: `estadoVisual.js`

Es **datos, no código**: un objeto por estado que describe *qué hace el modelo*, sin importar
React ni three. Eso lo hace revisable de un vistazo y comprobable en node, como
`plantModel.js`.

```js
// Forma del descriptor (una entrada por estado)
{
  key: "alarma",
  baliza:     { color: "coral", patron: "destello", hz: 1.4 },
  pose:       "cerrada",          // cerrada | abierta | despiece | fantasma
  movimiento: { tipo: "ninguno" },// ninguno | giro | vaiven | pasada | sacudida
  material:   { tinte: "coral", opacidad: 1, desaturar: 0 },
  halo:       true,               // mancha de luz en el suelo (sustituto sin movimiento)
}
```

Y tres funciones puras:

```js
comportamiento(estadoKey)                  // descriptor, con fallback a `unknown`
comportamientoReducido(estadoKey)          // el mismo, con todos los bucles a cero
rpmDe(machine)                             // ritmo del giro a partir de `rendimiento`
```

**Por qué un descriptor declarativo y no un componente por estado.** Con siete `if` repartidos
entre el material, la pose y el `useFrame`, añadir un estado obliga a encontrar los siete. Con
una tabla, la revisión de diseño es leer treinta líneas, y la prueba unitaria puede afirmar
cosas sobre *todos* los estados a la vez — incluida la regla de movimiento (§9).

---

## 4. Estado → comportamiento

El principio de diseño, y la razón de que la tabla sea como es:

> **A tres metros de una televisión, el estado se lee por silueta y color antes que por
> movimiento.** Un pulso sutil de emisividad es invisible en la pared; una torreta roja no.

Tres canales, en este orden de prioridad:

1. **Baliza** — la torreta de señalización sobre la máquina. Es la convención industrial que
   el operador ya conoce, y es lo único legible desde lejos. **Es el canal principal.**
2. **Pose / silueta** — carcasa abierta, módulo despiezado, modelo fantasma.
3. **Movimiento** — sólo cuando *aporta información* (el giro codifica que produce) o cuando
   es una alarma. Nunca decorativo.

El tinte del material refuerza, pero **nunca es la única señal**: la paleta ya está validada
para daltonismo, y aun así un color plano no distingue «receso» de «sin dato».

### La tabla

| Estado | Baliza | Pose / silueta | Movimiento | Material |
|---|---|---|---|---|
| **Operando** `running` | verde, fija | cerrada, pieza en la cinta | husillo girando; **rpm ∝ rendimiento** | normal |
| **Alarma** `alarma` | **coral, destello 1,4 Hz** | cerrada, husillo frenado en seco | sacudida corta **una vez** al entrar | tinte coral + halo en el suelo |
| **Sin comunicación** `commfail` | ámbar, fija | **fantasma / malla de alambre** | ninguno | 35 % de opacidad, sin sombra |
| **Set-Up** `setup` | azul, fija | panel frontal **abierto**, guías a la vista | ninguno | normal |
| **Stand By** `standby` | gris tenue | cerrada, luz interior apagada | ninguno | desaturado 60 % |
| **Sin dato** `unknown` | **apagada** | cerrada | ninguno | gris plano, 35 % de opacidad |
| *— extendidos, aún no los emite ICONICS —* | | | | |
| **Mant. Correctivo** | ámbar, fija | carcasa abierta + **módulo separado del cuerpo** | ninguno | normal |
| **Mant. Preventivo** | azul, fija | carcasa abierta, sin despiece | ninguno | normal |
| **Limpieza** | violeta, fija | cerrada, **cinta vacía** | ninguno | brillo alto, tinte violeta |
| **Paro de Emergencia** | coral, fija + **seta roja encendida** | cerrada, todo frenado | **ninguno** — la quietud total *es* el mensaje | coral saturado + halo |
| **Receso** | gris tenue | = Stand By | ninguno | desaturado 60 % |

> **Corrección aplicada en la Fase 1.** El primer borrador de esta tabla daba
> vaivén al Set-Up, respiración de baliza al fallo de comunicación y una pasada
> periódica a la Limpieza. Son **tres bucles que no informan de nada**, y
> sumados producen exactamente la pantalla contra la que avisa `lib/motion.js`:
> seis cosas parpadeando y el ojo ignorándolas todas. Se retiraron. En los tres
> casos la señal la lleva la pose —panel abierto, modelo fantasma, cinta
> vacía—, que se lee mejor y no cansa en ocho horas.
>
> Quedan **dos bucles en toda la aplicación**: el giro de `running`, que
> codifica producción, y el destello de `alarma`. `estadoVisual.test.js` lo
> afirma con una aserción exacta, así que un tercero no puede entrar sin que
> alguien lo decida.

Cuatro decisiones que conviene poder discutir:

- **`commfail` es fantasma, no rojo.** No sabemos en qué estado está la máquina: no es que
  esté mal, es que no contesta. Un modelo translúcido dice «no hay información» de una forma
  que ningún color dice. Es el mismo criterio con el que `format.js` pinta `—` y no `0`.
- **`Paro de Emergencia` no se mueve y `Alarma` sí (una vez).** Distinguirlos por color
  siendo los dos rojos no funciona. La alarma «reacciona» —sacudida y destello—; el paro de
  emergencia está congelado con la seta encendida. Silueta contra movimiento, no rojo contra rojo.
- **`Receso` y `Stand By` comparten comportamiento.** Es el mapeo honesto: son el mismo hecho
  físico. Si mañana hay que separarlos, se separan en la tabla, no en el componente.
- **El giro codifica *que* produce; el ritmo sólo si hay ritmo medido.** `rpmDe()` deriva las
  rpm de `rendimiento` en el rango 60–160. Si `rendimiento` es `null` gira a **ritmo nominal
  fijo** y la tarjeta marca «ritmo sin medir». No se inventa un número, pero tampoco se
  congela una máquina que sí está operando.

### Movimiento reducido

`usePrefersReducedMotion()` ya existe. Con el ajuste activo, `comportamientoReducido()`
pone **todos los bucles a cero** — y las alarmas necesitan un sustituto, exactamente por el
motivo que ya documenta `GaugeCard`: sin latido, la tarjeta *«necesita un fondo de alerta fijo
para seguir leyéndose como tal»*. Aquí ese sustituto es el **halo fijo en el suelo** más la
baliza a intensidad máxima constante.

---

## 5. Vista «Máquina 3D»

Ruta `maquina-3d`. Una sola máquina, grande, centrada, y los controles para recorrer los
estados. Es el banco de pruebas del contrato de §4.

- **Selector de estado** en dos grupos rotulados (§2): los seis del servidor y los cuatro
  propuestos. Al pulsar, transición suave de un descriptor al siguiente (~600 ms).
- **Interruptor «Estado real / manual»**: en real toma la máquina de `useMachineData(id)` —con
  un desplegable de las 10— y el modelo obedece al servidor; en manual manda el selector.
  Sin ese interruptor la vista sería una maqueta muerta, y con él es también una herramienta
  para verificar en planta que un equipo está reportando lo que se cree.
- **Panel lateral** con la ficha del estado activo: etiqueta, código ICONICS, y qué significa
  cada canal (baliza / pose / movimiento). Explica la vista sin manual.
- **Controles de cámara**: `OrbitControls` con ángulo polar acotado (no se pasa por debajo del
  suelo) y tres botones de encuadre — Isométrica · Superior · Frontal.

---

## 6. Vista «Maqueta 3D»

Ruta `maqueta-3d`. La planta entera, según la foto de referencia.

- **Las 10 máquinas** de `listMachines()`, en versión reducida del mismo `MaquinaModel`
  (`escala="maqueta"`), con el comportamiento de §4 aplicado a su estado **real**.
- **Distribución** en `lib/layout.js`, como datos: `{ id, x, z, rotY }` por máquina. LIN 1–7 en
  dos filas, REC 10/11/13 agrupadas, aproximando la foto. Escrito como tabla para poder
  ajustarlo sin tocar componentes, y con la nota de que las coordenadas definitivas deberían
  salir del plano de planta.
- **Conectores en el suelo**: cintas planas emisivas entre máquinas, no líneas. Evitan la
  dependencia `meshline` de drei y se ven mejor en escorzo.
- **Interacción**
  - *hover* → realce del contorno + etiqueta con el nombre del equipo.
  - *clic* → **tarjeta pequeña anclada a la máquina** con `<Html>` de drei: **OEE ·
    Disponibilidad · Rendimiento · Calidad**, más el chip de estado y, si procede, el aviso de
    «dato desactualizado» (`machine.stale`).
  - Botón **«Ver detalle»** en la tarjeta → `onNavigate("machine-detail", { machineId, from: "maqueta-3d" })`.
    Se engancha al detalle que ya existe; la maqueta no duplica ninguna vista.
- **Por qué `<Html>` y no texto 3D.** `<Text>` de drei arrastra `troika-three-text` (~120 KB
  más un *web worker*) y obliga a reimplementar la tarjeta en 3D. Con `<Html>` la tarjeta es
  DOM normal: se reutilizan `Panel`, `KpiTile` y `fmtPct` de `lib/format.js`, hereda el tema, y
  un `null` se pinta `—` con el mismo código que el resto de la aplicación.

---

## 7. Dependencias, versiones y bundle

### Versiones — verificadas contra el registro de npm

**React 18.3.1 obliga a r3f 8.x.** `@react-three/fiber@9` declara `react: ">=19"`; instalar el
mayor por defecto rompe el árbol de dependencias. Lo mismo con drei: la 10 exige r3f 9.

```
@react-three/fiber  ^8.18.0    peer: react >=18 <19  ·  three >=0.133
@react-three/drei   ^9.122.0   peer: react ^18  ·  @react-three/fiber ^8  ·  three >=0.137
three               ^0.170.0
```

`three@0.170` (nov-2024) es contemporánea de drei 9.122 y queda lejos de los cambios de
`WebGPURenderer` de las 0.18x. **Se fija, no se deja flotar.**

### Bundle · el punto que hay que vigilar

`three` no se sacude bien: son ~550–700 KB en crudo (~170 KB comprimidos), más r3f (~70 KB) y
lo que se use de drei. El trozo 3D quedará en **700–900 KB en crudo**, es decir, *del orden del
bundle de planta entero*. Tres medidas, y una comprobación:

1. **`lazy()` en las dos rutas.** El `<Suspense>` de `App.jsx` ya está puesto. Quien no abra
   3D no descarga three. Esto es lo que hace aceptable todo lo demás.
2. **Trozo propio en `manualChunks`**, antes de la regla de `vendor`:
   ```js
   if (/[\\/]node_modules[\\/](three|@react-three|three-stdlib|camera-controls|maath)/.test(id)) return "three";
   ```
   Las reglas actuales no colisionan: `@react-three` no casa con `(react|react-dom|scheduler)[\\/]`.
3. **Importaciones nombradas de drei y nada más.** Prohibido en este proyecto, por lo que
   arrastran: `<Text>`/`<Text3D>` (troika), `<Bvh>` (three-mesh-bvh), `<Video>` (hls.js),
   `useFaceLandmarker` (@mediapipe, ~2 MB).
4. **Comprobación:** `dist/` antes y después. **El chunk `index` de planta no debe crecer.**
   Si crece, es que un import estático se coló y el `lazy()` no está sirviendo de nada — el
   mismo fallo que ya documenta `routes.jsx` con las propuestas.

### ⚠️ `<Environment preset="…">` está prohibido

Descarga el HDRI desde un CDN de GitHub **en tiempo de ejecución**. En una pantalla de planta
sin salida a internet, la escena se queda sin iluminar y sin error visible. La iluminación va
en `Luces.jsx`, explícita: una `hemisphereLight`, una `directionalLight` con sombra y un
relleno. Si hace falta reflejo, `Lightformer` dentro de un entorno generado en local.

---

## 8. Registro de rutas y sidebar

En [routes.jsx](../react-dashboard/src/app/routes/routes.jsx):

```jsx
// Grupo nuevo
export const NAV_GROUPS = {
  "vistas-resonac": { … },
  "3d": { label: "3D", icon: <Box size={17} /> },
};

// Carga diferida a nivel de módulo: identidad estable entre renders
const Maquina3D = lazy(() => import("@/features/three-d/views/Maquina3D.jsx"));
const Maqueta3D = lazy(() => import("@/features/three-d/views/Maqueta3D.jsx"));
```

Las dos rutas van **detrás de `area-REC`** y delante de `assets`, con
`nav: { label: …, icon: …, group: "3d" }`. `buildNav` coloca el grupo en la posición de su
primer hijo, así que la sección «3D» aparece ahí.

### Cuál va a planta — **las dos**

`routes.jsx` fija el listón: *«si un operador debe poder abrirla en un monitor sin teclado»*.
Las dos vistas lo pasan, y las dos van en los dos builds.

| Vista | Por qué es operativa |
|---|---|
| **Maqueta 3D** | Enseña el estado **real** de los diez equipos y sirve para localizar de un vistazo cuál está en alarma. |
| **Máquina 3D** | En modo «En vivo» obedece al estado real de la máquina elegida: es la herramienta con la que se verifica que un equipo reporta lo que se cree. |

Las dos se manejan sin teclado: los encuadres son botones y la tarjeta se abre pulsando la
máquina.

> **Se corrigió dos veces, y la segunda por un motivo que conviene registrar.** La Fase 5
> promovió sólo «Maqueta 3D», dejando «Máquina 3D» detrás de la bandera de prototipos por su
> selector manual. Era una **conflación heredada**: esa vista nació junto al modo demo y se
> quedó con su bandera al partirla en el [Plan 5](PLAN-5-DOS-ORIGENES.md), no porque fuera un
> prototipo.
>
> La distinción que faltaba: las propuestas de `src/prototypes/` **compiten** contra una
> pantalla existente y de ellas hay que elegir una; las vistas 3D son funcionalidad pedida, sin
> nada a lo que sustituir.

**La reserva que queda.** El selector manual de «Máquina 3D» enseña cuatro estados que ICONICS
no emite. No se resuelve escondiendo la vista sino diciéndolo: el selector los separa en un
grupo rotulado *«Estados propuestos · aún NO los emite ICONICS»* y la ficha lateral pinta un
aviso ámbar al elegir uno. Si algún día se decide que en planta no deben verse siquiera, lo que
hay que gatear es el **selector**, no la ruta.

**Consecuencia para el bundle:** `lazy()` deja de ser una precaución y pasa a ser lo único que
impide que la pantalla de Planta descargue 827 KB de three.js en el arranque. Medido con las
dos vistas dentro: `index` 154.02 KB, `vendor` 79.73 KB, y ningún `modulepreload` del trozo
`three`. Los dos trozos de vista pesan 7.56 y 9.01 KB, y sólo se descargan al navegar.
`scripts/verificar-bundle.mjs` hay que ejecutarlo tras cada build.

### La prueba de superficie

`src/test/app/routes.test.jsx` afirma la lista exacta de rutas de planta, y por eso registró el
cambio. Quedó así:

- `ES_SOLO_PROTOTIPOS` cubre las propuestas y **nada más**: la sección 3D va entera.
- La lista de planta incluye `maquina-3d` y `maqueta-3d`, entre las áreas y Assets.
- Una prueba fija que la sección 3D esté **completa en los dos builds**, con el motivo al lado.
- Otra fija que la sección «3D» sale en la misma posición del sidebar en los dos builds, que es
  lo que depende del orden de declaración vía `buildNav`.

---

## 9. Rendimiento, robustez y pruebas

### En la pared, ocho horas

- **`frameloop="demand"`** cuando ninguna máquina tiene bucle activo — con todas en Stand By,
  la GPU baja a cero en vez de repintar 60 veces por segundo. `invalidate()` al cambiar el
  dato. Es *la* medida que decide si el equipo de planta aguanta un turno sin calentarse.
- **`dpr={[1, 1.75]}`** — en una TV 4K el `devicePixelRatio` sin techo cuadruplica los píxeles
  sombreados a cambio de nada visible a tres metros.
- **Sombras**: un solo foco con sombra, mapa 1024, `shadow-bias` ajustado. El resto, sin.
- **Geometría y materiales compartidos**: `useMemo` a nivel de módulo, no por máquina. Con 10
  máquinas basta; si la maqueta crece, la salida es `<Instances>` de drei.
- **Medir de verdad**: FPS y memoria en el equipo de planta, no en el portátil de desarrollo.
  Un tablero que va a 12 fps en la pared es peor que no tenerlo.

### Cuando no hay WebGL

Un wallboard viejo, un escritorio remoto o una GPU en lista negra dejan la pantalla en blanco.
No es hipotético en este contexto.

- `webgl.js` sonda el contexto **antes de montar `<Canvas>`**; si no hay, se pinta `Sin3D.jsx`
  con el aviso y la parrilla de `GaugeCard` que ya existe. La vista sigue siendo útil.
- Escucha de `webglcontextlost` → remontaje del canvas.
- El `<ErrorBoundary>` por ruta de `App.jsx` ya cubre el resto, y `resetKey` lo rearma al
  navegar.

### Huecos de dato

La regla del proyecto —**un hueco se pinta como hueco, nunca como cero**— tiene que sobrevivir
al 3D, y ahí es más fácil romperla porque la geometría no admite `null`:

- `rendimiento === null` → ritmo nominal + «ritmo sin medir», no una máquina parada (§4).
- `oee === null` → la tarjeta usa `fmtPct`, que ya escribe `—`.
- `estado === "unknown"` → tiene su propia fila en la tabla y **no** cae en «Stand By».

### Pruebas

Siguiendo la convención de `src/test/` (espeja `src/`, entorno `node` salvo que se pida `jsdom`):

| Archivo | Qué fija | Nº |
|---|---|---|
| `test/features/three-d/estadoVisual.test.js` | Todo estado canónico tiene descriptor; lo desconocido cae en `unknown`; **`comportamientoReducido()` deja todos los bucles a cero**; **sólo hay dos bucles en toda la aplicación** — la regla de `motion.js` convertida en aserción exacta; ningún par de estados se distingue sólo por el color; `rpmDe()` acota el rango y trata `null` sin inventar | 18 |
| `test/features/three-d/layout.test.js` | El layout cubre **exactamente** las 10 de `listMachines()`, sin duplicados, sin solapes y dentro del suelo. Es lo que avisa cuando el catálogo cambie | 8 |
| `test/features/three-d/frameloop.test.js` | Una planta entera parada **no dibuja**; una sola máquina en bucle basta para que dibuje; con movimiento reducido nunca se dibuja de continuo | 5 |
| `test/features/three-d/sinWebgl.test.jsx` | Sin WebGL no se monta el canvas, se explica el motivo y **los datos siguen en pantalla** en forma de tabla, con los huecos en «—» | 4 |
| `test/app/routes.test.jsx` | Actualizado (§8): `ES_SOLO_DEMO` cubre propuestas y vistas 3D, más una prueba nueva de que el 3D sólo existe en demo | +1 |

**No se intenta renderizar `<Canvas>` en jsdom**: no hay WebGL y la prueba sólo mediría el
mock. Lo que se prueba es la parte con criterio —la tabla, el layout, las derivaciones— y el
camino de respaldo sin WebGL, que sí es DOM.

---

## 10. Fases

| # | Fase | Entregable | Esfuerzo |
|---|---|---|---|
| **0** | Cimientos | Dependencias fijadas, `manualChunks` con el trozo `three`, `dist/` medido antes/después, `Escena.jsx` con un cubo girando | ▁ |
| **1** | El contrato | `estadoVisual.js` con las 10 filas de §4 + sus pruebas. **Sin 3D todavía**: es la conversación de diseño, y se tiene sobre una tabla, no sobre un render | ▁ |
| **2** | Máquina 3D | `MaquinaModel` procedimental, `Baliza`, `useComportamiento`, la vista con selector y modo real/manual. **Aquí se demuestra lo pedido** | ▄ |
| **3** | Maqueta 3D | `layout.js`, las 10 máquinas, hover/clic, tarjeta de KPIs, encuadres de cámara, enganche a `machine-detail` | ▄ |
| **4** | Endurecer | `frameloop="demand"`, `dpr`, movimiento reducido, respaldo sin WebGL, medición de FPS en el equipo de planta | ▁ |
| **5** | Decidir el destino | ¿«Maqueta 3D» pasa al build de planta? Requiere la medición de la Fase 4 y usabilidad sin teclado | ▁ |
| **6** | *(opcional)* Modelos reales | Sustituir la geometría por GLB. `MaquinaModel` es el único archivo que cambia | ▄–█ |

El orden no es negociable en un punto: **la Fase 1 va antes que cualquier píxel**. Si la tabla
de comportamiento se escribe *después* del modelo, acaba describiendo lo que resultó fácil de
animar en vez de lo que hay que comunicar.

---

## 11. Riesgos y decisiones abiertas

| # | Asunto | Recomendación |
|---|---|---|
| **D-1** | **¿De dónde salen los modelos?** No hay ningún `.glb` en el repo, pero la pantalla de GraphWorX de la foto **ya tiene renders 3D de las máquinas**. Si esos modelos existen en algún formato exportable, la Fase 6 se adelanta | **Preguntar antes de la Fase 2.** Mientras tanto: geometría procedimental con primitivas, que no pesa nada y aísla el cambio en `MaquinaModel.jsx`. Si llegan GLB: `useGLTF` + `<Suspense>`, servidos desde el propio backend (**nunca desde un CDN**), y presupuesto de ≤2 MB por modelo con Draco |
| **D-2** | Los cuatro estados extendidos no existen en el servidor | §2. Se demuestran rotulados como propuesta. Darlos de alta en ICONICS es trabajo de configuración, no de frontend |
| **D-3** | Peso del bundle | Mitigado por `lazy()` + trozo propio. **La comprobación de §7.4 es obligatoria**, no opcional |
| **D-4** | Un tablero 3D en bucle cansa la vista en un turno | §4 y §9: sólo lo crítico se mueve, `frameloop="demand"`, y la baliza —no la animación— es el canal principal |
| **D-5** | El equipo de planta puede no dar WebGL decente | Sonda + respaldo 2D (§9). Medir en el equipo real en la Fase 4, no al final |
| **D-6** | Distribución de la maqueta inventada | `layout.js` como datos. Pedir el plano de planta cuando haya ocasión |

---

## 12. Qué archivos se tocan

**Nuevos** — todo `src/features/three-d/` (§3) y `src/test/features/three-d/`.

**Modificados** — cuatro, y ninguno de ellos de dominio ni de datos:

| Archivo | Cambio |
|---|---|
| [`package.json`](../react-dashboard/package.json) | tres dependencias, fijadas |
| [`vite.config.js:63`](../react-dashboard/vite.config.js#L63) | trozo `three` en `manualChunks` |
| [`app/routes/routes.jsx`](../react-dashboard/src/app/routes/routes.jsx) | grupo `3d` + dos rutas con `lazy()` |
| [`test/app/routes.test.jsx`](../react-dashboard/src/test/app/routes.test.jsx) | actualizar la superficie esperada |

Que la lista sea tan corta es el resultado buscado: **el 3D es una vista más sobre los datos
que ya hay.** Si en algún momento hace falta tocar `lib/domain/`, `lib/datasource/` o
`lib/iconics/` para que la maqueta funcione, algo se ha torcido.
