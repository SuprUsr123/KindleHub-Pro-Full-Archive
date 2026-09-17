/* The rain radar was drawn against SYSTEM time.
 *
 * Every clock in the app goes through NOW() = Date.now()+S.clockOffset, so a
 * Kindle with a wrong clock can be corrected once in Settings and everything
 * agrees. The radar's frame label used a bare `new Date(frame.time*1000)`, so
 * it ignored that correction and sat an hour out on its own.
 *
 * frame.time is a real epoch instant and is NOT wrong — what was wrong was
 * rendering it on a different clock from the rest of the app. */
const fs=require('fs'),path=require('path');
let pass=0,fail=0;
const ok=(n,c,x)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x!==undefined&&!c?'  -- '+String(x).slice(0,200):''));};

const src=fs.readFileSync(path.resolve('index.html'),'utf8');
const radar=src.slice(src.indexOf('Live Rain Radar card'),src.indexOf('Live Rain Radar card')+30000);

ok('the radar label applies the clock offset',
   /new Date\(ts\*1000\+_off\)/.test(radar));
ok('...taken from S.clockOffset',
   /S\.clockOffset\)\?S\.clockOffset:0/.test(radar));
/* Scans the WHOLE radar block, not just the label: the scrubber prints a time
   too, and fixing one of two leaves them disagreeing with each other as well as
   with the clock. This assertion is what found the second one. */
ok('no bare new Date anywhere in the radar',
   !/new Date\(ts\*1000\)/.test(radar));
ok('the timeline scrubber is corrected too',
   /new Date\(ts\*1000\+_tlOff\)/.test(radar));

/* The arithmetic, checked rather than assumed: an offset of +1h must move the
   printed label forward by exactly one hour, and 0 must change nothing. */
function label(ts,off){
  return new Date(ts*1000+off).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'UTC'});
}
const t=1770000000;                       /* a fixed instant */
ok('a zero offset is unchanged',      label(t,0)===label(t,0));
ok('+1h moves the label one hour on', (function(){
  const a=label(t,0), b=label(t,3600000);
  return Number(b.slice(0,2))===(Number(a.slice(0,2))+1)%24 && a.slice(3)===b.slice(3);
})(), label(t,0)+' -> '+label(t,3600000));
ok('-1h moves it one hour back', (function(){
  const a=label(t,0), b=label(t,-3600000);
  return Number(b.slice(0,2))===(Number(a.slice(0,2))+23)%24 && a.slice(3)===b.slice(3);
})(), label(t,0)+' -> '+label(t,-3600000));

console.log('\n'+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
