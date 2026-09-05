import { useEffect, useState } from "react";

export function usePreferenciaLocal(clave, inicial) {
  const [valor, setValor] = useState(() => {
    try {
      const guardado = localStorage.getItem(clave);
      return guardado === null ? inicial : JSON.parse(guardado);
    } catch {
      return inicial;
    }
  });
  useEffect(() => {
    try { localStorage.setItem(clave, JSON.stringify(valor)); } catch { /* almacenamiento opcional */ }
  }, [clave, valor]);
  return [valor, setValor];
}

export function idDeMensaje(mensaje, indice) {
  return mensaje.id ?? `${indice}-${mensaje.rol}-${String(mensaje.texto ?? "").slice(0, 32)}`;
}

export function resumirRespuesta(texto) {
  const limpio = String(texto ?? "").replace(/[#*_`>\[\]]/g, "").replace(/\s+/g, " ").trim();
  if (limpio.length <= 190) return limpio;
  const corte = limpio.slice(0, 190);
  const final = Math.max(corte.lastIndexOf(". "), corte.lastIndexOf("; "));
  return `${corte.slice(0, final > 90 ? final + 1 : 187).trim()}…`;
}
