(function(global){
  'use strict';

  const STOPWORDS = new Set([
    'para','como','pero','porque','por','que','qué','con','sin','una','uno','unos','unas','del','las','los','el','la','lo',
    'este','esta','estos','estas','ese','esa','eso','aquel','aquella','al','de','y','o','u','e','en','un','se','su','sus',
    'mi','mis','tu','tus','ya','muy','más','mas','menos','tambien','también','solo','sólo','hay','ser','es','son','fue',
    'ha','han','he','si','sí','no','nos','les','le','me','te','ellos','ellas','nosotros','ustedes','usted','yo','aqui',
    'aquí','alli','allí','donde','cuando','desde','hasta','sobre','entre','cada','otro','otra','otros','otras','puede',
    'pueden','podemos','hacer','hace','hacen','tener','tiene','tienen','esto','algo','bien','gracias','hola','saludos',
    'buenos','buenas','dias','días','tarde','noche','favor','colega','colegas','grupo','whatsapp','mensaje','movida',
    'sst','seguridad','salud','trabajo'
  ]);

  function norm(text){
    return String(text||'')
      .normalize('NFD').replace(/\p{Diacritic}/gu,'')
      .toLowerCase()
      .replace(/µ/g,'u')
      .replace(/³/g,'3')
      .replace(/[^\p{L}\p{N}+#./%-]+/gu,' ')
      .replace(/\s+/g,' ')
      .trim();
  }

  function tokenize(text){
    return norm(text).split(' ').map(t=>t.replace(/^\W+|\W+$/g,'')).filter(t=>{
      if(!t || t.length<3 || STOPWORDS.has(t)) return false;
      if(/^https?$/.test(t)||/^www\.?$/.test(t)) return false;
      return true;
    });
  }

  function cosine(a,b){
    let s=0;
    const n=Math.min(a.length,b.length);
    for(let i=0;i<n;i++) s+=a[i]*b[i];
    return s;
  }

  function normalizeVector(v){
    let ss=0; for(let i=0;i<v.length;i++) ss+=v[i]*v[i];
    const n=Math.sqrt(ss)||1;
    for(let i=0;i<v.length;i++) v[i]/=n;
    return v;
  }

  function buildTfidf(messages,maxTerms=420){
    const docs=messages.map(m=>tokenize(m.texto));
    const df=new Map(), globalTf=new Map();
    docs.forEach(tokens=>{
      const seen=new Set();
      tokens.forEach(t=>{
        globalTf.set(t,(globalTf.get(t)||0)+1);
        if(!seen.has(t)){df.set(t,(df.get(t)||0)+1);seen.add(t);}
      });
    });
    const n=Math.max(messages.length,1);
    let vocab=[...df.entries()]
      .filter(([t,d])=>d>=2 && d<=Math.max(3,n*.72))
      .map(([term,d])=>{
        const idf=Math.log((n+1)/(d+1))+1;
        const tf=globalTf.get(term)||0;
        const signal=idf*Math.log1p(tf);
        return {term,df:d,idf,tf,signal};
      })
      .sort((a,b)=>b.signal-a.signal)
      .slice(0,maxTerms);

    if(vocab.length<40){
      vocab=[...df.entries()]
        .map(([term,d])=>({term,df:d,idf:Math.log((n+1)/(d+1))+1,tf:globalTf.get(term)||0,signal:globalTf.get(term)||0}))
        .sort((a,b)=>b.signal-a.signal)
        .slice(0,maxTerms);
    }

    const index=new Map(vocab.map((v,i)=>[v.term,i]));
    const idf=Float32Array.from(vocab.map(v=>v.idf));
    const vectors=docs.map(tokens=>{
      const v=new Float32Array(vocab.length);
      const counts=new Map();
      tokens.forEach(t=>{if(index.has(t)) counts.set(t,(counts.get(t)||0)+1);});
      const denom=Math.max(tokens.length,1);
      counts.forEach((c,t)=>{const i=index.get(t);v[i]=(c/denom)*idf[i];});
      return normalizeVector(v);
    });

    function vectorize(text){
      const tokens=tokenize(text), v=new Float32Array(vocab.length), counts=new Map();
      tokens.forEach(t=>{if(index.has(t)) counts.set(t,(counts.get(t)||0)+1);});
      const denom=Math.max(tokens.length,1);
      counts.forEach((c,t)=>{const i=index.get(t);v[i]=(c/denom)*idf[i];});
      return normalizeVector(v);
    }

    return {docs,vocab,index,idf,vectors,vectorize,globalTf};
  }

  function farthestCentroids(vectors,k){
    if(!vectors.length) return [];
    const nonzero=vectors.map((v,i)=>({i,s:v.reduce((a,b)=>a+Math.abs(b),0)})).sort((a,b)=>b.s-a.s);
    const indices=[nonzero[0]?.i||0];
    while(indices.length<k){
      let best=-1,bestDist=-1;
      for(let i=0;i<vectors.length;i++){
        if(indices.includes(i)) continue;
        let maxSim=-Infinity;
        for(const ci of indices) maxSim=Math.max(maxSim,cosine(vectors[i],vectors[ci]));
        const dist=1-maxSim;
        if(dist>bestDist){bestDist=dist;best=i;}
      }
      if(best<0) break;
      indices.push(best);
    }
    return indices.map(i=>Float32Array.from(vectors[i]));
  }

  function kmeans(vectors,k,iterations=14){
    if(!vectors.length) return {assignments:[],centroids:[]};
    k=Math.max(1,Math.min(k,vectors.length));
    let centroids=farthestCentroids(vectors,k);
    let assignments=new Int32Array(vectors.length).fill(-1);

    for(let it=0;it<iterations;it++){
      let changed=0;
      for(let i=0;i<vectors.length;i++){
        let best=0,bestSim=-Infinity;
        for(let c=0;c<centroids.length;c++){
          const sim=cosine(vectors[i],centroids[c]);
          if(sim>bestSim){bestSim=sim;best=c;}
        }
        if(assignments[i]!==best){assignments[i]=best;changed++;}
      }

      const sums=Array.from({length:k},()=>new Float32Array(vectors[0].length));
      const counts=new Int32Array(k);
      for(let i=0;i<vectors.length;i++){
        const c=assignments[i]; counts[c]++;
        const s=sums[c],v=vectors[i];
        for(let j=0;j<v.length;j++) s[j]+=v[j];
      }
      for(let c=0;c<k;c++){
        if(counts[c]===0) continue;
        for(let j=0;j<sums[c].length;j++) sums[c][j]/=counts[c];
        centroids[c]=normalizeVector(sums[c]);
      }
      if(changed===0) break;
    }
    return {assignments:[...assignments],centroids};
  }

  function topTokensForCluster(messages,indices,limit=5){
    const counts=new Map();
    indices.forEach(i=>tokenize(messages[i].texto).forEach(t=>counts.set(t,(counts.get(t)||0)+1)));
    return [...counts.entries()]
      .filter(([t,c])=>c>=2 && !STOPWORDS.has(t))
      .sort((a,b)=>b[1]-a[1])
      .slice(0,limit)
      .map(x=>x[0]);
  }

  function dominant(rows,key){
    const m=new Map();
    rows.forEach(r=>{const v=r[key]||'Otros';m.set(v,(m.get(v)||0)+1);});
    return [...m.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||'Otros';
  }

  function buildClusters(messages,assignments,k){
    const result=[];
    for(let c=0;c<k;c++){
      const indices=assignments.map((x,i)=>x===c?i:-1).filter(i=>i>=0);
      if(!indices.length) continue;
      const rows=indices.map(i=>messages[i]);
      const tokens=topTokensForCluster(messages,indices,5);
      const topic=dominant(rows,'tema');
      const type=dominant(rows,'tipo_participacion');
      const sample=[...rows].sort((a,b)=>String(b.texto||'').length-String(a.texto||'').length)[0];
      const people=new Set(rows.map(r=>r.integrante_nombre||r.alias_detectado).filter(Boolean));
      result.push({
        id:c,
        count:rows.length,
        topic,
        type,
        tokens,
        people:people.size,
        sample:sample?.texto||'',
        indices
      });
    }
    return result.sort((a,b)=>b.count-a.count);
  }

  function dateKey(v){
    const d=new Date(v);
    if(Number.isNaN(d.getTime())) return '';
    const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }

  function buildTimeline(messages){
    const daily=new Map(), topicDaily=new Map();
    messages.forEach(m=>{
      const d=dateKey(m.sent_at); if(!d) return;
      daily.set(d,(daily.get(d)||0)+1);
      const key=d+'|||'+(m.tema||'Otros');
      topicDaily.set(key,(topicDaily.get(key)||0)+1);
    });
    const days=[...daily.keys()].sort();
    return {
      days,
      totals:days.map(d=>({date:d,count:daily.get(d)||0})),
      topicDaily:[...topicDaily.entries()].map(([k,count])=>{
        const [date,topic]=k.split('|||');return {date,topic,count};
      })
    };
  }

  function emergingTopics(messages){
    const timeline=buildTimeline(messages), days=timeline.days;
    if(days.length<2) return [];
    const split=Math.max(1,Math.floor(days.length/2));
    const prevDays=new Set(days.slice(0,split));
    const recentDays=new Set(days.slice(split));
    const prev=new Map(),recent=new Map();
    messages.forEach(m=>{
      const d=dateKey(m.sent_at),t=m.tema||'Otros';
      if(prevDays.has(d)) prev.set(t,(prev.get(t)||0)+1);
      if(recentDays.has(d)) recent.set(t,(recent.get(t)||0)+1);
    });
    const topics=new Set([...prev.keys(),...recent.keys()]);
    return [...topics].map(topic=>{
      const a=prev.get(topic)||0,b=recent.get(topic)||0;
      const growth=((b+2)/(a+2))-1;
      return {topic,previous:a,recent:b,growth};
    }).filter(x=>x.recent>=2)
      .sort((a,b)=>b.growth-a.growth || b.recent-a.recent)
      .slice(0,6);
  }

  function sessionize(messages,gapMinutes=90){
    const rows=[...messages].sort((a,b)=>new Date(a.sent_at)-new Date(b.sent_at));
    const sessions=[]; let current=null;
    for(const m of rows){
      const t=new Date(m.sent_at).getTime();
      if(!Number.isFinite(t)) continue;
      const topic=m.tema||'Otros';
      if(!current){
        current={messages:[m],start:t,end:t,lastTopic:topic};
        continue;
      }
      const gap=(t-current.end)/60000;
      const topicBreak=topic!==current.lastTopic && topic!=='Otros' && current.lastTopic!=='Otros' && gap>28;
      if(gap>gapMinutes || topicBreak){
        sessions.push(current);
        current={messages:[m],start:t,end:t,lastTopic:topic};
      }else{
        current.messages.push(m);current.end=t;
        if(topic!=='Otros') current.lastTopic=topic;
      }
    }
    if(current) sessions.push(current);

    return sessions.map((s,idx)=>{
      const people=new Set(s.messages.map(m=>m.integrante_nombre||m.alias_detectado).filter(Boolean));
      const questions=s.messages.filter(m=>m.tipo_participacion==='Pregunta').length;
      const technical=s.messages.filter(m=>['Aporte técnico','Referencia normativa','Caso real','Respuesta técnica'].includes(m.tipo_participacion)).length;
      const topic=dominant(s.messages,'tema');
      const sub=dominant(s.messages.filter(x=>x.subtema),'subtema');
      const norms=[...new Set(s.messages.flatMap(m=>m.normas||[]))].slice(0,8);
      const density=s.messages.length?technical/s.messages.length:0;
      const excerpt=[...s.messages].sort((a,b)=>String(b.texto||'').length-String(a.texto||'').length)[0]?.texto||'';
      return {
        id:idx,start:new Date(s.start),end:new Date(s.end),count:s.messages.length,people:people.size,
        questions,technical,density,topic,subtopic:sub==='Otros'?null:sub,norms,excerpt,messages:s.messages
      };
    }).filter(s=>s.count>=3 && s.people>=1)
      .sort((a,b)=>b.density-a.density || b.count-a.count);
  }

  function buildPersonTopic(messages){
    const matrix=new Map(), personTotals=new Map(), topicPeople=new Map();
    messages.forEach(m=>{
      const person=m.integrante_nombre||m.alias_detectado||'Sin identificar';
      const topic=m.tema||'Otros';
      const key=person+'|||'+topic;
      matrix.set(key,(matrix.get(key)||0)+1);
      personTotals.set(person,(personTotals.get(person)||0)+1);
      if(!topicPeople.has(topic)) topicPeople.set(topic,new Set());
      topicPeople.get(topic).add(person);
    });
    const people=[...personTotals.entries()].sort((a,b)=>b[1]-a[1]).map(([name,total])=>({name,total}));
    const topics=[...topicPeople.entries()].map(([topic,set])=>({topic,people:set.size,total:[...matrix.entries()].filter(([k])=>k.endsWith('|||'+topic)).reduce((s,[,v])=>s+v,0)}))
      .sort((a,b)=>b.total-a.total);
    return {matrix,people,topics};
  }

  function buildGraph(messages,maxPeople=18,maxTopics=10){
    const pt=buildPersonTopic(messages);
    const people=pt.people.slice(0,maxPeople);
    const topics=pt.topics.slice(0,maxTopics);
    const peopleSet=new Set(people.map(x=>x.name)),topicSet=new Set(topics.map(x=>x.topic));
    const edges=[];
    pt.matrix.forEach((count,key)=>{
      const [person,topic]=key.split('|||');
      if(peopleSet.has(person)&&topicSet.has(topic)&&count>=1) edges.push({source:'p:'+person,target:'t:'+topic,count});
    });
    const nodes=[
      ...people.map(p=>({id:'p:'+p.name,label:p.name,type:'person',weight:p.total})),
      ...topics.map(t=>({id:'t:'+t.topic,label:t.topic,type:'topic',weight:t.total}))
    ];
    const connectors=people.map(p=>{
      const related=edges.filter(e=>e.source==='p:'+p.name);
      return {name:p.name,topics:related.length,total:related.reduce((s,e)=>s+e.count,0)};
    }).sort((a,b)=>b.topics-a.topics||b.total-a.total);
    const connectedTopics=topics.map(t=>{
      const related=edges.filter(e=>e.target==='t:'+t.topic);
      return {name:t.topic,people:related.length,total:related.reduce((s,e)=>s+e.count,0)};
    }).sort((a,b)=>b.people-a.people||b.total-a.total);
    return {nodes,edges,connectors,connectedTopics,personTopic:pt};
  }

  function topTerms(model,limit=30){
    return model.vocab.slice().sort((a,b)=>b.signal-a.signal).slice(0,limit);
  }

  function prepare(messages){
    const semanticMessages=messages.filter(m=>{
      const text=String(m.texto||'').trim();
      return text.length>=18 && m.tipo_participacion!=='Conversación general';
    }).slice(0,1200);
    const tfidf=buildTfidf(semanticMessages);
    const n=semanticMessages.length;
    const k=n<20?Math.max(2,Math.round(Math.sqrt(Math.max(n,1)))):Math.min(10,Math.max(4,Math.round(Math.sqrt(n/7))));
    const km=kmeans(tfidf.vectors,k);
    const clusters=buildClusters(semanticMessages,km.assignments,k);
    return {
      messages,
      semanticMessages,
      tfidf,
      assignments:km.assignments,
      centroids:km.centroids,
      clusters,
      timeline:buildTimeline(messages),
      emerging:emergingTopics(messages),
      conversations:sessionize(messages),
      graph:buildGraph(messages),
      topTerms:topTerms(tfidf)
    };
  }

  function search(state,query,limit=15){
    if(!state?.tfidf||!query) return [];
    const qv=state.tfidf.vectorize(query);
    return state.semanticMessages.map((m,i)=>({message:m,similarity:cosine(qv,state.tfidf.vectors[i])}))
      .filter(x=>x.similarity>0)
      .sort((a,b)=>b.similarity-a.similarity)
      .slice(0,limit);
  }

  async function neuralCluster(messages,onProgress){
    const rows=messages.filter(m=>String(m.texto||'').trim().length>=25 && m.tipo_participacion!=='Conversación general').slice(0,120);
    if(rows.length<8) throw new Error('Se necesitan al menos 8 mensajes sustantivos.');
    onProgress?.('Descargando modelo multilingüe…','La primera vez puede tardar varios minutos.');
    const mod=await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/+esm');
    mod.env.allowLocalModels=false;
    const extractor=await mod.pipeline(
      'feature-extraction',
      'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
      {quantized:true,progress_callback:p=>{
        if(p?.status==='progress' && Number.isFinite(p.progress)) onProgress?.('Descargando modelo neuronal…',Math.round(p.progress)+'%');
      }}
    );
    const vectors=[];
    const batch=12;
    for(let i=0;i<rows.length;i+=batch){
      onProgress?.('Generando embeddings neuronales…',`${Math.min(i+batch,rows.length)}/${rows.length} mensajes`);
      const texts=rows.slice(i,i+batch).map(x=>x.texto);
      const out=await extractor(texts,{pooling:'mean',normalize:true});
      const list=out.tolist();
      list.forEach(v=>vectors.push(Float32Array.from(v)));
    }
    const k=Math.min(8,Math.max(4,Math.round(Math.sqrt(rows.length/5))));
    const km=kmeans(vectors,k,12);
    const clusters=buildClusters(rows,km.assignments,k);
    return {rows,vectors,assignments:km.assignments,clusters,model:'paraphrase-multilingual-MiniLM-L12-v2'};
  }

  global.SSTAnalytics={
    norm,tokenize,cosine,buildTfidf,kmeans,buildClusters,buildTimeline,emergingTopics,sessionize,
    buildPersonTopic,buildGraph,prepare,search,neuralCluster
  };
})(window);
