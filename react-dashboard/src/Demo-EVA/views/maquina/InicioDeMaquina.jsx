/**
 * La portada de una máquina configurada, elegida por su TIPO — Plan 46 F4.
 *
 * ── POR QUÉ EXISTE ESTE ARCHIVO ────────────────────────────────────
 *
 * Hasta el 26-09-2026 la ruta `maq-inicio` apuntaba directamente a
 * `InicioVibraciones`, y funcionaba porque todas las máquinas configuradas
 * eran del mismo tipo. Con `sensado` deja de funcionar: esa portada habla de
 * apoyos, de velocidad eficaz y lleva un hero 3D del tren de rotor, así que
 * una máquina de sensores abría con la portada de un motor y todas sus cifras
 * en blanco.
 *
 * Esto es un REPARTIDOR, no una vista: no pinta nada propio. Mira el tipo de
 * la máquina que se tiene delante y monta la portada que le corresponde.
 *
 * ── POR QUÉ UN `if` AQUÍ NO ES EL `if` QUE EL PROYECTO PROHÍBE ─────
 *
 * `CLAUDE.md` §4.3 y el Plan 42.5 D1 sacaron de las vistas el condicional por
 * máquina —«si es el tanque pinta esto, si es vibraciones lo otro»— porque
 * repetido en cinco archivos se olvida en el sexto. La regla es que no haya
 * un `if` por máquina DENTRO de una vista.
 *
 * Esto es lo contrario: un solo sitio, por TIPO y no por máquina, y su única
 * responsabilidad es elegir. Dos motores del mismo tipo caen en la misma
 * portada sin tocar nada, que es justo lo que aquella regla busca. La
 * alternativa —que cada portada empezara comprobando si la máquina es suya—
 * sí sería el condicional repartido.
 *
 * ── LO QUE PASA CON UN TIPO SIN PORTADA PROPIA ────────────────────
 *
 * Cae en la genérica de máquina configurada (`PlantaMaquina`), que no supone
 * nada del tipo: enseña sus variables, sus activos y lo que falta. Es una
 * portada pobre pero honesta, y mejor que una pantalla en blanco o que la
 * portada de otra máquina.
 */
import { lazy, Suspense } from "react";

import { useMaquina } from "../../data/comunes/MaquinaContext.jsx";

const InicioVibraciones = lazy(() => import("../vibraciones/InicioVibraciones.jsx"));
const InicioSensado = lazy(() => import("../sensado/InicioSensado.jsx"));
const PlantaMaquina = lazy(() => import("./PlantaMaquina.jsx"));

/**
 * Qué portada sirve a cada tipo.
 *
 * Es un mapa y no una cadena de `if` para que añadir un tipo sea añadir una
 * línea, y para que se vea de un vistazo cuáles tienen portada propia.
 */
const PORTADAS = {
  vibraciones: InicioVibraciones,
  sensado: InicioSensado,
};

export default function InicioDeMaquina(props) {
  /*
   * El tipo sale de la CONFIGURACIÓN de la máquina y no de su entrada del
   * registro: `registro` existe también para las escritas a mano, que no
   * tienen tipo (`CLAUDE.md` §4.7). Sin máquina configurada delante —una URL
   * sin `?maquina=`— no hay tipo y cae en la genérica, que sabe decir que no
   * hay nada que enseñar.
   */
  const { configurada } = useMaquina();
  const Portada = PORTADAS[configurada?.tipo] ?? PlantaMaquina;

  /*
   * El `Suspense` es de aquí y no de cada portada: las tres se cargan en
   * diferido y sin él la primera pintada lanzaría. El fallback va vacío a
   * propósito —es un instante y un «cargando…» que parpadea molesta más que
   * un hueco—; quien tarda de verdad es el dato, y de eso avisa cada portada.
   */
  return (
    <Suspense fallback={null}>
      <Portada {...props} />
    </Suspense>
  );
}
