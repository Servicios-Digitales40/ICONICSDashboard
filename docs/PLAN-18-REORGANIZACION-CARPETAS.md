# PLAN-18 — Reorganización de carpetas

## 0. Por qué

Varias carpetas están planas (`backend/ia/`, `shared/eva/`,
`Demo-EVA/views/`, `Demo-EVA/data/`) y algunos nombres de vista llevan el
sufijo "Eva" heredado de cuando sólo existía una instalación — hoy hay dos
(tanque, vibraciones) y el nombre no distingue cuál es cuál. Ninguna de estas
carpetas está mal por diseño; simplemente crecieron sin subdividir. Este plan
mueve archivos y renombra, **sin tocar lógica**.

Las convenciones que este plan aplica ya quedaron fijadas en
[`CLAUDE.md`](../CLAUDE.md) §4.4 (nomenclatura por máquina) y §4.2 (patrón
puerta) — este documento es su ejecución, no una decisión nueva.

## 1. Alcance y orden

Cuatro fases, cada una commiteada por separado y verificada antes de pasar a
la siguiente (CLAUDE.md §6). Orden por radio de impacto, de menor a mayor:

| Fase | Qué mueve | Consumidores a actualizar |
|---|---|---|
| F0 | `CLAUDE.md` | Ninguno — **hecho** |
| F1 | `backend/ia/` → `indices/`, `motor/`, `conversacion/` | Imports internos de `backend/ia/`, `backend/app.mjs`, `backend/routes/*`, tests de `backend/test/` y `scripts/verificar-*.mjs` |
| F2 | `Demo-EVA/views/*.jsx` → `tanque/`, `vibraciones/`, `comunes/` + renombrado sin sufijo "Eva" | `app/routes/routes.jsx`, tests en `src/test/demo-eva/`, `src/test/live/` |
| F3 | `Demo-EVA/data/*.js` → mismo criterio por máquina | Vistas movidas en F2, `components/`, `three-d/`, `lib/` internos de Demo-EVA |
| F4 | `shared/eva/` → `tanque/`, `vibraciones/`, `comun/` | **Todo lo anterior** + cualquier import directo desde `backend/ia/` y `Demo-EVA/domain/` (puertas) |
| F5 | `react-dashboard/src/lib/` → agrupar clientes HTTP en `lib/api/` | `Demo-EVA/data/`, `features/asistente/`, vistas que llaman a la API directamente |

F4 va después de F2/F3 a propósito: renombrar las vistas primero deja ver, al
tocar sus imports, cuáles de verdad tocan `shared/eva/` directamente (la
mayoría debería pasar por la puerta de `domain/`, no importar `shared/` a
pelo) — es una buena oportunidad para detectar imports que se saltaron la
capa (CLAUDE.md §4.3) antes de mover el archivo más grande del repo.

## 2. F0 — CLAUDE.md (hecho)

`CLAUDE.md` en la raíz: no negociables de arquitectura, mapa de estructura,
convenciones (cabeceras, patrón puerta, capas, nomenclatura, alias),
checklist de pruebas y flujo de trabajo. Sirve de contrato contra el que se
valida cada fase siguiente — si una fase de este plan contradice algo ahí, se
corrige el plan.

## 3. F1 — `backend/ia/`

```
backend/ia/
├── indices/
│   ├── bm25.mjs
│   ├── documentos.mjs
│   ├── embeddings.mjs
│   └── manuales.mjs
├── motor/
│   ├── diagnostico.mjs
│   ├── temporal.mjs
│   └── casos.mjs
├── conversacion/
│   ├── chat.mjs
│   ├── cola.mjs
│   ├── definiciones.mjs
│   └── herramientas.mjs
├── reporte.mjs
├── voz.mjs
└── herramientas/        (sin cambios)
```

**Verificación:** `cd backend && npm test`, más
`node scripts/verificar-backend.mjs`, `verificar-herramientas.mjs`,
`verificar-chat.mjs`, `verificar-diagnostico.mjs`, `verificar-documentos.mjs`,
`verificar-casos.mjs`, `verificar-casos-cierre.mjs`, `verificar-temporal.mjs`,
`verificar-calibracion.mjs`, `verificar-voz.mjs`, `verificar-manos-libres.mjs`
— es la carpeta que más scripts toca, así que se corre la lista casi
completa.

## 4. F2 — `Demo-EVA/views/`

```
Demo-EVA/views/
├── tanque/
│   ├── InicioTanque.jsx        (antes InicioEva.jsx)
│   ├── PlantaTanque.jsx        (antes PlantaEva.jsx)
│   ├── RiesgosTanque.jsx       (antes RiesgosEva.jsx)
│   ├── ControlesTanque.jsx     (antes ControlesEva.jsx)
│   ├── MaquetaTanque3D.jsx     (antes MaquetaEva3D.jsx)
│   └── DetalleActivo.jsx       (sin cambio de nombre — ya es exclusivo del tanque)
├── vibraciones/
│   ├── InicioVibraciones.jsx    (sin cambio)
│   ├── RiesgosVibracion.jsx     (antes RiesgosVibracionEva.jsx)
│   ├── Vibraciones.jsx           (antes VibracionesEva.jsx — vista "Gráficas")
│   ├── Vibraciones3D.jsx          (antes VibracionesEva3D.jsx)
│   └── ControlesVibraciones.jsx   (sin cambio)
└── comunes/
    ├── AssetsEva.jsx        (se mueve, sin renombrar — explorador genérico anclado a la raíz de TODA la demo, confirmado en su cabecera)
    ├── AlarmasEva.jsx
    ├── CierreDiagnostico.jsx
    ├── DocumentacionRag.jsx
    └── PrediccionBeta.jsx
```

**Por qué `comunes/` conserva "Eva":** ahí "Eva" no distingue máquina —ya
sabemos que es transversal—, así que quitarlo no gana precisión, sólo cambia
el nombre por cambiarlo. Se deja así salvo que se pida lo contrario.

**Tocar además:** `app/routes/routes.jsx` (las 16 rutas lazy-loaded), y los
9 tests que importan vistas directamente (`accesibilidad`, `controles`,
`detalle-exportar`, `inicio-simulada`, `planta-simulada`,
`riesgos-mismo-layout`, `riesgos-pronostico-diferido`,
`vibraciones-simulada`, `tres-d`, `eva.live`).

**Verificación:** `cd react-dashboard && npm test && npm run build`, y
arranque manual (`npm run dev`) para confirmar que las 16 rutas navegan.

## 5. F3 — `Demo-EVA/data/`

```
Demo-EVA/data/
├── tanque/       historia.js, simulador.js, detalleActivo.js
├── vibraciones/  simuladorVibracion.js, vibracion.js
└── comunes/      EvaProvider.jsx, alarmas.js, estadoDelDato.js, evaSource.js, hooks.js, transportes.js
```

Sin renombrado — estos nombres ya son descriptivos y no llevan el sufijo
problemático. Sólo se agrupan.

**Verificación:** igual que F2 — es la carpeta que más consumen las vistas
recién movidas, así que confirma también que F2 quedó bien enlazado.

## 6. F4 — `shared/eva/` (la de mayor riesgo)

```
shared/eva/
├── tanque/       activos.js, estado.js, riesgos.js, senales.js, sistema.js, estadoTanque.js, simulador.js
├── vibraciones/  vibraciones.js, riesgosVibracion.js, sistemaVibraciones.js, simuladorVibraciones.js, estadoVibraciones.js
└── comun/        aprendizaje.js, casos.js, causas.js, estadistica.js, estadoMaquina.js, graficos.js,
                   historia.js, manuales.js, pronostico.js, rango.js, sistemas.js, umbrales.js
```

Se importa vía `@shared/eva/...` desde backend (Node) y frontend (Vite) a la
vez — cualquier archivo movido rompe los dos lados si no se actualizan ambos
en el mismo commit. Antes de mover, correr un inventario de imports
(`grep -rn "@shared/eva/" backend react-dashboard/src`) y confirmar que la
lista de consumidores coincide con lo esperado tras F1-F3.

**Verificación:** la batería completa — `backend/test`, `react-dashboard`
test + build, y **todos** los `scripts/verificar-*.mjs` (no sólo un
subconjunto), porque es dominio compartido y un import roto aquí puede fallar
en un verificador que a simple vista no parece tocar esta carpeta.

## 7. F5 — `react-dashboard/src/lib/`

```
lib/
├── api/   apiBase.js, casosApi.js, predictionApi.js, ragApi.js
└── (sin mover: format.js, motion.js, queryClient.js, viewport.js — utilidades, no clientes HTTP)
```

Menor riesgo — pocos consumidores, sin contraparte en backend. Va al final
porque no bloquea nada de lo anterior y no es urgente.

**Verificación:** `cd react-dashboard && npm test`.

## 8. Qué NO cambia en este plan

- Ningún archivo de `backend/routes/` ni `components/ui/` se mueve — ya están
  planos por convención (CLAUDE.md, sección de estructura) y subcarpetarlos
  no añadiría información.
- Ninguna lógica de negocio, cálculo, endpoint o firma de función cambia.
  Esto es exclusivamente mover + renombrar + actualizar imports.
- `scripts/plc_opcua.py` no se toca en este plan (es un hallazgo de la
  auditoría PLAN-17, no de éste).

## 9. Estado

- [x] F0 — CLAUDE.md creado
- [x] F1 — `backend/ia/` — 153 pruebas de backend + 11 verificadores (360
      comprobaciones) en verde. Además de los imports, se actualizaron las
      referencias de ruta en comentarios de `backend/`, `shared/`, `scripts/`
      y `react-dashboard/src/` (CLAUDE.md §4.1), el árbol de `backend/README.md`
      —que ya estaba desactualizado antes de esta fase: le faltaban seis
      archivos y la familia `diagnostico/`— y §2.3 y §3 de `CLAUDE.md`.
      Los `docs/PLAN-11/12/15` se dejaron intactos a propósito: son registro
      fechado, no guía de navegación.
- [x] F2 — `Demo-EVA/views/` — 16 vistas a `tanque/` (6), `vibraciones/` (5) y
      `comunes/` (5), con 8 renombrados de archivo Y de identificador de
      componente: un archivo `RiesgosTanque.jsx` que exportara `RiesgosEva`
      habría sido peor que no renombrar. 511 pruebas de frontend, `vite build`
      y las 16 rutas `lazy` comprobadas una a una contra el disco (un `lazy`
      mal escrito no lo detectan las pruebas, sólo falla al navegar).
      Las ediciones se hicieron con Node y no con `sed -i`: casi todo el
      frontend está en CRLF y `sed` sobre Git Bash lo normaliza a LF, que es
      lo que ensució `client.mjs` en F1.
- [x] F3 — `Demo-EVA/data/` — 11 archivos a tanque/ (3), vibraciones/ (2) y
      comunes/ (6), sin renombrar. Lo delicado no eran los consumidores sino
      los imports ENTRE ellos: seis archivos se importaban por `./hermano`, y
      la mitad de esos hermanos cayó en otra subcarpeta. 511 pruebas y build.
- [x] F4 — `shared/eva/` — 24 archivos a tanque/ (7), vibraciones/ (5) y
      comun/ (12). Bateria completa en verde: 153 backend + 511 frontend +
      build + los 18 verificadores (el unico rojo, `antiguedad-historico`, es
      una sonda contra el servidor real de planta, inalcanzable desde aqui).
      Actualizado tambien el mapa de `shared/README.md`, cuya tabla usa la
      forma corta `eva/X.js` y no la cazaba la reescritura de rutas.
      **Observacion:** `umbrales.js`, `historia.js` y `pronostico.js` van a
      `comun/` por el plan, pero el README los describe como del tanque
      («*sus* 5 mecanismos de desgaste»). Tienen consumidores de las dos
      maquinas, asi que `comun/` se sostiene, pero la prosa habria que
      revisarla.
- [x] F5 — `react-dashboard/src/lib/` — los 4 clientes HTTP a `lib/api/`.
      Trivial: los unicos imports internos (`./apiBase.js` desde casosApi y
      ragApi) apuntan a un archivo que va a la misma carpeta. 6+/6- en 9
      archivos, 511 pruebas y build.
