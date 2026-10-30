import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const base='http://127.0.0.1:4318';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-proxy-server']});
const errors=[];const report=[];
await mkdir(new URL('../test-results/',import.meta.url),{recursive:true});
for(const width of [1440,390]){
 const context=await browser.newContext({viewport:{width,height:1000},isMobile:width===390,deviceScaleFactor:1});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base,{waitUntil:'domcontentloaded'});await page.locator('.hero').waitFor();
 assert.equal(await page.locator('.stat-card').count(),4);
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 assert.equal(overflow,false,'layout overflow at '+width);
 await page.screenshot({path:fileURLToPath(new URL(`../test-results/overview-${width}.png`,import.meta.url)),fullPage:true});
 await page.locator('#global-search').fill('TheAlgorithms');
 await page.waitForFunction(()=>document.querySelector('#breadcrumb-current').textContent==='搜索结果');
 await page.locator('#content .project-card').filter({hasText:'TheAlgorithms/C'}).locator('[data-action="save"]').click();
 await page.waitForFunction(()=>document.querySelector('#saved-count').textContent==='1');
 await page.keyboard.press('Escape');
 await page.evaluate(()=>location.hash='saved');
 await page.waitForFunction(()=>document.querySelector('#content').textContent.includes('C 算法实践'));
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#content').textContent.includes('C 算法实践'));
 await page.locator('#content article[data-action="detail"]').first().click();
 await page.locator('#detail-drawer').waitFor({state:'visible'});
 assert.match(await page.locator('#detail-drawer').textContent(),/从这里开始|入手|开始/);
 await page.keyboard.press('Escape');await page.locator('#detail-drawer').waitFor({state:'hidden'});
 for(const hash of ['campus','projects','competitions','frontier','sources']){
   await page.evaluate(h=>location.hash=h,hash);
   await page.waitForFunction(h=>location.hash==='#'+h&&document.querySelector('#content').getAttribute('aria-busy')==='false',hash);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,hash+' overflow '+width);
 }
 const manifest=await (await context.request.get(base+'/manifest.webmanifest')).json();assert.equal(manifest.display,'standalone');
 assert.equal((await context.request.get(base+'/icon-192.png')).status(),200);
 await page.evaluate(()=>location.hash='overview');await page.locator('.hero').waitFor();
 if(width===390){await page.locator('.mobile-bottom-nav [data-action="menu"]').click();assert.match(await page.locator('#sidebar').getAttribute('class'),/open/);await page.keyboard.press('Escape');}
 await page.context().setOffline(true);await page.reload({waitUntil:'domcontentloaded'});await page.locator('.hero').waitFor({timeout:10000});
 report.push({width,noOverflow:true,search:true,savedAfterReload:true,drawer:true,allViews:true,manifest:true,offline:true});
 await context.close();
}
await browser.close();assert.deepEqual(errors,[]);await writeFile(new URL('../test-results/ui-report.json',import.meta.url),JSON.stringify({report,errors},null,2));console.log(JSON.stringify({report,errors},null,2));
