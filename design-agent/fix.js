const fs=require('fs');
['designers.json','works.json'].forEach(f=>{
  let c=fs.readFileSync('data/'+f,'utf8');
  c=c.replace(/^\uFEFF/,''); // strip BOM
  c=c.replace(/\u201C/g,'<<').replace(/\u201D/g,'>>'); // Chinese dbl quotes
  c=c.replace(/\u2018/g,"'").replace(/\u2019/g,"'");    // Chinese single quotes
  fs.writeFileSync('data/'+f,c,'utf8');
  try{JSON.parse(c);console.log(f,'OK')}catch(e){console.log(f,'FAIL:',e.message.substring(0,60))}
});
