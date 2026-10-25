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

## XP y ranking

La pestaña administrativa **XP / Ranking** integra los reconocimientos con la base de datos común de La Movida SST mediante RPC autenticadas de Supabase.

- **Calidad técnica:** seleccionar un estudio e integrantes identificados en Inteligencia, otorgar 25/50/75/100 XP por criterio y revisar el historial. Respeta el tope de 500 XP de calidad por persona y estudio; los moderadores excluidos del ranking competitivo sí pueden recibir reconocimientos de calidad.
- **Participación WhatsApp (WXP-V1):** permite previsualizar y aplicar los puntos calculados en *Administración de Estudios*. Requiere chat confirmado, estudio finalizado y ausencia de XP históricos de esa sesión. Una referencia única evita puntos duplicados.
- **Separación de fuentes:** los mensajes importados a Inteligencia sirven para análisis e identificación; **no se transforman automáticamente** en XP de WhatsApp en Estudios. La asignación manual de calidad sí se hace desde Inteligencia.
- No se realizan escrituras directas desde el navegador en `puntos_eventos`: se utilizan `admin_calidad_otorgar_lote_v2` y `admin_whatsapp_xp_aplicar`.

## Seguridad

La interfaz usa la clave publicable de Supabase. Las tablas de Inteligencia tienen RLS habilitado y no se consultan directamente desde el navegador. Las operaciones pasan por RPC administrativas que verifican que la sesión pertenezca a un administrador activo.

Nunca debe colocarse una clave `service_role` en este repositorio.

## Despliegue

Sitio estático desplegado mediante GitHub Pages.

**La Movida de SST+**  
De la Reacción a la Prevención  
https://www.movidasst.com
