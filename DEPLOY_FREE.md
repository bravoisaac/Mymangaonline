# Despliegue gratuito y manual (sin Git)

Última verificación: 16 de agosto de 2026.

Esta guía publica My Manga Online para uso personal sin conectar GitHub, GitLab ni Bitbucket a los proveedores. Los despliegues se realizan desde el equipo local:

```text
Equipo local
  ├─ dist/ de Expo ──────────────> Cloudflare Pages Direct Upload
  └─ imagen linux/amd64 de la API -> Docker Hub -> Render Free

Usuario -> https://<sitio>.pages.dev -> https://<api>.onrender.com/api
```

## Servicios elegidos

| Componente | Servicio gratuito | Forma de publicación |
| --- | --- | --- |
| Frontend Expo Web | Cloudflare Pages | Carga directa de `dist/` con Wrangler o arrastrando la carpeta |
| Imagen de la API | Docker Hub Personal | Un repositorio privado gratuito o uno público |
| API Express | Render Web Service Free | Imagen Docker existente, sin repositorio Git conectado |

No hace falta comprar un dominio. Se pueden conservar los subdominios HTTPS `pages.dev` y `onrender.com`.

## Despliegue personal actual

| Recurso | Valor |
| --- | --- |
| Frontend | `https://mymangaonline-personal.pages.dev` |
| API | `https://mymangaonline-api.onrender.com/api` |
| Health check | `https://mymangaonline-api.onrender.com/api/health` |
| Imagen | `docker.io/isaacbravomelo/mymangaonline-api:1.0.0` |
| Digest | `sha256:91a0d5491fd9a55ad6bae9a36d5aa64b84f72d7f4dddde7482ce78df1b45584b` |

El despliegue se verificó el 16 de agosto de 2026 con `npm run smoke:deploy`: lector web, cabeceras de producción, CORS, búsqueda agregada y proxy de imágenes respondieron correctamente.

> Sin Git no significa sin copias de seguridad. Conserva una copia privada del código y no borres las imágenes Docker etiquetadas que todavía puedas necesitar para volver atrás.

## Coste y limitaciones

- Cloudflare Pages Direct Upload admite hasta 20.000 archivos con Wrangler (1.000 al arrastrar y soltar) y 25 MiB por archivo.
- Render Free concede 750 horas de instancia por workspace y mes. El servicio se suspende tras 15 minutos sin tráfico y puede tardar cerca de un minuto en despertar.
- Si la cuenta de Render tiene un método de pago, revisa **Billing** y los límites de gasto: el consumo adicional de ancho de banda puede facturarse. Sin un método de pago, Render suspende los servicios gratuitos al agotar la cuota en lugar de cobrar el exceso.
- El sistema de archivos de Render es efímero. Este proyecto no guarda archivos ni usa una base de datos, así que esa limitación es compatible con su arquitectura actual.
- Render puede suspender servicios gratuitos con tráfico saliente inusualmente alto. Las portadas pasan por la API, por lo que conviene conservar los límites del proxy y usar el proyecto sólo de forma personal.
- Docker Hub Personal admite un repositorio privado gratuito y repositorios públicos ilimitados, sujeto a sus límites de uso razonable.
- Los servicios y sus condiciones pueden cambiar. Revisa las fuentes oficiales enlazadas al final antes de una publicación futura.

## Requisitos

- Node.js 22 y npm.
- Docker Desktop con contenedores Linux.
- Cuentas gratuitas en Cloudflare, Render y Docker Hub.
- El frontend y el backend descargados en este workspace.

No se necesita un repositorio remoto. Git local también es opcional para ejecutar este procedimiento.

## Plan resumido

1. Validar ambos proyectos en local.
2. Construir la API para `linux/amd64` y subir una versión inmutable a Docker Hub.
3. Crear en Render un Web Service Free desde esa imagen.
4. Exportar Expo Web usando la URL pública de Render.
5. Subir `dist/` mediante Cloudflare Pages Direct Upload.
6. Reemplazar el CORS provisional por la URL exacta de Pages.
7. Ejecutar el smoke test y comprobar búsqueda, ficha, capítulo y portadas.

## 1. Validación local

Desde la raíz del workspace, valida la API:

```powershell
Set-Location .\API_Mymangaonline
npm.cmd ci
npm.cmd run lint
npm.cmd test
npm.cmd run build
Set-Location ..
```

Valida el frontend:

```powershell
Set-Location .\Mymangaonline
npm.cmd ci
npm.cmd run lint
npm.cmd run typecheck
Set-Location ..
```

No publiques si alguno de estos comandos falla. Los archivos `.env` reales no deben copiarse a la imagen ni a Pages; los `.dockerignore` existentes ya los excluyen.

## 2. Publicar la imagen de la API en Docker Hub

### 2.1 Crear el repositorio

En Docker Hub crea `mymangaonline-api`. Para mantener el código menos expuesto, usa el único repositorio privado incluido en el plan Personal. Render admite credenciales de Docker Hub para leer imágenes privadas.

Inicia sesión desde Docker Desktop o con:

```powershell
docker login
```

### 2.2 Construir y subir una versión

Sustituye `TU_USUARIO` y cambia la etiqueta en cada publicación:

```powershell
Set-Location .\API_Mymangaonline
$image='TU_USUARIO/mymangaonline-api:1.0.0'
docker build --platform linux/amd64 --tag $image .
docker push $image
Set-Location ..
```

Render exige imágenes `linux/amd64`. Usa etiquetas como `1.0.0`, `1.0.1` o una fecha; no dependas únicamente de `latest`, porque una etiqueta inmutable permite identificar y restaurar una versión.

## 3. Crear la API en Render sin Git

1. Abre Render y elige **New > Web Service**.
2. En **Source Code**, selecciona **Existing Image**.
3. Indica `docker.io/TU_USUARIO/mymangaonline-api:1.0.0`.
4. Si el repositorio es privado, agrega una credencial de Docker Hub con un token de acceso, no con tu contraseña principal.
5. Elige un nombre, una región cercana y el tipo de instancia **Free**.
6. Configura **Health Check Path** como `/api/health`.
7. Agrega estas variables:

| Variable | Valor inicial |
| --- | --- |
| `NODE_ENV` | `production` |
| `CORS_ORIGIN` | `https://mymangaonline-personal.pages.dev` |
| `TRUST_PROXY` | `1` |
| `INCLUDE_ERROR_STACKS` | `false` |
| `MANGADEX_ENABLED` | `true` |
| `COMICK_ENABLED` | `true` |
| `TRANSLATION_ENABLED` | `false` |

Render define `PORT` automáticamente; no lo agregues. Los scrapers y providers opcionales permanecen desactivados por defecto.

Cuando termine el despliegue, guarda la URL asignada y comprueba:

```powershell
$api='https://TU-API.onrender.com/api'
Invoke-RestMethod "$api/health"
```

La respuesta debe incluir `ok: true`. La primera solicitud puede tardar mientras el servicio gratuito despierta.

## 4. Exportar el frontend con la URL de Render

Las variables `EXPO_PUBLIC_*` se insertan en el JavaScript durante el build. Configura previamente Supabase según [`supabase/README.md`](./supabase/README.md) y usa exclusivamente su clave Publishable. Crea `.env.production` una sola vez; no es necesario modificar variables del terminal para cada despliegue.

```powershell
Set-Location .\Mymangaonline
Copy-Item .env.production.example .env.production
# Edita .env.production con la URL real de Render y los datos públicos de Supabase.
npm.cmd run export:web:production
Set-Location ..
```

El resultado queda en `Mymangaonline/dist/`. Los comandos de producción leen exclusivamente `.env.production`, aunque el terminal o `.env.local` contengan otros valores. Si cambia la URL de la API, actualiza ese archivo, vuelve a exportar y sube el frontend.

## 5. Publicar el frontend en Cloudflare Pages sin Git

### Opción recomendada: Wrangler

```powershell
npx.cmd wrangler login
npx.cmd wrangler pages project create
npx.cmd wrangler pages deploy .\Mymangaonline\dist --project-name=mymangaonline-personal
```

En la creación elige un nombre disponible y usa `production` como nombre de rama de producción; es sólo una etiqueta de Pages y no requiere un repositorio Git. Guarda la URL final que muestre Wrangler.

Para futuras versiones sólo necesitas volver a exportar y ejecutar:

```powershell
npx.cmd wrangler pages deploy .\Mymangaonline\dist --project-name=mymangaonline-personal
```

### Opción visual: arrastrar y soltar

En Cloudflare abre **Workers & Pages > Create application > Get started > Drag and drop**, crea el proyecto y carga la carpeta `dist`. Esta opción tiene un límite menor de archivos que Wrangler, pero sirve si no quieres usar la CLI.

En Windows, selecciona directamente la carpeta `dist`; no subas un ZIP creado con `Compress-Archive`. Ese ZIP puede conservar separadores `\` en las rutas internas y provocar que Cloudflare entregue el HTML de respaldo en lugar de los bundles JavaScript. Antes de publicar, `npm run export:web:production` limpia la caché de Metro para que los cambios en `.env.production` queden incorporados.

Un proyecto creado como Direct Upload no puede convertirse después en un proyecto con integración Git; habría que crear otro proyecto de Pages.

## 6. Cerrar CORS con el dominio real

En Render abre **Environment** y reemplaza el valor provisional:

```env
CORS_ORIGIN=https://URL-REAL.pages.dev
```

Debe ser el origen exacto: `https`, host, sin ruta y sin `/` final. Guarda los cambios y espera el nuevo despliegue. No uses `*`; la API lo rechaza en producción.

## 7. Verificación final

```powershell
$api='https://TU-API.onrender.com/api'
$web='https://URL-REAL.pages.dev'

Invoke-RestMethod "$api/health"
Invoke-WebRequest "$web/reader"

$env:SMOKE_WEB_URL=$web
$env:SMOKE_API_URL=$api
$env:SMOKE_REQUIRE_PRODUCTION_HEADERS='true'
Set-Location .\Mymangaonline
npm.cmd run smoke:deploy
Set-Location ..
```

Prueba además en escritorio y móvil:

1. Abrir `/` y `/reader`.
2. Buscar `bleach`.
3. Abrir una ficha y un capítulo.
4. Confirmar que cargan las portadas y que la consola no muestra errores CORS.

## Actualizar una versión

### Backend

```powershell
Set-Location .\API_Mymangaonline
$image='TU_USUARIO/mymangaonline-api:1.0.1'
npm.cmd ci
npm.cmd run lint
npm.cmd test
npm.cmd run build
docker build --platform linux/amd64 --tag $image .
docker push $image
Set-Location ..
```

En Render cambia la referencia de imagen de `:1.0.0` a `:1.0.1` y lanza el despliegue manual. Las imágenes existentes no tienen despliegue automático; esto es intencional en el flujo sin Git.

### Frontend

```powershell
Set-Location .\Mymangaonline
npm.cmd ci
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run export:web:production
Set-Location ..
npx.cmd wrangler pages deploy .\Mymangaonline\dist --project-name=mymangaonline-personal
```

Ejecuta siempre el smoke test después de actualizar cualquiera de los dos componentes.

## Rollback y copias de seguridad

- Frontend: en Pages selecciona un despliegue anterior y promuévelo de nuevo a producción.
- Backend: conserva las etiquetas anteriores en Docker Hub, cambia Render a la etiqueta previa y despliega manualmente.
- Código: guarda una copia privada y versionada fuera de los proveedores de despliegue. Docker Hub almacena artefactos ejecutables, no sustituye una copia mantenible del código fuente.
- No uses servicios de “ping” para impedir que Render duerma; gastan las horas gratuitas y pueden contrariar las condiciones del proveedor.

## Fuentes oficiales

- [Cloudflare Pages: Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)
- [Cloudflare Pages: límites](https://developers.cloudflare.com/pages/platform/limits/)
- [Render: desplegar una imagen existente](https://render.com/docs/deploying-an-image)
- [Render: servicios gratuitos y límites](https://render.com/docs/free)
- [Render: despliegues manuales](https://render.com/docs/deploys)
- [Docker Hub: uso y límites](https://docs.docker.com/docker-hub/usage/)
