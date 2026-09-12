/**
 * El latido del modo muro (Plan 24 F9 · `USO-10`).
 *
 * ── EL FALLO QUE ESTO EXISTE PARA EVITAR, Y YA PASÓ UNA VEZ ────────
 *
 * Un wallboard congelado con cifras plausibles en pantalla es indistinguible de
 * uno que funciona. El modo muro quita el cromo a propósito —sidebar, topbar, la
 * pastilla de «última lectura»— así que en la pared no queda nada que diga «esto
 * sigue vivo»: el tablero puede llevar cuarenta minutos mostrando el mismo 62 %
 * y desde tres metros se ve igual de bien.
 *
 * Es exactamente la forma del incidente del 07-09-2026, en el que el panel de
 * salud daba el asistente y el dictado por «Funcionando» **sin haber preguntado
 * a ninguno de los dos**. De ahí sale la regla de este archivo: el latido tiene
 * que venir de haber preguntado.
 *
 * ── POR QUÉ NO ES UN RELOJ ─────────────────────────────────────────
 *
 * Porque un reloj sigue corriendo con el sondeo caído, y entonces certifica lo
 * contrario de lo que parece: da la sensación de que todo va bien mientras los
 * datos llevan media hora parados. Lo que late aquí es la ÚLTIMA LECTURA REAL —
 * `receivedAt`, que F0 dejó disponible y viaja en cada señal.
 *
 * ── LAS TRES RESTRICCIONES, Y LA SEGUNDA ES LA IMPORTANTE ──────────
 *
 * 1. **No es una animación que no pare.** `lib/motion.js` declara que la única
 *    animación en bucle permitida en este sistema es la de una señal en alarma,
 *    y esto no es una alarma. Además, algo parpadeando toda la noche en una
 *    pantalla de planta se convierte en ruido que nadie ve — que es como el
 *    latido dejaría de cumplir su función justo cuando importa. Se anima **un
 *    pulso por lectura nueva**, igual que `UltimaLectura` ya hace con el suyo, y
 *    se respeta `prefers-reduced-motion`.
 *
 * 2. **Degrada al estado PEOR, nunca al mejor.** Sin `receivedAt` el latido no
 *    late y lo dice; con la lectura congelada, se pone en el color de aviso y
 *    enseña su edad. Un latido optimista por defecto sería el bug del
 *    07-09-2026 reimplementado.
 *
 * 3. **Cabe en el cromo retirado.** Una pastilla pequeña en una esquina, no una
 *    barra: el modo muro quita el cromo para que la pared enseñe datos, y el
 *    latido no puede traerlo de vuelta por la puerta de atrás.
 */
import { useTranslation } from "react-i18next";

import { useTheme } from "@/theme";
import { usePrefersReducedMotion } from "@/lib/motion.js";
import { fmtAntiguedad } from "@/lib/format.js";
import { useAhora } from "@/Demo-EVA/lib/useAhora.js";
import { FRESCURA, frescuraDe } from "@/Demo-EVA/data/comunes/estadoDelDato.js";
import { useSistemaAgua } from "@/Demo-EVA/data/comunes/hooks.js";

/**
 * La pastilla en sí, ya con su dato. Separada del que lo pide para que se pueda
 * probar sin montar el motor de sondeo.
 *
 * @param {object} p
 * @param {Date|null} p.receivedAt  Cuándo llegó la última lectura del sondeo.
 *   Es el MISMO dato que alimenta la frescura de las tarjetas: un solo hecho,
 *   una sola fuente (`estadoDelDato.js`).
 */
export function LatidoMuro({ receivedAt }) {
  /* `traducir` y no `t`: aquí `t` es el TEMA. Ver la cabecera de `@/i18n`. */
  const { t: traducir } = useTranslation("common");
  const { theme: t } = useTheme();
  const reduce = usePrefersReducedMotion();

  /* El reloj propio: la edad cambia SIN que llegue ninguna lectura nueva, que
     es justo el caso que importa. Ver la cabecera de `useAhora.js`. */
  const ahora = useAhora();

  const frescura = frescuraDe({ receivedAt, ahora });
  const congelado = frescura === FRESCURA.CONGELADO;
  const sinDato = frescura === FRESCURA.SIN_DATO;

  /*
   * El color degrada al peor estado, nunca al mejor (restricción 2). `sinDato`
   * y `congelado` son distintos a propósito: uno es «nunca llegó nada» y el
   * otro «llegó y dejó de llegar», y en una pared son dos averías distintas.
   */
  const color = sinDato || congelado ? t.coral : t.success;

  const texto = sinDato
    ? traducir("time.noReading")
    : congelado
      ? fmtAntiguedad(receivedAt, ahora.getTime())
      : traducir("time.live");

  return (
    <div
      /* `aria-live` para que un lector de pantalla anuncie que los datos se
         pararon: es la única señal de la pantalla en modo muro. */
      aria-live="polite"
      style={{
        position: "fixed", bottom: 12, right: 14, zIndex: 50,
        display: "inline-flex", alignItems: "center", gap: 8,
        padding: "6px 12px", borderRadius: 999,
        background: t.panel, border: `1px solid ${color}44`,
        fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 700,
        color: sinDato || congelado ? t.coral : t.textSoft,
        /* `zoom` del modo muro lo escala como todo lo demás, así que a 1.6 esta
           pastilla se lee desde tres metros sin fijar aquí un tamaño aparte. */
      }}
    >
      {/*
        * Un pulso por lectura nueva, no un bucle (restricción 1). Se reusa
        * `.pulso-lectura`, que ya existe para esto exacto en `UltimaLectura`, y
        * con su mismo mecanismo: la `key` cambia con cada `receivedAt`, React
        * remonta el `<span>` y la animación arranca desde cero. Es más fiable
        * que un `setTimeout` con estado —que fue el primer intento— porque no
        * hay temporizador que limpiar ni carrera posible entre dos lecturas
        * seguidas.
        *
        * Con `prefers-reduced-motion` la `key` se queda fija, así que no hay
        * remontaje y no hay animación: el punto sigue ahí, con su color, que es
        * lo que de verdad informa.
        */}
      <span
        key={reduce ? "quieto" : (receivedAt?.getTime() ?? "sin-dato")}
        className={reduce ? undefined : "pulso-lectura"}
        style={{
          width: 9, height: 9, borderRadius: "50%", background: color, flexShrink: 0,
        }}
      />
      {texto}
    </div>
  );
}

export default LatidoMuro;

/**
 * El latido conectado al sondeo, que es lo que monta `App.jsx`.
 *
 * Pide el dato él mismo en vez de recibirlo como prop para que `App.jsx` no
 * tenga que saber de `Demo-EVA`: el `Shell` compone el layout y no debería
 * enterarse de qué hook sirve las señales de qué máquina. Es el mismo criterio
 * por el que `EstadoMaquinaBanner` lee su propio estado.
 *
 * `useSistemaAgua` no abre un motor nuevo: lee del `EvaProvider` que ya envuelve
 * el Shell entero (ver su cabecera), así que esto no añade ni una petición.
 */
export function LatidoMuroConectado() {
  const { lastUpdated } = useSistemaAgua();
  return <LatidoMuro receivedAt={lastUpdated ?? null} />;
}
