# Inteligencia SST · La Movida de SST+

Aplicación administrativa para convertir exportaciones de WhatsApp en información estructurada sobre participación, temas, preguntas, aportes técnicos y perfiles de interés de los integrantes de La Movida de SST+.

## Qué hace la versión 1

- Importa archivos `.txt` exportados desde WhatsApp.
- Reconoce remitentes por teléfono o alias ya aprendido.
- Reutiliza la tabla `whatsapp_aliases` del ecosistema.
- Permite vincular manualmente remitentes pendientes con integrantes reales.
- Recuerda nuevas asociaciones de alias para futuras importaciones.
- Conserva el texto de los mensajes para análisis administrativo.
- Clasifica inicialmente por reglas auditables:
  - tema SST;
  - subtema;
  - tipo de participación;
  - normas mencionadas;
  - palabras clave.
- Genera vista de comunidad y perfiles individuales.

## Seguridad

La interfaz usa la clave publicable de Supabase. Las tablas de Inteligencia tienen RLS habilitado y no se consultan directamente desde el navegador. Las operaciones pasan por RPC administrativas que verifican que la sesión pertenezca a un administrador activo.

Nunca debe colocarse una clave `service_role` en este repositorio.

## Despliegue

Sitio estático desplegado mediante GitHub Pages.

**La Movida de SST+**  
De la Reacción a la Prevención  
https://www.movidasst.com
