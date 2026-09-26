/**
 * El editor de una máquina configurada: tres árboles de ICONICS en paralelo
 * —tiempo real, historizadas, alarmas— donde se marca lo que pertenece a la
 * máquina, y un formulario que lo guarda. Plan 36 F1–F3.
 *
 * ── EL MODELO DE INTERACCIÓN, DECIDIDO CON EL USUARIO ──────────────
 *
 * «Al configurar la máquina desde el sistema es la idea, ir marcando los
 * activos, variables historizadas, variables de tiempo real.» Y: «marcar el
 * activo marque todas las variables y el usuario pudiera ir quitando».
 *
 *   - Marcar un activo (carpeta) marca todas sus variables. Quitar una deja
 *     n−1. Es más rápido que marcar 104 de una en una, y es cómo se piensa
 *     una máquina: «este apoyo es mío, menos estas tres señales».
 *   - Los árboles se leen por rama: la raíz y su primer nivel al explorar,
 *     y lo demás al abrir o marcar. Nunca un volcado de las 104 hojas.
 *   - El emparejamiento `ac:` ↔ `hda:` se PROPONE por nombre y se ve. Lo que
 *     no casa se señala, no se esconde; y se puede emparejar a mano.
 *
 * ── POR QUÉ LA PANTALLA NO DECIDE NADA ─────────────────────────────
 *
 * Todo lo que aquí parece una decisión —qué carpeta es un activo, qué
 * `assetId` lleva una variable, qué rol se le propone, qué serie se le
 * empareja, qué variable guardada ya no está— lo decide
 * `shared/eva/comun/configurarDesdeArbol.js` y `arbolIconics.js`, que son
 * dominio puro y se prueban en Node. Este componente pinta lo que aquéllos
 * devuelven y recoge lo que la persona marca (`CLAUDE.md` §4.3). Si una
 * regla cambia, cambia allí y la pantalla no se entera.
 *
 * ── LO QUE NO SE PUEDE HACER DESDE AQUÍ, A PROPÓSITO ───────────────
 *
 * **Marcar una variable como escribible.** Todo entra como `acceso: "read"`
 * —lo pone el servidor, esta pantalla ni lo manda—. Habilitar la escritura
 * sobre la planta es una decisión aparte con su propia conversación (Plan
 * 36 §5; Plan 33 §20: `WRITABLE_VARIABLES` nunca se deriva).
 *
 * **Prometer historia.** `historyVerified` nace en `false` y se gana
 * sondeando desde la ficha, porque el servidor contesta que sí y devuelve la
 * serie de otra señal (medido). Aquí sólo se elige QUÉ serie se le propone.
 *
 * ── AL EDITAR: LO QUE YA NO ESTÁ SE SEÑALA, NO SE BORRA (F3) ───────
 *
 * Una variable guardada que el árbol ya no tiene puede ser un corte de red
 * o un cambio de nombre en el servidor —en este servidor cambian cuatro
 * nombres al mes—. Se pinta aparte, marcada, con «ya no está en el árbol», y
 * lo decide una persona. Una cuya carpeta no se pudo leer ni siquiera se da
 * por ausente: «no se pudo comprobar». Es `UNKNOWN` ≠ `INVALID` variable a
 * variable, y lo calcula `compararConArbol`.
 *
 * ── NO SUSCRIBE NINGUNA MÁQUINA ─────────────────────────────────────
 *
 * Cada `browse` es una petición al abrir o marcar una rama, no un sondeo. Ver
 * la cabecera de `ConfiguracionPlanta.jsx` y las dos veces que este proyecto
 * revivió el sondeo de una máquina cerrada desde un componente de chrome.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  FolderTree,
  Link2,
  Save,
  Search,
  Unlink,
  X,
} from "lucide-react";

import { AlertBanner, Button, Panel, fieldStyle } from "@/components/ui/index.js";
import { useArbolIconics } from "@/Demo-EVA/data/comunes/useArbolIconics.js";
import { useMensajeDeError } from "@/i18n/useMensajeDeError.js";
import { crearMaquina, editarMaquina, problemasDeError } from "@/lib/api/maquinasApi.js";
import { useTheme } from "@/theme";
import {
  clasificarArea,
  esCarpetaEnVivo,
  esCarpetaHistorica,
  esTagHistorico,
  nombreDeCarpeta,
  nombreFinal,
  normalizarRaizHistorica,
} from "@shared/eva/comun/arbolIconics.js";
import { problemasDeMaquina } from "@shared/eva/comun/configuracionMaquina.js";
import {
  activosDesdeRaiz,
  arbolesDe,
  carpetaDe,
  compararConArbol,
  configuracionDesdeMarcas,
  detallesDeAssets,
  calibracionesDeVariables,
  hojasBajo,
  marcasDe,
  proponerVariables,
} from "@shared/eva/comun/configurarDesdeArbol.js";
import { tipoDe } from "@shared/eva/tipos/index.js";

import {
  CabeceraGrupo,
  Casilla,
  Etiqueta,
  Fila,
  Mono,
  Nota,
  REJILLA_CONFIGURADOR,
} from "./ArbolMarcable.jsx";

/**
 * @param {object} props
 * @param {object|null} props.maquina  la máquina a editar, o `null` para una nueva
 * @param {Array<{id: string, nombre: string}>} props.tipos  los tipos que el
 *   servidor sabe interpretar
 * @param {string[]} props.otrosIds  ids de las DEMÁS máquinas configuradas,
 *   para que la validación del dominio cace un id repetido antes de enviar
 * @param {(maquina: object, avisos: object[]) => void} props.onGuardado
 * @param {() => void} props.onCancelar
 */
export default function EditorDeMaquina({ maquina = null, tipos = [], otrosIds = [], onGuardado, onCancelar }) {
  /* `traducir` y no `t`: aquí `t` es el TEMA. Ver la cabecera de `@/i18n`. */
  const { t: traducir } = useTranslation(["machines", "errors"]);
  const { theme: t } = useTheme();
  const mensajeDeError = useMensajeDeError();
  const tx = useCallback((clave, opciones) => traducir(`machines:config.editor.${clave}`, opciones), [traducir]);

  const editando = Boolean(maquina);
  const arbol = useArbolIconics();

  /* ── El formulario y las tres raíces ───────────────────────────────── */

  const [formulario, setFormulario] = useState(() => ({
    id: maquina?.id ?? "",
    nombre: maquina?.nombre ?? "",
    plc: maquina?.plc ?? "",
    tipo: maquina?.tipo ?? tipos[0]?.id ?? "",
    /*
     * Sólo las PROPIAS (`limitacionesPropias`, que la API separa a propósito):
     * `maquina.limitaciones` trae también las que deriva la validación —«65
     * series sin sondear»—, y cargarlas aquí las re-grabaría como si alguien
     * las hubiera escrito. Una por línea, que es como se leen y se escriben.
     */
    limitaciones: (maquina?.limitacionesPropias ?? []).join("\n"),
  }));
  const [arboles, setArboles] = useState(() => {
    const a = maquina ? arbolesDe(maquina) : {};
    return { enVivo: a.enVivo ?? "", historico: a.historico ?? "", alarmas: a.alarmas ?? "" };
  });

  /* ── Lo marcado y lo decidido a mano ───────────────────────────────── */

  const [marcas, setMarcas] = useState(() => new Set(maquina ? marcasDe(maquina).vivos : []));
  const [contadores, setContadores] = useState(() => new Set(maquina ? marcasDe(maquina).contadores : []));
  const [emparejamientos, setEmparejamientos] = useState(() => (maquina ? marcasDe(maquina).emparejamientos : new Map()));
  const [roles, setRoles] = useState(() => (maquina ? marcasDe(maquina).roles : new Map()));
  const [abiertas, setAbiertas] = useState(() => new Set());
  /* Nombre y alias por asset (Plan 42.5 F6, D15), sembrados de lo guardado
     para que editar otra cosa no los pierda: el PATCH reemplaza `assets`. */
  const [detalles, setDetalles] = useState(() => (maquina ? detallesDeAssets(maquina) : {}));
  /* Última y próxima calibración por sensor (Plan 44 §6.1): lo que quien
     configura sabe y el árbol de ICONICS no. Se siembra de lo guardado. */
  const [calibraciones, setCalibraciones] = useState(() => (maquina ? calibracionesDeVariables(maquina) : {}));
  const cambiarCalibracion = (id, campo, valor) =>
    setCalibraciones((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { ultima: "", proxima: "" }), [campo]: valor } }));
  const cambiarDetalle = (id, campo, valor) =>
    setDetalles((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { nombre: "", alias: "" }), [campo]: valor } }));

  /* ── La exploración ─────────────────────────────────────────────────── */

  const [exploracion, setExploracion] = useState("no"); // no | cargando | si
  const [errorRaiz, setErrorRaiz] = useState(null);

  const explorar = useCallback(async () => {
    const raiz = arboles.enVivo.trim();
    if (!raiz) {
      setErrorRaiz(tx("rootRequired"));
      return;
    }
    setExploracion("cargando");
    setErrorRaiz(null);
    arbol.olvidar();

    const hijos = await arbol.cargarDosNiveles(raiz);
    if (hijos === null) {
      const error = arbol.hijosActuales().get(raiz)?.error;
      setErrorRaiz(`${tx("rootNotFound", { ruta: raiz })}${error ? ` — ${mensajeDeError(error).titulo}` : ""}`);
    }
    const grupo = normalizarRaizHistorica(arboles.historico);
    if (grupo) await arbol.cargarDosNiveles(grupo);
    if (arboles.alarmas.trim()) await arbol.cargar(arboles.alarmas.trim());

    /*
     * Al editar, las carpetas de las variables guardadas se leen aunque no
     * cuelguen del primer nivel: sin leerlas, `compararConArbol` no podría
     * decir si la variable sigue o no —y las daría por «sin comprobar», que
     * es correcto pero no es lo que quien abre la máquina quiere saber—.
     */
    for (const v of maquina?.variables ?? []) {
      const carpeta = carpetaDe(v.pointName);
      if (carpeta && !arbol.hijosActuales().has(carpeta)) await arbol.cargar(carpeta);
    }

    /*
     * ── Y LAS SUBCARPETAS DE CADA ACTIVO, TENGAN VARIABLES O NO ──────
     *
     * `cargarDosNiveles(raiz)` lee la raíz y sus activos (`S1`, `S2`…), pero
     * no el TERCER nivel. Y `hojasBajo()` devuelve `null` si cualquier
     * subcarpeta del camino no se ha leído —a propósito: no afirma un conteo
     * sobre un árbol a medias—, así que el editor pintaba ese `null` como
     * «sin leer» y desmarcaba el activo entero.
     *
     * El bucle de arriba no basta: sólo lee las carpetas que tienen variables
     * GUARDADAS. Una subcarpeta de la que no se marcó nada —el `NOT_USED` de
     * `S1` en esta planta— no se leía nunca, y por eso `S1` salía «sin leer»
     * y sin marcar al reabrir, mientras `S2` y `S3`, que no tienen
     * subcarpetas, salían bien. Medido contra planta el 22-09-2026.
     */
    for (const activo of arbol.hijosActuales().get(raiz) ?? []) {
      if (esCarpetaEnVivo(activo.pointName)) await arbol.cargarEnProfundidad(activo.pointName);
    }
    setExploracion("si");
    // `arbol` es un objeto nuevo por render; sus funciones son estables.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arboles, maquina, tx, mensajeDeError]);

  /* Al abrir una máquina existente se explora sola: es lo que se vino a ver. */
  useEffect(() => {
    if (editando && exploracion === "no" && arboles.enVivo) explorar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editando]);

  /* ── Lo derivado: todo sale del dominio ─────────────────────────────── */

  const raiz = arboles.enVivo.trim();
  /* Sin contrabarra final: el servidor contesta 500 con ella (ver `esCarpetaHistorica`). */
  const historico = normalizarRaizHistorica(arboles.historico);
  const area = arboles.alarmas.trim();
  const tipoObj = tipoDe(formulario.tipo);
  const { hijosPorCarpeta } = arbol;

  const hijosRaiz = arbol.hijosDe(raiz);
  const activos = useMemo(
    () => (hijosRaiz ? activosDesdeRaiz(raiz, hijosRaiz, hijosPorCarpeta, tipoObj) : null),
    [raiz, hijosRaiz, hijosPorCarpeta, tipoObj],
  );

  const tagsHda = useMemo(() => {
    if (!historico) return [];
    const tags = [];
    for (const [carpeta, hijos] of hijosPorCarpeta) {
      if (!carpeta.startsWith(historico)) continue;
      for (const h of hijos ?? []) if (esTagHistorico(h.pointName)) tags.push(h.pointName);
    }
    return tags;
  }, [historico, hijosPorCarpeta]);

  const variables = useMemo(
    () =>
      raiz
        ? proponerVariables({ raiz, marcados: [...marcas], tagsHistoricos: tagsHda, emparejamientos, roles, tipo: tipoObj })
        : [],
    [raiz, marcas, tagsHda, emparejamientos, roles, tipoObj],
  );
  const porPunto = useMemo(() => new Map(variables.map((v) => [v.pointName, v])), [variables]);
  const tagUsadoPor = useMemo(
    () => new Map(variables.filter((v) => v.historyPointName).map((v) => [v.historyPointName, v])),
    [variables],
  );

  const comparacion = useMemo(
    () => (maquina && exploracion === "si" ? compararConArbol(maquina, hijosPorCarpeta) : null),
    [maquina, exploracion, hijosPorCarpeta],
  );

  const payload = useMemo(
    () =>
      configuracionDesdeMarcas({
        formulario,
        arboles: { enVivo: raiz, historico: historico || null, alarmas: area || null },
        variables,
        contadores: [...contadores].map((pointName) => ({ pointName })),
        detallesDeAsset: detalles,
        calibraciones,
      }),
    [formulario, raiz, historico, area, variables, contadores, detalles, calibraciones],
  );

  /* La misma validación que aplica el servidor, antes de enviar: es para lo
     que `problemasDeMaquina` vive en `shared/`. */
  const problemas = useMemo(() => problemasDeMaquina(payload, { tipoDe, otrosIds }), [payload, otrosIds]);
  const bloquean = problemas.filter((p) => !p.aviso);
  const avisos = problemas.filter((p) => p.aviso);

  /* ── Marcar y quitar ────────────────────────────────────────────────── */

  const alternarHoja = useCallback((pointName) => {
    setMarcas((prev) => {
      const s = new Set(prev);
      if (s.has(pointName)) s.delete(pointName);
      else s.add(pointName);
      return s;
    });
  }, []);

  const marcarCarpeta = useCallback(
    async (carpeta, marcar) => {
      /* No se puede marcar lo que no se ha leído: se lee en profundidad y
         después se cuentan sus hojas sobre lo leído ahora mismo. */
      await arbol.cargarEnProfundidad(carpeta);
      const hojas = hojasBajo(carpeta, arbol.hijosActuales()) ?? [];
      setMarcas((prev) => {
        const s = new Set(prev);
        for (const h of hojas) marcar ? s.add(h) : s.delete(h);
        return s;
      });
      if (marcar) setAbiertas((prev) => new Set(prev).add(carpeta));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const alternarAbierta = useCallback(
    (carpeta) => {
      setAbiertas((prev) => {
        const s = new Set(prev);
        if (s.has(carpeta)) s.delete(carpeta);
        else s.add(carpeta);
        return s;
      });
      if (arbol.hijosDe(carpeta) === undefined) arbol.cargar(carpeta);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hijosPorCarpeta],
  );

  const emparejar = useCallback((vivo, tag) => {
    setEmparejamientos((prev) => {
      const m = new Map(prev);
      if (tag === undefined) m.delete(vivo);
      else m.set(vivo, tag);
      return m;
    });
  }, []);

  const elegirRol = useCallback((vivo, rol) => {
    setRoles((prev) => new Map(prev).set(vivo, rol || null));
  }, []);

  /* ── Guardar ────────────────────────────────────────────────────────── */

  const [guardando, setGuardando] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState(null);
  const [problemasServidor, setProblemasServidor] = useState([]);

  const guardar = useCallback(async () => {
    setGuardando(true);
    setErrorGuardar(null);
    setProblemasServidor([]);
    try {
      const respuesta = editando
        ? await editarMaquina(maquina.id, {
            nombre: payload.nombre,
            ...(payload.plc ? { plc: payload.plc } : {}),
            tipo: payload.tipo,
            arboles: payload.arboles,
            assets: payload.assets,
            variables: payload.variables,
            /*
             * Siempre, aunque vaya vacío: vacío es «borra las mías». SALVO que
             * la API no haya dicho cuáles son las mías (`limitacionesPropias`
             * ausente: un backend anterior a F9). Entonces el campo arrancó
             * vacío sin que nadie lo vaciara, y mandarlo borraría lo que sí
             * estaba escrito. Se omite, y el servidor no toca nada.
             */
            ...(maquina.limitacionesPropias !== undefined ? { limitaciones: payload.limitaciones } : {}),
          })
        : await crearMaquina(payload);
      onGuardado?.(respuesta.maquina, respuesta.avisos ?? []);
    } catch (error) {
      setErrorGuardar(error);
      setProblemasServidor(problemasDeError(error));
    } finally {
      setGuardando(false);
    }
  }, [editando, maquina, payload, onGuardado]);

  /* ── Estilos comunes ────────────────────────────────────────────────── */

  const textoSuave = { fontSize: 11.5, color: t.textSoft, fontFamily: "'Inter', sans-serif", lineHeight: 1.45 };
  const rotulo = { fontSize: 11.5, fontWeight: 600, color: t.text, fontFamily: "'Inter', sans-serif", display: "block", marginBottom: 4 };
  const campo = { ...fieldStyle(t), fontSize: 12.5, padding: "8px 11px" };
  const campoMono = { ...campo, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 };

  const cambiar = (campoNombre) => (e) => setFormulario((f) => ({ ...f, [campoNombre]: e.target.value }));
  const cambiarArbol = (clave) => (e) => setArboles((a) => ({ ...a, [clave]: e.target.value }));

  const conSerie = variables.filter((v) => v.historyPointName).length;
  const sinRol = variables.filter((v) => !v.rol).length;
  const activosMarcados = new Set(variables.map((v) => v.activo).filter(Boolean)).size;

  return (
    <div>
      <style>{REJILLA_CONFIGURADOR}</style>

      {/* ── El formulario ─────────────────────────────────────────────── */}
      <Panel
        title={editando ? tx("editTitle", { nombre: maquina.nombre }) : tx("newTitle")}
        right={<FolderTree size={15} style={{ color: t.textSoft }} />}
      >
        <p style={{ ...textoSuave, margin: "0 0 12px" }}>{tx("intro")}</p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          <div>
            <label style={rotulo} htmlFor="cfg-id">{tx("fieldId")}</label>
            <input id="cfg-id" className="field" style={campoMono} value={formulario.id}
              onChange={cambiar("id")} disabled={editando} placeholder="vib-motor-02" />
            {!editando && <div style={{ ...textoSuave, fontSize: 11, marginTop: 3, color: t.textFaint }}>{tx("fieldIdHint")}</div>}
          </div>
          <div>
            <label style={rotulo} htmlFor="cfg-nombre">{tx("fieldName")}</label>
            <input id="cfg-nombre" className="field" style={campo} value={formulario.nombre} onChange={cambiar("nombre")} />
          </div>
          <div>
            <label style={rotulo} htmlFor="cfg-plc">{tx("fieldPlc")}</label>
            <input id="cfg-plc" className="field" style={campoMono} value={formulario.plc}
              onChange={cambiar("plc")} placeholder="PLC_2 · ua:DEMO3" />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={rotulo} htmlFor="cfg-limitaciones">{tx("fieldLimits")}</label>
            {/* Una por línea. Las que deriva la validación no se editan aquí: se suman solas. */}
            <textarea id="cfg-limitaciones" className="field" style={{ ...campo, minHeight: 64, resize: "vertical" }}
              value={formulario.limitaciones} onChange={cambiar("limitaciones")}
              placeholder={tx("fieldLimitsPlaceholder")} rows={3} />
            <div style={{ fontSize: 11, color: t.textFaint, marginTop: 4 }}>{tx("fieldLimitsHint")}</div>
            <div style={{ ...textoSuave, fontSize: 11, marginTop: 3, color: t.textFaint }}>{tx("fieldPlcHint")}</div>
          </div>
          <div>
            <label style={rotulo} htmlFor="cfg-tipo">{tx("fieldType")}</label>
            <select id="cfg-tipo" className="field" style={campo} value={formulario.tipo} onChange={cambiar("tipo")}>
              {tipos.map((tipo) => (
                <option key={tipo.id} value={tipo.id}>{tipo.nombre}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 14 }}>
          <div>
            <label style={rotulo} htmlFor="cfg-raiz">{tx("rootLive")}</label>
            <input id="cfg-raiz" className="field" style={campoMono} value={arboles.enVivo}
              onChange={cambiarArbol("enVivo")} placeholder="ac:TDCON/…/" />
          </div>
          <div>
            <label style={rotulo} htmlFor="cfg-hda">{tx("rootHistory")}</label>
            <input id="cfg-hda" className="field" style={campoMono} value={arboles.historico}
              onChange={cambiarArbol("historico")} placeholder={`hda:${String.fromCharCode(92)}Configuration${String.fromCharCode(92)}…${String.fromCharCode(92)}`} />
            <div style={{ ...textoSuave, fontSize: 11, marginTop: 3, color: t.textFaint }}>{tx("rootHistoryHint")}</div>
          </div>
          <div>
            <label style={rotulo} htmlFor="cfg-ae">{tx("rootAlarms")}</label>
            <input id="cfg-ae" className="field" style={campoMono} value={arboles.alarmas}
              onChange={cambiarArbol("alarmas")} placeholder="ae:/…" />
          </div>
        </div>

        <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Button variant="secondary" icon={<Search size={14} />} onClick={explorar} loading={exploracion === "cargando"}>
            {exploracion === "cargando" ? tx("exploring") : exploracion === "si" ? tx("reexplore") : tx("explore")}
          </Button>
          {errorRaiz && <span style={{ ...textoSuave, color: t.coral }}>{errorRaiz}</span>}
        </div>
      </Panel>

      {/* ── Los tres árboles ──────────────────────────────────────────── */}
      {exploracion !== "no" && (
        <div className="eva-configurador-grid" style={{ marginTop: 14 }}>
          <Panel title={tx("colLive")} noPad>
            <div className="eva-configurador-columna">
              <ColumnaEnVivo
                tx={tx} t={t} raiz={raiz} activos={activos} arbol={arbol} marcas={marcas} porPunto={porPunto}
                abiertas={abiertas} roles={roles} tagsHda={tagsHda} emparejamientos={emparejamientos}
                onHoja={alternarHoja} onCarpeta={marcarCarpeta} onAbrir={alternarAbierta}
                onRol={elegirRol} onEmparejar={emparejar} comparacion={comparacion}
              />
            </div>
          </Panel>

          <Panel title={tx("colHistory")} noPad>
            <div className="eva-configurador-columna">
              <ColumnaHistorico
                tx={tx} t={t} historico={historico} arbol={arbol} abiertas={abiertas} tagUsadoPor={tagUsadoPor}
                variables={variables} onAbrir={alternarAbierta} onEmparejar={emparejar}
              />
            </div>
          </Panel>

          <Panel title={tx("colAlarms")} noPad>
            <div className="eva-configurador-columna">
              <ColumnaAlarmas
                tx={tx} t={t} area={area} arbol={arbol} contadores={contadores} setContadores={setContadores}
              />
            </div>
          </Panel>
        </div>
      )}

      {/* ── El resumen y el guardado ──────────────────────────────────── */}
      {exploracion !== "no" && (
        <div style={{ marginTop: 14 }}>
          <Panel>
            <div style={{ ...textoSuave, fontWeight: 600, color: t.text }}>
              {tx("summary", { variables: variables.length + contadores.size, series: conSerie, sinRol, activos: activosMarcados })}
            </div>

            {/*
              Nombre y alias por activo (D15). El nombre rotula el activo en
              pantalla; los alias son las otras formas de llamarlo que el
              asistente resuelve, y se suman a todas sus variables. El tipo
              SUGIERE un nombre por apoyo con un botón: no se aplica solo.
            */}
            {payload.assets.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ ...textoSuave, fontWeight: 600, color: t.text }}>{tx("assetsTitle")}</div>
                <div style={{ ...textoSuave, fontSize: 11, color: t.textFaint, margin: "2px 0 8px" }}>{tx("assetsHint")}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
                  {payload.assets.map((a) => {
                    const d = detalles[a.id] ?? { nombre: "", alias: "" };
                    const sugerencia = tipoObj?.canales?.find((c) => c.id === a.id)?.sugerencia ?? null;
                    return (
                      <div key={a.id} style={{ padding: 10, borderRadius: 8, border: `1px solid ${t.border}` }}>
                        <Mono apagado style={{ fontSize: 11 }}>{a.id}</Mono>
                        <input
                          className="field" style={{ ...campo, marginTop: 6 }}
                          aria-label={tx("assetName", { id: a.id })} placeholder={tx("assetNamePlaceholder")}
                          value={d.nombre} onChange={(e) => cambiarDetalle(a.id, "nombre", e.target.value)}
                        />
                        {sugerencia && d.nombre.trim() !== sugerencia && (
                          <button
                            type="button"
                            onClick={() => cambiarDetalle(a.id, "nombre", sugerencia)}
                            style={{ marginTop: 6, padding: "4px 10px", borderRadius: 999, fontSize: 11.5, fontWeight: 600, border: `1px solid ${t.border}`, background: "transparent", color: t.textSoft, cursor: "pointer", fontFamily: "'Inter', sans-serif" }}
                          >
                            {tx("useSuggestion", { nombre: sugerencia })}
                          </button>
                        )}
                        <input
                          className="field" style={{ ...campo, marginTop: 6 }}
                          aria-label={tx("assetAlias", { id: a.id })} placeholder={tx("assetAliasPlaceholder")}
                          value={d.alias} onChange={(e) => cambiarDetalle(a.id, "alias", e.target.value)}
                        />
                      </div>
                    );
                  })}
                </div>
                <div style={{ ...textoSuave, fontSize: 11, color: t.textFaint, marginTop: 6 }}>{tx("assetAliasHint")}</div>
              </div>
            )}

            {/*
              Calibración por sensor (Plan 44 §6.1). Sólo las variables con rol
              de MEDIDA: son las que tienen un sensor detrás. ICONICS no sabe
              cuándo se calibró; lo anota quien configura, y el reporte de
              lectura de sensores lo imprime; sin fecha dice «sin registro».
            */}
            {payload.variables.some((v) => String(v.rol ?? "").startsWith("medida:")) && (() => {
              const deMedida = payload.variables.filter((v) => String(v.rol ?? "").startsWith("medida:"));
              const anotadas = deMedida.filter((v) => {
                const c = calibraciones[v.id];
                return c?.ultima || c?.proxima;
              }).length;

              return (
                /*
                 * ── PLEGADA, Y ABIERTA SÓLO SI HAY ALGO DENTRO ──────────
                 *
                 * Son dos fechas por sensor de medida —once parejas en la
                 * máquina de vibraciones— y casi siempre están vacías, porque
                 * ICONICS no las sabe y hay que teclearlas a mano. Desplegadas
                 * ocupaban más que el resto del formulario junto y empujaban
                 * «Guardar cambios» fuera de la pantalla, así que lo primero
                 * que se veía al configurar una máquina era un muro de campos
                 * que nadie iba a rellenar ese día.
                 *
                 * Se pliega, NO se esconde: la sección del reporte de lectura
                 * de sensores sigue existiendo y sigue diciendo «sin registro»
                 * donde nadie anotó nada. Un campo escondido dejaría esa
                 * columna sin forma de rellenarse, que es peor que ocuparla.
                 *
                 * `open` cuando YA hay alguna fecha: si alguien se molestó en
                 * anotarlas, esconderlas al volver a editar sería esconder su
                 * trabajo. Y el recuento va en el resumen para que plegada siga
                 * diciendo lo que hay dentro — un desplegable que no dice qué
                 * contiene obliga a abrirlo para saber si importa.
                 *
                 * `<details>` y no un panel propio, por lo mismo que
                 * `PanelProcedencia`: trae el plegado accesible, el teclado y
                 * el anuncio de estado sin una línea de JS.
                 */
                <details open={anotadas > 0} style={{ marginTop: 12, borderTop: `1px solid ${t.border}`, paddingTop: 10 }}>
                  <summary style={{ cursor: "pointer", listStyle: "revert", ...textoSuave, fontWeight: 600, color: t.text }}>
                    {tx("calibracionTitle")}
                    <span style={{ ...textoSuave, fontSize: 11, fontWeight: 400, color: t.textFaint, marginLeft: 8 }}>
                      {tx("calibracionResumen", { anotadas, total: deMedida.length })}
                    </span>
                  </summary>
                  <div style={{ ...textoSuave, fontSize: 11, color: t.textFaint, margin: "6px 0 8px" }}>{tx("calibracionHint")}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 8 }}>
                    {deMedida.map((v) => {
                      const c = calibraciones[v.id] ?? { ultima: "", proxima: "" };
                      return (
                        /*
                         * `minmax(0, 1fr)` en la primera columna y no `1fr`: con
                         * `1fr` la clave no puede encogerse por debajo de su
                         * contenido —es el mínimo automático de la rejilla—, así
                         * que en una columna estrecha empujaba a los dos campos
                         * de fecha y `aPeak_S1` se partía en vertical, una letra
                         * por línea. Se vio en pantalla.
                         */
                        <div key={v.id} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto auto", gap: 6, alignItems: "center", padding: "6px 10px", borderRadius: 8, border: `1px solid ${t.border}` }}>
                          <Mono apagado style={{ fontSize: 11, overflowWrap: "anywhere" }}>{v.id}</Mono>
                          <input
                            className="field" type="date" style={{ ...campo, width: 140 }}
                            aria-label={tx("calUltima", { id: v.id })}
                            value={c.ultima} onChange={(e) => cambiarCalibracion(v.id, "ultima", e.target.value)}
                          />
                          <input
                            className="field" type="date" style={{ ...campo, width: 140 }}
                            aria-label={tx("calProxima", { id: v.id })}
                            value={c.proxima} onChange={(e) => cambiarCalibracion(v.id, "proxima", e.target.value)}
                          />
                        </div>
                      );
                    })}
                  </div>
                </details>
              );
            })()}

            {(bloquean.length > 0 || problemasServidor.length > 0) && (
              <div style={{ marginTop: 10 }}>
                <AlertBanner
                  type="warning"
                  title={tx("problems")}
                  message={
                    <ul style={{ margin: 0, paddingLeft: 16 }}>
                      {[...bloquean, ...problemasServidor].map((p, i) => (
                        <li key={`${p.campo}-${i}`}>
                          <Mono apagado style={{ fontSize: 11 }}>{p.campo}</Mono> · {p.problema}
                        </li>
                      ))}
                    </ul>
                  }
                />
              </div>
            )}

            {avisos.length > 0 && (
              <div style={{ marginTop: 10, display: "flex", gap: 7 }}>
                <AlertTriangle size={14} style={{ color: t.amber, flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div style={{ ...textoSuave, fontWeight: 600, color: t.text }}>{tx("warnings")}</div>
                  <ul style={{ margin: "3px 0 0", paddingLeft: 15 }}>
                    {avisos.map((a, i) => (
                      <li key={i} style={textoSuave}>{a.problema}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {errorGuardar && problemasServidor.length === 0 && (
              <div style={{ marginTop: 10 }}>
                <AlertBanner
                  type="error"
                  title={editando ? tx("saveEdit") : tx("save")}
                  message={mensajeDeError(errorGuardar).titulo}
                  detalle={mensajeDeError(errorGuardar).detalle}
                  accion={mensajeDeError(errorGuardar).accion}
                />
              </div>
            )}

            <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Button icon={<Save size={14} />} onClick={guardar} loading={guardando} disabled={bloquean.length > 0 || guardando}>
                {guardando ? tx("saving") : editando ? tx("saveEdit") : tx("save")}
              </Button>
              <Button variant="secondary" icon={<X size={14} />} onClick={onCancelar}>{tx("back")}</Button>
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────────── */
/* Columna 1 · Tiempo real                                                */
/* ───────────────────────────────────────────────────────────────────── */

function ColumnaEnVivo({
  tx, t, raiz, activos, arbol, marcas, porPunto, abiertas, roles,
  onHoja, onCarpeta, onAbrir, onRol, onEmparejar, comparacion, tagsHda,
}) {
  const error = arbol.errorDe(raiz);
  if (!raiz) return <Nota>{tx("rootRequired")}</Nota>;
  if (error) return <Nota tono="error">{tx("loadFailed")}</Nota>;
  if (!activos) return <Nota>{tx("exploring")}</Nota>;

  const grupo = (lista) =>
    lista.map((a) => (
      <CarpetaEnVivo
        key={a.pointName} tx={tx} t={t} activo={a} nivel={0} arbol={arbol} marcas={marcas} porPunto={porPunto}
        abiertas={abiertas} roles={roles} onHoja={onHoja} onCarpeta={onCarpeta} onAbrir={onAbrir} onRol={onRol}
        onEmparejar={onEmparejar} tagsHda={tagsHda}
      />
    ));

  const hojasSueltas = (arbol.hijosDe(raiz) ?? []).filter((h) => !esCarpetaEnVivo(h.pointName));

  return (
    <div>
      <CabeceraGrupo>{tx("recognized")}</CabeceraGrupo>
      {activos.reconocidos.length === 0 && <Nota>—</Nota>}
      {grupo(activos.reconocidos)}

      {activos.otros.length > 0 && (
        <>
          <CabeceraGrupo sub={tx("othersHint")}>{tx("others")}</CabeceraGrupo>
          {grupo(activos.otros)}
        </>
      )}

      {hojasSueltas.length > 0 && (
        <>
          <CabeceraGrupo>{tx("rootLeaves")}</CabeceraGrupo>
          {hojasSueltas.map((h) => (
            <FilaHoja key={h.pointName} tx={tx} t={t} hoja={h} nivel={0} marcada={marcas.has(h.pointName)}
              variable={porPunto.get(h.pointName)} roles={roles} onHoja={onHoja} onRol={onRol} onEmparejar={onEmparejar} tagsHda={tagsHda} />
          ))}
        </>
      )}

      {comparacion && comparacion.ausentes.length > 0 && (
        <>
          <CabeceraGrupo sub={tx("missingHint")}>{tx("missingTitle")}</CabeceraGrupo>
          {comparacion.ausentes.map((v) => (
            <Fila key={v.pointName} nivel={0}>
              <Casilla marcada={marcas.has(v.pointName)} etiqueta={v.id} onChange={() => onHoja(v.pointName)} />
              <Mono>{v.id}</Mono>
              <Etiqueta tono="aviso" title={v.pointName}>{tx("missing")}</Etiqueta>
            </Fila>
          ))}
        </>
      )}

      {comparacion && comparacion.sinComprobar.length > 0 && (
        <>
          <CabeceraGrupo>{tx("uncheckedTitle")}</CabeceraGrupo>
          {comparacion.sinComprobar.map((v) => (
              <Fila key={v.pointName} nivel={0}>
                <Casilla marcada={marcas.has(v.pointName)} etiqueta={v.id} onChange={() => onHoja(v.pointName)} />
                <Mono>{v.id}</Mono>
                <Etiqueta tono="neutro" title={v.pointName}>{tx("unchecked")}</Etiqueta>
              </Fila>
            ))}
        </>
      )}
    </div>
  );
}

/** Una carpeta del árbol en vivo: su casilla tri-estado, su conteo y, abierta, sus hijos. */
function CarpetaEnVivo({ tx, t, activo, nivel, arbol, marcas, porPunto, abiertas, roles, onHoja, onCarpeta, onAbrir, onRol, onEmparejar, tagsHda }) {
  const carpeta = activo.pointName;
  const hijos = arbol.hijosDe(carpeta);
  const error = arbol.errorDe(carpeta);
  const abierta = abiertas.has(carpeta);

  const hojas = hojasBajo(carpeta, arbol.hijosPorCarpeta);
  const marcadas = hojas ? hojas.filter((h) => marcas.has(h)).length : 0;
  const todas = hojas ? hojas.length > 0 && marcadas === hojas.length : false;
  const algunas = marcadas > 0 && !todas;

  return (
    <div>
      <Fila nivel={nivel} resaltada={algunas || todas}>
        <Casilla
          marcada={todas}
          indeterminada={algunas}
          etiqueta={tx("markAll", { activo: activo.id })}
          onChange={() => onCarpeta(carpeta, !todas)}
        />
        <button
          type="button"
          onClick={() => onAbrir(carpeta)}
          aria-expanded={abierta}
          style={{
            display: "flex", alignItems: "center", gap: 6, flex: 1, minHeight: 32, padding: "0 4px",
            background: "transparent", border: "none", cursor: "pointer", textAlign: "left", color: t.text,
          }}
        >
          {abierta ? <ChevronDown size={13} color={t.textFaint} /> : <ChevronRight size={13} color={t.textFaint} />}
          <Mono style={{ fontWeight: 600 }}>{activo.id}</Mono>
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: t.textFaint }}>
            {hojas === null
              ? tx("notLoaded")
              : `${tx("leaves", { n: hojas.length })}${activo.conRol !== undefined ? ` · ${tx("withRole", { n: activo.conRol })}` : ""}`}
            {marcadas > 0 ? ` · ${marcadas}/${hojas?.length ?? "?"}` : ""}
          </span>
        </button>
      </Fila>

      {abierta && error && <Nota tono="error">{tx("loadFailed")}</Nota>}
      {abierta && hijos && hijos.length === 0 && <Nota>{tx("empty")}</Nota>}
      {abierta && hijos && hijos.map((h) =>
        esCarpetaEnVivo(h.pointName) ? (
          <CarpetaEnVivo
            key={h.pointName} tx={tx} t={t} nivel={nivel + 1} arbol={arbol} marcas={marcas} porPunto={porPunto}
            abiertas={abiertas} roles={roles} onHoja={onHoja} onCarpeta={onCarpeta} onAbrir={onAbrir} onRol={onRol}
            onEmparejar={onEmparejar} tagsHda={tagsHda}
            activo={{ id: nombreDeCarpeta(h.pointName), pointName: h.pointName }}
          />
        ) : (
          <FilaHoja
            key={h.pointName} tx={tx} t={t} hoja={h} nivel={nivel + 1} marcada={marcas.has(h.pointName)}
            variable={porPunto.get(h.pointName)} roles={roles} onHoja={onHoja} onRol={onRol} onEmparejar={onEmparejar} tagsHda={tagsHda}
          />
        ),
      )}
    </div>
  );
}

/** Una variable en vivo: casilla, nombre y, si está marcada, su rol y su serie. */
function FilaHoja({ tx, t, hoja, nivel, marcada, variable, roles, onHoja, onRol, onEmparejar, tagsHda }) {
  const corto = hoja.shortName ?? nombreFinal(hoja.pointName);
  const v = marcada ? variable : null;
  const ambiguo = v && v.rolCandidatos.length > 1 && !roles.has(v.pointName);
  const selector = { ...fieldStyle(t), fontSize: 11, padding: "3px 6px", width: "auto", minHeight: 32, maxWidth: 160 };

  /* Los tags del historiador con este mismo nombre final, para el caso
     ambiguo: dos carpetas con el mismo tag, y hay que elegir cuál. */
  const candidatosTag = v && v.procedencia === "ambiguo-en-historiador"
    ? tagsHda.filter((tag) => nombreFinal(tag) === nombreFinal(v.pointName))
    : [];

  /*
   * ── DOS AMBIGÜEDADES EN LA MISMA FILA (Plan 46 F3, 24-09-2026) ─────
   *
   * Una variable puede disparar las DOS a la vez, y hasta hoy eso dejaba la
   * fila sin poder completarse. Pasó al configurar `sensado-01`:
   * `DONA_MONOFASICA/LINEA_1` se quedaba «sin rol» y el único desplegable
   * visible era el de la serie, que pregunta otra cosa.
   *
   *   de ROL    dos roles candidatos      ¿qué ES esta variable?
   *   de SERIE  dos tags con ese nombre   ¿qué serie le corresponde?
   *
   * Los dos `<select>` se renderizaban, pero `Fila` es un flex sin envoltura
   * y el nombre lleva `flex: 1`: con dos controles de 160 px el de rol se
   * comprimía hasta no poder usarse. No era un `if` que lo ocultara — por eso
   * no se veía leyendo la condición.
   *
   * No se colapsan en un control único: son dos preguntas distintas, y
   * fundirlas obligaría a responder la de la serie para poder responder la
   * del rol. Lo que se hace es dejar que la fila envuelva y que el rol NO se
   * encoja, porque sin rol la serie no importa.
   *
   * Por qué no había salido antes: los tags de vibraciones llevan el apoyo en
   * el nombre (`vRMS_S1`), así que nunca se repiten entre carpetas. `sensado`
   * es el primer tipo cuyos assets son tomas independientes, donde repetir el
   * nombre es lo normal.
   */
  const dobleAmbiguedad = Boolean(ambiguo && candidatosTag.length > 1);

  return (
    <Fila nivel={nivel} resaltada={marcada} style={dobleAmbiguedad ? { flexWrap: "wrap", rowGap: 4 } : undefined}>
      <Casilla marcada={marcada} etiqueta={corto} onChange={() => onHoja(hoja.pointName)} />
      <Mono apagado={!marcada} style={{ flex: 1, minWidth: 0 }}>{corto}</Mono>

      {v && (ambiguo ? (
        <select
          aria-label={tx("ambiguousRole")}
          /* `flexShrink: 0`: es la pregunta que hay que poder contestar. */
          style={{ ...selector, flexShrink: 0 }}
          value=""
          onChange={(e) => onRol(v.pointName, e.target.value)}
        >
          <option value="">{tx("ambiguousRole")}</option>
          {/*
            El id crudo (`electrica:corrienteMono`) y no la etiqueta del tipo:
            es lo que se guarda, es lo que las pruebas afirman y es lo que se
            puede buscar en `maquinas.json` cuando algo no cuadra. Rotularlo
            con el `label` se probó y se descartó aquí — mejora la lectura pero
            es un cambio de presentación que nadie pidió, y esta fase existe
            para desbloquear la configuración (`CLAUDE.md` §6.2: no
            refactorizar fuera del alcance). Anotado en el backlog de frontend.
          */}
          {v.rolCandidatos.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      ) : (
        <Etiqueta tono={v.rol ? "ok" : "neutro"} title={tx("role")}>{v.rol ?? tx("noRole")}</Etiqueta>
      ))}

      {v && (v.historyPointName ? (
        <span title={`${v.procedencia === "a-mano" ? tx("pairedManual") : tx("paired")} · ${v.historyPointName}`} style={{ display: "flex", color: t.success }}>
          <Link2 size={13} />
        </span>
      ) : candidatosTag.length > 1 ? (
        <select
          aria-label={tx("ambiguous")}
          style={{ ...selector, flexShrink: 0 }}
          value=""
          onChange={(e) => onEmparejar(v.pointName, e.target.value)}
        >
          <option value="">{tx("ambiguous")}</option>
          {candidatosTag.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
        </select>
      ) : (
        <span title={tx("unpaired")} style={{ display: "flex", color: t.textFaint }}>
          <Unlink size={13} />
        </span>
      ))}
    </Fila>
  );
}

/* ───────────────────────────────────────────────────────────────────── */
/* Columna 2 · Historizadas                                               */
/* ───────────────────────────────────────────────────────────────────── */

function ColumnaHistorico({ tx, t, historico, arbol, abiertas, tagUsadoPor, variables, onAbrir, onEmparejar }) {
  if (!historico) return <Nota>{tx("noHistoryRoot")}</Nota>;
  const hijos = arbol.hijosDe(historico);
  const error = arbol.errorDe(historico);
  if (error) return <Nota tono="error">{tx("loadFailed")}</Nota>;
  if (!hijos) return <Nota>{tx("exploring")}</Nota>;

  const sinPareja = variables.filter((v) => !v.historyPointName);

  /* Cuántos tags leídos no reclama nadie: lo que el historiador publica y
     la máquina no declara. Se dice arriba, no se esconde. */
  let tagsLeidos = 0;
  for (const [carpeta, hijosLeidos] of arbol.hijosPorCarpeta) {
    if (!carpeta.startsWith(historico)) continue;
    tagsLeidos += (hijosLeidos ?? []).filter((h) => esTagHistorico(h.pointName)).length;
  }
  const sinReclamar = tagsLeidos - tagUsadoPor.size;

  return (
    <div>
      {tagsLeidos > 0 && (
        <Nota>{tx("unpairedCount", { n: Math.max(0, sinReclamar) })}</Nota>
      )}
      {hijos.length === 0 && <Nota>{tx("empty")}</Nota>}
      {hijos.map((h) =>
        esCarpetaHistorica(h.pointName) ? (
          <CarpetaHistorica key={h.pointName} tx={tx} t={t} carpeta={h} nivel={0} arbol={arbol} abiertas={abiertas}
            tagUsadoPor={tagUsadoPor} sinPareja={sinPareja} onAbrir={onAbrir} onEmparejar={onEmparejar} />
        ) : (
          <FilaTag key={h.pointName} tx={tx} t={t} tag={h} nivel={0} usadoPor={tagUsadoPor.get(h.pointName)}
            sinPareja={sinPareja} onEmparejar={onEmparejar} />
        ),
      )}
    </div>
  );
}

function CarpetaHistorica({ tx, t, carpeta, nivel, arbol, abiertas, tagUsadoPor, sinPareja, onAbrir, onEmparejar }) {
  const ruta = carpeta.pointName;
  const hijos = arbol.hijosDe(ruta);
  const error = arbol.errorDe(ruta);
  const abierta = abiertas.has(ruta);
  /*
   * Los TAGS de la carpeta, no sus hijos: una subcarpeta no es un tag que se
   * pueda emparejar, y contarla hacía que `S1` dijera «22 · 21» —22 hijos, de
   * los que uno era la carpeta `NOT_USED`, y 21 tags emparejados—, como si
   * quedara un tag suelto. Medido el 22-09-2026.
   */
  const tags = (hijos ?? []).filter((h) => !esCarpetaHistorica(h.pointName));
  const emparejados = tags.filter((h) => tagUsadoPor.has(h.pointName)).length;

  return (
    <div>
      <Fila nivel={nivel}>
        <button
          type="button"
          onClick={() => onAbrir(ruta)}
          aria-expanded={abierta}
          style={{
            display: "flex", alignItems: "center", gap: 6, flex: 1, minHeight: 32, padding: "0 4px",
            background: "transparent", border: "none", cursor: "pointer", textAlign: "left", color: t.text,
          }}
        >
          {abierta ? <ChevronDown size={13} color={t.textFaint} /> : <ChevronRight size={13} color={t.textFaint} />}
          <Mono style={{ fontWeight: 600 }}>{carpeta.shortName ?? nombreDeCarpeta(ruta)}</Mono>
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: t.textFaint }}>
            {hijos ? `${tags.length} · ${emparejados} ↔` : tx("notLoaded")}
          </span>
        </button>
      </Fila>
      {abierta && error && <Nota tono="error">{tx("loadFailed")}</Nota>}
      {abierta && hijos && hijos.length === 0 && <Nota>{tx("empty")}</Nota>}
      {abierta && hijos && hijos.map((h) =>
        esCarpetaHistorica(h.pointName) ? (
          <CarpetaHistorica key={h.pointName} tx={tx} t={t} carpeta={h} nivel={nivel + 1} arbol={arbol} abiertas={abiertas}
            tagUsadoPor={tagUsadoPor} sinPareja={sinPareja} onAbrir={onAbrir} onEmparejar={onEmparejar} />
        ) : (
          <FilaTag key={h.pointName} tx={tx} t={t} tag={h} nivel={nivel + 1} usadoPor={tagUsadoPor.get(h.pointName)}
            sinPareja={sinPareja} onEmparejar={onEmparejar} />
        ),
      )}
    </div>
  );
}

/** Un tag del historiador: con quién está emparejado, o con quién se puede emparejar a mano. */
function FilaTag({ tx, t, tag, nivel, usadoPor, sinPareja, onEmparejar }) {
  const corto = tag.shortName ?? nombreFinal(tag.pointName);
  const selector = { ...fieldStyle(t), fontSize: 11, padding: "3px 6px", width: "auto", minHeight: 32, maxWidth: 170 };

  return (
    <Fila nivel={nivel} resaltada={Boolean(usadoPor)}>
      <span style={{ display: "flex", width: 32, justifyContent: "center", color: usadoPor ? t.success : t.textFaint }}>
        {usadoPor ? <Link2 size={13} /> : <Unlink size={13} />}
      </span>
      <Mono apagado={!usadoPor} style={{ flex: 1 }}>{corto}</Mono>
      {usadoPor ? (
        <>
          <Etiqueta tono="ok" title={usadoPor.pointName}>{tx("tagPaired", { variable: usadoPor.id })}</Etiqueta>
          {usadoPor.procedencia === "a-mano" && (
            <button
              type="button"
              onClick={() => onEmparejar(usadoPor.pointName, undefined)}
              title={tx("unpair")}
              aria-label={`${tx("unpair")} ${corto}`}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", minWidth: 32, minHeight: 32,
                background: "transparent", border: "none", cursor: "pointer", color: t.textSoft }}
            >
              <X size={13} />
            </button>
          )}
        </>
      ) : (
        <>
          <Etiqueta tono="neutro">{tx("tagUnpaired")}</Etiqueta>
          {sinPareja.length > 0 && (
            <select aria-label={`${tx("pairWith")} ${corto}`} style={selector} value=""
              onChange={(e) => e.target.value && onEmparejar(e.target.value, tag.pointName)}>
              <option value="">{tx("pairWith")}</option>
              {sinPareja.map((v) => <option key={v.pointName} value={v.pointName}>{v.id}</option>)}
            </select>
          )}
        </>
      )}
    </Fila>
  );
}

/* ───────────────────────────────────────────────────────────────────── */
/* Columna 3 · Alarmas                                                    */
/* ───────────────────────────────────────────────────────────────────── */

function ColumnaAlarmas({ tx, t, area, arbol, contadores, setContadores }) {
  const [verAlarmas, setVerAlarmas] = useState(false);
  if (!area) return <Nota>{tx("noAlarmArea")}</Nota>;
  const hijos = arbol.hijosDe(area);
  const error = arbol.errorDe(area);
  if (error) return <Nota tono="error">{tx("loadFailed")}</Nota>;
  if (!hijos) return <Nota>{tx("exploring")}</Nota>;

  const { contadores: lista, alarmas, acciones } = clasificarArea(hijos);
  const marcados = lista.filter((c) => contadores.has(c.pointName)).length;
  const todos = lista.length > 0 && marcados === lista.length;

  const alternar = (pointName) =>
    setContadores((prev) => {
      const s = new Set(prev);
      if (s.has(pointName)) s.delete(pointName);
      else s.add(pointName);
      return s;
    });

  const alternarTodos = () =>
    setContadores((prev) => {
      const s = new Set(prev);
      for (const c of lista) todos ? s.delete(c.pointName) : s.add(c.pointName);
      return s;
    });

  return (
    <div>
      <CabeceraGrupo>{tx("counters")}</CabeceraGrupo>
      {lista.length > 0 && (
        <Fila resaltada={marcados > 0}>
          <Casilla marcada={todos} indeterminada={marcados > 0 && !todos} etiqueta={tx("includeArea")} onChange={alternarTodos} />
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: t.text }}>{tx("includeArea")}</span>
        </Fila>
      )}
      {lista.length === 0 && <Nota>—</Nota>}
      {lista.map((c) => (
        <Fila key={c.pointName} nivel={1} resaltada={contadores.has(c.pointName)}>
          <Casilla marcada={contadores.has(c.pointName)} etiqueta={nombreFinal(c.pointName)} onChange={() => alternar(c.pointName)} />
          <Mono apagado={!contadores.has(c.pointName)}>{nombreFinal(c.pointName)}</Mono>
        </Fila>
      ))}

      <CabeceraGrupo>{tx("alarmsListed")}</CabeceraGrupo>
      <Fila>
        <button
          type="button"
          onClick={() => setVerAlarmas((v) => !v)}
          aria-expanded={verAlarmas}
          style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 32, padding: "0 4px",
            background: "transparent", border: "none", cursor: "pointer", color: t.text }}
        >
          {verAlarmas ? <ChevronDown size={13} color={t.textFaint} /> : <ChevronRight size={13} color={t.textFaint} />}
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12 }}>{alarmas.length}</span>
        </button>
      </Fila>
      {verAlarmas && alarmas.map((a) => (
        <Fila key={a.pointName} nivel={1}>
          <span style={{ width: 32 }} />
          <Mono apagado>{a.corto.replace(/^\./, "")}</Mono>
        </Fila>
      ))}

      <CabeceraGrupo sub={tx("actionsHint")}>{tx("actions")}</CabeceraGrupo>
      <Nota>{acciones.length}</Nota>
    </div>
  );
}
