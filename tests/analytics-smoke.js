global.window = globalThis;
require('../analytics-v2.js');

const base = new Date('2026-09-12T16:00:00-04:00').getTime();
const rows = [
  ['Danilo','Sustancias químicas','Pregunta','¿Con qué puedo medir los ppm que genera soda cáustica en un espacio cerrado?'],
  ['David','Higiene ocupacional','Respuesta técnica','La soda cáustica se evalúa como aerosol o niebla y la concentración se expresa en mg/m3 mediante muestreo.'],
  ['Francisco','Higiene ocupacional','Aporte técnico','El volumen y el tiempo de muestreo dependerán del método utilizado por el laboratorio para el análisis.'],
  ['Danilo','EPP','Caso real','En el comedor usan soda cáustica y no están entregando los EPP adecuados al trabajador.'],
  ['Ana','Ruido ocupacional','Pregunta','¿Cómo se calcula la dosis diaria de ruido con un dosímetro?'],
  ['Luis','Ruido ocupacional','Aporte técnico','Para ruido ocupacional debemos considerar tiempo de exposición y nivel equivalente durante la jornada.'],
  ['Marta','Gestión SST','Pregunta','¿Quién debe autorizar un permiso de trabajo en una tarea crítica?'],
  ['Carlos','Gestión SST','Aporte técnico','El supervisor debe verificar controles y responsabilidades dentro del sistema de permisos de trabajo.'],
  ['José','Legislación y normativa','Referencia normativa','La LOPCYMAT establece obligaciones del servicio de seguridad y salud en el trabajo.'],
  ['María','Legislación y normativa','Aporte técnico','El registro ante INPSASEL y los requisitos documentales deben revisarse según el contexto aplicable.'],
  ['Pedro','Emergencias','Pregunta','¿Qué debe practicar una brigada de emergencia para combate de incendios?'],
  ['Elena','Emergencias','Aporte técnico','La brigada debe practicar uso de medios de extinción, evacuación y respuesta ante emergencias.']
].map((r,i)=>({
  alias_detectado:r[0],
  texto:r[3],
  tema:r[1],
  tipo_participacion:r[2],
  subtema:null,
  normas:r[3].includes('LOPCYMAT')?['LOPCYMAT']:[],
  sent_at:new Date(base+i*12*60000).toISOString()
}));

const state = SSTAnalytics.prepare(rows);
if(!state.tfidf.vectors.length) throw new Error('TF-IDF sin vectores');
if(!state.clusters.length) throw new Error('K-means sin clusters');
if(!state.graph.nodes.length || !state.graph.edges.length) throw new Error('Grafo vacío');
if(!state.conversations.length) throw new Error('No se detectaron conversaciones');
const found = SSTAnalytics.search(state,'medición de soda cáustica y muestreo',5);
if(!found.length) throw new Error('Búsqueda semántica vacía');

console.log(JSON.stringify({
  vectors:state.tfidf.vectors.length,
  vocab:state.tfidf.vocab.length,
  clusters:state.clusters.length,
  graph_nodes:state.graph.nodes.length,
  graph_edges:state.graph.edges.length,
  conversations:state.conversations.length,
  search_hits:found.length
}));
