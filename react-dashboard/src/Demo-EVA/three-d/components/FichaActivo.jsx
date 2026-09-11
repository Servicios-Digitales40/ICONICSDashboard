/**
 * La ficha que se abre al pulsar un activo de la maqueta.
 *
 * ── POR QUÉ ES DOM Y NO GEOMETRÍA ──────────────────────────────────
 *
 * Tres motivos, en orden de peso:
 * reutiliza el formateo que ya sabe pintar «—» cuando no hay medición —la regla
 * más importante de esta aplicación y la más fácil de romper al reescribirla—,
 * hereda tema y tipografías, y evita arrastrar `troika-three-text` (~120 KB y
 * un web worker) para dibujar cuatro líneas de texto.
 *
 * ── POR QUÉ NO ESCALA CON LA DISTANCIA ─────────────────────────────
 *
 * Sin `distanceFactor` la ficha mantiene su tamaño en pantalla aunque la cámara
 * se aleje. Se pierde el efecto de estar «pegada» al modelo y a cambio el dato
 * se lee siempre, que es a lo que viene.
 *
 * ── POR QUÉ SE ANCLA POR ARRIBA Y NO SE CENTRA ─────────────────────
 *
 * `bombeo` y `tanque` flotan su ficha a 2,4 m de altura de bandeja más 2,5 m
 * de holgura: casi 5 m de mundo, que la cámara isométrica de la maqueta
 * proyecta muy cerca del borde superior del lienzo. Centrada en ese punto
 * (`center` de drei, que reparte la caja mitad arriba mitad abajo), la mitad
 * superior de la ficha —la cabecera con el nombre del activo y la «×»— caía
 * por encima del lienzo y el `overflow: hidden` de `Escena.jsx` se la comía
 * en silencio: no era un fallo de tamaño, era un recorte invisible. Ancorada
 * por su borde SUPERIOR, la caja sólo crece hacia abajo, hacia donde la
 * escena siempre tiene sitio de sobra.
 */
import { Html } from "@react-three/drei";
import { X } from "lucide-react";

import { useTranslation } from "react-i18next";

import { useDominio } from "@/i18n/useDominio.js";
import { useTheme } from "@/theme";

import { fmtSenal } from "../../lib/formato.js";
import { estadoColor, TONO } from "../../components/paleta.js";
import { pideAtencion } from "../../domain/estado.js";
import { historizadasMedidas } from "../../domain/senales.js";

/** Medidas continuas con serie propia (ver `historizadasMedidas`), como Set
    para no recorrer el array entero por cada señal del activo. */
const MEDIDAS = new Set(historizadasMedidas());

/** Una señal dentro de la ficha: punto de estado, nombre, valor y banda. */
function FilaSenal({ senal, t, dark }) {
  const { estado: estadoTexto, senal: senalTexto } = useDominio();
  const reposo = senal.estado === "reposo";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "4px 0" }}>
      <span
        style={{
          width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
          background: estadoColor(dark, senal.estado),
        }}
      />
      <span style={{ fontSize: 11, color: t.textSoft, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {senalTexto(senal.key, "corto")}
      </span>
      <span
        style={{
          fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 700,
          color: reposo ? t.textFaint : t.text, whiteSpace: "nowrap",
        }}
      >
        {fmtSenal(senal)}
      </span>
      <span style={{ fontSize: 9.5, color: t.textFaint, width: 46, textAlign: "right", flexShrink: 0 }}>
        {estadoTexto(senal.estado, "corto")}
      </span>
    </div>
  );
}

export default function FichaActivo({ activo, altura = 2.5, onCerrar, onDetalle, onAlarmas }) {
  /* `traducir` y no `t`: aquí `t` es el TEMA. Ver la cabecera de `@/i18n`. */
  const { t: traducir } = useTranslation("common");
  const { t: traducirMaquinas } = useTranslation("machines");
  const { estado: estadoTexto, activo: activoTexto, senal: senalTexto } = useDominio();
  // `dark` se lee y se pasa: la ficha es DOM sobre el canvas, así que hereda el
  // tema como cualquier tarjeta. Fijarlo a claro dejaría los puntos de estado
  // con la paleta equivocada justo en modo oscuro, que es el de un wallboard.
  const { theme: t, dark } = useTheme();
  const color = estadoColor(dark, activo.estado);
  // Alarmas fuera de la lista de señales (ver el filtro de `senalesSinAlarmas`
  // más abajo): mismo criterio que Planta y Detalle desde que "Alarmas" tiene
  // su propia sección — ver la cabecera de `Alarmas → En vivo` en
  // `AlarmasEva.jsx`. Aquí, a diferencia de la tarjeta de Planta, el badge SÍ
  // puede ser un `<button>` clicable: esta ficha no es en sí un control
  // interactivo (no tiene `role="button"` propio), así que no hay anidamiento
  // que dispare `nested-interactive` en axe-core.
  const alarmasActivas = activo.alarmas?.activas ?? 0;
  const alerta = TONO.critico(t);

  /*
   * ── VISTAZO, NO PANEL COMPLETO ──────────────────────────────────
   *
   * La ficha nació pensada para el tanque de 8 señales; con el catálogo en
   * 52 (Plan 27), un activo como «Grupo de bombeo» trae 13 —10 de ellas
   * lecturas «crudas» del variador, con la misma nota repetida cada una— y
   * la caja de 250px de ancho fijo, sin scroll, se volvía ilegible: filas
   * apretadas, notas apiladas hasta desbordar el lienzo.
   *
   * En vez de dar scroll a una ficha que se abre y cierra en segundos —el
   * gesto de la maqueta 3D es señalar y mirar, no desplazarse dentro de un
   * tooltip—, se corta la lista y se manda al detalle completo (2D, ya con
   * scroll de página) lo que no cabe en un vistazo, con tres niveles:
   *
   *   1. Si hay algo que PIDE ATENCIÓN (crítico/aviso, `pideAtencion` del
   *      dominio): eso se muestra completo y sin recorte. Es pocas señales
   *      por naturaleza, y es justo lo que hay que ver primero.
   *   2. Si no: hasta `MAX_RESUMEN` magnitudes DESTACADAS —medidas
   *      continuas con serie propia, `historizadasMedidas()`, el mismo
   *      criterio que ya usa la banda de KPIs de Planta.
   *   3. Si el activo no tiene NINGUNA destacada —medido: «Grupo de
   *      bombeo», «Válvulas y aire» y «Seguridad» dan CERO, porque sus
   *      señales son mandos, consignas, estados enumerados o registros del
   *      variador sin escalar (`naturaleza: "crudo"`), ninguna de las
   *      cuales cuenta como medida—: se cae a las primeras señales que NO
   *      sean alarma ni crudo. Enseñar un registro Modbus sin escalar como
   *      primer vistazo sería mostrar un número que ni el propio catálogo
   *      sabe interpretar todavía (ver la nota de cada `*Variador` crudo).
   *      Si tampoco queda ninguna así, se usan las que haya: la ficha
   *      nunca se queda vacía.
   */
  const senalesSinAlarma = activo.senales.filter((s) => s.naturaleza !== "alarma");
  const pidenAtencion = senalesSinAlarma.filter((s) => pideAtencion(s.estado));
  const destacadasActivo = senalesSinAlarma.filter((s) => MEDIDAS.has(s.key));
  const sinCrudo = senalesSinAlarma.filter((s) => s.naturaleza !== "crudo");

  const MAX_RESUMEN = 4;
  const senalesAMostrar = pidenAtencion.length
    ? pidenAtencion
    : (destacadasActivo.length ? destacadasActivo : (sinCrudo.length ? sinCrudo : senalesSinAlarma))
      .slice(0, MAX_RESUMEN);
  const ocultas = senalesSinAlarma.length - senalesAMostrar.length;

  return (
    <Html
      position={[0, altura, 0]}
      zIndexRange={[40, 0]}
      // Centrado sólo en horizontal (`translate(-50%, …)`); en vertical el
      // punto ancla el borde SUPERIOR de la caja (ver la nota de cabecera),
      // con 6px de aire para que no quede pegada a la línea de nivel.
      style={{ transform: "translate(-50%, 6px)", pointerEvents: "auto" }}
    >
      <div
        // El clic no debe llegar al suelo, que cierra la ficha.
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 250,
          background: t.panel,
          border: `1px solid ${t.border}`,
          borderTop: `3px solid ${color}`,
          borderRadius: 12,
          boxShadow: t.shadowHover,
          padding: "11px 13px 12px",
          fontFamily: "'Inter', sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: t.text }}>
                {activoTexto(activo.id)}
              </span>
              {alarmasActivas > 0 && (
                <button
                  onClick={() => onAlarmas?.(activo.id)}
                  title={traducirMaquinas("assetGrid.alarmsActive", { count: alarmasActivas })}
                  style={{
                    display: "flex", alignItems: "center", gap: 3, padding: "1px 7px",
                    borderRadius: 999, fontSize: 10, fontWeight: 700,
                    color: alerta.texto, background: alerta.fondo, border: `1px solid ${alerta.borde}`,
                    fontFamily: "'IBM Plex Mono', monospace", cursor: "pointer",
                  }}
                >
                  {alarmasActivas}
                </button>
              )}
            </div>
            <div style={{ fontSize: 10.5, color: t.textFaint }}>
              {estadoTexto(activo.estado)}
            </div>
          </div>
          <button
            onClick={onCerrar}
            aria-label={traducir("common:actions.close")}
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              color: t.textFaint, padding: 2, display: "flex", flexShrink: 0,
            }}
          >
            <X size={14} />
          </button>
        </div>

        <div style={{ marginTop: 8, paddingTop: 6, borderTop: `1px solid ${t.border}` }}>
          {/* Las alarmas de proceso viven en su propia sección desde el
              Plan 27 (Alarmas → En vivo); esta ficha ya no las repite como
              fila — el badge de arriba, si hay alguna activa, lleva allá. */}
          {senalesAMostrar.map((s) => (
            <FilaSenal key={s.key} senal={s} t={t} dark={dark} />
          ))}
          {/* Un texto informativo, no un segundo botón: «Ver detalle completo»
              de más abajo ya es el único punto de acción — dos botones al
              mismo destino a 40px de distancia es ruido, no ayuda. */}
          {ocultas > 0 && (
            <p style={{ margin: "6px 0 0", fontSize: 10.5, fontWeight: 600, color: t.textFaint }}>
              {traducirMaquinas("model3d.moreInDetail", { count: ocultas })}
            </p>
          )}
        </div>

        {/*
          Las notas del catálogo, que hasta ahora no se pintaban en ningún
          sitio: existían en `domain/senales.js`, las verificaba una prueba y no
          las veía nadie.
          Hacen falta desde que el nivel se dibuja en la columna: quien lea
          «Nivel 62 %» bajo «Tanque de almacenamiento» y mire el bidón vacío
          tiene derecho a saber por qué, y la respuesta está escrita en el
          catálogo desde que se supo.

          Sólo de las señales YA MOSTRADAS, no de todo el activo: con 13
          señales y varias compartiendo la misma nota («factor de escala sin
          confirmar»), listarlas todas era el otro motivo de que la ficha
          desbordara. Las notas de lo que quedó oculto se leen en el detalle,
          junto a la señal a la que pertenecen.
        */}
        {senalesAMostrar.filter((s) => s.nota).map((s) => (
          <p
            key={`nota-${s.key}`}
            style={{ margin: "6px 0 0", fontSize: 10, lineHeight: 1.45, color: t.textFaint }}
          >
            {senalTexto(s.key, "corto")}: {senalTexto(s.key, "nota")}
          </p>
        ))}

        {onDetalle && (
          <button
            onClick={onDetalle}
            style={{
              marginTop: 9, width: "100%", padding: "6px 10px", borderRadius: 8,
              border: `1px solid ${t.border}`, background: t.hover, color: t.textSoft,
              fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            {traducirMaquinas("model3d.viewFullDetail")}
          </button>
        )}
      </div>
    </Html>
  );
}

/** Etiqueta ligera al señalar, sin abrir la ficha. */
export function EtiquetaActivo({ activo, altura = 2.2 }) {
  const { activo: activoTexto } = useDominio();
  const { theme: t } = useTheme();

  return (
    <Html
      position={[0, altura, 0]}
      zIndexRange={[30, 0]}
      // Mismo anclaje por el borde superior que `FichaActivo`, y por la misma
      // razón: un punto cerca del techo del lienzo no deja mitad de caja
      // arriba sin que el `overflow: hidden` de la escena se la recorte.
      style={{ transform: "translate(-50%, 4px)", pointerEvents: "none" }}
    >
      <div
        style={{
          padding: "3px 9px", borderRadius: 999, whiteSpace: "nowrap",
          background: t.panel, border: `1px solid ${t.border}`, boxShadow: t.shadow,
          fontSize: 11, fontWeight: 600, color: t.text, fontFamily: "'Inter', sans-serif",
        }}
      >
        {activoTexto(activo.id, "corto")}
      </div>
    </Html>
  );
}
