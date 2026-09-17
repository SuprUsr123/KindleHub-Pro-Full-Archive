/* Moderation must not ban real people on junk evidence.
   Two real incidents drove this: a user banned for "severe harassment" over an
   encrypted FLIPBOOK payload (opaque machine text the model pattern-matched into
   a violation), and a well-liked regular banned outright. So:
     - machine/encoded text never reaches the model as if it were evidence;
     - a BAN verdict must quote text that REALLY APPEARS in the report;
     - autonomous banning is OFF unless AUTO_MOD_BAN is explicitly set.

   Run: node --experimental-sqlite tools/tests/modsafety_test.mjs */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const src=fs.readFileSync(path.resolve(__dirname,'../../api-worker.js'),'utf8');

let pass=0,fail=0;
const ok=(n,c,extra)=>{if(c){pass++;console.log('PASS '+n);}else{fail++;console.log('FAIL '+n+(extra!==undefined?('  -- '+String(extra).slice(0,200)):''));}};

/* pull the real helper out of the worker source so we test the shipped code */
const m=src.match(/function modIsUnreadable\(s\)\{[\s\S]*?\n\}/);
ok('modIsUnreadable exists in the worker', !!m);
const modIsUnreadable=new Function('return ('+m[0]+')')();

/* ── things that are NOT evidence and must be treated as unreadable ── */
const junk=[
  'KHFLIP1:eyJmcmFtZXMiOlt7ImQiOiJkYXRhOmltYWdlL3BuZyJ9XX0=',
  'KHAPP1:eyJuYW1lIjoiVGVzdCJ9',
  'KHIMG1:data',
  'q3VBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk',
  '',
  '   ',
  '!!!???...',
  '8a7f3c2b9d1e4f6a0b5c8d2e7f1a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6',
];
let junkOk=true;
for(const j of junk) if(!modIsUnreadable(j)){junkOk=false;console.log('   not flagged:',JSON.stringify(j.slice(0,50)));}
ok('encoded / app-code / base64 / empty "evidence" is treated as unreadable', junkOk);

/* ── real human complaints must STILL be judged (no over-blocking) ── */
const real=[
  'he keeps calling me names in the global chat and wont stop',
  'This user sent me a threatening message saying he would find me',
  'spamming the same link over and over again in every room',
];
let realOk=true;
for(const rr of real) if(modIsUnreadable(rr)){realOk=false;console.log('   wrongly flagged:',rr);}
ok('genuine human-written reports are still judged (not over-blocked)', realOk);

/* ── the prompt itself must be conservative ── */
const promptFn=(src.match(/function modPrompt\(reportText, name\)\{[\s\S]*?\n\}/)||[''])[0];
ok('the prompt defaults to IGNORE', /default answer is IGNORE/i.test(promptFn));
ok('the prompt requires a VERBATIM quote before any BAN', /VERBATIM|exact quote/i.test(promptFn)&&/EVIDENCE:/.test(promptFn));
ok('the prompt says encoded/machine text is not evidence',
   /Encoded, encrypted, garbled or machine-generated text/i.test(promptFn));
ok('the prompt says an unusual username is not a violation', /nonsense USERNAME is NOT a violation|silly, misspelled or nonsense/i.test(promptFn));
ok('the prompt says unsure => ESCALATE', /unsure[^.]*ESCALATE/i.test(promptFn));

/* ── the runner must verify the quote and gate autonomous bans ── */
const runner=(src.match(/async function runAutoModeration\(DB, env\)\{[\s\S]*?\n\}\n/)||[''])[0];
ok('unreadable reports are skipped before the model is called', /modIsUnreadable\(cleanText/.test(runner));
ok('a BAN verdict is checked against text that really appears in the report',
   /EVIDENCE:\s*\\s\*"/.test(runner)||/EVIDENCE:/.test(runner));
ok('...and an unquotable BAN is downgraded to human review', /could not quote real evidence/i.test(runner));
ok('autonomous banning is OFF unless AUTO_MOD_BAN is set', /AUTO_MOD_BAN/.test(runner)&&/awaiting admin approval/i.test(runner));

/* ── the client mirror must agree ── */
const client=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
ok('the client has the same unreadable-evidence guard', /function _khUnreadableEvidence\(s\)\{/.test(client));
ok('...and short-circuits to IGNORE on machine text', /no readable evidence \(looks like app\/encoded content/.test(client));
ok('...and its prompt also defaults to IGNORE', /Your default answer is IGNORE/.test(client));

console.log('\n'+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
