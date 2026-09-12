/**
 * edad-dato-controles.test.jsx
 * ------------------------------------------------------------------
 * Plan 24, F0 (`USO-01`): los tres sitios que enseñaban el valor de una señal
 * SIN decir si era de ahora, y que ahora pasan por `presentarValor()` —
 * `ControlesTanque`, `FichaActivo` y las tarjetas de `InicioTanque`.
 *
 * Hermano de `edad-dato.test.jsx`, que cubre los que ya lo hacían desde el
 * Plan 13 F2 (`BandaSenales`, `DetalleGrid`, `RejillaActivos`). Mismo criterio
 * en lo que importa: señales construidas con el `createSenal` REAL para que su
 * forma no pueda desincronizarse del contrato, y un `ahora` inyectado en vez de
 * esperar a un reloj.
 *
 * ── POR QUÉ ESTE HERMANO NO NECESITA jsdom, Y AQUÉL SÍ ──────────────
 *
 * Porque prueban dos cosas distintas. `edad-dato.test.jsx` monta componentes
 * porque lo que comprueba es el CABLEADO: que la cifra de la pantalla se
 * sustituya de verdad. Aquí no se puede hacer lo mismo con dos de los tres
 * sitios —`ControlesTanque` y `FichaActivo` no exportan sus piezas internas, y
 * montar la vista entera arrastraría red o un Canvas de three.js— así que lo
 * que se prueba es el CONTRATO que las tres comparten, más la distinción de
 * `REJILLA_VISTAS` de la que depende la tercera.
 *
 * La forma sintáctica —que ninguna de las tres se salte la puerta, ahora o en
 * seis meses— la vigila `scripts/verificar-frescura.mjs`, que no necesita jsdom
 * y además cubre los archivos que todavía no existen. Las dos piezas juntas son
 * la cobertura; ninguna sola lo es.
 *
 * ── POR QUÉ `ControlesTanque` ES EL QUE MÁS IMPORTA DE LOS TRES ─────
 *
 * Porque es el único donde la cifra vieja tiene un accionamiento de bomba al
 * lado. La cabecera de esa vista ya dice que el nivel que se ve ahí es el MISMO
 * dato que la guarda de «nivel de tanque alto» del backend está mirando en el
 * momento de encender: con la lectura congelada, el operador y esa guarda
 * deciden sobre dos números distintos.
 */
import { describe, expect, it } from "vitest";

import { createSenal } from "@/Demo-EVA/domain/sistema.js";

const AHORA = new Date("2026-08-21T12:00:00Z");

const senalDe = ({ edadMs, stale }) =>
  createSenal({
    key: "nivelTanque",
    valor: 62.5,
    receivedAt: new Date(AHORA.getTime() - edadMs),
    stale,
  });

const FRESCA = { edadMs: 2_000, stale: false };
const CONGELADA = { edadMs: 90_000, stale: true };

import { FRESCURA, presentarValor } from "@/Demo-EVA/data/comunes/estadoDelDato.js";
import { fmtSenal } from "@/Demo-EVA/lib/formato.js";

describe("USO-01: los tres sitios nuevos y el contrato que comparten", () => {
  it("fresca: se enseña el valor formateado, sin atenuar", () => {
    const { texto, atenuado, frescura } = presentarValor({
      ...senalDe(FRESCA), ahora: AHORA, formateado: fmtSenal(senalDe(FRESCA)),
    });

    expect(texto).toMatch(/62[.,]5/);
    expect(atenuado).toBe(false);
    expect(frescura).toBe(FRESCURA.FRESCO);
  });

  it("congelada: el valor NO aparece, y en su hueco va la edad", () => {
    const senal = senalDe(CONGELADA);
    const { texto, atenuado, frescura } = presentarValor({
      receivedAt: senal.receivedAt, stale: senal.stale, ahora: AHORA, formateado: fmtSenal(senal),
    });

    // Lo que importa de esta línea: el 62,5 NO está. Un valor de hace minuto y
    // medio presentado como actual es lo que este módulo existe para evitar.
    expect(texto).not.toMatch(/62[.,]5/);
    expect(texto).toMatch(/hace/);
    expect(atenuado).toBe(true);
    expect(frescura).toBe(FRESCURA.CONGELADO);
  });

  it("sin lectura: no se afirma frescura, y eso NO atenúa un valor que no hay", () => {
    // La lección del 07-09-2026, en forma de prueba: sin `receivedAt` el estado
    // es SIN_DATO, nunca FRESCO. Un valor por defecto optimista aquí es
    // exactamente cómo el panel de salud dio «Funcionando» con los servicios
    // caídos.
    const { frescura } = presentarValor({ receivedAt: null, ahora: AHORA, formateado: "—" });
    expect(frescura).toBe(FRESCURA.SIN_DATO);
  });
});

/*
 * El tercer sitio de F0 es el que tenía la trampa: en `InicioTanque`, `VISTAS`
 * es una constante de MÓDULO, así que su `dato()` es una función pura llamada
 * fuera del árbol de React y no puede usar un hook. La frescura se aplica en
 * `TarjetaVista`, y `dato()` sólo adjunta la señal cuando hay una medida que
 * pueda caducar.
 *
 * Eso es lo que se prueba aquí, y es una distinción con consecuencia: de las
 * tres entradas de `VISTAS`, dos devuelven CUENTAS («3 en aviso», «8 de 8 con
 * lectura») y una devuelve una MEDIDA («62,5 %»). Una cuenta sigue siendo
 * cierta con la lectura vieja; una medida, no. Atenuar las tres por igual sería
 * mentir en la otra dirección.
 */
import { REJILLA_VISTAS } from "@/Demo-EVA/views/tanque/InicioTanque.jsx";

/** Un `sistema` mínimo con la forma que `dato()` lee. */
const sistemaDe = (senal) => ({
  resumen: { medidas: 1, totalSenales: 1, fueraDeLimite: 0, enAviso: 0, enBanda: 1 },
  senales: { nivelTanque: senal },
});

describe("InicioTanque · VISTAS[].dato: sólo la medida adjunta su señal", () => {
  it("la entrada de la maqueta (una MEDIDA) adjunta la señal, para que la tarjeta pueda atenuarla", () => {
    const senal = senalDe(CONGELADA);
    const entrada = REJILLA_VISTAS.find((v) => v.id === "eva-maqueta");
    const dato = entrada.dato(sistemaDe(senal));

    expect(dato.senal).toBeTruthy();
    expect(dato.senal.receivedAt).toEqual(senal.receivedAt);
  });

  it("las entradas que CUENTAN no adjuntan señal: una cuenta no caduca con el reloj", () => {
    const sistema = sistemaDe(senalDe(FRESCA));

    for (const id of ["eva-planta", "eva-assets"]) {
      const dato = REJILLA_VISTAS.find((v) => v.id === id).dato(sistema);
      expect(dato.senal, `${id} no debe adjuntar señal`).toBeUndefined();
    }
  });

  it("sin lectura no hay tarjeta de dato, y eso ya era así antes de F0", () => {
    const sinDato = createSenal({ key: "nivelTanque", valor: null, receivedAt: null });
    const entrada = REJILLA_VISTAS.find((v) => v.id === "eva-maqueta");

    expect(entrada.dato(sistemaDe(sinDato))).toBeNull();
  });
});
