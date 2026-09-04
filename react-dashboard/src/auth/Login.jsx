/**
 * La puerta de entrada: usuario y contraseña de ICONICS.
 *
 * ── SON LAS CREDENCIALES DE PLANTA, Y HAY QUE DECIRLO ──────────────
 *
 * No es un formulario de registro de esta aplicación. Aquí no hay «crear
 * cuenta», ni «¿olvidaste tu contraseña?», y ponerlos sería mentir: no existe
 * ningún directorio de usuarios que este programa pueda tocar. Lo que se teclea
 * aquí viaja al servidor de seguridad de ICONICS, y con ese token se leerá la
 * planta después. Por eso el subtítulo lo dice con todas las letras — quien se
 * equivoca de contraseña tiene que saber en qué sistema buscarla.
 *
 * ── EL ERROR SE ENSEÑA COMO LO MANDA EL SERVIDOR ───────────────────
 *
 * `sesionRoutes.mjs` distingue tres cosas que aquí NO se funden en un
 * «no se pudo entrar»: credenciales rechazadas (401), servidor sin plazas
 * (503) y cuerpo mal formado (400). Traducirlas todas a la misma frase
 * mandaría al técnico a revisar una contraseña que está bien. Es la regla de
 * CLAUDE.md §4.6 aplicada a la primera pantalla que ve nadie.
 *
 * ── POR QUÉ NO SE DESHABILITA EL BOTÓN CON LOS CAMPOS VACÍOS ───────
 *
 * Porque un botón inerte no explica nada. Con `required` en los campos, el
 * navegador señala cuál falta y por qué, en el idioma del sistema y con su
 * propio foco — que es mejor de lo que haría este formulario a mano, y además
 * funciona con lector de pantalla.
 */
import { useState } from "react";
import { KeyRound, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/index.js";
import { fieldStyle } from "@/components/ui/Input.jsx";
import { useTheme } from "@/theme";
import { MONO, SANS } from "@/theme/tipografia.js";
import { useSesion } from "./SesionProvider.jsx";

export default function Login() {
  const { theme: t } = useTheme();
  const { entrar } = useSesion();

  const [usuario, setUsuario] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  async function alEnviar(evento) {
    evento.preventDefault();
    setEnviando(true);
    setError(null);

    try {
      await entrar({ usuario: usuario.trim(), contrasena });
    } catch (fallo) {
      /*
       * El mensaje del servidor tal cual. El respaldo sólo cubre el caso en
       * que no llegue ninguno —red caída antes de la respuesta—, y dice
       * exactamente eso en vez de culpar a las credenciales.
       */
      setError(fallo?.message || "No se pudo contactar con el servidor.");
      setEnviando(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: t.page,
        fontFamily: SANS,
      }}
    >
      <form
        onSubmit={alEnviar}
        style={{
          width: "min(100%, 380px)",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          padding: 28,
          borderRadius: 14,
          background: t.panel,
          border: `1px solid ${t.border}`,
        }}
      >
        <header style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <KeyRound size={20} color={t.accent} aria-hidden="true" />
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 650, color: t.text }}>
              Asistente de planta
            </h1>
          </div>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: t.textFaint }}>
            Entra con tu usuario y contraseña <strong>de ICONICS</strong>. Las
            consultas a la planta saldrán a tu nombre, con tus permisos.
          </p>
        </header>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: t.textSoft }}>Usuario</span>
          <input
            name="usuario"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            required
            autoFocus
            autoComplete="username"
            spellCheck={false}
            style={{ ...fieldStyle(t), fontFamily: MONO }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: t.textSoft }}>Contraseña</span>
          <input
            name="contrasena"
            type="password"
            value={contrasena}
            onChange={(e) => setContrasena(e.target.value)}
            required
            autoComplete="current-password"
            style={{ ...fieldStyle(t), fontFamily: MONO }}
          />
        </label>

        {error && (
          /*
           * `role="alert"` y no un párrafo cualquiera: un lector de pantalla
           * tiene que anunciar el rechazo sin que la persona vuelva a recorrer
           * el formulario buscando qué pasó.
           */
          <p
            role="alert"
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              margin: 0,
              padding: "10px 12px",
              borderRadius: 8,
              fontSize: 13,
              lineHeight: 1.45,
              color: t.coral,
              background: t.coralSoft,
              border: `1px solid ${t.coral}`,
            }}
          >
            <TriangleAlert size={15} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
            {error}
          </p>
        )}

        {/*
          * `loading` y no un spinner propio: `Button` ya pinta el suyo y
          * bloquea el clic. Duplicarlo aquí daría dos ruedas girando en el
          * mismo botón la primera vez que alguien tocara el componente.
          */}
        <Button type="submit" loading={enviando}>
          {enviando ? "Comprobando con ICONICS…" : "Entrar"}
        </Button>

        {/*
          * El aviso de espera no es decoración: el login recorre CINCO saltos
          * contra el servidor de seguridad de ICONICS (ver
          * `backend/iconics/authenticator.mjs`), y en una planta con red lenta
          * eso se nota. Sin esta línea, la espera se lee como que el botón no
          * respondió y se pulsa otra vez.
          */}
        {enviando && (
          <p style={{ margin: 0, fontSize: 11, color: t.textFaint, textAlign: "center" }}>
            El primer inicio de sesión puede tardar unos segundos.
          </p>
        )}
      </form>
    </main>
  );
}
