# Image Quality Advisor

An upload-first image reviewer grounded in the supplied HSD Featured/Headline and Inline Image SOPs. Images are analyzed locally in the browser and are never uploaded to a server.

Supported defects: blurry, noisy, dark, faint, text too small, document cutoff, text cutoff, and glare.

## Run

```bash
npm start
```

Open `http://localhost:4174`.

## Review inputs

- Upload PNG, JPEG, WebP, or AVIF.
- Automatic checks cover dimensions, aspect ratio, brightness, contrast, sharpness, visual noise, clipped highlights, format, and file weight.
- Optionally paste a complete or partial Document AI JSON response. The parser recursively finds supported `{type, confidence}` objects and uses API scores alongside local estimates.
- Review the visible Featured and Inline SOP tabs for semantic, brand, metadata, copy, and delivery checks that cannot be inferred safely from pixels.

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
