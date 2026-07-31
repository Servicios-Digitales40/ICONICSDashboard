/**
 * layout/Sidebar.jsx
 * ------------------------------------------------------------------
 * Barra lateral fija: marca, navegación entre páginas y tarjeta de
 * perfil. Recibe `page`/`onNavigate` desde App.jsx, que es quien
 * decide qué página renderizar en el área principal.
 */
import { useEffect, useState } from "react";
import { Zap, LogOut, ChevronDown, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useTheme } from "@/theme";
import { NAV } from "../routes/index.js";
import { Avatar, HoverTip } from "@/components/ui/index.js";

/** Envuelve en tooltip sólo cuando la barra está colapsada (el texto ya no se ve). */
function MaybeTip({ collapsed, label, children }) {
  return collapsed ? <HoverTip label={label}>{children}</HoverTip> : children;
}

/** Botón de navegación reutilizable (página simple o hijo de un grupo). */
function NavButton({ item, active, onNavigate, t, indent = false, collapsed = false }) {
  return (
    <MaybeTip collapsed={collapsed} label={item.label}>
      <button
        className={`nav-item ${active ? "nav-active" : ""}`}
        onClick={() => onNavigate(item.id)}
        title={collapsed ? undefined : item.label}
        style={{
          display: "flex", alignItems: "center", gap: 11, width: "100%",
          padding: collapsed ? "10px 0" : indent ? "9px 12px 9px 22px" : "10px 12px",
          justifyContent: collapsed ? "center" : "flex-start",
          borderRadius: 10,
          border: "none", cursor: "pointer", textAlign: "left",
          background: active ? t.accentSoft : "transparent",
          color: active ? t.accent : t.textSoft,
          fontSize: indent ? 13 : 13.5, fontWeight: active ? 700 : 500, fontFamily: "'Inter', sans-serif",
        }}
      >
        <span style={{ display: "flex", color: active ? t.accent : t.textFaint }}>{item.icon}</span>
        {!collapsed && item.label}
        {!collapsed && active && <span style={{ marginLeft: "auto", width: 6, height: 6, borderRadius: "50%", background: t.gradAccent }} />}
      </button>
    </MaybeTip>
  );
}

/** Grupo desplegable: cabecera que colapsa/expande sus hijos. */
function NavGroup({ item, page, onNavigate, t, collapsed = false, onExpandSidebar }) {
  const childActive = item.children.some((c) => c.id === page);
  const [open, setOpen] = useState(childActive);

  // Al colapsar la barra se ocultan los hijos; al reabrirla se recupera el grupo activo.
  useEffect(() => {
    if (collapsed) setOpen(false);
    else if (childActive) setOpen(true);
  }, [collapsed, childActive]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <MaybeTip collapsed={collapsed} label={item.label}>
        <button
          className="nav-item"
          onClick={() => {
            // Colapsada no hay sitio para los hijos: se despliega la barra y se abre el grupo.
            if (collapsed) { onExpandSidebar?.(); setOpen(true); return; }
            setOpen((o) => !o);
          }}
          style={{
            display: "flex", alignItems: "center", gap: 11, width: "100%",
            padding: collapsed ? "10px 0" : "10px 12px",
            justifyContent: collapsed ? "center" : "flex-start",
            borderRadius: 10,
            border: "none", cursor: "pointer", textAlign: "left",
            background: "transparent",
            color: childActive ? t.accent : t.textSoft,
            fontSize: 13.5, fontWeight: childActive ? 700 : 500, fontFamily: "'Inter', sans-serif",
          }}
        >
          <span style={{ display: "flex", color: childActive ? t.accent : t.textFaint }}>{item.icon}</span>
          {!collapsed && (
            <>
              {item.label}
              <ChevronDown
                size={15}
                style={{ marginLeft: "auto", color: t.textFaint, transition: "transform 200ms ease", transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
              />
            </>
          )}
        </button>
      </MaybeTip>

      {open && !collapsed && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {item.children.map((child) => (
            <NavButton key={child.id} item={child} active={page === child.id} onNavigate={onNavigate} t={t} indent />
          ))}
        </div>
      )}
    </div>
  );
}

const STORAGE_KEY = "sidebar:collapsed";

export function Sidebar({ page, onNavigate }) {
  const { theme: t } = useTheme();
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === "1"; } catch { return false; }
  });

  // Se recuerda la preferencia entre recargas.
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0"); } catch { /* almacenamiento no disponible */ }
  }, [collapsed]);

  return (
    <aside
      style={{
        width: collapsed ? 72 : 246, flexShrink: 0, background: t.sidebar, borderRight: `1px solid ${t.border}`,
        display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh",
        transition: "width 220ms ease", overflow: "hidden",
      }}
    >
      {/* Marca + botón de colapso */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: collapsed ? "22px 0 18px" : "22px 20px 18px", justifyContent: collapsed ? "center" : "flex-start" }}>
        <span style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 10, background: t.gradAccent, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 6px 16px ${t.accent}40` }}>
          <Zap size={17} color="#fff" fill="#fff" />
        </span>
        {!collapsed && (
          <>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15.5, fontWeight: 800, color: t.text, fontFamily: "'Plus Jakarta Sans', sans-serif", lineHeight: 1, whiteSpace: "nowrap" }}>React-Iconics</div>
              <div style={{ fontSize: 10.5, color: t.textFaint, fontFamily: "'IBM Plex Mono', monospace", marginTop: 2 }}>ENTERPRISE</div>
            </div>
            <span style={{ marginLeft: "auto", display: "flex" }}>
              <HoverTip label="Colapsar barra">
                <button
                  className="nav-item"
                  onClick={() => setCollapsed(true)}
                  aria-label="Colapsar barra lateral"
                  aria-expanded
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 6, borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", color: t.textFaint }}
                >
                  <PanelLeftClose size={17} />
                </button>
              </HoverTip>
            </span>
          </>
        )}
      </div>

      {/* Botón de expandir (visible sólo colapsada) */}
      {collapsed && (
        <div style={{ display: "flex", justifyContent: "center", padding: "0 0 8px" }}>
          <HoverTip label="Expandir barra">
            <button
              className="nav-item"
              onClick={() => setCollapsed(false)}
              aria-label="Expandir barra lateral"
              aria-expanded={false}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 8, borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", color: t.textFaint }}
            >
              <PanelLeftOpen size={17} />
            </button>
          </HoverTip>
        </div>
      )}

      {/* Navegación */}
      <nav style={{ padding: collapsed ? "8px 10px" : "8px 14px", display: "flex", flexDirection: "column", gap: 3, flex: 1, overflowY: "auto", overflowX: "hidden" }}>
        {NAV.map((item) =>
          item.children ? (
            <NavGroup key={item.group} item={item} page={page} onNavigate={onNavigate} t={t} collapsed={collapsed} onExpandSidebar={() => setCollapsed(false)} />
          ) : (
            <NavButton key={item.id} item={item} active={page === item.id} onNavigate={onNavigate} t={t} collapsed={collapsed} />
          )
        )}
      </nav>

      {/* Perfil */}
      {/* <div style={{ padding: collapsed ? "14px 10px" : 14, borderTop: `1px solid ${t.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: collapsed ? "8px 0" : "8px 8px", justifyContent: collapsed ? "center" : "flex-start", borderRadius: 12, background: t.hover }}>
          <Avatar name="Ana Torres" size={collapsed ? 28 : 34} />
          {!collapsed && (
            <>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: t.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Ana Torres</div>
                <div style={{ fontSize: 11, color: t.textFaint }}>Plan Pro</div>
              </div>
              <HoverTip label="Cerrar sesión">
                <LogOut size={15} color={t.textFaint} style={{ cursor: "pointer" }} />
              </HoverTip>
            </>
          )}
        </div>
      </div> */}
    </aside>
  );
}
