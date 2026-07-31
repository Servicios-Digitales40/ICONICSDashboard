/**
 * @deprecated 2026-07 · archivado en src/_deprecated/
 * Origen: src/data/mockData.js
 * Motivo: datos mock de la plantilla original; sus únicos consumidores están archivados.
 * Restaurar: receta completa en src/_deprecated/README.md
 * Revisar para borrado definitivo: 2026-Q4
 */
/**
 * data/mockData.js
 * ------------------------------------------------------------------
 * Datos ESTÁTICOS de ejemplo (no cambian al pulsar "regenerar").
 * En un proyecto real, reemplaza cada export por una llamada a tu API
 * (fetch, React Query, etc.) — el resto de la app no necesita cambiar,
 * porque los componentes solo esperan arrays/objetos con esta forma.
 */

export const tableRows = [
  { name: "Ana Torres", rol: "Frontend", estado: "activo", progreso: 92 },
  { name: "Luis Gómez", rol: "Backend", estado: "activo", progreso: 76 },
  { name: "Sofía Ruiz", rol: "Diseño", estado: "pendiente", progreso: 38 },
  { name: "Diego Márquez", rol: "QA", estado: "inactivo", progreso: 12 },
  { name: "Elena Paredes", rol: "Infra", estado: "activo", progreso: 64 },
];

export const invoiceRows = [
  { id: "INV-2291", cliente: "Nortech SA", monto: 4820, estado: "pagado" },
  { id: "INV-2292", cliente: "Blue Studio", monto: 1290, estado: "pendiente" },
  { id: "INV-2293", cliente: "Vela Corp", monto: 760, estado: "vencido" },
  { id: "INV-2294", cliente: "Orbit Labs", monto: 3110, estado: "pagado" },
];

export const usersData = [
  { name: "Ana Torres", email: "ana.torres@empresa.com", rol: "Admin", estado: "activo", acceso: "hace 5 min" },
  { name: "Luis Gómez", email: "luis.gomez@empresa.com", rol: "Editor", estado: "activo", acceso: "hace 2 h" },
  { name: "Sofía Ruiz", email: "sofia.ruiz@empresa.com", rol: "Diseño", estado: "pendiente", acceso: "hace 1 día" },
  { name: "Diego Márquez", email: "diego.marquez@empresa.com", rol: "QA", estado: "inactivo", acceso: "hace 12 días" },
  { name: "Elena Paredes", email: "elena.paredes@empresa.com", rol: "Infra", estado: "activo", acceso: "hace 40 min" },
  { name: "Marco Vidal", email: "marco.vidal@empresa.com", rol: "Editor", estado: "activo", acceso: "hace 3 h" },
  { name: "Paula Ibáñez", email: "paula.ibanez@empresa.com", rol: "Viewer", estado: "pendiente", acceso: "hace 6 h" },
];

export const activityFeed = [
  { tone: "success", text: 'Ana Torres aprobó el despliegue de producción', time: "hace 12 min" },
  { tone: "accent", text: 'Se creó el proyecto "Migración Q3"', time: "hace 38 min" },
  { tone: "warning", text: "El uso de almacenamiento superó el 80%", time: "hace 1 h" },
  { tone: "violet", text: "Marco Vidal se unió al equipo de Backend", time: "hace 3 h" },
  { tone: "danger", text: "Falló el build #482 en la rama staging", time: "hace 5 h" },
];

export const topPerformers = [
  { name: "Ana Torres", rol: "Frontend", score: 96 },
  { name: "Elena Paredes", rol: "Infra", score: 88 },
  { name: "Luis Gómez", rol: "Backend", score: 81 },
  { name: "Marco Vidal", rol: "Editor", score: 74 },
];

export const fileTree = {
  name: "Proyecto-Aurora",
  type: "drive",
  children: [
    {
      name: "src",
      type: "folder",
      children: [
        { name: "components", type: "folder", children: [{ name: "Chart.jsx", type: "code" }, { name: "Sidebar.jsx", type: "code" }] },
        { name: "index.js", type: "code" },
      ],
    },
    { name: "assets", type: "folder", children: [{ name: "logo.svg", type: "image" }] },
    { name: "README.md", type: "doc" },
  ],
};

/** KPIs tipo velocímetro para el Dashboard. `tone` selecciona la paleta del arco (ver GaugeKPI.jsx). */
export const gaugeKpis = [
  { title: "Carga del servidor", description: "Uso promedio de CPU en el clúster de Gante durante la última hora.", value: 67, tone: "warm", icon: "server", live: true },
  { title: "Ancho de banda", description: "Consumo de red respecto a la capacidad contratada en Berlín.", value: 43, tone: "cool", icon: "activity", live: true },
  { title: "Satisfacción del cliente", description: "Promedio de las encuestas de soporte de los últimos 30 días.", value: 82, tone: "success", icon: "heart", live: false },
];

/** Etapas del roadmap interactivo. Cada una define sus propios `fields`
 *  (los inputs que se muestran para ESA etapa en particular) — así el
 *  formulario cambia según en qué parte del proyecto estás, en vez de
 *  repetir los mismos campos genéricos siempre. */
export const roadmapStages = [
  {
    title: "Descubrimiento",
    date: "Ene 2026",
    desc: "Entrevistas con stakeholders, benchmarking y definición del alcance del proyecto.",
    fields: [
      { key: "entrevistas", label: "Entrevistas realizadas", icon: "users", placeholder: "Ej. 12 entrevistas con usuarios clave" },
      { key: "objetivo", label: "Objetivo de investigación", icon: "target", placeholder: "¿Qué buscamos validar en esta etapa?" },
    ],
  },
  {
    title: "Diseño UX/UI",
    date: "Feb 2026",
    desc: "Wireframes, sistema de diseño y prototipo interactivo validado con usuarios reales.",
    fields: [
      { key: "herramienta", label: "Herramienta de diseño", icon: "pen", placeholder: "Ej. Figma, Sketch..." },
      { key: "prototipo", label: "Link del prototipo", icon: "link", placeholder: "https://..." },
    ],
  },
  {
    title: "Desarrollo",
    date: "Mar – Abr 2026",
    desc: "Implementación de frontend y backend, integración de datos y pruebas continuas.",
    fields: [
      { key: "repositorio", label: "Repositorio", icon: "branch", placeholder: "Ej. github.com/empresa/proyecto" },
      { key: "cobertura", label: "Cobertura de pruebas", icon: "shield", placeholder: "Ej. 82% de cobertura" },
    ],
  },
  {
    title: "Lanzamiento",
    date: "May 2026",
    desc: "QA final, despliegue a producción y monitoreo activo durante las primeras semanas.",
    fields: [
      { key: "fechaDespliegue", label: "Fecha de despliegue", icon: "calendar", placeholder: "Ej. 15 de mayo, 9:00 AM" },
      { key: "canal", label: "Canal de anuncio", icon: "megaphone", placeholder: "Ej. Email, blog, redes sociales..." },
    ],
  },
];