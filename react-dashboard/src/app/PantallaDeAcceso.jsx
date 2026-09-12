/**
 * Pantalla de acceso (Plan 25 F9 · `SEG-01`, segunda mitad).
 *
 * ── POR QUÉ NO SE PUEDE CERRAR ──────────────────────────────────────
 *
 * Porque no es una elección de la persona: aparece cuando `SesionProvider`
 * decide que hace falta acceso (§F9), y sin sesión válida el resto del
 * tablero pediría rutas que van a devolver 401. Cerrarla sin resolverla
 * dejaría una aplicación que parece funcionar y no funciona.
 *
 * ── POR QUÉ NO APARECE EN MODO MURO ─────────────────────────────────
 *
 * `SesionProvider.bloqueando` ya es `false` en muro a propósito — ver su
 * cabecera. Esta pantalla ni se monta ahí: un wallboard sin teclado no puede
 * rellenar un formulario, así que forzarlo dejaría el muro en blanco hasta
 * que alguien subiera con uno.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Lock, User } from "lucide-react";

import { Button, Input } from "@/components/ui/index.js";
import { useTheme } from "@/theme";
import { useSesion } from "./providers/SesionProvider.jsx";
import { useMensajeDeError } from "@/i18n/useMensajeDeError.js";

export function PantallaDeAcceso() {
  const { theme: t } = useTheme();
  const { t: traducir } = useTranslation(["settings", "common"]);
  const mensajeDeError = useMensajeDeError();
  const { entrar } = useSesion();

  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  const enviar = async (e) => {
    e.preventDefault();
    if (!usuario.trim() || !clave) return;

    setEnviando(true);
    setError(null);
    try {
      await entrar(usuario.trim(), clave);
    } catch (err) {
      setError(err);
      // La clave se limpia tras un fallo — el usuario se conserva, para no
      // obligar a reteclearlo si sólo se equivocó en la clave.
      setClave("");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: t.overlay, backdropFilter: "blur(3px)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <form
        onSubmit={enviar}
        style={{
          background: t.panel, borderRadius: 16, padding: "28px 26px",
          width: 340, boxShadow: t.shadowHover, border: `1px solid ${t.border}`,
          display: "flex", flexDirection: "column", gap: 16,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: t.text, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            {traducir("settings:access.title")}
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 12.5, color: t.textSoft }}>
            {traducir("settings:access.subtitle")}
          </p>
        </div>

        <Input
          icon={<User size={15} />}
          placeholder={traducir("settings:access.userPlaceholder")}
          value={usuario}
          onChange={(e) => setUsuario(e.target.value)}
        />
        <Input
          icon={<Lock size={15} />}
          type="password"
          placeholder={traducir("settings:access.passwordPlaceholder")}
          value={clave}
          onChange={(e) => setClave(e.target.value)}
          error={error ? mensajeDeError(error).titulo : undefined}
        />

        <Button type="submit" disabled={enviando || !usuario.trim() || !clave} loading={enviando}>
          {traducir("settings:access.submit")}
        </Button>
      </form>
    </div>
  );
}
