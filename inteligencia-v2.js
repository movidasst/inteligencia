const INTELIGENCIA_BUILD = 'v2.0.1-20261002';
const SUPABASE_URL = 'https://lfdmbkzghnwvsapxypvt.supabase.co';
const SUPABASE_KEY = 'sb_publishable_bRnkA6PA8-v073nrw9zxiQ_8rVGiOn1';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = id => document.getElementById(id);
let localAnalysis = null;
let analyticsState = null;
let neuralState = null;
let currentImportId = null;
let currentParticipants = [];
let savedSummary = null;
let graphSimulation = null;

function safeText(v){
  return String(v ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  }[c]));
}
function showLoading(v,title='Procesando…',subtitle=''){
  $('loading').hidden=!v;
  if(v){$('loadingText').textContent=title;$('loadingSubtext').textContent=subtitle||'';}
}
function toast(message,error=false){
  const t=$('toast');t.textContent=message;t.className='toast'+(error?' error':'');t.hidden=false;
  clearTimeout(t._timer);t._timer=setTimeout(()=>t.hidden=true,4200);
}
function fmtNumber(n){return Number(n||0).toLocaleString('es-VE');}
function fmtDateTime(v){
  try{return new Intl.DateTimeFormat('es-VE',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v));}
  catch{return String(v||'');}
}
function groupCount(rows,key){
  const m=new Map();
  rows.forEach(r=>{const v=r[key]||'Otros';m.set(v,(m.get(v)||0)+1);});
  return [...m.entries()].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count);
}
function renderBars(el,items,limit=10){
  items=(items||[]).slice(0,limit);
  if(!items.length){el.innerHTML='<div class="empty">Sin datos todavía.</div>';return;}
  const max=Math.max(...items.map(x=>Number(x.count??x.cantidad??0)),1);
  el.innerHTML=items.map(x=>{
    const name=x.name??x.tema??x.tipo??'Otros',count=Number(x.count??x.cantidad??0);
    return `<div class="bar-row"><label>${safeText(name)}</label><div class="bar-track"><div class="bar-fill" style="width:${Math.max(3,(count/max)*100)}%"></div></div><b>${count}</b></div>`;
  }).join('');
}
function normalizeAlias(value){
  return String(value||'')
    .normalize('NFD').replace(/\p{Diacritic}/gu,'')
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'')
    .toLowerCase().replace(/[^\p{L}\p{N}\s+.\-]/gu,' ')
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
  const raw=String(sender||'').trim(),digits=raw.replace(/\D/g,'');
  return (/^\+/.test(raw)||/^[\d\s()+\-]+$/.test(raw))&&digits.length>=10;
}
function toIso(day,month,year,hour,minute,second=0,ampm=null){
  let y=Number(year);if(y<100)y+=2000;
  let h=Number(hour);
  const ap=String(ampm||'').toLowerCase().replace(/\./g,'').replace(/\s/g,'');
  if((ap==='pm'||ap==='p')&&h!==12)h+=12;
  if((ap==='am'||ap==='a')&&h===12)h=0;
  const pad=n=>String(n).padStart(2,'0');
  return `${y}-${pad(month)}-${pad(day)}T${pad(h)}:${pad(minute)}:${pad(second)}-04:00`;
}
function parseStartLine(line){
  const clean=line.replace(/\u202f/g,' ').replace(/\u00a0/g,' ');
  let m=clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4}),\s*(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([ap])\.\s*m\.)?\s*-\s*(.*)$/i);
  if(m)return{day:+m[1],month:+m[2],year:+m[3],hour:+m[4],minute:+m[5],second:+(m[6]||0),ampm:m[7]||null,payload:m[8]||''};
  m=clean.match(/^\[(\d{1,2})\/(\d{1,2})\/(\d{2,4}),\s*(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?\]\s*(.*)$/i);
  if(m)return{day:+m[1],month:+m[2],year:+m[3],hour:+m[4],minute:+m[5],second:+(m[6]||0),ampm:m[7]||null,payload:m[8]||''};
  return null;
}

const TOPICS=[
  {name:'Ruido ocupacional',words:['ruido','decibel','dba','db(a)','sonometro','dosimetro','dosimetria','hipoacusia','audiometria','protector auditivo','nivel sonoro','leq']},
  {name:'Evaluación de riesgos',words:['evaluacion de riesgo','evaluar riesgo','matriz de riesgo','iperc','gtc 45','william fine','bowtie','peligro','consecuencia','exposicion','jerarquia de controles','ats','art']},
  {name:'Espacios confinados',words:['espacio confinado','tanque','atmosfera peligrosa','deficiencia de oxigeno','h2s','lel','permiso de entrada','rescate en espacio']},
  {name:'Sustancias químicas',words:['quimico','sustancia quimica','soda caustica','sosa caustica','acido','solvente','vapores','aerosol','polvo','silice','ficha de seguridad','sds','msds','toxicidad','mg/m3','ppm']},
  {name:'Ergonomía',words:['ergonomia','ergonomico','postura','levantamiento manual','manejo manual','carga fisica','repetitivo','musculoesquelet','rula','reba']},
  {name:'Riesgo psicosocial',words:['psicosocial','estres laboral','burnout','acoso laboral','salud mental','carga mental','violencia laboral','fatiga mental']},
  {name:'Trabajo en altura',words:['trabajo en altura','altura','arnes','linea de vida','andamio','escalera','caida de altura','anclaje','manlift']},
  {name:'Riesgo eléctrico',words:['electrico','electricidad','voltaje','tension electrica','arco electrico','lockout','tagout','loto','puesta a tierra']},
  {name:'Incendios y explosiones',words:['incendio','extintor','nfpa 10','fuego','explosion','inflamable','combustible','rociador','deteccion de incendio']},
  {name:'Radiaciones',words:['radiacion','radiologico','ionizante','dosimetria personal','rayos x','fuente radiactiva','proteccion radiologica','geiger','osr']},
  {name:'Higiene ocupacional',words:['higiene ocupacional','higiene industrial','muestreo','exposicion ocupacional','limite permisible','tlv','oel','ventilacion industrial','agente fisico','agente quimico','muestra respirable','gravimetrico']},
  {name:'Salud ocupacional',words:['salud ocupacional','vigilancia de la salud','medicina ocupacional','enfermedad ocupacional','enfermedad laboral','aptitud medica','epidemiologia']},
  {name:'Investigación de accidentes',words:['accidente','incidente','investigacion de accidente','causa raiz','arbol de causas','evento no deseado','casi accidente']},
  {name:'Emergencias',words:['emergencia','plan de emergencia','evacuacion','simulacro','primeros auxilios','brigada','respuesta a emergencia']},
  {name:'EPP',words:['epp','equipo de proteccion personal','proteccion respiratoria','respirador','casco','guante','gafa de seguridad','protector facial']},
  {name:'Gestión SST',words:['sistema de gestion','sgsst','seguridad y salud en el trabajo','liderazgo','comite de seguridad','programa de seguridad','45001','45002','permiso de trabajo','supervisor','procedimiento de trabajo seguro','pts']},
  {name:'Legislación y normativa',words:['ley','reglamento','norma','covenin','iso ','nfpa','osha','niosh','iec','asme','ansi','lopcymat','inpsasel','geresat','providencia','articulo']},
  {name:'Medio ambiente',words:['medio ambiente','ambiental','iso 14001','residuo','emision','impacto ambiental','aspecto ambiental','contaminacion']}
];
const SUBTOPICS=[
  ['Dosimetría de ruido',['dosimetro','dosimetria','dosis de ruido']],
  ['Audiometrías',['audiometria','audiometrico','hipoacusia']],
  ['Protectores auditivos',['protector auditivo','orejera','tapon auditivo']],
  ['Jerarquía de controles',['jerarquia de controles','eliminacion','sustitucion','control de ingenieria']],
  ['Atmósferas peligrosas',['h2s','lel','oxigeno','atmosfera peligrosa','multigas']],
  ['Protección respiratoria',['respirador','proteccion respiratoria','filtro','cartucho']],
  ['Muestreo de aerosoles',['muestreo','aerosol','gravimetrico','polvo respirable','mg/m3']],
  ['Permisos de trabajo',['permiso de trabajo','pts','ats','art','trabajo en caliente','trabajo en frio']],
  ['Incendios - extintores',['extintor','nfpa 10']],
  ['Ergonomía física',['postura','levantamiento manual','reba','rula']],
  ['Salud mental',['salud mental','burnout','estres laboral']],
  ['Trabajo seguro con energías',['loto','lockout','tagout','aislamiento de energia']]
];
function extractNorms(text){
  const rx=/\b(?:ISO(?:\/DIS|\/AWI)?\s*\d{3,6}(?::\d{4})?|COVENIN\s*\d{2,5}(?::\d{4})?|NFPA\s*\d{1,4}(?::\d{4})?|OSHA\s*[\d.]+|NIOSH\s*\d+|IEC\s*\d{3,6}|GTC\s*45|ASME\s+[A-Z0-9.\-]+|ANSI\s+[A-Z0-9.\-]+|LOPCYMAT)\b/gi;
  return [...new Set((String(text).match(rx)||[]).map(x=>x.replace(/\s+/g,' ').trim().toUpperCase()))].slice(0,10);
}
function classifyMessage(text){
  const raw=String(text||'').trim(),n=normalizeForSearch(raw);
  let best='Otros',bestScore=0,matched=[];
  for(const topic of TOPICS){
    let score=0,kws=[];
    for(const w of topic.words){
      const wn=normalizeForSearch(w);
      if(n.includes(wn)){score+=wn.length>10?2:1;kws.push(w);}
    }
    if(score>bestScore){bestScore=score;best=topic.name;matched=kws;}
  }
  let subtema=null;
  for(const [name,words] of SUBTOPICS){
    if(words.some(w=>n.includes(normalizeForSearch(w)))){subtema=name;break;}
  }
  const norms=extractNorms(raw);
  const isQuestion=/\?/.test(raw)||/^(que|qué|como|cómo|cuando|cuándo|cual|cuál|donde|dónde|por que|por qué|alguien sabe|consulta|una pregunta)\b/i.test(raw);
  const isCase=/\b(en mi empresa|en nuestra empresa|nos paso|nos pasó|tuvimos|ocurrio|ocurrió|caso real|en planta|en obra|en el trabajo|donde laboro)\b/i.test(raw);
  const isResource=/(https?:\/\/|www\.)/i.test(raw)||/\b(comparto|les comparto|adjunto|documento|enlace|archivo|manual|guia|guía)\b/i.test(raw);
  const technical=best!=='Otros'||norms.length>0||/\b(riesgo|peligro|exposicion|exposición|control|prevencion|prevención|procedimiento|medicion|medición|muestreo|permiso)\b/i.test(raw);
  let tipo='Aporte / comentario';
  if(isQuestion)tipo='Pregunta';
  else if(isCase)tipo='Caso real';
  else if(isResource)tipo='Recurso compartido';
  else if(norms.length)tipo='Referencia normativa';
  else if(technical&&raw.split(/\s+/).length>=10)tipo='Aporte técnico';
  else if(raw.split(/\s+/).length<=5&&/^(hola|buenos dias|buen día|buenas|gracias|excelente|saludos|feliz|ok)\b/i.test(raw))tipo='Conversación general';
  return {tema:best,subtema,tipo_participacion:tipo,normas:norms,palabras_clave:[...new Set(matched)].slice(0,8),clasificacion_fuente:'reglas_v2'};
}
function cleanMessageContent(content){
  let t=String(content||'');
  t=t.replace(/<multimedia omitido>/ig,' ');
  t=t.replace(/[^\n]*\.(jpg|jpeg|png|webp|gif|opus|mp3|mp4|pdf|docx?|xlsx?|vcf)\s*\(archivo adjunto\)/ig,' ');
  t=t.replace(/\(archivo adjunto\)/ig,' ');
  return t.replace(/<Se editó este mensaje\.?>/ig,' ').replace(/\s+/g,' ').trim();
}
function parseWhatsappExport(text,ignoredRaw=''){
  const normalized=String(text||'').replace(/\u202f/g,' ').replace(/\u00a0/g,' ').replace(/\r\n?/g,'\n');
  const ignored=new Set(String(ignoredRaw||'').split(',').map(normalizeAlias).filter(Boolean));
  const rawLines=normalized.split('\n');
  const events=[];let current=null;
  for(const rawLine of rawLines){
    const p=parseStartLine(rawLine);
    if(p){if(current)events.push(current);current=p;}
    else if(current){current.payload+='\n'+rawLine;}
  }
  if(current)events.push(current);

  const deleted=[/^eliminaste este mensaje\.?$/i,/^se elimin[oó] este mensaje\.?$/i,/^este mensaje fue eliminado\.?$/i];
  const participants=new Map(),messages=[];
  let index=0,minIso=null,maxIso=null,systemEvents=0,mediaOnly=0,ignoredCount=0;

  for(const ev of events){
    const sm=(ev.payload||'').match(/^([^:\n]+?):(?:\s?)([\s\S]*)$/);
    if(!sm){systemEvents++;continue;}
    const sender=sm[1].trim().replace(/^[\u200e\u200f\u202a-\u202e\u2066-\u2069]+/g,'').trim();
    const content=(sm[2]||'').trim(),senderNorm=normalizeAlias(sender);
    if(!senderNorm||ignored.has(senderNorm)){ignoredCount++;continue;}
    if(!content||deleted.some(r=>r.test(content.trim())))continue;
    const hasMedia=/<multimedia omitido>|\(archivo adjunto\)/i.test(content);
    const textPart=cleanMessageContent(content);
    if(!textPart&&hasMedia){mediaOnly++;}
    if(!textPart&&!hasMedia)continue;
    const iso=toIso(ev.day,ev.month,ev.year,ev.hour,ev.minute,ev.second,ev.ampm);
    const dateKey=iso.slice(0,10);
    if(!minIso||iso<minIso)minIso=iso;if(!maxIso||iso>maxIso)maxIso=iso;

    let p=participants.get(senderNorm);
    if(!p){
      p={alias_detectado:sender,alias_normalizado:senderNorm,telefono_detectado:looksLikePhoneSender(sender)?normalizeDetectedPhone(sender):null,
        message_count:0,days:new Set(),first_message_at:iso,last_message_at:iso};
      participants.set(senderNorm,p);
    }
    p.message_count++;p.days.add(dateKey);if(iso<p.first_message_at)p.first_message_at=iso;if(iso>p.last_message_at)p.last_message_at=iso;

    if(textPart){
      const c=classifyMessage(textPart);
      messages.push({source_index:index++,sent_at:iso,alias_detectado:sender,alias_normalizado:senderNorm,texto:textPart,...c});
    }
  }

  for(let i=1;i<messages.length;i++){
    const prev=messages[i-1],cur=messages[i];
    const gap=(new Date(cur.sent_at)-new Date(prev.sent_at))/60000;
    if(prev.tipo_participacion==='Pregunta'&&gap>=0&&gap<=30&&cur.tipo_participacion==='Aporte técnico'){
      cur.tipo_participacion='Respuesta técnica';
    }
  }

  const details=[...participants.values()].map(p=>({
    alias_detectado:p.alias_detectado,alias_normalizado:p.alias_normalizado,telefono_detectado:p.telefono_detectado,
    message_count:p.message_count,active_days:p.days.size,first_message_at:p.first_message_at,last_message_at:p.last_message_at
  })).sort((a,b)=>b.message_count-a.message_count);

  return {details,messages,periodStart:minIso,periodEnd:maxIso,totalParticipants:details.length,totalMessages:messages.length,
    rawEvents:events.length,systemEvents,mediaOnly,ignoredCount};
}
async function sha256Text(text){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
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

function renderKpis(el,items){
  el.innerHTML=items.map(x=>`<div class="kpi"><span>${safeText(x.label)}</span><strong>${safeText(x.value)}</strong><small>${safeText(x.note||'')}</small></div>`).join('');
}
function renderTimeline(el,timeline){
  const data=timeline?.totals||[];
  if(!data.length){el.className='chart-stage empty-stage';el.textContent='Sin datos todavía.';return;}
  el.className='chart-stage';
  const w=Math.max(el.clientWidth||800,500),h=260,p={l:38,r:16,t:18,b:34};
  const max=Math.max(...data.map(d=>d.count),1);
  const x=i=>p.l+(i/(Math.max(data.length-1,1)))*(w-p.l-p.r);
  const y=v=>h-p.b-(v/max)*(h-p.t-p.b);
  const points=data.map((d,i)=>[x(i),y(d.count)]);
  const path=points.map((pt,i)=>(i?'L':'M')+pt[0].toFixed(1)+','+pt[1].toFixed(1)).join(' ');
  const area=`M ${x(0)},${h-p.b} `+points.map(pt=>`L ${pt[0]},${pt[1]}`).join(' ')+` L ${x(data.length-1)},${h-p.b} Z`;
  const grid=[0,.25,.5,.75,1].map(f=>{
    const yy=y(max*f);return `<line class="line-grid" x1="${p.l}" y1="${yy}" x2="${w-p.r}" y2="${yy}"/><text class="axis-label" x="4" y="${yy+3}">${Math.round(max*f)}</text>`;
  }).join('');
  const labels=data.map((d,i)=>{
    if(data.length>12 && i%Math.ceil(data.length/7)!==0 && i!==data.length-1)return '';
    return `<text class="axis-label" text-anchor="middle" x="${x(i)}" y="${h-8}">${d.date.slice(5)}</text>`;
  }).join('');
  el.innerHTML=`<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${grid}<path class="area-path" d="${area}"/><path class="line-path" d="${path}"/>${points.map(pt=>`<circle class="dot-path" cx="${pt[0]}" cy="${pt[1]}" r="3"/>`).join('')}${labels}</svg>`;
}
function renderEmerging(el,items){
  if(!items?.length){el.innerHTML='<div class="empty">Aún no hay suficientes días para detectar cambios.</div>';return;}
  el.innerHTML=items.map(x=>{
    const pct=Math.round(x.growth*100),down=pct<0;
    return `<div class="signal ${down?'down':''}"><div><strong>${safeText(x.topic)}</strong><small>${x.previous} → ${x.recent} intervenciones entre periodos</small></div><b>${pct>=0?'+':''}${pct}%</b></div>`;
  }).join('');
}
function conversationCard(c,expanded=false){
  const when=c.start?new Intl.DateTimeFormat('es-VE',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(c.start):'';
  const excerpt=String(c.excerpt||'').slice(0,expanded?420:220);
  return `<article class="conversation-card"><div class="conversation-top"><div><h3>${safeText(c.topic)}${c.subtopic?' · '+safeText(c.subtopic):''}</h3><p>${safeText(excerpt)}${String(c.excerpt||'').length>excerpt.length?'…':''}</p></div><span class="density">${Math.round(c.density*100)}% densidad técnica</span></div><div class="conversation-meta"><span>${safeText(when)}</span><span>${c.count} mensajes</span><span>${c.people} participantes</span><span>${c.questions} preguntas</span><span>${c.technical} aportes técnicos</span>${(c.norms||[]).slice(0,3).map(n=>`<span>${safeText(n)}</span>`).join('')}</div></article>`;
}
function renderConversations(){
  const rows=analyticsState?.conversations||[];
  $('conversationList').innerHTML=rows.length?rows.slice(0,40).map(c=>conversationCard(c,true)).join(''):'<div class="empty">Carga un chat para detectar conversaciones.</div>';
  const avg=rows.length?rows.reduce((s,x)=>s+x.count,0)/rows.length:0;
  const technical=rows.filter(x=>x.density>=.35).length;
  renderKpis($('conversationStats'),[
    {label:'Conversaciones',value:rows.length,note:'secuencias detectadas'},
    {label:'Densidad técnica',value:technical,note:'con ≥35% de aportes técnicos'},
    {label:'Promedio',value:avg.toFixed(1),note:'mensajes por conversación'},
    {label:'Preguntas',value:rows.reduce((s,x)=>s+x.questions,0),note:'dentro de conversaciones'}
  ]);
}
function renderSemantic(){
  const clusters=neuralState?.clusters||analyticsState?.clusters||[];
  $('clusterCount').textContent=`${clusters.length} grupos`;
  $('semanticClusters').innerHTML=clusters.length?clusters.map((c,i)=>`
    <article class="cluster-card"><h3>${i+1}. ${safeText(c.topic)}</h3>
      <p>${c.count} mensajes · ${c.people} personas · predominio: ${safeText(c.type)}</p>
      <div class="cluster-tags">${(c.tokens||[]).map(t=>`<span>${safeText(t)}</span>`).join('')}</div>
      <div class="cluster-sample">${safeText(String(c.sample||'').slice(0,250))}${String(c.sample||'').length>250?'…':''}</div>
    </article>`).join(''):'<div class="empty">Carga un chat para ejecutar clustering semántico.</div>';
  const terms=analyticsState?.topTerms||[];
  $('topTerms').innerHTML=terms.length?terms.slice(0,32).map(t=>`<span title="Aparece en ${t.df} mensajes">${safeText(t.term)}</span>`).join(''):'<div class="empty">Sin términos.</div>';
}
function renderHeatmap(){
  const pt=analyticsState?.graph?.personTopic;
  if(!pt){$('peopleTopicHeatmap').innerHTML='<div class="empty">Carga un chat para construir la matriz.</div>';$('peopleCards').innerHTML='';return;}
  const people=pt.people.slice(0,18),topics=pt.topics.slice(0,10);
  let max=1;
  people.forEach(p=>topics.forEach(t=>{max=Math.max(max,pt.matrix.get(p.name+'|||'+t.topic)||0);}));
  const cls=v=>!v?'':v/max<=.2?'h1':v/max<=.4?'h2':v/max<=.6?'h3':v/max<=.8?'h4':'h5';
  $('peopleTopicHeatmap').innerHTML=`<table class="heatmap"><thead><tr><th>Integrante / remitente</th>${topics.map(t=>`<th>${safeText(t.topic)}</th>`).join('')}</tr></thead><tbody>${people.map(p=>`<tr><td class="person-cell">${safeText(p.name)}</td>${topics.map(t=>{const v=pt.matrix.get(p.name+'|||'+t.topic)||0;return `<td class="${cls(v)}" title="${safeText(p.name)} · ${safeText(t.topic)}: ${v}">${v||''}</td>`;}).join('')}</tr>`).join('')}</tbody></table>`;
  $('peopleCards').innerHTML=people.slice(0,12).map(p=>{
    const vals=topics.map(t=>pt.matrix.get(p.name+'|||'+t.topic)||0);
    const pmax=Math.max(...vals,1);
    const related=topics.map((t,i)=>({topic:t.topic,count:vals[i]})).filter(x=>x.count).sort((a,b)=>b.count-a.count).slice(0,3);
    return `<article class="profile-card"><strong>${safeText(p.name)}</strong><small>${p.total} intervenciones · ${related.length?related.map(x=>x.topic).join(' · '):'sin tema dominante'}</small><div class="mini-bars">${vals.map(v=>`<i style="height:${Math.max(3,(v/pmax)*44)}px" title="${v}"></i>`).join('')}</div></article>`;
  }).join('');
}
function renderRankLists(){
  const g=analyticsState?.graph;
  if(!g){$('connectorPeople').innerHTML=$('connectedTopics').innerHTML='<div class="empty">Sin datos.</div>';return;}
  $('connectorPeople').innerHTML=g.connectors.slice(0,10).map((x,i)=>`<div class="rank-row"><i>${i+1}</i><div><strong>${safeText(x.name)}</strong><small>${x.total} intervenciones relacionadas</small></div><b>${x.topics} temas</b></div>`).join('');
  $('connectedTopics').innerHTML=g.connectedTopics.slice(0,10).map((x,i)=>`<div class="rank-row"><i>${i+1}</i><div><strong>${safeText(x.name)}</strong><small>${x.total} intervenciones</small></div><b>${x.people} personas</b></div>`).join('');
}
function renderGraph(){
  const stage=$('knowledgeGraph'),g=analyticsState?.graph;
  stage.innerHTML='';
  if(!g||!g.nodes.length||!window.d3){stage.innerHTML='<div class="empty">Carga un chat para construir el grafo.</div>';return;}
  if(graphSimulation)graphSimulation.stop();
  const width=Math.max(stage.clientWidth||900,500),height=Math.max(stage.clientHeight||590,420);
  const svg=d3.select(stage).append('svg').attr('viewBox',[0,0,width,height]);
  const root=svg.append('g');
  svg.call(d3.zoom().scaleExtent([.55,2.8]).on('zoom',e=>root.attr('transform',e.transform)));
  const nodes=g.nodes.map(d=>({...d})),links=g.edges.map(d=>({...d}));
  const maxEdge=Math.max(...links.map(x=>x.count),1);
  const link=root.append('g').attr('stroke','#b9c8d7').attr('stroke-opacity',.58)
    .selectAll('line').data(links).join('line').attr('stroke-width',d=>1+(d.count/maxEdge)*5);
  const node=root.append('g').selectAll('g').data(nodes).join('g').style('cursor','grab');
  node.append('circle')
    .attr('r',d=>d.type==='topic'?Math.min(28,14+Math.sqrt(d.weight)*1.5):Math.min(20,9+Math.sqrt(d.weight)))
    .attr('fill',d=>d.type==='topic'?'#00205b':'#007b85')
    .attr('stroke','#fff').attr('stroke-width',2);
  node.append('text').attr('class','graph-label').attr('x',d=>d.type==='topic'?18:13).attr('y',4)
    .attr('font-size',d=>d.type==='topic'?11:9).attr('font-weight',d=>d.type==='topic'?800:650).attr('fill','#31465e')
    .text(d=>d.label.length>28?d.label.slice(0,27)+'…':d.label);
  let tip=document.querySelector('.graph-tooltip');
  if(!tip){tip=document.createElement('div');tip.className='graph-tooltip';tip.hidden=true;document.body.appendChild(tip);}
  node.on('mouseenter',(e,d)=>{tip.hidden=false;tip.innerHTML=`<b>${safeText(d.label)}</b><br>${d.weight} intervenciones`;})
      .on('mousemove',e=>{tip.style.left=(e.clientX+12)+'px';tip.style.top=(e.clientY+12)+'px';})
      .on('mouseleave',()=>tip.hidden=true);

  graphSimulation=d3.forceSimulation(nodes)
    .force('link',d3.forceLink(links).id(d=>d.id).distance(d=>d.count>5?75:105).strength(.5))
    .force('charge',d3.forceManyBody().strength(-190))
    .force('center',d3.forceCenter(width/2,height/2))
    .force('collision',d3.forceCollide().radius(d=>d.type==='topic'?34:24))
    .on('tick',()=>{
      link.attr('x1',d=>d.source.x).attr('y1',d=>d.source.y).attr('x2',d=>d.target.x).attr('y2',d=>d.target.y);
      node.attr('transform',d=>`translate(${d.x},${d.y})`);
    });
  node.call(d3.drag().on('start',(e,d)=>{if(!e.active)graphSimulation.alphaTarget(.3).restart();d.fx=d.x;d.fy=d.y;})
    .on('drag',(e,d)=>{d.fx=e.x;d.fy=e.y;})
    .on('end',(e,d)=>{if(!e.active)graphSimulation.alphaTarget(0);d.fx=null;d.fy=null;}));
}
function renderDashboard(){
  const messages=analyticsState?.messages||[];
  if(!messages.length){
    renderKpis($('dashboardKpis'),[
      {label:'Mensajes',value:savedSummary?.mensajes||0,note:'guardados'},
      {label:'Integrantes',value:savedSummary?.integrantes_activos||0,note:'identificados'},
      {label:'Preguntas',value:savedSummary?.preguntas||0,note:'detectadas'},
      {label:'Aportes técnicos',value:savedSummary?.aportes_tecnicos||0,note:'clasificados'},
      {label:'Clusters',value:'—',note:'carga un chat'}
    ]);
    $('dashboardThemes').innerHTML='<div class="empty">Carga un chat para activar el análisis.</div>';
    $('dashboardTypes').innerHTML='<div class="empty">Carga un chat para activar el análisis.</div>';
    $('activityTimeline').className='chart-stage empty-stage';$('activityTimeline').textContent='Carga un chat para ver la evolución.';
    $('emergingTopics').innerHTML='<div class="empty">Sin datos temporales.</div>';
    $('dashboardConversations').innerHTML='<div class="empty">Sin conversaciones analizadas.</div>';
    return;
  }
  const people=new Set(messages.map(m=>m.integrante_nombre||m.alias_detectado).filter(Boolean));
  const questions=messages.filter(m=>m.tipo_participacion==='Pregunta').length;
  const technical=messages.filter(m=>['Aporte técnico','Respuesta técnica','Referencia normativa','Caso real'].includes(m.tipo_participacion)).length;
  renderKpis($('dashboardKpis'),[
    {label:'Mensajes analizados',value:fmtNumber(messages.length),note:'con contenido de texto'},
    {label:'Participantes',value:fmtNumber(people.size),note:'remitentes observados'},
    {label:'Preguntas',value:fmtNumber(questions),note:((questions/messages.length)*100).toFixed(1)+'% del chat'},
    {label:'Aportes técnicos',value:fmtNumber(technical),note:((technical/messages.length)*100).toFixed(1)+'% del chat'},
    {label:'Clusters semánticos',value:analyticsState.clusters.length,note:'descubiertos por algoritmo'}
  ]);
  $('dashboardSubtitle').textContent=localAnalysis?`${localAnalysis.fileName} · ${localAnalysis.periodStart?.slice(0,10)||''} → ${localAnalysis.periodEnd?.slice(0,10)||''}`:'Datos guardados de Inteligencia SST';
  renderTimeline($('activityTimeline'),analyticsState.timeline);
  renderEmerging($('emergingTopics'),analyticsState.emerging);
  renderBars($('dashboardThemes'),groupCount(messages,'tema'),9);
  renderBars($('dashboardTypes'),groupCount(messages,'tipo_participacion'),9);
  $('dashboardConversations').innerHTML=(analyticsState.conversations||[]).slice(0,5).map(c=>conversationCard(c,false)).join('')||'<div class="empty">No se detectaron conversaciones suficientemente densas.</div>';
}
function renderAllAnalytics(){
  renderDashboard();
  renderSemantic();
  renderConversations();
  renderHeatmap();
  renderRankLists();
  if(!$('view-network').hidden)renderGraph();
  $('neuralBtn').disabled=false;
}
function renderAnalysisPreview(){
  const a=localAnalysis,m=a.messages;
  renderKpis($('analysisKpis'),[
    {label:'Eventos WhatsApp',value:fmtNumber(a.rawEvents),note:'líneas fechadas detectadas'},
    {label:'Mensajes con texto',value:fmtNumber(a.totalMessages),note:'entran al análisis'},
    {label:'Remitentes',value:fmtNumber(a.totalParticipants),note:'antes del cruce'},
    {label:'Preguntas',value:fmtNumber(m.filter(x=>x.tipo_participacion==='Pregunta').length),note:'detectadas'},
    {label:'Aportes técnicos',value:fmtNumber(m.filter(x=>['Aporte técnico','Respuesta técnica','Referencia normativa','Caso real'].includes(x.tipo_participacion)).length),note:'señal técnica'}
  ]);
  renderBars($('analysisThemes'),groupCount(m,'tema'),12);
  renderBars($('analysisTypes'),groupCount(m,'tipo_participacion'),10);
  $('qualityStrip').innerHTML=[
    ['Eventos de sistema',a.systemEvents,'uniones, salidas y cambios del grupo'],
    ['Solo multimedia',a.mediaOnly,'sin texto aprovechable'],
    ['Remitentes ignorados',a.ignoredCount,'bots o exclusiones'],
    ['Mensajes semánticos',analyticsState?.semanticMessages?.length||0,'usados para clustering']
  ].map(([label,value,note])=>`<div class="quality-item"><b>${value}</b><span>${safeText(label)} · ${safeText(note)}</span></div>`).join('');
  $('participantCount').textContent=`${a.details.length} remitentes`;
  $('previewParticipants').innerHTML=a.details.slice(0,120).map(p=>`<div class="participant-row"><div class="participant-main"><strong>${safeText(p.alias_detectado)}</strong><small>${p.active_days} día(s) activo(s)${p.telefono_detectado?' · teléfono detectado':''}</small></div><div class="participant-count"><b>${p.message_count}</b><small>mensajes</small></div></div>`).join('');
  $('analysisTitle').textContent=a.fileName;
  $('analysisMeta').textContent=`${a.totalMessages} mensajes con texto · ${a.totalParticipants} remitentes · ${analyticsState.clusters.length} grupos semánticos`;
  $('analysisResults').hidden=false;
}
async function analyzeSelectedFile(){
  const file=$('whatsappFile').files[0];
  if(!file){toast('Selecciona un archivo .txt.',true);return;}
  if(!/\.txt$/i.test(file.name)){toast('El archivo debe ser .txt.',true);return;}
  showLoading(true,'Leyendo WhatsApp…','Separando mensajes, participantes y eventos del sistema.');
  try{
    const text=await file.text(),parsed=parseWhatsappExport(text,$('ignoredSenders').value);
    if(!parsed.details.length||!parsed.messages.length)throw new Error('No se detectaron mensajes de participantes en el archivo.');
    parsed.fileName=file.name;parsed.fileHash=await sha256Text(text);
    localAnalysis=parsed;
    showLoading(true,'Construyendo vectores…','TF-IDF, similitud coseno, clustering y análisis de redes.');
    analyticsState=SSTAnalytics.prepare(parsed.messages);
    neuralState=null;
    $('engineName').textContent='TF-IDF + K-means';$('engineDetail').textContent='Motor local activo';
    $('semanticEngineLabel').textContent='TF-IDF + K-means';$('semanticEngineCaption').textContent='vectorización local';
    renderAnalysisPreview();renderAllAnalytics();
    switchView('dashboard');
    toast(`Análisis completado: ${parsed.totalMessages} mensajes y ${analyticsState.clusters.length} clusters.`);
  }catch(e){console.error(e);toast(`${INTELIGENCIA_BUILD} · ${e.message||'No se pudo analizar el archivo.'}`,true);}
  finally{showLoading(false);}
}
async function runNeural(){
  if(!analyticsState?.messages?.length)return;
  if(!confirm('El modo neuronal descargará un modelo multilingüe al navegador. La primera ejecución puede consumir más de 100 MB y tardar varios minutos. ¿Continuar?'))return;
  $('neuralBtn').disabled=true;
  try{
    neuralState=await SSTAnalytics.neuralCluster(analyticsState.messages,(title,sub)=>showLoading(true,title,sub));
    $('engineName').textContent='MiniLM neuronal';$('engineDetail').textContent='Embeddings multilingües activos';
    $('semanticEngineLabel').textContent='MiniLM neuronal';$('semanticEngineCaption').textContent='embeddings multilingües';
    renderSemantic();switchView('semantic');
    toast(`Análisis neuronal listo sobre ${neuralState.rows.length} mensajes representativos.`);
  }catch(e){console.error(e);toast('No se pudo cargar el modelo neuronal. El análisis TF-IDF sigue disponible. '+(e.message||''),true);}
  finally{showLoading(false);$('neuralBtn').disabled=false;}
}
function semanticSearch(){
  const q=$('semanticSearchInput').value.trim();
  if(!q){toast('Escribe una idea o pregunta para buscar.',true);return;}
  if(!analyticsState){toast('Primero analiza un chat.',true);return;}
  const rows=SSTAnalytics.search(analyticsState,q,18);
  $('searchMeta').textContent=`${rows.length} mensajes similares · motor TF-IDF/coseno · la similitud no implica corrección técnica`;
  $('semanticSearchResults').innerHTML=rows.length?rows.map(x=>{
    const m=x.message,person=m.integrante_nombre||m.alias_detectado||'Remitente';
    return `<article class="search-result"><div><strong>${safeText(person)} · ${safeText(m.tema)}</strong><p>${safeText(m.texto)}</p><small>${safeText(fmtDateTime(m.sent_at))} · ${safeText(m.tipo_participacion)}</small></div><span class="similarity">${Math.round(x.similarity*100)}% similar</span></article>`;
  }).join(''):'<div class="empty">No se encontraron mensajes suficientemente similares.</div>';
}
async function saveAnalysis(){
  if(!localAnalysis)return;
  showLoading(true,'Guardando análisis…','Creando la importación y cruzando aliases conocidos.');
  try{
    const a=localAnalysis;
    const {data,error}=await sb.rpc('admin_inteligencia_importacion_crear',{
      p_archivo_nombre:a.fileName,p_archivo_hash:a.fileHash,p_periodo_desde:a.periodStart,p_periodo_hasta:a.periodEnd,p_participantes:a.details
    });
    if(error)throw error;
    currentImportId=data.importacion_id;
    const batchSize=120;
    for(let i=0;i<a.messages.length;i+=batchSize){
      showLoading(true,'Guardando mensajes…',`${Math.min(i+batchSize,a.messages.length)}/${a.messages.length}`);
      const {error:batchError}=await sb.rpc('admin_inteligencia_mensajes_lote',{p_importacion_id:currentImportId,p_mensajes:a.messages.slice(i,i+batchSize)});
      if(batchError)throw batchError;
    }
    const {error:finishError}=await sb.rpc('admin_inteligencia_importacion_finalizar',{p_importacion_id:currentImportId});
    if(finishError)throw finishError;
    toast(data.existente?'El archivo ya existía; se revisó la importación.':'Chat guardado en Inteligencia SST.');
    await loadImportParticipants(currentImportId);
    await loadSavedSummary();
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
    const ok=['automatico','confirmado'].includes(p.match_status),ignored=p.match_status==='ignorado';
    const badge=ok?`<span class="match ok">✓ ${safeText(p.integrante_nombre||'Identificado')}</span>`:ignored?'<span class="match ignored">Ignorado</span>':'<span class="match pending">⚠ Por identificar</span>';
    return `<div class="participant-row"><div class="participant-main"><strong>${safeText(p.alias_detectado)}</strong><small>${p.active_days} día(s) · ${p.message_count} mensajes${p.telefono_detectado?' · '+safeText(p.telefono_detectado):''}</small>${badge}
      ${p.match_status==='pendiente'?`<div class="actions"><button class="mini-btn" onclick="openResolve('${p.participante_id}')">Vincular integrante</button><button class="mini-btn" onclick="ignoreParticipant('${p.participante_id}')">Ignorar</button></div><div id="resolve-${p.participante_id}" class="resolve-box" hidden><input id="resolve-input-${p.participante_id}" placeholder="Nombre, cédula o código…"><div id="resolve-results-${p.participante_id}" class="resolve-results"></div></div>`:''}
      </div><div class="participant-count"><b>${p.message_count}</b><small>mensajes</small></div></div>`;
  }).join('');
  $('matchingSection').hidden=false;
  switchView('analyze');
  $('matchingSection').scrollIntoView({behavior:'smooth',block:'start'});
}
window.openResolve=function(id){
  const box=$('resolve-'+id);box.hidden=!box.hidden;if(box.hidden)return;
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
  box.innerHTML=(data||[]).map(p=>`<div class="resolve-person"><div><strong>${safeText(p.nombre)}</strong><small>${safeText(p.estado||'')}${p.cedula?' · '+safeText(p.cedula):''}</small></div><button class="mini-btn" onclick="linkParticipant('${id}',${Number(p.id)})">Vincular</button></div>`).join('')||'<small>Sin coincidencias.</small>';
}
window.linkParticipant=async function(id,integranteId){
  showLoading(true,'Vinculando integrante…','El alias quedará disponible para próximas importaciones.');
  try{
    const {error}=await sb.rpc('admin_inteligencia_vincular',{p_participante_id:id,p_integrante_id:integranteId,p_recordar_alias:true});
    if(error)throw error;toast('Integrante vinculado y alias aprendido.');await loadImportParticipants(currentImportId);await loadSavedSummary();
  }catch(e){toast(e.message||'No se pudo vincular.',true);}finally{showLoading(false);}
};
window.ignoreParticipant=async function(id){
  if(!confirm('¿Ignorar este remitente en Inteligencia SST?'))return;
  const {error}=await sb.rpc('admin_inteligencia_ignorar',{p_participante_id:id});
  if(error){toast(error.message,true);return;}await loadImportParticipants(currentImportId);
};
async function loadImports(){
  const {data,error}=await sb.rpc('admin_inteligencia_importaciones_listar',{p_limit:100});
  if(error){toast(error.message,true);return;}
  $('importsList').innerHTML=(data||[]).length?(data||[]).map(i=>`<article class="import-card"><div><strong>${safeText(i.archivo_nombre)}</strong><small>${fmtNumber(i.total_mensajes)} mensajes · ${i.total_participantes} remitentes · ${i.identificados} identificados · ${i.pendientes} pendientes</small><small>${i.periodo_desde?new Date(i.periodo_desde).toLocaleDateString('es-VE'):'—'} → ${i.periodo_hasta?new Date(i.periodo_hasta).toLocaleDateString('es-VE'):'—'} · ${safeText(i.estado)}</small></div><button class="btn secondary" onclick="reviewImport('${i.id}')">Revisar</button></article>`).join(''):'<div class="empty">No hay importaciones guardadas todavía.</div>';
}
window.reviewImport=async function(id){await loadImportParticipants(id);};
async function loadSavedSummary(){
  const {data,error}=await sb.rpc('admin_inteligencia_resumen');
  if(error)return;
  savedSummary=data||{};
  if(!analyticsState)renderDashboard();
}
async function loadSavedDataset(){
  if(analyticsState)return true;
  showLoading(true,'Cargando memoria…','Recuperando mensajes guardados para el análisis avanzado.');
  try{
    const {data,error}=await sb.rpc('admin_inteligencia_mensajes_v2',{p_importacion_id:null,p_q:'',p_limit:2000,p_offset:0});
    if(error)throw error;
    if(!data?.length)return false;
    const messages=data.map(m=>({...m,source_index:Number(m.mensaje_id),integrante_nombre:m.integrante_nombre||null}));
    analyticsState=SSTAnalytics.prepare(messages);
    renderAllAnalytics();return true;
  }catch(e){console.error(e);return false;}finally{showLoading(false);}
}

function switchView(name){
  document.querySelectorAll('.view').forEach(v=>v.hidden=true);
  $('view-'+name).hidden=false;
  document.querySelectorAll('.nav-btn').forEach(t=>t.classList.toggle('active',t.dataset.view===name));
  document.querySelector('.sidebar')?.classList.remove('open');
  if(['semantic','network','conversations','people','explore'].includes(name)&&!analyticsState)loadSavedDataset().then(ok=>{if(!ok)toast('Carga o guarda un chat para activar este análisis.');if(name==='network'&&ok)renderGraph();});
  if(name==='network'&&analyticsState)setTimeout(renderGraph,30);
  if(name==='imports')loadImports();
  window.scrollTo({top:0,behavior:'smooth'});
}

$('loginForm').addEventListener('submit',async e=>{
  e.preventDefault();showLoading(true,'Ingresando…','Verificando acceso administrativo.');
  try{
    const {error}=await sb.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});
    if(error)throw error;if(await ensureAdmin()){await loadSavedSummary();renderDashboard();}
  }catch(e){toast(e.message||'No se pudo iniciar sesión.',true);}finally{showLoading(false);}
});
$('logoutBtn').addEventListener('click',async()=>{await sb.auth.signOut();showLogin();});
$('refreshBtn').addEventListener('click',async()=>{await loadSavedSummary();if(analyticsState)renderAllAnalytics();});
$('mobileMenuBtn').addEventListener('click',()=>document.querySelector('.sidebar').classList.toggle('open'));
document.querySelectorAll('[data-view]').forEach(t=>t.addEventListener('click',()=>switchView(t.dataset.view)));
document.querySelectorAll('[data-go]').forEach(t=>t.addEventListener('click',()=>switchView(t.dataset.go)));
$('analyzeBtn').addEventListener('click',analyzeSelectedFile);
$('neuralBtn').addEventListener('click',runNeural);
$('saveAnalysisBtn').addEventListener('click',saveAnalysis);
$('semanticSearchBtn').addEventListener('click',semanticSearch);
$('semanticSearchInput').addEventListener('keydown',e=>{if(e.key==='Enter')semanticSearch();});
$('closePersonModal').addEventListener('click',()=>{$('personModal').hidden=true;document.body.style.overflow='';});
$('personModal').addEventListener('click',e=>{if(e.target===$('personModal')){$('personModal').hidden=true;document.body.style.overflow='';}});
window.addEventListener('resize',()=>{if(!$('view-network').hidden&&analyticsState){clearTimeout(window._graphResize);window._graphResize=setTimeout(renderGraph,250);}if(analyticsState)renderTimeline($('activityTimeline'),analyticsState.timeline);});

(async()=>{
  if(await ensureAdmin()){
    await loadSavedSummary();
    renderDashboard();
  }
})();
