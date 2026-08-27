/**
 * Lista los productos de la tabla `db:Northwind.Products`, en dos pasos contra
 * ICONICS a través del backend puente:
 *
 *   1. Leer el total de filas con el agregado `.@@Count`.
 *   2. Pedir en una sola petición batch todos los `[ProductName][i]`.
 *
 * Así se evitan N peticiones sueltas: el conteo dice cuántos hay y el batch
 * los trae juntos.
 */
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Package } from "lucide-react";
import { useTheme } from "@/theme";
import { fetchIconicsPoint, fetchIconicsBatch } from "@/lib/iconics";
import { Panel, Button, AlertBanner } from "@/components/ui/index.js";

const TABLE = "db:Northwind.Products";
const COLUMN = "ProductName";

export function IconicsProductsList() {
  const { theme: t } = useTheme();
  const [products, setProducts] = useState([]);
  const [count, setCount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Paso 1: total de registros
      const countRes = await fetchIconicsPoint(`${TABLE}.@@Count`);
      const total = Number(countRes?.payload?.value ?? countRes?.payload?.Value);
      if (!Number.isFinite(total) || total <= 0) {
        throw new Error(`El conteo devuelto no es válido (${countRes?.payload?.value}).`);
      }
      setCount(total);

      // Paso 2: batch de todos los nombres por índice
      const points = Array.from({ length: total }, (_, i) => `${TABLE}[${COLUMN}][${i}]`);
      const batchRes = await fetchIconicsBatch(points);
      const map = batchRes?.payload ?? {};

      // Se preserva el orden por índice buscando cada punto en el mapa.
      const list = points.map((point, i) => {
        const entry = map[point];
        const value = entry?.payload?.value ?? entry?.payload?.Value;
        return { index: i, name: value ?? "—", ok: entry?.ok !== false && value != null };
      });
      setProducts(list);
    } catch (err) {
      setError(err.message);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const loaded = products.filter((p) => p.ok).length;

  return (
    <Panel
      title="Productos ICONICS"
      code={`${TABLE}[${COLUMN}]`}
      right={
        <Button variant="icon" onClick={load} loading={loading}>
          <RefreshCw size={14} />
        </Button>
      }
    >
      {error ? (
        <AlertBanner type="error" title="No se pudieron listar los productos" message={error} />
      ) : loading && products.length === 0 ? (
        <div style={{ fontSize: 12.5, color: t.textSoft, fontFamily: "'IBM Plex Mono', monospace" }}>
          cargando productos…
        </div>
      ) : (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 12,
              fontSize: 12,
              fontWeight: 600,
              color: t.textSoft,
            }}
          >
            <Package size={14} />
            {loaded} de {count ?? 0} productos cargados
          </div>

          <div style={{ maxHeight: 360, overflowY: "auto", display: "grid", gap: 2 }}>
            {products.map((p) => (
              <div
                key={p.index}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 10,
                  padding: "6px 8px",
                  borderRadius: 8,
                  background: p.index % 2 === 0 ? "transparent" : t.panelAlt ?? "transparent",
                  fontSize: 13,
                  color: p.ok ? t.text : t.coral,
                }}
              >
                <span
                  style={{
                    minWidth: 34,
                    textAlign: "right",
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 11.5,
                    color: t.textFaint,
                  }}
                >
                  {p.index}
                </span>
                <span>{String(p.name)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}
