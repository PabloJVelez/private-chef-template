// Real built-Admin Chromium footage. All APIs are synthetic fixtures; no live model or writes.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve('apps/medusa/.medusa/server/public/admin');
const out = process.env.BTS21_PAGE_EVIDENCE_DIR || '/tmp/bts21-page-browser-evidence';
fs.mkdirSync(out, { recursive: true });
const base = 'http://127.0.0.1:9014';
const zone = 'America/Chicago', revision = 'a'.repeat(32);
const records = {
  'event-A': { id: 'event-A', title: 'QA ScheduleEdit', firstName: 'QA', lastName: 'ScheduleEdit', date: '2026-11-30', time: '14:00', instant: '2026-11-30T20:00:00.000Z' },
  'event-B': { id: 'event-B', title: 'QA RejectionK', firstName: 'QA', lastName: 'RejectionK', date: '2026-11-27', time: '10:00', instant: '2026-11-27T16:00:00.000Z' },
};
const target = id => ({ ...records[id], status: 'pending', revision, timezone: zone });
const context = ids => ({ candidates: ids.map(id => ({ id, revision })), observedAt: Date.now() });
const entry = id => { const r=records[id], interval={ start:r.instant,end:new Date(Date.parse(r.instant)+3600000).toISOString() }; return { id:'private-event:'+id,source:{type:'private-event',id},title:r.title,status:'pending',category:'Dinner',timeZone:zone,detailPath:'/chef-events/'+id,requestedTime:interval,displayTime:interval,appointmentTime:null,protectedTime:[] }; };
const range = {start:'2026-11-30T06:00:00.000Z',end:'2026-12-01T06:00:00.000Z'};
const readAnswer = () => ({ presentation:'answer',message:'You have one pending request, QA ScheduleEdit, on November 30, 2026 at 2:00 PM.',complete:true,entries:[entry('event-A')],timeZone:zone,range,editContext:context(['event-A']) });
const intent={target:'context',date:{kind:'day_of_month',day:26},time:null,clarification:'none'};
const server = http.createServer((req,res)=>{
 const url=new URL(req.url,base); const file=url.pathname.startsWith('/app/assets/')?path.join(root,'assets',path.basename(url.pathname)):path.join(root,'index.html');
 if(!url.pathname.startsWith('/app')||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
});
(async()=>{
 await new Promise(r=>server.listen(9014,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true});
 const browserContext=await browser.newContext({viewport:{width:1280,height:900},recordVideo:{dir:out,size:{width:1280,height:900}}});
 const page=await browserContext.newPage();const video=page.video();
 const writes=[],questions=[],errors=[],unknown=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{if(!localStorage.getItem('medusa_admin_theme'))localStorage.setItem('medusa_admin_theme','dark');});
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());if(url.origin!==base)return route.abort();if(url.pathname.startsWith('/app'))return route.continue();
  const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  if(url.pathname==='/admin/chef-ai/chat'){
   const body=req.postDataJSON();questions.push(body);
   if(body.selection){const id=body.selection.context.selectedId;assert(['event-A','event-B'].includes(id));return json({presentation:'proposal',entries:[],message:'Review this change before confirming.',editProposal:{eventId:id,expectedRevision:revision,date:'2026-11-26'}});}
   if(/move/i.test(body.message)){
    assert.equal(body.page?.resource?.id,'event-B');
    assert.equal(body.context?.candidates[0]?.id,'event-A');
    return json({presentation:'clarification',entries:[],message:'The event open on this page, or the event we just discussed?',editClarification:{intent,context:context(['event-B','event-A']),targets:['event-B','event-A'].map(target)}});
   }
   if(/^(yes|confirm)$/i.test(body.message))return json({entries:[],message:'Use Confirm change to save the preview.'});
   return json(readAnswer());
  }
  if(url.pathname.startsWith('/admin/chef-events/schedule-edit/')){
   const action=url.pathname.split('/').at(-1),body=req.postDataJSON();writes.push({action,body});
   assert.equal(action,'preview','Video must never send confirm or recover');
   const r=records[body.eventId];assert(r);
   const date=body.date||r.date,time=body.time||r.time;
   return json({target:{id:r.id,title:r.title,status:'pending',revision},reference:'synthetic-reference-never-valid-outside-fixture',operationId:'00000000-0000-4000-8000-000000000001',eventId:r.id,expectedRevision:revision,expiresAt:new Date(Date.now()+300000).toISOString(),current:{date:r.date,time:r.time,timezone:zone,instant:r.instant},proposed:{date,time,timezone:zone,instant:`${date}T${String(Number(time.slice(0,2))+6).padStart(2,'0')}:${time.slice(3)}:00.000Z`},reserved:false,googleAvailability:'advisory'});
  }
  const eventMatch=url.pathname.match(/^\/admin\/chef-events\/(event-[AB])$/);
  if(eventMatch){const r=records[eventMatch[1]];return json({chefEvent:{...r,requestedDate:r.instant,requestedTime:r.time,timeZone:zone,status:'pending',partySize:4,eventType:'Dinner',locationType:'customer_location',email:'fixture@example.invalid',phone:'',notes:'',specialRequirements:'',estimatedDuration:60,totalPrice:0,depositPaid:false,created_at:'2026-11-13T00:00:00Z',updated_at:'2026-11-13T00:00:00Z',templateProductId:null,experience_type_id:null}});}
  if(/^\/admin\/layouts\/(sidebar|topbar)\/configuration$/.test(url.pathname))return json({message:'No fixture layout'},404);
  const responses={
   '/admin/layouts/configurations':{configurations:[],count:0,limit:10,offset:0},
   '/admin/users/me':{user:{id:'synthetic-admin',email:'chef@example.invalid',first_name:'Chef',last_name:'Demo'}},
   '/admin/modules':{modules:[]},'/admin/feature-flags':{feature_flags:{}},
   '/admin/stores':{stores:[{id:'fixture-store',name:'Chef workspace',supported_currencies:[{currency_code:'usd',is_default:true}]}],count:1,limit:10,offset:0},
   '/admin/notifications':{notifications:[],count:0,limit:10,offset:0},
   '/admin/chef-workspace/calendar':{entries:Object.keys(records).map(entry),range,complete:true},
   '/admin/google-calendar':{status:'not_connected',pendingIncidents:[]},
   '/admin/menus':{menus:[],count:0,limit:10,offset:0},
   '/admin/experience-types':{experience_types:[],count:0,limit:10,offset:0},
  };
  if(url.pathname in responses)return json(responses[url.pathname]);
  unknown.push(req.method()+' '+url.pathname);return json({message:'Unmocked fixture route'},404);
 });
 const dialog=page.getByRole('dialog'), button=name=>dialog.getByRole('button',{name,exact:true});
 const pause=()=>page.waitForTimeout(1600);
 async function label(text){await page.evaluate(text=>{let e=document.getElementById('fixture-recording-label');if(!e){e=document.createElement('div');e.id='fixture-recording-label';e.style.cssText='position:fixed;top:6px;left:50%;transform:translateX(-50%);z-index:9999;background:#153e36;color:white;border:1px solid #58b49d;border-radius:6px;padding:7px 14px;font:12px system-ui;pointer-events:none;max-width:80vw';document.body.append(e);}e.textContent='SYNTHETIC FIXTURE · MODEL MOCKED · NO SAVES — '+text;},text);}
 async function open(){await page.getByRole('button',{name:'Ask Sous Chef',exact:true}).click();}
 async function ask(text){await dialog.getByRole('textbox',{name:'Schedule question'}).pressSequentially(text,{delay:42});await button('Send').click();await dialog.getByRole('status').filter({hasText:'Checking your request…'}).waitFor({state:'hidden'});await pause();}
 try {
  await page.goto(base+'/app/chef-events/event-B');await page.getByRole('heading',{name:'Edit Chef Event - QA RejectionK',exact:true}).waitFor();
  await label('Event B is open; ask about A');await open();await button('Expand Sous Chef').click();
  await ask('What do I have on November 30?');
  assert.equal(questions[0].page.resource.id,'event-B');
  const readText=await dialog.innerText();assert(readText.includes('November 30, 2026 at 2:00 PM'));
  assert.equal(await dialog.locator('article:visible').count(),0);
  await page.screenshot({path:path.join(out,'grounded-read.png')});
  await label('Conflicting page B + discussed A: choose before preview');
  await ask('Can you move this event to the 26th?');
  await dialog.getByText('The event open on this page, or the event we just discussed?',{exact:true}).waitFor();
  assert.equal(writes.length,0);await pause();await page.screenshot({path:path.join(out,'target-conflict.png')});
  await label('Choose B explicitly; preview is read-only');
  await button('Choose QA RejectionK (event-B)').click();await button('Confirm change').waitFor();
  assert.deepEqual(writes[0],{action:'preview',body:{eventId:'event-B',date:'2026-11-26'}});
  assert((await dialog.getByLabel('Verified editing target').innerText()).includes('Editing: QA RejectionK'));
  await button('Confirm change').scrollIntoViewIfNeeded();await pause();await page.screenshot({path:path.join(out,'verified-target-B.png')});
  await ask('yes');assert.equal(writes.filter(w=>w.action==='confirm').length,0);
  await label('Typing yes never saves; confirmation remains a button');await pause();
  await button('Cancel edit').click();
  await label('Explicitly editing A while on B remains allowed');
  const earlier=dialog.getByRole('button',{name:/Show .* earlier messages/});if(await earlier.count())await earlier.click();
  await dialog.getByRole('button',{name:'Change date/time',exact:true}).first().click();
  await dialog.getByLabel('Local time (optional)').fill('15:00');await button('Preview').click();await button('Confirm change').waitFor();
  assert.equal(writes.at(-1).body.eventId,'event-A');assert((await dialog.getByLabel('Verified editing target').innerText()).includes('Editing: QA ScheduleEdit'));await pause();
  await page.getByRole('link',{name:'Menus',exact:true}).first().click();await page.waitForURL('**/app/menus');
  await label('Menus page: the same assistant still answers schedule questions');await open();await ask('What do I have on November 30?');
  assert.equal(questions.at(-1).context,undefined);assert.equal(questions.at(-1).page,undefined);
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>localStorage.setItem('medusa_admin_theme','light'));await page.reload();await label('Mobile light theme: concise answer, no full card');await open();await ask('What do I have on November 30?');await pause();await page.screenshot({path:path.join(out,'mobile-grounded-read.png')});
  assert.equal(writes.filter(w=>w.action!=='preview').length,0);assert.deepEqual(errors,[]);assert.deepEqual(unknown,[]);
  const result={passed:true,fixture:true,liveModel:false,previewRequests:writes.length,confirmRequests:0,recoverRequests:0,browserErrors:errors,unmockedRoutes:unknown};
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 } finally {
  await browserContext.close();await video.saveAs(path.join(out,'sous-chef-page-awareness.webm'));await browser.close();server.close();
 }
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
