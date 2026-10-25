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

## XP por participación en grupos de WhatsApp (v1.2.0)
Los XP de Inteligencia SST son por **grupos de WhatsApp**, no por estudios (Estudia) ni encuestas (Participa).
Al importar un TXT se asigna un nombre de grupo, se vinculan integrantes y se calculan propuestas por cada **grupo, mes e integrante**:
- 50 XP: al menos un mensaje útil;
- 100 XP: 5 mensajes útiles y 3 días activos;
- 150 XP: 12 mensajes útiles y 6 días activos.
No cuentan saludos ni conversaciones generales. Se consolidan mensajes y se deduplican exportaciones del mismo grupo.
La pantalla XP permite seleccionar, editar a 50/100/150 o excluir, y solo un administrador confirma todo en bloque.
Se registran en `puntos_eventos` como `actividad` con `metadata.fuente=inteligencia_grupo` y `sesion_id=null`. Referencia única por grupo+mes+integrante impide duplicados.
La selección en pantalla no asigna XP hasta pulsar «Confirmar XP en bloque». Los pendientes de identificación se excluyen hasta vincularse.
