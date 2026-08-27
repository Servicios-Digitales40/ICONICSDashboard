/**
 * test/setup.js
 * ------------------------------------------------------------------
 * Rellenos de entorno para las pruebas que RENDERIZAN componentes.
 *
 * jsdom no implementa `ResizeObserver`, y Recharts lo usa en
 * `<ResponsiveContainer>` para medir su hueco. Sin este relleno, toda
 * vista con una gráfica falla por un motivo que no tiene nada que ver
 * con lo que se está probando.
 *
 * Es un doble deliberadamente tonto: nunca dispara la llamada de vuelta,
 * así que los contenedores miden 0×0 y las gráficas se montan vacías.
 * Da igual — estas pruebas comprueban que la vista no revienta y que no
 * inventa ceros, no el tamaño de un SVG. Medir de verdad exigiría un
 * navegador real, que es otra clase de prueba.
 */

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// `matchMedia` lo consulta `usePrefersReducedMotion`. En pruebas se
// responde que SÍ hay preferencia de movimiento reducido, a propósito:
// con ella, `useCountUp` salta directo a su valor final en vez de animar
// desde 0 — y en jsdom `requestAnimationFrame` no avanza, así que una
// cifra animada se quedaría en 0 para siempre y las aserciones sobre el
// número final fallarían por un motivo que no es el que se prueba.
if (typeof globalThis.matchMedia === "undefined") {
  globalThis.matchMedia = (query) => ({
    matches: query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  });
}
