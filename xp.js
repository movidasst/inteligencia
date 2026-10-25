/* Inteligencia SST · Módulo XP compartido con el ranking.
   Toda escritura usa RPC administrativas de Supabase; nunca se escriben
   puntos_eventos directamente ni se mezclan las importaciones de ambos módulos. */
(function(){
  'use strict';
  const $xp = id => document.getElementById(id);
  const RULES = {
    aporte_util: {xp:25, name:'Aporte útil'},
    tecnico_fundamentado: {xp:50, name:'Aporte técnico fundamentado'},
    caso_practico: {xp:75, name:'Caso práctico / solución'},
    excepcional: {xp:100, name:'Aporte excepcional'}
  };
  let loaded = false;
  let studies = [];
  let selected = new Map();
  let preview = [];
  let busy = false;
  let requestId = null;
  let searchSerial = 0;
  let deferredPerson = null;

  function currentStudy(){return $xp('xpStudySelect').value;}
  function notice(id,message,kind){
    const el=$xp(id);
    el.textContent=message || '';
    el.className='xp-notice' + (kind?' '+kind:'');
    el.hidden=!message;
  }
  function markNewRequest(){requestId=null;}
  function resetSelection(){
    selected.clear();
    markNewRequest();
    $xp('xpSelected').innerHTML='';
    updateGrantButton();
  }
  function updateGrantButton(){
    const rule=RULES[$xp('xpCriterion').value];
    const amount=rule?.xp || 0;
    const lacking=[...selected.values()].filter(p=>amount>Number(p.quality?.disponible ?? 0));
    const can=!busy && !!currentStudy() && !!amount && selected.size>0 && lacking.length===0;
    $xp('xpGrantBtn').disabled=!can;
    $xp('xpGrantBtn').textContent=selected.size && amount
      ? 'Otorgar +' + amount + ' XP a ' + selected.size + ' integrante(s)'
      : 'Otorgar XP de calidad';
    if(lacking.length) notice('xpQualityNotice','Hay '+lacking.length+' integrante(s) sin saldo suficiente dentro del límite de 500 XP de calidad para esta sesión.','warning');
  }
  function renderSelected(){
    const wrap=$xp('xpSelected');
    wrap.innerHTML=[...selected.values()].map(p=>{
      const available=Number(p.quality?.disponible ?? 0);
      return '<div class="xp-person-row"><div><strong>'+safeText(p.nombre)+'</strong>'+
        '<small>Calidad previa: '+Number(p.quality?.xp_calidad||0)+' XP · Disponible: '+available+' XP'+
        (p.quality?.excluido_ranking?' · Excluido del ranking competitivo (sí puede recibir calidad)':'')+'</small></div>'+
        '<button type="button" class="mini-btn" data-xp-remove="'+p.id+'">Quitar</button></div>';
    }).join('') || '<div class="empty">Selecciona integrantes identificados en Inteligencia SST.</div>';
    wrap.querySelectorAll('[data-xp-remove]').forEach(b=>b.addEventListener('click',()=>{
      selected.delete(Number(b.dataset.xpRemove));
      markNewRequest();renderSelected();
    }));
    updateGrantButton();
  }
  async function refreshPersonQuality(){
    const session=currentStudy();
    if(!session || selected.size===0)return;
    const current=[...selected.values()];
    const result=await Promise.all(current.map(async p=>{
      const {data,error}=await sb.rpc('admin_calidad_integrante',{
        p_sesion_id:session,p_integrante_id:p.id
      });
      if(error)throw error;
      return {...p,quality:data || {}};
    }));
    selected=new Map(result.map(p=>[p.id,p]));
    renderSelected();
  }
  async function addPerson(id,nombre){
    id=Number(id);
    if(!Number.isSafeInteger(id)||id<=0)return;
    if(!currentStudy()){
      notice('xpQualityNotice','Selecciona primero el estudio al que corresponden estos XP.','warning');
      return;
    }
    if(selected.has(id))return;
    try{
      const {data,error}=await sb.rpc('admin_calidad_integrante',{
        p_sesion_id:currentStudy(),p_integrante_id:id
      });
      if(error)throw error;
      selected.set(id,{id,nombre:String(nombre||'Integrante'),quality:data||{}});
      markNewRequest();renderSelected();
    }catch(e){notice('xpQualityNotice',e.message || 'No se pudo consultar el integrante.','warning');}
  }
  async function searchPeople(query){
    const serial=++searchSerial;
    const box=$xp('xpSearchResults');
    box.textContent='Buscando...';
    const {data,error}=await sb.rpc('admin_inteligencia_personas',{
      p_q:String(query||'').trim(),p_limit:30
    });
    if(serial!==searchSerial)return;
    if(error){box.textContent=error.message || 'Error al buscar.';return;}
    const rows=data || [];
    box.innerHTML=rows.map(p=>{
      const id=Number(p.integrante_id);
      if(!Number.isSafeInteger(id)||id<=0)return '';
      return '<div class="xp-person-row"><div><strong>'+safeText(p.nombre)+'</strong>'+
        '<small>'+Number(p.mensajes||0)+' mensajes · '+Number(p.aportes_tecnicos||0)+' aportes técnicos</small></div>'+
        '<button type="button" class="mini-btn" data-xp-add="'+id+'">'+(selected.has(id)?'Seleccionado':'Seleccionar')+'</button></div>';
    }).join('') || '<div class="empty">No hay integrantes identificados que coincidan con la búsqueda.</div>';
    box.querySelectorAll('[data-xp-add]').forEach(b=>b.addEventListener('click',()=>{
      const p=rows.find(x=>Number(x.integrante_id)===Number(b.dataset.xpAdd));
      if(p)addPerson(p.integrante_id,p.nombre);
    }));
  }
  async function refreshQualityHistory(){
    if(!currentStudy())return;
    const [summary,history]=await Promise.all([
      sb.rpc('admin_calidad_resumen',{p_sesion_id:currentStudy()}),
      sb.rpc('admin_calidad_historial',{p_sesion_id:currentStudy(),p_limit:15})
    ]);
    if(summary.error)throw summary.error;
    if(history.error)throw history.error;
    $xp('xpQualitySummary').textContent=
      Number(summary.data?.xp_calidad_total||0).toLocaleString('es')+
      ' XP de calidad registrados · '+Number(summary.data?.personas_con_calidad||0)+' integrantes';
    $xp('xpQualityHistory').innerHTML=(history.data||[]).map(r=>{
      return '<div class="xp-person-row"><div><strong>'+safeText(r.nombre)+'</strong>'+
        '<small>'+safeText(r.motivo)+' · '+(r.created_at?new Date(r.created_at).toLocaleDateString('es'):'')+'</small></div>'+
        '<b>+'+Number(r.puntos||0)+' XP</b></div>';
    }).join('') || '<div class="empty">Sin reconocimientos de calidad para este estudio.</div>';
  }
  async function loadStudies(){
    if(loaded)return;
    const {data,error}=await sb.rpc('admin_estudios_listar');
    if(error)throw error;
    studies=data||[];
    $xp('xpStudySelect').innerHTML='<option value="">Selecciona un estudio</option>'+
      studies.map(s=>'<option value="'+safeText(s.id)+'">'+
        safeText(s.codigo)+' · '+safeText(s.tema)+'</option>').join('');
    loaded=true;
  }
  async function updateStudy(){
    resetSelection();
    notice('xpQualityNotice','','');
    preview=[];
    $xp('xpAutoResult').innerHTML='';
    $xp('xpApplyBtn').disabled=true;
    $xp('xpQualitySummary').textContent='';
    $xp('xpQualityHistory').innerHTML='';
    if(!currentStudy())return;
    try{
      await refreshQualityHistory();
      if(deferredPerson){
        const person=deferredPerson;
        deferredPerson=null;
        await addPerson(person.id,person.nombre);
      }
    }catch(e){notice('xpQualityNotice',e.message || 'No se pudo consultar el estudio.','warning');}
  }
  async function grantQuality(){
    if(busy || !currentStudy() || !selected.size)return;
    const rule=RULES[$xp('xpCriterion').value];
    if(!rule)return;
    if([...selected.values()].some(p=>rule.xp>Number(p.quality?.disponible??0))){
      updateGrantButton();return;
    }
    const people=[...selected.values()];
    const names=people.length===1?people[0].nombre:people.length+' integrantes';
    if(!confirm('¿Otorgar +'+rule.xp+' XP de calidad por "'+rule.name+'" a '+names+'?\nSe registrarán en el ranking como eventos de este estudio.'))return;
    busy=true;updateGrantButton();
    if(!requestId)requestId=crypto.randomUUID(); // Se conserva para reintentos seguros.
    try{
      const {data,error}=await sb.rpc('admin_calidad_otorgar_lote_v2',{
        p_sesion_id:currentStudy(),
        p_integrante_ids:people.map(p=>p.id),
        p_niveles:[$xp('xpCriterion').value],
        p_observacion:$xp('xpReason').value.trim()||null,
        p_request_id:requestId
      });
      if(error)throw error;
      const events=Number(data?.eventos_insertados||0);
      if(events===0){
        notice('xpQualityNotice','No se insertaron puntos nuevos: la operación pudo estar registrada previamente.','warning');
      }else{
        notice('xpQualityNotice','Registro correcto: '+events+' reconocimiento(s), '+(events*rule.xp)+' XP añadidos al ranking.','ok');
      }
      markNewRequest();
      selected.clear();renderSelected();
      $xp('xpReason').value='';
      await refreshQualityHistory();
      await searchPeople($xp('xpPersonSearch').value);
    }catch(e){
      notice('xpQualityNotice',e.message||'No se pudieron registrar los XP.','warning');
    }finally{busy=false;updateGrantButton();}
  }
  function renderAutomatic(){
    const box=$xp('xpAutoResult');
    const eligible=preview.filter(r=>!r.excluido_ranking && !r.ya_otorgado && Number(r.xp_total||0)>0);
    const first=preview[0];
    let msg='';
    if(!first)msg='No hay participantes identificados en importaciones confirmadas de este estudio.';
    else if(first.sesion_tiene_historico)msg='Bloqueado: el estudio tiene XP históricos y no se pueden duplicar.';
    else if(!first.sesion_finalizada)msg='Bloqueado: el estudio no ha finalizado.';
    else if(!eligible.length)msg='Los participantes elegibles ya recibieron XP o están excluidos.';
    else msg=eligible.length+' integrantes pendientes · '+eligible.reduce((a,r)=>a+Number(r.xp_total||0),0)+' XP por otorgar.';
    notice('xpAutoNotice',msg,eligible.length && !first?.sesion_tiene_historico && first?.sesion_finalizada?'ok':'warning');
    $xp('xpApplyBtn').disabled=!first || !!first.sesion_tiene_historico || !first.sesion_finalizada || eligible.length===0;
    box.innerHTML=preview.map(r=>'<div class="xp-person-row"><div><strong>'+safeText(r.nombre)+'</strong>'+
      '<small>'+Number(r.mensajes||0)+' mensajes · '+Number(r.dias_activos||0)+' días · '+
      (r.excluido_ranking?'Excluido':r.ya_otorgado?'Ya otorgado':'Pendiente')+'</small></div>'+
      '<b>'+Number(r.xp_total||0)+' XP</b></div>').join('')||'';
  }
  async function previewAutomatic(){
    $xp('xpApplyBtn').disabled=true;
    preview=[];
    $xp('xpAutoResult').innerHTML='';
    if(!currentStudy()){notice('xpAutoNotice','Selecciona primero un estudio.','warning');return;}
    notice('xpAutoNotice','Calculando XP de importaciones confirmadas...');
    const {data,error}=await sb.rpc('admin_whatsapp_xp_previsualizar',{p_sesion_id:currentStudy()});
    if(error){notice('xpAutoNotice',error.message||'No se pudo calcular el XP.','warning');return;}
    preview=data||[];
    renderAutomatic();
  }
  async function applyAutomatic(){
    if(busy || $xp('xpApplyBtn').disabled || !currentStudy())return;
    const eligible=preview.filter(r=>!r.excluido_ranking && !r.ya_otorgado);
    const total=eligible.reduce((a,r)=>a+Number(r.xp_total||0),0);
    if(!confirm('¿Otorgar '+total+' XP de actividad WhatsApp a '+eligible.length+' integrantes? Esta operación no debe duplicar XP históricos.'))return;
    busy=true;$xp('xpApplyBtn').disabled=true;
    try{
      const {data,error}=await sb.rpc('admin_whatsapp_xp_aplicar',{p_sesion_id:currentStudy()});
      if(error)throw error;
      notice('xpAutoNotice','Registro realizado: '+Number(data?.eventos_insertados||0)+' nuevos eventos, '+Number(data?.xp_otorgado||0)+' XP.','ok');
      await previewAutomatic();
    }catch(e){notice('xpAutoNotice',e.message||'No se pudo otorgar XP.','warning');}
    finally{busy=false;}
  }
  async function enterXp(){
    try{
      await loadStudies();
      if(currentStudy())await refreshQualityHistory();
      if(!$xp('xpSearchResults').childElementCount)await searchPeople('');
    }catch(e){notice('xpQualityNotice',e.message||'El módulo de Estudios no está disponible para esta cuenta.','warning');}
  }
  // Entrada contextual desde la pestaña Personas y desde participantes importados.
  window.openXpForPerson=async function(id){
    switchView('xp');
    await enterXp();
    try{
      const {data,error}=await sb.rpc('admin_inteligencia_persona_detalle',{p_integrante_id:Number(id)});
      if(error)throw error;
      if(!currentStudy()){
        deferredPerson={id:Number(id),nombre:data?.nombre||'Integrante'};
        notice('xpQualityNotice','Selecciona el estudio para continuar con '+deferredPerson.nombre+'.','warning');
      }else{
        await addPerson(id,data?.nombre||'Integrante');
      }
    }catch(e){notice('xpQualityNotice',e.message||'No se pudo cargar el perfil del integrante.','warning');}
  };
  document.querySelector('[data-view="xp"]').addEventListener('click',enterXp);
  $xp('xpStudySelect').addEventListener('change',updateStudy);
  $xp('xpCriterion').addEventListener('change',()=>{markNewRequest();updateGrantButton();});
  $xp('xpPersonSearch').addEventListener('input',()=>{
    clearTimeout($xp('xpPersonSearch')._timer);
    $xp('xpPersonSearch')._timer=setTimeout(()=>searchPeople($xp('xpPersonSearch').value),250);
  });
  $xp('xpSearchBtn').addEventListener('click',()=>searchPeople($xp('xpPersonSearch').value));
  $xp('xpGrantBtn').addEventListener('click',grantQuality);
  $xp('xpPreviewBtn').addEventListener('click',previewAutomatic);
  $xp('xpApplyBtn').addEventListener('click',applyAutomatic);
  renderSelected();
})();