/**
 * El catálogo de variables del compresor: qué se puede consultar.
 *
 * Pendiente, y por un motivo concreto: el histórico que alimenta la API vive
 * en una hoja de cálculo cuyo contenido exacto todavía no está inventariado.
 * Sin saber qué columnas trae —y con qué unidad— no hay catálogo que escribir,
 * y escribirlo a ojo sería inventar la instalación.
 */
import { PantallaPendiente } from "../components/PantallaPendiente.jsx";

export default function VariablesCompresor() {
  return (
    <PantallaPendiente
      titulo="Variables del compresor"
      resumen="Qué mide esta máquina, con qué unidad y en qué rango se mueve — el equivalente al catálogo de señales que las máquinas de planta ya tienen."
      mostrara={[
        "Cada variable con su nombre legible, su unidad y su rango válido",
        "Cuáles tienen serie histórica y cuáles sólo valor suelto",
        "Desde qué fecha hay dato, y si el histórico es contiguo",
        "Lo que NO se puede afirmar de cada una, igual que hacen los dos sistemas de planta",
      ]}
      necesita={[
        "El inventario del histórico: qué columnas trae exactamente la hoja de cálculo que alimenta la API",
        "La unidad de cada variable — sin ella, un número en pantalla no significa nada",
        "Un endpoint que liste las variables, o la lista acordada por escrito",
      ]}
      fase="F5"
    />
  );
}
