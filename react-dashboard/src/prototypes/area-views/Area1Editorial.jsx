/** prototypes/area-views/Area1Editorial.jsx — Vista temporal: Panel Editorial aplicado a Área 1. Ver AreaVariantView.jsx. */
import { AreaVariantView } from "./AreaVariantView.jsx";

export default function Area1Editorial({ onNavigate }) {
  return <AreaVariantView areaId="area1" variant="editorial" onNavigate={onNavigate} />;
}
