/**
 * Servicios de UI a nivel de aplicación.
 *
 * Cada provider vive junto a su hook (`ToastProvider` y `useToast`): separarlos
 * obligaría a un tercer archivo solo para el objeto Context, o habría ciclo.
 *
 * `Toast.jsx` y `Modal.jsx` están aquí y no en `components/ui/` porque no son
 * primitivas reutilizables, sino los hosts singleton cableados a su contexto.
 * Así `src/components/` queda como hoja pura del grafo.
 *
 * El tema no está aquí: vive en `@/theme` con sus tokens, porque es parte del
 * sistema de diseño y no un servicio de UI.
 */
export { ToastProvider, useToast } from "./ToastProvider.jsx";
export { ModalProvider, useModal } from "./ModalProvider.jsx";
export { Modal } from "./Modal.jsx";
