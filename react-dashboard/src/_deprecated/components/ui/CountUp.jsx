/**
 * @deprecated 2026-07 · archivado en src/_deprecated/
 * Origen: src/components/ui/CountUp.jsx
 * Motivo: primitiva del kit sin ningún consumidor vivo tras archivar las páginas de la plantilla.
 * Restaurar: receta completa en src/_deprecated/README.md
 * Revisar para borrado definitivo: 2026-Q4
 */
/**
 * ui/CountUp.jsx
 * ------------------------------------------------------------------
 * Anima un número desde su valor anterior hasta el nuevo `value`
 * usando requestAnimationFrame con "ease-out cúbico". Se usa en las
 * tarjetas de métricas para que los números "cuenten" al regenerar datos
 * en vez de saltar de golpe.
 */
import { useEffect, useState } from "react";

export function CountUp({ value, suffix = "", prefix = "", color, size = 22 }) {
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    const start = display;
    const end = value;
    const duration = 500;
    const t0 = performance.now();
    let raf;

    function tick(now) {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(start + (end - start) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // Solo queremos re-disparar la animación cuando cambia el valor destino.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <span style={{ fontSize: size, fontWeight: 700, color, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {prefix}{display.toLocaleString()}{suffix}
    </span>
  );
}
