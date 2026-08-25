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

**Estado:** confirmado por el usuario, pendiente de implementar.

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

**Estado:** confirmado por el usuario, pendiente de implementar.

---

### 3. Landing / "Inicio" — rediseño de alto impacto visual (rol Persuade)

**Dónde:**
- [`react-dashboard/src/Demo-EVA/views/InicioEva.jsx`](../react-dashboard/src/Demo-EVA/views/InicioEva.jsx) — vista completa del hero y del grid de 4 tarjetas.
- [`DESIGN.md`](../DESIGN.md) — sistema de diseño vigente. Esta vista es la única marcada como rol **Persuade**; el resto del tablero es Operate (ver cabecera de `InicioEva.jsx` líneas 1-32, contrato THESIS/OWN-WORLD/STORY/FORM ya fijado con seed `4bb7eb55`).
- Capa 3D reutilizable ya construida: `three-d/components/ArmarioModel.jsx`, `BombaModel.jsx`, `ColumnaModel.jsx`, `ValvulaModel.jsx`, `ActivoEnMaqueta.jsx` (prop `detalle` controla nivel de detalle/costo de render).

**Contexto:** el usuario pide que esta página "venda" el producto con gran impacto visual — hero banner, imágenes, animaciones — sin escatimar. Hoy el hero es texto + cifra + dos blobs de gradiente, sin ninguna geometría ni imagen. El North Star del propio sistema ("El Gemelo Digital": el 3D y los números son la misma verdad) no se manifiesta visualmente en la primera pantalla, pese a que toda la maquinaria 3D para hacerlo ya existe y funciona en otras vistas.

**Las 10 propuestas generadas (todas aprobadas por el usuario para explorar en implementación):**

1. **Hero con la Maqueta 3D real de fondo, en vivo** — montar el `<Canvas>` de la Maqueta 3D como fondo del hero con auto-rotación lenta y datos reales (tanque llenándose, bomba girando), en vez del gradiente/blobs actuales.
2. **Cifra "8/8" con micro-narrativa de dato entrando** — pulso sutil sincronizado a `lastUpdated` + mini-sparkline detrás del número.
3. **Grid de 4 tarjetas con mini-preview en vivo** — reemplazar el icono de cada `TarjetaVista` por una miniatura real (snapshot/render) de esa vista, animada al hover.
4. **Scroll-triggered reveal** — secciones se revelan progresivamente al hacer scroll (parallax sutil, stagger real) en vez de solo `fadeInUp` al montar.
5. **Línea de flujo animada (tubería) como elemento gráfico de fondo** — trazo SVG tanque→bomba→válvula con partículas que fluyen solo cuando `caudal > 0` (dato real).
6. **Badge "En vivo" con pulso tipo heartbeat** — junto a "Última lectura: justo ahora", animado solo con lectura fresca del servidor.
7. **Sección "Cómo funciona" con diagrama del pipeline** — ICONICS → servidor → app, con animación de paquete de dato viajando entre nodos.
8. **Gradiente "profundidad de agua" exclusivo del hero** — paleta ampliada (azul de marca → cian/verde-agua) solo en esta sección Persuade, sin tocar los tokens semánticos del resto del sistema (Operate).
9. **CTA dual** — "Entrar a Planta" (operativo) + "Ver la Maqueta en vivo" (espectáculo/ghost), dos caminos según el tipo de visitante.
10. **Layout split en desktop grande (>1280px)** — escena 3D del punto 1 ocupando el lateral derecho del hero, texto a la izquierda; colapsa a apilado en móvil.

**Recomendación dada (no descartada, a considerar al priorizar implementación):** los puntos 1, 3 y 6 son los de mayor impacto por menor costo — reutilizan geometría y datos ya construidos en vez de requerir imágenes/ilustraciones nuevas, y son los más alineados al North Star "Gemelo Digital" sin inventar contenido falso.

**Estado:** las 10 propuestas confirmadas por el usuario para el plan. Pendiente definir alcance/orden de implementación (¿todas, o priorizadas?) y pasar por `impeccable` (modo new-work / Persuade) antes de tocar código, dado que implica decisiones de dirección visual (paleta ampliada, layout, posible nuevo DESIGN.md o extensión del actual para esta sección).

---

### 4. Nueva gráfica: "Recorrido del sistema" (Sankey, d3-sankey) dentro de Planta

**Librería:** [d3-sankey](https://github.com/d3/d3-sankey) — a integrar como nueva dependencia.

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

**A definir en implementación:**
- Confirmar que `d3-sankey` (cálculo de layout) se combine con SVG propio para el dibujo, siguiendo el mismo criterio que ya usa `MargenesConsumidos` ("HTML y no recharts a propósito: control total") — evaluar si conviene el mismo enfoque de control manual o si aquí sí conviene apoyarse en el layout que da la librería.
- Tooltip o ficha lateral al pasar/pulsar un nodo o tramo, reutilizando el patrón ya usado en la maqueta 3D (`FichaActivo`/`EtiquetaActivo`) para no inventar un tercer patrón de "detalle al interactuar".
- Redacción del título/subtítulo de la tarjeta, dejando claro que es topología y no una medición de flujo físico (mismo espíritu que el `code` explicativo de `MargenesConsumidos`: "0 % es el centro de la banda cómoda...").

**Estado:** confirmado por el usuario — topología del proceso, grosor fijo por nº de señales, color dinámico por estado, ubicación en Planta. Pendiente de implementar.

---

## Notas de contexto

- Título de la tarjeta / subtítulo (`code`) puede necesitar ajuste de
  redacción una vez se excluyan las señales en reposo, para que quede claro
  que la lista solo muestra señales activas evaluables. Revisar al implementar.
