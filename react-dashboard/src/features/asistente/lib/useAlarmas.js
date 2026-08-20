/**
 * Las alarmas de la planta, sondeadas para poder avisar sin que nadie pregunte.
 *
 * ── POR QUÉ SE SONDEA Y NO SE PIDE AL ASISTENTE ────────────────────
 *
 * Porque preguntarle al modelo «¿hay alarmas?» cada medio minuto ocuparía la
 * GPU durante un minuto cada vez y bloquearía la cola de consultas de todas las
 * pantallas. El aviso tiene que ser barato: `GET /api/alarmas` es una lectura
 * en lote contra ICONICS, sin modelo de por medio.
 *
 * ── POR QUÉ 30 SEGUNDOS ────────────────────────────────────────────
 *
 * Una alarma de proceso no aparece y desaparece en segundos: la de BAJO FLUJO
 * de esta instalación lleva días activa. Sondear más rápido no daría un aviso
 * más útil y multiplicaría las lecturas; más lento haría que alguien mirando la
 * pantalla viera el aviso bastante después de que sonara en la sala.
 *
 * El backend además cachea 10 s, así que varias pantallas abiertas siguen
 * siendo una sola lectura contra ICONICS por ronda.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE } from "@/lib/apiBase";

const MS_ENTRE_SONDEOS = 30000;

export function useAlarmas() {
  const [activas, setActivas] = useState([]);
  /** `null` mientras no se ha conseguido leer ninguna vez. */
  const [disponible, setDisponible] = useState(null);

  const vivo = useRef(true);

  const consultar = useCallback(async () => {
    try {
      const respuesta = await fetch(`${API_BASE}/api/alarmas`);
      if (!respuesta.ok) throw new Error(String(respuesta.status));

      const cuerpo = await respuesta.json();
      if (!vivo.current) return;

      setActivas(Array.isArray(cuerpo?.activas) ? cuerpo.activas : []);
      setDisponible(true);
    } catch {
      /*
       * Un fallo NO vacía la lista ni pinta un error.
       *
       * Que ICONICS no conteste un momento no puede hacer desaparecer un aviso
       * de alarma de la pantalla: quien lo estaba viendo pensaría que la alarma
       * se ha ido. Se conserva lo último que se supo y se reintenta a la
       * siguiente ronda.
       *
       * Y no se pinta como avería porque este panel es aditivo: el tablero
       * funciona igual sin él, y un error rojo por una lectura perdida enseña
       * a ignorar los errores rojos.
       */
      if (vivo.current && disponible === null) setDisponible(false);
    }
  }, [disponible]);

  useEffect(() => {
    vivo.current = true;
    consultar();

    const id = setInterval(consultar, MS_ENTRE_SONDEOS);
    return () => {
      vivo.current = false;
      clearInterval(id);
    };
    // `consultar` cambia con `disponible`, y reiniciar el intervalo por eso
    // desplazaría la cadencia. Sólo importa montarlo una vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { activas, disponible, refrescar: consultar };
}

/**
 * La severidad de ICONICS (0 a 1000) en palabras.
 *
 * Se traduce porque «severidad 800» no le dice nada a nadie que no viva dentro
 * de OPC A&E, y porque es lo que decide si el aviso se pinta en rojo o en
 * ámbar. Los cortes son los del estándar: 800 en adelante es la franja alta,
 * que es donde cae la alarma real de esta instalación.
 */
export function nivelDeSeveridad(severidad) {
  const n = Number(severidad) || 0;
  if (n >= 800) return { clave: "alta", label: "Alta" };
  if (n >= 500) return { clave: "media", label: "Media" };
  return { clave: "baja", label: "Baja" };
}

/**
 * La pregunta que se manda al pulsar una alarma.
 *
 * Lleva el nombre EXACTO y la hora de activación, y eso no es cosmético: son
 * los dos datos con los que el asistente puede encontrar la ventana correcta
 * del historiador. Un «¿por qué falló la bomba?» genérico le obliga a adivinar
 * cuándo mirar, y adivinando mira las últimas seis horas por defecto — que en
 * una alarma de hace tres días no contienen absolutamente nada.
 */
export function preguntaDeDiagnostico(alarma) {
  const cuando = alarma?.desde ? ` Se activó el ${alarma.desde}.` : "";
  return (
    `¿Por qué se disparó la alarma "${alarma.alarma}"?${cuando} ` +
    `Investiga qué pasó con las señales alrededor de ese momento y dime qué pudo causarlo.`
  );
}
