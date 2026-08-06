/** prototypes/area-views/Area1Neon.jsx — Vista temporal: Neon Cyber HUD aplicado a Área 1. Ver AreaVariantView.jsx. */
import { AreaVariantView } from "./AreaVariantView.jsx";

export default function Area1Neon({ onNavigate }) {
  return <AreaVariantView areaId="area1" variant="neon" onNavigate={onNavigate} />;
}
