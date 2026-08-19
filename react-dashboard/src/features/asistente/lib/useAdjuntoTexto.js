/**
 * Adjuntar un documento de texto a la pregunta.
 *
 * ── POR QUÉ SÓLO .txt/.csv/.md, Y POR QUÉ SE TRUNCA ─────────────────
 *
 * El modelo que responde hoy es texto-solo (ver `useAsistente.js`) y el
 * endpoint del chat sólo acepta `{ pregunta, historial }` — no hay forma de
 * mandarle una imagen ni un PDF de verdad, así que ofrecer ese botón sería
 * una promesa que el backend no cumple. Un documento de texto SÍ se puede
 * leer en el propio navegador y sumarse a la pregunta como contexto: eso es
 * real hoy, sin tocar el servidor.
 *
 * `chatRoutes.mjs` rechaza cualquier `pregunta` de más de 2000 caracteres.
 * `MAX_ADJUNTO_CHARS` dejaba margen de sobra para la pregunta propia; sin él,
 * adjuntar un documento de tamaño normal tumbaría el envío con un 400 que
 * nadie vería venir.
 */
import { useCallback, useState } from "react";

const EXTENSIONES_ACEPTADAS = ["txt", "csv", "md"];
const MAX_TAMANO_BYTES = 200 * 1024;
export const MAX_ADJUNTO_CHARS = 1200;

export function useAdjuntoTexto() {
  const [adjunto, setAdjunto] = useState(null); // { nombre, texto, truncado }
  const [error, setError] = useState(null);

  const cargar = useCallback(async (archivo) => {
    setError(null);

    const extension = archivo.name.split(".").pop()?.toLowerCase();
    if (!EXTENSIONES_ACEPTADAS.includes(extension)) {
      setError(`Sólo se lee .${EXTENSIONES_ACEPTADAS.join(", .")} por ahora — el modelo de hoy no ve imágenes ni PDF.`);
      return;
    }
    if (archivo.size > MAX_TAMANO_BYTES) {
      setError("El archivo pesa más de 200 KB.");
      return;
    }

    const texto = await archivo.text();
    const truncado = texto.length > MAX_ADJUNTO_CHARS;
    setAdjunto({ nombre: archivo.name, texto: texto.slice(0, MAX_ADJUNTO_CHARS), truncado });
  }, []);

  const quitar = useCallback(() => {
    setAdjunto(null);
    setError(null);
  }, []);

  return { adjunto, error, cargar, quitar };
}

/** La pregunta con el documento adjunto delante, como contexto citado. */
export function conAdjunto(pregunta, adjunto) {
  if (!adjunto) return pregunta;
  return `Documento adjunto «${adjunto.nombre}»${adjunto.truncado ? " (recortado)" : ""}:\n${adjunto.texto}\n\n---\n\n${pregunta}`;
}
