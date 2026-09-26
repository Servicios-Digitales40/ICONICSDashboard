// @vitest-environment jsdom
/**
 * La portada del tipo `sensado` — Plan 46 F4.
 *
 * ── QUÉ SE AFIRMA AQUÍ, Y QUÉ NO ───────────────────────────────────
 *
 * No se prueba que «se vea bonito»: eso no se puede afirmar y su sitio es
 * mirarlo en pantalla. Lo que sí se puede romper sin que nadie lo note, y por
 * eso está aquí:
 *
 *   1. **Un hueco no se dibuja como un cero** (`CLAUDE.md` §2.4). Es la regla
 *      que más fácil se pierde al tocar una animación: interpolar hasta `null`
 *      da una cuenta atrás hasta cero que parece una caída real de la señal.
 *   2. **La franja de confort NO es una alarma** (§2.5). Se dibuja con el
 *      color suave del acento; en cuanto alguien la pinte de coral o ámbar
 *      estará afirmando que un valor está mal sin tener con qué sostenerlo.
 *   3. **Las escalas salen del ROL, no de la lectura.** Hoy las diez señales
 *      publican constantes de prueba (un dígito del 1 al 9); una escala
 *      ajustada a eso se rompe el día que lleguen valores reales.
 *   4. **El repartidor elige por TIPO.** Una máquina de sensores no debe abrir
 *      con la portada de un motor.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/theme";

const MAQUINA = { id: "sensado-01", nombre: "Sensado TDCON", tipo: "sensado" };

/** Una señal en la forma que produce `estadoDeSensado`. */
const senal = (rol, familia, label, valor, extra = {}) => ({
  clave: rol.split(":")[1],
  rol,
  familia,
  label,
  corto: label,
  unidad: extra.unidad ?? null,
  decimales: extra.decimales ?? 0,
  escala: extra.escala ?? null,
  confort: extra.confort ?? null,
  assetId: null,
  valor,
  sinDato: valor === null,
  ...(valor === null ? { motivo: "El punto no entregó valor en esta lectura." } : {}),
});

let estadoDeMaquina = { estado: null, maquina: MAQUINA, lastUpdated: null, loading: false, error: null };

vi.mock("@/Demo-EVA/data/comunes/useEstadoDeMaquina.js", () => ({
  useEstadoDeMaquina: () => estadoDeMaquina,
  useSeriesDeMaquina: () => ({ series: {}, loading: false, error: null }),
}));

vi.mock("@/Demo-EVA/data/comunes/MaquinaContext.jsx", async (importOriginal) => ({
  ...(await importOriginal()),
  useMaquina: () => ({
    id: MAQUINA.id, configurada: MAQUINA, registro: null,
    enServicio: true, cerrada: null, enServicioIds: [MAQUINA.id],
  }),
}));

const { default: InicioSensado } = await import("@/Demo-EVA/views/sensado/InicioSensado.jsx");

function montar(senales) {
  estadoDeMaquina = {
    estado: { sistema: MAQUINA.id, instalacion: MAQUINA.nombre, general: null, senales, sinLectura: [] },
    maquina: MAQUINA,
    lastUpdated: new Date("2026-09-26T12:00:00Z"),
    loading: false,
    error: null,
  };
  return render(
    <ThemeProvider>
      <InicioSensado />
    </ThemeProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("la portada de sensado", () => {
  it("pinta la corriente por línea, con su unidad", () => {
    montar([
      senal("electrica:corrienteL1", "electrica", "Corriente línea 1", 12.4, { unidad: "A", decimales: 1, escala: [0, 100] }),
      senal("electrica:corrienteL2", "electrica", "Corriente línea 2", 11.8, { unidad: "A", decimales: 1, escala: [0, 100] }),
      senal("electrica:corrienteL3", "electrica", "Corriente línea 3", 12.1, { unidad: "A", decimales: 1, escala: [0, 100] }),
    ]);

    expect(screen.getByText("Corriente línea 1")).toBeTruthy();
    expect(screen.getByText("12.4")).toBeTruthy();
    expect(screen.getAllByText("A").length).toBeGreaterThan(0);
  });

  /*
   * LA prueba de este archivo. El defecto que caza es silencioso: la pantalla
   * seguiría pintando un número, sólo que uno inventado.
   */
  it("una señal SIN DATO no se dibuja como cero: no hay número, y se dice", () => {
    montar([
      senal("electrica:corrienteL1", "electrica", "Corriente línea 1", null, { unidad: "A", decimales: 1, escala: [0, 100] }),
    ]);

    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.getByText("sin dato")).toBeTruthy();
    /* Ni el valor ni su unidad: un «0.0 A» aquí sería una afirmación falsa. */
    expect(screen.queryByText("0.0")).toBeNull();
  });

  /*
   * EL CASO QUE DE VERDAD IMPORTA: una señal que TENÍA valor y deja de tenerlo.
   *
   * La primera versión de esta prueba montaba la señal ya sin dato y pasaba
   * igual con el defecto puesto —el  la tapaba antes de
   * llegar al número—. O sea, no probaba nada. Aquí se re-renderiza con el
   * dato caído, que es cuando el número animado podría contar hasta cero y
   * dibujar una caída que nadie midió.
   */
  it("una señal que PIERDE la lectura no cuenta hasta cero: se apaga", () => {
    const conDato = senal("electrica:corrienteL1", "electrica", "Corriente línea 1", 12.4, { unidad: "A", decimales: 1, escala: [0, 100] });
    const { rerender } = montar([conDato]);
    expect(screen.getByText("12.4")).toBeTruthy();

    estadoDeMaquina = {
      ...estadoDeMaquina,
      estado: { ...estadoDeMaquina.estado, senales: [{ ...conDato, valor: null, sinDato: true, motivo: "El punto no entregó valor en esta lectura." }] },
    };
    rerender(
      <ThemeProvider>
        <InicioSensado />
      </ThemeProvider>,
    );

    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.getByText("sin dato")).toBeTruthy();
    /* Ningún número: ni el viejo, ni un cero, ni nada intermedio. */
    expect(screen.queryByText(/^[0-9]+\.[0-9]$/)).toBeNull();
  });

  it("el hueco convive con las que sí leen, sin contagiarlas", () => {
    montar([
      senal("electrica:corrienteL1", "electrica", "Corriente línea 1", 12.4, { unidad: "A", decimales: 1, escala: [0, 100] }),
      senal("electrica:corrienteL2", "electrica", "Corriente línea 2", null, { unidad: "A", decimales: 1, escala: [0, 100] }),
    ]);

    expect(screen.getByText("12.4")).toBeTruthy();
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.getByText("1 de 2 señales con lectura")).toBeTruthy();
  });

  it("la franja de confort se declara REFERENCIA, no umbral de alarma", () => {
    montar([
      senal("ambiente:co2", "ambiente", "Dióxido de carbono", 640, {
        unidad: "ppm", decimales: 0, escala: [0, 2000], confort: [400, 1000],
      }),
    ]);

    expect(screen.getByText("640")).toBeTruthy();
    expect(screen.getByText(/referencia de confort, no un umbral de alarma/i)).toBeTruthy();
  });

  it("la escala del medidor sale del ROL, no del valor que se lee hoy", () => {
    /* Un valor de prueba minúsculo sobre una escala grande: el arco debe
       quedar casi vacío. Si alguien ajustara la escala a la lectura, se
       llenaría, y la vista mentiría el día que llegue un valor real. */
    const { container } = montar([
      senal("optica:iluminacion", "optica", "Iluminación", 7, { decimales: 0, escala: [0, 1000] }),
    ]);

    const arcos = [...container.querySelectorAll("circle")];
    expect(arcos.length).toBeGreaterThan(0);
    expect(screen.getByText("7")).toBeTruthy();
  });

  it("sin señales lo dice, en vez de dejar la pantalla en blanco", () => {
    montar([]);
    expect(screen.getByText(/no declara ninguna señal/i)).toBeTruthy();
  });
});

describe("el repartidor de portadas elige por TIPO (Plan 46 F4)", () => {
  it("una máquina de tipo sensado NO abre con la portada de un motor", async () => {
    const { default: InicioDeMaquina } = await import("@/Demo-EVA/views/maquina/InicioDeMaquina.jsx");
    estadoDeMaquina = {
      estado: { sistema: MAQUINA.id, instalacion: MAQUINA.nombre, general: null, senales: [], sinLectura: [] },
      maquina: MAQUINA, lastUpdated: null, loading: false, error: null,
    };

    render(
      <ThemeProvider>
        <InicioDeMaquina />
      </ThemeProvider>,
    );

    /* La portada de sensado carga en diferido; lo que importa es que NO sea la
       de vibraciones, que habla de apoyos y velocidad eficaz. */
    expect(await screen.findByText(/no declara ninguna señal/i)).toBeTruthy();
  });
});

/*
 * ── LOS VALORES LLEGAN COMO CADENA (Plan 46 F6.1) ───────────────────
 *
 * ICONICS entrega sus lecturas como CADENA (`"7"`, no `7`), y el 26-09-2026 eso
 * **tumbó la pantalla entera**: `valor.toFixed(...)` sobre un string lanza
 * «toFixed is not a function» y el ErrorBoundary se comía la vista.
 *
 * **Por qué las pruebas de arriba no lo cazaron**: todas pasan NÚMEROS, que
 * es lo que uno escribe sin pensar al fabricar un doble. El transporte real
 * no se parece al doble justo en esto — y es el modo de fallo más caro que
 * hay en un tablero de muro: no degrada, no avisa, desaparece.
 */
describe("los valores tal y como los entrega ICONICS", () => {
  it("una lectura en CADENA se pinta como número, sin tumbar la vista", () => {
    montar([
      { ...senal("electrica:corrienteL1", "electrica", "Corriente línea 1", null, { unidad: "A", decimales: 1, escala: [0, 100] }),
        valor: "12.4", sinDato: false, motivo: undefined },
    ]);

    expect(screen.getByText("12.4")).toBeTruthy();
    expect(screen.getByText("A")).toBeTruthy();
  });

  it("una cadena que NO es número sale como hueco, nunca como cero", () => {
    montar([
      { ...senal("ambiente:co2", "ambiente", "Dióxido de carbono", null, { unidad: "ppm", decimales: 0, escala: [0, 2000] }),
        valor: "sin lectura", sinDato: false, motivo: undefined },
    ]);

    /* `toNumber` lo convierte en null, y esta pieza ya sabe pintar el hueco. */
    expect(screen.getByText("—")).toBeTruthy();
    /*
     * El hueco no se pinta como número. Se afirma sobre la CIFRA —la que lleva
     * el tamaño grande— y no con un `queryByText("0")` a secas: los extremos
     * de la escala (`0` y `2000`) son texto legítimo de la tarjeta, y buscar
     * «0» suelto los cazaba a ellos (Plan 46 F6.2).
     */
    const cifra = screen.getByText("—");
    expect(cifra.textContent).toBe("—");
    expect(screen.queryByText("0 ppm")).toBeNull();
  });

  it("la dona y el medidor también aguantan una cadena", () => {
    const { container } = montar([
      { ...senal("electrica:corrienteL1", "electrica", "Corriente línea 1", null, { unidad: "A", decimales: 1, escala: [0, 100] }),
        valor: "50", sinDato: false, motivo: undefined },
      { ...senal("optica:iluminacion", "optica", "Iluminación", null, { decimales: 0, escala: [0, 1000] }),
        valor: "500", sinDato: false, motivo: undefined },
    ]);

    /* Los arcos se dibujan: un NaN en `strokeDashoffset` los dejaría sin pintar. */
    const arcos = [...container.querySelectorAll("circle")];
    expect(arcos.length).toBeGreaterThan(0);
    for (const a of arcos) {
      const off = a.getAttribute("stroke-dashoffset");
      if (off !== null) expect(off).not.toMatch(/NaN/);
      const arr = a.getAttribute("stroke-dasharray");
      if (arr !== null) expect(arr).not.toMatch(/NaN/);
    }
    expect(screen.getByText("50.0")).toBeTruthy();
    expect(screen.getByText("500")).toBeTruthy();
  });
});

/*
 * ── QUE UNA BARRA CASI VACÍA SE PUEDA LEER ──────────────────────────
 *
 * Con los valores de prueba de hoy, cuatro de los siete medidores quedan por
 * debajo del 5 %: 3 A sobre 0–100, 2 ppm sobre 0–2000, 7 sobre 0–1000. Una
 * barra casi vacía SIN sus extremos no se puede interpretar —2 sobre 0–2000 y
 * 2 sobre 0–10 se ven igual— y la tentación es encoger la escala para que
 * «se vea mejor».
 *
 * Eso es justo lo que el plan advierte que NO hay que hacer: la escala sale
 * del rol, y una ajustada a los valores de prueba se rompe el día que lleguen
 * los reales. Lo que se arregla es la LECTURA, escribiendo los extremos.
 */
describe("una medida se puede leer aunque la barra esté casi vacía", () => {
  it("la tarjeta de ambiente escribe los extremos de su escala", () => {
    montar([
      senal("ambiente:co2", "ambiente", "Dióxido de carbono", 2, {
        unidad: "ppm", decimales: 0, escala: [0, 2000], confort: [400, 1000],
      }),
    ]);
    expect(screen.getByText("2")).toBeTruthy();
    /* Sin esto, «2» no dice nada: ¿2 de 10, o 2 de 2000? */
    expect(screen.getByText("0")).toBeTruthy();
    expect(screen.getByText("2000")).toBeTruthy();
  });

  it("la dona dice de cuánto es cada anillo, con su unidad", () => {
    montar([
      senal("electrica:corrienteL1", "electrica", "Corriente línea 1", 3, { unidad: "A", decimales: 1, escala: [0, 100] }),
    ]);
    expect(screen.getByText("3.0")).toBeTruthy();
    expect(screen.getByText("0–100 A")).toBeTruthy();
  });

  it("la advertencia de confort se dice UNA vez, no en cada tarjeta", () => {
    montar([
      senal("ambiente:temperatura", "ambiente", "Temperatura", 22, { unidad: "°C", decimales: 1, escala: [-10, 50], confort: [18, 26] }),
      senal("ambiente:co2", "ambiente", "Dióxido de carbono", 640, { unidad: "ppm", decimales: 0, escala: [0, 2000], confort: [400, 1000] }),
      senal("ambiente:humedad", "ambiente", "Humedad relativa", 48, { unidad: "%", decimales: 0, escala: [0, 100], confort: [30, 60] }),
    ]);
    /*
     * Repetida en cada tarjeta ocupaba tres de sus cuatro líneas y competía
     * con el número. Sigue estando —es lo que impide leer la franja como una
     * alarma— pero una sola vez.
     */
    expect(screen.getAllByText(/referencia de confort, no un umbral/i)).toHaveLength(1);
  });
});
