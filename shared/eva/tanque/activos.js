/**
 * Los activos del sistema de agua, y qué señal compone cada uno.
 *
 * ── POR QUÉ EXISTE ESTA CAPA ───────────────────────────────────────
 *
 * Bajo `ac:TDCON/DEMO/` no hay equipos ni `.ChildEquipmentNames`: hasta el
 * 09-09-2026 el servidor entregaba **ocho números sueltos**; desde entonces
 * entrega sesenta y seis, repartidos en trece carpetas — pero esas carpetas
 * son las SECCIONES del programa del PLC (`Lista-variables.pdf`), no equipos
 * físicos, y agruparlas tal cual sería mostrar cómo está escrito el código,
 * no qué hay en el banco. Ver `docs/completados/PLAN-27-VARIABLES-DEL-TANQUE.md` §0.2.3.
 * La vista de planta necesita «cosas» que enseñar y que se puedan pulsar,
 * igual que la maqueta necesita objetos que colocar en el suelo.
 *
 * Así que la agrupación **es nuestra, no del servidor**, y conviene que quede
 * escrito aquí y no sólo en el plan. Es honesta porque no inventa ni un valor:
 * cada activo muestra exactamente las señales que lo componen, y si mañana el
 * servidor publica EQUIPOS de verdad —no secciones de programa— se sustituye
 * este archivo y ninguna vista se entera. Es la misma promesa que hace hoy
 * `features/three-d/lib/layout.js` con las coordenadas inventadas de la
 * maqueta.
 *
 * ── POR QUÉ POR PREGUNTA, Y NO UNA TARJETA POR SEÑAL ────────────────
 *
 * Una tarjeta por señal daría sesenta y seis cajas idénticas sin jerarquía: la
 * pantalla volvería a ser la lista de tags que ya es la vista de Assets.
 * Agrupando por PREGUNTA —¿hay agua?, ¿se está impulsando?, ¿sale?, ¿con qué
 * energía?, ¿por dónde circula?, ¿está habilitado?— cada tarjeta responde
 * algo, y el orden de abajo es el del recorrido físico del agua, que es como
 * lo cuenta quien opera la instalación.
 *
 * ── LOS DOS ACTIVOS DE F5, Y POR QUÉ NO ANTES ──────────────────────
 *
 * `CONTROL` y `PARO_DE_EMERGENCIA` (`SEGURIDAD/`) entraron al catálogo en el
 * Plan 27 F3, colgados PROVISIONALMENTE de `electrico` —el activo del
 * armario, donde suele montarse un mando/paro real—, precisamente para no
 * arrastrar el cambio de cuatro a seis activos a una fase que no lo pedía.
 * F5 es donde se paga ese coste de una vez, con las señales de las válvulas
 * también listas: los dos activos nuevos, «Seguridad» (recoge lo que estaba
 * provisional en `electrico`) y «Válvulas y aire» (las dos electroválvulas y
 * la bomba de aire, que hasta ahora no tenían ningún hogar).
 *
 * `MANDO_DEL_VARIADOR_VFD/` queda con cinco puntos SIN catalogar
 * (`DP_ESTADO_VFD`, `FRECUENCIA_VFD`, `MTTO_VFD`, `RESET_FALLA_VFD`,
 * `START_STOP_VFD`) — encajarían en `bombeo`, que ya existe, pero ninguna
 * fase de F0 a F5 los pide explícitamente
 * (`docs/completados/PLAN-27-VARIABLES-DEL-TANQUE.md` §1, tabla de F5) y añadirlos aquí
 * sería ensanchar el alcance sin que el plan lo haya decidido. Quedan
 * pendientes para cuando se revise esa rama.
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
  // Plan 27 F5.
  {
    id: "valvulasYAire",
    label: "Válvulas y aire",
    corto: "Válvulas",
    pregunta: "¿Por dónde está circulando, y en qué modo?",
  },
  {
    id: "seguridad",
    label: "Seguridad",
    corto: "Seguridad",
    pregunta: "¿Está el proceso habilitado, y se puede arrancar?",
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

