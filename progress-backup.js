/* Gomoku adapter for the Games Chest backup envelope. Existing ledgers remain authoritative. */
(function(root,factory){
 const node=typeof module==='object'&&module.exports;
 const api=factory(node?require('./results.js'):root.FiveResults,node?require('./achievements.js'):root.FiveAchievements);
 if(node)module.exports=api;else root.FiveProgressBackup=api;
})(globalThis,(scoring,awards)=>{
 const rewardIds=['orange-grove','copper','night-sky'];
 const rules=[{goal:3,metric:'finished'},{goal:5,metric:'wins',legacyGoal:3},{goal:10,metric:'wins',legacyGoal:10}];
 const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
 const exact=(v,keys)=>object(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
 const id=v=>typeof v==='string'&&v.length>0&&v.length<=256;
 const list=v=>Array.isArray(v)&&v.every(id)&&new Set(v).size===v.length;
 const subset=(small,large)=>{const set=new Set(large);return small.every(i=>set.has(i));};
 const validResults=v=>object(v)&&Object.entries(v).every(([key,r])=>id(key)&&exact(r,['outcome','reason'])&&
  ['win','loss','draw','unknown'].includes(r.outcome)&&['natural','replaced','legacy'].includes(r.reason)&&
  (r.reason!=='replaced'||r.outcome==='loss')&&(r.outcome!=='unknown'||r.reason==='legacy'));
 function validAchievements(v){
  if(Array.isArray(v))return list(v); // Early Gomoku completion-ID array.
  return exact(v,['finished','wins','legacyCompleted'])&&list(v.finished)&&list(v.wins)&&
   subset(v.wins,v.finished)&&Number.isSafeInteger(v.legacyCompleted)&&v.legacyCompleted>=0&&v.legacyCompleted<=v.finished.length;
 }
 function validProgress(v){
  return exact(v,['results','achievements','unlockedThemes'])&&validResults(v.results)&&validAchievements(v.achievements)&&
   list(v.unlockedThemes)&&v.unlockedThemes.every(i=>rewardIds.includes(i));
 }
 function capture(results,achievements,unlocked=[]){
  const progress=awards.restoreProgress(awards.serializeProgress(achievements));
  const set=new Set([...unlocked,...(achievements.unlockedThemes??[])]);
  rewardIds.forEach((i,n)=>{if(awards.rewardProgress(progress,rules[n]).unlocked)set.add(i);});
  const ledger=scoring.restoreResults(results);
  for(const key of progress.finished)if(!Object.hasOwn(ledger,key))ledger[key]={outcome:progress.wins.has(key)?'win':'unknown',reason:'legacy'};
  return {results:ledger,achievements:{finished:[...progress.finished],wins:[...progress.wins],legacyCompleted:progress.legacyCompleted},unlockedThemes:rewardIds.filter(i=>set.has(i))};
 }
 function merge(current,incoming){
  current=capture(current.results,awards.restoreProgress(current.achievements),current.unlockedThemes);
  const raw=incoming.progress??incoming;
  const right=capture(raw.results,awards.restoreProgress(raw.achievements),raw.unlockedThemes);
  const results=scoring.restoreResults({...right.results,...current.results});
  const a=awards.restoreProgress(current.achievements),b=awards.restoreProgress(right.achievements);
  const finished=new Set([...a.finished,...b.finished]),wins=new Set([...a.wins,...b.wins]);
  // Outcome conflicts use the target device's ledger, also for achievement membership.
  for(const [key,r]of Object.entries(results)){
   if(r.reason==='replaced'){finished.delete(key);wins.delete(key);}
   else {finished.add(key);if(r.outcome==='win')wins.add(key);else wins.delete(key);}
  }
  const achievements=awards.restoreProgress({finished:[...finished],wins:[...wins],legacyCompleted:Math.max(a.legacyCompleted,b.legacyCompleted)});
  // Capture each side's already earned rewards before reconciling conflicting records.
  const leftUnlock=capture(current.results,a,current.unlockedThemes).unlockedThemes;
  const rightUnlock=capture(right.results,b,right.unlockedThemes).unlockedThemes;
  const merged=capture(results,achievements,[...leftUnlock,...rightUnlock]);
  const conflicts=Object.entries(right.results).filter(([key,r])=>Object.hasOwn(current.results,key)&&
   (r.outcome!==current.results[key].outcome||r.reason!==current.results[key].reason)).length;
  return {...merged,conflicts};
 }
 function summary(v){
  const a=awards.restoreProgress(v.achievements),records=Object.values(v.results);
  return {finished:a.finished.size,wins:a.wins.size,losses:records.filter(r=>r.outcome==='loss').length,
   draws:records.filter(r=>r.outcome==='draw').length,unlocked:v.unlockedThemes.length,legacyCompleted:a.legacyCompleted};
 }
 const readLegacy=()=>{throw Object.assign(Error('invalid'),{code:'invalid'});};
 return {rewardIds,validProgress,validResults,validAchievements,capture,merge,summary,readLegacy};
});
