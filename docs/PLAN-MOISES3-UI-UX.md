> **Documento histórico.** Describe el alcance y las decisiones de su fecha, incluidas rutas y archivos posteriormente retirados. Para instalación, capacidades y estructura actuales consulta [el índice documental](README.md).

# Plan de mejoras UI/UX — rama Moises3

Plan de trabajo temporal para la segunda entrega de la demo. Se va llenando
durante la exploración del usuario; los cambios se aplican todos juntos al
terminar la ronda de exploración, no punto por punto.

Cómo se usa: el usuario explora la UI, y cuando algo debe corregirse dice
"agrégalo al plan". Cada punto abajo lleva el archivo/línea donde vive el
problema para no tener que re-investigar al momento de implementar.

**Cerrado con 4 puntos** al pasar a explorar Alarmas por separado — ver
[`PLAN-MOISES3-ALARMAS.md`](./PLAN-MOISES3-ALARMAS.md). Reabrir este
documento si surge un nuevo punto de UI/UX general fuera de alarmas.

**Estado general (2026-08-25):** los 4 puntos están implementados y
verificados en el navegador, incluidas las 10 propuestas del punto 3 (Hero
de Inicio) — ver el detalle dentro de cada punto para las desviaciones
deliberadas confirmadas con el usuario durante la implementación.

---

## Pendientes

### 1. "Margen consumido por señal" — señales en reposo no deben entrar al cálculo

**Dónde:** [`react-dashboard/src/Demo-EVA/lib/modelo.js`](../react-dashboard/src/Demo-EVA/lib/modelo.js) función `margenes()` (línea 76-87).

**Problema:** El margen se calcula con la fórmula pura de
[`shared/eva/umbrales.js`](../shared/eva/umbrales.js) `margenConsumido()`
(línea 113-141) sobre el valor crudo de la señal, sin mirar si esa señal está
en estado `"reposo"`. Cuando la bomba está parada, eficiencia energética = 0
es normal, pero la fórmula la marca con 220% de margen consumido —el peor
valor de toda la lista— porque mide la distancia al límite duro sin saber que
el sistema está apagado.

El estado (`s.estado === "reposo"`) sí sabe tratar esto especial (ver aviso en
[`tiles.jsx:666-670`](../react-dashboard/src/Demo-EVA/components/tiles.jsx#L666-L670):
*"caudal y eficiencia no se evalúan contra su banda: se marcan «en reposo»"*),
pero el cálculo de `margen` en
[`shared/eva/sistema.js:79`](../shared/eva/sistema.js#L79) no aplica esa
misma excepción.

**Decisión tomada:** Excluir de la lista las señales en estado `"reposo"`,
igual que ya se excluyen las de estado `"sin_dato"`.

```js
// modelo.js — margenes()
.filter((s) => s.tipo !== "booleano" && s.margen !== null && s.estado !== "sin_dato" && s.estado !== "reposo")
```

**Estado:** ✅ implementado. `modelo.js` filtra `estado !== "reposo"`, y el
subtítulo (`code`) de `MargenesConsumidos` en `tiles.jsx` ahora dice
"señales en reposo no entran". Verificado en el navegador: con el sistema
parado, la tarjeta pasó de mostrar Eficiencia al 220% a no mostrarla.

---

### 2. Maqueta 3D — quitar la apertura de la puerta del armario, mostrar el modo VDF como banner flotante

**Dónde:**
- [`react-dashboard/src/Demo-EVA/three-d/components/ArmarioModel.jsx`](../react-dashboard/src/Demo-EVA/three-d/components/ArmarioModel.jsx) — animación de la puerta (`abierto`, `APERTURA`, `useFrame` líneas 51-57, prop `abierto` en toda la puerta).
- [`react-dashboard/src/Demo-EVA/three-d/components/ActivoEnMaqueta.jsx`](../react-dashboard/src/Demo-EVA/three-d/components/ActivoEnMaqueta.jsx) línea 83-86 — quien decide `abierto={senal("modoVdf").texto === "Manual"}` y pasa la señal al modelo del armario.
- [`react-dashboard/src/Demo-EVA/three-d/components/FichaActivo.jsx`](../react-dashboard/src/Demo-EVA/three-d/components/FichaActivo.jsx) línea 159-183 — `EtiquetaActivo`, el patrón de pastilla `<Html>` anclada en el mundo 3D que ya existe y se reutilizará para el nuevo banner.

**Problema:** La puerta del armario eléctrico se abre/cierra para indicar el modo del VDF (`Modo AM VDF`: Automático/Manual). Al abrirse, la puerta tapa visualmente la bomba contigua, obligando a rotar la cámara para comprobar que está girando/funcionando. El giro de la bomba en sí ya comunica bien su estado — el problema es que la puerta abierta bloquea la vista, no que falte una señal de "encendido".

**Decisión tomada:** 
- La puerta del armario deja de animarse con el modo VDF — queda fija (cerrada), como una pieza estática del modelo.
- El modo Manual/Automático se representa con un banner tipo pastilla flotando sobre el armario en la escena 3D, mismo patrón que `EtiquetaActivo` (`<Html>` de drei, anclado en el mundo, siempre visible sin depender del ángulo de cámara ni de seleccionar el activo).

**A definir en implementación:**
- Si el banner es permanente (siempre visible) o solo aparece al señalar/pasar el cursor por el armario — probablemente permanente solo cuando el modo es "Manual" (que es la excepción/aviso), y ausente en "Automático" (que es lo normal), siguiendo el mismo principio que ya usa el resto de la maqueta de no mostrar ruido en el caso normal. Confirmar con el usuario al implementar.
- Color/estilo del banner: revisar paleta existente (`paleta.js`, tono `accent` o similar) para que "Manual" se lea como aviso sin ser alarma.

**Estado:** ✅ implementado. La puerta quedó fija/cerrada (se retiró la
animación, `useFrame` y la prop `abierto`; las tarjetas del variador de
dentro también se quitaron porque nunca vuelven a verse). El banner es
permanente mientras el modo es "Manual" y ausente en "Automático", en tono
`amber` (aviso, no alarma) — mismo patrón `<Html>` que `EtiquetaActivo`.
Verificado forzando el reloj del simulador hasta el ciclo con modo Manual.

---

### 3. Landing / "Inicio" — rediseño de alto impacto visual (rol Persuade)

**Dónde:**
- [`react-dashboard/src/Demo-EVA/views/InicioEva.jsx`](../react-dashboard/src/Demo-EVA/views/InicioEva.jsx) — vista completa del hero y del grid de 4 tarjetas.
- [`DESIGN.md`](../DESIGN.md) — sistema de diseño vigente. Esta vista es la única marcada como rol **Persuade**; el resto del tablero es Operate (ver cabecera de `InicioEva.jsx` líneas 1-32, contrato THESIS/OWN-WORLD/STORY/FORM ya fijado con seed `4bb7eb55`).
- Capa 3D reutilizable ya construida: `three-d/components/ArmarioModel.jsx`, `BombaModel.jsx`, `ColumnaModel.jsx`, `ValvulaModel.jsx`, `ActivoEnMaqueta.jsx` (prop `detalle` controla nivel de detalle/costo de render).

**Contexto:** el usuario pide que esta página "venda" el producto con gran impacto visual — hero banner, imágenes, animaciones — sin escatimar. Hoy el hero es texto + cifra + dos blobs de gradiente, sin ninguna geometría ni imagen. El North Star del propio sistema ("El Gemelo Digital": el 3D y los números son la misma verdad) no se manifiesta visualmente en la primera pantalla, pese a que toda la maquinaria 3D para hacerlo ya existe y funciona en otras vistas.

**Las 10 propuestas generadas (todas aprobadas por el usuario para explorar en implementación):**

1. ✅ **Hero con la Maqueta 3D real de fondo, en vivo** — `three-d/components/MaquetaHero.jsx`: mismo ensamblaje que `MaquetaEva3D` (bastidor, depósito, tuberías, los 4 activos con estado real), sin `OrbitControls` interactivo, auto-rotación propia vía `useFrame`, `detalle={false}` por costo de render, degradación a `null` sin WebGL. Ancla al tercio derecho del hero con `mask-image` para no competir con el texto (ver nota de composición abajo).
2. ✅ **Cifra "8/8" con micro-narrativa de dato entrando** — sparkline de fondo detrás de la cifra (`CifraEnVivo`, reutiliza el componente `Spark` ya existente y la serie de sesión `series.nivelTanque` que ya trae `useSistemaAgua()`). **Nota honesta:** el sparkline es del NIVEL DEL TANQUE, no de "8/8" — ese conteo no tiene serie propia que valga la pena dibujar. Rotulado con `title` en el SVG para no fingir que es la serie de la cifra.
3. 🔁 **Grid de 4 tarjetas con mini-preview en vivo** — **reinterpretado**: no son 4 escenas 3D/`<Canvas>` adicionales (riesgo de estabilidad, confirmado con el usuario — 5 WebGL simultáneos en la landing), sino un mini-tablero de datos en vivo por tarjeta (`vista.dato(sistema)` en `InicioEva.jsx`): 1 señal real por vista con punto de color de estado, reutilizando `estadoColor`/`fmtSenal` ya existentes.
4. ✅ **Scroll-triggered reveal** — nuevo hook `useEnVista()` en `lib/motion.js` (`IntersectionObserver`, dispara una sola vez y deja de observar). Aplicado sólo a la sección `ComoFunciona` (punto 7): es la única sección que de verdad vive fuera del primer viewport — el hero y la rejilla de 4 tarjetas ya tenían su `fadeInUp` al montar, que cumple el mismo papel al estar ya en pantalla.
5. ✅ **Línea de flujo animada (tubería) como elemento gráfico de fondo** — `TrazoFlujo` en `InicioEva.jsx`, SVG tanque→bomba→válvula. **Reinterpretado en el mecanismo, no en el resultado:** sin partículas en bucle continuo — eso habría violado la regla de `lib/motion.js` de que la única animación en bucle del sistema es una señal en alarma. El trazo se dibuja una sola vez al montar (mismo `.trazo-dibujo` que ya usa `Spark`) y lo que cambia con `caudal > 0` (en realidad `!sistema.enReposo`, mismo criterio que `Tuberias.jsx`) es el color/brillo del trazo ya dibujado.
6. ✅ **Badge "En vivo" con pulso tipo heartbeat** — `UltimaLectura` (`components/base.jsx`) extendido con una prop `grande`: mismo mecanismo de pulso de una sola vez por lectura fresca que ya existía (`key={fecha.getTime()}` + animación CSS sin `infinite`), en tamaño de pastilla/badge. Sin bucle continuo, por la misma razón que el punto 5.
7. ✅ **Sección "Cómo funciona" con diagrama del pipeline** — `ComoFunciona` en `InicioEva.jsx`, 3 nodos reales (ICONICS/AssetWorX+Hyper Historian → servidor de la demo → este tablero, tal como los documenta `PRODUCT.md`, nada inventado). El "paquete viajando" es, otra vez, un disparo de una sola vez por cada `lastUpdated` nuevo (mismo mecanismo `key={...}` que `UltimaLectura`), no un bucle.
8. ✅ **Gradiente "profundidad de agua" exclusivo del hero** — token nuevo `heroAgua` en `theme/themes.js` (3 variantes: claro `#1CAFC4`, oscuro `#4DD8E8`, Mitsubishi heredado de claro sin cambios), documentado como excepción deliberada a la Regla de las Dos Paletas — no es semántico ni `viz`, es tinte de escena exclusivo de esta sección Persuade, mismo papel que ya cumplían `blob1`/`blob2`. Usado en la parada intermedia del gradiente del hero. **De paso corrigió un bug real:** la ronda anterior usaba `t.accentGradientEnd`, un token que nunca existió en `themes.js` — el navegador lo descartaba en silencio (`"undefined22"` en el string del gradiente) sin que ningún build fallara.
9. ✅ **CTA dual** — "Entrar a Planta" (primario) + "Ver la Maqueta en vivo" (ghost, con icono `Factory`), dos preguntas distintas para dos visitantes distintos.
10. ✅ **Layout split en desktop grande** — cubierto por el ajuste que ya forzó el punto 1: desde 900px (no exactamente 1280px como decía la propuesta original, pero mismo principio) el texto del hero se alinea a la izquierda y la maqueta 3D ocupa el tercio derecho; por debajo de 900px, apilado con la maqueta retirada.

**Nota de composición (no estaba en el plan original):** la primera versión centraba la maqueta 3D detrás de todo el bloque de texto y resultó ilegible (la cifra y la frase competían visualmente con la geometría). Se resolvió ligando el punto 1 y el 10: maqueta acotada al tercio derecho + texto alineado a la izquierda en desktop, en vez de superposición centrada. Ver el bloque `RONDA 2` en la cabecera de `InicioEva.jsx` para el detalle completo.

**Recomendación dada (no descartada, a considerar al priorizar implementación):** los puntos 1, 3 y 6 son los de mayor impacto por menor costo — reutilizan geometría y datos ya construidos en vez de requerir imágenes/ilustraciones nuevas, y son los más alineados al North Star "Gemelo Digital" sin inventar contenido falso.

**Estado:** ✅ las 10 propuestas implementadas (en 2 rondas: 1/3/6 primero, luego 2/4/5/7/8/9/10) y verificadas en navegador (build limpio, 375 tests, `impeccable detect` sin hallazgos, capturas en claro/oscuro/Mitsubishi y desktop/tablet/móvil). Se pasó por `impeccable` en modo "extend an existing surface" (no new-work completo: el mundo visual de DESIGN.md ya estaba fijado, así que no aplicó torneo de conceptos) — reference: `.claude/skills/impeccable/reference/new-work.md` sección 3. Tres desviaciones deliberadas de la propuesta original, todas confirmadas con el usuario antes de implementar: (a) el mini-preview del punto 3 es un mini-tablero de datos, no 4 escenas 3D; (b) los "flujos"/"paquetes" de los puntos 5 y 7 son disparos de una sola vez, no bucles continuos, por la regla de movimiento de `lib/motion.js`; (c) el token de paleta ampliada del punto 8 se sumó en la segunda ronda, no en la primera.

---

### 4. Nueva gráfica: "Recorrido del sistema" (Sankey) dentro de Planta

**Librería:** ~~[d3-sankey](https://github.com/d3/d3-sankey)~~ — **no se integró.** Con el
usuario decidido: topología fija de 4 nodos y 3 tramos, sin variación en el
layout entre lecturas, así que un motor de layout no resolvía nada que 4
coordenadas escritas a mano no resolvieran ya. Se implementó en SVG puro,
mismo criterio que ya usa `MargenesConsumidos` ("HTML/SVG y no una librería
de gráficos, a propósito"). Cero dependencias nuevas en `package.json`.

**Dónde vive:**
- Nueva tarjeta en [`react-dashboard/src/Demo-EVA/views/PlantaEva.jsx`](../react-dashboard/src/Demo-EVA/views/PlantaEva.jsx), como banda `eva-full` (ancho completo, ver `REJILLA` líneas 56-75) después de la fila `eva-margenes` / `eva-estado`. Necesita ancho completo para que el diagrama se lea bien.
- Componente nuevo en [`react-dashboard/src/Demo-EVA/components/tiles.jsx`](../react-dashboard/src/Demo-EVA/components/tiles.jsx), junto a `MargenesConsumidos` y `EstadoSenales`, siguiendo el mismo patrón de props (`t`, `dark`, `delay`).

**Por qué NO es un Sankey de magnitud física:** las 8 señales del catálogo ([`shared/eva/senales.js`](../shared/eva/senales.js)) tienen unidades incompatibles entre sí (%, °C, V, y dos sin unidad declarada — caudal y presión). No hay ninguna cantidad que "fluya" y se conserve entre ellas; forzar esa lectura inventaría una conversión que el servidor no respalda, rompiendo la misma norma que ya rige el resto del dominio (declarar lo supuesto, nunca inventar autoridad — ver cabecera de `senales.js`).

**Decisión tomada:** el Sankey representa la **topología del proceso**, no un flujo físico continuo. Nodos = los 4 activos ya definidos en [`shared/eva/activos.js`](../shared/eva/activos.js), en el orden del recorrido real del agua y la energía:

```
Tanque ──→ Bombeo ──→ Distribución
Eléctrico ──────────→ Bombeo   (alimenta al motor)
```

- **Grosor de cada tramo:** fijo, proporcional al número de señales de cada activo (Tanque=2, Bombeo=2, Distribución=2, Eléctrico=2 — ver `senalesDe()` en `activos.js`). No cambia con cada lectura; es un mapa estructural, no una serie en vivo.
- **Color de cada tramo:** dinámico, ligado al peor estado (`nominal`/`atencion`/`critico`/`reposo`) de las señales de ese activo — mismo criterio de color-con-significado que ya rige el resto del tablero (`estadoColor`, `paleta.js`). Así el Sankey funciona como mapa fijo con semáforo de salud superpuesto, igual que ya hace `RejillaActivos`.
- Se descartó ligar el grosor al "margen consumido" del activo porque hereda el mismo problema ya identificado en el punto 1 de este plan: una señal en reposo (p. ej. eficiencia en 0%) infla su margen a 220% y engrosaría de forma engañosa el tramo Eléctrico→Bombeo. Si el punto 1 se implementa primero (excluir `reposo` del cálculo de margen), esta opción podría reconsiderarse más adelante, pero por ahora se prioriza la opción fija y honesta.

**Cómo quedó resuelto lo que estaba "a definir en implementación":**
- ~~d3-sankey vs. SVG propio~~ → SVG propio, confirmado con el usuario (ver "Librería" arriba).
- Tooltip al pasar el cursor → `HoverTip` (patrón 2D ya usado en la vista de Planta), no `FichaActivo`/`EtiquetaActivo`: esas dos son específicas del canvas 3D (`<Html>` de drei anclado en el mundo), y este Sankey es SVG 2D dentro de una tarjeta, no una escena 3D. Se extendió `HoverTip` con una prop `style` opcional para que pudiera servir de zona de captura del tamaño exacto de cada nodo/tramo — arreglo genérico, no algo local a este componente.
- Redacción del subtítulo → `code="Topología del proceso, no una medición de flujo físico"` en la tarjeta.

**Estado:** ✅ implementado y verificado en el navegador (claro/oscuro), como
`RecorridoSistema` en `components/tiles.jsx`, integrado en `PlantaEva.jsx`
en banda `eva-full` después de Estado/Márgenes. Grosor fijo por nº de
señales, color dinámico por peor estado del activo, tooltip funcional en
nodos y tramos.

---

## Notas de contexto

- ✅ Resuelto: el subtítulo (`code`) de `MargenesConsumidos` ya dice
  "señales en reposo no entran" desde que se excluyeron del cálculo (punto 1).
