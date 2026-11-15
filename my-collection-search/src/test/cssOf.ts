/** The emotion rules that apply to an element's classes, as one string (jsdom has no var() resolution). */
export function cssOf(el: Element): string {
  const classes = [...el.classList];
  return Array.from(document.styleSheets)
    .flatMap((sheet) => Array.from(sheet.cssRules))
    .map((rule) => rule.cssText)
    .filter((text) => classes.some((c) => text.includes(`.${c}`)))
    .join("\n");
}

/** The element's own (unlayered) rules: what wins over the recipe layer. */
export function ownCssOf(el: Element): string {
  const classes = [...el.classList];
  return Array.from(document.styleSheets)
    .flatMap((sheet) => Array.from(sheet.cssRules))
    .filter((rule) => rule.constructor.name === "CSSStyleRule")
    .map((rule) => rule.cssText)
    .filter((text) => classes.some((c) => text.includes(`.${c}`)))
    .join("\n");
}
