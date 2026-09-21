/**
 * Qué se ve al llegar a una vista que el rol no alcanza. Plan 35 F3.
 *
 * ── POR QUÉ HACE FALTA, SI EL MENÚ YA LA OCULTA ────────────────────
 *
 * Porque **ocultar no cierra**. Las rutas de este tablero siguen siendo
 * navegables escribiendo su id en la barra de direcciones —lo dice
 * `routes.jsx` de las cinco del tanque, y vale igual aquí—, así que quitar
 * una entrada del menú no impide llegar a ella.
 *
 * Y lo que se encontraba quien llegaba era peor que un aviso: la vista
 * montaba, pedía sus datos, el backend contestaba 403 y la pantalla se
 * quedaba vacía o con un error crudo. El dato nunca salió —eso lo garantiza
 * `exigirRol` en el servidor— pero la respuesta parecía una avería.
 *
 * ── LO QUE ESTO NO ES ──────────────────────────────────────────────
 *
 * **No es la protección.** El código de todas las vistas viaja al navegador
 * igualmente, y cualquiera puede llamar a la API con `curl` sin pasar por
 * aquí. Quien protege es el backend (Plan 35 F2), que devuelve 403 aunque
 * esta pantalla no exista.
 *
 * Esto es la cortesía de decir qué pasa: «esta vista pide rol X, tú tienes
 * Y». Sin eso, quien llegue buscará el fallo en el despliegue en vez de en
 * sus permisos — el mismo motivo por el que el backend contesta 403 y no 404
 * (`autenticacion.mjs`).
 */
import { useTranslation } from "react-i18next";
import { ShieldAlert } from "lucide-react";

import { Panel, SectionLabel } from "@/components/ui/index.js";
import { useTheme } from "@/theme";

export default function SinPermiso({ rolExigido, rolActual }) {
  const { t: traducir } = useTranslation("layout");
  const { theme: t } = useTheme();

  return (
    <>
      <SectionLabel sub={traducir("sinPermiso.sub")}>
        {traducir("sinPermiso.title")}
      </SectionLabel>

      <Panel>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <ShieldAlert size={20} style={{ color: t.amber, flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>
              {traducir("sinPermiso.necesita", {
                rol: traducir(`roles.${rolExigido}`, { defaultValue: rolExigido }),
              })}
            </div>

            {/*
              El rol propio se dice sólo si lo hay. Con la autenticación
              apagada no hay sesión, y esta pantalla no debería ni aparecer —
              pero si aparece, «tu rol: null» sería ruido.
            */}
            {rolActual && (
              <div
                style={{
                  fontSize: 11.5,
                  color: t.textSoft,
                  marginTop: 3,
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                {traducir("sinPermiso.tuRol", {
                  rol: traducir(`roles.${rolActual}`, { defaultValue: rolActual }),
                })}
              </div>
            )}

            <div
              style={{
                fontSize: 11.5,
                color: t.textSoft,
                marginTop: 8,
                fontFamily: "'Inter', sans-serif",
              }}
            >
              {traducir("sinPermiso.queHacer")}
            </div>
          </div>
        </div>
      </Panel>
    </>
  );
}
