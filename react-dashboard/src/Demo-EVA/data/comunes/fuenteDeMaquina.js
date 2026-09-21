/**
 * La fuente de datos en vivo de una máquina CONFIGURADA: un motor de sondeo
 * sobre sus variables, y la forma de dominio que las vistas esperan.
 * Plan 37 F2.
 *
 * ── QUÉ HACE, Y QUÉ NO ────────────────────────────────────────────
 *
 * Es el gemelo de `vibracionSource.js` para una máquina que no está escrita
 * en código. Aquél sondea los 73 puntos del catálogo y construye
 * `{canales, variador, alarmas}` con `createSistemaVibraciones`; éste sondea
 * las variables de la configuración y construye la MISMA forma con
 * `dominioDesdeRoles` —la equivalencia está medida (Plan 34 F3: 66 valores
 * idénticos)—. Las vistas no distinguen cuál de los dos las alimenta.
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
 * ── EL ORIGEN SIMULADO NO SABE DE ESTA MÁQUINA ────────────────────
 *
 * El simulador reproduce las máquinas escritas a mano, que declaran
 * `modelo()`. Una configurada no tiene modelo, y fingirle valores sería
 * inventar lo que falta (`CLAUDE.md` §2.5). Con el origen simulado esta fuente
 * falla en la lectura con un motivo que la vista pinta tal cual.
 */
import { createPollingEngine, createRealTransport, TRANSPORTES } from "@/lib/iconics";
import { dominioDesdeRoles } from "@shared/eva/comun/dominioDesdeRoles.js";
import { canalesDeMaquina, contadoresDeMaquina } from "@shared/eva/comun/vistaDeMaquina.js";
import { tipoDe } from "@shared/eva/tipos/index.js";

/** El transporte de una máquina configurada para un origen dado. */
export function transporteDeConfigurada(maquina, clase) {
  if (clase !== TRANSPORTES.SIMULADO) return createRealTransport();
  return {
    async read() {
      throw new Error(
        `El origen simulado no conoce la máquina configurada «${maquina?.nombre ?? maquina?.id}»: ` +
          "el simulador sólo reproduce las máquinas escritas en el código. Cambia al origen real " +
          "para verla.",
      );
    },
  };
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

    let lastUpdated = null;
    for (const punto of puntos) {
      const recibido = motor.get(punto).receivedAt;
      if (recibido && (!lastUpdated || recibido > lastUpdated)) lastUpdated = recibido;
    }

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

  return {
    subscribeVibracion(cb) {
      const baja = motor.acquire(puntos);
      motor.start();
      const off = motor.onUpdate(() => cb(instantanea()));
      cb(instantanea());
      return () => {
        off();
        baja();
      };
    },
    stop: motor.stop,
    stats: motor.stats,
    puntos: () => puntos,
  };
}

/* ── La caché por máquina y transporte ───────────────────────────── */

const fuentes = new Map();

/** La clave cambia con la configuración: editar la máquina rehace el motor. */
const claveDe = (maquina, clase) =>
  `${clase}|${maquina.id}|${maquina.revisada ?? ""}|${(maquina.variables ?? []).length}`;

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
