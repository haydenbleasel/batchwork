import { COLORS } from "../theme";

export type TokenType =
  | "plain"
  | "keyword"
  | "func"
  | "type"
  | "string"
  | "number"
  | "comment"
  | "property"
  | "punct";

export interface Token {
  text: string;
  type: TokenType;
}

export const TOKEN_COLOR: Record<TokenType, string> = {
  comment: COLORS.syntax.comment,
  func: COLORS.syntax.func,
  keyword: COLORS.syntax.keyword,
  number: COLORS.syntax.number,
  plain: COLORS.syntax.plain,
  property: COLORS.syntax.property,
  punct: COLORS.syntax.punct,
  string: COLORS.syntax.string,
  type: COLORS.syntax.type,
};

const KEYWORDS = new Set([
  "import",
  "from",
  "export",
  "default",
  "const",
  "let",
  "var",
  "function",
  "return",
  "await",
  "async",
  "for",
  "of",
  "in",
  "if",
  "else",
  "new",
  "as",
  "type",
  "interface",
  "extends",
  "implements",
  "class",
  "try",
  "catch",
  "finally",
  "throw",
  "void",
  "yield",
  "true",
  "false",
  "null",
  "undefined",
  "this",
  "typeof",
]);

type RawKind = "comment" | "string" | "number" | "ident" | "space" | "punct";
interface Raw {
  text: string;
  kind: RawKind;
}

// Single regex scanner: comments, then strings (incl. template literals),
// numbers, identifiers, whitespace, and finally any other single character.
const SCAN =
  /(?<comment>\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(?<string>`(?:[^`\\]|\\.)*`|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(?<number>\b\d[\d_]*(?:\.\d+)?\b)|(?<ident>[A-Za-z_$][\w$]*)|(?<space>\s+)|(?<punct>[^\s])/gu;

const nextMeaningful = (raw: Raw[], i: number): Raw | undefined => {
  for (let j = i + 1; j < raw.length; j += 1) {
    const t = raw[j];
    if (t && t.kind !== "space") {
      return t;
    }
  }
  return undefined;
};

const prevMeaningful = (raw: Raw[], i: number): Raw | undefined => {
  for (let j = i - 1; j >= 0; j -= 1) {
    const t = raw[j];
    if (t && t.kind !== "space") {
      return t;
    }
  }
  return undefined;
};

// Group names on SCAN, in priority order, paired with the Raw kind they map to.
const SCAN_GROUPS: { name: string; kind: RawKind }[] = [
  { kind: "comment", name: "comment" },
  { kind: "string", name: "string" },
  { kind: "number", name: "number" },
  { kind: "ident", name: "ident" },
  { kind: "space", name: "space" },
  { kind: "punct", name: "punct" },
];

// Split a line into raw lexical chunks via the single SCAN regex.
const scanRaw = (line: string): Raw[] => {
  const raw: Raw[] = [];
  SCAN.lastIndex = 0;
  let m: RegExpExecArray | null = SCAN.exec(line);
  while (m !== null) {
    const g = m.groups;
    for (const { name, kind } of SCAN_GROUPS) {
      const text = g?.[name];
      if (text !== undefined) {
        raw.push({ kind, text });
        break;
      }
    }
    m = SCAN.exec(line);
  }
  return raw;
};

// Classify an identifier as keyword / func / property / type / plain by context.
const classifyIdent = (t: Raw, raw: Raw[], i: number): TokenType => {
  if (KEYWORDS.has(t.text)) {
    return "keyword";
  }
  const next = nextMeaningful(raw, i);
  if (next?.kind === "punct" && next.text === "(") {
    return "func";
  }
  const prev = prevMeaningful(raw, i);
  if (prev?.kind === "punct" && prev.text === ".") {
    return "property";
  }
  if (/^[A-Z]/u.test(t.text)) {
    return "type";
  }
  return "plain";
};

/** Tokenize a single line of TypeScript for display-only highlighting. */
export const tokenizeLine = (line: string): Token[] => {
  const raw = scanRaw(line);
  const tokens: Token[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const t = raw[i];
    if (!t) {
      continue;
    }
    if (t.kind === "ident") {
      tokens.push({ text: t.text, type: classifyIdent(t, raw, i) });
    } else {
      tokens.push({
        text: t.text,
        type: t.kind === "space" ? "plain" : t.kind,
      });
    }
  }

  return tokens;
};
