/**
 * Generate the AHTML inspector bookmarklet source.
 *
 * The bookmarklet reads `window.__AHTML_TOOLS__` (populated by
 * `registerAhtmlTools()`) and also fetches `/.well-known/ahtml.json` to
 * build a floating panel showing registered tools and page metadata.
 *
 * Works in any browser without the Chrome 149 WebMCP origin trial.
 */

/** Return the raw bookmarklet JavaScript (un-encoded). */
export function getBookmarkletSource(): string {
  return BOOKMARKLET_SOURCE;
}

/** Return the bookmarklet as a `javascript:` URI ready to paste into a bookmark. */
export function getBookmarkletHref(): string {
  return 'javascript:' + encodeURIComponent(BOOKMARKLET_SOURCE);
}

const BOOKMARKLET_SOURCE = `(function(){
var existing=document.getElementById('__ahtml_inspector__');
if(existing){existing.remove();return;}
var tools=window.__AHTML_TOOLS__||{};
var panel=document.createElement('div');
panel.id='__ahtml_inspector__';
panel.style.cssText='position:fixed;top:16px;right:16px;z-index:2147483647;background:#1a1a2e;color:#e0e0e0;font:13px/1.5 monospace;padding:16px;border-radius:8px;max-width:360px;max-height:80vh;overflow:auto;box-shadow:0 4px 24px rgba(0,0,0,.5);';
var names=Object.keys(tools);
var header=document.createElement('div');
header.style.cssText='font-weight:bold;font-size:15px;margin-bottom:8px;color:#7ec8e3;';
header.textContent='⚡ AHTML Inspector';
panel.appendChild(header);
var count=document.createElement('div');
count.style.cssText='color:#aaa;margin-bottom:12px;font-size:11px;';
count.textContent=names.length+' tool'+(names.length===1?'':'s')+' registered \xb7 '+location.hostname;
panel.appendChild(count);
if(names.length===0){
  var empty=document.createElement('div');
  empty.style.cssText='color:#888;';
  empty.textContent='No AHTML tools found. Add @ahtmljs/webmcp to register tools.';
  panel.appendChild(empty);
}else{
  names.forEach(function(name){
    var t=tools[name];
    var row=document.createElement('div');
    row.style.cssText='border:1px solid #333;border-radius:4px;padding:8px;margin-bottom:6px;cursor:pointer;';
    row.innerHTML='<div style="color:#7ec8e3;font-weight:bold;">'+name+'</div><div style="color:#bbb;font-size:11px;margin-top:2px;">'+t.description+'</div>';
    var ann=t.annotations||{};
    if(ann['x-ahtml-cost'])row.innerHTML+='<div style="color:#ffd166;font-size:11px;">💰 '+ann['x-ahtml-cost']+'</div>';
    if(ann['x-ahtml-auth'])row.innerHTML+='<div style="color:#ef476f;font-size:11px;">🔐 auth: '+ann['x-ahtml-auth']+'</div>';
    panel.appendChild(row);
  });
}
var closeBtn=document.createElement('button');
closeBtn.textContent='\xd7 Close';
closeBtn.style.cssText='margin-top:10px;background:#333;color:#fff;border:none;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:12px;';
closeBtn.onclick=function(){panel.remove();};
panel.appendChild(closeBtn);
document.body.appendChild(panel);
fetch('/.well-known/ahtml.json').then(function(r){return r.json();}).then(function(m){
  count.textContent=names.length+' tool'+(names.length===1?'':'s')+' \xb7 '+m.site+' \xb7 AHTML '+m.ahtml;
}).catch(function(){});
})()`;
