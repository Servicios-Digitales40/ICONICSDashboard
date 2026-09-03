/**
 * La evolución de una variable del compresor en un periodo.
 *
 * Hoy la API sabe devolver la reproducción de un evento concreto
 * (`/api/v1/event-history/`, que es lo que enseña `EventosCompresor`), pero no
 * la serie libre de una variable entre dos fechas. Son preguntas distintas y
 * la segunda todavía no tiene endpoint.
 */
import { PantallaPendiente } from "../components/PantallaPendiente.jsx";

export default function HistoricoCompresor() {
  return (
    <PantallaPendiente
      titulo="Histórico del compresor"
      resumen="La evolución de una variable entre dos fechas, con sus extremos fechados — no la reproducción de un evento, sino la consulta libre."
      mostrara={[
        "La curva de una variable en el periodo que se pida",
        "Mínimo y máximo con la hora exacta en que ocurrieron",
        "Los tramos sin muestra, declarados como hueco y no dibujados como cero",
        "Comparación de la misma variable entre dos periodos",
      ]}
      necesita={[
        "Un endpoint de serie libre: qué parámetros acepta y qué formato tiene cada muestra",
        "La ventana máxima que admite y si pagina",
        "Qué devuelve para un tramo sin dato — hay que poder distinguirlo de un cero real",
        "Cómo señala un fallo del servicio, para no narrarlo nunca como ausencia de dato",
      ]}
      fase="F4"
    />
  );
}
