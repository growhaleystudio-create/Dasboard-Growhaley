export type Style = Record<string, unknown>;

export interface Node {
  type: string;
  props: { style?: Style; children?: unknown; [k: string]: unknown };
}

export function el(type: string, style: Style, children?: unknown): Node {
  return { type, props: { style, ...(children !== undefined ? { children } : {}) } };
}
