/**
 * Los cuatro activos del sistema de agua, y qué señal compone cada uno.
 *
 * ── POR QUÉ EXISTE ESTA CAPA ───────────────────────────────────────
 *
 * El servidor entrega **ocho números sueltos**: no hay equipos, ni carpetas, ni
 * `.ChildEquipmentNames` bajo `ac:TDCON/DEMO/SENSORES/`. Y la vista de planta
 * necesita «cosas» que enseñar y que se puedan pulsar, igual que la maqueta
 * necesita objetos que colocar en el suelo.
 *
 * Así que la agrupación **es nuestra, no del servidor**, y conviene que quede
 * escrito aquí y no sólo en el plan. Es honesta porque no inventa ni un valor:
 * cada activo muestra exactamente las señales que lo componen, y si mañana el
 * servidor publica equipos de verdad se sustituye este archivo y ninguna vista
 * se entera. Es la misma promesa que hace hoy `features/three-d/lib/layout.js`
 * con las coordenadas inventadas de la maqueta.
 *
 * ── POR QUÉ CUATRO Y NO OCHO ───────────────────────────────────────
 *
 * Una tarjeta por señal daría ocho cajas idénticas sin jerarquía: la pantalla
 * volvería a ser la lista de tags que ya es la vista de Assets. Agrupando por
 * PREGUNTA —¿hay agua?, ¿se está impulsando?, ¿sale?, ¿con qué energía?— cada
 * tarjeta responde algo, y el orden de abajo es el del recorrido físico del
 * agua, que es como lo cuenta quien opera la instalación.
 *
 * Aquí no hay iconos ni colores: esto es dominio, se prueba en node y no
 * importa React. La presentación vive en `components/`.
 */
import { SENALES, SENAL_KEYS } from "./senales.js";

const CATALOGO = [
  {
    id: "tanque",
    label: "Tanque de almacenamiento",
    corto: "Tanque",
    pregunta: "¿Hay agua, y en qué condiciones?",
  },
  {
    id: "bombeo",
    label: "Grupo de bombeo",
    corto: "Bombeo",
    pregunta: "¿Se está impulsando, y quién manda?",
  },
  {
    id: "distribucion",
    label: "Red de distribución",
    corto: "Distribución",
    pregunta: "¿Sale agua, y con qué presión?",
  },
  {
    id: "electrico",
    label: "Suministro eléctrico",
    corto: "Eléctrico",
    pregunta: "¿Con qué calidad de energía?",
  },
];

/**
 * Las señales de cada activo se derivan del campo `activo` del catálogo de
 * señales, y no se repiten aquí: una lista escrita a mano en dos sitios es una
 * lista que acaba desincronizada, y el modo de fallo sería una señal que
 * desaparece de la pantalla sin que nadie lo note.
 */
export const ACTIVOS = Object.fromEntries(
  CATALOGO.map((a) => [
    a.id,
    { ...a, senales: SENAL_KEYS.filter((k) => SENALES[k].activo === a.id) },
  ])
);

/** Ids en orden de presentación: el recorrido del agua. */
export const ACTIVO_IDS = CATALOGO.map((a) => a.id);

/** Metadatos de un activo. `null` ante un id desconocido. */
export const activoInfo = (id) => ACTIVOS[id] ?? null;

