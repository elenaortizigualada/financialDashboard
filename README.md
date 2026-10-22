# Clara Finanzas

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

## Compilación

```bash
npm run build
npm run preview
```

## Funcionalidades

- Indicadores de ingresos, gastos, balance y tasa de ahorro.
- Gráficos de evolución y distribución de gastos.
- Crear y eliminar movimientos.
- Filtrar por mes, tipo y categoría; buscar por concepto.
- Editar límites presupuestarios.
- Persistencia en `localStorage` (solo en este navegador).
- Diseño adaptable a móvil y escritorio.

## Publicar en GitHub

Crea un repositorio vacío llamado `clara-finanzas` en tu cuenta de GitHub y ejecuta desde esta carpeta:

```bash
git init
git add .
git commit -m "Primera versión de Clara Finanzas"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/clara-finanzas.git
git push -u origin main
```

Sustituye `TU_USUARIO` por tu usuario real y autentícate con GitHub cuando corresponda.

## Desplegar gratis en Vercel

1. Entra en https://vercel.com/new e inicia sesión con GitHub.
2. Importa el repositorio `clara-finanzas`.
3. Framework: **Vite**. Build command: `npm run build`. Output directory: `dist`.
4. Pulsa **Deploy**. Vercel proporcionará una URL pública HTTPS.
5. Los siguientes `git push` a la rama principal desencadenarán nuevos despliegues si la integración está activa.

El plan Hobby gratuito de Vercel está orientado a uso personal no comercial; revisa las condiciones y cuotas vigentes.

## Privacidad y limitaciones

**Este proyecto es una demo.** Los movimientos iniciales son ficticios. Los datos que añadas se guardan en el almacenamiento local del navegador, sin sincronización ni copias de seguridad. Si borras los datos del navegador, puedes perder los movimientos. No almacenes credenciales bancarias ni información financiera sensible en este prototipo. Los valores de mayo a septiembre en el gráfico son ilustrativos.

Para una versión multiusuario se recomienda añadir autenticación, base de datos y reglas de acceso seguras antes de trabajar con datos reales.
