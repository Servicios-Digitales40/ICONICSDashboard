/**
 * Versión A — Rejilla de variables.
 *
 * Extiende directamente la gramática que ya usa `BandaSenales` en Planta: una
 * tarjeta por variable, en rejilla. La diferencia es de ESCALA, no de
 * vocabulario — cada tarjeta lleva su gráfica a tamaño real (150 px, no un
 * sparkline de 24) porque aquí la gráfica es el contenido, no un adorno junto
 * al número.
 */
import { useTranslation } from "react-i18next";

import { useDominio } from "@/i18n/useDominio.js";

import { Card, Cifra, Delta, MONO } from "../base.jsx";
import { fmtNum } from "@/lib/format.js";
import { FRESCURA, presentarValor } from "../../data/comunes/estadoDelDato.js";
import { PanelProcedencia } from "./PanelProcedencia.jsx";
import {
  BandaValor, EstadoBooleano, GraficaAusente, GraficaBufer, GraficaHistoria, InsigniaOrigen,
} from "./piezas.jsx";

const VALOR_GRANDE = { fontFamily: MONO, fontSize: 30, fontWeight: 700, lineHeight: 1 };

function TarjetaVariable({ senal, t, dark, ahora, delay, cobertura = null, onIrAConfiguracion = null }) {
  /* `traducir` y no `t`: aquí `t` es el TEMA. Ver la cabecera de `@/i18n`. */
  const { t: traducir } = useTranslation("machines");
  const { senal: senalTexto } = useDominio();
  /* Una señal de máquina CONFIGURADA llega ya rotulada (`label`, de `metaDe`);
     la del tanque se rotula con el diccionario del catálogo, como siempre. */
  const configurada = typeof senal.label === "string" && senal.label.length > 0;
  const esBooleano = senal.tipo === "booleano";
  const tieneBufer = senal.bufferVivo.length >= 2;

  // La cifra grande es SIEMPRE la lectura en vivo, esté la gráfica de abajo
  // mirando "Ayer" o lo que sea: ver la cabecera de `data/tanque/detalleActivo.js`.
  const { atenuado, texto: textoCongelado, frescura } = presentarValor({
    receivedAt: senal.receivedAt, stale: senal.stale, ahora, formateado: null,
  });
  const congelado = frescura === FRESCURA.CONGELADO;

  return (
    <Card t={t} delay={delay} style={{ padding: "18px 20px 20px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>
            {configurada ? senal.label : senalTexto(senal.key)}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 10.5, color: t.textFaint, marginTop: 2 }}>{senal.tag}</div>
        </div>
        {senal.historizado && <InsigniaOrigen real={!senal.historiaEnVivo} t={t} />}
      </div>

      {esBooleano ? (
        <EstadoBooleano senal={senal} t={t} />
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            {congelado ? (
              <span
                title={traducir("machines:signal.stale")}
                style={{ ...VALOR_GRANDE, fontSize: 17, color: t.textFaint }}
              >
                {textoCongelado}
              </span>
            ) : (
              <Cifra
                valor={senal.valor}
                fmt={(v) => fmtNum(v, senal.decimales)}
                duracion={1000}
                /*
                 * El color va SIEMPRE explícito, nunca `undefined`.
                 *
                 * `Cifra` pinta un `<span>` sin color propio, y `Card` tampoco
                 * lo declara, así que un `undefined` acababa heredando el del
                 * documento: en los temas claros coincide con el del texto y
                 * no se notaba, pero en el oscuro dejaba la cifra en un tono
                 * oscuro sobre panel oscuro — el número grande, que es lo
                 * primero que se mira, era lo peor legible de la tarjeta.
                 */
                style={{ ...VALOR_GRANDE, color: atenuado ? t.textFaint : t.text }}
              />
            )}
            {senal.unidad && <span style={{ fontSize: 15, fontWeight: 600, color: t.textSoft }}>{senal.unidad}</span>}
            <Delta
              valor={senal.deltaBuffer}
              t={t}
              subirEsBueno={senal.subirEsBueno}
              decimales={senal.decimales}
            />
          </div>

          <div style={{ marginTop: 12 }}>
            <BandaValor senal={senal} t={t} dark={dark} />
          </div>
        </>
      )}

      <div style={{ marginTop: 16 }}>
        {senal.historizado ? (
          <GraficaHistoria
            senal={senal}
            datos={senal.historiaReal}
            cargando={senal.historiaCargando}
            enVivo={senal.historiaEnVivo}
            error={senal.historiaError}
            cobertura={cobertura}
            exportable
            t={t}
            dark={dark}
            alto={150}
            delay={delay + 0.2}
          />
        ) : esBooleano ? null : tieneBufer ? (
          <>
            <GraficaBufer senal={senal} valores={senal.bufferVivo} t={t} dark={dark} alto={64} delay={delay + 0.2} />
            <div style={{ marginTop: 6 }}>
              <InsigniaOrigen real={false} t={t} />
            </div>
          </>
        ) : (
          <GraficaAusente t={t} alto={90} mensaje={traducir("detail.noOwnSeries")} />
        )}
        {/* Una configurada sin serie verificada dice POR QUÉ, con la causa que
            dejó el sondeo (Plan 42.5 D4/D11), y a dónde ir a sondearla. */}
        {!senal.historizado && configurada && !esBooleano && (
          <p style={{ margin: "8px 0 0", fontSize: 11, color: t.textFaint, lineHeight: 1.5 }}>
            {traducir(`maquina.detalle.causa.${senal.historiaCausa ?? "sin-sondear"}`, {
              otras: (senal.historiaCompartidaCon ?? []).join(", "),
            })}
            {onIrAConfiguracion && (
              <>
                {" "}
                <button
                  type="button"
                  onClick={onIrAConfiguracion}
                  style={{ background: "none", border: "none", padding: 0, color: t.accent, cursor: "pointer", fontSize: 11 }}
                >
                  {traducir("maquina.detalle.irAConfiguracion")}
                </button>
              </>
            )}
          </p>
        )}
      </div>

      {senal.nota && (
        <p style={{ margin: "12px 0 0", fontSize: 10.5, color: t.textFaint, lineHeight: 1.5 }}>
          {configurada ? senal.nota : senalTexto(senal.key, "nota")}
        </p>
      )}

      {/* Al final y plegado: es información de consulta, no parte de la
          lectura. Quien mira el tablero quiere la cifra; quien duda de ella
          abre esto. Ver la cabecera de `PanelProcedencia.jsx`. */}
      <PanelProcedencia senal={senal} punto={senal.punto ?? null} cobertura={cobertura} ahora={ahora} />
    </Card>
  );
}

export function DetalleGrid({ variables, t, dark, ahora, cobertura = null, onIrAConfiguracion = null }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 18 }}>
      {variables.map((senal, i) => (
        <TarjetaVariable
          key={senal.key} senal={senal} t={t} dark={dark} ahora={ahora}
          cobertura={cobertura} delay={i * 0.07} onIrAConfiguracion={onIrAConfiguracion}
        />
      ))}
    </div>
  );
}
