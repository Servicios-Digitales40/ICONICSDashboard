/** prototypes/area-views/Area2Neon.jsx — Vista temporal: Neon Cyber HUD aplicado a Área 2. Ver AreaVariantView.jsx. */
import { AreaVariantView } from "./AreaVariantView.jsx";

export default function Area2Neon({ onNavigate }) {
  return <AreaVariantView areaId="area2" variant="neon" onNavigate={onNavigate} />;
}
