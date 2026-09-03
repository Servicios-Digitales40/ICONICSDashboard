/**
 * La pantalla que da nombre al módulo: cómo se comportará una variable.
 *
 * ── LA QUE MÁS CUIDADO PIDE ─────────────────────────────────────────
 *
 * Es la única pantalla del tablero que va a afirmar algo sobre el futuro, y
 * eso la pone a un paso de romper dos reglas del proyecto a la vez:
 *
 *  · Una predicción sin su margen es una afirmación falsa. `analisis_de_senal`
 *    ya lo resuelve en Monitoreo —la proyección se cita SIEMPRE con su rango—
 *    y aquí no puede ser menos.
 *  · No se pone plazo a una avería sin base. El sistema de vibraciones ya se
 *    niega a hacerlo (no tiene mecanismos de desgaste declarados); sería
 *    incoherente que el módulo vecino lo hiciera con menos respaldo.
 *
 * Por eso el dato que más falta aquí no es el endpoint: es el ERROR VALIDADO
 * del modelo. Sin esa cifra no hay forma honesta de redactar una predicción, y
 * la pantalla se quedaría enseñando una línea sin decir cuánto se puede fiar
 * nadie de ella.
 */
import { PantallaPendiente } from "../components/PantallaPendiente.jsx";

export default function PronosticoCompresor() {
  return (
    <PantallaPendiente
      titulo="Pronóstico"
      resumen="Cómo se comportará una variable del compresor en los próximos días — siempre con su incertidumbre al lado, nunca como una línea sola."
      mostrara={[
        "La proyección de una variable al horizonte que se pida",
        "Su margen de error, con el mismo peso visual que la propia curva",
        "El error validado del modelo, dicho en la pantalla y no escondido",
        "Una negativa explícita cuando el horizonte pedido excede lo que el modelo sostiene",
      ]}
      necesita={[
        "El endpoint de predicción: qué horizontes admite y qué devuelve",
        "Qué forma tiene la incertidumbre: ¿intervalo de confianza, desviación, probabilidad de evento?",
        "El error validado del modelo — la cifra concreta, sin ella no hay redacción honesta posible",
        "Qué algoritmo es y sobre qué se entrenó, para poder decirlo cuando alguien pregunte",
      ]}
      fase="F7"
    />
  );
}
