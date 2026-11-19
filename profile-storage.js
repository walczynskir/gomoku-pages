/* A single atomic profile snapshot after first import; game/history keep their original key. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FiveProfileStorage=api;})(globalThis,()=>{
 function create(storage,keys){
  const durable=['prefs','results','achievements'];
  function profile(){const raw=storage.getItem(keys.profile);if(raw===null)return null;const p=JSON.parse(raw);
   if(!p||p.version!==1||!durable.every(k=>Object.hasOwn(p,k)))throw Error('Invalid profile');return p;}
  function read(key){const p=durable.includes(key)?profile():null;return p?p[key]:JSON.parse(storage.getItem(keys[key]));}
  function mirror(p){for(const k of durable){try{storage.setItem(keys[k],JSON.stringify(p[k]));}catch{/* The atomic snapshot is authoritative. */}}}
  function write(key,value){const p=durable.includes(key)?profile():null;if(!p){storage.setItem(keys[key],JSON.stringify(value));return;}
   p[key]=value;storage.setItem(keys.profile,JSON.stringify(p));mirror(p);}
  function commit(prefs,progress){const p={version:1,prefs,results:progress.results,achievements:{...progress.achievements,unlockedThemes:progress.unlockedThemes}};
   storage.setItem(keys.profile,JSON.stringify(p));mirror(p);}
  return {read,write,commit};
 }
 return {create};
});
