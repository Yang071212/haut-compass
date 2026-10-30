import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {competitionStatus} from '../lib/collector.js';
const root=new URL('../',import.meta.url);
const school=JSON.parse(await readFile(new URL('../haut-research.json',root),'utf8'));
const github=JSON.parse(await readFile(new URL('../github-research.json',root),'utf8'));
const sources=[...school.sources.map(s=>({...s,kind:'campus',status:'pending',lastChecked:null,lastSuccessAt:null})),...github.frontierSources.map(s=>({...s,kind:'feed',category:'开源动态',description:'GitHub 官方版本发布记录',status:'pending',lastChecked:null,lastSuccessAt:null}))];
const competitions=school.competitions.map(c=>({...c,status:competitionStatus({...c,status:c.status==='正在报名'?'报名中':c.status}),verifiedAt:c.checkedAt}));
// The official AtCoder notice states the event start, rather than a date guessed from past editions.
for(const c of competitions)if(c.id==='atcoder-abc-481'){c.deadline=c.startAt;c.status='报名中';}
const sourceName=id=>sources.find(s=>s.id===id)?.name;
const campus=school.campus.map(c=>({...c,source:sourceName(c.sourceId),date:c.date?.slice(0,10)}));
const frontier=github.frontier.map(c=>({...c,date:c.date?.slice(0,10),sourceId:github.frontierSources.find(s=>s.api?.includes('/repos/'+c.repo+'/'))?.id}));
const openSource=[{repo:'lucide-icons/lucide',url:'https://github.com/lucide-icons/lucide',license:'ISC / MIT',use:'导航与操作图标'},{repo:'krisk/Fuse',url:'https://github.com/krisk/Fuse',license:'Apache-2.0',use:'模糊搜索'},{repo:'cheeriojs/cheerio',url:'https://github.com/cheeriojs/cheerio',license:'MIT',use:'官方网页解析'},{repo:'NaturalIntelligence/fast-xml-parser',url:'https://github.com/NaturalIntelligence/fast-xml-parser',license:'MIT',use:'订阅源解析'}];
const seed={updatedAt:null,initialVerifiedAt:github.meta.verifiedAt,lastAttemptAt:null,campus,projects:github.projects,competitions,frontier,sources,refreshing:false,health:{total:sources.length,ok:0,failed:0,partial:true,notice:'首次人工核验快照；正在准备自动抓取。公开聚合无法覆盖校内登录系统、班群及全部二级栏目。'},verification:school.verification,openSource,schedule:{time:'08:00',timezone:'Asia/Shanghai',enabled:false}};
await mkdir(new URL('data/',root),{recursive:true});
await writeFile(new URL('data/seed.json',root),JSON.stringify(seed,null,2)+'\n');
await writeFile(new URL('data/research-sources.json',root),JSON.stringify({school:school.verification,github:github.meta},null,2)+'\n');
console.log(JSON.stringify({sources:sources.length,campus:campus.length,projects:seed.projects.length,competitions:competitions.length,frontier:frontier.length}));
