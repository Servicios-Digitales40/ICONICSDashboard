/**
 * Explorador de Assets de AssetWorX (espacio de nombres `ac:`).
 *
 * La herramienta con la que se diagnostica un «falta un dato en el panel»:
 * navegando el árbol y leyendo la propiedad en vivo.
 *
 * El explorador en sí vive en `../components/ExploradorAssets.jsx` desde que
 * Demo EVA necesitó el mismo componente anclado a otra raíz. Esta vista es lo
 * que era antes de extraerlo: el árbol completo, desde `ac:`.
 */
import { SectionLabel } from "@/components/ui/index.js";

import { ExploradorAssets, RAIZ_ASSETS } from "../components/ExploradorAssets.jsx";

export default function Assets() {
  return (
    <>
      <SectionLabel sub="Explora la jerarquía de AssetWorX (ac:) y lee las propiedades en vivo">
        Assets
      </SectionLabel>

      <ExploradorAssets raiz={RAIZ_ASSETS} />
    </>
  );
}
