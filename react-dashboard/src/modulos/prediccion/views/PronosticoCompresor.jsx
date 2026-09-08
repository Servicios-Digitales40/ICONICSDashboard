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
/* Carga el diccionario de este modulo. Ver `modulos/prediccion/i18n.js`. */
import "../i18n.js";

import { PantallaPendiente } from "../components/PantallaPendiente.jsx";

export default function PronosticoCompresor() {
  return <PantallaPendiente vista="pronostico" fase="F7" />;
}
