/**
 * app/providers/index.js — servicios de UI a nivel de aplicación.
 *
 * Cada provider vive junto a su hook (`ToastProvider` + `useToast`) a
 * propósito: separarlos obligaría a un tercer archivo solo para el objeto
 * Context —si no, hay ciclo— y serían 3 archivos donde hoy hay 1.
 *
 * `Toast.jsx` y `Modal.jsx` viven aquí y no en `components/ui/` porque no son
 * primitivas reutilizables: son los *hosts* singleton cableados a su contexto
 * (`Modal` llama a `useModal()`; `ToastContainer` lo monta `ToastProvider`).
 * Moverlos aquí eliminó las únicas aristas `components/ → context/` y dejó
 * `src/components/` como hoja pura del grafo.
 *
 * El tema NO está aquí: vive en `@/theme` con sus tokens, porque es una
 * pieza del sistema de diseño y no un servicio de UI.
 */
export { ToastProvider, useToast } from "./ToastProvider.jsx";
export { ModalProvider, useModal } from "./ModalProvider.jsx";
export { Modal } from "./Modal.jsx";
