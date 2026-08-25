/**
 * Fuente única de los colores de la aplicación.
 *
 * Cada tema expone los mismos tokens con valores distintos, así que los
 * componentes nunca escriben colores literales: siempre piden `theme.accent`,
 * `theme.textSoft`, etc. Es lo que permite cambiar toda la app de claro a
 * oscuro con un solo booleano.
 *
 * Para un tercer tema (por ejemplo alto contraste) basta añadir otro objeto
 * aquí con las mismas llaves.
 */
export const THEMES = {
  light: {
    // Fondos
    page: "#F5F6FA",
    sidebar: "#FFFFFF",
    panel: "#FFFFFF",
    hover: "#F1F3F8",
    grid: "#E3E7EE",
    border: "#E7EAF0",
    overlay: "rgba(16,20,30,0.5)",

    // Texto
    text: "#111528",
    textSoft: "#5B6472",
    textFaint: "#8A93A3",

    // Color de marca y semánticos
    accent: "#3654E0",
    accentSoft: "#EEF0FD",
    amber: "#D98A1B",
    amberSoft: "#FBF0DC",
    coral: "#D9573F",
    coralSoft: "#FCEAE6",
    success: "#1B9169",
    successSoft: "#E3F5EE",
    violet: "#7C4FE0",
    violetSoft: "#F1ECFC",

    // Sombras y degradados reutilizables
    shadow: "0 1px 2px rgba(16,24,40,0.04), 0 8px 24px rgba(16,24,40,0.06)",
    shadowHover: "0 4px 10px rgba(16,24,40,0.06), 0 16px 40px rgba(54,84,224,0.12)",
    gradAccent: "linear-gradient(135deg, #3654E0 0%, #6C86F0 100%)",
    gradWarm: "linear-gradient(135deg, #D98A1B 0%, #D9573F 100%)",
    gradSuccess: "linear-gradient(135deg, #1B9169 0%, #4FC79A 100%)",
    gradViolet: "linear-gradient(135deg, #7C4FE0 0%, #A98CF0 100%)",
    shimmer: "linear-gradient(90deg, #E7EAF0 25%, #F3F5F9 37%, #E7EAF0 63%)",

    // Manchas decorativas de fondo
    blob1: "rgba(54,84,224,0.12)",
    blob2: "rgba(217,138,27,0.10)",

    // Exclusivo del hero de Inicio (ver nota al pie del archivo, "heroAgua").
    heroAgua: "#1CAFC4",

    // Paleta de datos (ver nota al pie del archivo)
    viz: {
      azul: "#7B95F5",
      ambar: "#E2A54B",
      verde: "#35B894",
      violeta: "#A283EE",
      coral: "#F0736B",
    },
  },

  dark: {
    page: "#0B0E16",
    sidebar: "#10141F",
    panel: "#151B27",
    hover: "#1B2333",
    grid: "#1C2331",
    border: "#232B3B",
    overlay: "rgba(4,6,12,0.65)",

    text: "#E9ECF3",
    textSoft: "#9AA4B8",
    textFaint: "#5F6981",

    accent: "#5C82F5",
    accentSoft: "#1B2436",
    amber: "#E5A93C",
    amberSoft: "#2B2312",
    coral: "#E37A63",
    coralSoft: "#2C1B17",
    success: "#3ED9A5",
    successSoft: "#122A22",
    violet: "#A98CF0",
    violetSoft: "#211A34",

    shadow: "0 1px 2px rgba(0,0,0,0.2), 0 8px 24px rgba(0,0,0,0.28)",
    shadowHover: "0 4px 14px rgba(0,0,0,0.32), 0 20px 44px rgba(92,130,245,0.20)",
    gradAccent: "linear-gradient(135deg, #5C82F5 0%, #8AA3FA 100%)",
    gradWarm: "linear-gradient(135deg, #E5A93C 0%, #E37A63 100%)",
    gradSuccess: "linear-gradient(135deg, #1B9169 0%, #3ED9A5 100%)",
    gradViolet: "linear-gradient(135deg, #7C4FE0 0%, #A98CF0 100%)",
    shimmer: "linear-gradient(90deg, #1C2331 25%, #262E40 37%, #1C2331 63%)",

    blob1: "rgba(92,130,245,0.18)",
    blob2: "rgba(229,169,60,0.12)",

    // Exclusivo del hero de Inicio (ver nota al pie del archivo, "heroAgua").
    heroAgua: "#4DD8E8",

    // Paleta de datos (ver nota al pie del archivo)
    viz: {
      azul: "#8AB4FF",
      ambar: "#F2C57C",
      verde: "#6EE7B7",
      violeta: "#C4A0FC",
      coral: "#FF9B85",
    },
  },

  /**
   * Tercer tema, a pedido: los colores de marca de Mitsubishi Electric.
   *
   * ── DE DÓNDE SALEN LOS TONOS ────────────────────────────────────────
   *
   * De la hoja de estilos que sirve hoy `mitsubishielectric.com` — no de una
   * paleta de terceros ni de la memoria: `#c40001` aparece más de 50 veces en
   * su CSS de producción como el rojo de acción (enlaces, botones, estados
   * activos), con `#ff5454` como su variante clara y `#fff2f2` como el fondo
   * rojo casi blanco de estados seleccionados — el mismo papel que cumple
   * `accent-soft` aquí. El resto del sitio es blanco y gris neutro puro, sin
   * un segundo color de marca.
   *
   * ── POR QUÉ SÓLO CAMBIA EL ACENTO ───────────────────────────────────
   *
   * Este tema se construye sobre `light`, no desde cero: page, superficie,
   * texto, borde, rejilla Y LOS CUATRO SEMÁNTICOS (ámbar/coral/verde/violeta)
   * se heredan sin tocar. Es deliberado y no un atajo — DESIGN.md reserva el
   * coral para «fuera de banda, error de lectura, estado de fallo»
   * (La Regla del Color con Significado), y el rojo de Mitsubishi es,
   * literalmente, otro rojo. Ponerlo en el lugar de `accent` sin tocar
   * `coral` mantiene los dos significados separables por tono además de por
   * icono y texto (ver `paleta.js`, «el color nunca va solo»): el acento de
   * marca es un rojo saturado casi sin verde ni azul (`#c40001`, R230 sobre
   * G0 B1), y la alarma sigue siendo el coral anaranjado ya validado
   * (`#d9573f`, con G87 B63) — se separan en croma y en calidez, no sólo en
   * matiz, que es la variación que sobrevive mejor a una simulación de
   * protanopía o deuteranopía. Cambiar `coral` también habría exigido
   * revalidar contraste y separación por daltonismo desde cero (La Regla de
   * la Segunda Selección); heredarlo no.
   *
   * Por el mismo motivo, `viz` —la paleta de DATOS, no de marca— tampoco se
   * toca: son cinco colores para distinguir series en una misma gráfica, y
   * `viz.coral` ya es casi rojo. Sumarle un segundo rojo de interfaz sólo le
   * restaría separación al conjunto.
   */
  mitsubishi: {
    page: "#F5F6FA",
    sidebar: "#FFFFFF",
    panel: "#FFFFFF",
    hover: "#F1F3F8",
    grid: "#E3E7EE",
    border: "#E7EAF0",
    overlay: "rgba(16,20,30,0.5)",

    text: "#111528",
    textSoft: "#5B6472",
    textFaint: "#8A93A3",

    // El rojo de acción real de mitsubishielectric.com (ver cabecera).
    accent: "#C40001",
    accentSoft: "#FFF2F2",
    amber: "#D98A1B",
    amberSoft: "#FBF0DC",
    coral: "#D9573F",
    coralSoft: "#FCEAE6",
    success: "#1B9169",
    successSoft: "#E3F5EE",
    violet: "#7C4FE0",
    violetSoft: "#F1ECFC",

    shadow: "0 1px 2px rgba(16,24,40,0.04), 0 8px 24px rgba(16,24,40,0.06)",
    shadowHover: "0 4px 10px rgba(16,24,40,0.06), 0 16px 40px rgba(196,0,1,0.14)",
    gradAccent: "linear-gradient(135deg, #C40001 0%, #FF5454 100%)",
    gradWarm: "linear-gradient(135deg, #D98A1B 0%, #D9573F 100%)",
    gradSuccess: "linear-gradient(135deg, #1B9169 0%, #4FC79A 100%)",
    gradViolet: "linear-gradient(135deg, #7C4FE0 0%, #A98CF0 100%)",
    shimmer: "linear-gradient(90deg, #E7EAF0 25%, #F3F5F9 37%, #E7EAF0 63%)",

    blob1: "rgba(196,0,1,0.10)",
    blob2: "rgba(20,20,20,0.05)",

    // Exclusivo del hero de Inicio, SIN CAMBIOS respecto a `light` — no es
    // parte del rojo de marca de este tema, así que no hay nada que adaptar.
    heroAgua: "#1CAFC4",

    // Paleta de datos: SIN CAMBIOS respecto a `light` — ver cabecera del tema.
    viz: {
      azul: "#7B95F5",
      ambar: "#E2A54B",
      verde: "#35B894",
      violeta: "#A283EE",
      coral: "#F0736B",
    },
  },
};

/**
 * `heroAgua` — EXCEPCIÓN DELIBERADA a "todo color sale de un token
 * semántico o de `viz`", exclusiva del hero de Inicio (`InicioEva.jsx`).
 *
 * No es un semántico (no significa "estado", como `success` o `coral`) ni es
 * `viz` (no distingue series de datos): es un tinte de escena, el mismo
 * papel que ya cumplen `blob1`/`blob2` para esa sección. DESIGN.md permite
 * expresamente una "paleta ampliada... sólo en esta sección Persuade, sin
 * tocar los tokens semánticos del resto" (Plan Moises3 UI/UX, punto 3,
 * propuesta 8) — de ahí que viva junto a los blobs y no junto a los
 * semánticos de arriba.
 *
 * Vale UN valor por tema (no claro/oscuro derivados por fórmula, misma Regla
 * de la Segunda Selección que rige el resto): cian-verde de agua, elegido
 * contra cada fondo. El tema Mitsubishi lo hereda sin cambios de `light`
 * porque no es parte de su rojo de marca — no hay nada que adaptar.
 */

/**
 * Paleta de datos, distinta de los tokens de UI de arriba.
 *
 * Los tokens `accent`, `amber`, `coral`… están afinados para interfaz (botones,
 * bordes, texto) y son sobrios porque conviven con mucho texto. Como relleno de
 * una gráfica se ven apagados, y usar un token de texto como color de dato deja
 * el diagrama muerto.
 *
 * Por eso `viz` es un juego aparte, en tonos pastel, para marcas grandes de
 * color plano (cintas, barras, áreas). Cada modo tiene sus propios valores: el
 * oscuro no es el claro aclarado, sino una selección hecha contra su fondo.
 *
 * Ambos juegos están validados para daltonismo (protanopía, deuteranopía,
 * tritanopía) y contraste contra su superficie. Al cambiar un valor conviene
 * revalidar; la separación entre ámbar y verde es la más frágil.
 *
 * En modo oscuro estos tonos quedan por encima de la banda de luminosidad
 * recomendada para marcas de datos, que es lo que significa «pastel». Se acepta
 * a cambio del acabado visual, respetando separación y contraste.
 */
/**
 * @deprecated sin consumidores vivos. Su único consumidor era el Dashboard
 * antiguo, hoy en `_deprecated/pages/`. Se marca aquí en vez de moverlo porque
 * extraerlo obligaría a editar este archivo, que sí está vivo.
 */
export const chartPalette = (theme) => [
  theme.viz.azul,
  theme.viz.ambar,
  theme.viz.verde,
  theme.viz.violeta,
  theme.viz.coral,
];
