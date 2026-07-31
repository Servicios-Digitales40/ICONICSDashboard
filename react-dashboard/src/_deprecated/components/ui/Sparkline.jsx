/**
 * @deprecated 2026-07 · archivado en src/_deprecated/
 * Origen: src/components/ui/Sparkline.jsx
 * Motivo: primitiva del kit sin ningún consumidor vivo tras archivar las páginas de la plantilla.
 * Restaurar: receta completa en src/_deprecated/README.md
 * Revisar para borrado definitivo: 2026-Q4
 */
/** ui/Sparkline.jsx — mini gráfica de línea sin ejes, para el fondo de las tarjetas de métricas. */
import { LineChart, Line, ResponsiveContainer } from "recharts";

export function Sparkline({ data, color }) {
  return (
    <ResponsiveContainer width="100%" height={40}>
      <LineChart data={data}>
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
