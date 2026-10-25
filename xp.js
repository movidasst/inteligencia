(function newXpModule(){
'use strict';
const E=id=>document.getElementById(id);
let imports=[],importId='',rows=[],draft=new Map(),focusing=null,busy=false,requestId=null;
const rowKey=r=>`${r.integrante_id}|${r.periodo}`;
const groupFromFilename=s=>String(s||'').replace(/\.txt$/i,'').replace(/^chat de whatsapp con\s+/i,'').replace(/^whatsapp chat with\s+/i,'').trim();
function notice(s,kind=''){
 const e=E('xpNotice');e.textContent=s;e.className='xp-notice'+(kind?' '+kind:'');e.hidden=!s;
}
function clear(){
 rows=[];draft=new Map();requestId=null;draw();notice('');
}
function selection(){
 return rows.filter(r=>!r.ya_otorgado&&draft.get(rowKey(r))?.checked);
}
function stats(){
 const sel=selection(), total=sel.reduce((n,r)=>n+draft.get(rowKey(r)).points,0);
 const available=rows.filter(r=>!r.ya_otorgado);
 E('xpKpis').innerHTML=[['Por confirmar',sel.length],['XP propuestos',total],
 ['Ya reconocidos',rows.length-available.length],['Pendientes de identificar',imports.find(i=>i.id===importId)?.pendientes||0]]
 .map(([t,n])=>`<div class="kpi"><span>${safeText(t)}</span><strong>${Number(n).toLocaleString('es')}</strong></div>`).join('');
 E('xpGrantBtn').disabled=busy||!sel.length;
 E('xpGrantBtn').textContent=sel.length?`Confirmar ${sel.length} asignaciones · ${total.toLocaleString('es')} XP`:'Confirmar XP en bloque';
 E('xpSelectAll').disabled=busy||!available.length;
 E('xpSelectAll').checked=!!available.length&&available.every(r=>draft.get(rowKey(r))?.checked);
 E('xpSelectAll').indeterminate=available.some(r=>draft.get(rowKey(r))?.checked)&&!E('xpSelectAll').checked;
}
function draw(){
 const q=E('xpFilter').value.trim().toLocaleLowerCase();
 const visible=rows.filter(r=>!q||String(r.nombre).toLocaleLowerCase().includes(q)||r.periodo.includes(q));
 E('xpRows').innerHTML=visible.length?visible.map(r=>{
   const id=rowKey(r),s=draft.get(id),done=r.ya_otorgado;
   return `<div class="xp-award-row${Number(r.integrante_id)===focusing?' xp-focus':''}">
    <div class="xp-award-person"><strong>${safeText(r.nombre)}</strong>
    <small>${safeText(r.periodo)} · ${Number(r.mensajes)} mensajes útiles · ${Number(r.dias)} días activos</small>
    <span class="match ${done?'ok':'pending'}">${done?`Ya otorgados ${Number(r.puntos_otorgados)} XP`:`Sugerencia: ${Number(r.puntos_sugeridos)} XP`}</span></div>
    <div class="xp-award-controls">
     <label class="xp-toggle"><input type="checkbox" data-check="${safeText(id)}" ${s?.checked?'checked':''} ${done||busy?'disabled':''}><span>Asignar</span></label>
     <select data-score="${safeText(id)}" aria-label="XP para ${safeText(r.nombre)}" ${done||busy?'disabled':''}>
     ${[50,100,150].map(x=>`<option value="${x}" ${s?.points===x?'selected':''}>${x} XP</option>`).join('')}
     </select></div></div>`;
 }).join(''):`<p class="empty">${rows.length?'No hay coincidencias.':'Selecciona un chat y calcula las propuestas.'}</p>`;
 stats();
}
function setImport(){
 const imp=imports.find(x=>x.id===importId);
 E('xpGroupInput').value=imp?(imp.grupo_whatsapp||groupFromFilename(imp.archivo_nombre)):'';
 E('xpImportInfo').textContent=imp?`${imp.identificados} identificados · ${imp.pendientes} pendientes · ${imp.periodo_desde?new Date(imp.periodo_desde).toLocaleDateString('es'):'—'} a ${imp.periodo_hasta?new Date(imp.periodo_hasta).toLocaleDateString('es'):'—'}`:'No hay archivos importados.';
 clear();
}
async function load(pick){
 const [a,b]=await Promise.all([sb.rpc('admin_inteligencia_xp_importaciones'),sb.rpc('admin_inteligencia_grupos_listar')]);
 if(a.error)throw a.error;if(b.error)throw b.error;
 imports=a.data||[];
 E('xpKnownGroups').innerHTML=(b.data||[]).map(g=>`<option value="${safeText(g)}"></option>`).join('');
 E('xpImportSelect').innerHTML=imports.length?imports.map(x=>`<option value="${safeText(x.id)}">${safeText(x.archivo_nombre)}</option>`).join(''):'<option value="">Sin importaciones</option>';
 importId=imports.find(x=>x.id===pick)?.id||imports.find(x=>x.id===importId)?.id||imports[0]?.id||'';
 E('xpImportSelect').value=importId;setImport();
 const chosen=imports.find(x=>x.id===importId);
 if(chosen?.grupo_whatsapp)await preview();
 else if(chosen)notice('Verifica el nombre del grupo y pulsa «Calcular propuestas».');
 else notice('Primero importa un chat de WhatsApp.','warning');
}
async function preview(){
 if(busy||!importId)return;
 const grupo=E('xpGroupInput').value.trim();
 if(grupo.length<3){notice('Indica a qué grupo de WhatsApp pertenece este archivo.','warning');return;}
 busy=true;E('xpPreviewBtn').disabled=true;E('xpGrantBtn').disabled=true;notice('Preparando la propuesta por grupo y mes…');
 try{
   const a=await sb.rpc('admin_inteligencia_grupo_asignar',{p_importacion_id:importId,p_grupo:grupo});
   if(a.error)throw a.error;
   const b=await sb.rpc('admin_inteligencia_xp_previsualizar',{p_importacion_id:importId});
   if(b.error)throw b.error;
   rows=b.data?.filas||[];
   draft=new Map(rows.map(r=>[rowKey(r),{points:Number(r.puntos_sugeridos),checked:!r.ya_otorgado}]));
   const imp=imports.find(x=>x.id===importId);if(imp)imp.grupo_whatsapp=b.data.grupo;
   E('xpGroupInput').value=b.data.grupo;requestId=crypto.randomUUID();draw();
   notice(rows.length?`${rows.length} registros de participación. Revisa los niveles y confirma en bloque; las personas pendientes de identificación no reciben XP todavía.`:'No hay mensajes útiles asociados a integrantes. Revisa las identificaciones.',rows.length?'ok':'warning');
 }catch(e){clear();notice(e.message||'No se pudieron calcular los puntos.','warning');}
 finally{busy=false;E('xpPreviewBtn').disabled=false;stats();}
}
async function grant(){
 if(busy||!selection().length)return;
 const chosen=selection(),xp=chosen.reduce((n,r)=>n+draft.get(rowKey(r)).points,0);
 if(!confirm(`¿Confirmas ${xp} XP para ${chosen.length} participantes en ${E('xpGroupInput').value}? Se registrarán en el ranking.`))return;
 busy=true;E('xpPreviewBtn').disabled=true;E('xpGrantBtn').disabled=true;notice('Registrando puntos…');
 try{
   const p_asignaciones=rows.filter(r=>!r.ya_otorgado).map(r=>({
     integrante_id:r.integrante_id,periodo:r.periodo,
     puntos:draft.get(rowKey(r))?.checked?draft.get(rowKey(r)).points:0
   }));
   requestId ||= crypto.randomUUID();
   const res=await sb.rpc('admin_inteligencia_xp_confirmar',{p_importacion_id:importId,p_asignaciones,p_request_id:requestId});
   if(res.error)throw res.error;
   const read=await sb.rpc('admin_inteligencia_xp_previsualizar',{p_importacion_id:importId});
   if(read.error)throw read.error;
   rows=read.data.filas||[];
   draft=new Map(rows.map(r=>[rowKey(r),{points:Number(r.puntos_sugeridos),checked:!r.ya_otorgado}]));
   requestId=null;draw();
   notice(`Registrados ${res.data.otorgados} reconocimientos y ${res.data.xp_total} XP. ${res.data.ya_existentes} duplicados evitados; ${res.data.excluidos} excluidos.`, 'ok');
 }catch(e){notice((e.message||'Error al confirmar')+'. Puedes reintentar: no se duplicarán los puntos.','warning');}
 finally{busy=false;E('xpPreviewBtn').disabled=false;stats();}
}
async function enter(id){
 try{await load(id);}catch(e){clear();notice(e.message||'Error al consultar los chats.','warning');}
}
window.openXpForImport=async id=>{switchView('xp');focusing=null;E('xpFilter').value='';await enter(id);};
window.openXpForPerson=async id=>{
 focusing=Number(id);switchView('xp');E('xpFilter').value='';
 await enter(currentImportId||undefined);
 const found=rows.find(r=>Number(r.integrante_id)===focusing);
 if(found){E('xpFilter').value=found.nombre;draw();}
 else notice('Los XP se asignan por chat importado. Selecciona el archivo donde participó este integrante.');
};
document.querySelector('[data-view="xp"]').addEventListener('click',()=>{focusing=null;enter(currentImportId||undefined);});
E('xpImportSelect').addEventListener('change',async()=>{importId=E('xpImportSelect').value;E('xpFilter').value='';setImport();if(imports.find(i=>i.id===importId)?.grupo_whatsapp)await preview();});
E('xpGroupInput').addEventListener('input',clear);
E('xpPreviewBtn').addEventListener('click',preview);
E('xpGrantBtn').addEventListener('click',grant);
E('xpFilter').addEventListener('input',draw);
E('xpSelectAll').addEventListener('change',e=>{
 rows.filter(r=>!r.ya_otorgado).forEach(r=>draft.get(rowKey(r)).checked=e.target.checked);
 requestId=crypto.randomUUID();draw();
});
E('xpRows').addEventListener('change',e=>{
 const id=e.target.dataset.check||e.target.dataset.score;
 if(!id||!draft.has(id))return;
 if(e.target.dataset.check)draft.get(id).checked=e.target.checked;
 else draft.get(id).points=Number(e.target.value);
 requestId=crypto.randomUUID();stats();
});
E('xpReviewMatches').addEventListener('click',async()=>{
 if(importId){switchView('import');await loadImportParticipants(importId);}
});
})();
