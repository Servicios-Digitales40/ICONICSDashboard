/**
 * Vista «Assets» de Demo EVA — el explorador, anclado al árbol de la demo.
 *
 * El explorador es genérico y vive en `components/assets/ExploradorAssets.jsx`;
 * aquí sólo se le fija la raíz. Se extrajo cuando lo compartían dos secciones y
 * se quedó donde está: no sabe de esta instalación ni de ninguna.
 *
 * ── POR QUÉ ANCLADO, Y POR QUÉ CON SALIDA ──────────────────────────
 *
 * Anclado, porque `ac:` lista todo el servidor —Compresores, Robots, Energía,
 * las plantas 0300 a 9610— y para una demo del sistema de agua eso es una
 * pantalla de ruido con lo que interesa escondido a tres niveles.
 *
 * Con salida, porque esta vista es la herramienta de diagnóstico: cuando una
 * señal no cuadra, la pregunta siguiente suele estar fuera de la carpeta de la
 * demo. El botón cambia la raíz sin salir de la vista.
 *
 * ── LO QUE ESTA VISTA ENSEÑA Y LA DE PLANTA NO ─────────────────────
 *
 * El valor crudo, sin banda, sin estado derivado y sin rótulo nuestro. Es el
 * único sitio de Demo EVA donde `INDICE_DESVIACION_VOLTAJE` se llama por su
 * nombre y no «Tensión de línea», y donde se puede comprobar la calidad de cada
 * punto una por una. Por eso no lleva ninguno de los avisos de procedencia de
 * la vista de Planta: aquí no hay nada derivado que advertir.
 */
import { useState } from "react";
import { CornerLeftUp, FolderTree } from "lucide-react";

import { ExploradorAssets, RAIZ_ASSETS } from "@/components/assets/ExploradorAssets.jsx";
import { SectionLabel } from "@/components/ui/index.js";
import { useTheme } from "@/theme";

import { RAIZ } from "../../domain/senales.js";

export default function AssetsEva() {
  const { theme: t } = useTheme();
  const [raiz, setRaiz] = useState(RAIZ);

  const enDemo = raiz === RAIZ;

  return (
    <>
      <SectionLabel sub="Los ocho puntos de la demo, con su valor y su calidad en crudo">
        Assets · Demo EVA
      </SectionLabel>

      <ExploradorAssets
        raiz={raiz}
        titulo={enDemo ? "Sensores de la demo" : "Árbol completo"}
        acciones={
          <button
            onClick={() => setRaiz(enDemo ? RAIZ_ASSETS : RAIZ)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "5px 11px", borderRadius: 9, cursor: "pointer",
              border: `1px solid ${t.border}`, background: t.panel, color: t.textSoft,
              fontSize: 11.5, fontWeight: 600, fontFamily: "'Inter', sans-serif",
            }}
          >
            {enDemo ? <FolderTree size={13} /> : <CornerLeftUp size={13} />}
            {enDemo ? "Ver todo el árbol" : "Volver a la demo"}
          </button>
        }
      />
    </>
  );
}
