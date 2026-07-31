/**
 * Controla qué modal está abierto en cada momento.
 *
 * Se maneja como un identificador de texto ("confirm", "danger", …) en vez de
 * un booleano por modal, así solo puede haber uno abierto a la vez y añadir
 * tipos nuevos es inmediato.
 *
 *   const { openModal } = useModal();
 *   <button onClick={() => openModal("danger")}>Eliminar</button>
 */
import { createContext, useContext, useState } from "react";

const ModalContext = createContext(null);

export function ModalProvider({ children }) {
  const [modalType, setModalType] = useState(null);

  const openModal = (type) => setModalType(type);
  const closeModal = () => setModalType(null);

  return (
    <ModalContext.Provider value={{ modalType, openModal, closeModal }}>
      {children}
    </ModalContext.Provider>
  );
}

export function useModal() {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error("useModal() debe usarse dentro de <ModalProvider>");
  return ctx;
}
