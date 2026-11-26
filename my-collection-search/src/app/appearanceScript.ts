// The pre-paint script: applies this device's appearance override to <html>
// before first paint, from the same localStorage record the hook writes. It is
// a string because it must run inline in <head>, with no imports; the ids it
// accepts are injected from the registries so it can't drift from them.
//
// Nothing here trusts storage. Ids are checked against the injected lists, and
// the custom palette's stored CSS is applied only when it matches `cssPattern`:
// `:root[data-palette="custom"]` blocks of `--gn-*:#rrggbb;` declarations and
// nothing else, and in both modes sets `--gn-outline`. A failure anywhere leaves the server-rendered values alone.
//
// A font installed on this device (#1294) is accepted only when its name
// matches `localFontFamilyPattern` (letters, digits, spaces, `-`, `_`). It is
// never put in a stylesheet: the script sets the role's `--gn-font-*` variable
// on <html> through `style.setProperty`, as the quoted name followed by the
// role's own generic stack (both injected here), so no name can end a string
// or a declaration.
//
// It reads `document.currentScript.nonce` and gives the <style> it makes the
// same one, so it works under a nonce-based Content-Security-Policy.
import { cornerIds } from "./corners";
import { fontChoiceIdsFor, fontRoleIds, fontRoles } from "./fontChoices";
import { localFontFamilyPattern } from "./localFont";
import { customPaletteId, customPaletteStyleId } from "./palettes/custom";
import { paletteIds } from "./palettes";
import { serializeForInlineScript } from "@/lib/serializeForInlineScript";
import { appearanceOverrideKey, appearanceOverrideVersion } from "./appearanceOverride";

/** What a stored `customCss` must look like to reach a <style>. */
export const customCssPattern = String.raw`^(?::root\[data-palette="custom"\](?:\.dark)?\{(?:--gn-[a-z0-9-]+:#[0-9a-fA-F]{6};)+\})+$`;

const dataKey = { display: "fontDisplay", body: "fontBody", label: "fontLabel" } as const;

const config = {
  family: localFontFamilyPattern,
  roles: Object.fromEntries(
    fontRoleIds.map((role) => [
      role,
      { prop: fontRoles[role].variable, fallback: fontRoles[role].fallback },
    ]),
  ) as Record<string, { prop: string; fallback: string }>,
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
  // CSS stored before `--gn-outline` existed lacks it in both blocks. Applied as
  // is, it would leave outlines on the default palette's colour until the page
  // rewrites storage, so it is skipped and the server's values stand.
  outline: "--gn-outline:",
};

const body = `
try{
var raw=localStorage.getItem(c.key);
if(!raw)return;
var o=JSON.parse(raw);
if(!o||typeof o!=="object"||o.v!==c.v)return;
var d=document.documentElement.dataset;
var css=typeof o.customCss==="string"&&o.customCss.length<20000&&new RegExp(c.css).test(o.customCss)&&o.customCss.split(c.outline).length>2?o.customCss:null;
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
var l=o.localFonts;
if(l&&typeof l==="object"){var re=new RegExp(c.family,"u");
for(var r in c.roles){var n=l[r];
if(typeof n==="string"&&re.test(n))document.documentElement.style.setProperty(c.roles[r].prop,'"'+n+'", '+c.roles[r].fallback);}}
}catch(e){}
`;

/** The inline script's source. */
export const appearanceScript = `(function(c){${body}})(${serializeForInlineScript(config)});`;
