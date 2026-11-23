/* ============ Importar do The Sims 4 (.save) — tudo local, no navegador ============ */
const TS4={
  MAX_FILE:300*1024*1024, MAX_BLOCK:200*1024*1024,
  AGE:{1:'Bebê',2:'Bebê',128:'Bebê',4:'Criança',8:'Adolescente',16:'Jovem adulto',32:'Adulto',64:'Idoso'},
  GENDER:{4096:'Masculino',8192:'Feminino'}
};
class TS4Error extends Error{}

/* --- protobuf sem esquema --- */
TS4.vi=function(b,i){
  let n=0,mul=1,big=null,k=0,c;
  do{
    if(i>=b.length) throw new TS4Error('dados truncados');
    c=b[i++];
    if(k<7){ n+=(c&0x7f)*mul; mul*=128; }
    else{ if(big===null) big=BigInt(n); big+=BigInt(c&0x7f)<<BigInt(7*k); }
    k++;
    if(k>10) throw new TS4Error('varint inválido');
  }while(c&0x80);
  return [big!==null?big:n,i];
};
TS4.pb=function(b){
  const out=[]; let i=0;
  const dv=new DataView(b.buffer,b.byteOffset,b.byteLength);
  while(i<b.length){
    let key; [key,i]=TS4.vi(b,i);
    const f=Math.floor(Number(key)/8), w=Number(key)%8; let v;
    if(w===0){ [v,i]=TS4.vi(b,i); }
    else if(w===1){ if(i+8>b.length) throw new TS4Error('dados truncados'); v=dv.getBigUint64(i,true); i+=8; }
    else if(w===5){ if(i+4>b.length) throw new TS4Error('dados truncados'); v=dv.getUint32(i,true); i+=4; }
    else if(w===2){ let ln; [ln,i]=TS4.vi(b,i); ln=Number(ln); if(i+ln>b.length) throw new TS4Error('dados truncados'); v=b.subarray(i,i+ln); i+=ln; }
    else throw new TS4Error('tipo de campo desconhecido');
    out.push({f,w,v});
  }
  return out;
};

/* --- RefPack (QFS) --- */
TS4.refpack=function(src){
  if(src.length<5||src[1]!==0xFB) throw new TS4Error('cabeçalho de compressão inesperado');
  const big=src[0]&0x80; let pos=2;
  if(src[0]&1) pos+=big?4:3;
  const n=big?4:3; let usize=0;
  for(let k=0;k<n;k++) usize=usize*256+src[pos+k];
  pos+=n;
  if(usize>TS4.MAX_BLOCK) throw new TS4Error('bloco descomprimido grande demais');
  const out=new Uint8Array(usize); let o=0;
  while(pos<src.length){
    const b0=src[pos++]; let plain,copy,off;
    if(b0<0x80){ const b1=src[pos++]; plain=b0&3; copy=((b0&0x1C)>>2)+3; off=((b0&0x60)<<3)+b1+1; }
    else if(b0<0xC0){ const b1=src[pos],b2=src[pos+1]; pos+=2; plain=(b1&0xC0)>>6; copy=(b0&0x3F)+4; off=((b1&0x3F)<<8)+b2+1; }
    else if(b0<0xE0){ const b1=src[pos],b2=src[pos+1],b3=src[pos+2]; pos+=3; plain=b0&3; copy=((b0&0x0C)<<6)+b3+5; off=((b0&0x10)<<12)+(b1<<8)+b2+1; }
    else if(b0<0xFC){ plain=((b0&0x1F)<<2)+4; copy=0; off=0; }
    else{ plain=b0&3; copy=0; off=0; }
    if(o+plain+copy>usize||pos+plain>src.length) throw new TS4Error('dados comprimidos corrompidos');
    for(let k=0;k<plain;k++) out[o++]=src[pos++];
    if(copy){ if(off>o) throw new TS4Error('dados comprimidos corrompidos'); for(let k=0;k<copy;k++){ out[o]=out[o-off]; o++; } }
  }
  if(o!==usize) throw new TS4Error('tamanho descomprimido não confere');
  return out;
};

/* --- pacote DBPF --- */
TS4.readPackage=async function(buf){
  const u8=new Uint8Array(buf), dv=new DataView(buf), info={warnings:[]};
  if(u8.length<96) throw new TS4Error('Arquivo pequeno demais para ser um save do The Sims 4.');
  if(String.fromCharCode(u8[0],u8[1],u8[2],u8[3])!=='DBPF') throw new TS4Error('Este arquivo não é um save do The Sims 4 (cabeçalho DBPF ausente).');
  info.major=dv.getUint32(4,true); info.minor=dv.getUint32(8,true);
  if(info.major!==2) throw new TS4Error('Versão de pacote não suportada (DBPF '+info.major+'.'+info.minor+').');
  const count=dv.getUint32(0x24,true);
  const idx=dv.getUint32(0x40,true)||dv.getUint32(0x28,true);
  if(!count||count>200000||idx<96||idx+4>u8.length) throw new TS4Error('Índice do pacote inválido. O arquivo pode estar corrompido.');
  let pos=idx; const flags=dv.getUint32(pos,true); pos+=4;
  const consts={};
  [['type',0],['group',1],['hi',2]].forEach(([k,bit])=>{ if(flags&(1<<bit)){ consts[k]=dv.getUint32(pos,true); pos+=4; } });
  const entries=[];
  for(let n=0;n<count;n++){
    const e={};
    for(const k of ['type','group','hi']){ if(k in consts) e[k]=consts[k]; else { e[k]=dv.getUint32(pos,true); pos+=4; } }
    if(pos+20>u8.length) throw new TS4Error('Índice do pacote truncado. O arquivo pode estar corrompido.');
    e.lo=dv.getUint32(pos,true); e.off=dv.getUint32(pos+4,true); e.size=dv.getUint32(pos+8,true)&0x7FFFFFFF;
    e.mem=dv.getUint32(pos+12,true); e.comp=dv.getUint16(pos+16,true); pos+=20;
    entries.push(e);
  }
  info.entries=entries.length;
  return {u8,entries,info};
};
TS4.readResource=async function(pkg,e){
  if(e.off+e.size>pkg.u8.length) throw new TS4Error('Recurso fora dos limites do arquivo (arquivo incompleto).');
  const raw=pkg.u8.subarray(e.off,e.off+e.size);
  if(e.comp===0xFFFF) return TS4.refpack(raw);
  if(e.comp===0) return raw;
  if(e.comp===0x5A42){
    if(typeof DecompressionStream==='undefined') throw new TS4Error('Este navegador não suporta a compressão usada no save.');
    const ab=await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer();
    return new Uint8Array(ab);
  }
  throw new TS4Error('Compressão não suportada (0x'+e.comp.toString(16)+').');
};

/* --- extração dos Sims --- */
TS4.extract=async function(buf){
  const pkg=await TS4.readPackage(buf);
  const cands=pkg.entries.filter(e=>e.type===0xD);
  if(!cands.length) throw new TS4Error('Versão de save não suportada: não encontrei os dados dos Sims.');
  cands.sort((a,b)=>b.mem-a.mem);
  const blob=await TS4.readResource(pkg,cands[0]);
  let top; try{ top=TS4.pb(blob); }catch(e){ throw new TS4Error('Dados dos Sims ilegíveis. O arquivo pode estar corrompido ou ser de uma versão não suportada.'); }
  const recs=top.filter(x=>x.f===6&&x.w===2);
  if(!recs.length) throw new TS4Error('Nenhum Sim encontrado neste save.');
  const dec=new TextDecoder('utf-8');
  const rep={dbpf:pkg.info.major+'.'+pkg.info.minor,recursos:pkg.info.entries,registros:recs.length,semId:0,duplicados:0,semNome:0,idadeDesconhecida:{},sexoDesconhecido:{},semGenealogia:0,paisAusentes:0,conjugeSemRetorno:0,ciclos:0,conjugeAusente:0,erros:0};
  const sims=new Map();
  for(const r of recs){
    let F={};
    try{ for(const e of TS4.pb(r.v)) if(!(e.f in F)) F[e.f]=e; }catch(e){ rep.erros++; continue; }
    if(!F[1]||F[1].w!==1){ rep.semId++; continue; }
    const id=F[1].v.toString();
    if(sims.has(id)){ rep.duplicados++; continue; }
    const txt=k=>F[k]&&F[k].w===2?dec.decode(F[k].v).trim():'';
    const first=txt(5), last=txt(6);
    if(!first&&!last) rep.semNome++;
    const sx=F[7]?Number(F[7].v):0, ag=F[8]?Number(F[8].v):0;
    const s={id,first:first||'Sem nome',last,sexo:sx,idade:ag,
      hh:F[4]&&F[4].w===1?F[4].v.toString():'',
      spouse:F[15]&&F[15].w===1?F[15].v.toString():'',mother:'',father:''};
    if(!(sx in TS4.GENDER)) rep.sexoDesconhecido[sx]=(rep.sexoDesconhecido[sx]||0)+1;
    if(!(ag in TS4.AGE)) rep.idadeDesconhecida[ag]=(rep.idadeDesconhecida[ag]||0)+1;
    let hasGen=false;
    try{
      if(F[30]&&F[30].w===2){
        for(const e of TS4.pb(F[30].v)){
          if(e.f!==14||e.w!==2) continue;
          for(const it of TS4.pb(e.v)){
            if(it.f!==1||it.w!==2) continue;
            let key=0,val=null;
            for(const x of TS4.pb(it.v)){ if(x.f===1) key=Number(x.v); else if(x.f===2) val=x.v.toString(); }
            if(val===null||val==='0') continue;
            hasGen=true;
            if(key===0) s.mother=val; else if(key===1) s.father=val;
          }
        }
      }
    }catch(e){ rep.erros++; }
    if(!hasGen) rep.semGenealogia++;
    sims.set(id,s);
  }
  return {sims,rep,topFields:[...new Set(top.map(x=>x.f))].length};
};

/* --- reconstrução: placeholders, famílias, gerações --- */
TS4.build=function(sims,rep){
  const nodes=new Map();
  sims.forEach(s=>nodes.set(s.id,{...s,placeholder:false}));
  const edges=[]; // {kind:'parent',a,b} | {kind:'spouse',a,b}
  const seenSp=new Set();
  const place=id=>{ if(!nodes.has(id)) nodes.set(id,{id,first:'Sim',last:'desconhecido',sexo:0,idade:0,hh:'',spouse:'',mother:'',father:'',placeholder:true}); };
  nodes.forEach(n=>{
    if(n.placeholder) return;
    [[n.mother,4096*0+8192],[n.father,4096]].forEach(([pid,sx])=>{
      if(!pid||pid===n.id) return;
      if(!sims.has(pid)){ rep.paisAusentes++; place(pid); const p=nodes.get(pid); if(!p.sexo) p.sexo=sx; }
      edges.push({kind:'parent',a:pid,b:n.id});
    });
    if(n.mother&&n.mother===n.father){ edges.pop(); }
    if(n.spouse&&n.spouse!==n.id){
      if(!sims.has(n.spouse)){ rep.conjugeAusente++; }
      else{
        const k=[n.id,n.spouse].sort().join('|');
        if(sims.get(n.spouse).spouse!==n.id) rep.conjugeSemRetorno++;
        if(!seenSp.has(k)){ seenSp.add(k); edges.push({kind:'spouse',a:n.id,b:n.spouse}); }
      }
    }
  });
  // remove vínculos de pai/mãe que criariam ciclo
  const parentsOf=new Map(); const okEdges=[];
  const reach=(from,target,seen=new Set())=>{ if(from===target) return true; if(seen.has(from)) return false; seen.add(from); for(const p of (parentsOf.get(from)||[])) if(reach(p,target,seen)) return true; return false; };
  for(const e of edges){
    if(e.kind==='parent'){
      if(reach(e.a,e.b)){ rep.ciclos++; continue; }
      if(!parentsOf.has(e.b)) parentsOf.set(e.b,[]);
      parentsOf.get(e.b).push(e.a);
    }
    okEdges.push(e);
  }
  // componentes
  const uf=new Map(); nodes.forEach((_,k)=>uf.set(k,k));
  const find=x=>{ while(uf.get(x)!==x){ uf.set(x,uf.get(uf.get(x))); x=uf.get(x);} return x; };
  okEdges.forEach(e=>{ const x=find(e.a),y=find(e.b); if(x!==y) uf.set(x,y); });
  const depthMemo=new Map();
  const depth=id=>{ if(depthMemo.has(id)) return depthMemo.get(id); const ps=parentsOf.get(id)||[]; const d=ps.length?1+Math.max(...ps.map(depth)):1; depthMemo.set(id,d); return d; };
  const groups=new Map();
  nodes.forEach((n,id)=>{ const r=find(id); if(!groups.has(r)) groups.set(r,[]); groups.get(r).push(id); });
  const fams=[]; const loose=[];
  groups.forEach(ids=>{
    if(ids.length<2){ loose.push(ids[0]); return; }
    const real=ids.filter(i=>!nodes.get(i).placeholder);
    const cnt={}; real.forEach(i=>{ const l=nodes.get(i).last; if(l) cnt[l]=(cnt[l]||0)+1; });
    const best=Object.entries(cnt).sort((a,b)=>b[1]-a[1])[0];
    fams.push({ids,real:real.length,gens:Math.max(...ids.map(depth)),surname:best?best[0]:'',loose:false});
  });
  fams.sort((a,b)=>b.real-a.real);
  const used={};
  fams.forEach(f=>{ const base='Família '+(f.surname||'sem sobrenome'); used[base]=(used[base]||0)+1; f.name=used[base]>1?base+' ('+used[base]+')':base; });
  if(loose.length){ const real=loose.filter(i=>!nodes.get(i).placeholder); if(real.length) fams.push({ids:loose,real:real.length,gens:1,name:'Sims sem parentesco',surname:'',loose:true}); }
  fams.forEach((f,i)=>{ f.key='f'+i; f.selected=!f.loose; });
  return {nodes,edges:okEdges,parentsOf,depth,fams};
};

/* --- relatório sem nomes (seguro para compartilhar) --- */
TS4.report=function(rep,model){
  const real=[...model.nodes.values()].filter(n=>!n.placeholder).length;
  const ph=model.nodes.size-real;
  const L=[
    'Relatório de importação — LhamaTree',
    'Pacote: DBPF '+rep.dbpf+' · recursos: '+rep.recursos,
    'Registros de Sims: '+rep.registros+' · importáveis: '+real,
    'Famílias (2+ Sims ligados): '+model.fams.filter(f=>!f.loose).length+' · Sims sem parentesco: '+(model.fams.find(f=>f.loose)?.real||0),
    'Gerações (maior cadeia): '+Math.max(0,...model.fams.map(f=>f.gens)),
    'Sims com genealogia gravada: '+(real-rep.semGenealogia)+' · sem genealogia: '+rep.semGenealogia,
    'Pais/mães sem registro no save (viram "Sim desconhecido"): '+rep.paisAusentes+' vínculos, '+ph+' Sims',
    'Cônjuge sem registro: '+rep.conjugeAusente+' · cônjuge sem retorno: '+rep.conjugeSemRetorno,
    'Vínculos descartados por ciclo: '+rep.ciclos,
    'Duplicados ignorados: '+rep.duplicados+' · sem ID: '+rep.semId+' · sem nome: '+rep.semNome+' · registros ilegíveis: '+rep.erros,
    'Fases de vida não reconhecidas: '+(JSON.stringify(rep.idadeDesconhecida)),
    'Sexo não reconhecido: '+(JSON.stringify(rep.sexoDesconhecido)),
    'Não identificado no save: data de nascimento, vivo/falecido e foto (Sims entram como "Vivo" por padrão).'
  ];
  return L.join('\n');
};

/* --- gravação no app --- */
TS4.commit=function(model){
  const sel=model.fams.filter(f=>f.selected);
  const existing=new Map(db.people.filter(p=>p.ts4Id).map(p=>[p.ts4Id,p.id]));
  const casado=(REL_TYPES.find(r=>r.label==='Casado(a)')||{});
  let nf=0,np=0,skipped=0,nr=0,firstFam=null;
  const mapId=new Map();
  sel.forEach(f=>{
    const fam={id:uid(),name:f.name,icon:ICONS[0],desc:'Importada do The Sims 4',cover:null};
    const idMap=new Map(); let added=0;
    f.ids.forEach(sid=>{
      const n=model.nodes.get(sid);
      if(existing.has(sid)){ idMap.set(sid,null); skipped++; return; }
      const p={id:uid(),familyId:fam.id,first:n.first,last:n.last};
      for(const k in PERSON_DEFAULTS) p[k]=Array.isArray(PERSON_DEFAULTS[k])?[]:PERSON_DEFAULTS[k];
      p.gender=TS4.GENDER[n.sexo]||'Não definido';
      if(!n.placeholder&&TS4.AGE[n.idade]) p.stage=TS4.AGE[n.idade];
      p.ts4Id=sid;
      if(n.placeholder){ p.ts4Placeholder=true; p.bio='Sim que não está mais no save; só o vínculo familiar foi preservado.'; }
      db.people.push(p); idMap.set(sid,p.id); added++; np++;
    });
    if(!added){ return; }
    db.families.push(fam); nf++; if(!firstFam) firstFam=fam.id;
    const have=new Set();
    model.edges.forEach(e=>{
      if(!idMap.has(e.a)||!idMap.has(e.b)) return;
      const a=idMap.get(e.a), b=idMap.get(e.b);
      if(!a||!b) return;
      const k=e.kind+'|'+a+'|'+b; if(have.has(k)) return; have.add(k);
      if(e.kind==='parent') db.rels.push({id:uid(),familyId:fam.id,type:'parent',a,b});
      else db.rels.push({id:uid(),familyId:fam.id,type:'spouse',a,b,label:casado.label||'Casado(a)',icon:casado.icon||''});
      nr++;
    });
  });
  if(firstFam){ db.activeFamily=firstFam; ui.selected=null; ui.fitNext=true; }
  commit();
  return {nf,np,nr,skipped};
};

/* --- interface --- */
function importModal(){
  let model=null,rep=null,reportTxt='';
  const drop=`<form class="form" onsubmit="return false">
    <header><h2>Importar do The Sims 4</h2><button type="button" class="btn ghost" data-close>×</button></header>
    <p class="imp-note">Selecione o arquivo <b>.save</b> (por exemplo <code>Slot_00000001.save</code>). A leitura acontece <b>só no seu navegador</b>: o arquivo não é enviado a nenhum servidor e não fica guardado. Só os Sims e os vínculos que você confirmar são salvos.</p>
    <label class="imp-drop" id="impDrop">Arraste o .save aqui ou clique para escolher<input type="file" id="impFile" hidden></label>
    <p class="imp-err hidden" id="impErr"></p>
    <footer><span class="grow"></span><button type="button" class="btn ghost" data-close>Cancelar</button></footer></form>`;
  openModal(drop,box=>{
    box.classList.add('imp-box');
    const err=m=>{ const e=box.querySelector('#impErr'); e.textContent=m; e.classList.remove('hidden'); };
    const run=async file=>{
      if(!file) return;
      if(file.size>TS4.MAX_FILE) return err('Arquivo grande demais (limite de 300 MB).');
      box.querySelector('#impDrop').firstChild.textContent='Lendo o save…';
      try{
        const buf=await file.arrayBuffer();
        const r=await TS4.extract(buf);
        rep=r.rep; model=TS4.build(r.sims,rep); reportTxt=TS4.report(rep,model);
        preview(box);
      }catch(e){
        box.querySelector('#impDrop').firstChild.textContent='Arraste o .save aqui ou clique para escolher';
        err(e instanceof TS4Error?e.message:'Não consegui ler este arquivo. Ele pode estar corrompido ou ser de uma versão não suportada.');
      }
    };
    const dz=box.querySelector('#impDrop');
    box.querySelector('#impFile').onchange=e=>run(e.target.files[0]);
    ['dragover','dragenter'].forEach(t=>dz.addEventListener(t,e=>{e.preventDefault();dz.classList.add('on');}));
    ['dragleave','drop'].forEach(t=>dz.addEventListener(t,e=>{e.preventDefault();dz.classList.remove('on');}));
    dz.addEventListener('drop',e=>run(e.dataTransfer.files[0]));
  });

  function preview(box){
    const real=[...model.nodes.values()].filter(n=>!n.placeholder).length;
    const ph=model.nodes.size-real;
    const famsN=model.fams.filter(f=>!f.loose).length;
    const maxG=Math.max(0,...model.fams.map(f=>f.gens));
    const looseG=model.fams.find(f=>f.loose);
    const dupExisting=db.people.filter(p=>p.ts4Id).length;
    const row=f=>{
      const byGen={}; f.ids.forEach(id=>{ const d=model.depth(id); (byGen[d]=byGen[d]||[]).push(id); });
      const nm=id=>{ const n=model.nodes.get(id); return n?esc((n.first+' '+n.last).trim()):'?'; };
      const tree=f.loose?`<div class="imp-chips">${f.ids.slice(0,60).map(id=>`<span class="imp-chip">${nm(id)}</span>`).join('')}${f.ids.length>60?`<span class="imp-chip">+${f.ids.length-60}</span>`:''}</div>`
        :Object.keys(byGen).sort((a,b)=>a-b).map(g=>`<div class="imp-gen"><b>Geração ${g}</b><div class="imp-chips">${byGen[g].map(id=>{
          const n=model.nodes.get(id); const sp=n.spouse&&model.nodes.has(n.spouse)?' ♥ '+nm(n.spouse):'';
          return `<span class="imp-chip${n.placeholder?' ph':''}" title="${n.placeholder?'Sim removido do save':esc(TS4.AGE[n.idade]||'Fase desconhecida')}">${nm(id)}${n.placeholder?'':esc(sp)}</span>`;}).join('')}</div></div>`).join('');
      return `<div class="imp-fam"><label class="imp-frow"><input type="checkbox" class="imp-chk" data-k="${f.key}" ${f.selected?'checked':''}>
        <span class="imp-fn">${esc(f.name)}</span><span class="imp-fm">${f.real} Sims${f.loose?'':' · '+f.gens+' ger.'}</span></label>
        <details><summary>Ver membros</summary>${tree}</details></div>`;
    };
    box.innerHTML=`<form class="form" onsubmit="return false">
      <header><h2>Prévia da importação</h2><button type="button" class="btn ghost" data-close>×</button></header>
      <div class="imp-stats"><div><b>${real}</b><span>Sims</span></div><div><b>${famsN}</b><span>famílias</span></div><div><b>${maxG}</b><span>gerações</span></div><div><b>${looseG?looseG.real:0}</b><span>sem parentesco</span></div></div>
      ${ph?`<p class="imp-note">${ph} Sim(s) citado(s) como pai/mãe não estão mais no save. Entram como <b>“Sim desconhecido”</b> para manter o vínculo.</p>`:''}
      <p class="imp-note">Não encontrei no save: <b>data de nascimento</b>, <b>vivo/falecido</b> e <b>foto</b>. Todos entram como “Vivo” e você pode ajustar depois. Sims já importados antes (${dupExisting}) não são duplicados.</p>
      <div class="imp-list">${model.fams.map(row).join('')}</div>
      <details class="imp-rep"><summary>Relatório técnico (sem nomes)</summary><pre id="impRep"></pre><button type="button" class="btn ghost" id="impCopy">Copiar relatório</button></details>
      <footer><span class="imp-sel" id="impSel"></span><span class="grow"></span><button type="button" class="btn ghost" data-close>Cancelar</button><button type="button" class="btn dark" id="impGo">Importar selecionadas</button></footer></form>`;
    box.querySelector('#impRep').textContent=reportTxt;
    const upd=()=>{ const s=model.fams.filter(f=>f.selected); box.querySelector('#impSel').textContent=s.length+' selecionada(s) · '+s.reduce((a,f)=>a+f.real,0)+' Sims'; box.querySelector('#impGo').disabled=!s.length; };
    box.querySelectorAll('.imp-chk').forEach(c=>c.onchange=()=>{ model.fams.find(f=>f.key===c.dataset.k).selected=c.checked; upd(); });
    box.querySelector('#impCopy').onclick=async()=>{ try{ await navigator.clipboard.writeText(reportTxt); box.querySelector('#impCopy').textContent='Copiado ✓'; }catch(e){ const r=document.createRange(); r.selectNodeContents(box.querySelector('#impRep')); const s=getSelection(); s.removeAllRanges(); s.addRange(r); box.querySelector('#impCopy').textContent='Selecionado: use Ctrl+C'; } };
    box.querySelector('#impGo').onclick=()=>{
      const res=TS4.commit(model);
      box.innerHTML=`<form class="form" onsubmit="return false"><header><h2>Importação concluída</h2><button type="button" class="btn ghost" data-close>×</button></header>
        <p class="imp-note"><b>${res.np}</b> Sims em <b>${res.nf}</b> família(s), com <b>${res.nr}</b> vínculos.${res.skipped?` ${res.skipped} Sim(s) já existiam e foram mantidos.`:''}</p>
        <footer><span class="grow"></span><button type="button" class="btn dark" data-close>Ver árvore</button></footer></form>`;
      try{ setView('tree'); }catch(e){}
    };
    upd();
  }
}
