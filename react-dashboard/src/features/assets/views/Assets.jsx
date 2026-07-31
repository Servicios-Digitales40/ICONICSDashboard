/**
 * pages/Assets.jsx
 * ------------------------------------------------------------------
 * Explorador de Assets de AssetWorX (espacio de nombres `ac:`).
 *
 * Layout de dos columnas:
 *   ┌ Árbol (izq) ─────────┐  ┌ Propiedades del asset (der) ──────────┐
 *   │ browse perezoso vía   │  │ lee .PropertyPointNames del nodo       │
 *   │ /api/iconics/browse   │  │ seleccionado y muestra sus valores en  │
 *   │ (expandir = fetch)    │  │ vivo (polling).                        │
 *   └───────────────────────┘  └────────────────────────────────────────┘
 *
 * - Los nodos navegables (equipos/carpetas) tienen pointName terminado en "/".
 * - Las propiedades son hojas; sus valores se leen como cualquier punto.
 * - Se ocultan los nodos de sistema (shortName que empieza con ".").
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight, ChevronDown, Box, Boxes, Gauge, RefreshCw, Radio } from "lucide-react";
import { useTheme } from "@/theme";
import { Panel, Button, AlertBanner, SectionLabel } from "@/components/ui/index.js";
import { browseIconics, fetchIconicsPoint, fetchIconicsBatch } from "@/lib/iconics";

const ASSETS_ROOT = "ac:";

const isFolder = (node) => typeof node.pointName === "string" && node.pointName.endsWith("/");
const isSystem = (node) => (node.shortName ?? "").startsWith(".");

/* ---------------------------------------------------------------- */
/* Nodo de árbol con carga perezosa: al expandir, hace browse.       */
/* ---------------------------------------------------------------- */
function AssetNode({ node, depth, selectedPath, onSelect }) {
  const { theme: t } = useTheme();
  const [open, setOpen] = useState(false);
  const [children, setChildren] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const folder = isFolder(node);
  const selected = selectedPath === node.pointName;

  async function loadChildren() {
    setLoading(true);
    setError(null);
    try {
      const res = await browseIconics(node.pointName);
      const kids = (res.payload ?? []).filter((n) => !isSystem(n));
      setChildren(kids);
    } catch (err) {
      setError(err.message);
      setChildren([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleClick() {
    onSelect(node);
    if (!folder) return;
    const next = !open;
    setOpen(next);
    if (next && children === null) await loadChildren();
  }

  return (
    <div>
      <div
        onClick={handleClick}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "5px 8px", paddingLeft: 8 + depth * 15,
          cursor: "pointer", borderRadius: 7, userSelect: "none",
          background: selected ? `${t.accent}1f` : "transparent",
        }}
        onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = t.hover; }}
        onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = "transparent"; }}
      >
        <span style={{ display: "flex", width: 13 }}>
          {folder ? (open ? <ChevronDown size={12} color={t.textFaint} /> : <ChevronRight size={12} color={t.textFaint} />) : null}
        </span>
        {folder
          ? <Boxes size={14} color={t.accent} />
          : <Gauge size={13} color={t.amber} />}
        <span style={{
          fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5,
          color: selected ? t.accent : folder ? t.text : t.textSoft,
          fontWeight: folder ? 600 : 400,
        }}>
          {node.shortName ?? node.displayName}
        </span>
        {loading && <RefreshCw size={11} className="spin" color={t.textFaint} />}
      </div>

      {error && (
        <div style={{ paddingLeft: 8 + (depth + 1) * 15, fontSize: 11, color: t.coral }}>{error}</div>
      )}

      {folder && open && children && (
        <div>
          {children.length === 0 && !loading && (
            <div style={{ paddingLeft: 8 + (depth + 1) * 15, fontSize: 11.5, color: t.textFaint, padding: "3px 8px" }}>
              (sin sub-elementos)
            </div>
          )}
          {children.map((child) => (
            <AssetNode key={child.pointName ?? child.shortName} node={child} depth={depth + 1} selectedPath={selectedPath} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Panel derecho: propiedades en vivo del asset seleccionado.        */
/* ---------------------------------------------------------------- */
function AssetProperties({ node, intervalMs = 5000 }) {
  const { theme: t } = useTheme();
  const [props, setProps] = useState([]);
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const mounted = useRef(true);

  const path = node?.pointName;

  const load = useCallback(async () => {
    if (!path) return;
    try {
      // Hoja (punto de valor directo, p.ej. "ac:today"): se lee tal cual.
      // Asset/carpeta (pointName con "/"): se leen sus propiedades e hijos.
      if (!path.endsWith("/")) {
        const res = await fetchIconicsPoint(path);
        const p = res?.payload ?? {};
        if (!mounted.current) return;
        setChildren([]);
        setProps([{
          name: node.shortName ?? path.split("/").pop(),
          pointName: path,
          value: p.value ?? p.Value,
          quality: p.quality ?? p.Quality,
          timestamp: p.timestamp ?? p.Timestamp,
        }]);
        setError(null);
        setLastUpdated(new Date());
        return;
      }

      // 1. Nombres de los puntos de propiedad y de los equipos hijos.
      const [pointNamesRes, childRes] = await Promise.all([
        fetchIconicsPoint(`${path}.PropertyPointNames`),
        fetchIconicsPoint(`${path}.ChildEquipmentNames`),
      ]);
      const pointNames = pointNamesRes?.payload?.value ?? [];
      const childNames = childRes?.payload?.value ?? [];
      if (!mounted.current) return;
      setChildren(Array.isArray(childNames) ? childNames : []);

      // 2. Valores en vivo de cada propiedad (batch).
      if (Array.isArray(pointNames) && pointNames.length > 0) {
        const batch = await fetchIconicsBatch(pointNames);
        const map = batch?.payload ?? {};
        const list = pointNames.map((pn) => {
          const entry = map[pn];
          const p = entry?.payload ?? {};
          return {
            name: pn.split("/").pop(),
            pointName: pn,
            value: p.value ?? p.Value,
            quality: p.quality ?? p.Quality,
            timestamp: p.timestamp ?? p.Timestamp,
          };
        });
        if (mounted.current) setProps(list);
      } else if (mounted.current) {
        setProps([]);
      }
      if (mounted.current) { setError(null); setLastUpdated(new Date()); }
    } catch (err) {
      if (mounted.current) setError(err.message);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [path, node]);

  useEffect(() => {
    mounted.current = true;
    setLoading(true);
    setProps([]);
    setChildren([]);
    load();
    const id = setInterval(load, intervalMs);
    return () => { mounted.current = false; clearInterval(id); };
  }, [load, intervalMs]);

  if (!node) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "60px 20px", textAlign: "center", color: t.textSoft }}>
        <Box size={30} strokeWidth={1.6} color={t.textFaint} />
        <div style={{ fontSize: 13 }}>Selecciona un asset en el árbol para ver sus propiedades.</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: t.text }}>{node.shortName ?? node.displayName}</div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, color: t.textFaint, wordBreak: "break-all" }}>
            {node.pointName}
          </div>
        </div>
        <Button variant="icon" onClick={load} loading={loading}><RefreshCw size={14} /></Button>
      </div>

      {error && <AlertBanner type="error" title="Error al leer el asset" message={error} />}

      {children.length > 0 && (
        <div style={{ marginBottom: 14, fontSize: 12, color: t.textSoft }}>
          <b>{children.length}</b> equipo(s) hijo: <span style={{ color: t.textFaint }}>{children.join(" · ")}</span>
        </div>
      )}

      {props.length === 0 && !loading && !error ? (
        <div style={{ fontSize: 12.5, color: t.textFaint }}>Este nodo no tiene propiedades directas (navega a un equipo hoja).</div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {props.map((p) => {
            const good = p.quality === undefined || p.quality === 0;
            return (
              <div key={p.pointName} style={{ minWidth: 0, padding: "10px 12px", borderRadius: 10, background: t.hover, border: `1px solid ${t.border}` }}>
                {/* Encabezado: nombre + indicador de calidad */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: t.text, minWidth: 0, wordBreak: "break-word" }}>{p.name}</span>
                  <Radio size={11} color={good ? t.success : t.coral} style={{ flexShrink: 0 }} />
                </div>
                {/* Valor: apilado debajo, con wrap y tope de altura para valores gigantes */}
                <div
                  style={{
                    marginTop: 6,
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 15, fontWeight: 700, color: t.text,
                    wordBreak: "break-word", overflowWrap: "anywhere",
                    maxHeight: 120, overflowY: "auto",
                  }}
                >
                  {String(p.value ?? "—")}
                </div>
                {p.timestamp && <div style={{ marginTop: 4, fontSize: 10.5, color: t.textFaint }}>{p.timestamp}</div>}
              </div>
            );
          })}
        </div>
      )}

      {lastUpdated && (
        <div style={{ marginTop: 12, fontSize: 10.5, color: t.textFaint }}>
          Actualizado: {lastUpdated.toLocaleTimeString()} · refresco cada {intervalMs / 1000}s
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Página                                                            */
/* ---------------------------------------------------------------- */
export default function Assets() {
  const { theme: t } = useTheme();
  const [roots, setRoots] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await browseIconics(ASSETS_ROOT);
        if (alive) setRoots((res.payload ?? []).filter((n) => !isSystem(n)));
      } catch (err) {
        if (alive) setError(err.message);
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <>
      <SectionLabel sub="Explora la jerarquía de AssetWorX (ac:) y lee las propiedades en vivo">Assets</SectionLabel>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 380px) 1fr", gap: 16, alignItems: "start" }}>
        <Panel title="Árbol de assets" code={ASSETS_ROOT}>
          {error ? (
            <AlertBanner type="error" title="No se pudo cargar el árbol" message={error} />
          ) : roots === null ? (
            <div style={{ fontSize: 12.5, color: t.textSoft, fontFamily: "'IBM Plex Mono', monospace" }}>cargando árbol…</div>
          ) : roots.length === 0 ? (
            <div style={{ fontSize: 12.5, color: t.textFaint }}>No hay assets en la raíz.</div>
          ) : (
            <div style={{ maxHeight: 560, overflow: "auto" }}>
              {roots.map((node) => (
                <AssetNode key={node.pointName ?? node.shortName} node={node} depth={0} selectedPath={selected?.pointName} onSelect={setSelected} />
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Propiedades">
          <AssetProperties node={selected} />
        </Panel>
      </div>
    </>
  );
}
