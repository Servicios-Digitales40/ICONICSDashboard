/**
 * Subsección "Eliminar" de la vista Data.
 *
 * Muestra los clientes de `db:Northwind.Customers` como tabla y permite borrar
 * cada uno con el Data Manipulator DeleteCustomer, escribiendo `true` a:
 *
 *     db:Northwind.DeleteCustomer<@CustomerID='X'>.@@Execute
 *
 * La tabla se lee con el mismo patrón que la de productos: `.@@Count` para el
 * total de filas, un punto por celda traídos en lotes, y reconstrucción de la
 * matriz fila × columna.
 */
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import { useTheme } from "@/theme";
import { useToast } from "@/app/providers";
import { Panel, Button, AlertBanner } from "@/components/ui/index.js";
import { fetchIconicsPoint, fetchIconicsBatch, writeIconicsPoint } from "@/lib/iconics";

const TABLE = "db:Northwind.Customers";
const CONFIG = "db:Northwind";

const COLUMNS = [
  "CustomerID",
  "CompanyName",
  "ContactName",
  "ContactTitle",
  "Address",
  "City",
  "Region",
  "PostalCode",
  "Country",
  "Phone",
  "Fax",
];

const CHUNK_SIZE = 120;

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default function EliminarView() {
  const { theme: t } = useTheme();
  const { pushToast } = useToast();
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleting, setDeleting] = useState(null); // CustomerID en proceso

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const countRes = await fetchIconicsPoint(`${TABLE}.@@Count`);
      const total = Number(countRes?.payload?.value ?? countRes?.payload?.Value);
      if (!Number.isFinite(total) || total <= 0) {
        throw new Error(`El conteo devuelto no es válido (${countRes?.payload?.value}).`);
      }
      setCount(total);

      const points = [];
      for (let i = 0; i < total; i++) {
        for (const col of COLUMNS) points.push(`${TABLE}[${col}][${i}]`);
      }

      const map = {};
      for (const group of chunk(points, CHUNK_SIZE)) {
        const res = await fetchIconicsBatch(group);
        Object.assign(map, res?.payload ?? {});
      }

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

  async function handleDelete(customerId) {
    if (!customerId) return;
    if (!window.confirm(`¿Eliminar al cliente "${customerId}"? Esta acción borra la fila en ICONICS.`)) return;

    setDeleting(customerId);
    try {
      const safeId = String(customerId).replace(/'/g, "");
      const point = `${CONFIG}.DeleteCustomer<@CustomerID='${safeId}'>.@@Execute`;
      const res = await writeIconicsPoint(point, true);
      const result = res.result ?? {};

      if (result.success) {
        pushToast("success", `Cliente "${customerId}" eliminado.`);
        // Quitamos la fila de inmediato y recargamos para reflejar ICONICS.
        setRows((prev) => prev.filter((r) => r.CustomerID !== customerId));
        load();
      } else {
        pushToast("error", `No se pudo eliminar: ${result.errorMessage ?? "motivo desconocido"}`);
      }
    } catch (err) {
      pushToast("error", err.message);
    } finally {
      setDeleting(null);
    }
  }

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
      title="Eliminar clientes de ICONICS"
      code={`${TABLE} · ${count ?? 0} filas · DeleteCustomer`}
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
          cargando clientes…
        </div>
      ) : (
        <div style={{ overflow: "auto", maxHeight: 520, borderRadius: 10, border: `1px solid ${t.border}` }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1100 }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, textAlign: "right", color: t.textFaint }}>#</th>
                {COLUMNS.map((col) => (
                  <th key={col} style={thStyle}>{col}</th>
                ))}
                <th style={{ ...thStyle, textAlign: "center" }}>Acción</th>
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
                        fontWeight: col === "CompanyName" ? 600 : 400,
                        fontFamily: col === "CustomerID" ? "'IBM Plex Mono', monospace" : undefined,
                      }}
                    >
                      {row[col] == null || row[col] === "" ? "—" : String(row[col])}
                    </td>
                  ))}
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    <Button
                      variant="danger"
                      icon={<Trash2 size={13} />}
                      loading={deleting === row.CustomerID}
                      onClick={() => handleDelete(row.CustomerID)}
                    >
                      Eliminar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ marginTop: 14, fontSize: 11.5, color: t.textFaint, lineHeight: 1.5 }}>
        Nota: tras eliminar, el conteo <code>.@@Count</code> puede tardar en refrescar (ICONICS lo cachea);
        usa el botón de recargar si la tabla no cuadra de inmediato.
      </p>
    </Panel>
  );
}
