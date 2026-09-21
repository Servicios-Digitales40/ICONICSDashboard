/**
 * La forma de DOMINIO de una máquina configurada, reconstruida desde sus
 * roles. Plan 34 F3.
 *
 * ── EL HUECO QUE ESTO CIERRA ───────────────────────────────────────
 *
 * Una máquina configurada no diagnostica. Trae `dominio: null` y
 * `evaluarRiesgosDe` se niega a evaluar, así que sus 18 reglas nunca corren.
 * Es la limitación que el Plan 33 dejó declarada, y el motivo es de FORMA:
 *
 *   escrita a mano   `{ canales: { S1: {...} }, variador: {...}, alarmas }`
 *   configurada      una lista plana de variables con su rol
 *
 * Las reglas leen `d.canales.S1.vRMS` y `d.variador.frecuencia`. Una lista
 * plana no responde a eso por mucho que contenga los mismos números.
 *
 * ── POR QUÉ SE PUEDE RECONSTRUIR, Y NO ES UNA CASUALIDAD ───────────
 *
 * Porque el rol ya lleva dentro las dos cosas que hacen falta para colocar
 * una variable en esa forma:
 *
 *   `medida:vRMS`      familia `medida`, ámbito `apoyo`    → canales[c].vRMS
 *   `variador:par`     familia `variador`, ámbito `maquina` → variador.par
 *
 * La familia dice a qué saco va y el ámbito si se reparte por apoyo o es una
 * sola. `construirSistema` ya guarda el canal de cada variable, así que el
 * apoyo tampoco hay que adivinarlo.
 *
 * O sea: esto no INVENTA una correspondencia, la APLICA. La correspondencia
 * se decidió al declarar los roles (`tipos/vibraciones.js`), y ahí está
 * escrito por qué un rol se nombra `familia:clave` y no `clave` a secas —
 * porque `aviso` es a la vez bandera de apoyo y clave del variador, y
 * colapsarlos mapearía una señal de máquina donde las reglas esperan tres de
 * apoyo—.
 *
 * ── LO QUE NO SE PUEDE RECONSTRUIR, Y SE DICE ──────────────────────
 *
 * Dos piezas del dominio NO son roles del tipo, y por eso no salen de aquí
 * solas:
 *
 *   `sensor`    el estado del sensor de cada apoyo (`Sensor_state_N`)
 *   `alarmas`   los contadores del área de ICONICS (`ae:`)
 *
 * No es un olvido: las alarmas **no son de la máquina**, son del servidor de
 * alarmas que vigila su área, y el estado del sensor es del módulo SM 1281.
 * Ninguna de las dos describe una medida del motor, que es lo que un rol
 * nombra. Se aceptan por parámetro —quien construye el estado sí sabe
 * leerlas— y si no llegan, el hueco se declara en vez de rellenarse con un
 * objeto vacío que las reglas leerían como «todo en orden».
 *
 * ── LA REGLA QUE GOBIERNA ESTE ARCHIVO ─────────────────────────────
 *
 * **Un rol que no aparece es un HUECO, no un cero** (`CLAUDE.md` §2.4). Si la
 * configuración no declara `medida:DKW` en S2, `canales.S2.DKW` vale `null` y
 * el punto se apunta en `sinDato`. Nunca se pone 0, y nunca se omite la
 * clave: una clave ausente y una clave a `null` se leen distinto desde una
 * regla, y la primera parece un descuido del programador.
 */
/**
 * Las dos piezas del dominio que NO salen de un rol.
 *
 * Viven aquí y no en `configuracionMaquina.js` porque no son un campo de la
 * configuración: son un hueco de ESTA reconstrucción. Ver la cabecera.
 */
const CAMPOS_SIN_ROL = Object.freeze(["sensores", "alarmas"]);

/**
 * Reconstruye `{ canales, variador, sinDato, puntosPedidos }` desde las
 * variables de una máquina configurada.
 *
 * @param {object} maquina  la configuración, con `variables[]`
 * @param {object} tipo     su tipo, de `shared/eva/tipos/`
 * @param {(punto: string) => unknown} valorDe  lectura por nombre de punto
 * @param {object} [extra]
 * @param {(punto: string) => unknown} [extra.leerEstado]  para los valores
 *   codificados (las vigilancias llegan en base64). Sin ella, esas claves
 *   quedan como hueco y se dice.
 * @param {object|null} [extra.alarmas]  contadores del área, ya leídos
 * @param {object} [extra.sensores]  estado del sensor por canal, ya leído
 */
export function dominioDesdeRoles(
  maquina,
  tipo,
  valorDe,
  { leerEstado = null, alarmas = null, sensores = {} } = {},
) {
  const sinDato = [];
  let puntosPedidos = 0;

  const roles = tipo?.roles ?? {};
  const canalesDelTipo = (tipo?.canales ?? []).map((c) => c.id);

  /**
   * Lee un punto y lo apunta si no entregó.
   *
   * La distinción es la de `CLAUDE.md` §2.4: no entregar es un hueco con
   * nombre, no un cero. Se apunta el PUNTO y no la clave porque `sinDato` lo
   * consumen mensajes que dicen qué tag concreto falló.
   */
  const leer = (punto, codificado) => {
    puntosPedidos += 1;
    if (codificado) {
      if (!leerEstado) {
        sinDato.push(punto);
        return null;
      }
      const estado = leerEstado(punto);
      if (estado === null || estado === undefined) sinDato.push(punto);
      return estado ?? null;
    }
    const v = valorDe(punto);
    if (v === null || v === undefined) {
      sinDato.push(punto);
      return null;
    }
    return v;
  };

  /*
   * ── EL APOYO ES EL `assetId`, NO UN CAMPO NUEVO ────────────────────
   *
   * Una variable de ámbito `apoyo` ya sabe a cuál pertenece: es el activo al
   * que está asignada. `assetId: "S1"` para `vRMS_S1`.
   *
   * Aprovecharlo, en vez de añadir un `canal` aparte, no es un atajo: es que
   * son la misma cosa dicha una vez. Un segundo campo con el mismo dato
   * podría contradecir al primero, y entonces habría que decidir cuál manda —
   * el incidente que `shared/README.md` documenta, en pequeño.
   *
   * Lo que esto SÍ exige es que los activos de la máquina se llamen como los
   * canales de su tipo. Para vibraciones lo son (`S1`, `S2`, `S3`), y es
   * natural: el apoyo del tipo y el activo de la instalación describen la
   * misma pieza. Cuando no coincidan, la variable no encuentra su sitio y el
   * hueco se declara — no se adivina por posición.
   */
  const porRol = new Map();
  for (const v of maquina?.variables ?? []) {
    if (!v?.rol) continue;
    const apoyo = v.assetId ?? null;
    porRol.set(apoyo ? `${v.rol}@${apoyo}` : v.rol, v);
    /* También sin apoyo, para los roles de ámbito `maquina` que sí traen
       `assetId` por colgar de un activo (el variador cuelga de `V20`). */
    if (apoyo && !porRol.has(v.rol)) porRol.set(v.rol, v);
  }

  /*
   * ── LAS CLAVES SE RECORREN DESDE EL TIPO, NO DESDE LA CONFIGURACIÓN ─
   *
   * Es la decisión que hace esto seguro. Recorriendo la configuración, una
   * máquina a la que le falte `medida:DKW` produciría un dominio SIN esa
   * clave — y una regla que lea `d.canales.S1.DKW` recibiría `undefined`
   * pensando que es un descuido, no un dato ausente.
   *
   * Recorriendo el tipo, la clave siempre existe y vale `null` cuando falta.
   * El dominio tiene la misma FORMA para toda máquina del tipo, tenga las
   * variables que tenga.
   */
  const porFamilia = (familia, ambito) =>
    Object.entries(roles).filter(([, r]) => r.familia === familia && r.ambito === ambito);

  const canales = {};
  for (const canalId of canalesDelTipo) {
    const d = {};

    for (const [rol, r] of porFamilia("medida", "apoyo")) {
      const v = porRol.get(`${rol}@${canalId}`);
      d[r.clave] = v ? leer(v.pointName, false) : (sinDato.push(`${rol}@${canalId}`), null);
    }
    for (const [rol, r] of porFamilia("bandera", "apoyo")) {
      const v = porRol.get(`${rol}@${canalId}`);
      d[r.clave] = v ? leer(v.pointName, false) : (sinDato.push(`${rol}@${canalId}`), null);
    }

    /* Las vigilancias llegan codificadas: sin `leerEstado` son hueco. */
    d.vigilancias = {};
    for (const [rol, r] of porFamilia("vigilancia", "apoyo")) {
      const v = porRol.get(`${rol}@${canalId}`);
      d.vigilancias[r.clave] = v
        ? leer(v.pointName, true)
        : (sinDato.push(`${rol}@${canalId}`), null);
    }

    d.calidades = {};
    for (const [rol, r] of porFamilia("calidad", "apoyo")) {
      const v = porRol.get(`${rol}@${canalId}`);
      d.calidades[r.clave] = v
        ? leer(v.pointName, false)
        : (sinDato.push(`${rol}@${canalId}`), null);
    }

    /* El estado del sensor no es un rol: lo aporta quien construye. */
    d.sensor = Object.hasOwn(sensores, canalId) ? sensores[canalId] : null;

    canales[canalId] = d;
  }

  const variador = {};
  for (const [rol, r] of porFamilia("variador", "maquina")) {
    const v = porRol.get(rol);
    variador[r.clave] = v ? leer(v.pointName, false) : (sinDato.push(rol), null);
  }

  return {
    canales,
    variador,
    /*
     * `alarmas` viaja tal cual llega, incluido `null`. Un `{}` diría «se
     * miraron y no hay ninguna», que es una afirmación distinta de «no se
     * miraron» — y las reglas de alarma la leerían como máquina tranquila.
     */
    alarmas: alarmas ?? {},
    /** Qué piezas del dominio NO pudieron reconstruirse desde roles. */
    sinRoles: CAMPOS_SIN_ROL.filter((campo) =>
      campo === "alarmas" ? alarmas === null : !Object.keys(sensores).length,
    ),
    sinDato,
    puntosPedidos,
  };
}
