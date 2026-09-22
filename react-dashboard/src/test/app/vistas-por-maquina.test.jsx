/**
 * vistas-por-maquina.test.jsx
 * ------------------------------------------------------------------
 * Las vistas que pertenecen a una máquina. Plan 33 F10, sobre una máquina
 * CONFIGURADA desde el Plan 40 F2.
 *
 * ── QUÉ DEFIENDE ───────────────────────────────────────────────────
 *
 * Hasta el 18-09-2026 la sección de una máquina tenía CUATRO entradas
 * —Inicio, Gráficas, Riesgos, Vista 3D— y las otras cinco vivían en «General»
 * y «RAG». Eso tenía sentido con dos máquinas escritas a mano: un turno o una
 * alarma no son de una sola.
 *
 * Deja de tenerlo con máquinas que se dan de alta por configuración. Un
 * hallazgo, un aviso, un caso previo y un manual SON de una máquina —las
 * cuatro cosas ya se filtran por `sistema` en el backend— y tenerlos aparte
 * obligaba a salir de la máquina para ver su propia documentación.
 *
 * ── LA MÁQUINA ES UNA CONFIGURADA (Plan 40 F2, 21-09-2026) ─────────
 *
 * Esto se comprobaba sobre `sec-vibraciones`, la sección de la máquina de
 * vibraciones escrita a mano. Esa máquina se retiró del registro de rutas:
 * las de vibraciones son configuradas y cada una reclama las rutas `maq-*`
 * en su sección `maq:<id>`. Lo que aquí se afirma no cambia —qué vistas son
 * de una máquina y cuáles no— sólo la máquina sobre la que se afirma, así
 * que la prueba se ADAPTA y no se borra.
 *
 * Con el cambio, «Alarmas» dejó de ser de la máquina: cuelga de «Planta»,
 * junto con las copias de planta entera de bandeja, avisos, casos y RAG.
 *
 * Lo que esta prueba fija:
 *
 *  1. **Las siete del menú están bajo la máquina**, agrupadas en tres apartados.
 *  2. **Turno NO se movió.** Un turno sí es de la planta entera: quien entra a
 *     las seis se hace cargo de todo. Es el límite del criterio, y sin esta
 *     comprobación el siguiente que reubique vistas se lo lleva por delante.
 *  3. **El apartado es un separador, no un nivel.** Viaja en el hijo; el árbol
 *     sigue teniendo un solo nivel de grupos.
 *  4. **Cada apartado tiene su rótulo en los dos idiomas.** Un apartado sin
 *     traducir sale como `apartados.visualizacion` en pantalla.
 *  5. **«Riesgos» ya no duplica a «Hallazgos»** en el menú, y su ruta sigue
 *     existiendo.
 */
import { describe, expect, it } from "vitest";

import { ROUTES, NAV_GROUPS } from "@/app/routes/routes.jsx";
import { NAV } from "@/app/routes/index.js";
import { buildNav } from "@/app/routes/buildNav.js";
import es from "@/i18n/locales/es/navigation.json";
import en from "@/i18n/locales/en/navigation.json";

const MAQUINA = { id: "vib-motor-03", nombre: "Nuevo-Modor", tipo: "vibraciones", activa: true };

const navConMaquina = buildNav(ROUTES, NAV_GROUPS, () => true, [MAQUINA]);
const maquina = navConMaquina.find((n) => n.group === `maq:${MAQUINA.id}`);
const planta = NAV.find((n) => n.group === "sec-planta");
const general = NAV.find((n) => n.group === "sec-general");

describe("las vistas que pertenecen a una máquina", () => {
  it("las cuatro de diagnóstico y documentación están bajo la máquina, no en General ni en RAG", () => {
    const suyas = maquina.children.map((c) => c.id);

    for (const id of ["maq-hallazgos", "maq-avisos", "maq-casos", "maq-rag"]) {
      expect(suyas, `«${id}» debería colgar de la máquina`).toContain(id);
    }
    /* Y ninguna de las de planta entera se cuela en la máquina: dirían que los
       hallazgos de TODAS son de ésta. */
    for (const id of ["eva-alarmas", "eva-bandeja", "eva-avisos", "rag-casos", "rag-documentacion"]) {
      expect(suyas, `«${id}» es de planta, no de la máquina`).not.toContain(id);
      expect(planta.children.map((c) => c.id), `«${id}» debería colgar de Planta`).toContain(id);
    }
  });

  /*
   * El límite del criterio, y por eso es un caso propio. Mover Turno «por
   * coherencia» sería decir que un turno es de una máquina, y no lo es.
   */
  it("Turno se queda en General: es de la planta entera", () => {
    expect(general.children.map((c) => c.id)).toContain("eva-turno");
    expect(maquina.children.map((c) => c.id)).not.toContain("eva-turno");
    expect(planta.children.map((c) => c.id)).not.toContain("eva-turno");
  });

  it("Assets y Configuración también se quedan: son del servidor", () => {
    const enGeneral = general.children.map((c) => c.id);
    expect(enGeneral).toContain("eva-assets");
    expect(enGeneral).toContain("eva-configuracion");
  });

  it("las siete salen en tres apartados, en orden", () => {
    const apartados = maquina.children.map((c) => c.apartado);

    /* Sin huecos: una vista de máquina sin apartado saldría suelta entre dos
       bloques rotulados, que se lee peor que no tener rótulos. */
    expect(apartados.every(Boolean)).toBe(true);

    /* Y agrupados: los de un apartado van seguidos. El Sidebar pinta el rótulo
       cuando CAMBIA respecto al anterior, así que un apartado repetido más
       abajo pintaría su título dos veces. */
    const bloques = apartados.filter((a, i) => a !== apartados[i - 1]);
    expect(new Set(bloques).size).toBe(bloques.length);
    expect(bloques).toEqual(["visualizacion", "diagnostico", "documentacion"]);
  });

  it("cada apartado tiene rótulo en los dos idiomas", () => {
    /* Los apartados se declaran en `nav` (rutas de planta) y en `porMaquina`
       (rutas de máquina configurada): se recogen de los dos sitios. */
    const usados = new Set(
      ROUTES.flatMap((r) => [r.nav?.apartado, r.porMaquina?.apartado]).filter(Boolean)
    );
    expect(usados.size).toBeGreaterThan(0);

    for (const apartado of usados) {
      expect(es.apartados?.[apartado], `falta «${apartado}» en español`).toBeTruthy();
      expect(en.apartados?.[apartado], `falta «${apartado}» en inglés`).toBeTruthy();
    }
  });

  /*
   * El apartado NO puede volverse un segundo nivel sin que alguien lo decida:
   * haría recursivos `buildNav` y `NavGroup`, y con ellos el plegado, el
   * colapsado y el conteo del badge.
   */
  it("el apartado es un separador, no un nivel: el árbol sigue plano", () => {
    for (const hijo of maquina.children) {
      expect(hijo.children, `«${hijo.id}» tiene hijos: el árbol dejó de ser plano`).toBeUndefined();
      expect(typeof hijo.apartado === "string" || hijo.apartado === null).toBe(true);
    }
  });
});

describe("«Riesgos» y «Hallazgos» no se duplican", () => {
  /*
   * Contestaban la misma pregunta con dos nombres, y dos entradas que dicen lo
   * mismo se leen como dos cosas distintas: alguien mira una, no encuentra lo
   * que busca y no sabe que la otra existe.
   */
  it("sólo una de las dos tiene entrada de menú", () => {
    const enMenu = maquina.children.map((c) => c.id);
    expect(enMenu).toContain("maq-hallazgos");
    expect(enMenu).not.toContain("maq-riesgos");
  });

  /* Cerrado no es borrado: el asistente la usa como destino en
     `navegacionDelAsistente.js`, y se llega con su id y `?maquina=`. Era
     `eva-riesgos-vibracion` hasta el Plan 40 F2. */
  it("pero la ruta de «Riesgos» sigue existiendo y navegable", () => {
    const riesgos = ROUTES.find((r) => r.id === "maq-riesgos");
    expect(riesgos).toBeTruthy();
    expect(riesgos.component).toBeTruthy();
    expect(riesgos.nav).toBeUndefined();
    /* Es de máquina —sin `?maquina=` no sabría de cuál hablar— y `oculta`
       a propósito, que es lo que la deja fuera del menú. */
    expect(riesgos.porMaquina?.oculta).toBe(true);
  });
});
