/**
 * Dictado por voz, con la Web Speech API del navegador.
 *
 * ── POR QUÉ NAVEGADOR Y NO SERVIDOR ─────────────────────────────────
 *
 * El backend de este proyecto es un único `llama-server` con `--parallel 1`
 * sobre una GPU (ver `useAsistente.js`): añadir transcripción ahí competiría
 * por el mismo hardware que ya tarda 30-90 s en responder texto. La API del
 * navegador no toca ese servidor en absoluto — transcribe localmente o contra
 * el servicio de voz del propio navegador, nunca contra `IA_BASE` — así que
 * dictar no alarga ni compite con la cola de preguntas.
 *
 * La contrapartida es honesta y hay que decirla: el soporte no es universal
 * (sólido en Chrome/Edge, ausente en Firefox, limitado en Safari). Por eso
 * `soportado` existe — quien monta este hook oculta el botón entero cuando es
 * `false`, en vez de mostrar un micrófono que no responde.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export function useDictado({ lang = "es-MX", onResultado } = {}) {
  const [soportado] = useState(
    () => typeof window !== "undefined" && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
  );
  const [escuchando, setEscuchando] = useState(false);
  const reconocedorRef = useRef(null);

  useEffect(() => () => reconocedorRef.current?.stop(), []);

  const detener = useCallback(() => {
    reconocedorRef.current?.stop();
  }, []);

  const alternar = useCallback(() => {
    if (!soportado) return;
    if (escuchando) {
      detener();
      return;
    }

    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    const reconocedor = new Ctor();
    reconocedor.lang = lang;
    reconocedor.interimResults = true;
    // Una pregunta es una frase, no una sesión de dictado continuo: se
    // detiene sola en el primer silencio, como cualquier campo de este panel.
    reconocedor.continuous = false;

    reconocedor.onresult = (evento) => {
      const ultimo = evento.results[evento.results.length - 1];
      const texto = Array.from(evento.results).map((r) => r[0].transcript).join(" ");
      onResultado?.(texto.trim(), ultimo.isFinal);
    };
    // Un error de reconocimiento no es un error que enseñar aquí: el campo de
    // texto sigue intacto y se puede escribir a mano, que es la vía normal.
    reconocedor.onerror = () => setEscuchando(false);
    reconocedor.onend = () => setEscuchando(false);

    reconocedorRef.current = reconocedor;
    setEscuchando(true);
    reconocedor.start();
  }, [soportado, escuchando, lang, onResultado, detener]);

  return { soportado, escuchando, alternar };
}
