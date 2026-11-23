// Teste em Node: extrai o trecho TS4 do arquivo e roda contra um .save
const fs=require('fs');
const src=fs.readFileSync(process.argv[2],'utf8');
const js=fs.readFileSync(process.argv[3],'utf8').split('/* --- interface --- */')[0];
const T=new Function(js+'; return {TS4,TS4Error};')();
(async()=>{
  const b=fs.readFileSync(process.argv[4]); const buf=b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
  const r=await T.TS4.extract(buf); const m=T.TS4.build(r.sims,r.rep);
  console.log(T.TS4.report(r.rep,m));
  console.log(m.fams.slice(0,5).map(f=>f.name+' '+f.real+' sims '+f.gens+' ger').join('\n'));
  try{ await T.TS4.extract(new Uint8Array(200).buffer); }catch(e){ console.log('erro esperado:',e.message); }
  const bad=new Uint8Array(buf.slice(0,100000)); try{ await T.TS4.extract(bad.buffer);}catch(e){ console.log('truncado:',e.message); }
})();
