/**
 * Las series de una máquina configurada que el sondeo NO verificó, listadas
 * por causa, más las verificadas como constante registrada, plegadas (Plan
 * 42.5 F6, D17).
 *
 * ── POR QUÉ TODAS LAS CAUSAS, Y NO SÓLO «SERIE COMPARTIDA» ───────────
 *
 * La ficha listaba sólo las compartidas —lo único accionable, se pensó— y
 * contaba el resto. El usuario vio «78 de 86» y no pudo saber cuáles eran las
 * ocho ni por qué. Cada causa cuenta algo distinto: «sin muestras» y «no se
 * pudo leer» no son un veredicto sobre la variable; «compartida» y «no varía»
 * sí, mientras duren. Se agrupan por causa con el texto corto de cada una, y
 * el id de cada variable en monoespaciada para buscarlo.
 *
 * Y sirve para las DOS fuentes: lo que trae un sondeo recién hecho
 * (`pendientes` de la respuesta) y lo que quedó PERSISTIDO en la
 * configuración (`historyVerified`, `historyCausa`), para que no haya que
 * sondear otra vez sólo para saber qué falta.
 *
 * Las constantes registradas van aparte y plegadas: cuentan como verificadas
 * —prometen historia— pero es una promesa más débil (Plan 42 F1), y con 44 de
 * 78 en la máquina real, desplegadas taparían lo que importa.
 */
import { useTranslation } from "react-i18next";

const CAUSAS_CONOCIDAS = Object.freeze(["serie-compartida", "sin-variacion", "sin-muestras", "no-se-pudo-leer", "sin-sondear"]);

/**
 * De las variables persistidas de una máquina a la forma que esta pieza pinta.
 *
 * @param {Array<object>} variables  `maquina.variables`
 * @returns {{ pendientes: Array<{id: string, causa: string, compartidaCon: string[]}>, constantes: string[] }}
 */
export function pendientesDeVariables(variables) {
  const pendientes = [];
  const constantes = [];
  for (const v of variables ?? []) {
    if (!v?.historyPointName) continue; // sin punto histórico no hay serie que verificar
    if (v.historyVerified) {
      if (v.historyVerifiedComo === "registrada-constante") constantes.push(v.id ?? v.pointName);
      continue;
    }
    pendientes.push({
      id: v.id ?? v.pointName,
      causa: v.historyCausa ?? "sin-sondear",
      compartidaCon: Array.isArray(v.historyCompartidaCon) ? v.historyCompartidaCon : [],
    });
  }
  return { pendientes, constantes };
}

/**
 * Las variables cuya serie es indistinguible, agrupadas: cada una trae con
 * quién la comparte (`compartidaCon`), y dos que se citan —directa o
 * indirectamente— van al mismo grupo. Cada grupo sale ordenado como llegó.
 *
 * @param {Array<{id: string, compartidaCon?: string[]|null}>} pendientes  sólo las de causa `serie-compartida`
 * @returns {string[][]}
 */
export function agruparCompartidas(pendientes) {
  const grupoDe = new Map();
  const grupos = [];
  for (const p of pendientes) {
    const relacionadas = [p.id, ...(Array.isArray(p.compartidaCon) ? p.compartidaCon : [])];
    let grupo = relacionadas.map((id) => grupoDe.get(id)).find(Boolean);
    if (!grupo) { grupo = []; grupos.push(grupo); }
    for (const id of relacionadas) {
      const otro = grupoDe.get(id);
      if (otro && otro !== grupo) {
        /* Dos grupos que resultan ser uno: se funden en el primero. */
        for (const x of otro) { if (!grupo.includes(x)) grupo.push(x); grupoDe.set(x, grupo); }
        otro.length = 0;
      }
      if (!grupo.includes(id)) grupo.push(id);
      grupoDe.set(id, grupo);
    }
  }
  return grupos.filter((g) => g.length);
}

/**
 * @param {object} props
 * @param {Array<{id: string, causa: string, compartidaCon?: string[]|null}>} props.pendientes
 * @param {string[]} [props.constantes]
 */
export function PendientesPorCausa({ pendientes, constantes = [], t }) {
  /* `traducir` y no `t`: aquí `t` es el TEMA. Ver la cabecera de `@/i18n`. */
  const { t: traducir } = useTranslation("machines");
  const textoSuave = { fontSize: 11.5, color: t.textSoft, fontFamily: "'Inter', sans-serif" };
  const mono = { ...textoSuave, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11 };

  const grupos = new Map();
  for (const p of pendientes ?? []) {
    const causa = CAUSAS_CONOCIDAS.includes(p.causa) ? p.causa : "sin-sondear";
    if (!grupos.has(causa)) grupos.set(causa, []);
    grupos.get(causa).push(p);
  }
  /* En el orden de la lista de causas: lo que es veredicto primero, lo que no lo es después. */
  const ordenadas = CAUSAS_CONOCIDAS.filter((c) => grupos.has(c));

  if (!ordenadas.length && !constantes.length) return null;

  /*
   * Las compartidas van por GRUPO, no por variable. Seis variables que
   * comparten una misma serie son un solo hecho —«estas seis son
   * indistinguibles»—, y listarlas una a una con las otras cinco al lado lo
   * repetía seis veces (lo vio el usuario el 23-09-2026). Con una línea por
   * grupo se lee de un vistazo cuántos grupos hay y quién está en cada uno.
   */
  const filasDe = (causa) => {
    const lista = grupos.get(causa);
    if (causa !== "serie-compartida") return lista.map((p) => ({ clave: p.id, texto: p.id }));
    return agruparCompartidas(lista).map((ids) => ({
      clave: ids.join("|"),
      texto: `${ids.join(", ")} · ${traducir("config.compartenSerie", { count: ids.length })}`,
    }));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {ordenadas.map((causa) => (
        <div key={causa}>
          <div style={{ ...textoSuave, fontWeight: 600 }}>
            {traducir(`config.causa.${causa}`)} · {grupos.get(causa).length}
          </div>
          <ul style={{ margin: "3px 0 0", paddingLeft: 16 }}>
            {filasDe(causa).map((fila) => (
              <li key={fila.clave} style={mono}>{fila.texto}</li>
            ))}
          </ul>
        </div>
      ))}
      {constantes.length > 0 && (
        <details style={textoSuave}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>
            {traducir("config.constantesSummary", { count: constantes.length })}
          </summary>
          <ul style={{ margin: "3px 0 0", paddingLeft: 16 }}>
            {constantes.map((id) => (
              <li key={id} style={mono}>{id}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
