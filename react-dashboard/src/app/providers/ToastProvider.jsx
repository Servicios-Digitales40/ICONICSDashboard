/**
 * context/ToastContext.jsx
 * ------------------------------------------------------------------
 * Sistema global de notificaciones "toast" (las burbujas que aparecen
 * arriba a la derecha y se autodestruyen a los pocos segundos).
 *
 * Cualquier componente puede disparar una desde cualquier parte del
 * árbol sin pasar callbacks a mano:
 *
 *   const { pushToast } = useToast();
 *   pushToast("success", "Cambios guardados");
 *
 * El contenedor visual (<ToastContainer>) se monta una sola vez aquí
 * mismo, así que no hay que acordarse de renderizarlo en cada página.
 */
import { createContext, useContext, useRef, useState } from "react";
import { ToastContainer } from "./Toast.jsx";

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);

  function pushToast(type, message, duration = 3200) {
    const id = ++nextId.current;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => removeToast(id), duration);
  }

  function removeToast(id) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <ToastContext.Provider value={{ pushToast }}>
      {children}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast() debe usarse dentro de <ToastProvider>");
  return ctx;
}
