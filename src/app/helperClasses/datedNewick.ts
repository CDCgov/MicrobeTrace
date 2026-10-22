export const AUSPICE_NUM_DATE_STORAGE_KEY = '__auspice_num_date';

export interface DatedNewickNumDateAttribute {
  value: number;
}

export interface DatedNewickTreeNode {
  id: string;
  length: number;
  data?: Record<string, any>;
  children?: DatedNewickTreeNode[];
}

export interface ParsedDatedNewick {
  tree: DatedNewickTreeNode;
  sanitizedNewick: string;
  annotatedNodeCount: number;
  totalNodeCount: number;
  complete: boolean;
}

const NEWICK_NUMBER_PATTERN = /^[+-]?(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:[eE][+-]?\d+)?/;
const NUM_DATE_PATTERN = /(?:^|[\s,&:])num_date\s*=\s*(?:"([^"]+)"|'([^']+)'|([^,\s:]+))/i;

/**
 * Parses explicit `num_date` annotations from extended Newick without
 * interpreting or estimating any missing dates. Comments are removed from the
 * returned Newick string so the existing patristic parser receives ordinary
 * Newick labels and branch lengths.
 */
export function parseDatedNewick(value: unknown): ParsedDatedNewick | null {
  if (typeof value !== 'string' || !value.trim()) return null;

  try {
    const parser = new DatedNewickParser(value);
    const tree = parser.parse();
    if (!parser.annotatedNodeCount) return null;

    return {
      tree,
      sanitizedNewick: stripNewickComments(value),
      annotatedNodeCount: parser.annotatedNodeCount,
      totalNodeCount: parser.totalNodeCount,
      complete: parser.annotatedNodeCount === parser.totalNodeCount,
    };
  } catch {
    return null;
  }
}

function stripNewickComments(value: string): string {
  let output = '';
  let index = 0;
  let quoted = false;

  while (index < value.length) {
    const character = value[index];
    if (character === "'") {
      output += character;
      if (quoted && value[index + 1] === "'") {
        output += value[index + 1];
        index += 2;
        continue;
      }
      quoted = !quoted;
      index += 1;
      continue;
    }

    if (!quoted && character === '[') {
      let depth = 1;
      index += 1;
      while (index < value.length && depth > 0) {
        if (value[index] === '[') depth += 1;
        if (value[index] === ']') depth -= 1;
        index += 1;
      }
      if (depth !== 0) throw new Error('Unterminated Newick comment.');
      continue;
    }

    output += character;
    index += 1;
  }

  return output;
}

class DatedNewickParser {
  public annotatedNodeCount = 0;
  public totalNodeCount = 0;
  private index = 0;

  constructor(private readonly source: string) {}

  public parse(): DatedNewickTreeNode {
    this.skipWhitespaceAndDetachedComments();
    const tree = this.parseSubtree();
    this.skipWhitespaceAndDetachedComments();
    if (this.peek() === ';') this.index += 1;
    this.skipWhitespaceAndDetachedComments();
    if (this.index !== this.source.length) {
      throw new Error('Unexpected content after the Newick tree.');
    }
    return tree;
  }

  private parseSubtree(): DatedNewickTreeNode {
    this.skipWhitespace();
    const node: DatedNewickTreeNode = { id: '', length: 0 };

    if (this.peek() === '(') {
      this.index += 1;
      const children: DatedNewickTreeNode[] = [];
      do {
        children.push(this.parseSubtree());
        this.skipWhitespace();
        if (this.peek() !== ',') break;
        this.index += 1;
      } while (true);

      this.skipWhitespace();
      if (this.peek() !== ')') throw new Error('Unterminated Newick child list.');
      this.index += 1;
      node.children = children;
    }

    this.parseNodeSuffix(node);
    this.totalNodeCount += 1;
    return node;
  }

  private parseNodeSuffix(node: DatedNewickTreeNode): void {
    let labelRead = false;
    let lengthRead = false;

    while (this.index < this.source.length) {
      this.skipWhitespace();
      const character = this.peek();

      if (character === '[') {
        this.applyAnnotation(node, this.readComment());
        continue;
      }

      if (!labelRead && character && !':,);'.includes(character)) {
        node.id = this.readLabel();
        labelRead = true;
        continue;
      }

      if (!lengthRead && character === ':') {
        this.index += 1;
        this.skipWhitespace();
        const match = NEWICK_NUMBER_PATTERN.exec(this.source.slice(this.index));
        if (!match) throw new Error('Invalid Newick branch length.');
        const length = Number(match[0]);
        if (!Number.isFinite(length)) throw new Error('Non-finite Newick branch length.');
        node.length = length;
        this.index += match[0].length;
        lengthRead = true;
        continue;
      }

      break;
    }
  }

  private readLabel(): string {
    if (this.peek() === "'") {
      this.index += 1;
      let label = '';
      while (this.index < this.source.length) {
        const character = this.source[this.index];
        if (character === "'" && this.source[this.index + 1] === "'") {
          label += "'";
          this.index += 2;
          continue;
        }
        if (character === "'") {
          this.index += 1;
          return label;
        }
        label += character;
        this.index += 1;
      }
      throw new Error('Unterminated quoted Newick label.');
    }

    const start = this.index;
    while (this.index < this.source.length
        && !':,();[]'.includes(this.source[this.index])) {
      this.index += 1;
    }
    return this.source.slice(start, this.index).trim();
  }

  private readComment(): string {
    if (this.peek() !== '[') throw new Error('Expected a Newick comment.');
    this.index += 1;
    const start = this.index;
    let depth = 1;

    while (this.index < this.source.length && depth > 0) {
      if (this.source[this.index] === '[') depth += 1;
      if (this.source[this.index] === ']') depth -= 1;
      this.index += 1;
    }
    if (depth !== 0) throw new Error('Unterminated Newick comment.');
    return this.source.slice(start, this.index - 1);
  }

  private applyAnnotation(node: DatedNewickTreeNode, comment: string): void {
    const match = NUM_DATE_PATTERN.exec(comment);
    if (!match) return;

    this.annotatedNodeCount += 1;
    const value = Number(match[1] ?? match[2] ?? match[3]);
    if (!Number.isFinite(value)) return;

    const data = node.data ?? (node.data = {});
    data[AUSPICE_NUM_DATE_STORAGE_KEY] = { value } satisfies DatedNewickNumDateAttribute;
  }

  private skipWhitespace(): void {
    while (this.index < this.source.length && /\s/.test(this.source[this.index])) {
      this.index += 1;
    }
  }

  private skipWhitespaceAndDetachedComments(): void {
    do {
      this.skipWhitespace();
      if (this.peek() !== '[') return;
      this.readComment();
    } while (true);
  }

  private peek(): string {
    return this.source[this.index] ?? '';
  }
}
