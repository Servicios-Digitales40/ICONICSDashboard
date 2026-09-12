/**
 * Los hechos de UNA máquina sobre un eje temporal (Plan 25 F3 · `NUE-02`).
 *
 * ── POR QUÉ NO TRAE UNA LIBRERÍA ───────────────────────────────────
 *
 * Porque un eje de tiempo son divs posicionados en porcentaje, y eso son unas
 * decenas de líneas. La alternativa medía peor de lo que parece: `vendor` está
 * a 265 KB y el Plan 25 §0.5 sólo admite librería nueva en trozo diferido — y
 * una librería de timeline que se carga al abrir la pantalla no es diferida en
 * ningún sentido útil, porque la pantalla es esto.
 *
 * ── LA REGLA QUE ESTE COMPONENTE NO PUEDE ROMPER ───────────────────
 *
 * **Una línea, una máquina.** `NO_COMPARTEN` (`shared/eva/comun/sistemas.js`)
 * prohíbe correlacionar señales de dos instalaciones con PLC distinto, y un eje
 * temporal es exactamente una invitación a correlacionar: dos marcas alineadas
 * en la misma vertical *se leen* como relacionadas, aunque nadie lo diga. Por
 * eso este componente recibe UN sistema y pinta sólo lo suyo; dos máquinas son
 * dos líneas separadas, cada una con su nombre.
 *
 * ── UN TRAMO VACÍO Y UN TRAMO NO CONSULTADO NO SON LO MISMO ────────
 *
 * §2.4 otra vez, y aquí es fácil de incumplir sin darse cuenta: un eje sin
 * marcas se lee como «no pasó nada». Si una de las fuentes no se pudo leer, eso
 * NO es un eje tranquilo — es un eje incompleto, y se dice encima de él.
 *
 * ── POR QUÉ LAS ALARMAS SÓLO SALEN EN EL TANQUE ────────────────────
 *
 * Porque las nueve alarmas del catálogo son del tanque (`naturaleza: "alarma"`
 * en `shared/eva/tanque/senales.js`) y vibraciones no tiene ninguna declarada.
 * Es la misma asimetría por la que el Plan 24 mandó `USO-05` al Plan 26.
 *
 * La diferencia importa: en vibraciones ese carril no está vacío porque no haya
 * saltado nada, está vacío porque **no hay alarmas que consultar**. Se dice con
 * esas palabras en vez de enseñar un carril en blanco que se leería como calma.
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { useTheme } from "@/theme";

/**
 * @param {object}  props
 * @param {string}  props.sistema    `tanque` | `vibraciones`
 * @param {Date}    props.inicio
 * @param {Date}    props.fin
 * @param {object[]} props.carriles  `[{ id, etiqueta, color, hechos, incompleto, noAplica }]`
 *                                   donde cada hecho es `{ t: Date, titulo }`.
 */
export function LineaDeTiempo({ inicio, fin, carriles }) {
  const { theme: t } = useTheme();
  const { t: traducir } = useTranslation(["maintenance", "common"]);

  const total = fin.getTime() - inicio.getTime();

  /**
   * Las marcas de hora del eje.
   *
   * Se eligen para que salgan entre 4 y 8: con una ventana de 8 h son horas
   * sueltas, con una de 30 min son tramos de 5. Un eje con cuarenta etiquetas
   * no se lee, y uno con dos no sitúa nada.
   */
  const marcas = useMemo(() => {
    const horas = total / 3_600_000;
    const paso = horas <= 1 ? 1 / 6 : horas <= 3 ? 0.5 : horas <= 8 ? 1 : horas <= 24 ? 3 : 6;
    const salida = [];

    // Se empieza en la primera frontera REDONDA dentro del rango, no en
    // `inicio`: un eje rotulado 06:13, 07:13, 08:13 es correcto y es ilegible.
    const primera = new Date(inicio);
    primera.setMinutes(0, 0, 0);
    if (paso < 1) primera.setMinutes(Math.ceil(inicio.getMinutes() / (paso * 60)) * paso * 60, 0, 0);
    else primera.setHours(Math.ceil(inicio.getHours() / paso) * paso, 0, 0, 0);

    for (let ms = primera.getTime(); ms <= fin.getTime(); ms += paso * 3_600_000) {
      if (ms < inicio.getTime()) continue;
      salida.push({ ms, pct: ((ms - inicio.getTime()) / total) * 100 });
    }
    return salida;
  }, [inicio, fin, total]);

  /** Dónde cae un instante dentro del eje, en %. Fuera de rango: `null`. */
  const posicion = (fecha) => {
    const ms = fecha instanceof Date ? fecha.getTime() : new Date(fecha).getTime();
    if (Number.isNaN(ms)) return null;
    const pct = ((ms - inicio.getTime()) / total) * 100;
    return pct < 0 || pct > 100 ? null : pct;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* La regla de horas, arriba: sin ella las marcas no sitúan nada. */}
      <div style={{ position: "relative", height: 18, minWidth: 0 }}>
        {marcas.map(({ ms, pct }) => (
          <span
            key={ms}
            style={{
              position: "absolute",
              left: `${pct}%`,
              transform: "translateX(-50%)",
              fontSize: 10,
              color: t.textFaint,
              fontVariantNumeric: "tabular-nums",
              whiteSpace: "nowrap",
            }}
          >
            {new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        ))}
      </div>

      {carriles.map((carril) => (
        <div key={carril.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: t.text }}>{carril.etiqueta}</span>

            {/*
              Los tres estados de un carril, y se pintan DISTINTO a propósito:
              «no hay nada que consultar» ≠ «no se pudo consultar» ≠ «vacío».
            */}
            {carril.noAplica ? (
              <span style={{ fontSize: 11, color: t.textFaint }}>
                {traducir("maintenance:timeline.notApplicable")}
              </span>
            ) : carril.incompleto ? (
              <span style={{ fontSize: 11, color: t.amber }}>
                {traducir("maintenance:timeline.incomplete")}
              </span>
            ) : carril.hechos.length === 0 ? (
              <span style={{ fontSize: 11, color: t.textFaint }}>
                {traducir("maintenance:timeline.emptyLane")}
              </span>
            ) : null}
          </div>

          <div
            style={{
              position: "relative",
              height: 26,
              borderRadius: 6,
              background: carril.noAplica ? "transparent" : t.hover,
              border: `1px ${carril.noAplica ? "dashed" : "solid"} ${t.border}`,
              minWidth: 0,
            }}
          >
            {!carril.noAplica &&
              carril.hechos.map((hecho, i) => {
                const pct = posicion(hecho.t);
                if (pct === null) return null;
                return (
                  <span
                    key={i}
                    title={`${new Date(hecho.t).toLocaleString()} · ${hecho.titulo}`}
                    style={{
                      position: "absolute",
                      left: `${pct}%`,
                      top: 5,
                      /*
                       * `translateX(-50%)` centra la marca en su instante. Sin
                       * esto, un hecho a las 00:00 se dibujaría entero a la
                       * derecha de su hora y a las 23:59 se saldría del eje.
                       */
                      transform: "translateX(-50%)",
                      width: 8,
                      height: 16,
                      borderRadius: 3,
                      background: carril.color,
                      /*
                       * Dos hechos simultáneos NO se tapan del todo: el borde
                       * del color del panel deja ver que hay más de uno debajo,
                       * y el `title` los distingue al pasar por encima.
                       */
                      border: `1px solid ${t.panel}`,
                      cursor: "default",
                    }}
                  />
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}
