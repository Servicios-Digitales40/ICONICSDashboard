# `_deprecated/` — código archivado

Todo lo que hay aquí **está fuera del grafo de imports de la aplicación**: ningún archivo de `src/` importa nada de esta carpeta. Vite no compila un módulo que ningún *entry point* alcanza, así que este código **no llega al bundle** y ni siquiera un import roto aquí dentro puede romper la app.

Esa propiedad es lo que hace segura la cuarentena, y descansa en un único invariante:

> **Nada fuera de `_deprecated/` puede importar de `_deprecated/`.**
> La dirección contraria (archivo → vivo) sí está permitida.

Comprobable en cualquier momento:

```bash
grep -rn "_deprecated" src --include=*.js --include=*.jsx | grep -v "^src/_deprecated"
# debe devolver vacío
```

El guion bajo del nombre es deliberado: ordena la carpeta arriba del árbol, no puede colisionar con un nombre de feature, y la distingue a simple vista de `src/prototypes/`, que **sí** es código vivo y navegable.

---

## Por qué se archivó esto

Las seis páginas venían de la plantilla original `aurora-dashboard` y **llevaban tiempo comentadas en `NAV`** (`src/nav/navConfig.jsx`), es decir, eran inalcanzables desde el sidebar. Pero seguían registradas en el mapa `PAGES` de `App.jsx`, así que se compilaban y se empaquetaban, y —esto es lo importante— **mantenían vivas 21 dependencias exclusivas** que de otro modo eran código muerto: `mockData.js`, `generators.js`, `DataContext`, los 10 loaders y 11 primitivas del kit de UI.

Desconectarlas del router redujo el bundle de **854,58 kB a 768,63 kB (−10 %)**.

---

## Inventario

| Archivo | Ruta original | Qué lo bloqueaba |
|---|---|---|
| `pages/Dashboard.jsx` | `src/pages/Dashboard.jsx` | — |
| `pages/Analytics.jsx` | `src/pages/Analytics.jsx` | — |
| `pages/Users.jsx` | `src/pages/Users.jsx` | — |
| `pages/Tables.jsx` | `src/pages/Tables.jsx` | — |
| `pages/Components.jsx` | `src/pages/Components.jsx` | — |
| `pages/Settings.jsx` | `src/pages/Settings.jsx` | — |
| `providers/DataProvider.jsx` | `src/context/DataContext.jsx` | Dashboard · Analytics · Components |
| `data/mockData.js` | `src/data/mockData.js` | Dashboard · Tables · Users |
| `data/generators.js` | `src/data/generators.js` | `DataProvider` |
| `components/ui/GaugeKPI.jsx` | `src/components/ui/GaugeKPI.jsx` | Dashboard |
| `components/ui/Roadmap.jsx` | `src/components/ui/Roadmap.jsx` | Dashboard |
| `components/ui/TrendPill.jsx` | `src/components/ui/TrendPill.jsx` | Dashboard |
| `components/ui/Sparkline.jsx` | `src/components/ui/Sparkline.jsx` | Dashboard |
| `components/ui/CountUp.jsx` | `src/components/ui/CountUp.jsx` | Dashboard · `GaugeKPI` |
| `components/ui/TreeNode.jsx` | `src/components/ui/TreeNode.jsx` | Tables |
| `components/ui/Badge.jsx` | `src/components/ui/Badge.jsx` | Tables · Users |
| `components/ui/Toggle.jsx` | `src/components/ui/Toggle.jsx` | Components · Settings |
| `components/ui/Checkbox.jsx` | `src/components/ui/Checkbox.jsx` | Components |
| `components/ui/RadioOption.jsx` | `src/components/ui/RadioOption.jsx` | Components |
| `components/ui/DateField.jsx` | `src/components/ui/DateField.jsx` | **nadie** — ya estaba muerto, duplicado abandonado de `DatePicker` |
| `components/ui/loaders/` (10 + barrel) | `src/components/ui/loaders/` | Components (`SkeletonRow.jsx`: **nadie**) |

### Marcados en su sitio, no movidos

Dos exports muertos viven dentro de archivos **vivos**; extraerlos obligaría a editar código en producción, así que solo llevan el tag `@deprecated`:

- `src/theme/themes.js` → `chartPalette` (único consumidor: el `Dashboard` archivado)
- `src/components/ui/GaugeCard.jsx` → `AreaDemo` (export sin ningún consumidor)

---

## Cómo restaurar una página

1. Mover el archivo de vuelta a su ruta original (columna «Ruta original»), junto con las dependencias que aparezcan en «Qué lo bloqueaba».
2. Revertir sus imports: dentro del archivo apuntan a hermanos del archivo (`../data/mockData.js`, `../providers/DataProvider.jsx`, `../components/ui/index.js`); al restaurar deben volver a `@/data/mockData.js`, `@/context/DataContext.jsx`, `@/components/ui/index.js`.
3. Devolver las primitivas restauradas al barrel vivo `src/components/ui/index.js` y quitarlas de `_deprecated/components/ui/index.js`.
4. Registrar la ruta en `src/app/routes/routes.jsx` (registro único: id + componente + título + entrada de `nav`).
5. Si restauras `Dashboard`, `Analytics` o `Components`, hay que **volver a montar `<DataProvider>`** en `src/app/App.jsx`, por dentro de `<ToastProvider>` — el provider llama a `useToast()`.
6. Borrar la cabecera `@deprecated` del archivo.

### Líneas de `NAV` originales

Estas son las seis entradas tal y como estaban comentadas en `src/nav/navConfig.jsx` antes de archivarlas. Iban **al principio** del array `NAV`, en este orden, por delante de `data`:

```jsx
{ id: "dashboard",  label: "Dashboard",     icon: <LayoutDashboard size={17} /> },
{ id: "analytics",  label: "Analíticas",    icon: <BarChart3 size={17} /> },
{ id: "users",      label: "Usuarios",      icon: <Users size={17} /> },
{ id: "tables",     label: "Tablas",        icon: <Table2 size={17} /> },
{ id: "components", label: "Componentes",   icon: <Blocks size={17} /> },
```

Y `settings`, que iba **después** de `sankey`:

```jsx
{ id: "settings",   label: "Configuración", icon: <Settings size={17} /> },
```

Los iconos venían de `lucide-react`: `LayoutDashboard`, `BarChart3`, `Users`, `Table2`, `Blocks`, `Settings` — hoy retirados del import de `navConfig.jsx`.

### Entradas de `PAGE_META` originales

```jsx
dashboard:  { title: "Dashboard",     sub: "Resumen general del negocio en tiempo real" },
analytics:  { title: "Analíticas",    sub: "Tendencias, comparativas y rendimiento" },
users:      { title: "Usuarios",      sub: "Gestiona miembros, roles y accesos" },
tables:     { title: "Tablas",        sub: "Facturación y registros del sistema" },
components: { title: "Componentes",   sub: "Kit de UI: botones, inputs, loaders y feedback" },
settings:   { title: "Configuración", sub: "Preferencias de cuenta y notificaciones" },
```

---

## Cómo borrar esto definitivamente

Borrar la carpeta entera. No hay nada más que hacer: no tiene aristas entrantes. Antes conviene comprobar que sigue siendo así con el `grep` del invariante de arriba.

**Fecha de revisión sugerida: 2026-Q4.**
