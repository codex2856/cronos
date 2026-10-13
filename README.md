# Cronos · Registro de horas con sticker NFC

Pega un sticker NFC en tu mesa de trabajo. Al acercar el teléfono:

- **1er toque del día** → registra la **entrada** (fecha y hora).
- **2º toque** → registra la **salida** y te dice cuántas horas trabajaste.

La app guarda el historial por día, y muestra los totales de hoy, de la semana y del mes. Además puedes exportarlo a Excel (CSV).

Funciona en **iPhone y Android** y no necesita tienda de apps: es una página web que se abre sola al leer el sticker.

## Cómo funciona

El sticker guarda un enlace del tipo `https://TU-USUARIO.github.io/cronos/?tap=1`.
Cuando el teléfono lee el sticker, abre ese enlace, y la app:

1. Si no tienes una jornada abierta, registra la **entrada**.
2. Si ya estás trabajando, registra la **salida**.
3. Si lees el sticker dos veces en menos de 1 minuto, ignora el segundo toque.
4. Si olvidaste registrar la salida (llevas más de 16 h "trabajando"), no la cierra con la hora de hoy. La marca como *sin salida* para que la corrijas en el historial y empieza una jornada nueva.

Los datos se guardan **en tu teléfono**, en el navegador. No se envían a ningún servidor.

## Puesta en marcha

### 1. Publicar la app (gratis, con GitHub Pages)

1. Fusiona esta rama en `main`.
2. En GitHub, ve a **Settings → Pages → Build and deployment → Source** y elige **GitHub Actions**.
3. El workflow `.github/workflows/pages.yml` publicará la app en `https://TU-USUARIO.github.io/cronos/`.

> GitHub Pages en repositorios **privados** requiere un plan de pago. Si tu repo es privado, hazlo público (la app no contiene datos personales: tus horas solo se guardan en tu teléfono) o súbela a Netlify o Cloudflare Pages, que también son gratis.

### 2. Grabar el sticker

Abre la app en el móvil y ve a **⋯ → Configurar sticker NFC**. Ahí verás el enlace exacto que debes grabar.

- **Android (Chrome):** pulsa **Grabar sticker** y acerca el sticker al teléfono.
- **iPhone (o cualquier móvil):** instala la app gratuita **NFC Tools** y ve a *Escribir → Añadir un registro → URL/URI*. Pega el enlace y pulsa *Escribir*.

### 3. Usarla

- **Android:** al acercar el teléfono (desbloqueado) se abre Chrome y la app registra la hora sola.
- **iPhone (XS o más nuevo):** al acercarlo aparece una notificación. Tócala y se abre Safari y registra la hora.

> **iPhone:** no la añadas a la pantalla de inicio. En iPhone, la app de la pantalla de inicio y Safari guardan datos por separado, y el sticker siempre abre Safari. Usa simplemente Safari. Si quieres un acceso directo, guárdala en Favoritos.

## Varias personas, un mismo sticker

Todos pueden usar el mismo sticker. Cada persona lo pasa con **su propio teléfono**, y cada teléfono guarda solo las horas de su dueño.

La primera vez, la app pregunta **"¿Cómo te llamas?"**. Desde entonces saluda a esa persona:

- Al entrar: *"¡Hola, Juan, bienvenido al trabajo! Entrada registrada a las 8:00."*
- Al salir: *"¡Hasta luego, Juan! Salida registrada a las 17:00 · trabajaste 9h 00m."*

Para cambiar el nombre: **⋯ → Cambiar mi nombre**.

## Otras funciones (menú ⋯)

- **Añadir jornada manual:** para los días en que olvidaste el teléfono.
- **Editar o borrar:** toca cualquier registro del historial.
- **Exportar CSV:** exporta el mes seleccionado para abrirlo en Excel o Google Sheets.
- **Copia de seguridad / Restaurar:** guarda un archivo JSON con todos tus datos. Úsalo para no perderlos si cambias de teléfono o borras los datos del navegador.

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html` | Pantalla de la app |
| `app.js` | Lógica: entrada/salida, historial, totales, exportar, grabar NFC |
| `styles.css` | Estilos (modo claro y oscuro) |
| `sw.js` | Permite abrir la app sin conexión |
| `manifest.webmanifest`, `icons/` | Nombre e icono de la app |

## Probarla en tu ordenador

```bash
python3 -m http.server 8000
# abre http://localhost:8000/?tap=1 para simular un toque del sticker
```
