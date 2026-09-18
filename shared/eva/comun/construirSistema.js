/**
 * De una máquina CONFIGURADA a una entrada del registro. Plan 33 F3.
 *
 * ── LA PIEZA QUE CIERRA LA FASE ────────────────────────────────────
 *
 * `sistemas.js` es un registro de entradas ejecutables. Hasta ahora esas
 * entradas se escribían a mano —1 414 líneas el tanque, 1 154 vibraciones— y
 * eso es lo que hace que dar de alta una máquina sea programar en vez de
 * configurar.
 *
 * Este archivo construye una entrada equivalente a partir de dos cosas que ya
 * existen: la CONFIGURACIÓN de la máquina (`datos/maquinas.json`, F2) y su
 * TIPO (`shared/eva/tipos/`, F1).
 *
 * ── LO QUE NO CAMBIA, Y ES EL PUNTO ────────────────────────────────
 *
 * `SISTEMAS` sigue siendo el mismo array que importa medio proyecto, con las
 * mismas funciones y la misma validación que lanza al cargar. Una entrada
 * construida aquí tiene que ser **indistinguible** de una escrita a mano para
 * todo lo que la consume: el transporte falso, el asistente, el motor de
 * sondeo y el de diagnóstico.
 *
 * Por eso la prueba central de esta fase es de EQUIVALENCIA, no de
 * funcionalidad: lo que hay que demostrar no es que esto funcione, es que se
 * comporta igual.
 *
 * ── EL CONTRATO DE TRES ESTADOS, QUE ES LO QUE MÁS CUESTA ──────────
 *
 * `modelo(nombre, ms)` tiene que distinguir:
 *
 *   `undefined`  el punto NO es de esta máquina
 *   `null`       es suyo y ahora no entrega valor
 *   otra cosa    el valor
 *
 * «Las dos primeras no son lo mismo y no pueden colapsarse»
 * (`sistemas.js`). Colapsarlas produce el fallo que este proyecto ya cometió
 * DOS veces: una máquina nueva sirviendo `value: null` con calidad BUENA. La
 * pantalla no ve un fallo; ve una máquina que contesta y no dice nada.
 *
 * Una máquina configurada **no tiene física simulada** —nadie ha escrito su
 * `simulador.js`— y aquí está la tentación: devolver `null` para todo lo suyo
 * es lo cómodo, y es lo correcto. `lecturaSimulada` en `fakeClient.mjs`
 * traduce ese `null` a **calidad de sin-dato y sin `value`**, que es
 * exactamente lo que hace el servidor real con un punto que no entrega. Lo que
 * NO se puede hacer es devolver un cero, ni un valor inventado, ni `undefined`
 * para un punto que sí es suyo.
 *
 * ── LO QUE ESTE ARCHIVO NO HACE ────────────────────────────────────
 *
 * No lee disco, no toca red y no registra nada: recibe la configuración ya
 * leída y devuelve un objeto. Quien la lee es
 * `backend/ia/indices/maquinas.mjs`, y quien decide meterla en `SISTEMAS` es
 * `registrarSistema()`.
 */
import { capacidadesDe, permiteEscritura } from "./configuracionMaquina.js";
import { estadoComun, senalComun } from "./estadoMaquina.js";

/**
 * Índice de una máquina configurada: sus puntos y cómo se resuelve cada uno.
 *
 * Se calcula UNA vez al construir, y no en cada llamada, porque `parse()` y
 * `modelo()` se llaman por punto y por ciclo de sondeo — con 73 puntos cada 5
 * segundos, recorrer el array en cada una sería el mismo trabajo repetido
 * miles de veces por minuto.
 */
function indexar(maquina) {
  const porPunto = new Map();
  const porClave = new Map();

  for (const v of maquina.variables ?? []) {
    if (!v?.pointName) continue;

    /* La CLAVE de dominio de una variable configurada es su `id`: es lo que
       los casos previos, los riesgos y el asistente usan para nombrarla. */
    const clave = v.id ?? v.pointName;
    porPunto.set(v.pointName, { ...v, clave });
    porClave.set(clave, { ...v, clave });
  }

  return { porPunto, porClave };
}

/**
 * Una entrada de `SISTEMAS` a partir de su configuración y su tipo.
 *
 * @param {object} maquina  la configuración, ya validada
 * @param {object} tipo     su tipo, de `shared/eva/tipos/`
 * @returns {object} la entrada del registro
 */
export function construirSistema(maquina, tipo) {
  if (!maquina?.id) {
    throw new Error(
      "construirSistema: la configuración no trae `id`. Una entrada sin id no se puede " +
        "resolver por `SISTEMA[id]` y quedaría en el registro sin que nadie pueda pedirla.",
    );
  }
  /*
   * El mensaje nombra el tipo QUE SE PIDIÓ, no `maquina.tipo`: quien llama
   * pasa `tipoDe(algo)`, y si ese algo no existe llega `null` — citar
   * `maquina.tipo` diría «el tipo vibraciones no está declarado» aunque sí lo
   * esté, señalando al sitio equivocado.
   */
  if (!tipo) {
    throw new Error(
      `construirSistema: no se pasó un tipo para «${maquina.id}». Quien llama resuelve el ` +
        "tipo con `tipoDe(id)`, y un `null` ahí significa que ese tipo no está declarado. " +
        "Sin tipo no hay reglas, ni roles, ni forma de estado: la máquina aparecería en el " +
        "registro sin saber contestar nada.",
    );
  }

  const { porPunto, porClave } = indexar(maquina);
  const raices = (maquina.assets ?? []).map((a) => a.pointName).filter(Boolean);
  const puntos = [...porPunto.keys()];

  /* Sólo las VERIFICADAS. Una serie declarada y no comprobada puede ser la de
     otra señal — el servidor contesta y devuelve la equivocada, medido en las
     dos máquinas escritas a mano. */
  const conSerie = (maquina.variables ?? []).filter(
    (v) => v.historyVerified && v.historyPointName,
  );
  const clavesConSerie = conSerie.map((v) => v.id ?? v.pointName);

  return {
    id: maquina.id,
    nombre: maquina.nombre ?? maquina.id,
    maquina: tipo.descripcion ?? tipo.nombre ?? null,
    plc: maquina.plc ?? null,

    /** Que esta entrada vino de configuración, y no de un módulo escrito. */
    configurada: true,
    tipo: tipo.id,

    raices,
    puntos: () => puntos,

    /**
     * Punto → identidad dentro de la máquina, o `null`.
     *
     * El `null` ante un punto desconocido es deliberado y no un descuido: un
     * tag borrado en el servidor sigue empezando por la raíz correcta, y tiene
     * que verse como dato ausente y **nunca como otra señal**.
     */
    parse: (nombre) => {
      const v = porPunto.get(nombre);
      return v ? { tipo: "senal", clave: v.clave, canal: null } : null;
    },

    /**
     * ── SIN FÍSICA SIMULADA, Y DICIÉNDOLO ──────────────────────────
     *
     * Una máquina configurada no trae simulador: nadie ha escrito su física.
     * Así que con `ICONICS_FAKE=true` sus puntos se sirven con **calidad de
     * sin-dato y sin valor**, que es lo que hace el servidor real con un punto
     * que no entrega.
     *
     * Los tres estados se respetan enteros, y es lo que impide el fallo
     * histórico: `undefined` para lo ajeno —para que el transporte lo deje
     * fuera de la respuesta— y `null` para lo propio, que es lo que produce el
     * hueco honesto. Un `0` aquí habría pintado una máquina «a cero» en vez de
     * una máquina sin datos.
     */
    modelo: (nombre) => (porPunto.has(nombre) ? null : undefined),

    /**
     * El estado en la forma común.
     *
     * No lo construye el tipo: `tipo.estado` está escrito contra la forma de
     * dominio de la máquina escrita a mano —`{canales, variador, alarmas}` en
     * vibraciones— y una máquina configurada no tiene esa forma, tiene una
     * lista plana de variables con su rol.
     *
     * Construir aquí la forma común es lo honesto mientras las reglas no
     * consuman `estadoMaquina.js` directamente (F4 del Plan 33). Lo que se
     * pierde es el `dominio`, y por eso viaja `null` en vez de un objeto a
     * medias que las reglas intentarían leer.
     */
    estado: (valorDe, sistemaRegistro, leidoA = null) => {
      const sinLectura = [];

      const senales = (maquina.variables ?? []).map((v) => {
        const rol = tipo.roles?.[v.rol] ?? null;
        const valor = valorDe(v.pointName);

        /*
         * Los puntos mudos se APUNTAN, no se deducen después. Es lo que
         * permite decir «29 de 73 no contestan» —la frase que separa una
         * pantalla en verde de una ciega— y lo que hace funcionar
         * `estaMuda()`.
         */
        if (valor === null || valor === undefined) sinLectura.push(v.pointName);

        return senalComun({
          clave: v.id ?? v.pointName,
          label: v.descripcion ?? rol?.label ?? v.id ?? v.pointName,
          valor,
          unidad: v.unidad ?? rol?.unidad ?? "",
          /*
           * `estado` y `banda` van nulos a propósito: evaluar una banda exige
           * umbrales calibrados para ESTA instalación, y una máquina recién
           * configurada no los tiene. Inventarlos pintaría un «en banda» que
           * nadie ha respaldado — justo lo que §2.5 prohíbe.
           */
          estado: null,
          banda: null,
          motivo:
            valor === null || valor === undefined
              ? "El punto no entregó valor en esta lectura."
              : null,
          historia: clavesConSerie.includes(v.id ?? v.pointName),
          grupo: v.assetId ?? null,
        });
      });

      /*
       * `sistema` entra como OBJETO, no como id: `estadoComun` lee de él
       * `id`, `nombre`, `maquina`, `plc` y `limitaciones`. Se le pasa la
       * entrada del registro que quien llama ya tiene —`sistemaRegistro`—, y
       * no una reconstruida aquí, para que las limitaciones que viajan sean
       * las mismas que el asistente ve.
       */
      return estadoComun({
        sistema: sistemaRegistro ?? { id: maquina.id, nombre: maquina.nombre, limitaciones: [] },
        senales,
        sinLectura,
        puntosPedidos: puntos.length,
        leidoA,
        /*
         * ── `dominio: null` EXPLÍCITO, Y NO AUSENTE ────────────────
         *
         * Las máquinas escritas a mano lo traen por `extra`, y es lo que lee
         * `evaluarRiesgosDe` para pasárselo al motor de reglas. Una máquina
         * configurada no tiene esa forma —tiene una lista plana de variables
         * con su rol, no `{canales, variador, alarmas}`— así que aquí no hay
         * dominio que dar.
         *
         * Que la propiedad ESTÉ y valga `null` es lo que permite a quien la
         * lea distinguir «esta máquina no tiene forma de dominio» de «se me
         * olvidó ponerla». Sin ella, `estado.dominio` es `undefined`, que es
         * indistinguible de un descuido.
         *
         * Y hace falta de verdad: medido el 18-09-2026, pasarle un dominio
         * vacío a `evaluarRiesgosVibracion` devuelve **tres riesgos ACTIVOS**
         * —los tres `dkw-sin-referencia`, una regla que dispara ante la
         * AUSENCIA de dato—. La regla es correcta; lo que sería falso es
         * afirmarlos sobre tres apoyos que esta máquina no ha declarado.
         *
         * Por eso `evaluarRiesgosDe` tiene que NEGARSE ante `dominio: null`
         * en vez de evaluar — ver su guarda en `ia/herramientas/lib/
         * maquina.mjs`.
         *
         * Va dentro de `extra` porque es por donde `estadoComun` deja pasar lo
         * que no son sus campos fijos: sueltó fuera, se descarta en silencio —
         * comprobado.
         */
        extra: { dominio: null },
      });
    },

    /**
     * Cómo se le cuenta esta máquina al asistente.
     *
     * Dice **qué no puede hacer**, y eso no es cortesía: `limitaciones` es,
     * por contrato, «lo que hay que confesar al contestar». Una máquina cuyas
     * reglas no se evalúan y que no lo diga se lee como una máquina sana.
     */
    resumen: (estado) => ({
      sistema: maquina.id,
      nombre: maquina.nombre ?? maquina.id,
      configurada: true,
      senales: estado?.senales?.length ?? 0,
      recuento: estado?.recuento ?? null,
      /* Cuántos puntos no contestaron, de cuántos. Sin este par, un estado con
         todas las señales en hueco se lee igual que uno sano. */
      sinLectura: estado?.sinLectura?.length ?? 0,
      puntosPedidos: estado?.puntosPedidos ?? 0,
    }),

    claves: () => [...porClave.keys()],

    etiquetaDe: (clave) => {
      const v = porClave.get(clave);
      if (!v) return null;
      return v.descripcion ?? tipo.roles?.[v.rol]?.label ?? clave;
    },

    /** Los nombres por los que alguien puede pedir una señal de esta máquina. */
    aliasDe: (clave) => {
      const v = porClave.get(clave);
      if (!v) return [];
      const rol = tipo.roles?.[v.rol] ?? null;
      return [clave, v.descripcion, rol?.label, rol?.corto, ...(v.alias ?? [])].filter(Boolean);
    },

    esHistorizada: (clave) => clavesConSerie.includes(clave),

    series: {
      historizadas: () => clavesConSerie,
      /* Los nombres históricos se guardan LITERALES en la configuración: no
         derivan del nombre en vivo por regla fija, y deducirlos es el defecto
         B10 de este proyecto. */
      ruta: "hda:",
      agregado: "Average",
      punto: (clave) => porClave.get(clave)?.historyPointName ?? null,
      nota: clavesConSerie.length
        ? `${clavesConSerie.length} de las ${puntos.length} variables tienen serie propia ` +
          "VERIFICADA por sondeo. Las demás se leen en vivo y no se puede hablar de su pasado."
        : "Ninguna variable tiene serie verificada todavía: se puede decir cómo está esta " +
          "máquina AHORA, nunca cómo estaba antes. Verificar una serie es sondearla y " +
          "comprobar que no devuelve la de otra señal.",
    },

    /* Sin mecanismos de desgaste: sin historia verificada no hay exposición
       acumulada que contar, y un pronóstico sobre el instante sería
       adivinación. */
    desgaste: null,
    cadenciaMs: maquina.cadenciaMs ?? 5_000,

    mide: (maquina.variables ?? [])
      .map((v) => v.descripcion ?? tipo.roles?.[v.rol]?.label)
      .filter(Boolean),

    /* Sin vocabulario propio: el dictado cae al contexto general, que
       transcribe algo peor pero nunca deforma con el vocabulario de otra
       máquina. */
    vocabulario: null,
    rutas: [],

    /**
     * ── QUÉ PUEDE LLAMAR EL ASISTENTE, DERIVADO ────────────────────
     *
     * De las capacidades, no de una lista escrita. Una máquina sin serie
     * verificada no ofrece `historia_de_senal`: ofrecerla y que se niegue
     * después gasta un turno del modelo para llegar al mismo sitio.
     */
    herramientas: (() => {
      const caps = capacidadesDe(maquina, tipo);
      const lista = ["estado_del_sistema"];
      if (caps.includes("DIAGNOSTICS")) lista.push("riesgos_activos");
      if (caps.includes("HISTORICAL_DATA")) lista.push("historia_de_senal");
      return lista;
    })(),

    historia: clavesConSerie.length
      ? `${clavesConSerie.length} variable(s) con serie verificada.`
      : "Sin serie verificada: esta máquina no puede contestar por su pasado.",

    /**
     * ── LAS LIMITACIONES, QUE SE DERIVAN Y NO SE INVENTAN ──────────
     *
     * Las declaradas por quien configuró, más las que se deducen de la
     * configuración. Estas últimas son las que importan: son exactamente lo
     * que una máquina recién dada de alta NO puede hacer, y callarlas la haría
     * parecer completa.
     */
    limitaciones: (() => {
      const propias = [...(maquina.limitaciones ?? [])];

      /* Los roles que las reglas necesitan y la configuración no cubre. Sin
         esto, el asistente diría «no hay riesgos» de una máquina cuyas reglas
         nunca se evaluaron. */
      const cubiertos = new Set((maquina.variables ?? []).map((v) => v.rol).filter(Boolean));
      const faltan = (tipo.rolesRequeridos ?? []).filter((r) => !cubiertos.has(r));
      if (faltan.length) {
        propias.push(
          `Esta máquina no tiene mapeadas estas medidas: ${faltan.join(", ")}. Las reglas de ` +
            "riesgo que las necesitan NO se evalúan, así que «no hay riesgos» aquí significa " +
            "«no se pudo mirar», no «está bien».",
        );
      }

      if (!clavesConSerie.length) {
        propias.push(
          "Ninguna de sus variables tiene serie histórica verificada: se puede decir cómo " +
            "está ahora, nunca cómo ha evolucionado.",
        );
      }

      const escribibles = (maquina.variables ?? []).filter((v) => permiteEscritura(v.acceso));
      if (!escribibles.length) {
        propias.push("Ninguna de sus variables es escribible: sobre esta máquina sólo se lee.");
      }

      return propias;
    })(),
  };
}
