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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API_BASE } from "@/lib/api/apiBase";
import { aWav, grabar, puedeGrabar } from "./audio.js";
import { alQuedarseMuda, callar, desbloquearVoz, hablar, puedeHablar } from "./vozSalida.js";
import { borrar, cargar, guardar } from "./persistencia.js";
import { sistemaDeRuta } from "@shared/eva/comun/sistemas.js";

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
 * por el modelo. Ver `separarAdjuntos` en `backend/ia/conversacion/chat.mjs`.
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

  /*
   * El modelo activo y el catálogo de elegibles.
   *
   * NO se guardan en `localStorage` como el hilo, y esa es la decisión: el
   * modelo es estado del SERVIDOR, uno solo para todas las pantallas (ver
   * `chat.mjs`). Persistirlo aquí haría que al recargar la pantalla dijera el
   * que eligió esta pestaña la última vez, que puede no ser el que está
   * cargado ahora — y una etiqueta que miente sobre qué modelo responde es
   * peor que no tenerla. Se pregunta al backend, siempre.
   *
   * `modelos` vacío significa «un solo modelo»: el panel no pinta el selector.
   */
  const [modelo, setModelo] = useState(null);
  const [modelos, setModelos] = useState([]);
  const [errorModelo, setErrorModelo] = useState(null);

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
      .then((r) => {
        if (cancelado) return;
        setDisponible(Boolean(r?.habilitado));
        setModelo(r?.modelo ?? null);
        // `?? []` y no `r.modelos`: un backend anterior a esta función no
        // manda el campo, y `undefined` rompería el `.length` del panel. Sin
        // campo es «no hay elección», que es justo lo que era antes.
        setModelos(Array.isArray(r?.modelos) ? r.modelos : []);
      })
      // Un backend viejo no conoce la ruta y responde con el index.html; eso
      // es «no hay asistente», no un error que enseñar.
      .catch(() => { if (!cancelado) setDisponible(false); });

    return () => { cancelado = true; };
  }, []);

  /**
   * Cambia el modelo para TODO el servidor.
   *
   * El estado local se actualiza con lo que CONFIRMA el backend, no con lo que
   * se pidió: si el servidor rechaza el cambio —hay una consulta en curso, el
   * nombre no está en su catálogo— el selector tiene que seguir enseñando el
   * modelo que de verdad va a responder. Pintar el elegido de inmediato y
   * corregirlo después sería enseñar medio segundo de mentira justo en el
   * indicador que existe para no mentir.
   */
  const elegirModelo = useCallback(
    async (nombre) => {
      if (ocupado || !nombre || nombre === modelo) return;

      setErrorModelo(null);
      try {
        const respuesta = await fetch(`${API_BASE}/api/chat/modelo`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modelo: nombre }),
        });

        const cuerpo = await respuesta.json().catch(() => ({}));
        if (!respuesta.ok) {
          throw new Error(cuerpo?.error ?? `El servidor respondió ${respuesta.status}.`);
        }

        if (vivo.current) setModelo(cuerpo?.modelo ?? nombre);
      } catch (error) {
        if (vivo.current) setErrorModelo(error.message);
      }
    },
    [ocupado, modelo]
  );

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
          /*
           * El puesto en la fila, mientras espera turno.
           *
           * Se pinta en el mismo hueco que el estado porque responde a la
           * misma pregunta —«¿qué está pasando?»— y porque tener dos
           * indicadores compitiendo por 420 px de panel no cabe. En cuanto la
           * consulta arranca de verdad, el bucle del chat emite «Pensando…» y
           * lo sustituye solo.
           */
          onCola: (porDelante) =>
            vivo.current && setEstado(
              porDelante === 1
                ? "Hay 1 consulta por delante…"
                : `Hay ${porDelante} consultas por delante…`
            ),
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

  return {
    disponible, mensajes, estado, ocupado, preguntar, reintentar, cancelar, limpiar,
    modelo, modelos, elegirModelo, errorModelo,
  };
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
      else if (evento.tipo === "cola") manejadores.onCola(evento.porDelante);
      else if (evento.tipo === "texto") manejadores.onTexto(evento.delta);
      else if (evento.tipo === "herramienta") manejadores.onHerramienta(evento.nombre, evento.argumentos);
      else if (evento.tipo === "adjunto") manejadores.onAdjunto(evento.adjunto);
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
      /*
       * Se le dice a Whisper QUÉ SISTEMA se está mirando, y con eso elige el
       * vocabulario que tiene que oír bien.
       *
       * Sin esto, el dictado usaba siempre las palabras del tanque: preguntar
       * por vibraciones devolvía «lado acople» y «rodamiento» deformados, y
       * una pregunta deformada hace que el asistente conteste sobre otra cosa
       * — que es peor que no entenderla, porque no se nota.
       *
       * Se lee del hash y no de un estado propio: la pantalla activa ya está
       * ahí, y duplicarla en el asistente sería una segunda fuente de verdad
       * que puede quedarse atrás al navegar.
       */
      const sistema = sistemaDeRuta(window.location.hash);
      const destino = sistema
        ? `${API_BASE}/api/voz?sistema=${encodeURIComponent(sistema)}`
        : `${API_BASE}/api/voz`;

      const respuesta = await fetch(destino, {
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

  const empezar = useCallback(async (opciones) => {
    setError(null);
    try {
      // Las opciones llegan del modo llamada: la detección de silencio y el
      // nivel del micrófono. El dictado con botón no las pasa, y entonces
      // `grabar` ni siquiera monta el grafo de audio.
      sesion.current = await grabar(opciones);
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

  /*
   * Memoizado, y no es una optimización: es corrección.
   *
   * Devolver un objeto literal hace que cambie de identidad en CADA render, y
   * cualquier `useEffect` o `useCallback` que dependa de él se considera
   * obsoleto continuamente. Eso ya rompió el modo llamada de la peor forma
   * posible: la limpieza de un efecto —que apagaba el micrófono— se ejecutaba
   * en cada repintado, y como el nivel de voz repinta diez veces por segundo,
   * la grabación se cancelaba a sí misma sin parar. La pantalla decía «Te
   * escucho» y no pasaba nada nunca.
   *
   * Con la identidad estable, quien dependa de este objeto sólo reacciona
   * cuando algo cambia de verdad.
   */
  return useMemo(
    () => ({
      disponible, grabando, transcribiendo, error,
      empezar, detener, cancelar, desdeArchivo,
    }),
    [disponible, grabando, transcribiendo, error,
      empezar, detener, cancelar, desdeArchivo]
  );
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
 * No adivina a quién escucha: si hay dos personas hablando cerca, el turno se
 * cierra con el primer silencio de la sala, no con el de quien preguntaba.
 *
 * (El final de frase SÍ se detecta por silencio — ver `escuchar` más abajo y
 * `vigilarSilencio` en `audio.js`. El botón queda como salida manual.)
 */
/**
 * Cuántos turnos seguidos sin entender nada antes de rendirse.
 *
 * Reintentar una o dos veces es lo correcto: lo normal es que una frase no se
 * oyera bien. Pero girar en silencio para siempre es el peor fallo posible en
 * un modo sin pantalla — el operador habla y no pasa nada, sin ninguna pista.
 */
const MAX_TURNOS_VACIOS = 3;

export function useManosLibres({ preguntar, ocupado, ultimaRespuesta }) {
  const [activo, setActivo] = useState(false);
  const [fase, setFase] = useState("parado");   // parado | escuchando | pensando | hablando
  /** Nivel del micrófono, 0 a 1. Es la prueba visible de que te está oyendo. */
  const [nivel, setNivel] = useState(0);
  /** Fallo de la VOZ, que se arregla en otro sitio que el del micrófono. */
  const [errorVoz, setErrorVoz] = useState(null);

  const dictado = useDictado();
  const vivoEnLlamada = useRef(true);
  const activoRef = useRef(false);
  const yaLeido = useRef(null);
  /** Evita que el silencio y el botón cierren el mismo turno dos veces. */
  const cerrandoTurno = useRef(false);
  /** Turnos seguidos sin entender nada. Ver `MAX_TURNOS_VACIOS`. */
  const vacios = useRef(0);

  const disponible = dictado.disponible === true && puedeHablar();

  useEffect(() => { activoRef.current = activo; }, [activo]);

  /*
   * Que el silencio de la voz deje de ser invisible.
   *
   * `speechSynthesis` se traga frases sin emitir ningún evento: ni `error`, ni
   * `end`, ni nada. Sin esto el único síntoma es «no suena», que es lo que
   * costó varias rondas de diagnóstico. Ahora sale escrito qué comprobar.
   */
  useEffect(() => {
    alQuedarseMuda((motivo) => vivoEnLlamada.current && setErrorVoz(motivo));
    return () => alQuedarseMuda(null);
  }, []);

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

  /**
   * Saluda al descolgar, y no es cortesía: es la PRUEBA de que la voz funciona.
   *
   * Sin esto, si el navegador tiene la síntesis bloqueada no te enteras hasta
   * uno o dos minutos después —cuando llega la primera respuesta y no suena—,
   * y para entonces no hay forma de saber si el problema es la voz, el
   * micrófono o el asistente. Con el saludo, si no oyes nada al descolgar ya
   * sabes cuál de los tres es.
   *
   * El aviso de fin importa: hasta que el saludo no acaba NO se puede abrir el
   * micrófono. Ver `encender`.
   */
  const saludar = useCallback((alTerminar) => {
    setErrorVoz(null);
    // NO se usa `hablar()`: espera a que carguen las voces, y ese `await`
    // rompe la cadena del clic — que es justo lo que el navegador exige para
    // autorizar el audio. `desbloquearVoz` lo dice en la misma vuelta.
    desbloquearVoz("Te escucho.", alTerminar);
  }, []);

  const apagar = useCallback(() => {
    activoRef.current = false;
    cerrandoTurno.current = false;
    setActivo(false);
    setFase("parado");
    setNivel(0);
    callar();
    dictado.cancelar();
  }, [dictado]);

  /*
   * Desmontar con el modo encendido dejaría el micrófono abierto y la voz
   * hablando sola sobre una pantalla que ya no existe.
   *
   * `apagar` va por referencia por la misma razón que `escuchar` y
   * `cerrarTurno`: depende de `dictado`, que es un objeto literal nuevo en cada
   * render, así que cambia de identidad continuamente. Con `[apagar]` en las
   * dependencias esto NO era un efecto de desmontaje — se rehacía en cada
   * render y su limpieza llamaba a `apagar()` cada vez. El modo se apagaba solo
   * en el render siguiente a encenderlo: pulsar el botón no dejaba nada
   * encendido y cortaba el micrófono recién abierto.
   *
   * Con la lista de dependencias vacía, la limpieza corre una sola vez, al
   * desmontar de verdad, y la referencia garantiza que apague la versión buena.
   */
  const apagarRef = useRef(null);
  apagarRef.current = apagar;

  useEffect(() => {
    vivoEnLlamada.current = true;
    return () => { vivoEnLlamada.current = false; apagarRef.current?.(); };
  }, []);

  /**
   * Escucha un turno y lo cierra solo cuando el que habla se calla.
   *
   * ── POR QUÉ AHORA SÍ HAY DETECCIÓN DE SILENCIO ─────────────────────
   *
   * La primera versión obligaba a pulsar para terminar de hablar, por miedo a
   * que el ruido de una sala de máquinas cortara a mitad de frase. Pero eso no
   * era una llamada: era un walkie con pasos extra, y en el escenario que
   * justifica el modo —las manos ocupadas delante del equipo— tener que buscar
   * un botón lo invalida entero.
   *
   * El corte se hace robusto en vez de evitarlo: el umbral se CALIBRA contra el
   * ruido ambiente de los primeros instantes en vez de ser un número fijo, hace
   * falta silencio sostenido de más de un segundo, y no puede dispararse antes
   * de que a nadie le haya dado tiempo a hablar. Y el botón sigue ahí para
   * cerrar el turno a mano cuando haga falta.
   */
  const escuchar = useCallback(async () => {
    if (!activoRef.current) return;

    cerrandoTurno.current = false;
    setFase("escuchando");
    setNivel(0);

    await dictado.empezar({
      alNivel: (v) => vivoEnLlamada.current && setNivel(v),
      alDetectarSilencio: () => cerrarTurnoRef.current?.(),
    });
  }, [dictado]);

  escucharRef.current = escuchar;

  /**
   * Cierra el turno de habla y manda lo que se haya entendido.
   *
   * Lo llaman DOS cosas: el detector de silencio y el botón. La guarda existe
   * porque llegan casi a la vez cuando alguien pulsa justo cuando termina de
   * hablar, y sin ella se enviaría la pregunta dos veces — dos consultas a la
   * cola por una sola frase.
   */
  const cerrarTurno = useCallback(async () => {
    if (!activoRef.current || cerrandoTurno.current) return;
    cerrandoTurno.current = true;

    setFase("pensando");
    setNivel(0);
    const texto = await dictado.detener();

    if (!activoRef.current) return;

    /*
     * Sin texto se vuelve a escuchar, pero NO indefinidamente.
     *
     * Reintentar es lo correcto una o dos veces: lo normal es que no se oyera
     * bien, y apagar el modo obligaría a encenderlo otra vez con las manos,
     * que es justo lo que se quería evitar.
     *
     * Pero si NADA se entiende varias veces seguidas, algo va mal de verdad
     * —el micrófono capta silencio, o whisper no está respondiendo— y seguir
     * girando en silencio es lo peor que puede hacer: el operador ve el
     * círculo rojo, habla, y no pasa nada nunca, sin ninguna pista de por qué.
     */
    if (!texto) {
      vacios.current += 1;
      if (vacios.current < MAX_TURNOS_VACIOS) return escuchar();

      setErrorVoz(
        "No he entendido nada en varios intentos. Comprueba que el micrófono capta tu voz: " +
        "al hablar, el anillo del botón tiene que crecer."
      );
      return apagarRef.current?.();
    }

    vacios.current = 0;
    preguntar(texto);
  }, [dictado, preguntar, escuchar]);

  // Por referencia, para que el detector de silencio —que se registra al
  // arrancar la grabación— llame siempre a la versión actual.
  const cerrarTurnoRef = useRef(null);
  cerrarTurnoRef.current = cerrarTurno;

  const encender = useCallback(() => {
    if (!disponible) return;
    vacios.current = 0;
    activoRef.current = true;
    setActivo(true);
    // Lo que ya hubiera en pantalla no se lee: el modo empieza a partir de
    // ahora, y leer la respuesta anterior al encenderlo desconcierta.
    yaLeido.current = ultimaRespuesta?.texto ?? null;

    /*
     * Se escucha DESPUÉS de terminar el saludo, no a la vez.
     *
     * Abrir el micrófono mientras el altavoz aún dice «Te escucho» hace que se
     * grabe a sí mismo: el medidor de nivel toma la propia voz del asistente
     * como si fuera la del operador, marca que «ya se habló», y en cuanto el
     * saludo acaba detecta silencio y cierra el turno con audio vacío. Sin
     * texto, el ciclo vuelve a escuchar — y así indefinidamente.
     *
     * El síntoma es exactamente «me dice que me escucha pero no entabla la
     * conversación ni manda nada».
     *
     * La cancelación de eco del navegador no basta: filtra el altavoz para el
     * INTERLOCUTOR, no para el medidor de nivel local. Lo que sirve es no
     * solapar los turnos, que además es como funciona una conversación.
     *
     * Y el saludo va dentro del clic porque Chrome no deja hablar a una página
     * sin gesto reciente del usuario: la primera respuesta llega minutos
     * después, cuando ya no lo hay.
     */
    saludar(() => {
      if (activoRef.current) escuchar();
    });
  }, [disponible, escuchar, ultimaRespuesta, saludar]);

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
    nivel,
    transcribiendo: dictado.transcribiendo,
    // El fallo del micrófono y el de la voz son distintos y se arreglan en
    // sitios distintos, así que se cuentan por separado.
    error: dictado.error ?? errorVoz,
    encender,
    apagar,
    cerrarTurno,
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
  /*
   * ── POR QUÉ ESTE RÓTULO YA NO DICE «LAS OCHO SEÑALES» ──────────────
   *
   * Porque decía la cuenta de UNA máquina. Cuando `estado_del_sistema` pasó a
   * servir a cualquiera de las dadas de alta, la misma línea aparecía dos veces
   * en la traza —una por sistema— y las dos decían «las ocho señales en vivo»:
   * cierto del tanque, falso del sistema de vibraciones, que pide 73 puntos.
   *
   * El número se fue y en su lugar aparece el SISTEMA, que lo pone
   * `describirConsulta` desde el argumento que eligió el modelo. Es mejor
   * cambio del que parece: la cuenta era un detalle, y de qué máquina se está
   * hablando es lo único que esta línea no podía dejar de decir en una planta
   * con más de una.
   */
  estado_del_sistema: "Leyó las señales en vivo de ICONICS",
  sistemas_de_la_planta: "Consultó qué máquinas hay en la planta",
  riesgos_activos: "Cruzó las señales en vivo contra las reglas del tablero",
  pronostico_de_desgaste: "Contó horas de exposición sobre el historiador",
  historia_de_senal: "Leyó el historiador",
  valor_en_momento: "Leyó el historiador en un instante concreto",
  comparar_periodos: "Comparó dos períodos del historiador",
  analisis_de_senal: "Calculó tendencia y anomalías sobre la serie",
  perfil_de_senal: "Midió qué es normal, sobre semanas de historial",
  correlacionar_senales: "Cruzó varias señales del historiador",
  grafico_de_senal: "Dibujó la serie del historiador",
  generar_reporte: "Armó un informe con las series del historiador",
  consultar_documentacion: "Buscó en la documentación de planta",
  limites_del_manual: "Buscó un límite documentado en el manual",
  diagnostico: "Reunió estado + historia + correlación + manual en un dossier",
  hechos_de_la_planta: "Leyó lo que se le ha enseñado sobre esta planta",
  recordar_hecho: "Guardó un hecho nuevo sobre esta planta",
  proponer_regla: "Dejó una propuesta de regla, para que alguien la revise",
  /* La única que ESCRIBE en la instalación, y por eso se dice con ese verbo:
     las demás leen, y confundir una lectura con una orden al PLC es el peor
     malentendido que esta línea puede provocar. */
  controlar_bomba: "ESCRIBIÓ en el PLC de la instalación",
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

  /*
   * ── EL SISTEMA VA PRIMERO, Y ES LO MÁS IMPORTANTE DE ESTA LÍNEA ────
   *
   * Desde que las herramientas se parametrizan por máquina, «Leyó las señales
   * en vivo de ICONICS» aparece una vez por sistema y sin esto las dos líneas
   * son idénticas — el operador ve dos lecturas y no sabe de qué habla ninguna.
   *
   * Pero el motivo de fondo es otro y es más serio. `sistema` es obligatorio en
   * el backend precisamente porque contestar de la máquina equivocada da cifras
   * reales, unidades reales y ningún error: es el fallo que no se ve. Ésta es
   * la única parte de la pantalla donde se ve — si alguien pregunta por las
   * vibraciones y aquí pone `tanque`, la respuesta puede ser impecable y estar
   * hablando de otra instalación.
   *
   * Se pinta el id CRUDO, tal y como lo mandó el modelo, por la misma razón que
   * el resto de esta función: traducirlo a «Tanque y grupo de bombeo» taparía
   * un id inventado, que es justo lo que hay que poder ver.
   */
  const sistema = leer(argumentos.sistema);
  if (sistema) partes.push(sistema);

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

  // El síntoma de `diagnostico`, igual de literal y por el mismo motivo.
  const sintoma = leer(argumentos.sintoma);
  if (sintoma) partes.push(`«${sintoma}»`);

  // La ventana del pronóstico: «30 días» no es lo mismo que «90», y el
  // veredicto cambia con ella.
  const dias = leer(argumentos.dias);
  if (dias && nombre === "pronostico_de_desgaste") partes.push(`${dias} días`);

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
