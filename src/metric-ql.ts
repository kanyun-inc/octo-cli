interface Token {
  kind: 'word' | 'symbol' | 'literal';
  value: string;
  start: number;
}

const spaceAggregate =
  /^(sum|avg|min|max|count|count_values|median|p\d+(\.\d+)?)$/i;
const wrapperExamples: Record<string, string> = {
  as_rate: 'as_rate(sum(m{}) by (label))',
  as_count: 'as_count(sum(rollup(m{}, default, 1m)) by (label))',
  top: 'top(sum(m{}) by (label), 10, max)',
  bottom: 'bottom(sum(m{}) by (label), 10, min)',
  moving_rollup: 'moving_rollup(sum(m{}) by (label), sum, 5m)',
  default: 'default(sum(m{}) by (label), 0)',
  rollup: 'sum(rollup(m{}, default, 1m)) by (label)',
  advanced_rollup: 'sum(advanced_rollup(m{}, default, 1m, auto)) by (label)',
};

/** Ignore quoted/escaped text; this is a hint recognizer, not a QL validator. */
function tokenize(query: string): Token[] | undefined {
  const tokens: Token[] = [];
  const word = /[A-Za-z_][A-Za-z0-9_.]*/y;
  for (let i = 0; i < query.length; ) {
    const char = query[i];
    if (/\s/.test(char)) {
      i++;
      continue;
    }
    const start = i;
    if (char === '"' || char === "'") {
      const quote = char;
      i++;
      while (i < query.length && query[i] !== quote) {
        i += query[i] === '\\' ? 2 : 1;
      }
      if (i >= query.length) return undefined;
      tokens.push({ kind: 'literal', value: '', start });
      i++;
      continue;
    }
    if (char === '\\') {
      tokens.push({ kind: 'literal', value: '', start });
      i += 2;
      continue;
    }
    word.lastIndex = i;
    const match = word.exec(query);
    if (match) {
      tokens.push({ kind: 'word', value: match[0], start });
      i = word.lastIndex;
    } else {
      tokens.push({ kind: 'symbol', value: char, start });
      i++;
    }
  }
  return tokens;
}

/** Recognize common misplaced by forms without rejecting or rewriting a query. */
export function getMetricGroupingHint(query: string): string | undefined {
  const tokens = tokenize(query);
  if (!tokens) return undefined;
  const stack: { delimiter: '(' | '{'; fn?: string }[] = [];
  let lastClosedFunction: string | undefined;
  let hint: string | undefined;
  const rule =
    "by (...) must immediately follow the closing ')' of a SPACE AGGREGATE (sum/avg/min/max/count/count_values/pxx). Outer functions wrap the whole aggregate + by expression.";

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.kind !== 'symbol' && token.kind !== 'word') continue;
    if (token.value === '(' || token.value === '{') {
      const previous = tokens[i - 1];
      stack.push({
        delimiter: token.value,
        fn:
          token.value === '(' && previous?.kind === 'word'
            ? previous.value.toLowerCase()
            : undefined,
      });
    } else if (token.value === ')' || token.value === '}') {
      const frame = stack.pop();
      if (!frame || frame.delimiter !== (token.value === ')' ? '(' : '{'))
        return undefined;
      lastClosedFunction = frame.fn;
    } else if (
      !hint &&
      token.kind === 'word' &&
      token.value === 'by' &&
      tokens[i + 1]?.value === '('
    ) {
      if (stack.some((frame) => frame.delimiter === '{')) {
        hint = `by (...) is inside a metric tag filter. ${rule} Example: as_rate(sum(m{tag = value}) by (label)).`;
      } else if (
        tokens[i - 1]?.value === ')' &&
        lastClosedFunction &&
        Object.hasOwn(wrapperExamples, lastClosedFunction)
      ) {
        hint = `by (...) after ${lastClosedFunction}(...) is misplaced. ${rule} Example: ${wrapperExamples[lastClosedFunction]}.`;
      } else if (
        (tokens[i - 1]?.value === '}' || tokens[i - 1]?.kind === 'word') &&
        spaceAggregate.test(stack.at(-1)?.fn ?? '')
      ) {
        hint = `by (...) is inside the space aggregate's argument. ${rule} Example: as_rate(sum(m{}) by (label)).`;
      }
    }
  }
  if (stack.length) return undefined;
  return hint ? `${hint} See octo metrics query --help.` : undefined;
}

/** Distinguish PromQL =~ "regex" from quoted text and literal ~prefix values. */
export function getMetricRegexHint(query: string): string | undefined {
  const tokens = tokenize(query);
  if (!tokens) return undefined;
  let filterDepth = 0;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.kind !== 'symbol') continue;
    if (token.value === '{') filterDepth++;
    else if (token.value === '}') filterDepth--;
    else if (
      filterDepth > 0 &&
      token.value === '=' &&
      query[token.start + 1] === '~' &&
      tokens[i + 1]?.value === '~' &&
      tokens[i + 2]?.kind === 'literal' &&
      ['"', "'"].includes(query[tokens[i + 2].start])
    ) {
      return 'PromQL =~ is not supported by Metric QL. Use = for exact matches, IN (...) for a value list, or = with * for wildcard matching (e.g. service = leo*). Regex patterns and wildcards have different semantics; choose the intended filter rather than replacing the operator mechanically. See octo metrics query --help.';
    }
  }
  return undefined;
}

/** Build additive guidance from known syntax mistakes after a backend failure. */
export function getMetricSyntaxHints(query: string, message: string): string[] {
  return [
    /\bby\b/i.test(message) ? getMetricGroupingHint(query) : undefined,
    getMetricRegexHint(query),
  ].filter((hint): hint is string => hint !== undefined);
}
