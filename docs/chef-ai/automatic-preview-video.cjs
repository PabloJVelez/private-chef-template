// Real built-Admin Chromium footage. All APIs are synthetic fixtures; no live model or writes.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve('apps/medusa/.medusa/server/public/admin');
const out = process.env.BTS21_AUTO_EVIDENCE_DIR || '/tmp/bts21-auto-video-evidence';
fs.mkdirSync(out, { recursive: true });
const base = 'http://127.0.0.1:9015';
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
 await new Promise(r=>server.listen(9015,'127.0.0.1',r));
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
   if(body.message==='hello') return json({presentation:'answer',entries:[],message:'Hey Chef! What can I help you with?'});
   if(body.message==='what can you help me with?') return json({presentation:'answer',entries:[],message:'I can show your schedule, explain the event open on this page, and help change a pending event’s date or time. You review the change and use Confirm change to save it.'});
   if(body.message==="what's this event about?") {
     assert.equal(body.page?.resource.id,'event-B');
     return json({presentation:'answer',entries:[],message:'Here is the recorded event.',summary:{...entry('event-B'),guestCount:4}});
   }
   if(/noon/i.test(body.message)) {
     assert.equal(body.page?.resource.id,'event-B');
     return json({presentation:'proposal',entries:[],message:'Review this change before confirming.',editProposal:{eventId:'event-B',expectedRevision:revision,time:'12:00'}});
   }
   if(/^(yes|confirm)$/i.test(body.message))return json({entries:[],message:'Use Confirm change to save the preview.'});
   return json(readAnswer());
  }
  if(url.pathname.startsWith('/admin/chef-events/schedule-edit/')){
   const action=url.pathname.split('/').at(-1),body=req.postDataJSON();writes.push({action,body});
   assert.equal(action,'preview','Video must never send confirm or recover');
   const r=records[body.eventId];assert(r);
   if(body.time==='12:00') return json({code:'slot_unavailable',message:'That arrival time is no longer available. Please choose another time.',proposal:{eventId:r.id,title:r.title,revision,date:r.date,time:body.time,timezone:zone}},422);
   await new Promise(resolve=>setTimeout(resolve,1100)); // Visible read-only check, no automatic save.
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
 async function label(text){await page.evaluate(text=>{let e=document.getElementById('fixture-recording-label');if(!e){e=document.createElement('div');e.id='fixture-recording-label';e.style.cssText='position:fixed;top:6px;left:50%;transform:translateX(-50%);z-index:9999;background:#153e36;color:white;border:1px solid #58b49d;border-radius:6px;padding:7px 14px;font:12px system-ui;pointer-events:none;max-width:80vw';document.body.append(e);}e.textContent='SYNTHETIC FIXTURE · API FIXTURES · MODEL MOCKED · NO SAVES — '+text;},text);}
 async function open(){await page.getByRole('button',{name:'Ask Sous Chef',exact:true}).click();}
 async function ask(text){await dialog.getByRole('textbox',{name:'Schedule question'}).pressSequentially(text,{delay:42});await button('Send').click();await dialog.getByRole('status').filter({hasText:'Checking your request…'}).waitFor({state:'hidden'});await pause();}
 try {
  await page.goto(base+'/app/chef-events/event-B');await page.getByRole('heading',{name:'Edit Chef Event - QA RejectionK',exact:true}).waitFor();
  await label('Greeting and help are concise; explicit page B summary');await open();await button('Expand Sous Chef').click();
  await ask('hello');assert((await dialog.innerText()).includes('Hey Chef!'));
  await ask('what can you help me with?');
  await ask("what's this event about?");
  assert((await dialog.innerText()).includes('QA RejectionK'));
  assert((await dialog.innerText()).includes('November 27, 2026 at 10:00 AM'));
  assert.equal(writes.length,0);
  await page.screenshot({path:path.join(out,'greeting-summary-dark-desktop.png')});
  await label('Noon refused by fixture policy; requested noon stays editable');
  await ask('hello, move this event to noon');
  await dialog.getByText("Noon on Nov 27 isn't available for QA RejectionK. No change was made. Choose another time.",{exact:true}).waitFor();
  assert.equal(await button('Confirm change').count(),0);
  const time=dialog.getByLabel('Local time (optional)');
  assert.equal(await time.inputValue(),'12:00');
  assert.deepEqual(writes,[{action:'preview',body:{eventId:'event-B',time:'12:00'}}]);
  assert.equal(await button('Preview').count(),0);
  await page.screenshot({path:path.join(out,'noon-refusal-dark-desktop.png')});await pause();
  await label('Chef manually chooses 5 PM; automatic check, no Preview button');
  await time.fill('17:00');await time.focus();
  assert.equal(await button('Confirm change').count(),0);
  await dialog.getByText('Checking availability…',{exact:true}).waitFor();
  assert.equal(await button('Confirm change').count(),0);
  await button('Confirm change').waitFor();
  assert(await time.evaluate(el=>document.activeElement===el),'Auto check must not steal keyboard focus');
  assert.deepEqual(writes.at(-1),{action:'preview',body:{eventId:'event-B',time:'17:00'}});
  assert((await dialog.getByLabel('Verified editing target').innerText()).includes('Editing: QA RejectionK'));
  assert((await dialog.getByLabel('Schedule change preview').innerText()).includes('5:00 PM'));
  await page.keyboard.press('Enter');assert.equal(writes.length,2);
  await button('Confirm change').scrollIntoViewIfNeeded();
  await label('Validated 10 AM → 5 PM. Only Confirm change saves; we do not click it');await pause();
  await page.screenshot({path:path.join(out,'automatic-ready-dark-desktop.png')});
  await ask('yes');assert.equal(writes.length,2);
  for(const theme of ['light','dark']) {
    for(const width of [390,320]) {
      await page.setViewportSize({width,height:844});await page.evaluate(theme=>localStorage.setItem('medusa_admin_theme',theme),theme);await page.reload();
      await label(`${theme} mobile: same read-only refusal and automatic check`);await open();await ask('move this event to noon');
      await dialog.getByText("Noon on Nov 27 isn't available for QA RejectionK. No change was made. Choose another time.",{exact:true}).waitFor();
      await time.fill('17:00');await button('Confirm change').waitFor();
      assert(await time.evaluate(el=>document.activeElement===el));
      assert(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth));
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await button('Confirm change').scrollIntoViewIfNeeded();
      await page.screenshot({path:path.join(out,`automatic-ready-${theme}-${width}.png`)});
      await page.keyboard.press('Escape');assert.equal(await button('Confirm change').count(),0);assert(await dialog.isVisible());
      await page.keyboard.press('Escape');assert.equal(await dialog.count(),0);
    }
  }
  assert.equal(writes.filter(w=>w.action!=='preview').length,0);assert.deepEqual(errors,[]);assert.deepEqual(unknown,[]);
  const result={passed:true,fixture:true,liveModel:false,previewRequests:writes.length,confirmRequests:0,recoverRequests:0,browserErrors:errors,unmockedRoutes:unknown};
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 } finally {
  await browserContext.close();await video.saveAs(path.join(out,'automatic-preview.webm'));await browser.close();server.close();
 }
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
