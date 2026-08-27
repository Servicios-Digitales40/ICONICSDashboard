/**
 * Tarjeta que muestra en vivo el valor de un punto de ICONICS, leído a través
 * del backend puente. Hace polling automático y permite refrescar a mano.
 *
 * Vive en el feature y no en el kit compartido porque es específico del
 * dominio ICONICS y hace su propio fetching: no es una primitiva
 * presentacional.
 */
import { RefreshCw, Radio } from "lucide-react";
import { useTheme } from "@/theme";
import { useIconicsPoint } from "@/lib/iconics";
import { Panel, Button, AlertBanner } from "@/components/ui/index.js";

// ICONICS puede devolver el resultado como objeto único o como arreglo de
// ReadResult; se normaliza a un solo objeto con los campos que se muestran.
function normalize(payload) {
  const item = Array.isArray(payload) ? payload[0] : payload;
  if (!item || typeof item !== "object") return null;
  return {
    value: item.value ?? item.Value,
    quality: item.quality ?? item.Quality,
    timestamp: item.timestamp ?? item.Timestamp,
    pointName: item.pointName ?? item.PointName,
  };
}

// La REST API de FrameWorX devuelve quality como StatusCode de OPC UA
// (0 = Good). Se acepta también la convención clásica de OPC DA (192 = Good)
// y variantes en texto, por si el punto viene de otro tipo de servidor.
const QUALITY_GOOD = new Set([0, 192, "Good", "good"]);

export function IconicsLiveCard({ pointName, intervalMs = 5000 }) {
  const { theme: t } = useTheme();
  const { point, error, loading, lastUpdated, refresh } = useIconicsPoint(pointName, intervalMs);
  const data = normalize(point);
  const isGood = data && (data.quality === undefined || QUALITY_GOOD.has(data.quality));

  return (
    <Panel
      title="Lectura ICONICS en vivo"
      code={pointName}
      right={
        <Button variant="icon" onClick={refresh} loading={loading}>
          <RefreshCw size={14} />
        </Button>
      }
    >
      {error ? (
        <AlertBanner type="error" title="No se pudo leer el punto" message={error} />
      ) : !data && loading ? (
        <div style={{ fontSize: 12.5, color: t.textSoft, fontFamily: "'IBM Plex Mono', monospace" }}>
          cargando dato…
        </div>
      ) : (
        <div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontSize: 32, fontWeight: 700, color: t.text, fontFamily: "'IBM Plex Mono', monospace" }}>
              {String(data?.value ?? "—")}
            </span>
            <span
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                fontSize: 11.5, fontWeight: 600, color: isGood ? t.success : t.coral,
              }}
            >
              <Radio size={12} />
              {isGood ? "buena calidad" : `calidad: ${data?.quality}`}
            </span>
          </div>
          <div style={{ marginTop: 8, fontSize: 11.5, color: t.textFaint }}>
            {data?.timestamp ? `Timestamp ICONICS: ${data.timestamp}` : null}
            {lastUpdated ? ` · Actualizado: ${lastUpdated.toLocaleTimeString()}` : null}
          </div>
        </div>
      )}
    </Panel>
  );
}
