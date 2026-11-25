// JSON.stringify output is a valid JS expression but not safe to put inside an
// inline <script>: it leaves `<`, `>` and `/` alone, so a value holding
// `</script>` would end the element, and U+2028/U+2029 are line terminators in
// older JS. Escaping them as \uXXXX keeps the text identical when evaluated.
const escapes: Record<string, string> = {
  "<": "\\u003c",
  ">": "\\u003e",
  "/": "\\u002f",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
};

/** JSON for embedding in an inline script; evaluates to the same value. */
export function serializeForInlineScript(value: unknown): string {
  return JSON.stringify(value).replace(/[<>\/\u2028\u2029]/g, (ch) => escapes[ch]);
}
