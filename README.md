# Super Muffler Inc. - página web

Página estática de una sola sección, en inglés y español, para GitHub Pages.
El formulario guarda nombre, correo, teléfono y cómo nos conocieron en una hoja de Google (back office) para el seguimiento en el CRM. No envía correos.

## Qué hay en cada carpeta

| Archivo | Para qué sirve |
|---|---|
| `index.html` | La página. Los textos en inglés están aquí. |
| `js/i18n.js` | Los textos en español (misma clave que en `index.html`). |
| `js/config.js` | URL del back office, horario para el aviso "Abierto ahora" y videos de Instagram/TikTok. |
| `apps-script/Code.gs` | Back office: guarda cada contacto en Google Sheets y atiende el panel. |
| `panel/` | Panel privado de contactos (`/panel`), con contraseña. |
| `js/main.js` | Idioma, horario en vivo, galería, formulario y carga del 3D. |
| `js/exhaust3d.js` | Escena 3D ya compilada (no se edita a mano). |
| `src/exhaust3d.src.js` | Código fuente del 3D. |
| `privacy.html` | Política de privacidad en inglés y español. |

## 1. Publicar en GitHub Pages (versión de prueba)

1. Crear el repositorio `supermuffler` en la cuenta `IvanOrtizx` y subir todo el contenido de esta carpeta.
2. Settings > Pages > Source: `Deploy from a branch`, rama `main`, carpeta `/ (root)`.
3. Queda en `https://ivanortizx.github.io/supermuffler/` para que Nuri y el taller la revisen.
   La página actual del taller sigue funcionando mientras tanto.

## 2. Back office del formulario (Google Sheets)

Instalado en la cuenta `nurisolutions.web@gmail.com`: hoja **Super Muffler - Website contacts** y proyecto de Apps Script
**Super Muffler - Website backend** (proyecto independiente con el ID de la hoja en `SHEET_ID`). Pasos para reinstalarlo:

1. En la cuenta de Google que va a manejar los contactos, crear una hoja de cálculo: `Super Muffler - Contactos web`.
2. Extensiones > Apps Script. Borrar lo que haya, pegar `apps-script/Code.gs` y guardar.
3. Elegir la función `setup` y darle Ejecutar. Autorizar los permisos (si sale "Google no verificó esta app": Configuración avanzada > Ir a… > Permitir).
   Se crea la pestaña `Contacts` con los estados New, Added to CRM, Customer, Unsubscribed y Spam.
4. Implementar > Nueva implementación > tipo **Aplicación web**. Ejecutar como: **Yo**. Quién tiene acceso: **Cualquier usuario**.
5. Copiar la URL que termina en `/exec` y pegarla en `js/config.js` en `formEndpoint`. Subir el cambio.
6. Probar con el formulario de la página: la fila aparece arriba en la hoja.
7. Compartir la hoja con Nuri y con el taller. Para pasar los contactos al CRM: Archivo > Descargar > CSV.

8. El panel arranca con la contraseña temporal `12345678` y la primera vez que alguien entra obliga a cambiarla.
   Si se pierde: en el editor de Apps Script, ejecutar `resetPanelPassword` (vuelve a la temporal).

### Panel de contactos (`/panel`)

- Dirección: `supermufflerinc.com/panel` (no tiene enlace desde la página y Google no lo indexa).
- Se entra con la contraseña del paso 8 (la primera vez pide cambiarla). La sesión dura 6 horas. Después de 10 intentos fallidos se bloquea 10 minutos.
- Muestra fecha, nombre, correo, teléfono, cómo nos conocieron e idioma. Tiene buscador, filtros por estado,
  cambio de estado (New, Added to CRM, Customer, Unsubscribed, Spam) y botón **Download CSV** para subir los contactos al CRM.
- Mientras `formEndpoint` esté vacío, el panel funciona en modo demo con datos de ejemplo (contraseña: `demo`).
- Si se olvida la contraseña: ejecutar `resetPanelPassword` en el editor de Apps Script.

No envía correos.

## 3. Conectar el dominio (solo cuando la página esté aprobada)

En GoDaddy (acceso delegado), en los DNS de `supermufflerinc.com`:

- Registros **A** para `@` (borrar solo los A que apuntan a la plataforma actual y dejar estos cuatro):
  `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
- Registro **CNAME** para `www` -> `ivanortizx.github.io`
- **No tocar** los registros MX ni los TXT del correo del taller.

Luego en GitHub: Settings > Pages > Custom domain: `supermufflerinc.com` > Save.
Cuando aparezca el certificado, activar **Enforce HTTPS**. Recomendado: verificar el dominio en
GitHub (Settings de la cuenta > Pages > Add a domain) para que nadie más lo pueda usar.

## 4. Cambios frecuentes

- **Horario:** cambiar en `js/config.js` (aviso "Abierto ahora"), en la tabla de `index.html`,
  en el pie de página (`footer.hoursText` en ambos idiomas) y en el bloque `openingHoursSpecification` del `<head>`.
- **Calificación de Google (4.8, 133 reseñas):** está escrita a mano en `index.html` y `js/i18n.js`. Actualizarla de vez en cuando.
- **Videos:** agregar el ID de cada video en `js/config.js` > `videos` (hay ejemplos comentados).
- **Fotos de la galería:** van en `img/gallery/` en dos tamaños (`nombre-sm.webp` de 560 px y `nombre.webp` de 1080 px).
- **Logos de marcas:** están en `img/brands/`. Para agregar una marca, poner su logo ahí y sumar una línea en la sección `brands` de `index.html`. Los logos amarillos van con `class="is-dark"` (fondo negro).

## 5. Escena 3D

El carro tipo rayos X se carga después del texto, solo si el navegador tiene WebGL 2. Si no, se muestra
`img/exhaust-poster.webp`. Con "reducir movimiento" activado en el teléfono, se muestra quieta.

Para cambiar el 3D, editar `src/exhaust3d.src.js` y volver a compilar:

```bash
npm install three@0.170.0 esbuild
npx esbuild src/exhaust3d.src.js --bundle --format=esm --minify --outfile=js/exhaust3d.js
```
