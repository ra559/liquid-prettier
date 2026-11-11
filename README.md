# Liquid Prettier

A lightweight, browser-based Liquid template beautifier and formatter with specialized support for Braze Liquid tags and personalization syntax.

Liquid Prettier transforms compressed, inconsistently formatted Liquid templates into readable, consistently indented code.

Built with vanilla JavaScript, the application uses a custom token-based formatting engine to recognize Liquid control structures, output expressions, comments, HTML elements, and Braze-specific extensions.

No backend, build process, or JavaScript dependencies are required.

## Features

### 1. Liquid Template Formatting

Automatically format Liquid templates using syntax-aware indentation and whitespace normalization.

Supported formatting includes:

- Liquid control tags.
- Liquid output expressions.
- Nested Liquid blocks.
- Conditional statements.
- Loops and iterations.
- Multi-line Liquid tags.
- Liquid comments.
- Whitespace control delimiters.
- Embedded HTML.
- HTML element indentation.

### 2. Braze Liquid Support

Includes specialized handling for Braze personalization syntax and extensions.

**Braze-specific tags:**

| Tag | Description |
|---|---|
| `connected_content` | Retrieve external content |
| `catalog_items` | Access catalog data |
| `abort_message` | Abort message delivery |
| `random` | Generate random values |
| `content_blocks` | Reference reusable content blocks |
| `message_extras` | Work with message extras |

The formatter also recognizes Braze personalization references such as:

```liquid
{{custom_attribute.${first_name}}}
```

```liquid
{{event_properties.${product_name}}}
```

Canonical Braze personalization references are preserved rather than reformatted into a different syntax.

### 3. Liquid Syntax Support

Recognized Liquid control structures include:

- `if` / `endif`
- `unless` / `endunless`
- `for` / `endfor`
- `case` / `endcase`
- `tablerow` / `endtablerow`
- `capture` / `endcapture`
- `else`
- `elsif`
- `when`

Inline execution tags include:

- `assign`
- `echo`
- `increment`
- `decrement`
- `cycle`
- `break`
- `continue`

Additional Liquid tags are preserved without being treated as recognized block structures.

### 4. Liquid Filter Recognition

The syntax highlighter recognizes a collection of commonly used Liquid and Braze filters.

**String filters:**

`append`, `prepend`, `capitalize`, `downcase`, `upcase`, `strip`, `lstrip`, `rstrip`, `strip_html`, `strip_newlines`, `replace`, `replace_first`, `remove`, `remove_first`, `truncate`, `truncatewords`, `slice`, `split`.

**Math filters:**

`abs`, `ceil`, `floor`, `round`, `plus`, `minus`, `times`, `divided_by`, `modulo`, `at_least`, `at_most`.

**Array filters:**

`first`, `last`, `join`, `map`, `reverse`, `sort`, `uniq`, `compact`, `size`.

**Date and time filters:**

`date`, `time_zone`.

**Utility, security, and encoding filters:**

`default`, `json`, `url_encode`, `url_decode`, `base64_encode`, `base64_decode`, `hmac_sha1`, `hmac_sha256`, `md5`, `sha1`, `sha256`.

### 5. Syntax Highlighting

The formatted output includes syntax highlighting for:

- Liquid delimiters.
- Liquid keywords and operators.
- String literals.
- Liquid filters.
- Braze personalization attributes.
- Liquid comments.

The output is displayed in a dedicated code panel.

### 6. Configurable Indentation

Choose between three indentation styles:

- 2 spaces.
- 4 spaces.
- Tabs.

The selected indentation preference is saved in browser local storage.

### 7. Live Formatting

Enable automatic formatting while typing.

- Updates the output as the input changes.
- Uses a short delay to avoid formatting on every keystroke.
- Can be disabled when manual formatting is preferred.

### 8. Additional Features

- Split-screen input and output interface.
- Manual formatting through the Format button.
- Copy formatted code to clipboard.
- Clear input and output.
- Light and dark themes.
- Automatic theme detection based on system preferences on first use.
- Persistent theme preference.
- Formatting execution-time display.
- No server-side processing.

## Technology Stack

| Technology | Purpose |
|---|---|
| HTML5 | Application structure |
| CSS3 | Interface styling and syntax highlighting |
| Vanilla JavaScript (ES6+) | Tokenization and formatting engine |
| Bulma CSS 1.0.4 | Responsive UI framework |
| Inter | Interface typography |
| Browser APIs | Clipboard, local storage, and system theme detection |

The application has no external JavaScript dependencies.

## How the Formatting Engine Works

Liquid Prettier uses a custom token-based state machine rather than a conventional Abstract Syntax Tree (AST).

The formatting process consists of several stages.

**1. Tokenization**

The input is scanned and divided into distinct token types:

- Liquid control tags.
- Liquid output expressions.
- Liquid comments.
- Regular text and embedded HTML.

The tokenizer also accounts for quoted strings and Braze `${...}` personalization references when locating Liquid delimiters.

**2. Syntax Classification**

Liquid control tags are classified according to their behavior:

- Block-opening tags.
- Block-middle tags.
- Block-closing tags.
- Inline execution tags.
- Unrecognized tags.

**3. Whitespace Normalization**

Liquid expressions are normalized while preserving string literals and canonical Braze personalization references.

**4. HTML Structure Scanning**

The formatter scans embedded HTML to identify opening and closing elements.

HTML and CSS content are not independently beautified. The scanner tracks structural indentation without rewriting their internal markup.

**5. Line Assembly**

Tokens are assembled into logical output lines. Appropriate line breaks are introduced around recognized Liquid control structures.

**6. Indentation**

An indentation engine calculates nesting levels and generates the final formatted output.

**7. Syntax Highlighting**

The formatted result is converted into highlighted HTML for display in the output panel.

## Getting Started

### Requirements

- A modern web browser.
- Internet connection to load Bulma CSS and Google Fonts.

No installation of Node.js, npm, Ruby, Python, or additional JavaScript packages is required.

### Installation

Clone the repository:

```bash
git clone https://github.com/ra559/liquid-prettier.git
```

Navigate into the project directory:

```bash
cd liquid-prettier
```

Open the application:

```bash
xdg-open index.html
```

Alternatively, open `index.html` directly in your browser.

### Running a Local Web Server

For local development, use Python's built-in HTTP server:

```bash
python3 -m http.server 8000
```

Open:

```text
http://localhost:8000
```

## Usage

1. Open Liquid Prettier in your browser.
2. Paste your raw Liquid or Braze Liquid template into the Input panel.
3. Select your preferred indentation style.
4. Enable or disable Live Format.
5. Click **Format** if automatic formatting is disabled.
6. Review the formatted output.
7. Click **Copy to clipboard** to copy the result.

Use the theme button to switch between light and dark appearances.

## Example

**Before formatting:**

```liquid
{%if {{custom_attribute.${account_status}}} == 'active'%}<div class="welcome"><h1>Welcome back, {{${first_name}|default: 'valued customer'}}!</h1>{%else%}<p>Please activate your account.</p>{%endif%}
```

**After formatting:**

```liquid
{% if {{custom_attribute.${account_status}}} == 'active' %}
  <div class="welcome">
    <h1>Welcome back, {{ ${first_name} | default: 'valued customer' }}!</h1>
  </div>
{% else %}
  <p>Please activate your account.</p>
{% endif %}
```

The output above illustrates the intended formatting style; exact results depend on the input structure and formatter behavior.

## Project Structure

```text
liquid-prettier/
├── .github/
│   └── workflows/
├── index.html
├── app.js
├── styles.css
└── README.md
```

| File / Directory | Description |
|---|---|
| `.github/workflows/` | GitHub Actions workflows |
| `index.html` | Application interface and input/output panels |
| `app.js` | Tokenizer, Liquid formatter, syntax highlighter, and UI logic |
| `styles.css` | Application styling, themes, and syntax highlighting |
| `README.md` | Project documentation |

## Browser Compatibility

The application relies on modern browser functionality, including:

- JavaScript ES6+.
- DOM manipulation.
- Clipboard API.
- Local Storage.
- `performance.now()`.
- `window.matchMedia()`.

Clipboard access may require a secure context, such as HTTPS or localhost. A fallback copy mechanism is included.

## Privacy

Liquid Prettier processes templates entirely within the browser.

- No backend server.
- No database.
- No user accounts.
- No template uploads.
- No server-side formatting.

Your Liquid templates remain in the browser during formatting.

The application stores interface preferences, including indentation, live-format settings, and theme selection, in browser local storage.

## Limitations

Liquid Prettier is a formatting utility, not a complete Liquid interpreter or validator.

- It does not execute Liquid templates.
- It does not evaluate Liquid expressions.
- It does not validate every Liquid tag or filter.
- Unrecognized Liquid tags are preserved but may not receive appropriate block indentation.
- HTML and CSS are scanned for structural indentation but are not independently beautified.
- It does not provide a complete Braze runtime or API integration.
- It does not guarantee semantic equivalence for every possible Liquid or Braze template.

Always review formatted templates before deploying them into production messaging workflows.

## Contributing

Contributions, bug reports, and feature suggestions are welcome.

1. Fork the repository.
2. Create a feature branch.
3. Implement your changes.
4. Test the formatter against standard Liquid and Braze-specific examples.
5. Submit a pull request.

When extending syntax support, preserve existing formatting behavior and account for nested expressions, quoted strings, and whitespace-control delimiters.

## License

No license file is currently present in the repository. All rights are otherwise reserved by default unless the project owner specifies a license.

---

**Repository:** https://github.com/ra559/liquid-prettier