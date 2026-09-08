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
| `--color-accent-strong` | Strong emphasis and active controls |
| `--color-border` | Borders and dividers |
| `--color-inverse` | Text placed on accent surfaces |

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
3. Contrast should meet WCAG AA for normal text.
4. A theme must work at 16:9 and narrow browser widths.
5. System font fallbacks are required.
6. Decorative effects must respect `prefers-reduced-motion`.

## Creating a theme

1. Copy `clean.css`.
2. Change token values.
3. Scope optional decoration under `[data-theme="your-theme"]`.
4. Test the deck and storyboard at desktop and mobile widths.
5. Run `npm test`.

