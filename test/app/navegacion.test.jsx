// @vitest-environment jsdom
/**
 * navegacion.test.jsx
 * ------------------------------------------------------------------
 * La ruta actual vive en la URL, no sólo en memoria.
 *
 * ── POR QUÉ ESTA PRUEBA ────────────────────────────────────────────
 *
 * Durante todo el desarrollo la navegación fue un `useState` y la barra de
 * direcciones no cambiaba nunca. En un escritorio eso no molesta; el destino
 * de esto son monitores fijos de planta, y allí significaba tres cosas
 * concretas: que no se podía configurar una pantalla para que abriera
 * «Rectificadoras», que cualquier recarga —o el reinicio del equipo— la
 * devolvía a Planta, y que no se podía enviar el enlace de una máquina.
 *
 * Lo que se fija aquí es que la URL sea la fuente de la verdad al arrancar, y
 * que siga siéndolo al navegar y al retroceder. Son casos de teclado y de
 * kiosco que nadie ejerce durante el desarrollo, y por eso conviene que los
 * ejerza una prueba.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { useNavegacion } from "@/app/routes/useNavegacion.js";

const RUTAS = ["dashboard", "area-LIN", "area-REC", "assets", "machine-detail"];
const DEFECTO = "dashboard";

/** Sonda mínima: pinta la ruta resuelta y expone `navigate`. */
function Sonda({ alMontar }) {
  const [nav, navigate] = useNavegacion(RUTAS, DEFECTO);
  alMontar?.(navigate);

  return (
    <div>
      <span data-testid="page">{nav.page}</span>
      <span data-testid="params">{JSON.stringify(nav.params)}</span>
    </div>
  );
}

const irA = (url) => globalThis.history.replaceState(null, "", url);
const pagina = () => screen.getByTestId("page").textContent;
const params = () => JSON.parse(screen.getByTestId("params").textContent);

// `cleanup` explícito: la suite corre sin `globals`, así que Testing Library
// no engancha su limpieza automática y los montajes se acumularían entre
// pruebas. Mismo patrón que `subviews.test.jsx`.
afterEach(() => {
  cleanup();
  irA("/");
});

describe("navegación en la URL", () => {
  it("arranca en la ruta que dice la URL, no en la de por defecto", () => {
    irA("/area-REC");
    render(<Sonda />);

    expect(pagina()).toBe("area-REC");
  });

  it("una URL desconocida cae a la ruta por defecto en vez de dejar la pantalla vacía", () => {
    irA("/ruta-que-ya-no-existe");
    render(<Sonda />);

    expect(pagina()).toBe(DEFECTO);
    // Y además normaliza la barra de direcciones: quien mire la pantalla ve
    // dónde está de verdad.
    expect(globalThis.location.pathname).toBe("/dashboard");
  });

  it("recupera los parámetros del detalle de máquina", () => {
    irA("/machine-detail?machineId=LIN-1&from=area-LIN");
    render(<Sonda />);

    expect(pagina()).toBe("machine-detail");
    expect(params()).toEqual({ machineId: "LIN-1", from: "area-LIN" });
  });

  it("navegar escribe la URL, así que una recarga vuelve al mismo sitio", () => {
    render(<Sonda alMontar={(navigate) => (globalThis.__nav = navigate)} />);

    act(() => globalThis.__nav("machine-detail", { machineId: "REC-13", from: "area-REC" }));

    expect(pagina()).toBe("machine-detail");
    expect(globalThis.location.pathname).toBe("/machine-detail");
    expect(globalThis.location.search).toBe("?machineId=REC-13&from=area-REC");
  });

  it("el botón «atrás» del navegador mueve la pantalla, no sólo la URL", () => {
    irA("/dashboard");
    render(<Sonda alMontar={(navigate) => (globalThis.__nav = navigate)} />);

    act(() => globalThis.__nav("area-REC"));
    expect(pagina()).toBe("area-REC");

    // jsdom no implementa el retroceso real del historial, así que se simula
    // lo que hace el navegador: cambiar la URL y emitir `popstate`.
    act(() => {
      irA("/dashboard");
      globalThis.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(pagina()).toBe("dashboard");
  });

  it("los parámetros que no caben en una URL se quedan en memoria", () => {
    // Las vistas de propuesta empujan al detalle un `cardVariant` con un
    // COMPONENTE dentro. Sin filtro acababa en la URL como
    // `cardVariant=[object Object]`, y al recargar ese texto llegaba al
    // render como si fuera la variante.
    render(<Sonda alMontar={(navigate) => (globalThis.__nav = navigate)} />);

    const Comp = () => null;
    act(() => globalThis.__nav("machine-detail", { machineId: "LIN-3", cardVariant: { label: "neon", Comp } }));

    expect(globalThis.location.search).toBe("?machineId=LIN-3");
    expect(globalThis.location.search).not.toContain("object");
    // Pero en memoria sigue completo, que es lo que usa el render.
    expect(params().machineId).toBe("LIN-3");
  });

  it("no interpreta las rutas de los estáticos del build", () => {
    // Sin esta guarda, entrar por error a un archivo del build pintaría la
    // ruta por defecto y taparía el fallo real.
    irA("/assets/index-abc123.js");
    render(<Sonda />);

    expect(pagina()).toBe(DEFECTO);
  });
});
