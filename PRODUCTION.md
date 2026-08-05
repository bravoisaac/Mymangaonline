# Produccion web con Docker

La configuracion de produccion publica un solo servicio web:

```text
Internet -> proxy HTTPS/CDN -> web:8080 (Nginx) -> api:3000 (Express)
                                  |                    |
                                  |                    +-> MangaDex / ComicK
                                  +-> export estatico de Expo
```

La API no publica su puerto en el host. El frontend usa `/api`, por lo que navegador y API comparten origen y no es necesario exponer un segundo dominio.

## Requisitos

- Docker Desktop con contenedores Linux y Docker Compose v2.
- WSL 2 en Windows.
- Un dominio HTTPS o un balanceador/CDN que termine TLS delante de `127.0.0.1:8080`.

No se debe publicar el servidor de desarrollo de Expo (`npm run web`) en produccion.

## Configuracion

Desde este directorio:

```powershell
Copy-Item .env.compose.example .env.compose
```

Edita `.env.compose` y reemplaza obligatoriamente:

- `WEB_ORIGIN`: origen HTTPS exacto del sitio, sin ruta ni `/` final.
- `IMAGE_TAG`: version inmutable o SHA del commit.
- `WEB_BIND_ADDRESS`: conserva `127.0.0.1` si existe un proxy TLS local; usa `0.0.0.0` solo si el proveedor necesita alcanzar directamente el puerto publicado.

Los archivos `.env*` reales estan excluidos de Git y de ambos contextos Docker. `EXPO_PUBLIC_MYMANGA_API_URL` queda fijada a `/api` durante el build y no contiene secretos.

## Construir y arrancar

```powershell
docker compose --env-file .env.compose config
docker compose --env-file .env.compose build --pull
docker compose --env-file .env.compose up -d
docker compose --env-file .env.compose ps
```

Las imagenes resultantes usan los nombres y la etiqueta configurados en `.env.compose`, por ejemplo:

```text
mymangaonline-api:1.0.0
mymangaonline-web:1.0.0
```

## Verificacion

```powershell
Invoke-WebRequest http://127.0.0.1:8080/healthz
Invoke-RestMethod http://127.0.0.1:8080/api/health

$env:SMOKE_WEB_URL='http://127.0.0.1:8080'
$env:SMOKE_API_URL='http://127.0.0.1:8080/api'
$env:SMOKE_REQUIRE_PRODUCTION_HEADERS='true'
npm.cmd run smoke:deploy
```

La imagen `web` solo queda saludable si tambien responde `/api/health`. Para revisar fallos:

```powershell
docker compose --env-file .env.compose logs --tail 200 web api
```

## Publicacion

1. Termina TLS en el proveedor, CDN o proxy y redirige HTTP a HTTPS.
2. Apunta el upstream al puerto definido por `WEB_PORT`.
3. Configura rate limiting adicional en el borde para `/api/` y uno mas estricto para `/api/proxy/image`.
4. Publica imagenes con etiquetas inmutables; no uses `latest` como unica referencia.
5. Ejecuta el smoke test contra el dominio HTTPS final antes de dirigir trafico.
6. Conserva la etiqueta anterior para rollback.

Ejemplo de publicacion en un registro, sustituyendo el nombre real:

```powershell
docker tag mymangaonline-web:1.0.0 registry.example.com/mymangaonline-web:1.0.0
docker tag mymangaonline-api:1.0.0 registry.example.com/mymangaonline-api:1.0.0
docker push registry.example.com/mymangaonline-web:1.0.0
docker push registry.example.com/mymangaonline-api:1.0.0
```

## Instalar Docker Desktop en este Windows

La habilitacion inicial de WSL 2 requiere una consola de PowerShell abierta como **Administrador**. Si `wsl --install` no funciona en la compilacion instalada, usa el metodo manual:

```powershell
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
Restart-Computer
```

Despues del reinicio:

```powershell
wsl --update
wsl --set-default-version 2
```

Instala Docker Desktop en modo por usuario, abre la aplicacion y espera a que el motor indique que esta listo. Comprueba:

```powershell
docker version
docker compose version
```

Documentacion oficial: [instalar WSL](https://learn.microsoft.com/windows/wsl/install), [instalacion manual de WSL](https://learn.microsoft.com/windows/wsl/install-manual) e [instalar Docker Desktop en Windows](https://docs.docker.com/desktop/setup/install/windows-install/).

## Operacion y rollback

```powershell
# Actualizar con una etiqueta nueva
docker compose --env-file .env.compose build --pull
docker compose --env-file .env.compose up -d

# Detener sin borrar imagenes
docker compose --env-file .env.compose down
```

Para rollback, restaura `IMAGE_TAG` a la version anterior, ejecuta `up -d` y repite healthcheck y smoke. La cache actual de la API vive en memoria; una recreacion no requiere migraciones ni volumenes persistentes.

