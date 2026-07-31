/**
 * @deprecated 2026-07 · archivado en src/_deprecated/
 * Origen: src/pages/Components.jsx
 * Motivo: página de la plantilla original «aurora-dashboard»; llevaba tiempo comentada en NAV y se retiró del router.
 * Restaurar: receta completa en src/_deprecated/README.md
 * Revisar para borrado definitivo: 2026-Q4
 */
/**
 * pages/Components.jsx
 * ------------------------------------------------------------------
 * Kit de UI navegable: botones, campos de formulario, loaders
 * premium, alertas, tooltips, toasts y modales — todo en un solo
 * lugar como catálogo de referencia para el equipo de diseño/dev.
 */
import {
  Plus, Download, Check, Trash2, Search, Mail, User,
  CheckCircle2, XCircle, Info, MessageSquareWarning, ShieldAlert,
} from "lucide-react";
import { useTheme } from "@/theme";
import { useToast } from "@/app/providers";
import { useModal } from "@/app/providers";
import { useData } from "../providers/DataProvider.jsx";
import { useState } from "react";
import {
  Panel, SectionLabel, Button, Input, fieldStyle, Toggle, Checkbox, RadioOption,
  AlertBanner, HoverTip,
} from "../components/ui/index.js";
import {
  Spinner, DotsLoader, PulseDot, GradientRingLoader, OrbitLoader,
  CircularProgress, BarSweepLoader, ProgressBar, CardSkeleton,
} from "../components/ui/loaders/index.js";

export default function Components() {
  const { theme: t } = useTheme();
  const { pushToast } = useToast();
  const { openModal } = useModal();
  const { progress } = useData();
  const [plan, setPlan] = useState("pro");

  return (
    <>
      <SectionLabel>Botones</SectionLabel>
      <Panel style={{ marginBottom: 8 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <Button variant="primary" icon={<Plus size={14} />}>Crear proyecto</Button>
          <Button variant="secondary" icon={<Download size={14} />}>Exportar</Button>
          <Button variant="ghost">Cancelar</Button>
          <Button variant="success" icon={<Check size={14} />}>Aprobar</Button>
          <Button variant="danger" icon={<Trash2 size={14} />}>Eliminar</Button>
          <Button variant="primary" loading>Guardando</Button>
        </div>
      </Panel>

      <SectionLabel>Campos de formulario</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 8 }}>
        <Panel>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Input icon={<Search size={14} />} placeholder="Buscar componentes…" />
            <Input icon={<Mail size={14} />} placeholder="correo inválido" type="email" error="Ingresa un correo electrónico válido" />
            <Input icon={<User size={14} />} placeholder="nombre de usuario" success />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <Checkbox label="Recordarme" defaultChecked />
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12.5, color: t.textSoft }}>Notificaciones</span>
                <Toggle defaultOn />
              </div>
            </div>
          </div>
        </Panel>
        <Panel>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <div style={{ fontSize: 12, color: t.textFaint, marginBottom: 8, fontFamily: "'IBM Plex Mono', monospace" }}>plan de suscripción</div>
              <div style={{ display: "flex", gap: 18 }}>
                <RadioOption label="Básico" selected={plan === "basico"} onSelect={() => setPlan("basico")} />
                <RadioOption label="Pro" selected={plan === "pro"} onSelect={() => setPlan("pro")} />
                <RadioOption label="Equipo" selected={plan === "equipo"} onSelect={() => setPlan("equipo")} />
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: t.textFaint, marginBottom: 8, fontFamily: "'IBM Plex Mono', monospace" }}>mensaje</div>
              <textarea placeholder="Escribe una nota para el equipo…" rows={3} className="field" style={{ ...fieldStyle(t), resize: "vertical" }} />
            </div>
          </div>
        </Panel>
      </div>

      <SectionLabel>Loaders premium</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 8 }}>
        <Panel title="Spinner"><Spinner /></Panel>
        <Panel title="Dots"><DotsLoader /></Panel>
        <Panel title="Pulso en vivo"><PulseDot /></Panel>
        <Panel title="Anillo degradado"><GradientRingLoader /></Panel>
        <Panel title="Órbita"><OrbitLoader /></Panel>
        <Panel title="Progreso circular"><CircularProgress percent={progress} /></Panel>
        <Panel title="Barra con recorrido"><BarSweepLoader /></Panel>
        <Panel title="Barra de progreso"><ProgressBar percent={progress} /></Panel>
        <Panel title="Skeleton de tarjeta"><CardSkeleton /></Panel>
      </div>

      <SectionLabel>Alertas</SectionLabel>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 8 }}>
        <AlertBanner type="success" title="Cambios guardados" message="Los datos del proyecto se actualizaron correctamente." />
        <AlertBanner type="error" title="No se pudo guardar" message="Revisa tu conexión e inténtalo de nuevo en unos segundos." />
        <AlertBanner type="warning" title="Espacio de almacenamiento bajo" message="Te queda menos del 10% de espacio disponible en tu plan actual." />
        <AlertBanner type="info" title="Nueva actualización disponible" message="La versión 2.4 incluye mejoras de rendimiento en las gráficas." />
      </div>

      <SectionLabel>Tooltips, toasts y modales</SectionLabel>
      <Panel>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <Button variant="success" icon={<CheckCircle2 size={14} />} onClick={() => pushToast("success", "Operación completada con éxito")}>Toast de éxito</Button>
          <Button variant="danger" icon={<XCircle size={14} />} onClick={() => pushToast("error", "Ocurrió un error al procesar la solicitud")}>Toast de error</Button>
          <Button variant="secondary" icon={<Info size={14} />} onClick={() => pushToast("info", "Tienes cambios sin guardar")}>Toast informativo</Button>
          <Button variant="primary" icon={<MessageSquareWarning size={14} />} onClick={() => openModal("confirm")}>Modal de confirmación</Button>
          <Button variant="danger-solid" icon={<ShieldAlert size={14} />} onClick={() => openModal("danger")}>Modal de eliminación</Button>
          <HoverTip label="Este botón solo es una demostración">
            <span style={{ padding: "9px 16px", borderRadius: 9, border: `1px dashed ${t.border}`, fontSize: 13, color: t.textFaint, cursor: "help" }}>pasa el cursor aquí</span>
          </HoverTip>
        </div>
      </Panel>
    </>
  );
}
