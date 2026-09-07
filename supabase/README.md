# Perfil sincronizado con Supabase

La aplicación usa Supabase Auth para el acceso con correo y contraseña, y la tabla
`public.saved_mangas` para sincronizar la biblioteca. El cliente sólo recibe la clave
**Publishable**; el aislamiento entre usuarios se aplica en PostgreSQL mediante RLS.

## Configuración

1. Crea un proyecto en Supabase.
2. Abre **SQL Editor**, copia el contenido de
   `migrations/202608210001_create_saved_mangas.sql` y ejecútalo una vez.
3. En **Authentication > URL Configuration**, define la URL pública del sitio.
4. Copia la **Project URL** y la clave **Publishable** desde el panel **Connect**.
5. Copia `Mymangaonline/.env.local.example` como `Mymangaonline/.env.local` y completa:

```env
EXPO_PUBLIC_MYMANGA_API_URL=http://localhost:3000/api
EXPO_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_reemplazar
```

No uses una clave `service_role` ni otra clave privada en variables `EXPO_PUBLIC_*`.

## Verificación manual

1. Ejecuta `npm run web` y crea un perfil.
2. Si la confirmación de correo está habilitada, confirma la cuenta e inicia sesión.
3. Guarda un manga y comprueba que aparece en `public.saved_mangas`.
4. Abre una ventana privada u otro navegador e inicia sesión con el mismo perfil.
5. Confirma que el manga aparece y que quitarlo se refleja al volver a cargar el primer navegador.

Al primer acceso, la aplicación combina automáticamente los mangas del perfil local
anterior con los remotos. Nunca elimina un manga durante esa migración.
