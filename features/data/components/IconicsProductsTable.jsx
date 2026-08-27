/**
 * Muestra los productos de `db:Northwind.Products` como tabla, con todas sus
 * columnas.
 *
 * ICONICS lee las tablas por celda (`db:Northwind.Products[Columna][fila]`),
 * así que:
 *
 *   1. Se lee el total de filas con `.@@Count`.
 *   2. Se genera un punto por cada (columna, fila) y se traen en lotes: el
 *      producto de filas por columnas no cabe en una sola URL GET.
 *   3. Se reconstruye la matriz fila × columna a partir del mapa devuelto.
 */
import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useTheme } from "@/theme";
import { fetchIconicsPoint, fetchIconicsBatch } from "@/lib/iconics";
import { Panel, Button, AlertBanner } from "@/components/ui/index.js";

const TABLE = "db:Northwind.Products";

// Columnas en el orden en que se mostrarán.
const COLUMNS = [
  "ProductID",
  "ProductName",
  "QuantityPerUnit",
  "UnitPrice",
  "UnitsInStock",
  "UnitsOnOrder",
  "ReorderLevel",
  "Discontinued",
  "CategoryID",
  "SupplierID",
];

// Máximo de puntos por petición batch, para mantener la URL por debajo del
// límite de tamaño de header de Node (~16 KB).
const CHUNK_SIZE = 120;

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Da formato a algunos valores para que la tabla se lea mejor.
function formatCell(column, value) {
  if (value == null) return "—";
  if (column === "Discontinued") return value === true || value === 1 || value === "1" ? "Sí" : "No";
  if (column === "UnitPrice") {
    const n = Number(value);
    return Number.isFinite(n) ? `$${n.toFixed(2)}` : String(value);
  }
  return String(value);
}

export function IconicsProductsTable() {
  const { theme: t } = useTheme();
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Paso 1: total de filas
      const countRes = await fetchIconicsPoint(`${TABLE}.@@Count`);
      const total = Number(countRes?.payload?.value ?? countRes?.payload?.Value);
      if (!Number.isFinite(total) || total <= 0) {
        throw new Error(`El conteo devuelto no es válido (${countRes?.payload?.value}).`);
      }
      setCount(total);

      // Paso 2: un punto por cada celda (columna, fila)
      const points = [];
      for (let i = 0; i < total; i++) {
        for (const col of COLUMNS) points.push(`${TABLE}[${col}][${i}]`);
      }

      // Se traen en lotes y se unen todos los mapas.
      const map = {};
      for (const group of chunk(points, CHUNK_SIZE)) {
        const res = await fetchIconicsBatch(group);
        Object.assign(map, res?.payload ?? {});
      }

      // Paso 3: reconstrucción de las filas
      const table = Array.from({ length: total }, (_, i) => {
        const row = { __index: i };
        for (const col of COLUMNS) {
          const entry = map[`${TABLE}[${col}][${i}]`];
          row[col] = entry?.payload?.value ?? entry?.payload?.Value ?? null;
        }
        return row;
      });
      setRows(table);
    } catch (err) {
      setError(err.message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const thStyle = {
    position: "sticky",
    top: 0,
    background: t.panel,
    textAlign: "left",
    padding: "10px 12px",
    fontSize: 11.5,
    fontWeight: 600,
    color: t.textSoft,
    borderBottom: `1px solid ${t.border}`,
    whiteSpace: "nowrap",
  };

  const tdStyle = {
    padding: "8px 12px",
    fontSize: 12.5,
    color: t.text,
    borderBottom: `1px solid ${t.border}`,
    whiteSpace: "nowrap",
  };

  return (
    <Panel
      title="Tabla de productos ICONICS"
      code={`${TABLE} · ${count ?? 0} filas`}
      right={
        <Button variant="icon" onClick={load} loading={loading}>
          <RefreshCw size={14} />
        </Button>
      }
    >
      {error ? (
        <AlertBanner type="error" title="No se pudo cargar la tabla" message={error} />
      ) : loading && rows.length === 0 ? (
        <div style={{ fontSize: 12.5, color: t.textSoft, fontFamily: "'IBM Plex Mono', monospace" }}>
          cargando tabla…
        </div>
      ) : (
        <div style={{ overflow: "auto", maxHeight: 480, borderRadius: 10, border: `1px solid ${t.border}` }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 900 }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, textAlign: "right", color: t.textFaint }}>#</th>
                {COLUMNS.map((col) => (
                  <th key={col} style={thStyle}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.__index}>
                  <td style={{ ...tdStyle, textAlign: "right", color: t.textFaint, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5 }}>
                    {row.__index}
                  </td>
                  {COLUMNS.map((col) => (
                    <td
                      key={col}
                      style={{
                        ...tdStyle,
                        fontWeight: col === "ProductName" ? 600 : 400,
                        textAlign: typeof row[col] === "number" || col === "UnitPrice" ? "right" : "left",
                      }}
                    >
                      {formatCell(col, row[col])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
