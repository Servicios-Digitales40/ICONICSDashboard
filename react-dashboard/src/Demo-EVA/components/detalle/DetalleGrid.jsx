/**
 * Versión A — Rejilla de variables.
 *
 * Extiende directamente la gramática que ya usa `BandaSenales` en Planta: una
 * tarjeta por variable, en rejilla. La diferencia es de ESCALA, no de
 * vocabulario — cada tarjeta lleva su gráfica a tamaño real (150 px, no un
 * sparkline de 24) porque aquí la gráfica es el contenido, no un adorno junto
 * al número.
 */
import { Card, Cifra, Delta, MONO } from "../base.jsx";
import { fmtNum } from "@/lib/format.js";
import { FRESCURA, presentarValor } from "../../data/estadoDelDato.js";
import {
  BandaValor, EstadoBooleano, GraficaAusente, GraficaBufer, GraficaHistoria, InsigniaOrigen,
} from "./piezas.jsx";

const VALOR_GRANDE = { fontFamily: MONO, fontSize: 30, fontWeight: 700, lineHeight: 1 };

function TarjetaVariable({ senal, t, dark, ahora, delay }) {
  const esBooleano = senal.tipo === "booleano";
  const tieneBufer = senal.bufferVivo.length >= 2;

  // La cifra grande es SIEMPRE la lectura en vivo, esté la gráfica de abajo
  // mirando "Ayer" o lo que sea: ver la cabecera de `data/detalleActivo.js`.
  const { atenuado, texto: textoCongelado, frescura } = presentarValor({
    receivedAt: senal.receivedAt, stale: senal.stale, ahora, formateado: null,
  });
  const congelado = frescura === FRESCURA.CONGELADO;

  return (
    <Card t={t} delay={delay} style={{ padding: "18px 20px 20px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>{senal.label}</div>
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
                title="El puente no ha vuelto a leer este punto recientemente."
                style={{ ...VALOR_GRANDE, fontSize: 17, color: t.textFaint }}
              >
                {textoCongelado}
              </span>
            ) : (
              <Cifra
                valor={senal.valor}
                fmt={(v) => fmtNum(v, senal.decimales)}
                duracion={1000}
                style={{ ...VALOR_GRANDE, color: atenuado ? t.textFaint : undefined }}
              />
            )}
            {senal.unidad && <span style={{ fontSize: 15, fontWeight: 600, color: t.textSoft }}>{senal.unidad}</span>}
            <Delta
              valor={senal.deltaBuffer}
              t={t}
              subirEsBueno={senal.subirEsBueno}
              decimales={senal.decimales}
              unidad={senal.unidad ? ` ${senal.unidad}` : ""}
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
          <GraficaAusente t={t} alto={90} mensaje="Sin serie propia del historiador. En cuanto haya dos lecturas en esta sesión, aparecerá aquí." />
        )}
      </div>

      {senal.nota && (
        <p style={{ margin: "12px 0 0", fontSize: 10.5, color: t.textFaint, lineHeight: 1.5 }}>{senal.nota}</p>
      )}
    </Card>
  );
}

export function DetalleGrid({ variables, t, dark, ahora }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 18 }}>
      {variables.map((senal, i) => (
        <TarjetaVariable key={senal.key} senal={senal} t={t} dark={dark} ahora={ahora} delay={i * 0.07} />
      ))}
    </div>
  );
}
