const NAMED_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
  "&nbsp;": " ",
  "&copy;": "©",
  "&reg;": "®",
  "&trade;": "™",
  "&mdash;": "—",
  "&ndash;": "–",
  "&hellip;": "…",
  "&lsquo;": "\u2018",
  "&rsquo;": "\u2019",
  "&ldquo;": '"',
  "&rdquo;": '"',
  "&bull;": "•",
  "&middot;": "·",
  "&euro;": "€",
  "&pound;": "£",
  "&yen;": "¥",
  "&cent;": "¢",
};

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&[^;]+;/g, (entity) => {
      return NAMED_ENTITIES[entity] || entity;
    })
    .replace(/&#(\d+);/g, (_match, num) => {
      return String.fromCharCode(parseInt(num, 10));
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, hex) => {
      return String.fromCharCode(parseInt(hex, 16));
    });
}
