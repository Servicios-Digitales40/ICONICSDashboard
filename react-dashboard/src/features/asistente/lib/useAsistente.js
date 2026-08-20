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
import { API_BASE } from "@/lib/apiBase";
import { aWav, grabar, puedeGrabar } from "./audio.js";
import { callar, hablar, puedeHablar } from "./vozSalida.js";
import { borrar, cargar, guardar } from "./persistencia.js";

/**
 * Mensaje del asistente aún vacío, al que se le van pegando los deltas.
 *
 * `consultas` es una LISTA porque desde que el backend encadena herramientas un
 * turno puede tener varias: un diagnóstico lee el estado, mira la historia de
 * la señal sospechosa y busca en el manual. Antes había un solo hueco
 * (`herramienta` + `argumentos`) y cada consulta pisaba a la anterior, así que
 * la traza que se enseñaba al operador mentía por omisión: decía que la
 * respuesta salió del manual cuando también había leído dos series.
 *
 * `adjuntos` son los gráficos, que llegan por su propio evento y nunca pasan
 * por el modelo. Ver `separarAdjuntos` en `backend/ia/chat.mjs`.
 */
const nuevoTurno = () => ({
  rol: "asistente",
  texto: "",
  consultas: [],
  adjuntos: [],
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
  /*
   * El hilo arranca de lo GUARDADO, con el inicializador perezoso de
   * `useState` —la función, no el valor—. Con `useState(cargar())` se leería
   * `localStorage` en cada render y se tiraría el resultado, que en un
   * componente que se repinta con cada token del flujo son cientos de lecturas
   * por respuesta.
   */
  const [mensajes, setMensajes] = useState(cargar);
  const [estado, setEstado] = useState(null);           // "Consultando ICONICS…"
  const [ocupado, setOcupado] = useState(false);

  const abortador = useRef(null);
  const vivo = useRef(true);

  /*
   * Se guarda cuando el hilo cambia Y no hay consulta en curso.
   *
   * La condición de `ocupado` es lo importante: sin ella se escribiría en
   * `localStorage` con cada token que llega —cuarenta veces por segundo— y
   * cada escritura serializa el hilo entero. Al terminar la respuesta se
   * guarda una vez, que es cuando de verdad hay algo nuevo que conservar.
   */
  useEffect(() => {
    if (!ocupado) guardar(mensajes);
  }, [mensajes, ocupado]);

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
          // la presión en la última hora», que es lo que deja ver que el modelo
          // entendió otra señal u otro momento.
          //
          // Se ACUMULAN, no se sustituyen: ver `nuevoTurno`.
          onHerramienta: (nombre, argumentos) =>
            actualizarUltimo((m) => ({
              consultas: [...m.consultas, { nombre, argumentos: argumentos ?? null }],
            })),
          onAdjunto: (adjunto) =>
            actualizarUltimo((m) => ({ adjuntos: [...m.adjuntos, adjunto] })),
          // `sinRedactar` sin ninguna consulta es el callejón sin salida del
          // servidor: no supo qué contestar. Con consultas significa otra
          // cosa —el backend resumió el dato él mismo— y esa sí es respuesta.
          onFin: (fin) =>
            actualizarUltimo(() => ({
              bloqueada: Boolean(fin.bloqueada),
              sinRespuesta: Boolean(fin.sinRedactar) && !fin.herramientas?.length,
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
    // Y del almacenamiento, no sólo de la pantalla: si sólo se vaciara el
    // estado, al recargar reaparecería la conversación que el usuario acaba de
    // borrar, que es lo contrario de lo que pidió el botón.
    borrar();
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
      else if (evento.tipo === "adjunto") manejadores.onAdjunto(evento);
      else if (evento.tipo === "fin") manejadores.onFin(evento);
      else if (evento.tipo === "error") manejadores.onError(evento.mensaje);
    }
  }
}

/**
 * Dictado por voz: grabar, transcribir y devolver el texto.
 *
 * ── POR QUÉ ES UN HOOK APARTE Y NO PARTE DE `useAsistente` ─────────
 *
 * Porque no comparte nada con él. El dictado no toca la conversación, no usa
 * el historial y no depende de que el modelo de lenguaje esté vivo: produce
 * texto y ahí acaba. De hecho funciona con `IA_BASE` apagado, que es una
 * combinación rara pero perfectamente válida.
 *
 * Y porque su disponibilidad es OTRA: el chat depende de `IA_BASE`, el
 * micrófono de `IA_WHISPER_BASE` **y** de que el navegador esté en un contexto
 * seguro. Meterlos en el mismo estado obligaría a distinguir cuatro
 * combinaciones dentro de un hook que ya tiene bastante.
 *
 * Lo que devuelve `detener()` es TEXTO, no una pregunta enviada. Quien lo llama
 * lo mete en el cuadro de entrada para que el usuario lo revise. Ver la
 * cabecera de `backend/routes/vozRoutes.mjs`.
 */
export function useDictado() {
  const [disponible, setDisponible] = useState(null);   // null = comprobando
  const [grabando, setGrabando] = useState(false);
  const [transcribiendo, setTranscribiendo] = useState(false);
  const [error, setError] = useState(null);

  const sesion = useRef(null);
  const vivo = useRef(true);

  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
      // Desmontar con el micrófono abierto lo dejaría encendido: el piloto del
      // portátil seguiría diciendo que la aplicación escucha.
      sesion.current?.cancelar();
      sesion.current = null;
    };
  }, []);

  /* ── ¿Hay dictado en este servidor Y en este navegador? ──────────── */
  useEffect(() => {
    let cancelado = false;

    if (!puedeGrabar()) {
      setDisponible(false);
      return;
    }

    fetch(`${API_BASE}/api/voz`)
      .then((r) => r.json())
      .then((r) => { if (!cancelado) setDisponible(Boolean(r?.habilitado)); })
      // Un backend sin esta ruta responde con el index.html; eso es «no hay
      // dictado», no un error que enseñar.
      .catch(() => { if (!cancelado) setDisponible(false); });

    return () => { cancelado = true; };
  }, []);

  /** Manda un WAV a transcribir. Compartido por el micrófono y por un archivo. */
  const transcribir = useCallback(async (wav) => {
    setTranscribiendo(true);
    setError(null);
    try {
      const respuesta = await fetch(`${API_BASE}/api/voz`, {
        method: "POST",
        headers: { "Content-Type": "audio/wav" },
        body: wav,
      });

      const cuerpo = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok) throw new Error(cuerpo?.error ?? `El servidor respondió ${respuesta.status}.`);

      return cuerpo?.texto ?? "";
    } catch (e) {
      if (vivo.current) setError(e.message);
      return "";
    } finally {
      if (vivo.current) setTranscribiendo(false);
    }
  }, []);

  const empezar = useCallback(async () => {
    setError(null);
    try {
      sesion.current = await grabar();
      if (vivo.current) setGrabando(true);
    } catch {
      // El caso normal es que el usuario diga «no» al permiso del micrófono.
      // No es una avería y no se pinta como tal.
      if (vivo.current) setError("No se ha podido acceder al micrófono. Revisa el permiso del navegador.");
    }
  }, []);

  /** Para de grabar y devuelve lo que se entendió, o cadena vacía. */
  const detener = useCallback(async () => {
    const actual = sesion.current;
    sesion.current = null;
    setGrabando(false);
    if (!actual) return "";

    let wav;
    try {
      wav = await actual.detener();
    } catch (e) {
      if (vivo.current) setError(e.message);
      return "";
    }
    return transcribir(wav);
  }, [transcribir]);

  const cancelar = useCallback(() => {
    sesion.current?.cancelar();
    sesion.current = null;
    setGrabando(false);
    setError(null);
  }, []);

  /** Un archivo de audio que el usuario arrastre o elija. */
  const desdeArchivo = useCallback(async (archivo) => {
    setError(null);
    try {
      return transcribir(await aWav(archivo));
    } catch (e) {
      if (vivo.current) setError(e.message);
      return "";
    }
  }, [transcribir]);

  return {
    disponible, grabando, transcribiendo, error,
    empezar, detener, cancelar, desdeArchivo,
  };
}

/**
 * Modo manos libres: hablar con el asistente como por teléfono.
 *
 * Encadena el ciclo entero — escuchar, preguntar, oír la respuesta, y volver a
 * escuchar — sin tocar el teclado. Es para el operador que está delante del
 * equipo, con guantes o con las manos ocupadas, que es cuando de verdad hace
 * falta preguntarle algo al tablero.
 *
 * ── LAS TRES REGLAS QUE LO HACEN USABLE ────────────────────────────
 *
 * 1. **Se envía sin confirmar.** Es la diferencia con el dictado normal, donde
 *    el texto va al cuadro para revisarlo. Aquí no hay cuadro que mirar: pedir
 *    confirmación convertiría el manos libres en un manos-ocupadas. El precio
 *    es real —una frase mal oída gasta una consulta— y se paga a cambio de que
 *    la función sirva para algo. Lo que se entendió se dice en pantalla, así
 *    que el malentendido se ve.
 *
 * 2. **Se para solo al terminar el ciclo si el usuario lo apagó.** Cada paso
 *    comprueba `activoRef` antes de encadenar el siguiente. Sin eso, apagar el
 *    modo en mitad de una respuesta de noventa segundos no serviría de nada:
 *    la respuesta llegaría, se leería en voz alta y volvería a escuchar.
 *
 * 3. **No se escucha mientras habla.** El micrófono captaría el altavoz y el
 *    asistente se preguntaría a sí mismo. Los turnos son estrictos.
 *
 * ── LO QUE NO HACE ─────────────────────────────────────────────────
 *
 * No detecta el final de la frase por silencio. Se pulsa para parar de hablar,
 * igual que en el dictado. Un detector de silencio en una sala de máquinas
 * corta a mitad de frase con el ruido de fondo, y eso es peor que un botón.
 */
export function useManosLibres({ preguntar, ocupado, ultimaRespuesta }) {
  const [activo, setActivo] = useState(false);
  const [fase, setFase] = useState("parado");   // parado | escuchando | pensando | hablando

  const dictado = useDictado();
  const activoRef = useRef(false);
  const yaLeido = useRef(null);

  const disponible = dictado.disponible === true && puedeHablar();

  useEffect(() => { activoRef.current = activo; }, [activo]);

  /*
   * `escuchar` vive en una referencia, y no es un adorno.
   *
   * `useDictado` devuelve un objeto literal nuevo en cada render, así que
   * cualquier callback que dependa de él cambia de identidad continuamente. Si
   * el efecto que lee la respuesta dependiera de `escuchar`, se reiniciaría en
   * cada render: su limpieza marcaría `cancelado` mientras la voz aún habla, y
   * la ejecución nueva saldría por el guardia de `yaLeido`. Resultado: lee la
   * respuesta una vez y NO vuelve a escuchar — el ciclo se rompe en la primera
   * pregunta, que es todo el modo.
   *
   * Con la referencia, el efecto sólo depende de lo que de verdad significa un
   * turno nuevo: que el modo esté activo, que la consulta haya terminado y que
   * la respuesta sea otra.
   */
  const escucharRef = useRef(null);

  const apagar = useCallback(() => {
    activoRef.current = false;
    setActivo(false);
    setFase("parado");
    callar();
    dictado.cancelar();
  }, [dictado]);

  // Desmontar con el modo encendido dejaría el micrófono abierto y la voz
  // hablando sola sobre una pantalla que ya no existe.
  useEffect(() => apagar, [apagar]);

  /** Escucha un turno y manda lo que se haya entendido. */
  const escuchar = useCallback(async () => {
    if (!activoRef.current) return;

    setFase("escuchando");
    await dictado.empezar();
  }, [dictado]);

  escucharRef.current = escuchar;

  /** El usuario pulsa para indicar que ha terminado de hablar. */
  const heTerminado = useCallback(async () => {
    if (!activoRef.current) return;

    setFase("pensando");
    const texto = await dictado.detener();

    if (!activoRef.current) return;

    // Sin texto se vuelve a escuchar en vez de parar: lo normal es que no se
    // oyera bien, y apagar el modo obligaría a encenderlo otra vez con las
    // manos, que es justo lo que se quería evitar.
    if (!texto) return escuchar();

    preguntar(texto);
  }, [dictado, preguntar, escuchar]);

  const encender = useCallback(() => {
    if (!disponible) return;
    activoRef.current = true;
    setActivo(true);
    // Lo que ya hubiera en pantalla no se lee: el modo empieza a partir de
    // ahora, y leer la respuesta anterior al encenderlo desconcierta.
    yaLeido.current = ultimaRespuesta?.texto ?? null;
    escuchar();
  }, [disponible, escuchar, ultimaRespuesta]);

  /*
   * Llegó una respuesta nueva y completa: se lee y se vuelve a escuchar.
   *
   * Se dispara con `ocupado` bajando a falso, y NO con cada trozo de texto: ver
   * la cabecera de `vozSalida.js` sobre por qué no se lee mientras escribe.
   */
  useEffect(() => {
    if (!activo || ocupado) return;

    const texto = ultimaRespuesta?.texto?.trim();
    if (!texto || texto === yaLeido.current) return;

    // Un turno que acabó en error o bloqueado no se lee como si fuera una
    // respuesta: la nota de la pantalla ya lo cuenta, y leerlo en voz alta
    // haría sonar un fallo con el mismo tono que un dato.
    if (ultimaRespuesta.error || ultimaRespuesta.cancelado) {
      activoRef.current = false;
      setActivo(false);
      setFase("parado");
      callar();
      return;
    }

    yaLeido.current = texto;
    let cancelado = false;

    (async () => {
      setFase("hablando");
      await hablar(texto);
      if (cancelado || !activoRef.current) return;
      escucharRef.current?.();
    })();

    return () => { cancelado = true; };
    // `escuchar` y `apagar` quedan fuera a propósito: cambian de identidad en
    // cada render y reiniciarían el efecto a media respuesta. Ver `escucharRef`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, ocupado, ultimaRespuesta]);

  return {
    disponible,
    activo,
    fase,
    transcribiendo: dictado.transcribiendo,
    error: dictado.error,
    encender,
    apagar,
    heTerminado,
  };
}

/**
 * Nombre técnico de la herramienta → lo que se le enseña al operador.
 *
 * Cada entrada dice DE DÓNDE salió el dato, no qué hizo el modelo. Es la
 * distinción que permite creerse la respuesta: «leyó el historiador» y «buscó
 * en el manual» son procedencias verificables, y «calculó sobre la serie» avisa
 * de que ese número no se leyó de ninguna parte, se derivó.
 */
export const ETIQUETA_HERRAMIENTA = {
  estado_del_sistema: "Leyó las ocho señales en vivo de ICONICS",
  historia_de_senal: "Leyó el historiador",
  comparar_periodos: "Comparó dos períodos del historiador",
  analisis_de_senal: "Calculó tendencia y anomalías sobre la serie",
  perfil_de_senal: "Midió qué es normal, sobre semanas de historial",
  correlacionar_senales: "Cruzó varias señales del historiador",
  grafico_de_senal: "Dibujó la serie del historiador",
  consultar_documentacion: "Buscó en la documentación de planta",
};

/**
 * Con qué se hizo la consulta: señal y período.
 *
 * ── POR QUÉ SE ENSEÑA EL TEXTO CRUDO ───────────────────────────────
 *
 * Estos valores los eligió el MODELO al llamar a la herramienta, y se pintan
 * tal cual, sin embellecer. Decir «Leyó el historiador» no permite distinguir
 * una respuesta correcta de una en la que el modelo entendió otra señal u otro
 * momento; decir «Leyó el historiador · presión · última hora» cuando se
 * preguntó por el nivel lo delata de un vistazo. Traducir o normalizar aquí lo
 * que pidió el modelo taparía justo el error que esta línea existe para
 * enseñar.
 *
 * Aquí eso importa MÁS que en el tablero de Resonac, y por un motivo concreto:
 * el resolvedor de señales del backend acepta sinónimos («la bomba», «el
 * voltaje») a propósito, así que la traducción de lo que dijo el usuario a la
 * señal que se leyó ocurre fuera de la vista. Esta línea es donde vuelve a
 * verse.
 *
 * El período se ve como lo mandó —«última hora», «ayer a las 12»— porque quien
 * lo resuelve a fechas es el servidor, dentro de la herramienta, y esa ventana
 * ya resuelta no viaja en el flujo.
 */
export function describirConsulta(nombre, argumentos) {
  if (!argumentos || typeof argumentos !== "object") return [];

  const leer = (v) => (typeof v === "string" || typeof v === "number" ? String(v).trim() : "");
  const partes = [];

  const senal = leer(argumentos.senal);
  if (senal) partes.push(senal);

  // `correlacionar_senales` recibe una lista, no una señal suelta. Sin esto la
  // línea de traza salía sólo con el período y no dejaba ver QUÉ cruzó, que es
  // precisamente lo que hay que poder comprobar en un diagnóstico.
  if (Array.isArray(argumentos.senales)) {
    const nombres = argumentos.senales.map(leer).filter(Boolean);
    if (nombres.length) partes.push(nombres.join(" + "));
  } else if (leer(argumentos.senales)) {
    partes.push(leer(argumentos.senales));
  }

  // Lo que se buscó en el manual se enseña literal: es la traducción que hizo
  // el modelo de la pregunta del usuario, y es donde se ve si buscó otra cosa.
  const consulta = leer(argumentos.pregunta);
  if (consulta) partes.push(`«${consulta}»`);

  if (nombre === "comparar_periodos") {
    const a = leer(argumentos.periodoA);
    const b = leer(argumentos.periodoB);
    if (a && b) partes.push(`${a} vs. ${b}`);
    else if (a || b) partes.push(a || b);
  } else {
    const periodo = leer(argumentos.periodo);
    // Sin período el backend usa las últimas 6 h, y callarlo aquí haría creer
    // que la respuesta es del instante. Se dice cuál fue el defecto.
    if (periodo) partes.push(periodo);
    else if (nombre === "historia_de_senal") partes.push("últimas 6 h (por defecto)");
  }

  return partes;
}
