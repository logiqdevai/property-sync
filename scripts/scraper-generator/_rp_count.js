const H={headers:{'user-agent':'Mozilla/5.0'}};
const get=async u=>{const r=await fetch(u,H);return {s:r.status,t:await r.text()}};
const urls=(t)=>[...t.matchAll(/class="item-listing-wrap[^"]*"[\s\S]*?<h2 class="item-title">\s*<a href="([^"]+)"/g)].map(m=>m[1]);
async function walk(base,pager){let all=[],p=1;for(;;){const u=pager(base,p);const r=await get(u);if(r.s!==200)break;const x=urls(r.t);if(!x.length)break;all.push(...x);p++;await new Promise(r=>setTimeout(r,300));if(p>200)break}return {pages:p-1,all}}
(async()=>{
const S='https://realprofcrete.com/el/status-gr/%cf%80%cf%81%ce%bf%cf%82-%cf%80%cf%8e%ce%bb%ce%b7%cf%83%ce%b7/';
const s=await walk(S,(b,p)=>p==1?b:b+'page/'+p+'/');
console.log('sale pages',s.pages,'cards',s.all.length,'unique',new Set(s.all).size);
// one page past the end
const e=await get(S+'page/'+(s.pages+1)+'/');console.log('past end status',e.s,'cards',urls(e.t).length);
// per-page counts
const types={};for(const t of ['apartments-gr','business-gr','hotels-rent-a-room-gr','houses-villas-gr','land-gr']){
 const r=await walk('https://realprofcrete.com/el/'+encodeURI('Είδος Ακινήτου')+'/'+t+'/',(b,p)=>p==1?b:b+'page/'+p+'/');types[t]={cards:r.all.length,uniq:new Set(r.all).size,sale:r.all.filter(u=>new Set(s.all).has(u)).length}}
console.log(types);
const rent=await walk('https://realprofcrete.com/el/search-result-page/?status=for-rent',(b,p)=>p==1?b:b+'&paged='+p);
console.log('rent',rent.pages,rent.all.length,new Set(rent.all).size, 'overlap w sale',rent.all.filter(u=>new Set(s.all).has(u)).length);
require('fs').writeFileSync(process.env.OUT,JSON.stringify([...new Set(s.all)]));
})();
