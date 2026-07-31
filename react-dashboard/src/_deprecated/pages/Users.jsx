/**
 * @deprecated 2026-07 · archivado en src/_deprecated/
 * Origen: src/pages/Users.jsx
 * Motivo: página de la plantilla original «aurora-dashboard»; llevaba tiempo comentada en NAV y se retiró del router.
 * Restaurar: receta completa en src/_deprecated/README.md
 * Revisar para borrado definitivo: 2026-Q4
 */
/**
 * pages/Users.jsx
 * ------------------------------------------------------------------
 * Tabla de usuarios con filtro por estado (chips), búsqueda por
 * nombre/correo y paginación. El estado de filtro/búsqueda es local
 * a esta página (no necesita vivir en un contexto global).
 */
import { useMemo, useState } from "react";
import { Search, Plus, MoreHorizontal, ChevronLeft, ChevronRight } from "lucide-react";
import { useTheme } from "@/theme";
import { useToast } from "@/app/providers";
import { usersData } from "../data/mockData.js";
import { Panel, Avatar, Badge, Button, Input, HoverTip } from "../components/ui/index.js";

const FILTERS = ["todos", "activo", "pendiente", "inactivo"];

export default function Users() {
  const { theme: t } = useTheme();
  const { pushToast } = useToast();

  const [filter, setFilter] = useState("todos");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    return usersData.filter(
      (u) =>
        (filter === "todos" || u.estado === filter) &&
        (u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()))
    );
  }, [filter, search]);

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {FILTERS.map((f) => (
            <span
              key={f}
              className="chip"
              onClick={() => setFilter(f)}
              style={{
                padding: "7px 14px", borderRadius: 999, fontSize: 12.5, fontWeight: 600,
                background: filter === f ? t.gradAccent : t.panel,
                color: filter === f ? "#fff" : t.textSoft,
                border: `1px solid ${filter === f ? "transparent" : t.border}`,
                textTransform: "capitalize",
                boxShadow: filter === f ? `0 4px 10px ${t.accent}40` : "none",
              }}
            >
              {f}
            </span>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ width: 220 }}>
            <Input icon={<Search size={14} />} placeholder="Buscar por nombre o correo…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Button variant="primary" icon={<Plus size={14} />} onClick={() => pushToast("success", "Formulario de nuevo usuario abierto")}>
            Nuevo usuario
          </Button>
        </div>
      </div>

      <Panel noPad>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              {["Usuario", "Rol", "Estado", "Último acceso", ""].map((h, i) => (
                <th key={i} style={{ textAlign: "left", padding: "12px 20px", fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: t.textFaint, borderBottom: `1px solid ${t.border}`, fontWeight: 500 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={5} style={{ padding: "40px 20px", textAlign: "center", color: t.textFaint, fontSize: 13 }}>No se encontraron usuarios con ese filtro.</td></tr>
            )}
            {filtered.map((u, i) => (
              <tr key={i} className="table-row">
                <td style={{ padding: "11px 20px", borderBottom: `1px solid ${t.border}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Avatar name={u.name} size={32} />
                    <div>
                      <div style={{ fontWeight: 600, color: t.text, fontSize: 13 }}>{u.name}</div>
                      <div style={{ fontSize: 11.5, color: t.textFaint }}>{u.email}</div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: "11px 20px", borderBottom: `1px solid ${t.border}`, color: t.textSoft }}>{u.rol}</td>
                <td style={{ padding: "11px 20px", borderBottom: `1px solid ${t.border}` }}><Badge status={u.estado} /></td>
                <td style={{ padding: "11px 20px", borderBottom: `1px solid ${t.border}`, color: t.textFaint, fontSize: 12.5 }}>{u.acceso}</td>
                <td style={{ padding: "11px 20px", borderBottom: `1px solid ${t.border}`, textAlign: "right" }}>
                  <HoverTip label="Más acciones"><MoreHorizontal size={16} color={t.textFaint} style={{ cursor: "pointer" }} /></HoverTip>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderTop: `1px solid ${t.border}` }}>
          <span style={{ fontSize: 12, color: t.textFaint }}>Mostrando {filtered.length} de {usersData.length} usuarios</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} style={pagerBtn(t)}><ChevronLeft size={14} /></button>
            <span style={{ fontSize: 12, color: t.textSoft, padding: "0 8px" }}>Página {page} de 1</span>
            <button onClick={() => setPage((p) => p + 1)} style={pagerBtn(t)}><ChevronRight size={14} /></button>
          </div>
        </div>
      </Panel>
    </>
  );
}

function pagerBtn(t) {
  return { display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 7, border: `1px solid ${t.border}`, background: t.panel, cursor: "pointer", color: t.textSoft };
}
