import { load } from 'cheerio/slim';
import { XMLParser } from 'fast-xml-parser';

const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
export const dayCN = (now = new Date()) => new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
export function canonical(raw, base) {
  try { const u = new URL(raw, base); if (!/^https?:$/.test(u.protocol)) return null; u.hash=''; for(const k of [...u.searchParams.keys()]) if (/^(utm_|spm|from)/i.test(k)) u.searchParams.delete(k); return u.href; } catch { return null; }
}
export function dateIn(text, now=new Date()) {
  const full=String(text).match(/(20\d{2})[年\-/.](\d{1,2})[月\-/.](\d{1,2})/);
  if(full) return `${full[1]}-${full[2].padStart(2,'0')}-${full[3].padStart(2,'0')}`;
  return null;
}
export function dedupe(items) {
  const seen=new Set(); return items.filter(i=>{const key=canonical(i.url); if(!key||seen.has(key))return false; seen.add(key); return true;});
}
export function mergeLive(previous, seed, fresh) {
  const map=new Map(dedupe([...previous,...seed]).map(i=>[canonical(i.url),i]));
  for(const item of fresh){const key=canonical(item.url);const old=map.get(key);const title=hasBrokenText(item.title)&&old?.title&&!hasBrokenText(old.title)?old.title:item.title;map.set(key,{...old,...item,title,date:item.date||old?.date||null,summary:old?.summary||item.summary});}
  return [...map.values()];
}
const hasBrokenText = text => /[\uFFFD\uE000-\uF8FF]/u.test(text||'');
// Some university pages declare GB2312 while serving UTF-8 bytes. A valid
// UTF-8 document must not be decoded again just because of that stale meta tag.
export function decodePage(buffer, contentType='') {
  try { return new TextDecoder('utf-8',{fatal:true}).decode(buffer); } catch {}
  const preview=new TextDecoder('latin1').decode(buffer.slice(0,5000));
  const declared=(contentType+' '+preview).match(/charset\s*=\s*["']?([\w-]+)/i)?.[1];
  if(declared && /^(gb2312|gbk|gb18030)$/i.test(declared))return new TextDecoder('gb18030',{fatal:true}).decode(buffer);
  // Fail instead of allowing replacement characters to overwrite reviewed text.
  throw new Error('页面编码无法可靠识别，保留上次记录');
}
export function parseCampus(html, source, now=new Date()) {
  const $=load(html); const items=[];
  $('script,style,nav,header,footer').remove();
  $('a[href]').each((_,el)=>{
    const a=$(el); const url=canonical(a.attr('href'),source.url);
    const title=clean(a.attr('title')||a.text());
    if(!url || title.length<9 || title.length>180 || !/[\u4e00-\u9fff]/.test(title))return;
    const host=new URL(url).hostname;
    if(!(host==='haut.edu.cn'||host.endsWith('.haut.edu.cn'))) return;
    if(!/\/(info|content|article)\/|\/module\/(?:newsdetail|campustalkdetail|recruitmentdetail)\/|\/\d{4,}\.htm(?:l)?|[?&](?:id|articleId)=/i.test(url))return;
    let date=null; let context=a;
    for(let level=0;level<4;level++) { const text=clean(context.text()); if(text.length>700)break; date=dateIn(text,now); if(date)break; context=context.parent(); }
    if(!date) date=dateIn(url,now);
    if(date && date>dayCN(now)) return;
    const category=/竞赛|大赛|挑战杯|创新创业/.test(title)?'竞赛活动': /考试|选课|教学|学籍|教务|课程|四六级/.test(title)?'教务通知': /奖学金|资助|评优|学生|心理|宿舍/.test(title)?'学生事务': /招聘|就业|实习/.test(title)?'就业实习': source.category||'校园动态';
    items.push({id:'campus-'+url,title,url,sourceId:source.id,source:source.name,date,category,summary:'来自'+source.name+'的公开信息，具体要求请查看官方原文。',collectedAt:now.toISOString()});
  });
  return dedupe(items).sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,24);
}
export function parseFeed(xml, source, now=new Date()) {
  const parser=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'@_',processEntities:true});
  const data=parser.parse(xml); const entries=data.feed?.entry||data.rss?.channel?.item||[];
  return (Array.isArray(entries)?entries:[entries]).slice(0,8).map(e=>{
    const links=Array.isArray(e.link)?e.link:[e.link];
    const link=links.find(l=>l?.['@_rel']==='alternate')||links[0];
    const url=canonical(typeof link==='string'?link:link?.['@_href'],source.url);
    const date=String(e.published||e.pubDate||e.updated||'');
    const parsedDate=Date.parse(date); const iso=Number.isFinite(parsedDate)?new Date(parsedDate).toISOString().slice(0,10):null;
    const rawTitle=typeof e.title==='object'?e.title['#text']:e.title;
    return {id:'tech-'+url,title:clean(rawTitle),url,date:iso,sourceId:source.id,source:source.name,category:source.category||'开源动态',summary:source.description||'查看官方发布记录与技术说明。',collectedAt:now.toISOString()};
  }).filter(x=>x.url&&x.title&&(!x.date||x.date<=dayCN(now)));
}
export function competitionStatus(item, now=new Date()) {
  const today=dayCN(now);
  if(item.deadline && /T\d{2}:\d{2}/.test(item.deadline) && Number.isFinite(Date.parse(item.deadline)) && Date.parse(item.deadline)<now.getTime()) return '已截止';
  if(item.deadline && /^\d{4}-\d{2}-\d{2}/.test(item.deadline) && item.deadline.slice(0,10)<today) return '已截止';
  if(item.status==='报名中' && !item.deadline) return '待核实';
  return item.status||'待核实';
}
async function pool(items, concurrency, fn) {
  const results=new Array(items.length);let index=0;
  await Promise.all(Array.from({length:Math.min(concurrency,items.length)},async()=>{while(index<items.length){const i=index++;try{results[i]=await fn(items[i],i);}catch(e){results[i]={error:e.message};}}}));return results;
}
async function fetchText(url, fetcher, json=false) {
  const res=await fetcher(url,{headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36','Accept':json?'application/vnd.github+json':'text/html,application/atom+xml,application/rss+xml;q=0.9,*/*;q=0.5'},signal:AbortSignal.timeout(15000),redirect:'follow'});
  if(!res.ok){if(res.status===403&&res.headers.get('x-ratelimit-remaining')==='0')throw new Error('GitHub API 配额暂时用尽，保留上次核验数据');throw new Error('HTTP '+res.status);}
  if(json)return res.json();
  const buf=await res.arrayBuffer(); if(buf.byteLength>4_000_000)throw new Error('页面超过读取上限');
  const txt=decodePage(buf,res.headers.get('content-type')||'');
  if(/访问验证|访问频繁|人机验证|验证码验证|Checking your browser|Just a moment\.\.\./.test(txt.slice(0,20000)))throw new Error('网站需要访问验证');
  if(/统一认证中心跳转|webvpn\.haut\.edu\.cn\/rump_frontend/.test(txt.slice(0,10000)))throw new Error('该页面需要学校统一认证或校园网/VPN');
  return txt;
}
export async function collect(previous, seed, options={}) {
  const now=options.now||new Date();const fetcher=options.fetcher||fetch;
  const at=now.toISOString(); const sourceDefs=seed.sources||[];
  const results=await pool(sourceDefs,8,async source=>{
    try {
      const html=await fetchText(source.url,fetcher);
      const items=source.kind==='feed'?parseFeed(html,source,now):parseCampus(html,source,now);
      if(!items.length)throw new Error('未识别到列表，保留上次记录；请查看原站');
      return {source:{...source,status:'ok',lastChecked:at,lastSuccessAt:at,error:null},items};
    } catch(e){const old=(previous.sources||[]).find(s=>s.id===source.id);return {source:{...source,status:'error',lastChecked:at,lastSuccessAt:old?.lastSuccessAt||null,error:e.message},items:null};}
  });
  let campus=[];let frontier=[]; const sources=[];
  for(const r of results){if(!r.source)continue;sources.push(r.source);const key=r.source.kind==='feed'?'frontier':'campus'; const items=r.items||(previous[key]||[]).filter(i=>i.sourceId===r.source.id); if(key==='campus')campus.push(...items);else frontier.push(...items);}
  // Human-verified initial records remain available when the upstream list cannot be read.
  campus=mergeLive(previous.campus||[],seed.campus||[],campus).sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,400);
  frontier=mergeLive(previous.frontier||[],seed.frontier||[],frontier).sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,80);
  const projectDefs=[...(previous.projects||[]),...(seed.projects||[])].filter((p,i,all)=>all.findIndex(q=>q.repo===p.repo)===i).slice(0,30);
  const projectResults=await pool(projectDefs,5,async project=>{
    const old=(previous.projects||[]).find(p=>p.repo===project.repo)||project;
    try{const repo=await fetchText('https://api.github.com/repos/'+project.repo,fetcher,true);return {...project,stars:repo.stargazers_count,language:repo.language||project.language,license:repo.license?.spdx_id||project.license,url:repo.html_url||project.url,pushedAt:repo.pushed_at,verifiedAt:at,status:'ok',error:null};}
    catch(e){return {...old,status:'error',error:e.message};}
  });
  // New official competition notices are added without claiming registration eligibility.
  const competitions=dedupe([...(previous.competitions||[]),...(seed.competitions||[])]).map(c=>({...c,status:competitionStatus(c,now)}));
  for(const n of campus.filter(n=>n.category==='竞赛活动')){
    if(competitions.some(c=>canonical(c.url)===canonical(n.url)))continue;
    if(n.date && (now-new Date(n.date))/86400000>120)continue;
    competitions.push({id:'notice-'+n.id,title:n.title,url:n.url,source:n.source||sources.find(s=>s.id===n.sourceId)?.name,deadline:null,status:'待核实',category:'校内通知',description:'新发现的官方竞赛相关通知；是否开放报名、适用年级和截止日期请阅读原文。',fit:'先核对参赛范围及报名方式',eligibility:'以官方通知为准',date:n.date});
  }
  const ok=sources.filter(s=>s.status==='ok').length;
  return {...seed,schedule:previous.schedule||seed.schedule,curatedAt:previous.curatedAt||null,updatedAt:at,lastAttemptAt:at,campus,frontier,projects:projectResults.filter(x=>x.repo),competitions,sources,refreshing:false,health:{total:sources.length,ok,failed:sources.length-ok,projectsOk:projectResults.filter(p=>p.status==='ok').length,partial:ok<sources.length||projectResults.some(p=>p.status!=='ok'),notice:'公开渠道聚合，受限站点保留上次内容；不代表学校所有信息，报名以官方原文为准。'}};
}
