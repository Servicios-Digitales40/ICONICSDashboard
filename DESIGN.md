---
name: Demo EVA
description: Tablero de una instalación de agua industrial que lee sus señales de ICONICS en 2D y en 3D.
colors:
  page: "#F5F6FA"
  surface: "#FFFFFF"
  surface-hover: "#F1F3F8"
  border: "#E7EAF0"
  grid: "#E3E7EE"
  text: "#111528"
  text-soft: "#5B6472"
  text-faint: "#8A93A3"
  accent: "#3654E0"
  accent-soft: "#EEF0FD"
  accent-gradient-end: "#6C86F0"
  amber: "#D98A1B"
  amber-soft: "#FBF0DC"
  coral: "#D9573F"
  coral-soft: "#FCEAE6"
  success: "#1B9169"
  success-soft: "#E3F5EE"
  violet: "#7C4FE0"
  violet-soft: "#F1ECFC"
  viz-azul: "#7B95F5"
  viz-ambar: "#E2A54B"
  viz-verde: "#35B894"
  viz-violeta: "#A283EE"
  viz-coral: "#F0736B"
  dark-page: "#0B0E16"
  dark-sidebar: "#10141F"
  dark-surface: "#151B27"
  dark-surface-hover: "#1B2333"
  dark-border: "#232B3B"
  dark-text: "#E9ECF3"
  dark-text-soft: "#9AA4B8"
  dark-text-faint: "#5F6981"
  dark-accent: "#5C82F5"
  dark-accent-soft: "#1B2436"
  dark-accent-gradient-end: "#8AA3FA"
  dark-amber: "#E5A93C"
  dark-coral: "#E37A63"
  dark-success: "#3ED9A5"
  dark-violet: "#A98CF0"
  dark-viz-azul: "#8AB4FF"
  dark-viz-ambar: "#F2C57C"
  dark-viz-verde: "#6EE7B7"
  dark-viz-violeta: "#C4A0FC"
  dark-viz-coral: "#FF9B85"
  mitsubishi-accent: "#C40001"
  mitsubishi-accent-soft: "#FFF2F2"
  mitsubishi-accent-gradient-end: "#FF5454"
typography:
  display:
    fontFamily: "Plus Jakarta Sans, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.3
  headline:
    fontFamily: "Plus Jakarta Sans, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Inter, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  caption:
    fontFamily: "Inter, sans-serif"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "IBM Plex Mono, monospace"
    fontSize: "11px"
    fontWeight: 400
rounded:
  xs: "3px"
  sm: "4px"
  md: "9px"
  lg: "16px"
spacing:
  xs: "7px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "24px"
  section: "30px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "#FFFFFF"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "9px 16px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "9px 16px"
  button-ghost:
    backgroundColor: "{colors.surface-hover}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "9px 16px"
  button-icon:
    backgroundColor: "{colors.surface-hover}"
    textColor: "{colors.text-soft}"
    rounded: "{rounded.md}"
    padding: "9px"
  input-field:
    backgroundColor: "{colors.surface-hover}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "9px 12px"
  panel-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "20px 22px 24px"
---

# Design System: Demo EVA

## Overview

**Creative North Star: "El Gemelo Digital"**

La instalación de agua existe dos veces: como geometría en las vistas 3D y como
número en las tablas y las series. El sistema visual entero está construido
sobre la idea de que ambas son **la misma verdad vista de dos formas**, nunca
dos aplicaciones cosidas. Un valor que sube en la gráfica es el mismo que llena
el tanque de la maqueta, y el diseño debe hacer evidente ese parentesco: los
mismos colores semánticos gobiernan el 3D y el 2D, y una lectura fuera de banda
se ve coral en los dos sitios.

La personalidad es instrumental y contenida. El fondo es un gris-azulado casi
blanco (`page`) sobre el que flotan superficies blancas de esquina generosa; el
color aparece poco y siempre significa algo. La densidad es media-alta —cuerpo
de 13px, padding de 9/16— porque el escenario real es un portátil o un monitor
de escritorio a distancia de lectura, no una pantalla de pared. El modo oscuro
no es el claro invertido: es una segunda selección hecha contra su propio fondo,
con la marca de color aclarada para sobrevivir sobre `#0B0E16`.

El movimiento es de entrada y de respuesta, nunca decorativo: los paneles suben
al aparecer en cascada corta y se levantan 2px cuando el cursor los toca. Todo
ello se apaga bajo `prefers-reduced-motion`.

**Key Characteristics:**

- Superficie blanca sobre fondo gris-azulado; la jerarquía nace del tono, no del peso.
- Un solo azul de marca, casi siempre en gradiente de 135°, reservado a lo accionable.
- Tres tipografías con trabajos disjuntos: geométrica para títulos, neogrotesca para texto, monoespaciada para identificadores de máquina.
- Esquinas de dos tamaños: 16px para contenedores, 9px para controles.
- Dos paletas separadas por función: la de interfaz y la de datos (`viz`).

## Colors

Una marca azul sobria sobre neutros gris-azulados, con cuatro semánticos que
solo aparecen cuando el dato lo justifica.

### Primary

- **Azul Señal** (`#3654E0`): la única marca de la aplicación. Botón primario, ítem de navegación activo, foco de campo, barra del `SectionLabel`. Casi nunca aparece plano: viaja en `gradAccent`, un gradiente de 135° hacia `#6C86F0`.
- **Azul Señal Tenue** (`#EEF0FD`): fondo de estados seleccionados y halo de foco. Es el azul rebajado a superficie, no un segundo acento.

### Secondary

- **Verde Instrumento** (`#1B9169`): el sistema opera dentro de banda. Semántico, nunca decorativo.
- **Ámbar Atención** (`#D98A1B`): medida al borde de su umbral, o dato de calidad dudosa.
- **Coral Alarma** (`#D9573F`): fuera de banda, error de lectura, estado de fallo. Es el color más cargado del sistema y el que menos superficie debe ocupar.

### Tertiary

- **Violeta Contexto** (`#7C4FE0`): categorías y agrupaciones que no son un estado — el quinto color cuando los cuatro anteriores ya significan otra cosa.

### Neutral

- **Papel Frío** (`#F5F6FA`): el lienzo de la página. Nunca blanco puro, para que las superficies blancas se recorten sobre él.
- **Superficie** (`#FFFFFF`): paneles, sidebar y topbar. Todo lo que contiene información vive aquí.
- **Hover Neutro** (`#F1F3F8`): fondo de fila al pasar el cursor, y fondo en reposo de campos y botones fantasma.
- **Borde** (`#E7EAF0`) y **Rejilla** (`#E3E7EE`): el borde separa superficies; la rejilla estructura las gráficas y es un punto más clara para no competir con los datos.
- **Tinta** (`#111528`), **Tinta Suave** (`#5B6472`), **Tinta Tenue** (`#8A93A3`): los tres únicos niveles de texto. El tercero es para metadatos y unidades, nunca para contenido que haya que leer.

### Tercer tema: Mitsubishi Electric

Un tercer tema seleccionable (`themes.js` → `mitsubishi`), a pedido del
cliente, con el rojo de acción real de `mitsubishielectric.com`
(`#C40001`, confirmado en su hoja de estilos de producción, no en una fuente
de terceros). Se construye SOBRE `light` y sólo reemplaza el eje de marca:

- **Rojo Mitsubishi** (`#C40001`) sustituye a Azul Señal como `accent` — botón
  primario, ítem activo, foco de campo, `SectionLabel`. Mismo `gradAccent` a
  135°, ahora hacia `#FF5454`, la variante clara ya presente en su propio CSS.
- **Rojo Mitsubishi Tenue** (`#FFF2F2`) sustituye a Azul Señal Tenue —también
  tomado tal cual de su fondo de estado seleccionado.
- Todo lo demás —papel, superficie, texto, borde, rejilla y los cuatro
  semánticos (verde/ámbar/coral/violeta)— se hereda de `light` sin tocar.

### Named Rules

**La Regla de las Dos Paletas.** Los tokens de interfaz (`accent`, `amber`, `coral`…) nunca se usan como color de dato, y los de `viz` nunca se usan como color de interfaz. Los primeros están afinados para convivir con texto y salen apagados como relleno; los segundos son pastel y no tienen contraste para servir de texto o borde. Un token `viz` en un botón es un error de sistema, no una preferencia.

**La Regla del Color con Significado.** Verde, ámbar y coral solo aparecen cuando una señal está en ese estado. Un panel no es verde porque quede bien. El azul es la única excepción: marca lo accionable, no lo saludable.

**La Regla de la Segunda Selección.** El modo oscuro no se deriva del claro aclarando u oscureciendo valores. Cada token oscuro se eligió contra `#0B0E16`. Añadir un color al tema claro obliga a elegir su pareja oscura a mano, en `themes.js`, y a revalidar contraste y separación por daltonismo — la más frágil es ámbar contra verde.

**La Regla del Rojo que No Es Alarma.** El tema Mitsubishi pone un rojo (`accent`) al lado de otro rojo (`coral`, la alarma) y los dos tienen que seguir leyéndose distintos sin ayuda de memoria: se separan en croma y en calidez además de en matiz —`#C40001` casi sin verde ni azul contra el `#D9573F` anaranjado y más claro de `coral`—, la variación que mejor sobrevive a protanopía y deuteranopía. Por eso `coral` NO cambia con este tema: moverlo habría exigido revalidar esa separación desde cero, y dejarlo quieto la conserva gratis.

## Typography

**Display Font:** Plus Jakarta Sans (fallback `sans-serif`)
**Body Font:** Inter (fallback `sans-serif`)
**Label/Mono Font:** IBM Plex Mono (fallback `monospace`)

**Character:** La geométrica humanista de los títulos aporta el poco carácter de
marca que el tablero se permite; Inter desaparece y deja leer; la monoespaciada
marca lo que es identidad de máquina —tags, códigos, marcas de tiempo— y hace
visible de un vistazo qué texto viene del servidor y no de un humano.

### Hierarchy

- **Display** (Plus Jakarta Sans, 700, 16px): encabezado de sección (`SectionLabel`), siempre precedido de la barrita de 5×16px con el gradiente de marca.
- **Headline** (Plus Jakarta Sans, 600, 14px): título de panel. Es el techo tipográfico dentro de una tarjeta.
- **Body** (Inter, 400, 13px): el texto de la aplicación, y el tamaño de los controles. Los botones lo usan a 600.
- **Caption** (Inter, 400, 12.5px): subtítulos bajo un `SectionLabel` y texto auxiliar, en Tinta Tenue.
- **Label** (IBM Plex Mono, 400, 11px): código de panel, nombre de tag, identificadores. En Tinta Tenue.

### Named Rules

**La Regla de la Máquina en Monoespaciada.** Todo lo que un humano no escribió —nombre de tag, código de asset, marca de tiempo, valor crudo de calidad— va en IBM Plex Mono. Es lo que permite leer una pantalla de Assets sin confundir un rótulo con un identificador.

**La Regla del Techo de 16px.** Ningún texto de la aplicación pasa de 16px. La jerarquía se construye con peso, familia y color, no con tamaño: el escenario es un monitor a distancia de lectura y el espacio vertical se gasta en datos.

## Layout

Armazón fijo de sidebar más topbar, con el contenido en tarjetas sobre el fondo
`page`. Dentro de una vista, la unidad es el `Panel`: rejillas de
`repeat(auto-fit, minmax(...))` que se recolocan solas, con `gap` de 12–16px.

El ritmo vertical se apoya en una escala corta y repetida: 7px entre icono y
texto, 12px de separación interna, 16px entre bloques, 20–24px de padding de
tarjeta y 30px por encima de un encabezado de sección.

Tres puntos de ruptura, todos declarados donde importan y no en un archivo de
breakpoints: **1280px** (la vista de Planta reordena su rejilla), **900px** (el
layout espejo del comparativo se apila y su canal de deltas pasa a fila
horizontal) y **720px** (Planta pasa a una sola columna). El objetivo es
1440–1920px; por debajo el tablero se apila sin romperse, pero no está
optimizado para móvil.

### Named Rules

**La Regla del Media Query Adyacente.** Un breakpoint vive junto al layout que gobierna —en el `<style>` de la vista o en el bloque de `index.css` que le corresponde— con un comentario que explique por qué ese ancho y no otro. No hay una tabla global de breakpoints, y no debe crearse.

## Elevation & Depth

Sistema de capas suaves: el fondo `page` es el nivel cero, las superficies
blancas se levantan sobre él con una sombra ambiental doble muy contenida, y la
interacción añade elevación real. La profundidad es **ambiental en reposo y
responsiva al puntero**: la tarjeta ya flota, y al tocarla flota más.

### Shadow Vocabulary

- **Ambiental** (`box-shadow: 0 1px 2px rgba(16,24,40,0.04), 0 8px 24px rgba(16,24,40,0.06)`): reposo de todo `Panel`. Dos capas: un contacto de 1px y una difusa amplia.
- **Elevada** (`box-shadow: 0 4px 10px rgba(16,24,40,0.06), 0 16px 40px rgba(54,84,224,0.12)`): hover de tarjeta. La capa amplia se tiñe del azul de marca, así la elevación tiene color propio y no es solo negro más denso.
- **Halo de botón** (`box-shadow: 0 4px 14px {accent}4D`): bajo los botones primario y de peligro, con la opacidad en hex (`4D` ≈ 30%).
- **Anillo de foco** (`box-shadow: 0 0 0 3px {accent-soft}`): campos con foco, junto al cambio de color de borde.

### Named Rules

**La Regla de la Sombra Teñida.** La sombra de hover se pasa a la tarjeta como custom property inline (`--shadow-hover`) desde el componente, no desde CSS global, para que cada tarjeta pueda llevar el tinte que le corresponda. El CSS solo declara la transición y el `translateY`.

**La Regla del Levantamiento Corto.** El hover eleva 2px (tarjeta), 3px (métrica) o 1px (botón). Nunca más: es acuse de recibo, no animación.

## Shapes

Dos radios y muy poca geometría. Los contenedores llevan **16px** —esquina
generosa que es lo que da al tablero su aire de instrumento moderno— y todo
control interactivo lleva **9px**: botones, campos, chips y botones de icono. La
barrita del `SectionLabel` (5×16px, radio 3px) y el pulgar de la scrollbar (6px,
radio 4px) son las dos únicas excepciones, ambas piezas de tamaño mínimo.

El borde de 1px en Borde es el separador por defecto y aparece en toda
superficie que contiene otra: panel, campo, botón secundario, cabecera de panel.
No hay líneas dobles, ni esquinas cortadas, ni bordes de más de 1px.

### Named Rules

**La Regla de los Dos Radios.** 16px contiene, 9px se pulsa. Un radio nuevo necesita justificarse contra esos dos; un valor intermedio (10px, 12px) rompe la lectura del sistema sin aportar nada.

## Components

### Buttons

- **Shape:** esquina de control (9px), altura definida por el padding, nunca fija.
- **Primary:** gradiente de marca a 135° sobre texto blanco, padding `9px 16px`, peso 600 a 13px, con halo de sombra teñido de `accent`. Es el único elemento del tablero con gradiente y sombra a la vez.
- **Hover / Focus:** `translateY(-1px)` al pasar, vuelta a `0` al pulsar. La transición vive en la clase `.app-btn`.
- **Secondary:** transparente con borde de 1px y texto Tinta. **Ghost:** fondo Hover Neutro sin borde. **Danger / Success:** el semántico al 9% de opacidad (`{color}18`) como fondo, con el propio semántico como texto — nunca relleno sólido salvo `danger-solid`, reservado a confirmar una acción destructiva.
- **Icon:** cuadrado de padding 9px, mismo radio, icono de 14–17px en Tinta Suave.
- **Loading:** el icono se sustituye por un spinner de 14px y el botón baja a 0.75 de opacidad; el ancho no debe saltar.

### Cards / Containers

- **Corner Style:** 16px.
- **Background:** Superficie sobre `page`; en oscuro, `#151B27` sobre `#0B0E16`.
- **Shadow Strategy:** Ambiental en reposo, Elevada en hover (ver Elevation).
- **Border:** 1px en Borde, siempre.
- **Internal Padding:** `20px 22px 24px`. Con `noPad`, el padding pasa a la cabecera (`18px 20px 12px`) y al cuerpo (`0 20px 20px`) para que una tabla llegue al borde.
- **Header:** título Headline y, opcionalmente, un `code` en monoespaciada de 11px bajo él, separados del cuerpo por un borde de 1px y 12px de aire.
- **Entrada:** `fadeInUp 0.5s ease both` con retraso escalonado de hasta 0.4s. Una vista que necesite orden estricto pasa `delay` explícito en lugar de confiar en el contador automático.

### Inputs / Fields

- **Style:** fondo Hover Neutro, borde de 1px, radio 9px, padding `9px 12px` (32px a la izquierda cuando lleva icono), texto de 13px.
- **Focus:** anillo de 3px en `accent-soft` más borde en `accent`. Vive en la clase `.field` porque una pseudo-clase no puede leer el estado de React.
- **Error / Success:** el borde pasa a Coral o Verde y aparece un icono de 14px a la derecha; el mensaje de error va debajo, 11.5px en Coral.

### Navigation

- Sidebar sobre Superficie con ítems de 13px. El activo se marca con fondo `accent-soft` y texto `accent`; el hover no activo usa `--color-hover` desde CSS.
- Los grupos (`NAV_GROUPS`) se pliegan bajo una cabecera con icono; el grupo aparece en la posición de su primer hijo.
- Iconos de lucide-react a 17px, alineados por su caja, no por su trazo.

### SectionLabel

Encabezado de sección: barrita de 5×16px con el gradiente de marca y radio 3px,
8px de aire, y el título Display. El subtítulo opcional cuelga 13px a la derecha
para alinearse con el texto, no con la barra. Es la marca de agua del sistema:
separa dos bloques dentro de una vista sin recurrir a una línea horizontal.

## Do's and Don'ts

### Do:

- **Do** pedir el color a `useTheme()` (`t.accent`, `t.viz.azul`). Un hexadecimal literal en un componente es la forma en que este sistema se rompe.
- **Do** usar 16px de radio para lo que contiene y 9px para lo que se pulsa.
- **Do** poner en IBM Plex Mono todo identificador que venga del servidor.
- **Do** declarar el `@media` junto al layout que gobierna, con el porqué del ancho.
- **Do** dejar sin unidad los valores cuyo tag no la declara: cuatro de las ocho señales no tienen unidad y el diseño debe verse bien sin sufijo.
- **Do** revalidar contraste y daltonismo al tocar la paleta `viz`, empezando por la separación ámbar/verde.
- **Do** apagar toda animación bajo `prefers-reduced-motion`, incluidos los `animation-delay`.

### Don't:

- **Don't** usar un color de `viz` en un botón, un borde o un texto, ni un token de interfaz como relleno de gráfica.
- **Don't** pintar de verde, ámbar o coral nada que no esté en ese estado.
- **Don't** derivar el tema oscuro del claro por fórmula; cada valor se elige contra su fondo.
- **Don't** pasar de 16px en ningún texto ni introducir un cuarto nivel de tinta.
- **Don't** añadir un radio intermedio (10px, 12px) ni un borde de más de 1px.
- **Don't** elevar más de 3px en hover, ni poner sombra a un elemento que no sea tarjeta, botón primario o campo con foco.
- **Don't** ofrecer una escritura sin condicionarla a `readOnly` de `/api/health`. Esto dejó de decir «el backend es de solo lectura» con `controlar_bomba` (el asistente) y el *ack* de alarmas (Plan 13, Fase 9): la escritura ya existe, pero sigue la misma norma de fondo — va siempre detrás de la confirmación del servidor y se anuncia antes de ejecutarse, porque un botón que puede fallar es peor que su ausencia.
