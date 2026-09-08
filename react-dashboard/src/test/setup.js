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

/*
 * ── i18n EN LAS PRUEBAS ────────────────────────────────────────────
 *
 * La instancia se inicializa aquí, una vez para toda la suite, por el mismo
 * motivo por el que en la aplicación se importa en `main.jsx`: los recursos
 * tienen que estar puestos antes de que se monte el primer componente. Sin
 * esto, `useTranslation` no encuentra instancia y `t("…")` devuelve la CLAVE,
 * así que toda aserción sobre texto fallaría con un mensaje que no explica por
 * qué.
 *
 * Se importa el módulo real —no un doble— a propósito: las traducciones
 * forman parte de lo que la pantalla enseña, y probar contra un `t` de mentira
 * que devuelve la clave dejaría de comprobar precisamente lo que se acaba de
 * migrar. Con el módulo real, las 583 pruebas que afirman texto en español
 * siguen siendo la red que demuestra que la migración no cambió lo que se ve.
 *
 * ── EL IDIOMA SE FIJA AQUÍ, Y NO SE HEREDA DEL ENTORNO ─────────────
 *
 * `navigator.language` vale `en-US` en jsdom, así que el detector elegía
 * INGLÉS y las pruebas empezaron a leer «Trends · Vibration» donde esperaban
 * «Gráficas · Vibraciones». No era un fallo de la aplicación —detectar el
 * idioma del navegador es lo que se le pide— sino de la suite: un entorno de
 * pruebas que depende del `locale` de la máquina donde corre da resultados
 * distintos en el portátil de cada uno y en CI.
 *
 * Se fija en español porque es el idioma por defecto del producto y el que
 * afirman las 583 pruebas que ya existían: con él, esas pruebas siguen siendo
 * la red que demuestra que la migración no cambió lo que ve el operador.
 *
 * Una prueba que necesite inglés lo cambia ella misma con
 * `i18n.changeLanguage("en")` y lo devuelve al terminar — ver
 * `src/test/i18n/idioma.test.jsx`, que hace exactamente eso.
 */
import i18n from "@/i18n";

i18n.changeLanguage("es");
