# franela Finanzas

Dashboard web de finanzas personales creado con React, TypeScript, Vite, Recharts y CSS.

## Requisitos

- Node.js 20.19+ o 22.12+ 
- npm

## Desarrollo local

```bash
npm install
npm run dev
```

Abre la dirección local que indique Vite (habitualmente http://localhost:5173).

## Acceso privado a Google Sheets

El acceso se realiza mediante una Web App de Google Apps Script vinculada a la spreadsheet. No se requiere crear un proyecto manualmente en Google Cloud, un OAuth Client ID ni una clave de servicio. El script detecta pestañas con el patrón `GASTOS YYYY` (por ejemplo `GASTOS 2025` y `GASTOS 2026`) y lee la seleccionada con la identidad del usuario; no modifica la hoja.

1. Asegúrate de que cada pestaña anual se llame exactamente `GASTOS 2025`, `GASTOS 2026`, etc. (el nombre no distingue mayúsculas/minúsculas).
2. Abre la spreadsheet y selecciona **Extensiones → Apps Script**.
3. Copia `apps-script/Code.gs` en el editor. Crea también un archivo HTML llamado `Bridge` y pega `apps-script/Bridge.html`.
4. En `Code.gs`, añade los emails exactos que podrán ver los datos a `ALLOWED_EMAILS`. La lista está vacía por defecto y, por seguridad, no autoriza a nadie hasta que la rellenes:

```js
const ALLOWED_EMAILS = ['tu-cuenta@tu-dominio.com'];
```

Para permitir dos cuentas, incluye ambas direcciones en el array. Se comparan sin distinguir mayúsculas. La comprobación se ejecuta en el servidor en cada lectura; no basta con ocultar la interfaz.
5. Sustituye `https://REEMPLAZAR-POR-TU-DOMINIO.vercel.app` por el origen HTTPS exacto de tu dashboard cuando esté publicado. El script permite automáticamente los puertos locales Vite `5170`–`5179`.
6. Pulsa **Implementar → Nueva implementación → Aplicación web**. Selecciona **Ejecutar como: usuario que accede a la aplicación web**. En acceso, elige **solo tu organización Workspace**; nunca acceso anónimo ni “cualquier usuario”. `ALLOWED_EMAILS` aplica además la lista exacta de cuentas permitidas.
7. Implementa y autoriza el script para leer la spreadsheet. Cada usuario deberá iniciar sesión con su propia cuenta y conceder el permiso. Copia la URL terminada en `/exec`.
8. Copia `.env.example` como `.env.local`, pega la URL de despliegue y reinicia Vite:

```env
VITE_GOOGLE_APPS_SCRIPT_URL=https://script.google.com/macros/s/ID_DEL_DESPLIEGUE/exec
```

Al entrar en el dashboard, pulsa **Autorizar con Google Workspace** y completa el consentimiento de Apps Script en la pestaña nueva. La lectura de datos usa JSONP en el dashboard, sin ventanas emergentes. Los datos permanecen solo en memoria mientras esté abierta la sesión.

Si el administrador de Workspace bloquea las implementaciones de Apps Script para usuarios del dominio, tendrá que habilitarlas. Tras cambiar `ALLOWED_EMAILS` o copiar los archivos actuales `Code.gs` y `Bridge.html`, crea una nueva versión en **Implementar → Gestionar implementaciones → Editar → Nueva versión**. El dashboard necesita que `/exec` sirva el `Code.gs` con respuesta JSONP que incluya `sheetName`; rechazará la respuesta si no confirma exactamente `GASTOS YYYY`, en vez de mostrar otra pestaña por error.

## Compilación

```bash
npm run build
npm run preview
```

## Funcionalidades

- Acceso requerido con Google y permiso de solo lectura para Sheets.
- Resumen mensual con indicadores, evolución del año y distribución de gastos.
- Resumen anual separado con ingresos, inversión, ahorro, gasto y porcentaje de cada uno sobre los ingresos.
- Gráficos de evolución anual y distribución mensual/anual por categoría.
- Pestaña de ahorros conectada a la hoja `AHORROS`, con saldos de Elena, Fran y conjunto, y detalle de cuentas/activos.
- Selección de año y mes, consulta del detalle y búsqueda de conceptos.
- Los datos se mantienen solo en memoria y no se persisten en `localStorage`.
- Diseño adaptable a móvil y escritorio.

## Publicar en GitHub

Crea un repositorio vacío llamado `franela-finanzas` en tu cuenta de GitHub y ejecuta desde esta carpeta:

```bash
git init
git add .
git commit -m "Primera versión de franela Finanzas"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/franela-finanzas.git
git push -u origin main
```

Sustituye `TU_USUARIO` por tu usuario real y autentícate con GitHub cuando corresponda.

## Desplegar gratis en Vercel

1. Entra en https://vercel.com/new e inicia sesión con GitHub.
2. Importa el repositorio `franela-finanzas`.
3. Framework: **Vite**. Build command: `npm run build`. Output directory: `dist`.
4. Pulsa **Deploy**. Vercel proporcionará una URL pública HTTPS.
5. Los siguientes `git push` a la rama principal desencadenarán nuevos despliegues si la integración está activa.

El plan Hobby gratuito de Vercel está orientado a uso personal no comercial; revisa las condiciones y cuotas vigentes.

## Privacidad y limitaciones

El inicio de sesión autoriza la lectura de una spreadsheet fija. La app no escribe en la hoja ni persiste los datos financieros en el navegador.

La lectura de datos está limitada en el servidor a las cuentas de `ALLOWED_EMAILS` y requiere que Apps Script se ejecute como el usuario que accede. Limitar el despliegue al dominio Workspace agrega otra barrera. `ALLOWED_APP_ORIGINS` restringe los orígenes del dashboard, pero no sustituye a la comprobación de identidad.
