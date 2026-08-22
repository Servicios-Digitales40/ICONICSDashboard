Plan 14 · Modelo en máquina propia, diagnóstico y reportes

Objetivo. Separar el modelo de IA en su propia máquina con la red cerrada, y sobre esa base subir el acierto del asistente hasta que pueda diagnosticar contra el manual y entregar reportes en PDF.

ESTADO (21-ago-2026) — PLANIFICADO. Ninguna fase empezada. Pendiente confirmar la GPU (§0.1), si hay alarmas configuradas (§6) y si se puede exportar historia real del servidor (§7.3).

0 · Las cuatro cosas que gobiernan el plan
0.1 · La VRAM, no la GPU compartida

El candidato mencionado es una 3070 Ti: 8 GB, el mismo techo que hoy castiga al sistema. Los 30-90 s por respuesta y las fugas del 4B no vienen de que la GPU esté compartida con el backend — vienen de que el modelo no cabe.

Con 8 GB dedicados siguen sin caber los tres consumidores nuevos que este plan introduce:

Consumidor VRAM aprox.
Modelo 8-9B Q4_K_M 5,0-5,5 GB
KV cache, 4 usuarios × 8k contexto 1,5-3 GB
Servidor de embeddings (si se activa) 0,5-1 GB
Whisper medium (si se activa el dictado) ~1,5 GB

Y --ctx-size se reparte entre slots, no se multiplica, así que los 2-4 usuarios simultáneos que se piden son justo lo que más memoria consume.

Mínimo recomendado: 16 GB (5060 Ti nueva, o 3090 24 GB de segunda mano). Con 16 GB entra un 14B con contexto holgado; con 24 GB entra además el servidor de embeddings, que hará falta cuando la carpeta de manuales crezca.

Si se queda en 8 GB, la fase 2 pierde casi todo su valor y hay que aceptar que el asistente responde como hoy, sólo que sin robarle recursos al backend. Las fases 4 y 5 se construyen igual, pero aciertan menos.

0.2 · llama-server no tiene autenticación

El invariante escrito hoy en tres sitios es --host 127.0.0.1. La fase 1 lo rompe por definición, y hay que reponer la garantía con otra cosa (§1.2, §1.3).

0.3 · Los umbrales están sin confirmar

shared/eva/umbrales.js tiene PROVISIONALES = true, y los valores medidos contra el servidor real no se parecen a la instalación. Mientras siga así, «fuera de límite» no informa de nada, y eso limita por igual el diagnóstico y los reportes. Es la fase 0 y es trabajo de planta, no de código.

0.4 · Sólo 4 de las 8 señales tienen historia

A tres el historiador les devuelve la serie de otra sin dar error. Un reporte «de cada variable» no puede existir con las ocho, y el reporte tiene que decirlo (§5).

1 · Fase 1 · Máquina de IA y red

1.1 — Separar el proceso. IA_BASE pasa a la IP de la máquina nueva; llama-server arranca con --host 0.0.0.0. Más una guarda nueva en config.mjs: si IA_BASE no es loopback, el arranque avisa por log de que la protección ya no es el sistema operativo sino el firewall. Misma regla de la casa que ICONICS_READ_ONLY.

1.2 — Cerrar el puerto. Reglas de entrada en la máquina de IA para 8080 (y 8081/8082 si se usan), con RemoteAddress = IP del backend y denegación por defecto. Se entrega como script PowerShell, hermano de exponer-en-red.ps1.

1.3 — Autenticar y cifrar. Regla de seguridad de conexión IPsec entre las dos máquinas. Misma subred, así que es directo. Kerberos si hay dominio, certificado de máquina si no. Nativo de Windows, cero dependencias.

1.4 — Multiusuario. Con 16 GB: --parallel 2 y --ctx-size dimensionado para dos slots. La cola no se quita: cuatro peticiones en dos slots siguen necesitando que alguien espere ordenadamente, y ese código ya funciona y ya pinta el puesto en la fila.

Entregable. Las tres máquinas separadas, el puerto del modelo inalcanzable desde cualquier equipo que no sea el backend (verificado desde un tercero), y verificar-chat.mjs en verde contra el modelo remoto.

3-5 jornadas, tras la llegada del hardware. No toca ICONICS.

Dos consecuencias que ya están decididas

Los manuales se quedan con el backend. No los lee el modelo: los lee el backend con node:fs (ia/documentos.mjs). Ponerlos en la máquina de IA obligaría a un recurso compartido SMB sin ganar nada.

Embeddings y Whisper van a la máquina de IA cuando se activen. Quieren la misma GPU, y se protegen con las mismas reglas de firewall.

2 · Fase 2 · Modelo y ajuste

Subir a un 14B clase Qwen3, recalibrar IA_MAX_PASOS (a 4), IA_MAX_TOKENS y --ctx-size, y medir contra los verificadores antes de comprometer.

Es la fase que hace que las 4 y 5 acierten. Construirlas antes es hacer envase para un modelo que sigue fallando en la extracción de parámetros.

2-3 jornadas. Necesita GPU, no servidor.

3 · Fase 3 · Formato de la respuesta

Revertir la decisión del texto plano:

Renderizador de markdown en la burbuja (marked + DOMPurify — el saneado no es opcional: el texto viene de un modelo y acaba en innerHTML).
Retirar limpiarMarkdown() de chat.mjs.
Reescribir la regla 12 del prompt, que hoy prohíbe el markdown, para que ahora pida estructura.
Sanear vozSalida.js, que da por hecho texto llano y leería los asteriscos.
Actualizar asistente.test.jsx y las comprobaciones de markdown de verificar-chat.mjs, que hoy afirman lo contrario.

2-3 jornadas. No necesita ICONICS ni GPU. Se puede empezar hoy.

4 · Fase 4 · Diagnóstico

Dos herramientas nuevas en ia/herramientas.mjs:

limites_del_manual({ senal }) — busca en el índice ya existente patrones de especificación (número + unidad + palabra de límite: «máximo», «no debe exceder», «rango admisible») y devuelve candidatos citables con archivo y página. Convierte el escenario del pico de 200 V contra un máximo de 150 V documentado en una lectura estructurada en vez de una tarea de razonamiento que un modelo pequeño falla.

diagnostico({ sintoma }) — herramienta compuesta que en una llamada hace estado + perfil + correlación de las señales con historia + límites del manual (+ alarmas, cuando exista la fase 6), y devuelve el dossier ya ordenado, con lo medido separado de la hipótesis y el exceso sobre límite ya calculado y fechado. El modelo sólo narra.

Es el criterio que ya gobierna el archivo: el modelo elige QUÉ, el backend sabe CÓMO. Y reduce la dependencia del razonamiento del modelo, que es donde está el fallo real.

Entregable. Los dos escenarios pedidos —caudal abundante por sobretensión progresiva, y parada tras pico de 200 V contra el manual— contestados correctamente y de forma repetible, con la procedencia visible bajo la respuesta.

5-7 jornadas.

5 · Fase 5 · Reportes PDF

Con dependencias aceptadas:

pdfkit para el documento (flujo de texto, tablas, saltos de página, fuentes con acentos).
svg-to-pdfkit para incrustar los gráficos. Esto es lo importante: reutiliza renderizarGraficoSerie() sin tocarla. La geometría ya está resuelta y probada.

Piezas:

Herramienta generar_reporte({ senales, periodo, secciones }). El modelo decide QUÉ entra; el backend compone con datos reales del historiador. Ninguna cifra del PDF la escribe el modelo — mismo criterio que grafico_de_senal.
Ruta GET /api/reportes/:id con Content-Disposition: attachment, carpeta de salida y purga por antigüedad (los reportes se guardan).
Adjunto de tipo reporte en el flujo SSE, con enlace y no con el archivo dentro. El canal \_adjunto ya existe y ya excluye la carga útil del contexto del modelo.
Agregación obligatoria: el historiador corta a 100 muestras por llamada sin agregar. Un reporte de 8 días va con aggregate e interval.

⚠️ Las dependencias de PDF se cargan con await import() DENTRO de la herramienta, nunca en la cabecera del módulo. El proyecto ya se quemó con esto: chartjs-node-canvas arrastraba node-canvas, fallaba el import y caía el backend entero. Con carga diferida, un módulo roto desactiva los reportes y deja el tablero y el resto del asistente en pie.

Alcance honesto. Serán 4 gráficos —los de las señales historizadas— más una tabla de valores actuales para las otras 4, y el reporte lo dirá. No inventar las cuatro que faltan es parte del entregable.

6-8 jornadas.

6 · Fase 6 · Alarmas · PENDIENTE DE DEFINICIÓN

Parada hasta confirmar si ICONICS tiene alarmas configuradas para ac:TDCON/DEMO/SENSORES/. El backend ya expone GET /api/iconics/alarms; falta la herramienta alarmas_del_periodo que lo asome al asistente y la sección de fallas del reporte.

Disparador para arrancarla: alguien confirma qué eventos están configurados en el servidor y qué cuenta como «falla reportada».

Requisito de diseño, ya fijado. Si no hay alarmas configuradas, la herramienta dice «este servidor no tiene alarmas configuradas», nunca devuelve una lista vacía. Una lista vacía se lee como «no hubo fallas», que es una afirmación falsa con apariencia de dato — el mismo modo de fallo que las tres señales que devuelven la serie de otra.

2-3 jornadas una vez definidas.

7 · Trabajar sin servidor ICONICS
7.1 · Lo que falta: un transporte falso en el backend

El simulador vive sólo en el frontend (Demo-EVA/data/simulador.js). Sin ICONICS_API_BASE alcanzable, las nueve herramientas devuelven error y no hay forma de ejercitar el bucle con datos.

El material ya está escrito, disperso: clienteFalso() en verificar-herramientas.mjs (interno a la prueba, no levanta servidor) y valorEn() del simulador del frontend (puro, determinista, con ciclo de bombeo, deriva de jornada y eventos cada siete ciclos).

Promoverlo a un transporte falso del backend, con ICONICS_FAKE=true y la misma firma que iconics/client.mjs. Su sitio es shared/eva/, por el mismo criterio que ya movió senales.js e historia.js allí.

Tiene que reproducir los fallos, no sólo los datos buenos: las tres señales que devuelven la serie de otra, el tope de 100 muestras, la calidad mala y los huecos. El README del frontend ya lo explica — «es adversarial a propósito: si sólo devolviera datos buenos, la UI se escribiría dando por hecho que todo llega siempre». Vale igual para el asistente.

2-3 jornadas. Desbloquea las fases 2, 4 y 5 mientras llega el hardware.

7.2 · Qué se cubre
Fase Sin ICONICS
0 · Umbrales El código sí, los números no
1 · Máquina de IA y red Completa — no toca ICONICS
2 · Modelo Completa (necesita GPU, no servidor)
3 · Formato Completa, y sin el transporte falso
4 · Diagnóstico El código sí; la calidad del diagnóstico no
5 · Reportes PDF ~90 %
6 · Alarmas No

El índice de documentación es 100 % offline: documentos.mjs sólo lee de disco. Extracción de PDF, troceado, filtro del índice de contenidos, BM25 y la limites_del_manual de la fase 4 se afinan sin servidor. Conviene empezar a juntar manuales ya, porque ahí se decidirá si hace falta el servidor de embeddings.

7.3 · Lo que NO tiene sustituto
Que los umbrales sean correctos (necesita historia real — así se descubrió que el caudal declarado hasta 45 tiene un máximo real de 4,4).
El comportamiento real del historiador: las tres señales cruzadas, el corte a 100 muestras, Average sobre rangos largos. El transporte falso los imita porque están documentados; imitarlos no los verifica.
OIDC + PKCE, refresco de token, certificados.
Las alarmas. Ni siquiera se puede saber si existen.
La calidad del diagnóstico sobre un fallo real.

Si se puede exportar 1-2 semanas de historia real de las cuatro señales historizadas, el transporte falso puede reproducir datos reales en vez de sintéticos — y entonces sí sirve para afinar umbrales y validar el diagnóstico. Merece la pena preguntarlo antes de escribirlo.

8 · Orden y cronograma

# Fase Jornadas Depende de

3 Formato markdown 2-3 nada — empezar ya
7.1 Transporte falso del backend 2-3 nada
4a Índice de docs y limites_del_manual (dentro de 4) juntar los PDF
0 Umbrales 2-3 planta + historia real
1 Máquina de IA y red 3-5 hardware
2 Modelo 2-3 fase 1
4 Diagnóstico 5-7 fases 0 y 2
5 Reportes 6-8 fase 4
6 Alarmas 2-3 definición pendiente
— Verificadores y documentación ~4 transversal

26-36 jornadas en total. Las tres primeras filas convierten la espera del hardware en tiempo productivo.

9 · Tecnologías y adiciones

Dependencias nuevas

Backend: pdfkit, svg-to-pdfkit — carga diferida, ver §5.
Frontend: marked, DOMPurify.

Sin dependencias

IPsec y firewall de Windows.
limites_del_manual (extiende el índice BM25 existente).
diagnostico (compone las herramientas que ya hay).
Transporte falso del backend.

Código nuevo

backend/ia/reporte.mjs
Tres herramientas en backend/ia/herramientas.mjs
Una ruta en backend/routes/
shared/eva/simulador.js (§7.1)
Renderizador de markdown en features/asistente/
Dos scripts PowerShell en scripts/

Código que se reescribe

limpiarMarkdown() se retira de chat.mjs
La regla 12 del prompt se invierte
config.mjs gana la guarda de IA_BASE remota
verificar-chat.mjs: las comprobaciones de markdown afirman hoy lo contrario
10 · Lo que este plan NO hace

No generaliza a otras instalaciones. Hay intención de extender el sistema más allá del de agua, pero construir para eso ahora sería especulativo. Única concesión: generar_reporte recibe el catálogo de señales como parámetro en vez de importar el de EVA directamente. Es una línea de diferencia hoy y evita reescribir la fase 5 entera cuando llegue el segundo sistema.

No toca el tablero. Ninguna de las nueve fases cambia las cuatro vistas de Demo EVA, salvo el panel del asistente en la fase 3.

No quita la cola del asistente. Ver §1.4.
