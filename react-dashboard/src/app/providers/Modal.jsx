/**
 * ui/Modal.jsx
 * ------------------------------------------------------------------
 * Modal genérico controlado por ModalContext. Se monta UNA vez en
 * App.jsx y lee `modalType` para decidir qué variante mostrar
 * ("confirm" | "danger"). Cerrar: clic en el fondo, la X o los botones.
 */
import { ShieldAlert, MessageSquareWarning } from "lucide-react";
import { useTheme } from "@/theme";
import { useModal } from "./ModalProvider.jsx";
import { Button } from "@/components/ui/index.js";

export function Modal() {
  const { theme: t } = useTheme();
  const { modalType, closeModal } = useModal();

  if (!modalType) return null;
  const isDanger = modalType === "danger";

  return (
    <div
      className="modal-overlay"
      style={{ position: "fixed", inset: 0, background: t.overlay, backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
      onClick={closeModal}
    >
      <div
        className="modal-pop"
        style={{ background: t.panel, borderRadius: 16, padding: "24px 24px 20px", width: 380, boxShadow: t.shadowHover, border: `1px solid ${t.border}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 18 }}>
          <span
            style={{
              width: 42, height: 42, borderRadius: 12, background: isDanger ? t.gradWarm : t.gradAccent,
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              boxShadow: `0 6px 16px ${isDanger ? t.coral : t.accent}40`,
            }}
          >
            {isDanger ? <ShieldAlert size={20} color="#fff" /> : <MessageSquareWarning size={20} color="#fff" />}
          </span>
          <div>
            <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 700, color: t.text, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              {isDanger ? "Eliminar elemento" : "Confirmar cambios"}
            </h3>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: t.textSoft, lineHeight: 1.5 }}>
              {isDanger
                ? "Esta acción no se puede deshacer. Se eliminarán todos los datos asociados."
                : "¿Deseas guardar los cambios realizados? Los paneles se actualizarán al instante."}
            </p>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <Button variant="ghost" onClick={closeModal}>Cancelar</Button>
          <Button variant={isDanger ? "danger-solid" : "primary"} onClick={closeModal}>
            {isDanger ? "Eliminar" : "Guardar cambios"}
          </Button>
        </div>
      </div>
    </div>
  );
}
