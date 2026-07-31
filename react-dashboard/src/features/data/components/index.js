/**
 * features/data/components/index.js — componentes privados del feature Data.
 *
 * No son primitivas reutilizables: son específicos del dominio ICONICS y
 * cada uno hace su propio polling contra `@/lib/iconics`. Por eso viven aquí
 * y no en `components/ui/`, aunque antes estuvieran allí.
 */
export { IconicsLiveCard } from "./IconicsLiveCard.jsx";
export { IconicsProductsList } from "./IconicsProductsList.jsx";
export { IconicsProductsTable } from "./IconicsProductsTable.jsx";
