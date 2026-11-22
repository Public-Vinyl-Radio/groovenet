// The pre-paint script: applies this device's appearance override to <html>
// before first paint, from the same localStorage record the hook writes. It is
// a string because it must run inline in <head>, with no imports; the ids it
// accepts are injected from the registries so it can't drift from them.
//
// Nothing here trusts storage. Ids are checked against the injected lists, and
// the custom palette's stored CSS is applied only when it matches `cssPattern`:
// `:root[data-palette="custom"]` blocks of `--gn-*:#rrggbb;` declarations and
// nothing else. A failure anywhere leaves the server-rendered values alone.
//
// It reads `document.currentScript.nonce` and gives the <style> it makes the
// same one, so it works under a nonce-based Content-Security-Policy.
import { cornerIds } from "./corners";
import { fontChoiceIdsFor, fontRoleIds } from "./fontChoices";
import { customPaletteId, customPaletteStyleId } from "./palettes/custom";
import { paletteIds } from "./palettes";
import { appearanceOverrideKey, appearanceOverrideVersion } from "./appearanceOverride";

/** What a stored `customCss` must look like to reach a <style>. */
export const customCssPattern = String.raw`^(?::root\[data-palette="custom"\](?:\.dark)?\{(?:--gn-[a-z0-9-]+:#[0-9a-fA-F]{6};)+\})+$`;

const dataKey = { display: "fontDisplay", body: "fontBody", label: "fontLabel" } as const;

const config = {
  key: appearanceOverrideKey,
  v: appearanceOverrideVersion,
  palettes: [...paletteIds, customPaletteId],
  custom: customPaletteId,
  corners: cornerIds,
  fonts: Object.fromEntries(
    fontRoleIds.map((role) => [dataKey[role], fontChoiceIdsFor(role)]),
  ) as Record<string, string[]>,
  styleId: customPaletteStyleId,
  css: customCssPattern,
};

const body = `
try{
var raw=localStorage.getItem(c.key);
if(!raw)return;
var o=JSON.parse(raw);
if(!o||typeof o!=="object"||o.v!==c.v)return;
var d=document.documentElement.dataset;
var css=typeof o.customCss==="string"&&o.customCss.length<20000&&new RegExp(c.css).test(o.customCss)?o.customCss:null;
var el=document.getElementById(c.styleId);
if(css){
if(!el){el=document.createElement("style");el.id=c.styleId;
var s=document.currentScript;if(s&&s.nonce)el.setAttribute("nonce",s.nonce);
document.head.appendChild(el);}
el.textContent=css;
}
var p=o.palette;
if(typeof p==="string"&&c.palettes.indexOf(p)>=0&&(p!==c.custom||el))d.palette=p;
if(typeof o.corners==="string"&&c.corners.indexOf(o.corners)>=0)d.corners=o.corners;
var f=o.fonts;
if(f&&typeof f==="object"){for(var k in c.fonts){var v=f[k.replace(/^font/,"").toLowerCase()];
if(typeof v==="string"&&c.fonts[k].indexOf(v)>=0)d[k]=v;}}
}catch(e){}
`;

/** The inline script's source. */
export const appearanceScript = `(function(c){${body}})(${JSON.stringify(config)});`;
