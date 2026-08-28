/**
 * Vista «Controles» del SISTEMA DE VIBRACIONES — todavía sin construir.
 *
 * ── POR QUÉ ESTE PLACEHOLDER NO LLEVA NI UN BOTÓN ──────────────────
 *
 * Porque el otro placeholder de esta sección —«Vista 3D»— enseñaría un dato
 * de menos si se equivocara, y éste ESCRIBIRÍA EN EL PLC. Un botón de encendido
 * puesto «para ver cómo queda» tiene dos finales, y los dos son malos: si no
 * hace nada, enseña a pulsar botones que no responden —y el día que responda,
 * nadie se lo tomará en serio—; y si hace algo, esta pantalla arrancó
 * un motor sin que nadie revisara sus guardas.
 *
 * La estación de llenado tiene su «Controles» funcionando, y no es un botón:
 * hereda del backend el modo solo lectura, el corte por nivel de tanque alto
 * y la confirmación por relectura, más una confirmación de dos pasos en el
 * propio botón. Ver `ControlesEva.jsx` y `backend/routes/controlRoutes.mjs`.
 * Nada de eso existe todavía para esta máquina.
 *
 * ── QUÉ HACE FALTA PARA CONSTRUIRLA ────────────────────────────────
 *
 *   · El TAG de escritura de este PLC, y confirmar que acepta la orden. Los
 *     de la estación de llenado están bajo `ac:TDCON/DEMO/SENSORES/CONTROL`;
 *     los de esta máquina viven en otro árbol y no están comprobados.
 *   · Sus GUARDAS, y son suyas: el corte por nivel de tanque no significa
 *     nada aquí. Lo que protege a un motor con acelerómetros es otra cosa
 *     —régimen mínimo, vibración en zona D—, y decidirlo es el trabajo, no
 *     el botón.
 *   · Relectura de confirmación. Escribir y creerse el éxito de la escritura
 *     es la diferencia entre «se apagó» y «se mandó apagar».
 */
import { Power, Waves } from "lucide-react";

import { AlertBanner } from "@/components/ui/index.js";
import { useTheme } from "@/theme";

/**
 * Lo que falta, dicho en la pantalla y no sólo en el código.
 *
 * Va escrito aquí porque un «próximamente» a secas deja creer que lo único
 * que falta es dibujar el botón, y lo que falta es todo lo que hay detrás.
 */
const PENDIENTE = [
  {
    titulo: "El tag de escritura, comprobado",
    porque:
      "Este PLC no es el de la estación de llenado y sus puntos de control viven en otro " +
      "árbol. Hasta que una escritura de prueba responda, no hay nada que un botón pueda mandar.",
  },
  {
    titulo: "Las guardas de ESTA máquina",
    porque:
      "Las del tanque no sirven: cortar por nivel alto no significa nada en un motor con " +
      "acelerómetros. Lo que lo protege es otra cosa, y decidir qué es el trabajo de verdad.",
  },
  {
    titulo: "Relectura de confirmación",
    porque:
      "Dar por buena una escritura porque el servidor contestó 200 es la diferencia entre " +
      "«se apagó» y «se mandó apagar». La estación de llenado ya relee; aquí haría falta igual.",
  },
];

function ControlesVibraciones({ onNavigate }) {
  const { theme: t } = useTheme();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <AlertBanner
        type="warning"
        title="Esta vista todavía no está construida"
        message={
          "Aquí vivirán el encendido y el apagado de esta máquina"
        }
      />

      <div
        style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", gap: 14, padding: "48px 24px",
          borderRadius: 12, border: `1px dashed ${t.border}`, background: t.panel,
        }}
      >
        <Power size={40} color={t.textFaint} strokeWidth={1.25} />
        <div style={{ fontSize: 15, fontWeight: 700, color: t.text }}>
          Encendido y apagado del sistema de vibraciones
        </div>

        <button
          type="button"
          onClick={() => onNavigate?.("eva-vibraciones")}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "9px 16px", borderRadius: 8, cursor: "pointer",
            fontSize: 13, fontWeight: 600,
            border: `1px solid ${t.accent}`, background: t.accentSoft, color: t.accent,
          }}
        >
          <Waves size={15} />
          Ver las medidas de la máquina
        </button>
      </div>

    </div>
  );
}

export default ControlesVibraciones;
