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
import { ESTADO_CONFIGURACION, capacidadesDe, herramientasDeCapacidades, permiteEscritura } from "./configuracionMaquina.js";
import { dominioDesdeRoles } from "./dominioDesdeRoles.js";
import { estadoComun, senalComun } from "./estadoMaquina.js";
import { canalesDeMaquina, contadoresDeMaquina } from "./vistaDeMaquina.js";

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

  /*
   * ── LO QUE EL TIPO NOMBRA Y CÓMO SE LLAMA AQUÍ (Plan 39 F1) ────────
   *
   * El tipo habla en claves canónicas: `vRMS_S1`, `frecuencia`,
   * `activasSinReconocer`. Esta máquina habla con SUS ids y SUS tags —en la
   * planta, la frecuencia del variador se llama `FREQ OUTPUT_BMS`—. El mapa
   * traduce lo primero a lo segundo por ROL y apoyo, que es lo único que las
   * dos tienen en común; los contadores del área, que no tienen rol, entran
   * por el sufijo con que el servidor de alarmas los publica.
   */
  const apoyos = canalesDeMaquina(maquina, tipo);
  const apoyoDe = (assetId) => apoyos.find((c) => c.id === assetId) ?? null;
  const contadores = contadoresDeMaquina(maquina, tipo.contadoresAlarma);

  const canonicas = new Map();
  for (const v of maquina.variables ?? []) {
    const r = v.rol ? tipo.roles?.[v.rol] : null;
    if (!r?.clave) continue;
    const canonica = r.ambito === "apoyo" && v.assetId ? `${r.clave}_${v.assetId}` : r.clave;
    if (!canonicas.has(canonica)) canonicas.set(canonica, v);
  }
  for (const [key, punto] of Object.entries(contadores)) {
    const v = porPunto.get(punto);
    if (v && !canonicas.has(key)) canonicas.set(key, v);
  }
  /** Punto del contador → su clave en el tipo, para simularlo (Plan 40 F0). */
  const clavePorContador = new Map(Object.entries(contadores).map(([key, punto]) => [punto, key]));

  /**
   * La etiqueta de una variable: su descripción, o el rótulo del rol con el
   * apoyo detrás cuando lo tiene («Velocidad eficaz · S1»). Sin el apoyo, tres
   * variables de tres apoyos se llamaban igual y el asistente tenía que pedir
   * que eligieran (medido el 21-09-2026 con `Nuevo-Modor`).
   */
  const etiquetaDeVariable = (v) => {
    if (v.descripcion) return v.descripcion;
    const rol = tipo.roles?.[v.rol] ?? null;
    const base = rol?.label ?? v.clave ?? v.id ?? v.pointName;
    const apoyo = v.assetId ? apoyoDe(v.assetId) : null;
    return apoyo ? `${base} · ${apoyo.label}` : base;
  };

  /** Para `tipo.estado`: la señal canónica del tipo, con el nombre de esta máquina. */
  const resolver = (canonica) => {
    const v = canonicas.get(canonica);
    if (!v) return null;
    const clave = v.id ?? v.pointName;
    return {
      clave,
      tag: v.pointName,
      label: etiquetaDeVariable(v),
      historia: clavesConSerie.includes(clave),
      /*
       * ── LA UNIDAD Y EL ACTIVO VIAJAN TAMBIÉN (Plan 46 F4.2) ────────
       *
       * `unidad` la pone quien configura la máquina, variable por variable, y
       * un tipo no puede saberla: el servidor no la publica (los assets de
       * `DEMO_SENSORES` devuelven `.Attributes` vacío) y dos instalaciones del
       * mismo tipo pueden medir en unidades distintas. Sin esto, un tipo que
       * compone su propio estado —`sensado`— pintaba los números sin unidad
       * aunque estuviera anotada en `maquinas.json`.
       *
       * `assetId` es de qué toma cuelga. `vibraciones` no lo necesitaba porque
       * su resolvedor ya recibe los apoyos aparte (`opciones.apoyos`), pero un
       * tipo cuyos activos NO son apoyos de una misma pieza no tiene esa vía,
       * y sin el activo no se pueden agrupar cuatro sensores independientes.
       *
       * Los dos son campos nuevos y opcionales: quien no los lea —el tipo de
       * vibraciones— no cambia en nada.
       */
      unidad: v.unidad ?? null,
      assetId: v.assetId ?? null,
    };
  };

  /*
   * ── QUÉ SE LE PUEDE DAR AL ADAPTADOR, Y QUÉ NO ────────────────────
   *
   * `dominioDesdeRoles` reconstruye lo que SALE de un rol: las medidas, las
   * banderas, las calidades y las vigilancias de cada apoyo, más el variador.
   *
   * Dos piezas del dominio no son roles, y aquí no hay de dónde sacarlas:
   *
   *   `sensores`  el estado del sensor de cada apoyo (SM 1281)
   *   `alarmas`   los contadores del área de ICONICS (`ae:`)
   *
   * Las máquinas escritas a mano las leen porque sus catálogos saben componer
   * esos nombres. Una configuración no los declara con rol —el generador ya
   * lo reporta: «7 sin rol (sensor y alarmas)»—.
   *
   * Las ALARMAS se resolvieron en el Plan 39 F1: los contadores del área se
   * reconocen por el sufijo con que AlarmWorX los publica
   * (`tipo.contadoresAlarma`, `contadoresDeMaquina`), se leen aquí y se le
   * ENTREGAN al adaptador. Sin ninguno marcado se pasa `null` —que el
   * adaptador declara en `sinRoles`— y nunca «cero alarmas»: `{}` no es cero,
   * es «no se leyeron», y con eso las reglas de alarma no disparan.
   *
   * Los SENSORES siguen fuera: no hay sufijo ni rol que los identifique.
   */
  const reconstruirDominio = (valorDe) => {
    if (!tipo?.roles) return null;
    const tieneRoles = (maquina.variables ?? []).some((v) => v.rol);
    if (!tieneRoles) return null;

    const alarmas = Object.keys(contadores).length
      ? Object.fromEntries(
          Object.entries(contadores).map(([key, punto]) => {
            const valor = valorDe(punto);
            return [key, valor === undefined ? null : valor];
          }),
        )
      : null;

    return dominioDesdeRoles(maquina, tipo, valorDe, {
      /* Las vigilancias llegan codificadas y sólo el tipo sabe decodificarlas.
         Sin decodificador quedan como hueco, nunca como «en orden». */
      leerEstado: tipo.decodificarVigilancia
        ? (punto) => tipo.decodificarVigilancia(valorDe(punto))
        : null,
      alarmas,
      sensores: {},
    });
  };

  return {
    id: maquina.id,
    nombre: maquina.nombre ?? maquina.id,
    /* Otros nombres por los que alguien pide ESTA máquina (Plan 42.5 F6.6): el
       nombre y los alias que quien configura le puso al activo RAÍZ. El
       asistente los resuelve (`sistemaPorNombre`) y los ve en el inventario. */
    alias: aliasDeMaquina(maquina),
    /* Los activos con nombre o alias, para que el modelo sepa qué es «acople
       chiquito» antes de que nadie se lo pregunte. */
    activos: activosNombrados(maquina),
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
     * ── LA FÍSICA SIMULADA ES DEL TIPO (Plan 40 F0) ────────────────
     *
     * Hasta el 21-09-2026 una configurada no simulaba: «nadie ha escrito su
     * física», y con `ICONICS_FAKE=true` sus puntos salían sin dato. La
     * física existía —la del tipo— pero parseaba los tags de la máquina
     * escrita a mano. Ahora el tipo simula por DESCRIPTOR (`tipo.simular`), y
     * aquí cada variable se traduce al suyo por rol y apoyo; los contadores
     * del área, por su clave. Un tipo sin `simular`, o una variable sin rol
     * (el estado del sensor), siguen dando `null`.
     *
     * Los tres estados se respetan enteros, y es lo que impide el fallo
     * histórico: `undefined` para lo ajeno —para que el transporte lo deje
     * fuera de la respuesta— y `null` para lo propio que no entrega, que es
     * lo que produce el hueco honesto. Un `0` aquí habría pintado una máquina
     * «a cero» en vez de una máquina sin datos.
     */
    modelo: (nombre, ms) => {
      const v = porPunto.get(nombre);
      if (!v) return undefined;
      if (typeof tipo.simular !== "function") return null;
      const contador = clavePorContador.get(nombre);
      const descriptor = contador
        ? { tipo: "alarma", clave: contador, canal: null }
        : v.rol && tipo.descriptorDe
          ? tipo.descriptorDe(v.rol, v.assetId ?? null)
          : null;
      if (!descriptor) return null;
      return tipo.simular(descriptor, ms) ?? null;
    },

    /**
     * El estado en la forma común, con su dominio reconstruido.
     *
     * Desde el Plan 39 F1 lo construye el TIPO cuando declara `estado`:
     * recibe el dominio reconstruido, los apoyos de esta máquina y cómo se
     * llama aquí cada señal (`resolver`), y pone bandas, grupos y rótulos.
     * El camino genérico de abajo queda para un tipo sin `estado`. Hasta ese
     * día `tipo.estado` estaba escrito contra los catálogos de la máquina
     * escrita a mano, y una configurada salía como una lista plana.
     *
     * ── EL DOMINIO YA NO VIAJA `null` (Plan 34 F3) ─────────────────
     *
     * Hasta el 21-09-2026 aquí se perdía el `dominio` y las reglas se
     * negaban a evaluar: una máquina configurada no diagnosticaba. Desde F3
     * lo reconstruye `dominioDesdeRoles()`, que coloca cada variable en
     * `{canales, variador}` usando su rol —la familia dice a qué saco va, el
     * ámbito si se reparte por apoyo— y su `assetId` como apoyo.
     *
     * **Medido antes de conectarlo**, sobre la configuración derivada y con
     * cuatro lecturas distintas: los 66 valores del dominio coinciden uno a
     * uno con los de la máquina escrita a mano, y los riesgos salen
     * IDÉNTICOS en los cuatro escenarios —incluido «nada responde», que es el
     * que producía los tres `dkw-sin-referencia` falsos—.
     */
    estado: (valorDe, sistemaRegistro, leidoA = null) => {
      const sinLectura = [];
      for (const punto of puntos) {
        const valor = valorDe(punto);
        if (valor === null || valor === undefined) sinLectura.push(punto);
      }
      const registro = sistemaRegistro ?? { id: maquina.id, nombre: maquina.nombre, limitaciones: [] };

      /*
       * ── EL ESTADO LO COMPONE EL TIPO CUANDO SABE (Plan 39 F1) ─────────
       *
       * Un tipo con `estado` —vibraciones lo tiene— pone bandas ISO, agrupa
       * por apoyo, nombra el variador y los contadores. Hasta hoy una
       * configurada salía de aquí como una lista plana de variables sin
       * criterio, y el asistente no tenía nada que contar de ella. Los huecos
       * se cuentan igual que antes, sobre TODAS sus variables. El camino de
       * abajo queda para un tipo que no declare `estado`.
       */
      /** Una variable declarada, en la forma común y sin criterio: el camino genérico. */
      const senalGenerica = (v) => {
        const rol = tipo.roles?.[v.rol] ?? null;
        const valor = valorDe(v.pointName);
        return senalComun({
          clave: v.id ?? v.pointName,
          label: etiquetaDeVariable(v),
          valor,
          unidad: v.unidad ?? rol?.unidad ?? "",
          estado: null,
          banda: null,
          motivo:
            valor === null || valor === undefined
              ? "El punto no entregó valor en esta lectura."
              : null,
          historia: clavesConSerie.includes(v.id ?? v.pointName),
          grupo: v.assetId ?? null,
        });
      };

      const dominio = reconstruirDominio(valorDe);
      if (tipo.estado && dominio) {
        const est = tipo.estado(valorDe, registro, leidoA, {
          dominio,
          apoyos,
          resolver,
          sinLectura,
          puntosPedidos: puntos.length,
        });

        /*
         * Lo que la máquina DECLARA y el tipo no coloca —una bandera, una
         * vigilancia, una medida sin apoyo— sale igual, sin criterio y
         * agrupado por su activo. Ninguna variable configurada desaparece del
         * estado por no tener sitio en el catálogo del tipo: desaparecer se
         * leería como «no existe», y existe.
         */
        const emitidas = new Set(est.senales.map((s) => s.clave));
        const sueltas = (maquina.variables ?? []).filter(
          (v) => v.pointName && !emitidas.has(v.id ?? v.pointName),
        );
        if (!sueltas.length) return est;
        return { ...est, senales: [...est.senales, ...sueltas.map(senalGenerica)] };
      }

      const senales = (maquina.variables ?? []).map((v) => {
        const rol = tipo.roles?.[v.rol] ?? null;
        const valor = valorDe(v.pointName);

        return senalComun({
          clave: v.id ?? v.pointName,
          label: etiquetaDeVariable(v),
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
        sistema: registro,
        senales,
        sinLectura,
        puntosPedidos: puntos.length,
        leidoA,
        /*
         * ── EL DOMINIO, RECONSTRUIDO DESDE LOS ROLES (Plan 34 F3) ──
         *
         * Va dentro de `extra` porque es por donde `estadoComun` deja pasar
         * lo que no son sus campos fijos: suelto fuera, se descarta en
         * silencio — comprobado.
         *
         * **Sigue pudiendo ser `null`, y eso no ha cambiado.** Un tipo sin
         * `roles`, o una máquina cuyas variables no declaren ninguno, no
         * tiene con qué reconstruir. En ese caso la propiedad ESTÁ y vale
         * `null`, que es lo que permite a `evaluarRiesgosDe` distinguir «esta
         * máquina no tiene forma de dominio» de «se me olvidó ponerla».
         *
         * Lo que no se hace nunca es entregar un dominio A MEDIAS. Medido el
         * 18-09-2026: pasarle un dominio vacío a `evaluarRiesgosVibracion`
         * devuelve **tres riesgos ACTIVOS** —los `dkw-sin-referencia`, una
         * regla que dispara ante la AUSENCIA de dato—. La regla es correcta;
         * falso sería afirmarlos sobre tres apoyos que nadie declaró. Por eso
         * la reconstrucción recorre las claves DEL TIPO y pone `null` en lo
         * que falta, en vez de omitir la clave.
         */
        extra: { dominio },
      });
    },

    /**
     * Cómo se le cuenta esta máquina al asistente.
     *
     * Dice **qué no puede hacer**, y eso no es cortesía: `limitaciones` es,
     * por contrato, «lo que hay que confesar al contestar». Una máquina cuyas
     * reglas no se evalúan y que no lo diga se lee como una máquina sana.
     */
    resumen: (estado, ctx = {}) => {
      const identidad = {
        sistema: maquina.id,
        nombre: maquina.nombre ?? maquina.id,
        configurada: true,
        senales: estado?.senales?.length ?? 0,
        recuento: estado?.recuento ?? null,
        /* Cuántos puntos no contestaron, de cuántos. Sin este par, un estado con
           todas las señales en hueco se lee igual que uno sano. */
        sinLectura: estado?.sinLectura?.length ?? 0,
        puntosPedidos: estado?.puntosPedidos ?? 0,
      };

      /*
       * ── EL RESUMEN TAMBIÉN ES DEL TIPO (Plan 39 F1) ────────────────────
       *
       * Hasta hoy esto eran los cuatro recuentos de arriba y nada más: el
       * modelo, con 64 de 94 puntos leyendo, decía «no tiene lecturas». El
       * tipo sabe redactar cada apoyo con su número, su unidad y su veredicto
       * ISO —y está medido que redactado desde el código el modelo no
       * confunde velocidad con aceleración—. Los recuentos se quedan encima:
       * lo primero que hay que decir sigue siendo cuántos puntos no contestaron.
       */
      if (tipo.resumen && estado?.dominio && ctx.riesgos && ctx.agrupar) {
        return { ...tipo.resumen(estado, ctx), ...identidad };
      }
      return identidad;
    },

    claves: () => [...porClave.keys()],

    etiquetaDe: (clave) => {
      const v = porClave.get(clave);
      if (!v) return null;
      return etiquetaDeVariable(v);
    },

    /**
     * Los nombres por los que alguien puede pedir una señal de esta máquina:
     * lo que declara la configuración, y lo que el TIPO deriva del rol y del
     * apoyo (`tipo.aliasDe`, Plan 41 F2) — porque una máquina dada de alta
     * desde el árbol nace sin alias, y sin esto «velocidad eficaz lado
     * acople» no encontraba nada.
     */
    aliasDe: (clave) => {
      const v = porClave.get(clave);
      if (!v) return [];
      const rol = tipo.roles?.[v.rol] ?? null;
      const derivados = tipo.aliasDe?.(v, v.assetId ? apoyoDe(v.assetId) : null) ?? [];
      /* El nombre y los alias del ACTIVO de la variable, sea un apoyo del tipo o
         no (el variador, la torreta): «velocidad vivi», «par del variador». Los
         de los apoyos ya los compone el tipo; el `Set` quita lo repetido. */
      const activo = (maquina.assets ?? []).find((a) => a.id === v.assetId) ?? null;
      const nombresDelActivo = activo ? [activo.nombre, ...(activo.alias ?? [])].filter(Boolean) : [];
      const nombresDeLaMedida = [rol?.corto, rol?.label].filter(Boolean);
      const porActivo = nombresDelActivo.flatMap((n) => nombresDeLaMedida.map((m) => `${m} ${n}`));
      return [...new Set(
        [clave, v.descripcion, etiquetaDeVariable(v), rol?.label, rol?.corto, ...(v.alias ?? []), ...derivados, ...porActivo]
          .filter(Boolean),
      )];
    },

    /**
     * Rótulo, unidad, decimales y naturaleza de una clave (Plan 39 F2). La
     * unidad la trae la variable si quien configuró la escribió; si no, el
     * rol del tipo. Los decimales, del rol. Una bandera booleana es una
     * `alarma` para `alarma_sostenida`; lo demás, medida.
     */
    metaDe: (clave) => {
      const v = porClave.get(clave);
      if (!v) return null;
      const rol = tipo.roles?.[v.rol] ?? null;
      const booleana = rol?.familia === "bandera" && rol?.tipo === "booleano";
      /* Una bandera «real» (la desviación del sensor) es una medida con tres
         decimales; las booleanas y las calidades, ninguno. */
      const porFamilia = rol?.familia === "medida" || rol?.tipo === "real" ? 3 : 0;
      return {
        label: etiquetaDeVariable(v),
        unidad: v.unidad ?? rol?.unidad ?? "",
        decimales: rol?.decimales ?? porFamilia,
        naturaleza: booleana ? "alarma" : "medida",
        /* El rol del tipo que cumple esta variable (`medida:vRMS`), para que
           quien tenga la clave pueda pedirle al tipo lo que el rol declara
           —sus términos de manual, su norma— sin volver a la configuración. */
        rol: v.rol ?? null,
      };
    },

    /**
     * La variable CONFIGURADA detrás de una clave, tal como está en
     * `maquinas.json` (punto, serie, rol, activo, calibración, cómo quedó
     * verificada), o `null`. Para quien necesita lo que la configuración sabe
     * y el estado no compone: el reporte de sensores (Plan 44 §6.1) lee de
     * aquí la calibración y si la serie está verificada y cómo. Congelada:
     * es una vista, no un sitio donde escribir.
     */
    variableDe: (clave) => {
      const v = porClave.get(clave);
      return v ? Object.freeze({ ...v }) : null;
    },

    /**
     * La banda con que se juzga una clave —`{min, avisoMin, avisoMax, max}`—
     * si su TIPO la declara para su rol, o `null` (Plan 44 F3.6). Es lo que
     * las herramientas del asistente ponen bajo una curva o citan junto a una
     * cifra; antes lo sacaban de los umbrales del tanque escritos a mano.
     */
    bandaDe: (clave) => {
      const v = porClave.get(clave);
      return v?.rol ? (tipo.bandaDe?.(v.rol) ?? null) : null;
    },

    /* Las reglas de riesgo son las del tipo: el motor de diagnóstico las lee
       de aquí y no de una tabla por id de máquina (Plan 44 F3.6). */
    reglas: tipo.reglas ?? [],

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

    /* Sin repetir: una máquina con tres apoyos mide «velocidad eficaz» una vez,
       no tres. Esta lista va al prompt del asistente, donde cada línea de más
       cuesta contexto (Plan 39 F1). */
    mide: [...new Set(
      (maquina.variables ?? [])
        .map((v) => v.descripcion ?? tipo.roles?.[v.rol]?.label)
        .filter(Boolean),
    )],

    /* Sin vocabulario propio: el dictado cae al contexto general, que
       transcribe algo peor pero nunca deforma con el vocabulario de otra
       máquina. */
    vocabulario: tipo.vocabulario ?? null,
    rutas: [],

    /* Qué puede llamar el asistente, DERIVADO de las capacidades: la regla
       vive en `herramientasDeCapacidades` porque la pantalla de configuración
       la enseña también (Plan 42.5 F6, D18). */
    herramientas: herramientasDeCapacidades(capacidadesDe(maquina, tipo)),

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

      /*
       * ── NO SE REPITE LO QUE YA VIENE DENTRO (Plan 46 F4.2) ─────────
       *
       * `maquina.limitaciones` debería traer sólo las que escribió una persona
       * —la API las separa en `limitacionesPropias` justo para eso—, pero la
       * ruta de la API devuelve en `limitaciones` las propias YA MEZCLADAS con
       * las derivadas. Cuando el frontend reconstruye el sistema con esa
       * máquina, las derivadas vuelven a añadirse y salen dos veces: medido el
       * 26-09-2026 en la pantalla de Planta de `sensado-01`, tres limitaciones
       * pintadas seis veces.
       *
       * Se deduplica al final en vez de perseguir a cada llamador: una
       * limitación repetida no aporta nada en ningún caso, y quien las lee
       * —una persona en pantalla, o el asistente al citarlas— no gana nada con
       * la repetición. Arreglarlo aquí cubre también al siguiente que
       * reconstruya un sistema a partir de uno servido.
       *
       * El orden se conserva: quien mira espera leerlas como se redactaron.
       * Se deduplica al final, donde está el `return`.
       */

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

      /*
       * ── LO QUE LA VALIDACIÓN SABE (Plan 39 F6) ─────────────────────
       *
       * Una máquina entra en el registro sin haberse comprobado (UNKNOWN) o
       * con puntos ausentes (DEGRADED), y eso el asistente tiene que decirlo:
       * sin esta línea, «Nuevo-Modor está en banda» sonaría igual recién
       * configurada que comprobada. VALID no añade nada; INVALID no llega
       * aquí (`registroConfigurado.mjs` la omite). La fecha va a día porque
       * es lo que un técnico compara con «¿cuándo la revisaste?».
       */
      const total = (maquina.variables ?? []).length;
      const dia = maquina.revisada ? String(maquina.revisada).slice(0, 10) : null;
      const estadoRevision = maquina.estado ?? ESTADO_CONFIGURACION.UNKNOWN;
      if (estadoRevision === ESTADO_CONFIGURACION.UNKNOWN) {
        /*
         * ── LAS DOS FRASES DE `UNKNOWN` (corregido, Plan 45 F2.3) ─────
         *
         * Con fecha, esto decía «La última revisión (día) NO PUDO COMPROBAR
         * esta máquina contra ICONICS», que es la frase de un corte de red. Y
         * un corte de red no puede producir este estado: cuando `/verificar`
         * no alcanza el servidor, la ruta devuelve `UNKNOWN` y **no lo anota**
         * a propósito, para no pisar un `VALID` anterior que sigue siendo la
         * mejor información que hay.
         *
         * Así que un `UNKNOWN` con fecha sólo podía venir de haber EDITADO la
         * máquina —`editar()` retira el veredicto cuando cambia qué lee, que
         * es correcto— y haberla sondeado después, porque el sondeo estampaba
         * la fecha sin revisar nada. Eso ya no pasa (`fechar: false`), pero el
         * texto tenía que dejar de afirmar una avería que nadie observó: lo
         * que hay es una configuración que cambió y nadie volvió a contrastar.
         */
        propias.push(
          dia
            ? `Sin comprobar contra ICONICS desde que cambió su lista de variables: la última ` +
              `revisión es del ${dia} y ya no habla de esta configuración. No se sabe si sus ` +
              `${total} puntos existen; lo que se lea de ella no está contrastado.`
            : `Sin revisar todavía: ${total} puntos declarados, ninguno comprobado contra ICONICS. ` +
              "Lo que se lea de ella no está contrastado con el árbol del servidor.",
        );
      } else if (estadoRevision === ESTADO_CONFIGURACION.DEGRADED) {
        const ausentes = (maquina.variables ?? []).filter((v) => v.estado === ESTADO_CONFIGURACION.INVALID);
        const nombres = ausentes.slice(0, 6).map((v) => v.id ?? v.pointName);
        propias.push(
          `${ausentes.length} de ${total} puntos ausentes en la última revisión${dia ? ` (${dia})` : ""}: ` +
            `${nombres.join(", ")}${ausentes.length > nombres.length ? "…" : ""}. Sus lecturas salen sin dato, no como cero.`,
        );
      }

      if (!clavesConSerie.length) {
        propias.push(
          "Ninguna de sus variables tiene serie histórica verificada: se puede decir cómo " +
            "está ahora, nunca cómo ha evolucionado.",
        );
      } else {
        /* Series declaradas pero no sondeadas: existen en la configuración y
           NO se ofrecen como historia hasta que el sondeo diga que son suyas. */
        const declaradas = (maquina.variables ?? []).filter((v) => v.historyPointName).length;
        const sinVerificar = declaradas - clavesConSerie.length;
        if (sinVerificar > 0) {
          /*
           * Decía «están sin sondear», y en la ficha de `vib-motor-03` eso
           * era falso (22-09-2026): las 18 se habían sondeado y el sondeo no
           * pudo darlas por suyas (11 compartidas, 6 sin muestras, 1 sin
           * leer). La variable no guarda si se sondeó o no —sólo si quedó
           * verificada—, así que la frase dice lo que se sabe: no verificada,
           * por cualquiera de las dos razones.
           */
          propias.push(
            `${sinVerificar} de ${declaradas} series declaradas no están verificadas —sin sondear, o ` +
              "el sondeo no pudo darlas por suyas—: no se ofrecen como historia hasta comprobar que " +
              "el historiador devuelve la suya y no la de otra señal.",
          );
        }

        /*
         * ── LAS CONSTANTES REGISTRADAS (Plan 42 F1) ────────────────────
         *
         * Una serie plana —una bandera que nunca alarmó— se verifica por sus
         * MARCAS DE TIEMPO, no por sus valores: el historiador la escribe en
         * los mismos minutos que una serie propia. Eso demuestra que está
         * registrada; NO demuestra que sea distinta de otra constante igual.
         * Si el servidor sirviera `Alarma_S1` por `Alarma_S2`, las dos en 0,
         * no se notaría hasta que una cambiara. Se dice aquí porque es lo que
         * el asistente tiene que confesar al hablar de sus alarmas pasadas.
         */
        const constantes = conSerie.filter((v) => v.historyVerifiedComo === "registrada-constante");
        if (constantes.length) {
          const nombres = constantes.slice(0, 6).map((v) => v.id ?? v.pointName);
          propias.push(
            `${constantes.length} de sus series verificadas son constantes (${nombres.join(", ")}` +
              `${constantes.length > nombres.length ? "…" : ""}): se han comprobado como REGISTRADAS ` +
              "por el historiador, no como distintas entre sí. Si el servidor sirviera una por otra, " +
              "mientras no cambien no se notaría. Su historia dice «no ha cambiado», no «es suya».",
          );
        }
      }

      const escribibles = (maquina.variables ?? []).filter((v) => permiteEscritura(v.acceso));
      if (!escribibles.length) {
        propias.push("Ninguna de sus variables es escribible: sobre esta máquina sólo se lee.");
      }

      /*
       * ── LAS DOS PIEZAS QUE EL DOMINIO NO RECONSTRUYE (Plan 34 F3) ──
       *
       * Los contadores del área de alarmas y el estado del sensor de cada
       * apoyo no son roles del tipo —las alarmas son del servidor de ICONICS,
       * el sensor es del SM 1281— así que la reconstrucción los deja vacíos.
       *
       * Y eso hay que CONFESARLO, porque el modo de fallo es silencioso: las
       * reglas de alarma leen `alarmas: {}` y no disparan, que desde fuera se
       * ve igual que «no hay ninguna alarma activa». Sin esta línea, el
       * asistente diría que la máquina está tranquila sobre unos contadores
       * que nadie ha leído.
       */
      if (tipo.roles) {
        propias.push(
          "Los contadores del servidor de alarmas y el estado de los sensores NO se leen en " +
            "esta máquina: no son medidas del motor, así que no se declaran como variables " +
            "con rol. Las reglas que dependen de ellos no se evalúan, y su silencio no " +
            "significa que no haya alarmas.",
        );
      }

      /* Ver `yaEsta` arriba: una máquina servida por la API ya trae dentro las
         derivadas, y reconstruirla las añadiría por segunda vez. */
      return propias.filter((l, i) => propias.indexOf(l) === i);
    })(),
  };
}

/**
 * Los nombres por los que alguien puede pedir la MÁQUINA entera, aparte de su
 * `id` y su `nombre`: lo que quien configura escribió en el activo raíz (Plan
 * 42.5 F6.6). Un alias en la raíz es un alias de la máquina —«vivi»— porque la
 * raíz ES la máquina en el árbol de ICONICS. Sin raíz nombrada, vacío.
 *
 * @param {object} maquina  la configuración cruda
 * @returns {string[]}
 */
export function aliasDeMaquina(maquina) {
  const raiz = (maquina?.assets ?? []).find((a) => a?.rol === "raiz") ?? null;
  if (!raiz) return [];
  return [...new Set([raiz.nombre, ...(Array.isArray(raiz.alias) ? raiz.alias : [])].map((n) => String(n ?? "").trim()).filter(Boolean))];
}

/**
 * Los activos (sin la raíz) que tienen nombre o alias, en la forma que el
 * inventario del asistente enseña: para que el modelo sepa qué es «acople
 * chiquito» y a qué apoyo se refiere.
 *
 * @param {object} maquina
 * @returns {Array<{id: string, nombre: string|null, alias: string[]}>}
 */
export function activosNombrados(maquina) {
  return (maquina?.assets ?? [])
    .filter((a) => a?.id && a.rol !== "raiz" && (a.nombre || (Array.isArray(a.alias) && a.alias.length)))
    .map((a) => ({ id: a.id, nombre: a.nombre ?? null, alias: Array.isArray(a.alias) ? a.alias : [] }));
}
