/** prototypes/area-views/Area2Editorial.jsx — Vista temporal: Panel Editorial aplicado a Área 2. Ver AreaVariantView.jsx. */
import { AreaVariantView } from "./AreaVariantView.jsx";

export default function Area2Editorial({ onNavigate }) {
  return <AreaVariantView areaId="area2" variant="editorial" onNavigate={onNavigate} />;
}
