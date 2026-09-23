/**
 * La fuente de datos en vivo de una máquina CONFIGURADA: un motor de sondeo
 * sobre sus variables, y la forma de dominio que las vistas esperan.
 * Plan 37 F2.
 *
 * ── QUÉ HACE, Y QUÉ NO ────────────────────────────────────────────
 *
 * Nació como gemelo de `vibracionSource.js`, la fuente de la máquina de
 * vibraciones escrita a mano: aquélla sondeaba los 73 puntos del catálogo y
 * construía `{canales, variador, alarmas}` con `createSistemaVibraciones`;
 * ésta sondea las variables de la configuración y construye la MISMA forma
 * con `dominioDesdeRoles` —la equivalencia está medida (Plan 34 F3: 66
 * valores idénticos)—. Desde el Plan 40 la escrita a mano no existe y ésta
 * es la única fuente de una máquina de vibraciones.
 *
 * No decide nada del dominio: qué rol es cada variable lo dice la
 * configuración, cómo se coloca lo dice `dominioDesdeRoles`, qué apoyos hay lo
 * dice `canalesDeMaquina`. Aquí sólo hay red y reloj.
 *
 * ── UN MOTOR POR MÁQUINA ──────────────────────────────────────────
 *
 * `sistemas.js` lo declara innegociable: un motor de sondeo POR SISTEMA, y la
 * unificación es del código, nunca del lote. Cada máquina configurada abre el
 * suyo con sus puntos y su `cadenciaMs`; dos máquinas nunca comparten
 * petición. La caché es por máquina y transporte, y se invalida cuando la
 * configuración cambia (`revisada`, número de variables): editar la máquina
 * no puede dejar un motor viejo leyendo puntos que ya no son suyos.
 *
 * ── EL ORIGEN SIMULADO SIMULA CON LA FÍSICA DEL TIPO (Plan 40 F0) ──
 *
 * Hasta el 21-09-2026 esta fuente se negaba con el origen simulado: «el
 * simulador sólo reproduce las máquinas escritas en el código». La física
 * era del tipo desde el principio; sólo sabía leer los tags de la escrita a
 * mano. Ahora `construirSistema(...).modelo` traduce cada variable a su
 * descriptor por rol y apoyo y el tipo simula, así que una configurada se
 * ve en «Simulado» igual que se veía la escrita a mano. Lo que el tipo no
 * sabe simular (el estado del sensor) sigue siendo hueco, nunca cero.
 *
 * ── TAMBIÉN LA FORMA COMÚN, EL BÚFER Y LA HISTORIA (Plan 42.5 F1, D8) ──
 *
 * Hasta el 22-09-2026 esta fuente entregaba SÓLO el dominio de vibraciones.
 * Una vista genérica —Planta, Detalle— necesita además una lectura por
 * variable con su fecha, el búfer de sesión para «Tiempo real» y un lector
 * del historiador que sepa de esta máquina. Se añaden AQUÍ, sobre el mismo
 * motor, y no en un hook aparte que abriera el suyo: serían dos motores
 * sobre los mismos puntos cada vez que Planta y el banner coincidieran, que
 * es exactamente lo que «un motor por máquina» prohíbe. `subscribeVibracion`
 * no cambia de forma; `estado` (la forma común de `estadoMaquina.js`) viaja
 * en la misma instantánea, y `buffer`, `lecturaDe`, `leerSerie` y
 * `leerSeries` cuelgan de la fuente.
 *
 * Quién lee el pasado se decide aquí y una sola vez, igual que en
 * `evaSource.js`: el transporte simulado trae su `readSerie`; el real no, y
 * se cae al historiador por HTTP. La guarda de «tiene serie verificada» se
 * aplica ANTES en los dos caminos (`motivoSinSerie`): en simulado, una
 * variable sin serie tampoco dibuja, o la pantalla simulada prometería lo
 * que la real no da.
 */
import { createPollingEngine, createRealTransport, createTransporteSimulado, presetCaos, TRANSPORTES } from "@/lib/iconics";
import { construirSistema } from "@shared/eva/comun/construirSistema.js";
import { dominioDesdeRoles } from "@shared/eva/comun/dominioDesdeRoles.js";
import { canalesDeMaquina, contadoresDeMaquina } from "@shared/eva/comun/vistaDeMaquina.js";
import { tipoDe } from "@shared/eva/tipos/index.js";

import { createBufferRodante } from "../../lib/buffer.js";
import {
  leerSerie as leerSerieDelHistoriador,
  leerSeries as leerSeriesDelHistoriador,
  motivoSinSerie,
} from "./historia.js";

/** El transporte de una máquina configurada para un origen dado. */
export function transporteDeConfigurada(maquina, clase, tipo = tipoDe(maquina?.tipo)) {
  if (clase !== TRANSPORTES.SIMULADO) return createRealTransport();
  /*
   * Hasta el Plan 40 F0 esto se NEGABA: «el simulador sólo reproduce las
   * máquinas escritas en el código». La física era del tipo desde el
   * principio, sólo que parseaba los tags de la escrita a mano; ahora la
   * entrada construida traduce cada variable a su descriptor por rol y apoyo
   * y el tipo simula. Un tipo sin `simular` sigue dando huecos, no ceros.
   */
  const entrada = construirSistema(maquina, tipo);
  return createTransporteSimulado({
    modelo: entrada.modelo,
    chaos: presetCaos(),
    etiqueta: `simulador · ${maquina?.nombre ?? maquina?.id}`,
  });
}

/**
 * @param {object} opciones
 * @param {object} opciones.maquina   la configuración
 * @param {object} [opciones.tipo]    su tipo; por defecto `tipoDe(maquina.tipo)`
 * @param {object} opciones.transport `{ read(puntos) }`
 * @param {number} [opciones.intervalMs]  por defecto `maquina.cadenciaMs`
 */
export function createFuenteDeMaquina({ maquina, tipo = tipoDe(maquina?.tipo), transport, intervalMs }) {
  if (!maquina?.id) throw new Error("createFuenteDeMaquina necesita una máquina con id.");
  if (!transport?.read) throw new Error("createFuenteDeMaquina requiere un transporte con read()");
  if (!tipo) {
    throw new Error(
      `createFuenteDeMaquina: la máquina «${maquina.id}» declara el tipo «${maquina.tipo}», que este ` +
        "programa no conoce. Sin tipo no hay roles ni forma de dominio con la que pintarla.",
    );
  }

  const puntos = (maquina.variables ?? []).map((v) => v.pointName).filter(Boolean);
  const motor = createPollingEngine({ read: transport.read, intervalMs: intervalMs ?? maquina.cadenciaMs ?? 5000 });

  /* El `sistema` de esta máquina, construido UNA vez: es quien sabe qué
     claves tienen serie verificada, con qué nombre se piden y cómo se
     proyecta cada lectura a la forma común. */
  const sistema = construirSistema(maquina, tipo);
  const puntoDeClave = new Map((maquina.variables ?? []).map((v) => [v.id ?? v.pointName, v.pointName]));
  const buffer = createBufferRodante();

  /** La forma común de `estadoMaquina.js` para las lecturas de este instante. */
  function estadoActual(lastUpdated) {
    return sistema.estado((punto) => motor.get(punto).value, sistema, lastUpdated);
  }

  /** `{ valor, receivedAt, stale, motivo }` de una clave, o `null` si no es de esta máquina. */
  function lecturaDe(clave) {
    const punto = puntoDeClave.get(clave);
    if (!punto) return null;
    const l = motor.get(punto);
    return { valor: l.value, receivedAt: l.receivedAt, stale: l.stale, motivo: l.motivo ?? null };
  }

  /** La marca más reciente entre los puntos de la máquina, o `null` si nada llegó. */
  function ultimaMarca() {
    let lastUpdated = null;
    for (const punto of puntos) {
      const recibido = motor.get(punto).receivedAt;
      if (recibido && (!lastUpdated || recibido > lastUpdated)) lastUpdated = recibido;
    }
    return lastUpdated;
  }

  /* El búfer se alimenta con CADA lectura del motor, no con cada suscriptor:
     así «Tiempo real» tiene la misma historia de sesión lo mire una vista o
     tres. `push` descarta la marca repetida, así que un ciclo sin dato nuevo
     no duplica el último punto. */
  motor.onUpdate(() => {
    const marca = ultimaMarca();
    if (!marca) return;
    const estado = estadoActual(marca);
    buffer.push({ receivedAt: marca, lista: estado.senales.map((s) => ({ key: s.clave, valor: s.valor })) });
  });

  /**
   * Quién lee el pasado, decidido una vez por transporte. En los dos caminos
   * la guarda va primero: una clave sin serie verificada no llega ni al
   * simulador ni al historiador.
   */
  const leerSerie = transport.readSerie
    ? async (clave, rango, opciones = {}) => {
        const motivo = motivoSinSerie(sistema, clave);
        if (motivo) return { datos: [], motivo, hasMore: false, cobertura: null };
        void opciones; // `crudo` no aplica al simulador: no hay agregado que quitar.
        return transport.readSerie(puntoDeClave.get(clave), rango);
      }
    : (clave, rango, opciones) => leerSerieDelHistoriador(sistema, clave, rango, opciones);

  const leerSeries = transport.readSerie
    ? async (claves, rango) =>
        Object.fromEntries(await Promise.all(claves.map(async (c) => [c, await leerSerie(c, rango)])))
    : (claves, rango) => leerSeriesDelHistoriador(sistema, claves, rango);
  const canalesMeta = canalesDeMaquina(maquina, tipo);
  const contadores = contadoresDeMaquina(maquina, tipo.contadoresAlarma ?? []);
  const leerEstado = tipo.decodificarVigilancia
    ? (punto) => tipo.decodificarVigilancia(motor.get(punto).value)
    : null;

  function instantanea() {
    const valorDe = (punto) => motor.get(punto).value;

    /* Los contadores del área, si la máquina los marcó. `null` cuando no hay
       ninguno: `dominioDesdeRoles` lo declara en `sinRoles`, y las reglas de
       alarma no disparan sobre un `{}` que parecería «ninguna activa». */
    const alarmas = Object.keys(contadores).length
      ? Object.fromEntries(Object.entries(contadores).map(([clave, punto]) => [clave, valorDe(punto)]))
      : null;

    const dominio = dominioDesdeRoles(maquina, tipo, valorDe, { leerEstado, alarmas });

    const lastUpdated = ultimaMarca();

    /*
     * Los puntos mudos son los DE LA MÁQUINA sin lectura. `dominio.sinDato`
     * mezcla dos cosas —puntos que no contestaron y roles que la máquina no
     * declara— y aquí importa la primera: es la que separa «nada que decir»
     * de «nadie ha contestado».
     */
    const porMotivo = {};
    const detalleSinDato = [];
    for (const punto of puntos) {
      const lectura = motor.get(punto);
      if (lectura.value !== null && lectura.value !== undefined) continue;
      const codigo = lectura.motivo?.codigo ?? "sin_lectura";
      porMotivo[codigo] = (porMotivo[codigo] ?? 0) + 1;
      detalleSinDato.push({ punto, motivo: lectura.motivo ?? null });
    }

    const stats = motor.stats();
    const conDato = lastUpdated !== null;

    return {
      canales: dominio.canales,
      variador: dominio.variador,
      alarmas: dominio.alarmas,
      sinRoles: dominio.sinRoles,
      loading: !conDato && !stats.ultimoError,
      error: conDato ? null : stats.ultimoError ?? null,
      lastUpdated,
      puntosSinDato: detalleSinDato.map((d) => d.punto),
      detalleSinDato,
      sinDatoPorMotivo: porMotivo,
      puntosPedidos: puntos.length,
      /* La forma común (Plan 42.5 F1, D8): una señal por variable con valor,
         estado, banda y `historia`. Es lo que leen las vistas genéricas; las
         de vibraciones siguen con `canales`/`variador`/`alarmas`. */
      estado: estadoActual(lastUpdated),
      /* Lo que la vista necesita además del dominio, y que la escrita a mano
         saca de su catálogo. */
      canalesMeta,
      maquina: {
        id: maquina.id,
        nombre: maquina.nombre ?? maquina.id,
        configurada: true,
        area: maquina.arboles?.alarmas ?? null,
      },
    };
  }

  function subscribe(cb) {
    const baja = motor.acquire(puntos);
    motor.start();
    const off = motor.onUpdate(() => cb(instantanea()));
    cb(instantanea());
    return () => {
      off();
      baja();
    };
  }

  return {
    /** La instantánea entera (dominio de vibraciones + forma común) en cada lectura. */
    subscribe,
    /** El nombre histórico de `subscribe`: lo usan las vistas de vibraciones. */
    subscribeVibracion: subscribe,
    stop: motor.stop,
    stats: motor.stats,
    puntos: () => puntos,
    /** El `sistema` del registro para esta máquina (`construirSistema`). */
    sistema,
    /** Búfer de sesión por clave, para «Tiempo real» sin historiador. */
    buffer,
    lecturaDe,
    leerSerie,
    leerSeries,
  };
}

/* ── La caché por máquina y transporte ───────────────────────────── */

const fuentes = new Map();

/**
 * La clave cambia con la configuración: editar la máquina rehace el motor.
 *
 * Lleva también el nombre de la máquina y el nombre y los alias de cada asset
 * (Plan 42.5 F6): renombrar un apoyo no cambia `revisada` ni el número de
 * variables, y con la clave de antes una Planta o un Detalle abiertos seguían
 * enseñando «S1» hasta recargar la página, porque el `sistema` cacheado
 * había compuesto sus rótulos con el nombre viejo.
 */
const huellaDeNombres = (maquina) =>
  [maquina.nombre ?? "", ...(maquina.assets ?? []).map((a) => `${a.id}=${a.nombre ?? ""}/${(a.alias ?? []).join(",")}`)].join(";");
const claveDe = (maquina, clase) =>
  `${clase}|${maquina.id}|${maquina.revisada ?? ""}|${(maquina.variables ?? []).length}|${huellaDeNombres(maquina)}`;

export function fuenteDeMaquinaConfigurada(maquina, clase) {
  const clave = claveDe(maquina, clase);
  if (!fuentes.has(clave)) {
    /* Una versión anterior de la misma máquina se apaga antes de abrir la
       nueva: dos motores sobre la misma máquina serían dos lotes por ciclo. */
    for (const [k, f] of fuentes) {
      if (k.startsWith(`${clase}|${maquina.id}|`)) {
        f.stop();
        fuentes.delete(k);
      }
    }
    fuentes.set(clave, createFuenteDeMaquina({ maquina, transport: transporteDeConfigurada(maquina, clase) }));
  }
  return fuentes.get(clave);
}

export function olvidarFuentesDeMaquina() {
  for (const f of fuentes.values()) f.stop();
  fuentes.clear();
}
