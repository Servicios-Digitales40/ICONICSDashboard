/**
 * vistas-por-maquina.test.jsx
 * ------------------------------------------------------------------
 * Las nueve vistas que pertenecen a una máquina. Plan 33 F10.
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
 * Lo que esta prueba fija:
 *
 *  1. **Las nueve están bajo la máquina**, agrupadas en tres apartados.
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

import { ROUTES } from "@/app/routes/routes.jsx";
import { NAV } from "@/app/routes/index.js";
import es from "@/i18n/locales/es/navigation.json";
import en from "@/i18n/locales/en/navigation.json";

const vibraciones = NAV.find((n) => n.group === "sec-vibraciones");
const general = NAV.find((n) => n.group === "sec-general");

describe("las vistas que pertenecen a una máquina", () => {
  it("las cinco que se movieron están bajo la máquina, no en General ni en RAG", () => {
    const suyas = vibraciones.children.map((c) => c.id);

    for (const id of ["eva-alarmas", "eva-bandeja", "eva-avisos", "rag-casos", "rag-documentacion"]) {
      expect(suyas, `«${id}» debería colgar de la máquina`).toContain(id);
    }
  });

  /*
   * El límite del criterio, y por eso es un caso propio. Mover Turno «por
   * coherencia» sería decir que un turno es de una máquina, y no lo es.
   */
  it("Turno se queda en General: es de la planta entera", () => {
    expect(general.children.map((c) => c.id)).toContain("eva-turno");
    expect(vibraciones.children.map((c) => c.id)).not.toContain("eva-turno");
  });

  it("Assets y Configuración también se quedan: son del servidor", () => {
    const enGeneral = general.children.map((c) => c.id);
    expect(enGeneral).toContain("eva-assets");
    expect(enGeneral).toContain("eva-configuracion");
  });

  it("las nueve salen en tres apartados, en orden", () => {
    const apartados = vibraciones.children.map((c) => c.apartado);

    /* Sin huecos: una vista de máquina sin apartado saldría suelta entre dos
       bloques rotulados, que se lee peor que no tener rótulos. */
    expect(apartados.every(Boolean)).toBe(true);

    /* Y agrupados: los de un apartado van seguidos. El Sidebar pinta el rótulo
       cuando CAMBIA respecto al anterior, así que un apartado repetido más
       abajo pintaría su título dos veces. */
    const bloques = apartados.filter((a, i) => a !== apartados[i - 1]);
    expect(new Set(bloques).size).toBe(bloques.length);
  });

  it("cada apartado tiene rótulo en los dos idiomas", () => {
    const usados = new Set(
      ROUTES.map((r) => r.nav?.apartado).filter(Boolean)
    );

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
    for (const hijo of vibraciones.children) {
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
    const enMenu = vibraciones.children.map((c) => c.id);
    expect(enMenu).toContain("eva-bandeja");
    expect(enMenu).not.toContain("eva-riesgos-vibracion");
  });

  /* Cerrado no es borrado: el asistente la usa como destino en
     `navegacionDelAsistente.js`, y se llega escribiendo su id. */
  it("pero la ruta de «Riesgos» sigue existiendo y navegable", () => {
    const riesgos = ROUTES.find((r) => r.id === "eva-riesgos-vibracion");
    expect(riesgos).toBeTruthy();
    expect(riesgos.component).toBeTruthy();
    expect(riesgos.nav).toBeUndefined();
  });
});
