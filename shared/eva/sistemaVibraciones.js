/**
 * La forma `Sistema` del SISTEMA DE VIBRACIONES: de puntos sueltos al objeto
 * que consumen las reglas, las vistas y el asistente.
 *
 * Es el equivalente de `sistema.js` para la otra máquina. Y existe por la misma
 * razón que aquel, más una que sólo se ve mirando los dos programas a la vez:
 *
 * ── EL BUCLE ESTABA ESCRITO DOS VECES ──────────────────────────────
 *
 * Recorrer los tres canales × cinco familias, decodificar las vigilancias,
 * juntar el variador y los contadores de alarma — eso estaba a mano en
 * `Demo-EVA/data/vibracion.js` (frontend) y otra vez en
 * `backend/ia/herramientas.mjs`. Dos copias del mismo recorrido sobre el mismo
 * catálogo, y el síntoma de que divergieran no sería un error: sería el chat
 * contestando sobre un apoyo con los datos de otro, con marcas de tiempo
 * correctas y sin una línea en el log.
 *
 * Es el mismo argumento que subió `senales.js` a `shared/` en su día, aplicado
 * a la máquina que llegó después.
 *
 * ── LA FRONTERA DE CALIDAD SE QUEDA FUERA ──────────────────────────
 *
 * Este archivo recibe `valorDe(punto)`, una función que ya devuelve el valor
 * saneado o `null`. Filtrar la calidad es cosa de quien habla con el
 * transporte —el motor de sondeo en el frontend, la capa de herramientas en el
 * backend—, y cada uno recibe la respuesta con una envoltura distinta.
 *
 * Lo que sí es de aquí es la otra mitad de esa decisión: qué se considera «sin
 * dato». Un `null` no se convierte nunca en cero, y los puntos que no
 * entregaron se cuentan en `sinDato` para que la pantalla pueda distinguir «la
 * máquina está tranquila» de «la máquina no está contestando», que se ven igual
 * si sólo se miran los riesgos activos.
 */
import {
  BANDERAS,
  CALIDADES,
  CANALES,
  CONTADORES_ALARMA,
  MEDIDAS,
  VARIADOR,
  VIGILANCIAS,
  decodificarVigilancia,
  puntoAlarma,
  puntoBandera,
  puntoCalidad,
  puntoMedida,
  puntoSensor,
  puntoVariador,
  puntoVigilancia,
} from "./vibraciones.js";

/**
 * Construye el estado de vibración a partir de un lector de puntos.
 *
 * @param {(punto: string) => any} valorDe  valor ya saneado, o `null`
 * @returns {{canales, variador, alarmas, sinDato: string[], puntosPedidos: number}}
 *
 * La forma de `canales[id]` es la que espera `evaluarRiesgosVibracion`:
 * las cuatro medidas y las tres banderas planas, más `vigilancias`,
 * `calidades` y `sensor` ya decodificados.
 *
 * Los estados de vigilancia se decodifican AQUÍ, en la frontera, y no en las
 * reglas: el base64 del módulo es un detalle del transporte, y el motor de
 * riesgos no tiene por qué saber que existe. Lo que le llega es «apagado» o
 * «en orden».
 */
export function createSistemaVibraciones(valorDe) {
  const sinDato = [];

  /** Lee un punto y lo apunta si no entregó. */
  const leer = (punto) => {
    const v = valorDe(punto);
    if (v === null || v === undefined) {
      sinDato.push(punto);
      return null;
    }
    return v;
  };

  /** Igual, pero para los que llegan como base64 de un estado. */
  const leerEstado = (punto) => {
    const estado = decodificarVigilancia(valorDe(punto));
    if (estado === null) sinDato.push(punto);
    return estado;
  };

  let puntosPedidos = 0;

  const canales = {};
  for (const c of CANALES) {
    const d = {};
    for (const m of MEDIDAS) d[m.key] = leer(puntoMedida(m.key, c.id));
    for (const b of BANDERAS) d[b.key] = leer(puntoBandera(b.key, c.id));

    d.vigilancias = {};
    for (const v of VIGILANCIAS) d.vigilancias[v.key] = leerEstado(puntoVigilancia(v.key, c.id));

    d.calidades = {};
    for (const q of CALIDADES) d.calidades[q.key] = leer(puntoCalidad(q.key, c.id));

    d.sensor = leerEstado(puntoSensor(c.id));

    canales[c.id] = d;
    puntosPedidos += MEDIDAS.length + BANDERAS.length + VIGILANCIAS.length + CALIDADES.length + 1;
  }

  const variador = {};
  for (const v of VARIADOR) variador[v.key] = leer(puntoVariador(v.key));
  puntosPedidos += VARIADOR.length;

  /*
   * Los contadores del servidor de alarmas. Van aparte de `variador` y de
   * `canales` porque no son de la máquina: son de ICONICS, que vigila esta
   * área con 57 alarmas configuradas por quien conoce el proceso.
   */
  const alarmas = {};
  for (const a of CONTADORES_ALARMA) alarmas[a.key] = leer(puntoAlarma(a.key));
  puntosPedidos += CONTADORES_ALARMA.length;

  return { canales, variador, alarmas, sinDato, puntosPedidos };
}
