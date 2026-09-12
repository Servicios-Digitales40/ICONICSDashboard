/**
 * «Esto ya pasó antes»: los casos previos de un riesgo, donde se está mirando
 * el riesgo (Plan 25 F0 · `NUE-04`).
 *
 * ── POR QUÉ EXISTE, SI NO CALCULA NADA ─────────────────────────────
 *
 * Porque el cálculo ya estaba y no se veía. `motorDiagnostico.diagnosticar()`
 * llama a `indiceCasos.buscarCasosSimilares()` y devuelve, dentro de CADA causa
 * candidata, los casos que la respaldan o la refutan (`casosCitados`). Eso
 * lleva funcionando desde el Plan 16, pero el único sitio que lo pintaba era
 * `CierreDiagnostico` — la pantalla a la que se va a CERRAR un caso.
 *
 * Es decir: para enterarse de que un riesgo ya había pasado tres veces había
 * que decidir primero que ibas a cerrarlo. El dato llegaba después de la
 * decisión que tenía que informar.
 *
 * ── AQUÍ NO SE PUNTÚA, NI SE ORDENA, NI SE DECIDE ──────────────────
 *
 * `CLAUDE.md` §4.3: una vista que calcula su propia banda ya rompió la capa.
 * Este componente pide `/api/diagnostico` —el MISMO motor, ninguna lógica
 * propia— y pinta lo que vuelve, en el orden en que vuelve. El orden de las
 * causas es el del motor, y es estable a propósito (empate resuelto por el
 * orden de `causas.js`, ver la cola de `diagnostico.mjs`).
 *
 * Se toma la PRIMERA causa candidata, que es la mejor puntuada. No se mezclan
 * los casos de todas: dos causas distintas del mismo riesgo tienen historias
 * distintas, y juntarlas daría un montón de casos sin decir de qué son.
 *
 * ── LO QUE NO SE HACE CON CERO CASOS, Y ES LO IMPORTANTE ───────────
 *
 * No se pinta «0 veces». Un contador a cero se lee como «es la primera vez que
 * pasa», y eso es una afirmación sobre la historia de la instalación que este
 * componente no puede hacer: el índice de casos puede estar vacío porque nunca
 * pasó, o porque nadie ha cerrado un caso todavía, o porque el índice no se ha
 * construido. Son tres cosas distintas y se ven igual desde aquí (§2.4).
 *
 * Así que con cero casos no se pinta NADA. La ausencia de esta tira no afirma
 * nada; un «0 veces» sí lo afirmaría.
 *
 * ── POR QUÉ NO BLOQUEA NI GRITA CUANDO FALLA ───────────────────────
 *
 * Esto es un añadido a una tarjeta de riesgo que ya es útil sin él. Si
 * `/api/diagnostico` no contesta —o el motor no está montado, que devuelve 503
 * a propósito— la tarjeta tiene que seguir enseñando el riesgo, la evidencia y
 * la acción. Un error aquí se queda en silencio y no pinta la tira.
 *
 * Es la excepción deliberada a «los errores se enseñan»: el error de una
 * consulta AUXILIAR que nadie pidió no puede tapar el contenido que sí se
 * pidió. Lo que no se hace es fingir que la consulta salió bien y hay cero
 * casos — por eso `error` y `vacío` toman el mismo camino (no pintar) pero por
 * motivos distintos, y ninguno de los dos escribe un número.
 *
 * ── POR QUÉ NO HAY UN ENLACE A «VER LOS CASOS» ─────────────────────
 *
 * Lo tenía, y se quitó al comprobar a dónde llevaría. `CasosRag` filtra por
 * `params.filtro` (activos/archivados/todos) y nada más: no acepta `sistema` ni
 * `riesgoId`, y su búsqueda por texto **no viaja en la URL a propósito** (lo
 * explica su propia cabecera: se teclea letra a letra y llenaría el historial).
 *
 * Así que el enlace habría llevado a la lista COMPLETA de casos, sin filtrar
 * por el riesgo que se estaba mirando. Un enlace que dice «ver los 3 casos» y
 * abre los cuarenta promete un filtro que no existe — y el usuario que no
 * encuentre los tres entre los cuarenta pensará que el contador mentía.
 *
 * Enseñar el número sin enlace es honesto; enlazar a otra cosa, no. Si algún
 * día `CasosRag` acepta un riesgo por parámetro, el enlace se añade aquí.
 *
 * ── CON EL ORIGEN SIMULADO NO SE PREGUNTA (y la prueba lo exige) ───
 *
 * El índice de casos vive en el servidor: no hay versión simulada de él. Con el
 * simulador encendido no hay backend al que preguntar, y preguntar igual es
 * exactamente lo que `DataSourceProvider` existe para impedir — su cabecera lo
 * dice: repartir un `if` por vista «acabaría dejando alguno pegando al servidor
 * con el simulador encendido».
 *
 * Esto se escribió sin la guarda y lo cazó `vibraciones-simulada.test.jsx`, que
 * corta la red y falla si alguien la toca. Se deja anotado porque el modo de
 * fallo no es visible: la tarjeta se pintaba igual —el error se traga a
 * propósito, ver arriba— y lo único que pasaba es que el tablero simulado
 * llamaba tres veces a un servidor que no estaba.
 *
 * ── POR QUÉ `useEsSimulado()` Y NO `useDataSource()` ───────────────
 *
 * El primer arreglo llamaba a `useDataSource()` aquí mismo, y rompió once
 * pruebas: ese hook **lanza** fuera de su proveedor, a propósito, para que
 * nadie dé por supuesto «real» sin haberlo declarado. Con él, esta tira dejaba
 * de ser un trozo de presentación y pasaba a exigir un proveedor de aplicación
 * para poder dibujarse — las tarjetas de riesgo se montan sueltas en las
 * pruebas de idioma y de vocabulario, sin levantar la aplicación.
 *
 * `useEsSimulado()` es el mismo dato para hojas como ésta, y sin proveedor
 * responde «simulado»: «no lo sé» cae del lado que NO toca la red.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { History } from "lucide-react";

import { obtenerDiagnostico } from "@/lib/api/casosApi.js";
import { useEsSimulado } from "@/lib/datasource";
import { useTheme } from "@/theme";

/**
 * @param {object} props
 * @param {string} props.sistema   `tanque` | `vibraciones`
 * @param {string} props.riesgoId  el id del riesgo, SIN traducir
 */
export function CasosPrevios({ sistema, riesgoId }) {
  /* `t` es el TEMA y `traducir` el diccionario. Ver la cabecera de `@/i18n`. */
  const { theme: t } = useTheme();
  const { t: traducir } = useTranslation("diagnostics");
  const esSimulado = useEsSimulado();
  const [casos, setCasos] = useState([]);

  useEffect(() => {
    // Ver la cabecera: con el simulador no hay índice de casos que consultar.
    if (esSimulado || !sistema || !riesgoId) return undefined;

    const control = new AbortController();
    obtenerDiagnostico({ sistema, riesgoId, signal: control.signal })
      .then((data) => {
        /*
         * La primera causa es la mejor puntuada; ver la cabecera. Un riesgo
         * huérfano (`huerfano: true`) no trae causas y cae solo en el `?? []`.
         */
        setCasos(data?.causas?.[0]?.casosCitados ?? []);
      })
      .catch(() => {
        /* En silencio, a propósito: ver la cabecera. */
        setCasos([]);
      });

    return () => control.abort();
  }, [esSimulado, sistema, riesgoId]);

  // Cero casos no se pinta. NO es «0 veces»: ver la cabecera.
  if (casos.length === 0) return null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <History size={14} color={t.textFaint} style={{ flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: t.textSoft }}>
        {traducir("priorCases.happened", { count: casos.length })}
      </span>
    </div>
  );
}
