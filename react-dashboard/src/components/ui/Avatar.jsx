/** ui/Avatar.jsx — círculo con iniciales, usado en usuarios, top performers, perfil, etc. */
import { useTheme } from "@/theme";

export function Avatar({ name, grad, size = 36 }) {
  const { theme: t } = useTheme();
  const initials = name.split(" ").map((n) => n[0]).slice(0, 2).join("");
  return (
    <span
      style={{
        width: size, height: size, borderRadius: "50%",
        background: grad || t.gradAccent, color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: size * 0.36, fontWeight: 700, flexShrink: 0,
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}
    >
      {initials}
    </span>
  );
}
