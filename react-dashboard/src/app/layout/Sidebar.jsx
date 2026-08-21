/**
 * Barra lateral fija: marca, navegación entre páginas y tarjeta de perfil.
 * Recibe `page` y `onNavigate` desde App.jsx, que es quien decide qué página
 * renderizar en el área principal.
 */
import { useEffect, useState } from "react";
import { LogOut, ChevronDown, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { useTheme } from "@/theme";
import { useMediaQuery } from "@/lib/viewport.js";
import { NAV } from "../routes/index.js";
import { Avatar, HoverTip } from "@/components/ui/index.js";

/**
 * La marca de la demo: una gota con su línea de nivel, no un rayo genérico.
 *
 * No es un icono de `lucide-react` recolocado: es el mismo lenguaje visual
 * que ya usan `ArcoNivel` (tiles.jsx) y la columna de la maqueta 3D —una
 * superficie que se llena— aplicado al tamaño de un logotipo. «Estación de
 * llenado» es, literalmente, este dibujo.
 */
function MarcaEstacion({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <clipPath id="marca-estacion-gota">
        <path d="M12 2.6C12 2.6 5.4 10.4 5.4 15a6.6 6.6 0 1 0 13.2 0C18.6 10.4 12 2.6 12 2.6Z" />
      </clipPath>
      <rect x="4" y="13.4" width="16" height="8.4" fill="#fff" opacity="0.95" clipPath="url(#marca-estacion-gota)" />
      <path
        d="M12 2.6C12 2.6 5.4 10.4 5.4 15a6.6 6.6 0 1 0 13.2 0C18.6 10.4 12 2.6 12 2.6Z"
        stroke="#fff"
        strokeWidth={1.7}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Umbral por debajo del cual la barra deja de caber junto al contenido.
 *
 * Coincide con el punto en el que `PlantaEva` ya renuncia a su rejilla de
 * bandas (ver `PlantaEva.jsx`, `@media (max-width: 1280px)`): a partir de ahí
 * el contenido es esencialmente una columna, así que los 246 px fijos de la
 * barra dejan de ser un lujo y pasan a ser el ancho que le falta a esa
 * columna. Por debajo de esto la barra se convierte en un cajón superpuesto,
 * oculto por defecto, que se abre desde el botón del Topbar.
 */
const UMBRAL_CAJON = "(max-width: 900px)";

/** Envuelve en tooltip solo cuando la barra está colapsada y no se ve el texto. */
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
            // Colapsada no hay sitio para los hijos: se despliega la barra y
            // se abre el grupo.
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

/**
 * @param abiertaCajon   sólo importa por debajo de `UMBRAL_CAJON`: si el cajón
 *                       superpuesto está desplegado.
 * @param onCerrarCajon  lo llama el propio Sidebar al navegar o al pulsar el
 *                       fondo, y lo llama el Topbar al pulsar el botón de menú.
 */
export function Sidebar({ page, onNavigate, abiertaCajon = false, onCerrarCajon }) {
  const { theme: t } = useTheme();
  const esCajon = useMediaQuery(UMBRAL_CAJON);
  const [collapsedPref, setCollapsedPref] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === "1"; } catch { return false; }
  });

  // Se recuerda la preferencia entre recargas. Sólo se guarda la preferencia
  // de escritorio: el cajón móvil nunca colapsa a solo icono (ver `collapsed`
  // más abajo), así que no tiene preferencia propia que recordar.
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, collapsedPref ? "1" : "0"); } catch { /* almacenamiento no disponible */ }
  }, [collapsedPref]);

  // Como cajón, la barra no comparte ancho con nada: colapsarla a solo icono
  // no libera sitio para nadie y sólo esconde las etiquetas que hacen
  // navegable un panel que se abre y se cierra en un gesto.
  const collapsed = esCajon ? false : collapsedPref;

  const navegar = (id) => {
    onNavigate(id);
    // Elegir una página es la señal de que el cajón ya cumplió su propósito.
    if (esCajon) onCerrarCajon?.();
  };

  return (
    <>
      {/* Fondo del cajón: sólo existe montado cuando hay algo que cerrar, así
          que nunca intercepta clics fuera de ese momento. */}
      {esCajon && abiertaCajon && (
        <div
          aria-hidden="true"
          onClick={onCerrarCajon}
          style={{ position: "fixed", inset: 0, zIndex: 69, background: t.overlay }}
        />
      )}

      <aside
        style={{
          width: collapsed ? 72 : 246, flexShrink: 0, background: t.sidebar, borderRight: `1px solid ${t.border}`,
          display: "flex", flexDirection: "column", height: "100vh",
          // En escritorio la barra vive en el flujo, pegada arriba. Como cajón
          // sale del flujo por completo —el contenido ya no le reserva
          // ancho— y se desliza desde fuera del viewport en vez de aparecer:
          // un cajón que aparece de golpe se confunde con un fallo de pintado.
          position: esCajon ? "fixed" : "sticky", top: 0, left: 0,
          zIndex: esCajon ? 70 : undefined,
          transform: esCajon && !abiertaCajon ? "translateX(-100%)" : "translateX(0)",
          boxShadow: esCajon && abiertaCajon ? "0 20px 60px rgba(0,0,0,0.35)" : undefined,
          // El contenido colapsa a solo icono, no encoge proporcionalmente: no hay transform equivalente sin distorsionar el texto.
          transition: "width 220ms ease, transform 220ms ease", overflow: "hidden", // impeccable-disable-line layout-transition -- único elemento reflowing, coste despreciable
        }}
      >
      {/* Marca + botón de colapso (o de cierre, en el cajón) */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: collapsed ? "22px 0 18px" : "22px 20px 18px", justifyContent: collapsed ? "center" : "flex-start" }}>
        <span style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 10, background: t.gradAccent, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 6px 16px ${t.accent}40` }}>
          <MarcaEstacion size={17} />
        </span>
        {!collapsed && (
          <>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15.5, fontWeight: 800, color: t.text, fontFamily: "'Plus Jakarta Sans', sans-serif", lineHeight: 1.15, whiteSpace: "nowrap" }}>Estación de Llenado</div>
              <div style={{ fontSize: 10.5, color: t.textFaint, fontFamily: "'IBM Plex Mono', monospace", marginTop: 2 }}>ENTERPRISE</div>
            </div>
            <span style={{ marginLeft: "auto", display: "flex" }}>
              {esCajon ? (
                <HoverTip label="Cerrar menú">
                  <button
                    className="nav-item"
                    onClick={onCerrarCajon}
                    aria-label="Cerrar el menú de navegación"
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 6, borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", color: t.textFaint }}
                  >
                    <X size={18} />
                  </button>
                </HoverTip>
              ) : (
                <HoverTip label="Colapsar barra">
                  <button
                    className="nav-item"
                    onClick={() => setCollapsedPref(true)}
                    aria-label="Colapsar barra lateral"
                    aria-expanded
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 6, borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", color: t.textFaint }}
                  >
                    <PanelLeftClose size={17} />
                  </button>
                </HoverTip>
              )}
            </span>
          </>
        )}
      </div>

      {/* Botón de expandir (visible sólo colapsada, y sólo en escritorio: el cajón nunca colapsa) */}
      {collapsed && !esCajon && (
        <div style={{ display: "flex", justifyContent: "center", padding: "0 0 8px" }}>
          <HoverTip label="Expandir barra">
            <button
              className="nav-item"
              onClick={() => setCollapsedPref(false)}
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
      <nav
        aria-label="Navegación principal"
        style={{ padding: collapsed ? "8px 10px" : "8px 14px", display: "flex", flexDirection: "column", gap: 3, flex: 1, overflowY: "auto", overflowX: "hidden" }}
      >
        {NAV.map((item) =>
          item.children ? (
            <NavGroup key={item.group} item={item} page={page} onNavigate={navegar} t={t} collapsed={collapsed} onExpandSidebar={() => setCollapsedPref(false)} />
          ) : (
            <NavButton key={item.id} item={item} active={page === item.id} onNavigate={navegar} t={t} collapsed={collapsed} />
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
    </>
  );
}
