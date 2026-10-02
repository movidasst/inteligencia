const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('inteligencia-v2.0.1.js','utf8');
const marker = 'async function ensureAdmin()';
const idx = source.indexOf(marker);
if (idx < 0) throw new Error('No se encontró el punto de corte del parser');

const prefix = source.slice(0, idx) + '\n;globalThis.__parserTest={classifyMessage,parseWhatsappExport};';
const context = {
  console,
  window:{supabase:{createClient:()=>({})}},
  document:{getElementById:()=>({})},
  crypto:globalThis.crypto,
  TextEncoder,
  Intl,
  Date,
  Set,
  Map,
  Float32Array,
  String,
  Number,
  Math,
  RegExp,
  JSON,
  Array,
  Object
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(prefix, context, {filename:'inteligencia-v2.0.1.js'});

const {classifyMessage,parseWhatsappExport} = context.__parserTest;

const c1 = classifyMessage('La LOPCYMAT establece obligaciones para el Servicio de Seguridad y Salud en el Trabajo.');
if (!Array.isArray(c1.normas)) throw new Error('clasificación sin array normas');
if (!c1.normas.includes('LOPCYMAT')) throw new Error('LOPCYMAT no detectada');

const c2 = classifyMessage('La soda cáustica se evalúa como aerosol y la concentración se expresa en mg/m3 mediante muestreo.');
if (!Array.isArray(c2.normas)) throw new Error('normas no es array en mensaje químico');
if (!['Sustancias químicas','Higiene ocupacional'].includes(c2.tema)) throw new Error('tema químico/higiene no detectado');

const chat = [
'12/9/2026, 4:27 p. m. - CA - Danilo Robinson: Saludos. Una pregunta. Con que puedo medir los ppm que me genera el uso de soda cáustica en un espacio cerrado',
'12/9/2026, 4:49 p. m. - David Linares Brea: La soda cáustica generalmente puede producir polvo o niebla y se mide en mg/m3 con bomba de muestreo.',
'12/9/2026, 5:00 p. m. - CA - Danilo Robinson: Quiero levantar un informe para eliminar una mala práctica en un comedor.',
'12/9/2026, 7:50 p. m. - CA - Francisco Javier Alvarado Marquina: El volumen y tiempo de muestreo dependerá del método utilizado por el laboratorio.'
].join('\n');

const parsed = parseWhatsappExport(chat,'');
if (parsed.messages.length !== 4) throw new Error('parser no detectó los 4 mensajes');
for (const m of parsed.messages) {
  if (!Array.isArray(m.normas)) throw new Error('mensaje parseado sin normas array');
}

console.log(JSON.stringify({
  build:'v2.0.1',
  messages:parsed.messages.length,
  participants:parsed.details.length,
  lopcymat_norms:c1.normas,
  chemical_topic:c2.tema
}));
