/* =============================================================================
 * Braze Liquid Beautifier & Formatter
 * Vanilla ES6+ · zero dependencies · 100% client-side
 *
 * No AST. A token-based state machine splits the input into Liquid control
 * tokens, Liquid output tokens and passthrough text, then a line assembler and
 * an indentation engine rebuild the document.
 * ===========================================================================*/
(function () {
  'use strict';

  /* ===========================================================================
   * 1. TAG & SYNTAX CLASSIFICATION DICTIONARY
   * =========================================================================*/

  const LIQUID_TAG_RULES = {
    BLOCK_OPEN: [
      // Standard Liquid
      'if', 'unless', 'for', 'case', 'tablerow', 'capture',
      // Braze Extensions
      'connected_content', 'catalog_items'
    ],
    BLOCK_MIDDLE: [
      'else', 'elsif', 'when'
    ],
    BLOCK_CLOSE: [
      // Standard Liquid
      'endif', 'endunless', 'endfor', 'endcase', 'endtablerow', 'endcapture'
    ],
    INLINE_EXECUTION: [
      // Standard Liquid
      'assign', 'echo', 'increment', 'decrement', 'cycle', 'break', 'continue',
      // Braze Extensions
      'abort_message', 'random', 'content_blocks', 'message_extras'
    ]
  };

  const OPEN_TAGS = new Set(LIQUID_TAG_RULES.BLOCK_OPEN);
  const MIDDLE_TAGS = new Set(LIQUID_TAG_RULES.BLOCK_MIDDLE);
  const CLOSE_TAGS = new Set(LIQUID_TAG_RULES.BLOCK_CLOSE);
  // Braze block extensions close with end<tag> — {% endconnected_content %},
  // {% endcatalog_items %} — so derive those closers from BLOCK_OPEN.
  LIQUID_TAG_RULES.BLOCK_OPEN.forEach(function (tag) { CLOSE_TAGS.add('end' + tag); });
  const INLINE_TAGS = new Set(LIQUID_TAG_RULES.INLINE_EXECUTION);

  /* Full set of Braze-supported Liquid filters (used for `| filter` highlighting). */
  const FILTERS = new Set([
    // String
    'append', 'prepend', 'capitalize', 'downcase', 'upcase', 'strip', 'lstrip',
    'rstrip', 'strip_html', 'strip_newlines', 'replace', 'replace_first',
    'remove', 'remove_first', 'truncate', 'truncatewords', 'slice', 'split',
    // Math
    'abs', 'ceil', 'floor', 'round', 'plus', 'minus', 'times', 'divided_by',
    'modulo', 'at_least', 'at_most',
    // Array
    'first', 'last', 'join', 'map', 'reverse', 'sort', 'uniq', 'compact', 'size',
    // Date & Time
    'date', 'time_zone',
    // Utility, Security & Encoding
    'default', 'json', 'url_encode', 'url_decode', 'base64_encode',
    'base64_decode', 'hmac_sha1', 'hmac_sha256', 'md5', 'sha1', 'sha256'
  ]);

  /* Everything that renders as a keyword inside a Liquid tag. */
  const KEYWORDS = new Set([
    'comment', 'endcomment', 'catalog_selection_items', 'raw', 'endraw',
    // operators / literals
    'and', 'or', 'not', 'contains', 'in', 'nil', 'blank', 'empty', 'true', 'false'
  ]);
  [OPEN_TAGS, MIDDLE_TAGS, CLOSE_TAGS, INLINE_TAGS].forEach(function (set) {
    set.forEach(function (tag) { KEYWORDS.add(tag); });
  });

  /* HTML elements that never open an indentation level. */
  const VOID_ELEMENTS = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
    'param', 'source', 'track', 'wbr'
  ]);

  /* `{{custom_attribute.${x}}}`, `{{event_properties.${x}}}`, … are canonical
   * Braze personalization references and are preserved verbatim (see §2A). */
  const CANONICAL_BRAZE_REF = /^[A-Za-z_]\w*\.\$\{[^{}]*\}$/;

  function classify(name) {
    if (!name) return 'inline';
    if (OPEN_TAGS.has(name)) return 'open';
    if (MIDDLE_TAGS.has(name)) return 'middle';
    if (CLOSE_TAGS.has(name)) return 'close';
    if (INLINE_TAGS.has(name)) return 'inline';
    return 'unknown'; // unrecognised tags keep the current indent level
  }

  /* ===========================================================================
   * 2. TOKENIZER
   * =========================================================================*/

  /**
   * Find the closing delimiter of a Liquid tag, starting just after the opener.
   * String literals are protected, and `${...}` spans are skipped whole so that
   * `{{custom_attribute.${x}}}` does not split on the wrong brace.
   * Returns the index where `close` begins, or -1.
   */
  function findTagEnd(src, start, close) {
    let i = start;
    let quote = null;
    while (i < src.length) {
      const c = src[i];
      if (quote) {
        if (c === quote) quote = null;
        i++;
        continue;
      }
      if (c === '"' || c === "'") { quote = c; i++; continue; }
      if (c === '$' && src[i + 1] === '{') {
        const end = src.indexOf('}', i + 2);
        if (end === -1) return -1;
        i = end + 1;
        continue;
      }
      if (c === close[0] && src.startsWith(close, i)) return i;
      i++;
    }
    return -1;
  }

  /** Split raw source into control / output / comment / text tokens. */
  function tokenize(src) {
    const tokens = [];
    const len = src.length;
    let i = 0;
    let textStart = 0;

    function flushText(upTo) {
      if (upTo > textStart) tokens.push({ type: 'text', raw: src.slice(textStart, upTo) });
    }

    while (i < len) {
      if (src[i] !== '{' || (src[i + 1] !== '%' && src[i + 1] !== '{')) { i++; continue; }

      const isControl = src[i + 1] === '%';
      const close = isControl ? '%}' : '}}';
      const end = findTagEnd(src, i + 2, close);
      if (end === -1) { i += 2; continue; } // unterminated: fall through as text

      const raw = src.slice(i, end + 2);

      if (isControl && tagName(raw) === 'comment') {
        // Capture the whole comment block verbatim so nothing inside is mangled.
        const blockEnd = findComment(src, end + 2);
        flushText(i);
        tokens.push({ type: 'comment', raw: src.slice(i, blockEnd) });
        i = blockEnd;
        textStart = i;
        continue;
      }

      flushText(i);
      tokens.push({ type: isControl ? 'control' : 'output', raw: raw });
      i = end + 2;
      textStart = i;
    }

    flushText(len);
    return tokens;
  }

  /** Locate the end of a `{% comment %} … {% endcomment %}` block. */
  function findComment(src, from) {
    let i = from;
    while (i < src.length) {
      const next = src.indexOf('{%', i);
      if (next === -1) break;
      const end = findTagEnd(src, next + 2, '%}');
      if (end === -1) break;
      if (tagName(src.slice(next, end + 2)) === 'endcomment') return end + 2;
      i = end + 2;
    }
    return src.length; // unterminated comment swallows the remainder
  }

  /** First word of a control tag, e.g. `{%- if x -%}` -> `if`. */
  function tagName(raw) {
    const inner = raw.slice(raw.startsWith('{%-') ? 3 : 2, raw.length - (raw.endsWith('-%}') ? 3 : 2));
    const m = /^\s*([A-Za-z_]\w*)/.exec(inner);
    return m ? m[1] : '';
  }

  /* ===========================================================================
   * 3. SPACING NORMALIZATION (with string-literal protection)
   * =========================================================================*/

  /**
   * Split the inside of a Liquid tag into code / string / nested-output
   * segments. Quotes and `${...}` spans are protected so pipes, operators and
   * delimiters living inside them never trigger a split.
   */
  function splitSegments(text) {
    const segs = [];
    let buf = '';
    let i = 0;

    function flush() {
      if (buf) { segs.push({ t: 'code', v: buf }); buf = ''; }
    }

    while (i < text.length) {
      const c = text[i];
      if (c === '"' || c === "'") {
        const end = text.indexOf(c, i + 1);
        if (end === -1) { buf += text.slice(i); break; }
        flush();
        segs.push({ t: 'str', v: text.slice(i, end + 1) });
        i = end + 1;
        continue;
      }
      if (c === '{' && text[i + 1] === '{') {
        const end = findTagEnd(text, i + 2, '}}');
        if (end !== -1) {
          flush();
          segs.push({ t: 'output', v: text.slice(i, end + 2) });
          i = end + 2;
          continue;
        }
      }
      if (c === '$' && text[i + 1] === '{') {
        const end = text.indexOf('}', i + 2);
        if (end !== -1) { buf += text.slice(i, end + 1); i = end + 1; continue; }
      }
      buf += c;
      i++;
    }
    flush();
    return segs;
  }

  /** Normalize whitespace and filter pipes inside one code segment. */
  function normalizeCode(code, keepNewlines) {
    let out = code.replace(/[^\S\n]+/g, ' ').replace(/ *\| */g, ' | ');
    out = keepNewlines ? out.replace(/ *\n */g, '\n') : out.replace(/\s*\n\s*/g, ' ');
    return out;
  }

  /** Normalize a tag body, leaving strings and nested output tags intact. */
  function normalizeBody(inner, keepNewlines) {
    let out = '';
    splitSegments(inner).forEach(function (seg) {
      if (seg.t === 'str') out += seg.v;
      else if (seg.t === 'output') out += normalizeOutput(seg.v);
      else out += normalizeCode(seg.v, keepNewlines);
    });
    return out;
  }

  /** `{{${first_name}|default: 0}}` -> `{{ ${first_name} | default: 0 }}` */
  function normalizeOutput(raw) {
    const openLen = raw.startsWith('{{-') ? 3 : 2;
    const closeLen = raw.endsWith('-}}') ? 3 : 2;
    const open = raw.slice(0, openLen);
    const close = raw.slice(raw.length - closeLen);
    const body = normalizeBody(raw.slice(openLen, raw.length - closeLen), false).trim();

    // Canonical Braze personalization references stay in their documented form.
    if (openLen === 2 && closeLen === 2 && CANONICAL_BRAZE_REF.test(body)) return '{{' + body + '}}';
    return body ? open + ' ' + body + ' ' + close : open + ' ' + close;
  }

  /**
   * `{%if x%}` -> `{% if x %}`, `{%-if x-%}` -> `{%- if x -%}`.
   * Multi-line tags keep their internal line breaks; parameter lines are
   * returned separately so the indentation engine can push them +1 level.
   */
  function normalizeControl(raw) {
    const openLen = raw.startsWith('{%-') ? 3 : 2;
    const closeLen = raw.endsWith('-%}') ? 3 : 2;
    const open = raw.slice(0, openLen);
    const close = raw.slice(raw.length - closeLen);
    const body = normalizeBody(raw.slice(openLen, raw.length - closeLen), true);

    const parts = body.split('\n').map(function (l) { return l.trim(); });
    while (parts.length && parts[0] === '') parts.shift();
    while (parts.length && parts[parts.length - 1] === '') parts.pop();

    if (parts.length <= 1) {
      const one = parts[0] || '';
      return {
        textLines: [one ? open + ' ' + one + ' ' + close : open + ' ' + close],
        htmlLines: [one
          ? delim(open) + ' ' + highlight(one) + ' ' + delim(close)
          : delim(open) + ' ' + delim(close)]
      };
    }

    const textLines = [open + ' ' + parts[0]];
    const htmlLines = [delim(open) + ' ' + highlight(parts[0])];
    for (let i = 1; i < parts.length; i++) {
      textLines.push(parts[i]);
      htmlLines.push(highlight(parts[i]));
    }
    textLines.push(close);
    htmlLines.push(delim(close));
    return { textLines: textLines, htmlLines: htmlLines };
  }

  /**
   * A comment block only gets its delimiters tidied — the body is preserved
   * verbatim, minus the common leading indentation, which the indentation
   * engine re-applies one level in from `{% comment %}`.
   */
  function normalizeComment(raw) {
    const openEnd = findTagEnd(raw, 2, '%}') + 2;
    const closeStart = raw.lastIndexOf('{%');
    const hasCloser = closeStart >= openEnd;
    const openTag = normalizeControl(raw.slice(0, openEnd)).textLines[0];
    const closeTag = hasCloser ? normalizeControl(raw.slice(closeStart)).textLines[0] : '';
    const body = raw.slice(openEnd, hasCloser ? closeStart : raw.length);

    if (raw.indexOf('\n') === -1) return [openTag + body + closeTag];

    const bodyLines = body.split('\n').map(function (l) { return l.replace(/\s+$/, ''); });
    while (bodyLines.length && bodyLines[0].trim() === '') bodyLines.shift();
    while (bodyLines.length && bodyLines[bodyLines.length - 1].trim() === '') bodyLines.pop();

    const widths = bodyLines.filter(function (l) { return l.trim() !== ''; })
      .map(function (l) { return /^[ \t]*/.exec(l)[0].length; });
    const strip = widths.length ? Math.min.apply(null, widths) : 0;

    return [openTag]
      .concat(bodyLines.map(function (l) { return l.slice(strip); }))
      .concat(hasCloser ? [closeTag] : []);
  }

  /* ===========================================================================
   * 4. SYNTAX HIGHLIGHTING
   * =========================================================================*/

  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function span(cls, text) {
    return '<span class="' + cls + '">' + text + '</span>';
  }

  function delim(d) {
    return span('token-delimiter', esc(d));
  }

  const BRAZE_ATTR = /(?:[A-Za-z_]\w*\.)?\$\{[^}]*\}/;
  const CODE_RE = new RegExp(
    '(' + BRAZE_ATTR.source + ')' +   // 1: ${x} / custom_attribute.${x}
    '|(\\|\\s*([a-z_0-9]+))' +        // 2: | filter   (3: name)
    '|([A-Za-z_]\\w*)',               // 4: bare word
    'g'
  );

  function highlightCode(code) {
    let out = '';
    let last = 0;
    let m;
    CODE_RE.lastIndex = 0;
    while ((m = CODE_RE.exec(code)) !== null) {
      out += esc(code.slice(last, m.index));
      if (m[1]) out += span('token-braze-attr', esc(m[1]));
      else if (m[2]) out += FILTERS.has(m[3]) ? span('token-filter', esc(m[2])) : esc(m[2]);
      else out += KEYWORDS.has(m[4]) ? span('token-keyword', esc(m[4])) : esc(m[4]);
      last = CODE_RE.lastIndex;
    }
    return out + esc(code.slice(last));
  }

  /** Highlight the body of a Liquid tag (already normalized). */
  function highlight(body) {
    let out = '';
    splitSegments(body).forEach(function (seg) {
      if (seg.t === 'str') out += span('token-string', esc(seg.v));
      else if (seg.t === 'output') out += highlightOutput(seg.v);
      else out += highlightCode(seg.v);
    });
    return out;
  }

  function highlightOutput(text) {
    const openLen = text.startsWith('{{-') ? 3 : 2;
    const closeLen = text.endsWith('-}}') ? 3 : 2;
    return delim(text.slice(0, openLen)) +
      highlight(text.slice(openLen, text.length - closeLen)) +
      delim(text.slice(text.length - closeLen));
  }

  const TEXT_ATTR_RE = new RegExp(BRAZE_ATTR.source, 'g');

  /** Passthrough text: escaped verbatim, with `${...}` attributes highlighted. */
  function highlightText(text) {
    let out = '';
    let last = 0;
    let m;
    TEXT_ATTR_RE.lastIndex = 0;
    while ((m = TEXT_ATTR_RE.exec(text)) !== null) {
      out += esc(text.slice(last, m.index)) + span('token-braze-attr', esc(m[0]));
      last = TEXT_ATTR_RE.lastIndex;
    }
    return out + esc(text.slice(last));
  }

  /* ===========================================================================
   * 5. LINE ASSEMBLY
   * =========================================================================*/

  function newLine() {
    return { items: [], delta: 0, min: 0, blank: false };
  }

  function hasContent(line) {
    return line.items.some(function (it) {
      return it.kind !== 'text' || it.text.trim() !== '';
    });
  }

  function applyOpen(line) { line.delta++; }
  function applyClose(line) { line.delta--; if (line.delta < line.min) line.min = line.delta; }
  function applyMiddle(line) { if (line.delta - 1 < line.min) line.min = line.delta - 1; }

  /**
   * Streaming HTML scanner. HTML/CSS is never reformatted — it is only read to
   * (a) track whether we are inside a tag or an attribute quote, so no line
   * break is injected there, and (b) let block-level elements carry the line
   * indentation the same way Liquid blocks do.
   */
  function scanHtml(state, text, line) {
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (!state.inTag) {
        if (c === '<' && /[A-Za-z!/?]/.test(text[i + 1] || '')) { state.inTag = true; state.buf = ''; }
        continue;
      }
      if (state.quote) {
        if (c === state.quote) state.quote = null;
        state.buf += c;
        continue;
      }
      if (c === '"' || c === "'") { state.quote = c; state.buf += c; continue; }
      if (c === '>') {
        // `<!-- … -->` only ends on `-->`
        if (state.buf.startsWith('!--') && !state.buf.endsWith('--')) { state.buf += c; continue; }
        state.inTag = false;
        applyTag(state.buf, line);
        continue;
      }
      state.buf += c;
    }
  }

  function applyTag(buf, line) {
    if (!buf || buf[0] === '!' || buf[0] === '?') return; // doctype / comment / PI
    if (buf[0] === '/') {
      const name = (/^\/\s*([A-Za-z][\w:-]*)/.exec(buf) || [])[1];
      if (name && !VOID_ELEMENTS.has(name.toLowerCase())) applyClose(line);
      return;
    }
    if (buf.trim().endsWith('/')) return; // self-closing
    const name = (/^([A-Za-z][\w:-]*)/.exec(buf) || [])[1];
    if (name && !VOID_ELEMENTS.has(name.toLowerCase())) applyOpen(line);
  }

  /** Turn the token stream into logical output lines. */
  function assemble(tokens) {
    const lines = [];
    const html = { inTag: false, quote: null, buf: '' };
    let cur = newLine();
    let pendingBreak = false;

    function endLine() {
      lines.push(cur);
      cur = newLine();
    }

    tokens.forEach(function (tok) {
      if (tok.type === 'text') {
        const parts = tok.raw.split('\n');
        for (let k = 0; k < parts.length; k++) {
          if (k > 0) {
            endLine();
            pendingBreak = false;
            if (parts[k].trim() === '' && k < parts.length - 1) cur.blank = true;
          }
          const part = parts[k];
          if (part === '') continue;
          scanHtml(html, part, cur);
          if (part.trim() !== '') {
            if (pendingBreak) { endLine(); pendingBreak = false; }
            cur.items.push({ kind: 'text', text: part, html: highlightText(part) });
          } else if (cur.items.length && !pendingBreak) {
            cur.items.push({ kind: 'text', text: part, html: esc(part) });
          }
        }
        return;
      }

      if (tok.type === 'comment') {
        const norm = normalizeComment(tok.raw);
        if (pendingBreak || hasContent(cur)) endLine();
        pendingBreak = true;
        cur.items.push({
          kind: 'liquid',
          contIndent: 1,
          textLines: norm,
          htmlLines: norm.map(function (l) { return span('token-comment', esc(l)); })
        });
        return;
      }

      if (tok.type === 'output') {
        const text = normalizeOutput(tok.raw);
        if (pendingBreak) { endLine(); pendingBreak = false; }
        cur.items.push({ kind: 'liquid', contIndent: 0, textLines: [text], htmlLines: [highlightOutput(text)] });
        return;
      }

      // control token
      const name = tagName(tok.raw);
      const cls = classify(name);
      const norm = normalizeControl(tok.raw);
      const isBlock = cls === 'open' || cls === 'middle' || cls === 'close';
      // Never break lines inside an HTML tag or an HTML attribute value.
      const canBreak = (isBlock || norm.textLines.length > 1) && !html.inTag && !html.quote;

      if (pendingBreak || (canBreak && hasContent(cur))) endLine();
      pendingBreak = false;

      cur.items.push({
        kind: 'liquid',
        contIndent: 1,
        textLines: norm.textLines,
        htmlLines: norm.htmlLines
      });

      if (cls === 'open') applyOpen(cur);
      else if (cls === 'close') applyClose(cur);
      else if (cls === 'middle') applyMiddle(cur);

      if (canBreak) pendingBreak = true;
    });

    lines.push(cur);

    // Drop lines emptied by injected breaks; keep (and collapse) source blanks.
    const out = [];
    let lastBlank = true; // suppresses leading blank lines
    lines.forEach(function (line) {
      if (hasContent(line)) { out.push(line); lastBlank = false; return; }
      if (line.blank && !lastBlank) { out.push(line); lastBlank = true; }
    });
    while (out.length && !hasContent(out[out.length - 1])) out.pop();
    return out;
  }

  /* ===========================================================================
   * 6. INDENTATION ENGINE
   * =========================================================================*/

  function format(source, unit) {
    const lines = assemble(tokenize(source.replace(/\r\n?/g, '\n')));
    const text = [];
    const html = [];
    const pad = [];

    function indent(n) {
      while (pad.length <= n) pad.push(pad.length ? pad[pad.length - 1] + unit : '');
      return pad[n];
    }

    /* `keepLeading` is used for the interior lines of multi-line tags and
     * comments, whose own leading whitespace is meaningful. */
    function push(level, t, h, keepLeading) {
      const trimmed = t.replace(/\s+$/, '');
      if (trimmed.trim() === '') { text.push(''); html.push(''); return; }
      text.push(indent(level) + (keepLeading ? trimmed : trimmed.replace(/^\s+/, '')));
      html.push(indent(level) + (keepLeading ? h : h.replace(/^\s+/, '')));
    }

    let level = 0;
    lines.forEach(function (line) {
      const lineIndent = Math.max(0, level + Math.min(0, line.min));

      if (!hasContent(line)) {
        text.push('');
        html.push('');
      } else {
        let t = '';
        let h = '';
        line.items.forEach(function (it) {
          if (it.kind === 'text') { t += it.text; h += it.html; return; }
          if (it.textLines.length === 1) { t += it.textLines[0]; h += it.htmlLines[0]; return; }
          // Multi-line Liquid tag: parameters indent +1, the closer returns to base.
          const lastIdx = it.textLines.length - 1;
          t += it.textLines[0];
          h += it.htmlLines[0];
          push(lineIndent, t, h);
          for (let k = 1; k < lastIdx; k++) {
            push(lineIndent + it.contIndent, it.textLines[k], it.htmlLines[k], true);
          }
          t = it.textLines[lastIdx];
          h = it.htmlLines[lastIdx];
        });
        push(lineIndent, t, h);
      }

      level = Math.max(0, level + line.delta); // never drops below 0
    });

    return { text: text.join('\n'), html: html.join('\n') };
  }

  /* ===========================================================================
   * 7. UI BINDING
   * =========================================================================*/

  const input = document.getElementById('input');
  const output = document.getElementById('output');
  const indentSelect = document.getElementById('indentStyle');
  const formatBtn = document.getElementById('formatBtn');
  const liveToggle = document.getElementById('liveToggle');
  const copyBtn = document.getElementById('copyBtn');
  const clearBtn = document.getElementById('clearBtn');
  const status = document.getElementById('status');
  const themeBtn = document.getElementById('themeBtn');

  let formatted = '';
  let liveTimer = null;

  function unitFor(value) {
    if (value === 'tab') return '\t';
    if (value === '4') return '    ';
    return '  ';
  }

  function setStatus(message, tone) {
    status.textContent = message;
    status.className = 'panel-hint' + (tone ? ' is-' + tone : '');
  }

  function run() {
    const source = input.value;
    if (!source.trim()) {
      formatted = '';
      output.innerHTML = '';
      setStatus('Paste Liquid on the left to get started.');
      return;
    }
    try {
      const start = performance.now();
      const result = format(source, unitFor(indentSelect.value));
      const elapsed = performance.now() - start;
      formatted = result.text;
      output.innerHTML = result.html;
      const count = result.text ? result.text.split('\n').length : 0;
      setStatus('Formatted ' + count + ' line' + (count === 1 ? '' : 's') +
        ' in ' + elapsed.toFixed(1) + ' ms', 'ok');
    } catch (err) {
      setStatus('Could not format: ' + err.message, 'error');
    }
  }

  function scheduleLive() {
    if (!liveToggle.checked) return;
    clearTimeout(liveTimer);
    liveTimer = setTimeout(run, 120);
  }

  formatBtn.addEventListener('click', run);
  input.addEventListener('keyup', scheduleLive);
  input.addEventListener('input', scheduleLive);
  input.addEventListener('paste', function () { setTimeout(scheduleLive, 0); });

  indentSelect.addEventListener('change', function () {
    localStorage.setItem('lp-indent', indentSelect.value);
    if (formatted) run();
  });

  liveToggle.addEventListener('change', function () {
    localStorage.setItem('lp-live', liveToggle.checked ? '1' : '0');
    if (liveToggle.checked) run();
  });

  clearBtn.addEventListener('click', function () {
    input.value = '';
    formatted = '';
    output.innerHTML = '';
    setStatus('Cleared.');
    input.focus();
  });

  copyBtn.addEventListener('click', function () {
    if (!formatted) { setStatus('Nothing to copy yet.', 'error'); return; }
    const done = function () {
      const label = copyBtn.textContent;
      copyBtn.textContent = 'Copied!';
      copyBtn.classList.add('is-success');
      setTimeout(function () {
        copyBtn.textContent = label;
        copyBtn.classList.remove('is-success');
      }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(formatted).then(done, fallbackCopy);
    } else {
      fallbackCopy();
    }
    function fallbackCopy() {
      const scratch = document.createElement('textarea');
      scratch.value = formatted;
      scratch.setAttribute('readonly', '');
      scratch.style.position = 'fixed';
      scratch.style.opacity = '0';
      document.body.appendChild(scratch);
      scratch.select();
      try { document.execCommand('copy'); done(); } catch (e) { setStatus('Copy failed — select the output manually.', 'error'); }
      document.body.removeChild(scratch);
    }
  });

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    themeBtn.textContent = theme === 'dark' ? '☀️ Light' : '🌙 Dark';
    localStorage.setItem('lp-theme', theme);
  }

  themeBtn.addEventListener('click', function () {
    applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });

  // Restore preferences
  applyTheme(localStorage.getItem('lp-theme') ||
    (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  indentSelect.value = localStorage.getItem('lp-indent') || '2';
  liveToggle.checked = localStorage.getItem('lp-live') !== '0';
  setStatus('Paste Liquid on the left to get started.');

  // Exposed for quick console checks / testing.
  window.LiquidPrettier = { format: format, tokenize: tokenize, LIQUID_TAG_RULES: LIQUID_TAG_RULES };
})();
