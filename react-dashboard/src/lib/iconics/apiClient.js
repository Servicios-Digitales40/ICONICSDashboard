/**
 * Cliente del backend puente hacia ICONICS, para el cajón de Assets.
 *
 * ── QUÉ QUEDA Y POR QUÉ (PLAN 20 FASES 3 Y 4) ──────────────────────
 *
 * Tres funciones. Exportaba diez: la historia y la historia en lote las pedía
 * el tablero de planta para sus gráficas; la escritura, la pantalla de
 * Controles; las alarmas y su reconocimiento, la vista de Alarmas; `fetchHealth`,
 * el banner de estado del layout. Ninguno de esos consumidores existe.
 *
 * Se borran en vez de dejarlas «por si acaso». Una función exportada que nadie
 * llama sigue teniendo que compilar, que probarse y que leerse cada vez que
 * alguien busca cómo se habla con el puente — y su prueba pasaba en verde
 * midiendo código que la aplicación nunca ejecuta, que es peor que no tenerla.
 *
 * Lo que queda lo consume **un solo archivo**, `components/assets/ExploradorAssets.jsx`:
 * el árbol de AssetWorX, sus hijos al expandir, y el valor del nodo
 * seleccionado.
 *
 * ── EL ASISTENTE NO ESTÁ AQUÍ, Y NO DEBE ───────────────────────────
 *
 * Él no lee ICONICS desde el navegador: le pregunta al backend, que es quien
 * sabe las cuatro reglas no obvias del historiador —el prefijo `ac:` y no
 * `hda:`, el agregado `Average`, el tope de 100 muestras, y las tres señales
 * que devuelven la serie de otra sin dar error—. Ver la cabecera de
 * `backend/ia/conversacion/herramientas.mjs`.
 */
import { pedir } from "@/lib/api/pedir.js";

/**
 * Una lectura del puente, con su sesión y su contrato de error.
 *
 * `payload?.ok === false` cuenta como fallo aunque el HTTP sea 200: el puente
 * responde 200 con `ok:false` cuando ICONICS contesta pero mal, y tratarlo
 * como éxito metería un `undefined` en la pantalla sin decir nada.
 */
async function getJson(path) {
  const response = await pedir(path);
  const payload = await response.json();
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error ?? `Error ${response.status} al consultar ${path}`);
  }
  return payload;
}

/** Lee un único punto: `{ ok, payload: { value, quality, timestamp, ... } }`. */
export function fetchIconicsPoint(pointName) {
  const query = pointName ? `?pointName=${encodeURIComponent(pointName)}` : "";
  return getJson(`/api/iconics/data${query}`);
}

/**
 * Lee varios puntos de una sola vez.
 *
 * Devuelve `{ ok, payload: mapa }` indexado por pointName. Es lo que usa el
 * cajón para leer de golpe todas las propiedades del nodo seleccionado, en vez
 * de una petición por propiedad.
 */
export function fetchIconicsBatch(pointNames) {
  const points = pointNames.map((p) => encodeURIComponent(p)).join(",");
  return getJson(`/api/iconics/data/batch?points=${points}`);
}

/**
 * Navega el árbol de AssetWorX. Sin `path`, devuelve las raíces.
 *
 * Los nodos navegables terminan en «/»; las hojas son propiedades y su valor
 * se lee como cualquier punto.
 */
export function browseIconics(path) {
  const query = path ? `?path=${encodeURIComponent(path)}` : "";
  return getJson(`/api/iconics/browse${query}`);
}
