/**
 * Componentes privados del feature Data.
 *
 * No son primitivas reutilizables: son específicos del dominio ICONICS y cada
 * uno hace su propio polling contra `@/lib/iconics`, así que viven aquí y no
 * en `components/ui/`.
 */
export { IconicsLiveCard } from "./IconicsLiveCard.jsx";
export { IconicsProductsList } from "./IconicsProductsList.jsx";
export { IconicsProductsTable } from "./IconicsProductsTable.jsx";
