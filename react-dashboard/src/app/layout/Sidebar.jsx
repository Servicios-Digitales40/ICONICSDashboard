/**
 * Barra lateral fija: marca, navegación entre páginas y tarjeta de perfil.
 * Recibe `page` y `onNavigate` desde App.jsx, que es quien decide qué página
 * renderizar en el área principal.
 */
import { Fragment, useEffect, useState } from "react";
import { ChevronDown, PanelLeftClose, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/theme";
import { useDominio } from "@/i18n/useDominio.js";
import { useMediaQuery } from "@/lib/viewport.js";
import { NAV } from "../routes/index.js";
import { HoverTip } from "@/components/ui/index.js";
import { useSistemaAgua } from "@/Demo-EVA/data/comunes/hooks.js";
import { estadoColor } from "@/Demo-EVA/components/paleta.js";
import { RAIZ } from "@shared/eva/tanque/senales.js";

/**
 * Raíz de instalación para el pie de la barra.
 *
 * Hasta el Plan 27, `RAIZ` apuntaba a `SENSORES/` —una rama del árbol, no la
 * instalación— y este archivo le quitaba ese tramo a mano para no mostrar el
 * catálogo de señales en vez de la planta. Desde F1, `RAIZ` ya ES el prefijo
 * de la instalación (`ac:TDCON/DEMO/`), así que el recorte ya no hace falta:
 * se deja el alias para no tocar el resto del archivo.
 */
const RAIZ_INSTALACION = RAIZ;

/**
 * Estado de "Planta" para el punto de la barra: mismo criterio y mismos
 * tres estados que ya usa la tarjeta de Planta en el Inicio
 * (`InicioTanque.jsx`, `VISTAS[0].dato`) — un fuera de límite pesa más que
 * varios en aviso, y sin lectura no hay punto que pintar. Vive aquí y no
 * como import compartido porque son cuatro líneas y las dos vistas ya
 * evalúan `sistema.resumen` de formas ligeramente distintas (aquí no hace
 * falta el texto, sólo el estado).
 */
function estadoPlanta(sistema) {
  const { fueraDeLimite, enAviso, medidas } = sistema.resumen;
  if (!medidas) return null;
  if (fueraDeLimite > 0) return "critico";
  if (enAviso > 0) return "atencion";
  return "nominal";
}

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
 * Coincide con el punto en el que `PlantaTanque` ya renuncia a su rejilla de
 * bandas (ver `PlantaTanque.jsx`, `@media (max-width: 1280px)`): a partir de ahí
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

/**
 * Botón de navegación reutilizable (página simple o hijo de un grupo).
 *
 * ── DE DÓNDE SALE EL TEXTO ─────────────────────────────────────────
 *
 * De `navigation:routes.<id>.nav`, y el estado de
 * `machines:status.<key>.label` a través de `useDominio`. Antes había aquí un
 * `ESTADO_TEXTO` con «fuera de límite», «en aviso» y «en banda» escritos a
 * mano: era una TERCERA copia del vocabulario que ya declara
 * `shared/eva/tanque/estado.js`, y bastaba con que alguien cambiara una banda
 * allí para que el sidebar siguiera diciendo lo de antes. Ahora sale del
 * mismo sitio que el resto de la aplicación.
 *
 * El punto de color nunca va solo: el texto lo acompaña en el tooltip y en el
 * `title` (DESIGN.md), y eso no cambia — sólo cambia quién escribe el texto.
 */
function NavButton({ item, active, onNavigate, t, dark, indent = false, collapsed = false, estado = null }) {
  const { t: traducir } = useTranslation("navigation");
  const { estado: textoDeEstado } = useDominio();

  const nombre = traducir(`routes.${item.id}.nav`);
  const etiqueta = estado ? `${nombre} — ${textoDeEstado(estado).toLowerCase()}` : nombre;

  return (
    <MaybeTip collapsed={collapsed} label={etiqueta}>
      <button
        className={`nav-item ${active ? "nav-active" : ""}`}
        onClick={() => onNavigate(item.id)}
        title={collapsed ? undefined : etiqueta}
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
        {/* El punto de estado vive pegado al icono, no a la etiqueta: así el
            mismo layout sirve colapsada (sólo icono) y expandida sin mover
            nada — un badge de esquina, no un elemento de línea aparte que
            desaparecería justo donde más se necesita, la barra en 72px. */}
        <span style={{ position: "relative", display: "flex", flexShrink: 0 }}>
          <span style={{ display: "flex", color: active ? t.accent : t.textFaint }}>{item.icon}</span>
          {estado && (
            <span
              aria-hidden="true"
              style={{
                position: "absolute", top: -2, right: -3, width: 7, height: 7, borderRadius: "50%",
                background: estadoColor(dark, estado), border: `1.5px solid ${t.sidebar}`,
              }}
            />
          )}
        </span>
        {!collapsed && nombre}
        {!collapsed && active && <span style={{ marginLeft: "auto", width: 6, height: 6, borderRadius: "50%", background: t.gradAccent }} />}
      </button>
    </MaybeTip>
  );
}

/** Grupo desplegable: cabecera que colapsa/expande sus hijos. */
function NavGroup({ item, page, onNavigate, t, collapsed = false, onExpandSidebar }) {
  const { t: traducir } = useTranslation("navigation");
  const nombre = traducir(`sections.${item.group}`);
  const childActive = item.children.some((c) => c.id === page);

  /*
   * ── POR QUÉ ARRANCAN ABIERTOS ──────────────────────────────────────
   *
   * Hasta que la planta se partió en dos sistemas (agosto de 2026), el único
   * grupo era «3D» —dos vistas dentro de una lista de items sueltos—, y
   * arrancar cerrado tenía sentido: el menú se leía entero de un vistazo y
   * ese grupo era un pliegue opcional dentro de él.
   *
   * Ahora TODO el menú son secciones. Con el criterio anterior, quien abría
   * la aplicación veía tres cabeceras y las cuatro vistas de la sección
   * activa: las otras nueve estaban a un clic que nada anunciaba, y la
   * pantalla no decía que existieran. Un menú que esconde dos tercios de la
   * aplicación no es un menú.
   *
   * Se conserva el plegado MANUAL —quien quiera quitar de en medio el sistema
   * que no está mirando, puede— y el cierre al colapsar la barra, que ahí es
   * obligado porque no hay sitio para los hijos.
   */
  const [open, setOpen] = useState(!collapsed);

  useEffect(() => {
    if (collapsed) setOpen(false);
    else setOpen(true);
  }, [collapsed]);

  // Navegar a una vista de una sección plegada la abre: si no, el item activo
  // quedaría escondido y la barra señalaría una sección sin decir cuál.
  useEffect(() => {
    if (!collapsed && childActive) setOpen(true);
  }, [collapsed, childActive]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <MaybeTip collapsed={collapsed} label={nombre}>
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
              {nombre}
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
  const { theme: t, dark } = useTheme();
  /* `traducirBarra` y no `t`: aquí `t` es el TEMA. Ver la cabecera de `@/i18n`. */
  const { t: traducirBarra } = useTranslation("layout");
  /* Los rótulos de sección y de módulo viven en `navigation`, con las rutas. */
  const { t: traducirNav } = useTranslation("navigation");
  const esCajon = useMediaQuery(UMBRAL_CAJON);
  // Fuente compartida por `EvaProvider` (App.jsx envuelve el Shell entero con
  // él) — mismo hook que usa cada vista, así que el punto de "Planta" no abre
  // un segundo motor de sondeo, sólo lee el que ya corre.
  const { sistema } = useSistemaAgua();
  const estadoPorId = { "eva-planta": estadoPlanta(sistema) };
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
      {/* Marca (+ botón de cerrar, sólo en el cajón móvil: el colapso de
          escritorio vive ahora en el ancla del borde, ver más abajo). */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: collapsed ? "22px 0 18px" : "22px 20px 18px", justifyContent: collapsed ? "center" : "flex-start" }}>
        <span style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 10, background: t.gradAccent, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 6px 16px ${t.accent}40` }}>
          <MarcaEstacion size={17} />
        </span>
        {!collapsed && (
          <>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15.5, fontWeight: 800, color: t.text, fontFamily: "'Plus Jakarta Sans', sans-serif", lineHeight: 1.15, whiteSpace: "nowrap" }}>Demo TDCON</div>
              <div style={{ fontSize: 11, color: t.textFaint, fontFamily: "'IBM Plex Mono', monospace", marginTop: 2 }}>ENTERPRISE</div>
            </div>
            {esCajon && (
              <span style={{ marginLeft: "auto", display: "flex" }}>
                <HoverTip label={traducirBarra("sidebar.closeMenu")}>
                  <button
                    className="nav-item"
                    onClick={onCerrarCajon}
                    aria-label={traducirBarra("menu.close")}
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 6, borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", color: t.textFaint }}
                  >
                    <X size={18} />
                  </button>
                </HoverTip>
              </span>
            )}
          </>
        )}
      </div>

      {/* Navegación */}
      <nav
        aria-label={traducirBarra("sidebar.mainNav")}
        style={{ padding: collapsed ? "8px 10px" : "8px 14px", display: "flex", flexDirection: "column", gap: 3, flex: 1, overflowY: "auto", overflowX: "hidden" }}
      >
        {NAV.map((item, i) => {
          /*
           * ── LA CABECERA DE MÓDULO (Plan 25 F5 · `NUE-07`) ──────────────
           *
           * Se pinta cuando cambia el módulo respecto al item anterior, así que
           * sale SOLA de `NAV` sin una lista paralela aquí. Una lista escrita a
           * mano se quedaría vieja en cuanto se añadiera una sección, que es el
           * mismo motivo por el que `buildNav` deriva el árbol del registro.
           *
           * Y no es decoración: separa dos FUENTES DE DATOS distintas
           * (`CLAUDE.md` §4.7). El compresor de Predicción no entra por ICONICS,
           * y hasta el 03-09-2026 colgaba de «General» como si lo hiciera.
           *
           * Con la barra plegada no se pinta: ahí no hay sitio para un rótulo y
           * lo que queda es una raya, que separaría sin decir por qué.
           */
          const moduloAnterior = i > 0 ? NAV[i - 1].modulo : null;
          const abreModulo = Boolean(item.modulo) && item.modulo !== moduloAnterior;

          const nodo = item.children ? (
            <NavGroup key={item.group} item={item} page={page} onNavigate={navegar} t={t} collapsed={collapsed} onExpandSidebar={() => setCollapsedPref(false)} />
          ) : (
            <NavButton
              key={item.id} item={item} active={page === item.id} onNavigate={navegar} t={t} dark={dark}
              collapsed={collapsed} estado={estadoPorId[item.id] ?? null}
            />
          );

          if (!abreModulo || collapsed) return nodo;

          return (
            <Fragment key={`mod-${item.modulo}`}>
              <h2
                style={{
                  margin: i === 0 ? "2px 0 4px" : "14px 0 4px",
                  padding: "0 8px",
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: t.textFaint,
                }}
              >
                {traducirNav(`modules.${item.modulo}`)}
              </h2>
              {nodo}
            </Fragment>
          );
        })}
      </nav>

      {/* Pie: identidad de INSTALACIÓN, no de persona — no hay login real
          detrás de este tablero (PRODUCT.md), así que un nombre y un "Plan
          Pro" de mentira prometerían una cuenta que no existe. En su lugar,
          la raíz real del servidor que está leyendo: el mismo hecho que
          `shared/eva/tanque/senales.js` ya trata como la única fuente de verdad
          para "qué instalación es esta". */}
      <div style={{ padding: collapsed ? "12px 10px" : "12px 14px", borderTop: `1px solid ${t.border}` }}>
        <MaybeTip collapsed={collapsed} label={traducirBarra("sidebar.plantRoot", { raiz: RAIZ_INSTALACION })}>
          <div
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: collapsed ? "8px 0" : "8px 10px",
              justifyContent: collapsed ? "center" : "flex-start",
              borderRadius: 10, background: t.hover,
            }}
          >
            <span
              style={{
                width: 26, height: 26, flexShrink: 0, borderRadius: 7,
                background: t.panel, border: `1px solid ${t.border}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, fontWeight: 700, color: t.textFaint, fontFamily: "'IBM Plex Mono', monospace",
              }}
              aria-hidden="true"
            >
              ac
            </span>
            {!collapsed && (
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: t.text, fontFamily: "'IBM Plex Mono', monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {RAIZ_INSTALACION}
                </div>
                <div style={{ fontSize: 11, color: t.textFaint, marginTop: 1 }}>
                  {traducirBarra("plant")}
                </div>
              </div>
            )}
          </div>
        </MaybeTip>
      </div>
      </aside>

      {/* Ancla de colapso: un solo control, en el mismo sitio en los dos
          estados —a caballo del borde derecho de la barra, a la altura del
          logo— en vez de los dos botones que había antes (uno junto a la
          marca cuando expandida, otro centrado debajo cuando colapsada).
          Ese control saltaba de sitio al cambiar de estado; éste no se
          mueve, sólo gira 180° el mismo icono. Sólo existe en escritorio: el
          cajón móvil no colapsa a solo-icono (ver `collapsed` arriba), así
          que no tiene nada que anclar. `position: fixed` y no `sticky`
          porque vive fuera de `<aside>` —que recorta con `overflow: hidden`
          lo que se saliera de su borde— y necesita su propia coordenada, no
          heredar la del flujo. `zIndex: 31`, no 10: el Topbar es `sticky`
          a 30 (Topbar.jsx) y su cabecera cubre exactamente esta franja
          horizontal — con un z-index menor el botón se veía pero el propio
          Topbar le ganaba el hit-test, así que ni el click ni el hover del
          ratón llegaban a tocarlo (sólo Tab+Enter funcionaba). 31 es "justo
          encima del Topbar", nada más — muy por debajo del overlay del
          cajón móvil (69/70), que además nunca coincide con este botón
          porque `esCajon` lo oculta. */}
      {!esCajon && (
        <HoverTip label={traducirBarra(collapsed ? "sidebar.expand" : "sidebar.collapse")} style={{ position: "fixed", top: 30, left: collapsed ? 72 : 246, zIndex: 31, transition: "left 220ms ease" }}>
          <button
            onClick={() => setCollapsedPref((c) => !c)}
            aria-label={traducirBarra(collapsed ? "sidebar.expandAria" : "sidebar.collapseAria")}
            aria-expanded={!collapsed}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 22, height: 22, borderRadius: "50%", transform: "translateX(-50%)",
              // `t.hover`, no `t.panel`: sobre un fondo tan oscuro como el de
              // la barra los dos superficies casi no se separan (hallazgo de
              // /impeccable shape, contraste bajo). `t.hover` es el mismo
              // tono que ya usa el estado :hover de cualquier `nav-item`, así
              // que el botón en reposo se lee tan "elevado" como cualquier
              // ítem de nav lo hace al pasar el cursor — no un tono inventado.
              border: `1px solid ${t.border}`, background: t.hover, boxShadow: t.shadow,
              cursor: "pointer", color: t.textSoft,
            }}
          >
            <PanelLeftClose size={13} style={{ transition: "transform 220ms ease", transform: collapsed ? "rotate(180deg)" : "none" }} />
          </button>
        </HoverTip>
      )}
    </>
  );
}
