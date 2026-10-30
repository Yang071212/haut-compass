import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCampus,parseFeed,competitionStatus,collect,canonical,mergeLive,decodePage} from '../lib/collector.js';
const now=new Date('2026-10-23T15:00:00Z');
const source={id:'jwc',name:'教务处',url:'https://jwc.haut.edu.cn/',category:'教务通知'};
test('extract official notices, canonical URLs, dates; reject navigation and scripts',()=>{
 const html='<nav><a href="/info/1/3.htm">导航中的课程教学通知</a></nav><ul><li><span>2026-10-23</span><a href="info/10/100.htm#top" title="关于开展大学生程序设计竞赛的通知">通知</a></li><li><span>2026-10-23</span><a href="https://evil.example/info/1/2.htm">这是不属于学校的公告内容</a></li><li>2026-10-25<a href="/info/1/4.htm">未来日期不能显示成今日资讯</a></li></ul>';
 const data=parseCampus(html,source,now);assert.equal(data.length,1);assert.equal(data[0].date,'2026-10-23');assert.equal(data[0].category,'竞赛活动');assert.equal(data[0].url,'https://jwc.haut.edu.cn/info/10/100.htm');
 assert.equal(canonical('javascript:alert(1)'),null);
});
test('Atom alternate links and actual release dates',()=>{
 const data=parseFeed('<feed><entry><title>Library 1.0</title><link rel="self" href="https://github.com/feed"/><link rel="alternate" href="https://github.com/a/b/releases/tag/v1"/><published>2026-10-22T12:00:00Z</published></entry></feed>',{id:'lib',name:'Library',url:'https://github.com/a/b/releases.atom'},now);
 assert.equal(data.length,1);assert.equal(data[0].date,'2026-10-22');assert.match(data[0].url,/releases\/tag/);
});
test('deadline passes by Beijing date and unverified registration stays unverified',()=>{
 assert.equal(competitionStatus({deadline:'2026-10-22',status:'报名中'},now),'已截止');
 assert.equal(competitionStatus({deadline:'2026-10-23',status:'报名中'},now),'报名中');
 assert.equal(competitionStatus({deadline:null,status:'报名中'},now),'待核实');
 assert.equal(competitionStatus({deadline:'2026-10-23T22:30:00+08:00',status:'报名中'},now),'已截止');
 assert.equal(competitionStatus({deadline:'2026-10-23',status:'报名中'},new Date('2026-10-23T17:00:00Z')),'已截止');
});
test('source failure preserves previous records and reports failure without false success',async()=>{
 const old={id:'old',title:'已核实的校园通知',url:'https://jwc.haut.edu.cn/info/1/1.htm',sourceId:'jwc',date:'2026-10-20'};
 const prev={sources:[{...source,status:'ok',lastSuccessAt:'2026-10-20'}],campus:[old],projects:[{id:'p',repo:'a/b',url:'https://github.com/a/b',stars:123,verifiedAt:'2026-10-20'}],competitions:[]};
 const seed={sources:[source],projects:prev.projects,campus:[],frontier:[]};
 const data=await collect(prev,seed,{now,fetcher:async()=>{throw new Error('network down');}});
 assert.equal(data.campus[0].id,'old');assert.equal(data.projects[0].stars,123);assert.equal(data.projects[0].verifiedAt,'2026-10-20');assert.equal(data.sources[0].lastSuccessAt,'2026-10-20');assert.equal(data.health.ok,0);assert.equal(data.health.failed,1);assert.equal(data.health.partial,true);
});
test('a corrected official notice replaces stale fields while preserving reviewed summary',()=>{
 const url='https://jwc.haut.edu.cn/info/1/2.htm';
 const merged=mergeLive([{url,title:'旧标题',date:'2026-10-20',summary:'已核验的适用年级说明'}],[],[{url,title:'官方更正后的标题',date:'2026-10-23',summary:'通用抓取摘要'}]);
 assert.equal(merged[0].title,'官方更正后的标题');assert.equal(merged[0].date,'2026-10-23');assert.equal(merged[0].summary,'已核验的适用年级说明');
});
test('new curated competitions in a deployment are merged into an existing empty snapshot',async()=>{
 const c={id:'new',title:'新竞赛',url:'https://jwc.haut.edu.cn/info/1/3.htm',status:'待核实'};
 const data=await collect({sources:[],competitions:[]},{sources:[],projects:[],competitions:[c]},{now});
 assert.equal(data.competitions.length,1);assert.equal(data.competitions[0].id,'new');
});
test('daily refresh preserves the saved schedule and human review metadata',async()=>{
 const previous={sources:[],schedule:{enabled:true,time:'08:00',timezone:'Asia/Shanghai'},curatedAt:'2026-10-23T16:41:07Z'};
 const data=await collect(previous,{sources:[],projects:[],schedule:{enabled:false}},{now});
 assert.equal(data.schedule.enabled,true);assert.equal(data.curatedAt,previous.curatedAt);
});
test('UTF-8 bytes override stale GB2312 declarations; actual GBK still decodes',()=>{
 const html='<meta charset="gb2312"><a>体育学院开展新学期教学检查</a>';
 assert.equal(decodePage(new TextEncoder().encode(html).buffer,'text/html; charset=gb2312'),html);
 assert.equal(decodePage(Uint8Array.from([0xd6,0xd0,0xce,0xc4]).buffer,'text/html; charset=gbk'),'中文');
 assert.throws(()=>decodePage(Uint8Array.from([0xff]).buffer),/编码/);
});
test('a broken incoming title cannot overwrite an existing readable title',()=>{
 const url='https://pe.haut.edu.cn/info/1024/9023.htm';
 assert.equal(mergeLive([{url,title:'已核验校园马拉松通知'}],[],[{url,title:'鈥滀竷\uFFFD',date:'2026-10-23'}])[0].title,'已核验校园马拉松通知');
});
test('GitHub quota preserves verified fields and recovery clears the old error',async()=>{
 const project={id:'p',repo:'a/b',url:'https://github.com/a/b',stars:123,verifiedAt:'2026-10-20',status:'error',error:'旧错误'};
 const seed={sources:[],projects:[project]};
 const failed=await collect({},seed,{now,fetcher:async()=>new Response('',{status:403,headers:{'x-ratelimit-remaining':'0'}})});
 assert.equal(failed.projects[0].stars,123);assert.equal(failed.projects[0].verifiedAt,'2026-10-20');assert.equal(failed.health.partial,true);
 const recovered=await collect(failed,seed,{now,fetcher:async()=>Response.json({stargazers_count:125,pushed_at:'2026-10-22T00:00:00Z'})});
 assert.equal(recovered.projects[0].error,null);assert.equal(recovered.projects[0].status,'ok');assert.equal(recovered.projects[0].verifiedAt,now.toISOString());
});
