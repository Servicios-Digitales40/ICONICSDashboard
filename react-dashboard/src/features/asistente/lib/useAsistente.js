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
  argumentos: null,
  bloqueada: false,
  sinRespuesta: false,
  cancelado: false,
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
 * Quedan fuera tres clases de turno, y por el mismo motivo: son turnos en los
 * que **no llegó a haber respuesta**, así que recordarlos como si la hubiera
 * habido es contradecirse.
 *
 *  - Los bloqueados, donde el modelo intentó recitar de memoria.
 *  - Los que acabaron en error.
 *  - Los cancelados. Aunque hubieran alcanzado a escribir media frase: una
 *    respuesta cortada por la mitad acaba a menudo dentro de una cifra («el
 *    OEE fue del 6»), y esa cifra a medias es justo lo que el modelo citaría
 *    en el turno siguiente como si fuera un dato.
 *
 * El recorte por número de turnos lo hace el servidor, que es quien sabe lo
 * que cuesta cada uno.
 */
function historialParaEnviar(mensajes) {
  return mensajes
    .filter((m) => m.texto?.trim() && !m.bloqueada && !m.error && !m.cancelado)
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

  /**
   * Cancelar NO es un fallo: es una decisión del usuario, y marcarla como
   * error la pinta en rojo con un triángulo de aviso, que es el lenguaje de
   * «algo se ha roto». Va en su propia bandera para que el panel pueda
   * contarla en gris — y para que el turno quede fuera del hilo.
   */
  const cancelar = useCallback(() => {
    abortador.current?.abort();
    abortador.current = null;
    setOcupado(false);
    setEstado(null);
    actualizarUltimo(() => ({ cancelado: true }));
  }, [actualizarUltimo]);

  /**
   * La consulta en sí. Da por hecho que el último mensaje ya es el turno
   * vacío del asistente: quien llama decide cómo llegó ahí, que es lo único
   * que distingue preguntar de reintentar.
   */
  const correr = useCallback(
    async (pregunta, historial) => {
      const control = new AbortController();
      abortador.current = control;

      setOcupado(true);
      setEstado("Enviando…");

      try {
        const respuesta = await fetch(`${API_BASE}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pregunta, historial }),
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
          // Los argumentos viajan con la herramienta y se guardan enteros: son
          // lo que convierte «leyó el historiador» en «leyó el historiador de
          // la Línea 1 el 25 de marzo», que es lo que deja ver que el modelo
          // entendió otra máquina o otro día.
          onHerramienta: (nombre, argumentos) =>
            actualizarUltimo(() => ({ herramienta: nombre, argumentos: argumentos ?? null })),
          // `sinRedactar` sin herramienta es el callejón sin salida del
          // servidor: no supo qué contestar. Con herramienta significa otra
          // cosa —el backend resumió el dato él mismo— y esa sí es respuesta.
          onFin: (fin) =>
            actualizarUltimo(() => ({
              bloqueada: Boolean(fin.bloqueada),
              sinRespuesta: Boolean(fin.sinRedactar) && !fin.herramienta,
            })),
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
        // Solo se borra el abortador si sigue siendo el DE ESTA consulta.
        // Cancelar y reintentar en seguida deja dos `correr` solapados un
        // instante, y el que muere borrando la referencia del que acaba de
        // nacer dejaría al botón «Cancelar» sin nada que abortar: la pantalla
        // diría que se canceló y la GPU seguiría generando tokens.
        if (abortador.current === control) abortador.current = null;
      }
    },
    [actualizarUltimo]
  );

  const preguntar = useCallback(
    (pregunta) => {
      const limpia = String(pregunta ?? "").trim();
      if (!limpia || ocupado) return;

      // El hilo se toma ANTES de añadir el turno nuevo, que aún está vacío.
      const historial = historialParaEnviar(mensajes);

      setMensajes((previos) => [...previos, { rol: "usuario", texto: limpia }, nuevoTurno()]);
      correr(limpia, historial);
    },
    [ocupado, mensajes, correr]
  );

  /**
   * Repite la última pregunta cuando su turno acabó en nada.
   *
   * Existe porque los tres finales malos —el 409 de otra pantalla, el corte
   * por tiempo y la cancelación— son de los que se arreglan volviendo a
   * intentarlo, y sin esto hay que reescribir la pregunta a mano después de
   * haber esperado minuto y medio.
   *
   * Solo se reintenta el ÚLTIMO turno: más atrás habría que decidir qué pasa
   * con lo que vino después, y la respuesta honesta —tirarlo— no es la que
   * espera quien pulsa un botón que dice «reintentar».
   */
  const reintentar = useCallback(() => {
    if (ocupado) return;

    const n = mensajes.length;
    const fallido = mensajes[n - 1];
    const pregunta = mensajes[n - 2];

    if (!fallido || fallido.rol !== "asistente" || !(fallido.error || fallido.cancelado)) return;
    if (!pregunta || pregunta.rol !== "usuario") return;

    // El hilo se toma sin la pregunta que se repite —viaja aparte— y sin el
    // turno fallido, que no es historia de nada.
    const historial = historialParaEnviar(mensajes.slice(0, n - 2));

    setMensajes((previos) => [...previos.slice(0, -1), nuevoTurno()]);
    correr(pregunta.texto, historial);
  }, [ocupado, mensajes, correr]);

  const limpiar = useCallback(() => {
    if (ocupado) return;
    setMensajes([]);
  }, [ocupado]);

  return { disponible, mensajes, estado, ocupado, preguntar, reintentar, cancelar, limpiar };
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
      else if (evento.tipo === "herramienta") manejadores.onHerramienta(evento.nombre, evento.argumentos);
      else if (evento.tipo === "fin") manejadores.onFin(evento);
      else if (evento.tipo === "error") manejadores.onError(evento.mensaje);
    }
  }
}

/** Nombre técnico de la herramienta → lo que se le enseña al operador. */
export const ETIQUETA_HERRAMIENTA = {
  estado_de_planta: "Leyó la planta entera de ICONICS",
  estado_actual: "Leyó el estado en vivo de ICONICS",
  datos_de_maquina: "Leyó el historiador",
  comparar_periodos: "Comparó dos períodos del historiador",
};

/**
 * Con qué se hizo la consulta: máquina, período, métrica.
 *
 * ── POR QUÉ SE ENSEÑA EL TEXTO CRUDO ───────────────────────────────
 *
 * Estos valores los eligió el MODELO al llamar a la herramienta, y se pintan
 * tal cual, sin embellecer. Decir «Leyó el historiador» no permite distinguir
 * una respuesta correcta de una en la que el modelo entendió otra máquina u
 * otro día; decir «Leyó el historiador · Línea 2 · ayer» cuando se preguntó
 * por la Línea 1 lo delata de un vistazo. Traducir o normalizar aquí lo que
 * pidió el modelo taparía justo el error que esta línea existe para enseñar.
 *
 * El período se ve como lo mandó —«ayer», «turno de la mañana»— porque quien
 * lo resuelve a fechas es el servidor, dentro de la herramienta, y esa fecha
 * ya resuelta no viaja en el flujo.
 */
export function describirConsulta(nombre, argumentos) {
  if (!argumentos || typeof argumentos !== "object") return [];

  const leer = (v) => (typeof v === "string" || typeof v === "number" ? String(v).trim() : "");
  const partes = [];

  const maquina = leer(argumentos.maquina);
  if (maquina) partes.push(maquina);

  if (nombre === "comparar_periodos") {
    const a = leer(argumentos.periodoA);
    const b = leer(argumentos.periodoB);
    if (a && b) partes.push(`${a} vs. ${b}`);
    else if (a || b) partes.push(a || b);
  } else {
    const periodo = leer(argumentos.periodo);
    if (periodo) partes.push(periodo);
  }

  const metrica = leer(argumentos.metrica);
  if (metrica) partes.push(metrica);

  return partes;
}
