# BSM Quant Desk

Browser-based Black-Scholes-Merton options analysis, built with plain HTML, CSS and JavaScript. There is no build step.

## Pages

- `index.html`: overview
- `calculator.html`: calculator
- `greeks.html`: option Greeks
- `heatmap.html`: heatmap
- `strategy.html`: strategy
- `insights.html`, `math.html`, `critique.html`, `verdict.html`: analysis and notes
- `settings.html`: settings

The core logic is in `js/bsm-core.js` and `js/market.js`.

## Run locally

```sh
python -m http.server 8000
```

Then open http://localhost:8000.

## Deployment

`.github/workflows/deploy.yml` publishes the site to GitHub Pages.
