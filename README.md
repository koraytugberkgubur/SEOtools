# Image Quality Advisor

Turns Google Document AI `detectedDefects` confidence values into a publish decision, prioritized repairs, and an image-type-specific delivery checklist.

Supported defects: blurry, noisy, dark, faint, text too small, document cutoff, text cutoff, and glare.

## Run

```bash
npm start
```

Open `http://localhost:4174`.

## Input

Paste a complete or partial Document AI JSON response—the parser recursively finds supported `{type, confidence}` objects—or set the eight confidence sliders manually.

## Thresholds

- `0.75–1.00`: critical; blocks publication
- `0.50–0.74`: high; revise before publication
- `0.25–0.49`: medium; review and verify
- Below `0.25`: low; not included in the action plan

Recommendations and delivery checks are grounded in the supplied HSD Featured Image and Inline Image SOPs.

## Test

```bash
npm test
```
