/**
 * Estado del asistente: disponibilidad, conversación y el flujo de una
 * respuesta en curso.
 *
 * ── POR QUÉ NO ES UNA BANDERA DE BUILD ─────────────────────────────
 *
 * Que el asistente exista o no lo decide el SERVIDOR, con `IA_BASE`. El
 * frontend lo pregunta al arrancar. Una bandera de compilación obligaría a
 * recompilar el bundle para encender o apagar el chat en una instalación
 * concreta, y el mismo `dist` tiene que poder servir a una planta con modelo
 * y a otra sin él.
 *
 * ── POR QUÉ SE LEE COMO FLUJO ──────────────────────────────────────
 *
 * Una respuesta tarda entre 30 y 90 segundos con el modelo que corre en el
 * servidor. Sin ir pintando los estados y los tokens conforme llegan, la
 * pantalla queda muerta minuto y medio y el operador vuelve a pulsar.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE ?? (import.meta.env.DEV ? "http://localhost:3001" : "");

/** Mensaje del asistente aún vacío, al que se le van pegando los deltas. */
const nuevoTurno = () => ({
  rol: "asistente",
  texto: "",
  herramienta: null,
  bloqueada: false,
  error: null,
});

/**
 * Los turnos anteriores que se le recuerdan al modelo.
 *
 * Se manda el TEXTO y nada más: ni la herramienta que se usó ni su resultado.
 * Devolverle el JSON de consultas pasadas le invita a mezclarlo con la
 * pregunta nueva y a citar la cifra del turno anterior como si fuera la de
 * este. El texto basta para entender el hilo y no se confunde con un dato
 * recién leído.
 *
 * Quedan fuera dos clases de turno, y por el mismo motivo: son turnos en los
 * que **decidimos no dar una respuesta**, así que recordarlos como si la
 * hubiéramos dado es contradecirse.
 *
 *  - Los bloqueados, donde el modelo intentó recitar de memoria.
 *  - Los que acabaron en error.
 *
 * El recorte por número de turnos lo hace el servidor, que es quien sabe lo
 * que cuesta cada uno.
 */
function historialParaEnviar(mensajes) {
  return mensajes
    .filter((m) => m.texto?.trim() && !m.bloqueada && !m.error)
    .map((m) => ({ rol: m.rol, texto: m.texto }));
}

export function useAsistente() {
  const [disponible, setDisponible] = useState(null);   // null = comprobando
  const [mensajes, setMensajes] = useState([]);
  const [estado, setEstado] = useState(null);           // "Consultando ICONICS…"
  const [ocupado, setOcupado] = useState(false);

  const abortador = useRef(null);
  const vivo = useRef(true);

  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
      abortador.current?.abort();
    };
  }, []);

  /* ── ¿Hay asistente en este servidor? ──────────────────────────── */
  useEffect(() => {
    let cancelado = false;

    fetch(`${API_BASE}/api/chat`)
      .then((r) => r.json())
      .then((r) => { if (!cancelado) setDisponible(Boolean(r?.habilitado)); })
      // Un backend viejo no conoce la ruta y responde con el index.html; eso
      // es «no hay asistente», no un error que enseñar.
      .catch(() => { if (!cancelado) setDisponible(false); });

    return () => { cancelado = true; };
  }, []);

  /** Aplica un cambio al último mensaje, que siempre es el turno en curso. */
  const actualizarUltimo = useCallback((cambio) => {
    setMensajes((previos) => {
      if (!previos.length) return previos;
      const copia = [...previos];
      const ultimo = copia[copia.length - 1];
      copia[copia.length - 1] = { ...ultimo, ...cambio(ultimo) };
      return copia;
    });
  }, []);

  const cancelar = useCallback(() => {
    abortador.current?.abort();
    abortador.current = null;
    setOcupado(false);
    setEstado(null);
    actualizarUltimo((m) => ({
      texto: m.texto,
      error: m.texto ? null : "Consulta cancelada.",
    }));
  }, [actualizarUltimo]);

  const preguntar = useCallback(
    async (pregunta) => {
      const limpia = String(pregunta ?? "").trim();
      if (!limpia || ocupado) return;

      const control = new AbortController();
      abortador.current = control;

      // El hilo se toma ANTES de añadir el turno nuevo, que aún está vacío.
      const historial = historialParaEnviar(mensajes);

      setMensajes((previos) => [...previos, { rol: "usuario", texto: limpia }, nuevoTurno()]);
      setOcupado(true);
      setEstado("Enviando…");

      try {
        const respuesta = await fetch(`${API_BASE}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pregunta: limpia, historial }),
          signal: control.signal,
        });

        // 409 (otra consulta en curso), 503 (sin configurar), 400… todos
        // llegan como JSON con su motivo, y ese motivo se enseña tal cual.
        if (!respuesta.ok) {
          const cuerpo = await respuesta.json().catch(() => ({}));
          throw new Error(cuerpo?.error ?? `El asistente respondió ${respuesta.status}.`);
        }

        await leerFlujo(respuesta, {
          onEstado: (valor) => vivo.current && setEstado(valor),
          onTexto: (delta) => actualizarUltimo((m) => ({ texto: m.texto + delta })),
          onHerramienta: (nombre) => actualizarUltimo(() => ({ herramienta: nombre })),
          onFin: (fin) => actualizarUltimo(() => ({ bloqueada: Boolean(fin.bloqueada) })),
          onError: (mensaje) => actualizarUltimo(() => ({ error: mensaje })),
        });
      } catch (error) {
        // Abortar es una decisión del usuario, no un fallo que reportar.
        if (error?.name !== "AbortError" && vivo.current) {
          actualizarUltimo(() => ({ error: error.message }));
        }
      } finally {
        if (vivo.current) {
          setOcupado(false);
          setEstado(null);
        }
        abortador.current = null;
      }
    },
    [ocupado, mensajes, actualizarUltimo]
  );

  const limpiar = useCallback(() => {
    if (ocupado) return;
    setMensajes([]);
  }, [ocupado]);

  return { disponible, mensajes, estado, ocupado, preguntar, cancelar, limpiar };
}

/**
 * Lee el flujo de eventos del servidor.
 *
 * Se hace a mano en vez de con `EventSource` porque este flujo va en la
 * respuesta de un POST —la pregunta viaja en el cuerpo— y `EventSource` solo
 * sabe hacer GET.
 */
async function leerFlujo(respuesta, manejadores) {
  const lector = respuesta.body?.getReader();
  if (!lector) return;

  const decodificador = new TextDecoder();
  let resto = "";

  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;

    resto += decodificador.decode(value, { stream: true });
    const bloques = resto.split("\n\n");
    resto = bloques.pop() ?? "";

    for (const bloque of bloques) {
      const linea = bloque.split("\n").find((l) => l.startsWith("data:"));
      if (!linea) continue;

      let evento;
      try {
        evento = JSON.parse(linea.slice(5).trim());
      } catch {
        continue;   // un bloque a medias no tumba la respuesta entera
      }

      if (evento.tipo === "estado") manejadores.onEstado(evento.valor);
      else if (evento.tipo === "texto") manejadores.onTexto(evento.delta);
      else if (evento.tipo === "herramienta") manejadores.onHerramienta(evento.nombre);
      else if (evento.tipo === "fin") manejadores.onFin(evento);
      else if (evento.tipo === "error") manejadores.onError(evento.mensaje);
    }
  }
}

/** Nombre técnico de la herramienta → lo que se le enseña al operador. */
export const ETIQUETA_HERRAMIENTA = {
  listar_maquinas: "Consultó el catálogo de máquinas",
  estado_de_planta: "Leyó la planta entera de ICONICS",
  estado_actual: "Leyó el estado en vivo de ICONICS",
  datos_de_maquina: "Leyó el historiador",
  comparar_periodos: "Comparó dos períodos del historiador",
};
