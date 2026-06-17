const http=require('http'),https=require('https');
const PORT=process.env.PORT||9095;
const APP_ID='cli_aab8f90110ba9cc8';
const APP_SECRET='BBGn2cO02VNpZnAonZX8yf02Vi7X4COw';
const DEEPSEEK_KEY='sk-45859cf6b09c4d46acc71fdad1cfc68f';

const KB=`# 设计知识库 · 20位设计师 · 15件作品 · 5个比赛 · 审查清单

## 设计师（ID·姓名·标签·策略·擅长）
paula-scher|保拉·谢尔|后现代/信息密度/文字即图形|文字填充空间|品牌/海报/出版
kenya-hara|原研哉|极简/空寂/东方美学|留白即信息|生活方式/文化/包装
stefan-sagmeister|施德明|概念驱动/实验/身体艺术|用身体当画布|实验海报/音乐/艺术书
otl-aicher|奥托·艾舍|系统设计/图标/网格|模块化思维|导视/图标/企业
david-carson|大卫·卡森|解构/反设计/实验排版|打破网格|音乐/杂志/青年
tanaka|田中一光|日本传统/几何化/东西融合|传统纹样几何化|文化/和风/出版
josef-muller-brockmann|穆勒-布罗克曼|瑞士国际/网格/数学美学|网格即一切|海报/出版/展览
tibor-kalman|Tibor Kalman|社会设计/反消费主义|用设计讲社会议题|社会运动/NGO
henry-steiner|Henry Steiner|跨文化/中西融合|东西符号混用|亚洲品牌/银行
michael-bierut|Michael Bierut|大众设计/叙事/实用主义|清晰的叙事线|大型机构/公共

## 作品（ID·名称·比赛·策略·设计师）
w001|Plastic Ocean|D&AD石墨铅笔|废弃塑料纹理模拟濒危海洋生物|施德明
w002|Muji Horizons|iF金质奖|收集全球用户窗前景色做成书|原研哉
w003|Beethoven 250th|Red Dot最佳|几何圆形模拟交响乐曲谱|穆勒-布罗克曼
w004|Ray Gun Issue 39|AIGA封面|采访回答乱序排版|大卫·卡森
w005|Public Theater|Cannes金狮|街头粗体字占据所有空间|保拉·谢尔
w006|Nihon Buyo|Tokyo TDC大奖|传统舞伎脸做几何抽象|田中一光
w007|Things I Learned|D&AD黄铅笔|格言用实体造字方式书写|施德明
w011|Colors Race|D&AD杂志|不写文章只用肖像摄影|Tibor Kalman
w012|HSBC六角形|Red Dot品牌|六角形框统一全球分行|Henry Steiner
w013|Hillary 2016|AIGA政治|H+红色箭头的极简符号|Michael Bierut

## 比赛权重
Red Dot:概念30·执行40·创新30→商业系统
D&AD:概念50·执行20·创新30→大胆实验
Cannes:概念35·执行25·创新40→品牌叙事
Tokyo TDC:概念25·执行45·创新30→字体创新
iF:概念20·执行50·创新30→系统完整

## 审查清单（致命/重要/建议）
网格:[致命]基线对齐[重要]跨栏完整[建议]留白整数
格式塔:[致命]信息靠近性[重要]视觉区分[致命]第一眼焦点
动线:[致命]2秒找焦点[重要]无干扰
字体:[致命]≤3种字号[重要]行高≥1.4[致命]对比度≥4.5:1[建议]避13/15/17px
色彩:[重要]主色≤3[致命]语义匹配[重要]色盲不可分辨`;

const SYSTEM=`你是设计智能顾问。根据知识库提供分析。规则：
1. 提到"参考/灵感/我想做"→推荐2-3作品+2位设计师(说明为什么匹配)
2. 提到"分析/拆解"→从概念/视觉/排版/色彩四维度拆解，给设计推理链
3. 提到"方向/思路"→生成3个具体创意方向(含策略+视觉关键词+参考+风险)
4. 提到"比赛/参赛"→推荐比赛+匹配分+风险提示
5. 提到"审/检查/问题"→按清单逐项(致命/重要/建议)，列前3优先改
6. 不说"你可以这样""值得注意的是"→直接结论
7. 不知道说不知道，不编造
知识库:${KB}`;

// Chat history per chat (simple in-memory, lost on restart)
const hist=new Map();

function askDeepSeek(userMsg,chatId){
  const msgs=[{role:'system',content:SYSTEM}];
  if(!hist.has(chatId))hist.set(chatId,[]);
  const h=hist.get(chatId);
  h.push({role:'user',content:userMsg});
  msgs.push(...h.slice(-10));

  return new Promise((resolve,reject)=>{
    const body=JSON.stringify({model:'deepseek-chat',messages:msgs,temperature:.7,max_tokens:800});
    const r=https.request({hostname:'api.deepseek.com',path:'/v1/chat/completions',method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+DEEPSEEK_KEY,'Content-Length':Buffer.byteLength(body)}},res=>{
      let d='';res.on('data',c=>d+=c);res.on('end',()=>{
        try{const j=JSON.parse(d);const ans=j.choices[0].message.content;h.push({role:'assistant',content:ans});if(h.length>20)h.splice(0,2);resolve(ans)}catch(e){reject(e)}
      });
    });
    r.on('error',reject);r.write(body);r.end();
  });
}

// Get tenant access token for sending messages
async function getToken(){
  return new Promise((resolve,reject)=>{
    const body=JSON.stringify({app_id:APP_ID,app_secret:APP_SECRET});
    const r=https.request({hostname:'open.feishu.cn',path:'/open-apis/auth/v3/tenant_access_token/internal',method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},res=>{
      let d='';res.on('data',c=>d+=c);res.on('end',()=>{
        try{resolve(JSON.parse(d).tenant_access_token)}catch(e){reject(e)}
      });
    });
    r.on('error',reject);r.write(body);r.end();
  });
}

// Send message back to Feishu user
async function sendMsg(openId,text){
  const token=await getToken();
  const body=JSON.stringify({receive_id:openId,msg_type:'text',content:JSON.stringify({text})});
  return new Promise((resolve,reject)=>{
    const r=https.request({hostname:'open.feishu.cn',path:'/open-apis/im/v1/messages?receive_id_type=open_id',method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token,'Content-Length':Buffer.byteLength(body)}},res=>{
      let d='';res.on('data',c=>d+=c);res.on('end',()=>resolve());
    });
    r.on('error',reject);r.write(body);r.end();
  });
}

const server=http.createServer(async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');
  if(req.method==='OPTIONS'){res.writeHead(204);return res.end()}
  
  // Health check
  if(req.method==='GET'&&req.url==='/'){res.writeHead(200);return res.end('OK')}

  // Feishu event callback
  if(req.method==='POST'&&req.url==='/feishu'){
    let body='';req.on('data',c=>body+=c);
    req.on('end',async()=>{
      try{
        const data=JSON.parse(body);
        // URL verification challenge
        if(data.type==='url_verification'){
          res.writeHead(200,{'Content-Type':'application/json'});
          return res.end(JSON.stringify({challenge:data.challenge}));
        }
        // Message received
        if(data.header?.event_type==='im.message.receive_v1'){
          const event=data.event;
          const msg=event.message;
          if(msg?.message_type==='text'){
            const text=JSON.parse(msg.content).text;
            const openId=event.sender?.sender_id?.open_id;
            const chatId=event.message?.chat_id;
            // Answer with DeepSeek
            const answer=await askDeepSeek(text,chatId||openId);
            await sendMsg(openId,answer);
          }
        }
        res.writeHead(200,{'Content-Type':'application/json'});
        res.end(JSON.stringify({code:0}));
      }catch(e){
        console.error(e);
        res.writeHead(200,{'Content-Type':'application/json'});
        res.end(JSON.stringify({code:0}));
      }
    });
    return;
  }
  
  res.writeHead(404);res.end();
});

server.listen(PORT,()=>console.log('Design Agent :'+PORT));
