# Theme Contract

A theme should change the visual character of a deck without changing its HTML structure.

## Required custom properties

Every theme must define these variables on `:root` or a matching `[data-theme]` selector.

### Color

| Variable | Purpose |
|---|---|
| `--color-bg` | Main slide background |
| `--color-surface` | Card and panel background |
| `--color-text` | Primary text |
| `--color-muted` | Secondary text |
| `--color-accent` | Primary emphasis |
| `--color-accent-strong` | Strong emphasis, contrast slide background and links |
| `--color-border` | Borders and dividers |
| `--color-inverse` | Text placed on accent surfaces |
| `--color-danger` | Borders of error panels and unsupported component placeholders. The templates fall back to `#b3261e` when a theme omits it. |

### Type

| Variable | Purpose |
|---|---|
| `--font-display` | Headings and large statements |
| `--font-body` | Body text and controls |
| `--font-mono` | Numbers and technical labels |

### Shape and depth

| Variable | Purpose |
|---|---|
| `--radius-small` | Buttons and small labels |
| `--radius-medium` | Cards |
| `--radius-large` | Large panels |
| `--shadow-card` | Card elevation |

### Motion

| Variable | Purpose |
|---|---|
| `--motion-fast` | Controls and hover states |
| `--motion-enter` | Slide content entrance |
| `--ease-out` | Entrance easing |

## Rules

1. Components use the contract variables instead of hardcoded colors or fonts.
2. Theme CSS must not alter semantic content or slide order.
3. Text must meet WCAG AA contrast: 4.5:1 for normal text and 3:1 for large text. This includes text on contrast slides and inside cards.
4. A theme must work at 16:9 and narrow browser widths.
5. System font fallbacks are required.
6. Decorative effects must respect `prefers-reduced-motion`.
7. A theme file must not contain `</style`, because the build inlines it into a `<style>` element.

## Creating a theme

1. Copy `clean.css` to `themes/<name>.css`.
2. Change the token values.
3. Scope optional decoration under `[data-theme="<name>"]`.
4. Set `meta.theme` to `<name>` in your deck specification.
5. Build with `node scripts/build.mjs <spec.json> --out <dir>`. The build stops if `themes/<name>.css` does not exist.
6. Review the deck and storyboard at desktop and mobile widths, then run `npm test`.
