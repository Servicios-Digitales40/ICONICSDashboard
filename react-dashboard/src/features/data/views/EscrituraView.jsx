/**
 * Subsección "Escritura" de la vista Data.
 *
 * Formulario para agregar un cliente a `db:Northwind.Customers` usando un Data
 * Manipulator de GridWorX, que es la vía nativa de ICONICS para insertar
 * filas: escribir a una celda no inserta, solo actualiza.
 *
 * El manipulador se invoca escribiendo `true` a su punto `.@@Execute` con los
 * parámetros inline:
 *
 *     db:Northwind.AddCustomer<@CustomerID='X', @CompanyName='Y'>.@@Execute
 *
 * El resultado viene en { success, errorMessage } del WriteResult.
 *
 * Los nombres de `PARAMS` deben coincidir con los que define el manipulador en
 * el Workbench; si acepta más, hay que añadirlos a la lista.
 */
import { useState } from "react";
import { UserPlus, Hash, Building2, User, Briefcase, MapPin, Building, Map, Mailbox, Globe, Phone, Printer } from "lucide-react";
import { useTheme } from "@/theme";
import { useToast } from "@/app/providers";
import { Panel, Button, Input } from "@/components/ui/index.js";
import { writeIconicsPoint } from "@/lib/iconics";

const CONFIG = "db:Northwind";
const MANIPULATOR = "AddCustomer";

// Parámetros que se envían al Data Manipulator, con el nombre exacto y sin
// la @. Si el manipulador no acepta alguno, ICONICS lo reporta en
// errorMessage.
const PARAMS = [
  { name: "CustomerID", label: "CustomerID", icon: <Hash size={14} />, required: true, hint: "5 caracteres, único (clave primaria)" },
  { name: "CompanyName", label: "CompanyName", icon: <Building2 size={14} />, required: true },
  { name: "ContactName", label: "ContactName", icon: <User size={14} /> },
  { name: "ContactTitle", label: "ContactTitle", icon: <Briefcase size={14} /> },
  { name: "Address", label: "Address", icon: <MapPin size={14} /> },
  { name: "City", label: "City", icon: <Building size={14} /> },
  { name: "Region", label: "Region", icon: <Map size={14} /> },
  { name: "PostalCode", label: "PostalCode", icon: <Mailbox size={14} /> },
  { name: "Country", label: "Country", icon: <Globe size={14} /> },
  { name: "Phone", label: "Phone", icon: <Phone size={14} /> },
  { name: "Fax", label: "Fax", icon: <Printer size={14} /> },
];

const EMPTY = PARAMS.reduce((acc, p) => ({ ...acc, [p.name]: "" }), {});

// Los valores van entre comillas simples dentro del punto; quitamos las
// comillas simples del texto para no romper la sintaxis del manipulador.
function sanitize(v) {
  return String(v ?? "").replace(/'/g, "");
}

// Construye el punto `.@@Execute` con los parámetros inline.
function buildExecutePoint(values) {
  const args = PARAMS.map((p) => `@${p.name}='${sanitize(values[p.name])}'`).join(", ");
  return `${CONFIG}.${MANIPULATOR}<${args}>.@@Execute`;
}

export default function EscrituraView() {
  const { theme: t } = useTheme();
  const { pushToast } = useToast();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const set = (name, value) => setForm((prev) => ({ ...prev, [name]: value }));

  function validate() {
    const e = {};
    for (const p of PARAMS) {
      if (p.required && String(form[p.name]).trim() === "") e[p.name] = "Requerido";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) {
      pushToast("error", "Completa los campos obligatorios.");
      return;
    }
    setSaving(true);
    try {
      // Disparar el manipulador escribiendo true a su punto .@@Execute.
      const res = await writeIconicsPoint(buildExecutePoint(form), true);
      const result = res.result ?? {};

      if (result.success) {
        pushToast("success", `Cliente "${form.CompanyName}" agregado.`);
        setForm(EMPTY);
        setErrors({});
      } else {
        pushToast("error", `ICONICS rechazó la operación: ${result.errorMessage ?? "motivo desconocido"}`);
      }
    } catch (err) {
      pushToast("error", err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel
      title="Agregar cliente a ICONICS"
      code={`${CONFIG}.${MANIPULATOR} · Data Manipulator (GridWorX)`}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {PARAMS.map((p) => (
          <label key={p.name} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: t.textSoft }}>
              {p.label}
              {p.required && <span style={{ color: t.coral }}> *</span>}
            </span>
            <Input
              icon={p.icon}
              placeholder={p.label}
              value={form[p.name]}
              error={errors[p.name]}
              onChange={(e) => set(p.name, e.target.value)}
            />
            {p.hint && <span style={{ fontSize: 11, color: t.textFaint }}>{p.hint}</span>}
          </label>
        ))}
      </div>

      {/* Vista previa del punto que se ejecutará (útil para depurar). */}
      {/* <div style={{ marginTop: 16 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: t.textSoft }}>Punto a ejecutar</span>
        <div
          style={{
            marginTop: 6,
            padding: "9px 12px",
            borderRadius: 9,
            background: t.hover,
            border: `1px solid ${t.border}`,
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 11.5,
            color: t.textSoft,
            wordBreak: "break-all",
          }}
        >
          {previewPoint} <span style={{ color: t.textFaint }}>← se escribe</span> <b style={{ color: t.accent }}>true</b>
        </div>
      </div> */}

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
        <Button variant="primary" icon={<UserPlus size={14} />} loading={saving} onClick={handleSubmit}>
          Agregar cliente
        </Button>
      </div>

      {/* <p style={{ marginTop: 14, fontSize: 11.5, color: t.textFaint, lineHeight: 1.5 }}>
        Nota: tras agregar, el punto <code>.@@Count</code> puede tardar en refrescar (ICONICS lo cachea)
        y la fila nueva aparece en su posición ordenada, no al final de la tabla.
      </p> */}
    </Panel>
  );
}
