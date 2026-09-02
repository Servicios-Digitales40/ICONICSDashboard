/**
 * La forma `Sistema`: el único vocabulario que conocen las vistas de Demo EVA.
 *
 * El contenido vive en [`@shared/eva/tanque/sistema.js`](../../../../shared/eva/tanque/sistema.js);
 * aquí queda la puerta. El motivo del traslado está en `./senales.js`.
 *
 * De los cinco archivos del dominio éste es el que más se gana compartiendo:
 * el asistente no evalúa nada por su cuenta, llama a `createSistema()` con las
 * ocho lecturas y responde con el MISMO objeto que pinta la pantalla. Por eso
 * no puede haber un caso en que el chat diga «en banda» de una señal que la
 * tarjeta pinta en rojo.
 *
 * Al mudarse cambió una sola línea: `toNumber` y `hasValue` se toman de
 * `shared/domain/machine.js` directamente, en vez de por el barril
 * `@/lib/domain/index.js` —que es frontend y el backend no puede alcanzar—.
 * Son los mismos saneadores.
 */
export * from "@shared/eva/tanque/sistema.js";
