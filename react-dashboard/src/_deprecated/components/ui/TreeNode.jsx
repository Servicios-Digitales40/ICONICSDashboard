/**
 * @deprecated 2026-07 · archivado en src/_deprecated/
 * Origen: src/components/ui/TreeNode.jsx
 * Motivo: primitiva del kit sin ningún consumidor vivo tras archivar las páginas de la plantilla.
 * Restaurar: receta completa en src/_deprecated/README.md
 * Revisar para borrado definitivo: 2026-Q4
 */
/**
 * ui/TreeNode.jsx
 * ------------------------------------------------------------------
 * Nodo de árbol de archivos, recursivo: se renderiza a sí mismo por
 * cada hijo. `depth` controla la sangría visual.
 */
import { useState } from "react";
import { Folder, FolderOpen, FileText, FileCode, FileImage, ChevronRight, ChevronDown, HardDrive } from "lucide-react";
import { useTheme } from "@/theme";

export function TreeNode({ node, depth = 0 }) {
  const { theme: t } = useTheme();
  const [open, setOpen] = useState(depth < 1);
  const isFolder = node.type === "folder" || node.type === "drive";
  const icons = {
    code: <FileCode size={14} color={t.accent} />,
    image: <FileImage size={14} color={t.amber} />,
    doc: <FileText size={14} color={t.textFaint} />,
  };

  return (
    <div>
      <div
        onClick={() => isFolder && setOpen((o) => !o)}
        style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: depth * 16, padding: "4px 6px", cursor: isFolder ? "pointer" : "default", borderRadius: 5, userSelect: "none" }}
        onMouseEnter={(e) => (e.currentTarget.style.background = t.hover)}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        {isFolder ? (
          <span style={{ display: "flex", width: 13 }}>{open ? <ChevronDown size={12} color={t.textFaint} /> : <ChevronRight size={12} color={t.textFaint} />}</span>
        ) : (
          <span style={{ width: 13 }} />
        )}
        {node.type === "drive" ? (
          <HardDrive size={13.5} color={t.accent} />
        ) : isFolder ? (
          open ? <FolderOpen size={13.5} color={t.accent} /> : <Folder size={13.5} color={t.accent} />
        ) : (
          icons[node.type]
        )}
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: isFolder ? t.text : t.textSoft, fontWeight: isFolder ? 600 : 400 }}>
          {node.name}
        </span>
      </div>
      {isFolder && open && node.children && (
        <div>
          {node.children.map((child, i) => <TreeNode key={i} node={child} depth={depth + 1} />)}
        </div>
      )}
    </div>
  );
}
