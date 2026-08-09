# Despliegue web sin costo de MyMangaOnline

Última verificación: 8 de agosto de 2026.

Esta guía deja la aplicación web publicada sin comprar dominio ni contratar servidores, usando los subdominios HTTPS incluidos por cada proveedor:

```text
Usuario
  -> Cloudflare Pages (Expo Web estático)
  -> Render Free (API Express)
       -> MangaDex / ComicK
```

## Destino recomendado

| Componente | Proveedor | Motivo |
| --- | --- | --- |
| Frontend Expo Web | Cloudflare Pages Free | CDN, HTTPS, despliegue automático desde GitHub y soporte directo para archivos estáticos |
| API Express | Render Web Service Free | Ejecuta el Dockerfile existente, entrega HTTPS y permite healthchecks y despliegues desde GitHub |

No hace falta comprar un dominio: se pueden conservar `https://<proyecto>.pages.dev` y `https://<servicio>.onrender.com`.

La opción gratuita tiene límites. Cloudflare Pages Free permite 500 builds mensuales, 20.000 archivos por sitio y 25 MiB por archivo. Render entrega 750 horas de instancia gratuitas por workspace y duerme el servicio después de 15 minutos sin tráfico; la primera solicitud posterior puede tardar cerca de un minuto. El disco de Render es efímero y Render puede suspender servicios que generen tráfico saliente inusualmente alto. Esta API no necesita persistencia, pero el proxy de imágenes debe mantenerse con los límites actuales.

## Archivos ya preparados

- `app.json` usa `web.output: "static"`.
- `package.json` incluye `export:web` y `smoke:deploy`.
- `public/_headers` agrega CSP y otras cabeceras de seguridad en Cloudflare Pages.
- `.env.production.example` documenta la URL pública de la API que se inserta en el build.
- El repositorio de la API incluye `Dockerfile`, healthcheck `/api/health`, límites de solicitudes y `render.yaml` con el plan gratuito.

## Plan de despliegue

1. Subir a `main` los cambios de los dos repositorios GitHub.
2. Crear la API en Render desde el Blueprint `render.yaml` y guardar su URL `onrender.com`.
3. Crear el frontend en Cloudflare Pages e insertar la URL real de Render durante el build.
4. Actualizar `CORS_ORIGIN` en Render con la URL exacta que entregue Cloudflare Pages.
5. Ejecutar healthchecks, smoke test y una prueba manual de búsqueda y lectura.
6. Mantener despliegue automático desde `main`; ante un fallo, restaurar el despliegue anterior en cada proveedor.

## 1. Preparar GitHub

Los componentes viven en repositorios separados:

- Frontend: `https://github.com/bravoisaac/Mymangaonline`
- Backend: `https://github.com/bravoisaac/API_Mymangaonline`

Antes de publicar, confirma que los archivos `.env` reales no estén versionados. Solo deben subirse los archivos terminados en `.example`.

Validación local de la API:

```powershell
Set-Location API_Mymangaonline
npm.cmd ci
npm.cmd run lint
npm.cmd test
npm.cmd run build
```

Validación local del frontend:

```powershell
Set-Location Mymangaonline
$env:EXPO_PUBLIC_MYMANGA_API_URL='https://URL-REAL-DE-RENDER.onrender.com/api'
npm.cmd ci
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run export:web
```

## 2. Desplegar la API en Render Free

1. En Render, elige **New > Blueprint**.
2. Conecta `bravoisaac/API_Mymangaonline`.
3. Render detectará `render.yaml` en la raíz.
4. Cuando solicite `CORS_ORIGIN`, escribe inicialmente la URL que planeas usar en Cloudflare, por ejemplo `https://mymangaonline.pages.dev`. Si el nombre final cambia, se corrige en el paso 4.
5. Confirma que el servicio use el plan **Free** antes de crearlo.
6. Espera a que `/api/health` quede saludable y guarda la URL exacta asignada, por ejemplo `https://mymangaonline-api.onrender.com`.

No agregues `PORT`: Render la define y la API ya lee `process.env.PORT`. El Blueprint configura `TRUST_PROXY=1` para el subdominio directo de Render. Si después pones la API detrás de otro proxy o CDN, vuelve a revisar ese número porque afecta la IP usada por el rate limit.

Prueba inicial:

```powershell
Invoke-RestMethod https://URL-REAL-DE-RENDER.onrender.com/api/health
```

La respuesta debe contener `ok: true`. En el plan gratuito, la primera prueba puede tardar mientras la instancia despierta.

## 3. Desplegar el frontend en Cloudflare Pages

1. En Cloudflare, abre **Workers & Pages > Create > Pages > Connect to Git**.
2. Conecta `bravoisaac/Mymangaonline` y selecciona la rama de producción `main`.
3. Usa esta configuración:

| Campo | Valor |
| --- | --- |
| Framework preset | None |
| Root directory | `/` o vacío |
| Build command | `npm run export:web` |
| Build output directory | `dist` |

4. Agrega estas variables de producción:

| Variable | Valor |
| --- | --- |
| `NODE_VERSION` | `22` |
| `EXPO_PUBLIC_MYMANGA_API_URL` | `https://URL-REAL-DE-RENDER.onrender.com/api` |

`EXPO_PUBLIC_MYMANGA_API_URL` es pública por diseño y no debe contener credenciales. No agregues tokens, contraseñas ni claves privadas con prefijo `EXPO_PUBLIC_`.

5. Inicia el despliegue y guarda la URL final `https://<proyecto>.pages.dev`.
6. Comprueba directamente `/`, `/reader` y `/manga`. Cloudflare sirve los archivos HTML exportados por Expo con rutas sin extensión; no hace falta una regla SPA adicional.

## 4. Cerrar CORS con la URL real

En Render abre el servicio, entra a **Environment** y deja:

```env
CORS_ORIGIN=https://URL-REAL.pages.dev
```

Debe ser el origen exacto: esquema y host, sin ruta y sin `/` final. Guarda y despliega de nuevo. Si agregas un dominio propio después, usa ambos orígenes separados por coma durante la transición.

No uses `CORS_ORIGIN=*` en producción; la API está configurada para rechazarlo al arrancar.

## 5. Verificación final

Primero despierta y verifica la API:

```powershell
$api='https://URL-REAL-DE-RENDER.onrender.com/api'
$web='https://URL-REAL.pages.dev'

Invoke-RestMethod "$api/health"
Invoke-WebRequest "$web/reader"
```

Después, desde el repositorio frontend:

```powershell
$env:SMOKE_WEB_URL=$web
$env:SMOKE_API_URL=$api
$env:SMOKE_REQUIRE_PRODUCTION_HEADERS='true'
npm.cmd run smoke:deploy
```

El smoke test valida ruta estática, SEO, CORS, cabeceras de seguridad, healthcheck, rate limit, búsqueda real y proxy de una portada.

Prueba manual mínima:

1. Abrir inicio y `/reader` en escritorio y móvil.
2. Buscar `bleach`.
3. Abrir una ficha y un capítulo.
4. Confirmar que las portadas cargan y que la consola no muestra errores CORS.

## 6. Operación, límites y rollback

- Cada push válido a `main` genera un despliegue nuevo.
- Render espera que los checks del backend pasen antes de desplegar.
- Cloudflare conserva despliegues anteriores; Render Free permite volver a los dos despliegues previos recientes.
- Si falla el frontend, restaura el despliegue anterior de Pages.
- Si falla la API, restaura primero Render y repite `/api/health` y el smoke completo.
- No uses servicios de "ping" para evitar el reposo: consumen las horas gratuitas y pueden incumplir las reglas del proveedor.
- Revisa mensualmente el consumo de ancho de banda y horas. Con tráfico alto de portadas, Render Free es el primer componente que necesitará migrar.

## Seguridad y pendientes conocidos

- La API pasa TypeScript, build y 29 pruebas, y `npm audit --omit=dev --audit-level=high` no reporta vulnerabilidades.
- El frontend pasa lint, TypeScript y exportación estática.
- El audit del frontend reporta vulnerabilidades transitivas altas en herramientas de Expo/Metro (`image-size` y `nanoid`) y una moderada en `uuid`. Esas dependencias participan en desarrollo/build y no se ejecutan en Cloudflare como servidor Node, pero siguen siendo un riesgo de cadena de suministro. No ejecutes `npm audit fix --force`: actualmente propone bajar a Expo 53. Actualiza cuando Expo SDK 56 publique una resolución compatible y vuelve a ejecutar todas las validaciones.
- Los scrapers no auditados y la traducción permanecen desactivados en `render.yaml`.
- La API no almacena cuentas, archivos ni base de datos; la biblioteca del usuario vive en el navegador.
- El proxy de imágenes tiene límites de tamaño, concurrencia, cola y solicitudes. No los eleves en el plan gratuito sin medir memoria y tráfico saliente.

## Fuentes oficiales consultadas

- [Expo: publicar una aplicación web](https://docs.expo.dev/deploy/web/)
- [Expo: publicación de sitios y copia de `public` a `dist`](https://docs.expo.dev/guides/publishing-websites/)
- [Cloudflare Pages: configuración de build](https://developers.cloudflare.com/pages/configuration/build-configuration/)
- [Cloudflare Pages: cabeceras personalizadas](https://developers.cloudflare.com/pages/configuration/headers/)
- [Cloudflare Pages: límites del plan Free](https://developers.cloudflare.com/pages/platform/limits/)
- [Cloudflare Pages: resolución de rutas HTML](https://developers.cloudflare.com/pages/configuration/serving-pages/)
- [Render: servicios gratuitos y sus límites](https://render.com/docs/free)
- [Render: referencia de `render.yaml`](https://render.com/docs/blueprint-spec)
- [Render: despliegue de Express](https://render.com/docs/deploy-node-express-app)
- [Render: healthchecks](https://render.com/docs/health-checks)
