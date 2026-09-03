/**
 * Cliente de TanStack Query para el fetching PUNTUAL: una consulta que se
 * pide una vez (o se refresca a demanda), no el sondeo continuo del tablero.
 *
 * El sondeo en vivo de las ~140 señales sigue siendo `pollingEngine.js`
 * (ver su cabecera): agrupa TODOS los puntos activos en una sola petición
 * por ciclo, algo que Query no hace entre claves distintas — sustituirlo
 * aquí sería reconstruir esa misma lógica peor. Este cliente es para lo
 * demás: el árbol de assets (`ExploradorAssets.jsx`) y la consulta al
 * backend predictivo (`modulos/prediccion/views/EventosCompresor.jsx`).
 *
 * `retry: false` porque ninguno de los fetches que reemplaza reintentaba
 * antes: los mensajes de error ya salen claros de `apiClient.js`, y
 * reintentar solo, en silencio, contra un backend con límite de peticiones
 * por IP (`backend/http/plugins/seguridad.mjs`) cambiaría ese
 * comportamiento sin que nadie lo haya pedido.
 *
 * `refetchOnWindowFocus: false` por el mismo límite: `pollingEngine` ya se
 * pausa con la pestaña oculta y retoma sola al volver (consciente de
 * visibilidad, ver su cabecera); dejar que ADEMÁS cada consulta puntual se
 * dispare sola al recuperar el foco duplicaría tráfico que ninguna vista
 * pidió.
 */
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});
