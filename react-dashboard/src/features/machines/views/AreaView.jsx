/**
 * features/machines/views/AreaView.jsx
 * ------------------------------------------------------------------
 * Monitor de un área: la parrilla de tarjetas de sus máquinas.
 *
 * ── POR QUÉ UN SOLO COMPONENTE Y NO Area1 / Area2 ──────────────────
 *
 * Antes eran dos archivos idénticos salvo por una constante. Ahora que
 * las áreas salen del catálogo de ICONICS (`LIN` y `REC`), duplicar el
 * archivo obligaría a tocar dos sitios cada vez que cambie la parrilla,
 * y a crear un tercero el día que aparezca un área nueva.
 *
 * ── EL CAMBIO IMPORTANTE: YA NO ES SÍNCRONO ────────────────────────
 *
 * La versión anterior hacía
 *
 *     const EQUIPOS = getMachinesByArea("area1");
 *
 * a NIVEL DE MÓDULO, es decir, se evaluaba al importar el archivo. Eso
 * era exactamente lo que impedía que los datos vinieran de la red: un
 * `import` no puede esperar a una petición. Con el hook, la vista se
 * suscribe al montar y se da de baja al desmontar, que es lo que
 * permite al motor de polling contar referencias y pedir solo lo que
 * hay en pantalla.
 */
import { AlertBanner, SectionLabel } from "@/components/ui/index.js";
import { AREAS } from "@/lib/iconics/tagCatalog.js";
import { useAreaData } from "@/lib/datasource";
import GaugeCard from "../components/GaugeCard.jsx";

/* maxWidth acota la grilla a 4 tarjetas (4×300 + 3×20 de gap) para que se
   acomoden 4 arriba y las restantes queden centradas abajo. */
const grid = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "center",
  gap: 20,
  maxWidth: 1360,
  margin: "0 auto",
};

export default function AreaView({ areaId, onNavigate }) {
  const { machines, loading, error } = useAreaData(areaId);
  const label = AREAS[areaId]?.label ?? areaId;

  return (
    <>
      <SectionLabel sub={`${machines.length} equipos · pulsa una tarjeta para ver el detalle`}>
        {label} · Monitor general
      </SectionLabel>

      {error && (
        <AlertBanner
          type="error"
          title="No se pudieron leer los equipos"
          message={error}
        />
      )}

      {/* Mientras no haya llegado nada se avisa en vez de enseñar una
          parrilla vacía, que parecería un área sin máquinas. */}
      {loading && !machines.length && (
        <p style={{ textAlign: "center", fontSize: 13, opacity: 0.7 }}>Leyendo equipos…</p>
      )}

      <div style={grid}>
        {machines.map((m) => (
          <GaugeCard
            key={m.id}
            {...m}
            onClick={() => onNavigate("machine-detail", { machineId: m.id, from: `area-${areaId}` })}
          />
        ))}
      </div>
    </>
  );
}
