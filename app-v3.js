const INTELIGENCIA_BUILD = 'v1.0.3-20261002';
console.info('Inteligencia SST', INTELIGENCIA_BUILD);
const SUPABASE_URL = 'https://lfdmbkzghnwvsapxypvt.supabase.co';
const SUPABASE_KEY = 'sb_publishable_bRnkA6PA8-v073nrw9zxiQ_8rVGiOn1';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = id => document.getElementById(id);
let localAnalysis = null;
let currentImportId = null;
let currentParticipants = [];

function safeText(v){
  return String(v ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  }[c]));
}
function showLoading(v){ $('loading').hidden = !v; }
function toast(message,error=false){
  const t=$('toast'); t.textContent=message; t.className='toast'+(error?' error':''); t.hidden=false;
  clearTimeout(t._timer); t._timer=setTimeout(()=>t.hidden=true,3600);
}
function normalizeAlias(value){
  return String(value||'')
    .normalize('NFD').replace(/\p{Diacritic}/gu,'')
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s+.\-]/gu,' ')
    .replace(/\s+/g,' ').trim();
}
function normalizeForSearch(value){
  return String(value||'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();
}
function normalizeDetectedPhone(value){
  const d=String(value||'').replace(/\D/g,'');
  if(/^04\d{9}$/.test(d)) return '58'+d.slice(1);
  if(/^4\d{9}$/.test(d)) return '58'+d;
  return d||null;
}
function looksLikePhoneSender(sender){
  const raw=String(sender||'').trim(), digits=raw.replace(/\D/g,'');
  return (/^\+/.test(raw)||/^[\d\s()+\-]+$/.test(raw)) && digits.length>=10;
}
function toIso(day,month,year,hour,minute,second=0,ampm=null){
  let y=Number(year); if(y<100) y+=2000;
  let h=Number(hour);
  const ap=String(ampm||'').toLowerCase().replace(/\./g,'').replace(/\s/g,'');
  if((ap==='pm'||ap==='p')&&h!==12) h+=12;
  if((ap==='am'||ap==='a')&&h===12) h=0;
  const pad=n=>String(n).padStart(2,'0');
  return `${y}-${pad(month)}-${pad(day)}T${pad(h)}:${pad(minute)}:${pad(second)}-04:00`;
}
function parseStartLine(line){
  const clean=line.replace(/\u202f/g,' ').replace(/\u00a0/g,' ');
  let m=clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4}),\s*(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([ap])\.\s*m\.)?\s*-\s*(.*)$/i);
  if(m) return {day:+m[1],month:+m[2],year:+m[3],hour:+m[4],minute:+m[5],second:+(m[6]||0),ampm:m[7]||null,payload:m[8]||''};
  m=clean.match(/^\[(\d{1,2})\/(\d{1,2})\/(\d{2,4}),\s*(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?\]\s*(.*)$/i);
  if(m) return {day:+m[1],month:+m[2],year:+m[3],hour:+m[4],minute:+m[5],second:+(m[6]||0),ampm:m[7]||null,payload:m[8]||''};
  return null;
}

const TOPICS = [
  {name:'Ruido ocupacional', words:['ruido','decibel','dba','db(a)','sonometro','dosimetro','dosimetria','hipoacusia','audiometria','protector auditivo','nivel sonoro','leq']},
  {name:'Evaluación de riesgos', words:['evaluacion de riesgo','evaluar riesgo','matriz de riesgo','iperc','gtc 45','william fine','bowtie','peligro','consecuencia','exposicion','jerarquia de controles']},
  {name:'Espacios confinados', words:['espacio confinado','tanque','atmosfera peligrosa','deficiencia de oxigeno','h2s','lel','permiso de entrada','rescate en espacio']},
  {name:'Sustancias químicas', words:['quimico','sustancia quimica','soda caustica','acido','solvente','vapores','aerosol','polvo','silice','ficha de seguridad','sds','msds','toxicidad']},
  {name:'Ergonomía', words:['ergonomia','ergonomico','postura','levantamiento manual','manejo manual','carga fisica','repetitivo','musculoesquelet','rula','reba']},
  {name:'Riesgo psicosocial', words:['psicosocial','estres laboral','burnout','acoso laboral','salud mental','carga mental','violencia laboral','fatiga mental']},
  {name:'Trabajo en altura', words:['trabajo en altura','altura','arnes','linea de vida','andamio','escalera','caida de altura','anclaje']},
  {name:'Riesgo eléctrico', words:['electrico','electricidad','voltaje','tension electrica','arco electrico','lockout','tagout','loto','puesta a tierra']},
  {name:'Incendios y explosiones', words:['incendio','extintor','nfpa 10','fuego','explosion','inflamable','combustible','rociador','deteccion de incendio']},
  {name:'Radiaciones', words:['radiacion','radiologico','ionizante','dosimetria personal','rayos x','fuente radiactiva','proteccion radiologica','geiger']},
  {name:'Higiene ocupacional', words:['higiene ocupacional','higiene industrial','muestreo','exposicion ocupacional','limite permisible','tlv','oel','ventilacion industrial','agente fisico','agente quimico']},
  {name:'Salud ocupacional', words:['salud ocupacional','vigilancia de la salud','medicina ocupacional','enfermedad ocupacional','enfermedad laboral','aptitud medica','epidemiologia']},
  {name:'Investigación de accidentes', words:['accidente','incidente','investigacion de accidente','causa raiz','arbol de causas','evento no deseado','casi accidente']},
  {name:'Emergencias', words:['emergencia','plan de emergencia','evacuacion','simulacro','primeros auxilios','brigada','respuesta a emergencia']},
  {name:'EPP', words:['epp','equipo de proteccion personal','proteccion respiratoria','respirador','casco','guante','gafa de seguridad','protector facial']},
  {name:'Gestión SST', words:['sistema de gestion','sgsst','sst','seguridad y salud en el trabajo','liderazgo','comite de seguridad','programa de seguridad','45001','45002']},
  {name:'Legislación y normas', words:['ley','reglamento','norma','covenin','iso ','nfpa','osha','niosh','iec','asme','ansi','lopcymat','inpsasel']},
  {name:'Medio ambiente', words:['medio ambiente','ambiental','iso 14001','residuo','emision','impacto ambiental','aspecto ambiental','contaminacion']}
];
const SUBTOPICS = [
  ['Dosimetría de ruido',['dosimetro','dosimetria','dosis de ruido']],
  ['Audiometrías',['audiometria','audiometrico','hipoacusia']],
  ['Protectores auditivos',['protector auditivo','orejera','tapon auditivo']],
  ['Jerarquía de controles',['jerarquia de controles','eliminacion','sustitucion','control de ingenieria']],
  ['Atmósferas peligrosas',['h2s','lel','oxigeno','atmosfera peligrosa','multigas']],
  ['Protección respiratoria',['respirador','proteccion respiratoria','filtro','cartucho']],
  ['Incendios - extintores',['extintor','nfpa 10']],
  ['Ergonomía física',['postura','levantamiento manual','reba','rula']],
  ['Salud mental',['salud mental','burnout','estres laboral']],
  ['Trabajo seguro con energías',['loto','lockout','tagout','aislamiento de energia']]
];
function extractNorms(text){
  const rx=/\b(?:ISO(?:\/DIS|\/AWI)?\s*\d{3,6}(?::\d{4})?|COVENIN\s*\d{2,5}(?::\d{4})?|NFPA\s*\d{1,4}(?::\d{4})?|OSHA\s*[\d.]+|NIOSH\s*\d+|IEC\s*\d{3,6}|GTC\s*45|ASME\s+[A-Z0-9.\-]+|ANSI\s+[A-Z0-9.\-]+)\b/gi;
  return [...new Set((String(text).match(rx)||[]).map(x=>x.replace(/\s+/g,' ').trim().toUpperCase()))].slice(0,10);
}
function classifyMessage(text){
  const raw=String(text||'').trim(), n=normalizeForSearch(raw);
  let best='Otros', bestScore=0, matched=[];
  for(const topic of TOPICS){
    let score=0, kws=[];
    for(const w of topic.words){
      const wn=normalizeForSearch(w);
      if(n.includes(wn)){ score += wn.length>10?2:1; kws.push(w); }
    }
    if(score>bestScore){bestScore=score;best=topic.name;matched=kws;}
  }
  let subtema=null;
  for(const [name,words] of SUBTOPICS){
    if(words.some(w=>n.includes(normalizeForSearch(w)))){subtema=name;break;}
  }
  const isQuestion=/\?/.test(raw)||/^(que|qué|como|cómo|cuando|cuándo|cual|cuál|donde|dónde|por que|por qué|alguien sabe|consulta|una pregunta)\b/i.test(raw);
  const isCase=/\b(en mi empresa|en nuestra empresa|nos paso|nos pasó|tuvimos|ocurrio|ocurrió|caso real|en planta|en obra|en el trabajo)\b/i.test(raw);
  const isResource=/(https?:\/\/|www\.)/i.test(raw)||/\b(comparto|les comparto|adjunto|documento|enlace|archivo|manual|guia|guía)\b/i.test(raw);
  const technical=best!=='Otros'||norms.length>0||/\b(riesgo|peligro|exposicion|exposición|control|prevencion|prevención|procedimiento|medicion|medición)\b/i.test(raw);
  let tipo='Aporte / comentario';
  if(isQuestion) tipo='Pregunta';
  else if(isCase) tipo='Caso real';
  else if(isResource) tipo='Recurso compartido';
  else if(extractNorms(raw).length) tipo='Referencia normativa';
  else if(technical && raw.split(/\s+/).length>=12) tipo='Aporte técnico';
  else if(raw.split(/\s+/).length<=5 && /^(hola|buenos dias|buen día|buenas|gracias|excelente|saludos|feliz)/i.test(raw)) tipo='Conversación general';
  return {
    tema:best,subtema,tipo_participacion:tipo,normas:extractNorms(raw),
    palabras_clave:[...new Set(matched)].slice(0,8),
    clasificacion_fuente:'reglas_v1'
  };
}
function cleanMessageContent(content){
  let t=String(content||'');
  t=t.replace(/<multimedia omitido>/ig,' ');
  t=t.replace(/[^\n]*\.(jpg|jpeg|png|webp|gif|opus|mp3|mp4|pdf|docx?|xlsx?)\s*\(archivo adjunto\)/ig,' ');
  t=t.replace(/\(archivo adjunto\)/ig,' ');
  return t.replace(/\s+/g,' ').trim();
}
function parseWhatsappExport(text,ignoredRaw=''){
  const normalized=String(text||'').replace(/\u202f/g,' ').replace(/\u00a0/g,' ').replace(/\r\n?/g,'\n');
  const ignored=new Set(String(ignoredRaw||'').split(',').map(normalizeAlias).filter(Boolean));
  const rawLines=normalized.split('\n');
  const events=[]; let current=null;
  for(const rawLine of rawLines){
    const p=parseStartLine(rawLine);
    if(p){ if(current) events.push(current); current=p; }
    else if(current){ current.payload+='\n'+rawLine; }
  }
  if(current) events.push(current);

  const deleted=[/^eliminaste este mensaje\.?$/i,/^se elimin[oó] este mensaje\.?$/i,/^este mensaje fue eliminado\.?$/i];
  const participants=new Map(); const messages=[]; let index=0,minIso=null,maxIso=null;
  for(const ev of events){
    const sm=(ev.payload||'').match(/^([^:\n]+?):(?:\s?)([\s\S]*)$/);
    if(!sm) continue;
    const sender=sm[1].trim().replace(/^[\u200e\u200f\u202a-\u202e\u2066-\u2069]+/g,'').trim();
    const content=(sm[2]||'').trim(), senderNorm=normalizeAlias(sender);
    if(!senderNorm||ignored.has(senderNorm)||!content||deleted.some(r=>r.test(content.trim()))) continue;
    const hasMedia=/<multimedia omitido>|\(archivo adjunto\)/i.test(content);
    const textPart=cleanMessageContent(content);
    if(!textPart&&!hasMedia) continue;
    const iso=toIso(ev.day,ev.month,ev.year,ev.hour,ev.minute,ev.second,ev.ampm);
    const dateKey=iso.slice(0,10);
    if(!minIso||iso<minIso)minIso=iso;if(!maxIso||iso>maxIso)maxIso=iso;

    let p=participants.get(senderNorm);
    if(!p){
      p={alias_detectado:sender,alias_normalizado:senderNorm,
        telefono_detectado:looksLikePhoneSender(sender)?normalizeDetectedPhone(sender):null,
        message_count:0,days:new Set(),first_message_at:iso,last_message_at:iso};
      participants.set(senderNorm,p);
    }
    p.message_count++;p.days.add(dateKey);if(iso<p.first_message_at)p.first_message_at=iso;if(iso>p.last_message_at)p.last_message_at=iso;

    if(textPart){
      const c=classifyMessage(textPart);
      messages.push({source_index:index++,sent_at:iso,alias_detectado:sender,alias_normalizado:senderNorm,texto:textPart,...c});
    }
  }
  const details=[...participants.values()].map(p=>({
    alias_detectado:p.alias_detectado,alias_normalizado:p.alias_normalizado,telefono_detectado:p.telefono_detectado,
    message_count:p.message_count,active_days:p.days.size,first_message_at:p.first_message_at,last_message_at:p.last_message_at
  })).sort((a,b)=>b.message_count-a.message_count);
  return {details,messages,periodStart:minIso,periodEnd:maxIso,totalParticipants:details.length,totalMessages:messages.length};
}
async function sha256Text(text){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
function groupCount(rows,key){
  const m=new Map(); for(const r of rows){const v=r[key]||'Otros';m.set(v,(m.get(v)||0)+1);}
  return [...m.entries()].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count);
}
function renderBars(el,items){
  if(!items||!items.length){el.innerHTML='<div class="empty">Sin datos todavía.</div>';return;}
  const max=Math.max(...items.map(x=>Number(x.count??x.cantidad??0)),1);
  el.innerHTML=items.map(x=>{
    const name=x.name??x.tema??x.tipo??'Otros', count=Number(x.count??x.cantidad??0);
    return `<div class="bar-row"><label>${safeText(name)}</label><div class="bar-track"><div class="bar-fill" style="width:${Math.max(3,(count/max)*100)}%"></div></div><b>${count}</b></div>`;
  }).join('');
}

async function ensureAdmin(){
  const {data:{session}}=await sb.auth.getSession();
  if(!session){showLogin();return false;}
  const {error}=await sb.rpc('admin_inteligencia_resumen');
  if(error){await sb.auth.signOut();showLogin();toast('La cuenta no tiene permiso administrativo.',true);return false;}
  showApp();return true;
}
function showLogin(){$('loginView').hidden=false;$('appView').hidden=true;}
function showApp(){$('loginView').hidden=true;$('appView').hidden=false;}

async function loadCommunity(){
  const {data,error}=await sb.rpc('admin_inteligencia_resumen');
  if(error){toast(error.message,true);return;}
  const s=data||{};
  $('communityKpis').innerHTML=[
    ['Mensajes analizados',s.mensajes||0],['Integrantes activos',s.integrantes_activos||0],
    ['Preguntas',s.preguntas||0],['Aportes técnicos',s.aportes_tecnicos||0],['Sin identificar',s.sin_identificar||0]
  ].map(([a,b])=>`<div class="kpi"><span>${safeText(a)}</span><strong>${Number(b).toLocaleString('es')}</strong></div>`).join('');
  renderBars($('themesChart'),(s.temas||[]).map(x=>({name:x.tema,count:x.cantidad})));
  renderBars($('typesChart'),(s.tipos||[]).map(x=>({name:x.tipo,count:x.cantidad})));
  const people=s.personas||[];
  $('topPeople').innerHTML=people.length?people.map(p=>`
    <div class="person-row"><div class="person-main"><strong>${safeText(p.nombre)}</strong>
    <small>${p.mensajes} mensajes · ${p.temas} temas · ${p.preguntas} preguntas · ${p.aportes} aportes técnicos</small></div>
    <button onclick="openPerson(${Number(p.integrante_id)})">Ver perfil</button></div>`).join(''):'<div class="empty">Todavía no hay personas identificadas.</div>';
}

function renderLocalAnalysis(){
  const a=localAnalysis;
  $('analysisKpis').innerHTML=[
    ['Mensajes con texto',a.totalMessages],['Remitentes',a.totalParticipants],
    ['Preguntas',a.messages.filter(x=>x.tipo_participacion==='Pregunta').length],
    ['Temas',new Set(a.messages.map(x=>x.tema)).size]
  ].map(([x,y])=>`<div class="kpi"><span>${x}</span><strong>${Number(y).toLocaleString('es')}</strong></div>`).join('');
  renderBars($('localThemes'),groupCount(a.messages,'tema').slice(0,12));
  renderBars($('localTypes'),groupCount(a.messages,'tipo_participacion').slice(0,10));
  $('analysisFileName').textContent=a.fileName;
  $('previewParticipants').innerHTML=a.details.slice(0,100).map(p=>`
    <div class="participant-row"><div class="participant-main"><strong>${safeText(p.alias_detectado)}</strong>
    <small>${p.active_days} día(s) activo(s)${p.telefono_detectado?' · teléfono detectado':''}</small></div>
    <div class="participant-count"><b>${p.message_count}</b><small>mensajes</small></div></div>`).join('');
  $('analysisSection').hidden=false;
}

async function analyzeSelectedFile(){
  const file=$('whatsappFile').files[0];
  if(!file){toast('Selecciona un archivo .txt.',true);return;}
  if(!/\.txt$/i.test(file.name)){toast('El archivo debe ser .txt.',true);return;}
  showLoading(true);
  try{
    const text=await file.text(), parsed=parseWhatsappExport(text,$('ignoredSenders').value);
    if(!parsed.details.length) throw new Error('No se detectaron participantes en el archivo.');
    parsed.fileName=file.name;parsed.fileHash=await sha256Text(text);localAnalysis=parsed;
    renderLocalAnalysis();$('matchingSection').hidden=true;
    $('analysisSection').scrollIntoView({behavior:'smooth',block:'start'});
  }catch(e){console.error(e);toast(`${INTELIGENCIA_BUILD} · ${e.message||'No se pudo analizar el archivo.'}`,true);}
  finally{showLoading(false);}
}

async function saveAnalysis(){
  if(!localAnalysis)return;
  showLoading(true);
  try{
    const a=localAnalysis;
    const {data,error}=await sb.rpc('admin_inteligencia_importacion_crear',{
      p_archivo_nombre:a.fileName,p_archivo_hash:a.fileHash,p_periodo_desde:a.periodStart,p_periodo_hasta:a.periodEnd,p_participantes:a.details
    });
    if(error)throw error;
    currentImportId=data.importacion_id;
    const batchSize=150;
    for(let i=0;i<a.messages.length;i+=batchSize){
      const {error:batchError}=await sb.rpc('admin_inteligencia_mensajes_lote',{
        p_importacion_id:currentImportId,p_mensajes:a.messages.slice(i,i+batchSize)
      });
      if(batchError)throw batchError;
    }
    const {error:finishError}=await sb.rpc('admin_inteligencia_importacion_finalizar',{p_importacion_id:currentImportId});
    if(finishError)throw finishError;
    toast(data.existente?'Archivo ya existente: se verificó y actualizó la carga.':'Importación guardada correctamente.');
    await loadImportParticipants(currentImportId);
    await loadCommunity();
  }catch(e){console.error(e);toast(e.message||'No se pudo guardar la importación.',true);}
  finally{showLoading(false);}
}

async function loadImportParticipants(importId){
  currentImportId=importId;
  const {data,error}=await sb.rpc('admin_inteligencia_participantes',{p_importacion_id:importId});
  if(error){toast(error.message,true);return;}
  currentParticipants=data||[];renderMatching();
}
function renderMatching(){
  const matched=currentParticipants.filter(x=>['automatico','confirmado'].includes(x.match_status)).length;
  const pending=currentParticipants.filter(x=>x.match_status==='pendiente').length;
  $('matchSummary').textContent=`${matched} identificados · ${pending} pendientes`;
  $('matchingParticipants').innerHTML=currentParticipants.map(p=>{
    const ok=['automatico','confirmado'].includes(p.match_status), ignored=p.match_status==='ignorado';
    const badge=ok?`<span class="match ok">✓ ${safeText(p.integrante_nombre||'Identificado')}</span>`
      :ignored?'<span class="match ignored">Ignorado</span>':'<span class="match pending">⚠ Por identificar</span>';
    return `<div class="participant-row">
      <div class="participant-main"><strong>${safeText(p.alias_detectado)}</strong>
        <small>${p.active_days} día(s) · ${p.message_count} mensajes${p.telefono_detectado?' · '+safeText(p.telefono_detectado):''}</small>
        ${badge}
        ${p.match_status==='pendiente'?`<div class="actions">
          <button class="mini-btn" onclick="openResolve('${p.participante_id}')">Vincular integrante</button>
          <button class="mini-btn" onclick="ignoreParticipant('${p.participante_id}')">Ignorar</button>
        </div><div id="resolve-${p.participante_id}" class="resolve-box" hidden>
          <input id="resolve-input-${p.participante_id}" placeholder="Nombre, cédula o código…" style="width:100%;padding:10px;border:1px solid #dfe7ef;border-radius:10px">
          <div id="resolve-results-${p.participante_id}" class="resolve-results"></div>
        </div>`:''}
      </div><div class="participant-count"><b>${p.message_count}</b><small>mensajes</small></div>
    </div>`;
  }).join('');
  $('matchingSection').hidden=false;
  $('matchingSection').scrollIntoView({behavior:'smooth',block:'start'});
}
window.openResolve=function(id){
  const box=$('resolve-'+id);box.hidden=!box.hidden;
  if(box.hidden)return;
  const input=$('resolve-input-'+id);input.focus();
  const row=currentParticipants.find(x=>x.participante_id===id);
  const suggestion=String(row?.alias_detectado||'').replace(/^[A-Z]{2,4}\s*-\s*/i,'').replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();
  let timer;input.oninput=()=>{clearTimeout(timer);timer=setTimeout(()=>resolveSearch(id,input.value),250);};
  if(suggestion.length>=2){input.value=suggestion;resolveSearch(id,suggestion);}
};
async function resolveSearch(id,q){
  const box=$('resolve-results-'+id);if(!q||q.trim().length<2){box.innerHTML='';return;}
  const {data,error}=await sb.rpc('admin_buscar_integrantes',{p_q:q.trim(),p_limit:10});
  if(error){box.innerHTML='<small>No se pudo buscar.</small>';return;}
  box.innerHTML=(data||[]).map(p=>`<div class="resolve-person"><div><strong>${safeText(p.nombre)}</strong><small>${safeText(p.estado||'')}${p.cedula?' · '+safeText(p.cedula):''}</small></div>
  <button class="mini-btn" onclick="linkParticipant('${id}',${Number(p.id)})">Vincular</button></div>`).join('')||'<small>Sin coincidencias.</small>';
}
window.linkParticipant=async function(id,integranteId){
  showLoading(true);
  try{
    const {error}=await sb.rpc('admin_inteligencia_vincular',{p_participante_id:id,p_integrante_id:integranteId,p_recordar_alias:true});
    if(error)throw error;toast('Integrante vinculado. El alias quedó aprendido.');await loadImportParticipants(currentImportId);await loadCommunity();
  }catch(e){toast(e.message||'No se pudo vincular.',true);}finally{showLoading(false);}
};
window.ignoreParticipant=async function(id){
  if(!confirm('¿Ignorar este remitente en Inteligencia SST?'))return;
  const {error}=await sb.rpc('admin_inteligencia_ignorar',{p_participante_id:id});
  if(error){toast(error.message,true);return;}await loadImportParticipants(currentImportId);
};

async function loadPeople(q=''){
  const {data,error}=await sb.rpc('admin_inteligencia_personas',{p_q:q,p_limit:100});
  if(error){toast(error.message,true);return;}
  $('peopleList').innerHTML=(data||[]).length?(data||[]).map(p=>`
    <div class="person-row"><div class="person-main"><strong>${safeText(p.nombre)}</strong>
      <small>${p.mensajes} mensajes · ${p.dias_activos} días · ${p.temas} temas · ${p.preguntas} preguntas · ${p.aportes_tecnicos} aportes técnicos</small>
    </div><button onclick="openPerson(${Number(p.integrante_id)})">Ver perfil</button></div>`).join(''):'<div class="empty">No hay resultados.</div>';
}
window.openPerson=async function(id){
  showLoading(true);
  try{
    const {data,error}=await sb.rpc('admin_inteligencia_persona_detalle',{p_integrante_id:id});if(error)throw error;
    $('personName').textContent=data.nombre||'Integrante';
    const themes=(data.temas||[]).map(x=>({name:x.tema,count:x.cantidad}));
    const types=(data.tipos||[]).map(x=>({name:x.tipo,count:x.cantidad}));
    const norms=data.normas||[], recent=data.recientes||[];
    $('personDetail').innerHTML=`
      <div class="kpis">
        <div class="kpi"><span>Mensajes</span><strong>${Number(data.mensajes||0)}</strong></div>
        <div class="kpi"><span>Días activos</span><strong>${Number(data.dias_activos||0)}</strong></div>
        <div class="kpi"><span>Temas</span><strong>${themes.length}</strong></div>
      </div>
      <div class="detail-grid">
        <div class="panel"><div class="panel-head"><h2>Temas</h2></div><div id="personThemes" class="bars"></div></div>
        <div class="panel"><div class="panel-head"><h2>Tipo de participación</h2></div><div id="personTypes" class="bars"></div></div>
      </div>
      <div class="panel"><div class="panel-head"><h2>Normas mencionadas</h2></div>
        ${norms.length?norms.map(n=>`<span class="pill">${safeText(n.norma)} · ${n.cantidad}</span>`).join(' '):'<div class="empty">Sin normas detectadas.</div>'}
      </div>
      <div class="panel"><div class="panel-head"><h2>Mensajes recientes analizados</h2></div>
        <div class="participant-list">${recent.map(m=>`<div class="message-card"><small>${new Date(m.fecha).toLocaleString('es-VE')} · ${safeText(m.tema)} · ${safeText(m.tipo)}</small><p>${safeText(m.texto)}</p></div>`).join('')||'<div class="empty">Sin mensajes.</div>'}</div>
      </div>`;
    renderBars($('personThemes'),themes);renderBars($('personTypes'),types);
    $('personModal').hidden=false;document.body.style.overflow='hidden';
  }catch(e){toast(e.message,true);}finally{showLoading(false);}
};

async function loadImports(){
  const {data,error}=await sb.rpc('admin_inteligencia_importaciones_listar',{p_limit:100});if(error){toast(error.message,true);return;}
  $('importsList').innerHTML=(data||[]).length?(data||[]).map(i=>`
    <article class="import-card"><div><strong>${safeText(i.archivo_nombre)}</strong>
      <small>${Number(i.total_mensajes).toLocaleString('es')} mensajes · ${i.total_participantes} remitentes · ${i.identificados} identificados · ${i.pendientes} pendientes</small>
      <small>${i.periodo_desde?new Date(i.periodo_desde).toLocaleDateString('es-VE'):'—'} → ${i.periodo_hasta?new Date(i.periodo_hasta).toLocaleDateString('es-VE'):'—'} · ${safeText(i.estado)}</small>
    </div><div class="import-actions"><button class="btn secondary" onclick="reviewImport('${i.id}')">Revisar participantes</button></div></article>`).join(''):'<div class="empty">No hay importaciones todavía.</div>';
}
window.reviewImport=async function(id){
  switchView('import');await loadImportParticipants(id);
};

function switchView(name){
  document.querySelectorAll('.view').forEach(v=>v.hidden=true);
  $('view-'+name).hidden=false;
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.view===name));
  if(name==='community')loadCommunity();
  if(name==='people')loadPeople($('peopleSearch').value.trim());
  if(name==='imports')loadImports();
  window.scrollTo({top:0,behavior:'smooth'});
}

$('loginForm').addEventListener('submit',async e=>{
  e.preventDefault();showLoading(true);
  try{
    const {error}=await sb.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});
    if(error)throw error;if(await ensureAdmin())await loadCommunity();
  }catch(err){toast(err.message||'No se pudo iniciar sesión.',true);}finally{showLoading(false);}
});
$('logoutBtn').addEventListener('click',async()=>{await sb.auth.signOut();showLogin();});
$('refreshBtn').addEventListener('click',()=>{const active=document.querySelector('.tab.active')?.dataset.view||'community';switchView(active);});
document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>switchView(t.dataset.view)));
$('analyzeBtn').addEventListener('click',analyzeSelectedFile);
$('saveAnalysisBtn').addEventListener('click',saveAnalysis);
$('peopleSearchBtn').addEventListener('click',()=>loadPeople($('peopleSearch').value.trim()));
$('peopleSearch').addEventListener('keydown',e=>{if(e.key==='Enter')loadPeople(e.target.value.trim());});
$('closePersonModal').addEventListener('click',()=>{$('personModal').hidden=true;document.body.style.overflow='';});
$('personModal').addEventListener('click',e=>{if(e.target===$('personModal')){$('personModal').hidden=true;document.body.style.overflow='';}});

(async()=>{if(await ensureAdmin())await loadCommunity();})();