/**
 * @deprecated 2026-07 · archivado en src/_deprecated/
 * Origen: src/pages/Settings.jsx
 * Motivo: página de la plantilla original «aurora-dashboard»; llevaba tiempo comentada en NAV y se retiró del router.
 * Restaurar: receta completa en src/_deprecated/README.md
 * Revisar para borrado definitivo: 2026-Q4
 */
/**
 * pages/Settings.jsx
 * ------------------------------------------------------------------
 * Página de configuración: tarjeta de perfil, preferencias con
 * toggles, y una "zona de peligro" que abre el modal de eliminación.
 */
import { User, Trash2 } from "lucide-react";
import { useTheme } from "@/theme";
import { useToast } from "@/app/providers";
import { useModal } from "@/app/providers";
import { Panel, Avatar, Button, Toggle } from "../components/ui/index.js";

const PREFERENCES = [
  { key: "email", label: "Notificaciones por correo", desc: "Recibe un resumen semanal de actividad.", on: true },
  { key: "push", label: "Notificaciones push", desc: "Alertas en tiempo real en el navegador.", on: false },
  { key: "compact", label: "Modo compacto", desc: "Reduce el espaciado de las tablas y listas.", on: false },
];

export default function Settings() {
  const { theme: t } = useTheme();
  const { pushToast } = useToast();
  const { openModal } = useModal();

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: 16 }}>
      <Panel title="Perfil">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "10px 0 6px" }}>
          <Avatar name="Ana Torres" size={64} />
          <div style={{ fontSize: 15.5, fontWeight: 700, color: t.text, marginTop: 12, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Ana Torres</div>
          <div style={{ fontSize: 12.5, color: t.textFaint, marginTop: 2 }}>ana.torres@empresa.com</div>
          <span style={{ marginTop: 10, fontSize: 11.5, fontWeight: 700, color: t.accent, background: t.accentSoft, padding: "4px 12px", borderRadius: 999 }}>Plan Pro</span>
          <div style={{ marginTop: 16 }}>
            <Button variant="secondary" icon={<User size={14} />} onClick={() => pushToast("info", "Editor de perfil abierto")}>Editar perfil</Button>
          </div>
        </div>
      </Panel>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Panel title="Preferencias" code="notificaciones y apariencia">
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {PREFERENCES.map((row, i) => (
              <div key={row.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: i < PREFERENCES.length - 1 ? 14 : 0, borderBottom: i < PREFERENCES.length - 1 ? `1px solid ${t.border}` : "none" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{row.label}</div>
                  <div style={{ fontSize: 12, color: t.textFaint, marginTop: 2 }}>{row.desc}</div>
                </div>
                <Toggle defaultOn={row.on} />
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Zona de peligro" style={{ border: `1px solid ${t.coral}44` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>Eliminar cuenta</div>
              <div style={{ fontSize: 12, color: t.textFaint, marginTop: 2 }}>Se eliminarán todos tus datos de forma permanente.</div>
            </div>
            <Button variant="danger-solid" icon={<Trash2 size={14} />} onClick={() => openModal("danger")}>Eliminar</Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}
