/**
 * prototypes/area-views/AreaVariantView.jsx
 * ------------------------------------------------------------------
 * Andamiaje común de las vistas de prueba por variante de tarjeta.
 *
 * Son vistas de PROTOTIPO: replican Área 1 y Área 2 con cada una de las
 * propuestas de `prototypes/machine-cards/` para poder compararlas con datos
 * reales y en su contexto de uso, no en una galería. Cuando se elija una, se
 * promueve al kit definitivo y esta carpeta desaparece entera (ver
 * prototypes/README.md).
 *
 * Todo lo que cambia entre las 10 vistas es (área × variante), así que la
 * página concreta se reduce a dos props y la lógica vive aquí. El qué-es
 * cada variante (componente, ancho, nombre) sale del registro hermano
 * `../machine-cards/variants.js`.
 *
 * Dirección de la dependencia: este archivo EMPUJA la variante ya resuelta
 * hacia `machine-detail` vía params. Producción nunca consulta el registro,
 * y por eso esta carpeta se puede borrar sin tocarla.
 */
import { useState } from "react";
import { AlertBanner, SectionLabel } from "@/components/ui/index.js";
import { tieneDatos } from "@/lib/domain/index.js";
import { useAreaData } from "@/lib/datasource";
import { AREAS } from "@/lib/iconics/tagCatalog.js";
import { getVariant } from "../machine-cards/variants.js";

/** Las rutas de estas vistas siguen llamándose "area1"/"area2"; el dato no. */
const AREA_REAL = { area1: "LIN", area2: "REC" };

/**
 * `Machine` del dominio → las props que esperan las tarjetas en evaluación.
 *
 * Las tarjetas son PROPUESTAS DE DISEÑO desechables y todas declaran
 * `disponibilidad = 0, calidad = 0…` como valores por defecto. Convertir
 * `null` en `undefined` hace que esos defaults se activen en vez de
 * reventar un `.toFixed()`.
 *
 * ⚠ Limitación asumida: una métrica suelta con mala calidad se pinta aquí
 * como 0, no como hueco — reescribir cinco tarjetas descartables para
 * distinguirlo no paga. Las máquinas SIN NINGUNA lectura sí se filtran
 * (ver abajo), que es el caso del servidor caído.
 */
const aPropsDeTarjeta = (m) => ({
  id: m.id,
  equipo: m.equipo,
  estado: m.estado, // clave canónica; cardShared ya la entiende
  noParte: m.machineId,
  aprobadas: m.aprobadas ?? undefined,
  rechazadas: m.rechazadas ?? undefined,
  disponibilidad: m.disponibilidad ?? undefined,
  calidad: m.calidad ?? undefined,
  rendimiento: m.rendimiento ?? undefined,
  tiempoMuerto: m.tMuerto ?? undefined,
});

/**
 * Envoltorio clickeable.
 *
 * Las tarjetas "Pro" NO aceptan `onClick`: no reenvían props sobrantes a su
 * elemento raíz. En vez de modificar cinco componentes que están destinados
 * a descartarse, la navegación se resuelve aquí con un contenedor accesible
 * (teclado incluido). Si una propuesta gana, ahí sí se le añade `onClick`
 * nativo como tiene GaugeCard.
 */
function CardLink({ label, wide, onClick, children }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      style={{
        display: "flex",
        // Las variantes anchas (Aurora Hero, Neon HUD) son fluidas hasta 620px;
        // las compactas miden 320 fijos y no deben estirarse.
        ...(wide ? { flex: "1 1 520px", maxWidth: 620 } : {}),
        cursor: "pointer",
        borderRadius: 22,
        transform: hover ? "translateY(-4px)" : "translateY(0)",
        transition: "transform 180ms ease",
        outline: "none",
      }}
    >
      {children}
    </div>
  );
}

/**
 * Vista de un área con una variante de tarjeta.
 *  - areaId : "area1" | "area2"
 *  - variant: clave del registro ("editorial", "aurora", "aurora-v"…)
 */
export function AreaVariantView({ areaId, variant, onNavigate }) {
  // LA MISMA FUENTE que producción: ICONICS, simulador o demo según el
  // modo activo. Antes leía el mock heredado, y con el servidor caído
  // estas vistas enseñaban cifras plausibles mientras el resto de la app
  // mostraba huecos.
  const realArea = AREA_REAL[areaId] ?? areaId;
  const { machines, loading, error } = useAreaData(realArea);
  const { label, Comp, wide } = getVariant(variant);

  // Sin ninguna lectura la tarjeta entera sería una mentira de ceros: esas
  // máquinas se apartan y se cuentan aparte, en vez de pintarse.
  const conLectura = machines.filter(tieneDatos);
  const sinLectura = machines.length - conLectura.length;
  const equipos = conLectura.map(aPropsDeTarjeta);

  // El id de esta misma página, para que "Volver" desde el detalle regrese
  // AQUÍ y no al Área genérica. Coincide con los ids de navConfig.
  const pageId = `${areaId}-${variant}`;

  return (
    <>
      <SectionLabel sub={`Propuesta en evaluación · ${label}. Al abrir una tarjeta, el detalle usa esta misma variante.`}>
        {AREAS[realArea]?.label ?? areaId} · {label}
      </SectionLabel>

      {error && <AlertBanner type="error" title="No se pudieron leer los equipos" message={error} />}
      {loading && !machines.length && (
        <p style={{ textAlign: "center", fontSize: 13, opacity: 0.7 }}>Leyendo equipos…</p>
      )}
      {sinLectura > 0 && (
        <p style={{ textAlign: "center", fontSize: 12, opacity: 0.65, margin: "0 0 14px" }}>
          {sinLectura} equipo{sinLectura > 1 ? "s" : ""} sin lecturas — no se muestra{sinLectura > 1 ? "n" : ""} para no inventar ceros.
        </p>
      )}

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: 20,
          // Anchas: 2 por fila (2×620 + gap). Compactas: 4 por fila (4×320 + 3 gaps).
          maxWidth: wide ? 1260 : 1360,
          margin: "0 auto",
        }}
      >
        {equipos.map((e) => (
          <CardLink
            key={e.id}
            wide={wide}
            label={`Ver detalle de ${e.equipo}`}
            // Se EMPUJA la variante ya resuelta (no su clave): así el detalle
            // no necesita consultar el registro de prototipos y esta carpeta
            // se puede borrar entera sin tocar producción.
            onClick={() =>
              onNavigate("machine-detail", {
                machineId: e.id,
                from: pageId,
                cardVariant: { label, Comp, wide },
              })
            }
          >
            <Comp {...e} />
          </CardLink>
        ))}
      </div>
    </>
  );
}
