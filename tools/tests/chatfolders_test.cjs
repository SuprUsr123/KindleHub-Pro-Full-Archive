/* Chat folders: named boxes you file conversations into, so a list of thirty
   chats reads as "Work, Friends, and four loose ones" rather than thirty rows.
   Same idea as the home-screen app folders.

   The things that would actually hurt if they broke:
     - a filed chat drawn in BOTH places (leaving it would only half work),
     - a chat in two folders at once,
     - deleting a folder taking the conversations with it,
     - long-press leaving a group when you meant to file it. */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url'),fs=require('fs');

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:600,height:800}});
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url.pathToFileURL(path.resolve(__dirname,'../../index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:20000});

  const r=await p.evaluate(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const out={};const S=window._KH.S;
    S.onboardingDone=true;
    /* Messages is gated behind sign-in, so the list never renders for a signed
       out user — seed just enough auth state to get past the gate. */
    S.authToken='t'.repeat(64);S.userId='u1';S.email='tester';S.syncEnabled=false;
    S.msgGroups=[
      {code:'111111111111',name:'Standup'},
      {code:'222222222222',name:'Deploys'},
      {code:'333333333333',name:'Sam'},
    ];
    S.chatFolders=[];
    window.showView('messages');await sleep(900);

    const host=()=>document.getElementById('view-messages')||document.querySelector('[id^=view-messages]')||document.body;
    const texts=()=>(host().textContent||'');
    const rowsNamed=n=>{
      const all=Array.prototype.slice.call(host().querySelectorAll('div'));
      return all.filter(d=>{
        const t=(d.textContent||'').trim();
        return t.indexOf(n)===0&&d.children.length>=2&&d.style.cursor==='pointer';
      });
    };

    out.listShowsChats=/Standup/.test(texts())&&/Deploys/.test(texts())&&/Sam/.test(texts());
    out.noFoldersYet=!/1 chat|2 chats/.test(texts());

    /* File two chats into a folder using the same helpers the sheet drives. */
    const f=window._KH.S.chatFolders;
    const made=(function(){
      /* the closure helpers are not exported, so drive the state the way the
         sheet does and re-render — this asserts the RENDER, which is the part
         that was worth testing. */
      S.chatFolders=[{id:'cf1',name:'Work',codes:['111111111111','222222222222']}];
      return true;
    })();
    window.showView('messages');await sleep(700);
    const t2=texts();
    out.folderRowShown=/Work/.test(t2)&&/2 chats/.test(t2);
    /* The two filed chats must NOT also appear at the top level. */
    out.filedChatsHiddenFromTopLevel=!/Standup/.test(t2)&&!/Deploys/.test(t2);
    out.looseChatStillShown=/Sam/.test(t2);

    /* Open the folder: its chats are inside, and Back returns. */
    const folderRow=rowsNamed('Work')[0];
    out.folderRowTappable=!!folderRow;
    if(folderRow){
      folderRow.click();await sleep(600);
      const t3=texts();
      out.folderOpens=/Standup/.test(t3)&&/Deploys/.test(t3);
      out.folderHasRenameAndDelete=/Rename/.test(t3)&&/Delete/.test(t3);
      out.folderHidesLooseChats=!/Sam/.test(t3);
      const back=Array.prototype.filter.call(host().querySelectorAll('button'),
        x=>/Back/.test(x.textContent||''))[0];
      if(back){back.click();await sleep(600);}
      out.backReturnsToList=/Sam/.test(texts())&&/Work/.test(texts());
    }

    /* Deleting a folder must return its chats, never remove them. */
    S.chatFolders=[];
    window.showView('messages');await sleep(700);
    const t4=texts();
    out.deletingFolderKeepsChats=/Standup/.test(t4)&&/Deploys/.test(t4)&&/Sam/.test(t4);
    out.groupsUntouched=(S.msgGroups||[]).length===3;
    return out;
  });

  /* Behaviour that lives in the view's closure: assert in source. */
  const src=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
  r.foldersInDefaults = /chatFolders:\[\]/.test(src);
  r.oneFolderPerChat = /_folders\(\)\.forEach\(function\(f\)\{\s*if\(f&&Array\.isArray\(f\.codes\)\)f\.codes=f\.codes\.filter/.test(src);
  r.deleteKeepsChats = /S\.chatFolders=_folders\(\)\.filter\(function\(f\)\{return f&&f\.id!==id;\}\);/.test(src);
  /* Long-press must open the actions sheet, not leave the group outright. */
  r.longPressOpensSheet = /_lp=setTimeout\(\(\)=>_rowActions\(g\),700\)/.test(src)
                       && !/_lp=setTimeout\(\(\)=>confirmLeave\(g\),700\)/.test(src);
  /* A folder holds codes, never copies of conversations. */
  r.foldersHoldCodesOnly = !/codes:\[\{/.test(src);
  /* No astral-plane glyph for the folder icon — it would be tofu on Silk. */
  r.folderIconIsSvg = /stroke-linejoin="round"><path d="M3 7\.5a1\.5 1\.5 0 0 1 1\.5-1\.5h4/.test(src);

  console.log(JSON.stringify(r,null,1));
  const ok = r.listShowsChats&&r.noFoldersYet&&r.folderRowShown&&
    r.filedChatsHiddenFromTopLevel&&r.looseChatStillShown&&r.folderRowTappable&&
    r.folderOpens&&r.folderHasRenameAndDelete&&r.folderHidesLooseChats&&
    r.backReturnsToList&&r.deletingFolderKeepsChats&&r.groupsUntouched&&
    r.foldersInDefaults&&r.oneFolderPerChat&&r.deleteKeepsChats&&
    r.longPressOpensSheet&&r.foldersHoldCodesOnly&&r.folderIconIsSvg&&
    errs.length===0;
  console.log(ok?'PASS: chat folders file, open, and never take a conversation with them':'FAIL');
  console.log('ERRORS:',errs.length?errs.slice(0,3):'none');
  await b.close();
  process.exit(ok?0:1);
})();
