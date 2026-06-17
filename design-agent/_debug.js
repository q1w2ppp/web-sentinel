
let designers=[],works=[],theory={},comps={},session={preferences:{},lastTopic:null};

async function loadKB(){
  designers=await(await fetch('data/designers.json')).json();
  works=await(await fetch('data/works.json')).json();
  theory=await(await fetch('data/theory.json')).json();
  comps=await(await fetch('data/competitions.json')).json();
  document.getElementById('designerCount').textContent=designers.length;
  document.getElementById('workCount').textContent=works.length;
  addMsg('agent','你好。我是设计智能体。可以帮你做五件事：<br>1. <b>查灵感</b>——根据主题找参考作品和设计师<br>2. <b>拆作品</b>——分析一件作品的视觉策略<br>3. <b>出方向</b>——给一个主题生成 3 个创意方向<br>4. <b>比比赛</b>——分析你的作品适合投什么比赛<br>5. <b>审设计</b>——按设计理论逐项检查问题<br><br>直接告诉我你想做什么就好。');
}

function addMsg(type,html){
  const el=document.createElement('div');el.className='msg '+type;el.innerHTML=html;
  document.getElementById('chat').appendChild(el);el.scrollIntoView({behavior:'smooth'});
}

function setIntent(i){document.querySelectorAll('.engine-btn').forEach(b=>b.classList.toggle('active',b.textContent.includes({inspire:'检索',deconstruct:'拆解',direct:'方向',compete:'比赛',critique:'批评'}[i])))}

async function send(){
  if(!designers.length){addMsg('agent','知识库加载中，请稍候再试...');return;}
  const input=document.getElementById('userInput');const q=input.value.trim();if(!q)return;
  addMsg('user',q);input.value='';
  
  // Ask back when input is too vague
  if(q.length<4&&!q.includes('拆')&&!q.includes('比赛')&&!q.includes('审')){
    addMsg('agent','你的描述比较简短。你是想：<br>• <b>找参考</b>——某类型的作品灵感？<br>• <b>分析作品</b>——拆解一件你看到的设计？<br>• <b>出方向</b>——为一个主题生成创意方案？<br>• <b>看比赛</b>——了解比赛偏好？<br>• <b>审设计</b>——检查设计问题？<br><br>告诉我具体一点就好。');return;
  }
  
  const routing=[{p:/我是|我做|我们在做|项目是/i,i:'critique',m:'你有作品要审？'},{p:/我想做|灵感|参考|类似|有没有|找找|主题是/i,i:'inspire',m:null},{p:/分析|拆解|为什么好|怎么做的/i,i:'deconstruct',m:null},{p:/方向|思路|创意|方案|怎么设计/i,i:'direct',m:null},{p:/参赛|比赛|投哪个|适合什么/i,i:'compete',m:null},{p:/审|检查|帮我看|行不行|问题|批评/i,i:'critique',m:null}];
  let intent=null;
  for(const r of routing){if(r.p.test(q)){intent=r;break}}
  if(!intent){addMsg('agent','我没理解你的意图。你是想：<br>• <b>找参考</b>（"我想做XX海报，有没有类似的"）<br>• <b>拆作品</b>（"帮我分析这个作品为什么好"）<br>• <b>出方向</b>（"给我几个创意方案"）<br>• <b>比比赛</b>（"这个作品适合投什么奖"）<br>• <b>审设计</b>（"帮我看看有什么问题"）');return}
  
  const actions={inspire:runInspire,deconstruct:runDeconstruct,direct:runDirect,compete:runCompete,critique:runCritique};
  session.lastTopic=q;
  await actions[intent.i](q);
}

// ═══ Engine 1: Inspire ═══
function runInspire(q){
  // Extract meaningful keywords from Chinese query
  const stopWords=['我','想','做','找','参考','有没有','类似','的','灵感','方向','主题','是','一','个','张','件','帮忙','看看','帮我','一下'];
  const chars=q.split('').filter(c=>!stopWords.includes(c)&&!/[\s\?!\.,。，！？]/.test(c)).join('');
  // Match by substring in theme, concept, and tags
  // Match by theme/tags (use 2-char sliding window for Chinese)
  const matched=works.filter(w=>{
    const haystack=(w.theme+w.concept+w.tags.join(' ')).toLowerCase();
    for(let i=0;i<chars.length-1;i++){
      if(haystack.includes(chars.slice(i,i+2)))return true;
    }
    return false;
  });
  const topWorks=matched.length>=3?matched.slice(0,3):[...matched,...works.filter(w=>!matched.includes(w))].slice(0,3);
  const designerIds=[...new Set(topWorks.map(w=>w.designer_ref).filter(Boolean))];
  const topDesigners=designerIds.map(id=>designers.find(d=>d.id===id)).filter(Boolean);
  
  let html=`<b>🔍 灵感检索："${q}"</b><br><br>`;
  if(matched.length===0){html+=`库中没有完美匹配的作品。以下是最近似的 3 件：<br>`}
  for(const w of topWorks){
    html+=`<div class="card"><h3>🏆 ${w.title}</h3><div class="meta"><b>获奖：</b>${w.competition}<br><b>概念：</b>${w.concept}<br><b>视觉：</b>${w.visual_system}</div><div class="tags">${w.tags.map(t=>`<span class="tag">${t}</span>`).join('')}</div><div style="margin-top:12px;display:flex;gap:6px"><button class="cs-btn" onclick="runDeconstruct('${w.id}')">🧬 拆解</button><button class="cs-btn" onclick="runDirectFrom('${w.id}')">💡 方向</button><button class="cs-btn" onclick="runCompeteFor('${w.id}')">🎯 比赛</button><button class="cs-btn" onclick="runCritiqueFor('${w.id}')">🧐 审查</button></div></div>`
  }
  if(topDesigners.length){html+=`<b>👨‍🎨 推荐设计师</b><br>`;for(const d of topDesigners){html+=`<div class="card"><h3>${d.name_zh}（${d.name}）</h3><div class="tags">${d.tags.map(t=>`<span class="tag">${t}</span>`).join('')}</div><div class="meta"><b>擅长：</b>${d.best_for.join(' · ')}<br><b>代表作：</b>${d.代表作}</div></div>`}}
  if(topDesigners.length===0){html+=`<div class="meta">未找到完全匹配的设计师。试试换个关键词？</div>`}
  addMsg('agent',html);
}

// ═══ Engine 2: Deconstruct ═══
function runDeconstruct(qOrId){
  const w=works.find(x=>x.id===qOrId||qOrId.includes(x.title)||x.tags.some(t=>qOrId.includes(t)));
  if(!w){addMsg('agent','未找到对应作品。请先在灵感检索中找到作品，然后点卡片上的 <b>拆解</b> 按钮。');return}
  const refD=designers.find(d=>d.id===w.designer_ref);
  // Find similar works (same competition or same tags)
  const sameComp=works.filter(x=>x.id!==w.id&&x.competition);
  const similar=works.filter(x=>x.id!==w.id&&x.tags.some(t=>w.tags.includes(t))).slice(0,2);
  
  // Color reasoning
  const colorNames={'黑':'极简·权威·严肃','白':'纯净·留白·空间','红':'警示·热情·紧迫','蓝':'信任·冷静·科技','绿':'自然·环保·安全','金':'卓越·胜利·奢华','灰':'中性·克制·专业','橙':'活力·警示·年轻'};
  const colorReason=w.color_palette?w.color_palette.map(c=>colorNames[c]||c).join(' × '):'';
  
  // Design reasoning chain
  const chainPieces=[];
  if(w.technique)chainPieces.push(`技法选择：${w.technique}`);
  if(refD)chainPieces.push(`设计师体系：${refD.name_zh}的标志性手法是${refD.strategies[0]}，这件作品体现了${refD.tags.slice(0,2).join('和')}`);
  if(w.why_won)chainPieces.push(`获奖逻辑：${w.why_won}`);
  
  let html=`<b>🧬 深度拆解：${w.title}</b><br><br>
  <div class="card"><h3>📌 基本信息</h3><div class="meta"><b>比赛：</b>${w.competition}<br><b>类别：</b>${w.category}<br><b>主题：</b>${w.theme}</div></div>
  <div class="card"><h3>🔗 设计推理链</h3><div class="meta">${chainPieces.map((c,i)=>`${i+1}. ${c}`).join('<br>')}</div></div>
  <div class="card"><h3>🎨 色彩决策</h3><div class="meta">配色：${w.color_palette?w.color_palette.join(' · '):'未记录'}<br>语义分析：${colorReason}<br>选择逻辑：${w.color_palette&&w.color_palette.length<=3?'少色策略——不超过3个主色，视觉焦点清晰':'多色系统——每个颜色承担不同功能'}</div></div>
  <div class="card"><h3>📐 排版与层级</h3><div class="meta"><b>层级逻辑：</b>${w.hierarchy}<br><b>技术执行：</b>${w.technique}<br><b>视觉系统：</b>${w.visual_system}</div></div>`;
  
  if(refD)html+=`<div class="card"><h3>👨‍🎨 与设计师体系的关联</h3><div class="meta"><b>${refD.name_zh}（${refD.name}）</b><br>风格标签：${refD.tags.join(' · ')}<br>核心策略：${refD.strategies.slice(0,2).join('；')}<br>这件作品体现了：${refD.tags.filter(t=>w.tags.includes(t)).join('、')||'间接影响'}<br><b>对设计师的启示：</b>${refD.strategies[0]}手法可以延伸到${refD.best_for.slice(0,2).join('和')}领域</div></div>`;
  
  if(similar.length)html+=`<div class="card"><h3>📊 同类作品对比</h3><div class="meta">库中与你当前主题相似的 ${similar.length} 件作品：</div>${similar.map(s=>`<div class="meta" style="margin-top:8px;padding:8px;background:rgba(255,255,255,.03);border-radius:8px"><b>${s.title}</b>（${s.competition?.split('|')[0]||''}）<br>概念：${s.concept}<br>共同标签：${s.tags.filter(t=>w.tags.includes(t)).join(' · ')||'无直接重叠'}</div>`).join('')}</div>`;
  
  html+=`<div class="card"><h3>🏅 获奖本质</h3><div class="meta">${w.why_won}<br><br><b>这件作品告诉你：</b>${w.why_won.includes('不')?'最好的表达往往不是直接说——':'概念的力量远超技法的堆砌——'}${w.tags[0]||''}类的设计，评审看的是${w.competition?.includes('D&AD')?'概念的原创性':'执行的完成度'}。</div></div>`;
  
  addMsg('agent',html);
}

// ═══ Engine 3: Direct ═══
function runDirect(q){runDirectFrom(null,q)}
function runDirectFrom(workId,userQ){
  const w=workId?works.find(x=>x.id===workId):null;
  const q=userQ||(w?w.theme:'');
  // Extract theme keywords
  const sw=['我','想','做','找','一','个','张','件','的','是'];
  const themeChars=q.split('').filter(c=>!sw.includes(c)&&!/\s/.test(c)).join('');
  
  // Find relevant designers by theme matching - use broader substring matching
  let relevant=designers.filter(d=>{
    const hay=(d.tags.join(' ')+d.strategies.join(' ')+d.best_for.join(' ')).toLowerCase();
    // Use 2-char sliding window for Chinese matching
    for(let i=0;i<themeChars.length-1;i++){
      if(hay.includes(themeChars.slice(i,i+2)))return true;
    }
    return false;
  });
  if(relevant.length<3){relevant=[...relevant,...designers.filter(d=>!relevant.includes(d))].slice(0,3)}
  
  // Find relevant works
  const relWorks=works.filter(ww=>[...themeChars].some(c=>(ww.theme+ww.tags.join(' ')).includes(c))).slice(0,2);
  if(!relWorks.length)relWorks.push(...works.slice(0,2));
  
  // Generate theme-specific strategies
  const themeStrategyMap={
    '环保':[{angle:'反直觉美学',desc:'不展示伤害，展示消失的美——用灭绝物种做主角，让失去本身说话',visual:'NASA深空色调·手写字体·留白为主',ref:relevant[0]},{angle:'数据叙事',desc:'把环保数据变成视觉节奏——每张海报是一个物种的倒计时',visual:'网格系统·信息图形·红黑白',ref:relevant[1]||relevant[0]},{angle:'材料即概念',desc:'用回收塑料做成海报本身的材质——海报不只是在说环保，海报就是环保',visual:'实物造景·质地摄影·裸色',ref:relevant[2]||relevant[0]}],
    '品牌':[{angle:'符号减法',desc:'把品牌核心减到只剩一个符号',visual:'极简几何·单色·大量留白',ref:relevant[0]},{angle:'叙事系统',desc:'不是做一个logo，是做一套会讲故事的设计语言',visual:'多版式模板·定制字体·统一色板',ref:relevant[1]||relevant[0]},{angle:'文化嫁接',desc:'把地方文化符号嫁接到现代品牌系统中',visual:'传统纹样几何化·中西混排',ref:relevant[2]||relevant[0]}],
    '音乐':[{angle:'视觉噪音',desc:'让设计像音乐一样有音量——大胆的排版本身就是节奏',visual:'乱序排版·荧光色·拼贴',ref:relevant[0]},{angle:'专辑即物体',desc:'不是封面——是一个可以拿在手里的物件',visual:'实物造景·材质对比',ref:relevant[1]||relevant[0]},{angle:'音乐可视化',desc:'把音轨变成几何形态',visual:'同心圆·光谱·数学构图',ref:relevant[2]||relevant[0]}]
  };
  
  // Pick best matching strategy set
  let strategies=[];
  for(const[k,v]of Object.entries(themeStrategyMap)){
    if(themeChars.includes(k)||q.includes(k)){strategies=v;break}
  }
  if(!strategies.length){
    // Fallback: generic but relevant
    strategies=[{angle:'概念先行',desc:`从"${q}"的核心矛盾出发——找到最反常的那个角度`,visual:'黑白为主·极简排版·留白呼吸',ref:relevant[0]},{angle:'视觉放大',desc:'把一个细节放大到占据整个画面——让观众先被视觉击中',visual:'高反差·微距·满版',ref:relevant[1]||relevant[0]},{angle:'系统思维',desc:'不是一张海报，是一套视觉规则',visual:'网格系统·模块化·色彩编码',ref:relevant[2]||relevant[0]}];
  }
  
  let html=`<b>💡 创意方向：${q}</b><br><div class="meta" style="margin-bottom:12px">基于知识库中 ${relevant.length} 位相关设计师和 ${relWorks.length} 件参考作品推导</div>`;
  strategies.forEach((s,i)=>{
    html+=`<div class="card"><h3>方向 ${i+1}：${s.angle}</h3><div class="meta"><b>策略：</b>${s.desc}<br><b>视觉关键词：</b>${s.visual}<br><b>参考设计师：</b>${s.ref?.name_zh||'——'} —— ${s.ref?.strategies?.[0]||''}<br>${relWorks[i]?`<b>参考作品：</b>${relWorks[i].title}（${relWorks[i].why_won?.substring(0,30)}...）`:''}</div></div>`
  });
  html+=`<div class="meta" style="margin-top:8px">📌 以上方向基于你和知识库的匹配。选择其中一个，我可以进一步展开完整的视觉方案。</div>`;
  addMsg('agent',html);
}

// ═══ Engine 4: Compete ═══
function runCompete(q){runCompeteFor(null,q)}
function runCompeteFor(workId,userQ){
  const w=workId?works.find(x=>x.id===workId):null;
  let html=`<b>🎯 比赛推荐</b><br>`;
  if(w){html+=`<div class="meta" style="margin-bottom:12px">分析作品：<b>${w.title}</b>（类别：${w.category} · 标签：${w.tags.join(' ')}）</div>`}
  
  // Calculate weighted scores
  const results=[];
  for(const[k,c]of Object.entries(comps)){
    let score=0,reasons=[],risks=[];
    if(w){
      // Category match
      const catMatch=c.category_range.some(cat=>w.category.includes(cat)||cat.includes(w.category));
      if(catMatch){score+=c.weight.execution*5;reasons.push(`品类匹配（权重${(c.weight.execution*100).toFixed(0)}%）`)}
      else{risks.push('品类不完全匹配')}
      // Style match
      const styleMatch=c.prefers.some(p=>w.tags.some(t=>t.includes(p)||p.includes(t)));
      if(styleMatch){score+=c.weight.concept*5;reasons.push(`${c.name_zh}重视${Object.entries(c.weight).sort((a,b)=>b[1]-a[1])[0][0]==='concept'?'概念创新':'执行品质'}，与作品风格匹配`)}
      // Risk: avoid list
      if(c.avoid.some(a=>w.tags.some(t=>t.includes(a)||a.includes(t)))){
        risks.push(`作品风格可能触碰评审避讳：${c.avoid.filter(a=>w.tags.some(t=>t.includes(a)||a.includes(t))).join(' ')}`)
        score-=1;
      }
    }
    results.push({k,c,score,reasons,risks});
  }
  results.sort((a,b)=>b.score-a.score);
  
  for(const r of results){
    const c=r.c;
    const stars=r.score>8?'★★★':r.score>4?'★★':r.score>0?'★':'';
    html+=`<div class="card"><h3>${c.name}（${c.name_zh}）${stars}</h3><div class="meta">
      <b>适合品类：</b>${c.category_range.slice(0,4).join(' · ')}<br>
      <b>评分权重：</b>概念${(c.weight.concept*100).toFixed(0)}% · 执行${(c.weight.execution*100).toFixed(0)}% · 创新${(c.weight.innovation*100).toFixed(0)}%<br>
      ${r.reasons.length?`<b style="color:#4ade80">✓ 匹配：</b>${r.reasons.join('；')}<br>`:''}
      ${r.risks.length?`<b style="color:#f87171">⚠ 风险：</b>${r.risks.join('；')}<br>`:''}
      <b>偏好：</b>${c.prefers.join(' · ')}<br>
      <b>避讳：</b>${c.avoid.join(' · ')}</div><div class="tags">${c.tags.map(t=>`<span class="tag">${t}</span>`).join('')}</div></div>`;
  }
  if(!w)html+=`<br><div class="meta">请先检索或选择一件作品来获得精准推荐和风险分析。</div>`;
  addMsg('agent',html);
}

// ═══ Engine 5: Critique ═══
function runCritique(q){runCritiqueFor(null)}
function runCritiqueFor(workId){
  const w=workId?works.find(x=>x.id===workId):null;
  let html=`<b>🧐 设计审查</b><br>`;
  if(w){html+=`<div class="meta" style="margin-bottom:12px">审查作品：<b>${w.title}</b><br>视觉系统：${w.visual_system}<br>排版逻辑：${w.hierarchy}</div>`}
  
  // Map work category to relevant theory domains
  const catMap={'海报':['visual_flow','color','typography','grid'],'品牌':['color','typography','grid','gestalt'],'字体':['typography','grid'],'书籍':['typography','grid','visual_flow']};
  const relevantDomains=w?(catMap[w.category]||Object.keys(theory)):Object.keys(theory);
  
  let allChecks=[];
  for(const[k,th]of Object.entries(theory)){
    if(!relevantDomains.includes(k))continue;
    for(const c of th.checklist){
      // Add explanation based on the work context
      let explain='';
      if(c.weight==='fatal')explain='——违反此项会导致信息传达失败或视觉崩溃';
      else if(c.weight==='important')explain='——此项影响专业度和阅读体验';
      else explain='——此项是加分项，不影响基本可用性';
      allChecks.push({domain:k,domainName:th.name,check:c.check,weight:c.weight,explain});
    }
  }
  // Sort: fatal first
  allChecks.sort((a,b)=>({fatal:0,important:1,suggestion:2})[a.weight]-({fatal:0,important:1,suggestion:2})[b.weight]);
  
  // Group by domain
  let lastDomain='';
  for(const c of allChecks){
    if(c.domain!==lastDomain){html+=`<div style="font-size:13px;font-weight:600;color:#fff;margin-top:16px;margin-bottom:8px">${c.domainName}</div>`;lastDomain=c.domain}
    html+=`<div class="check"><span class="severity ${c.weight}">${c.weight==='fatal'?'致命':c.weight==='important'?'重要':'建议'}</span><span>${c.check}<span style="color:var(--muted);font-size:10px">${c.explain}</span></span></div>`
  }
  
  // Top 3 priorities
  const top3=allChecks.filter(c=>c.weight==='fatal').slice(0,3);
  if(top3.length){
    html+=`<div class="card" style="margin-top:16px"><h3>⚡ 优先修改</h3><div class="meta">${top3.map((c,i)=>`${i+1}. ${c.check}`).join('<br>')}</div></div>`;
  }
  
  if(!w)html+=`<br><div class="meta">请先检索或选择一件作品来获得针对性的审查建议。</div>`;
  addMsg('agent',html);
}

loadKB();
