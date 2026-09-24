# DuroMax Home Backup Power Simulator

An interactive 3D home that shows which appliances a DuroMax or DuroStar portable generator can power when it is connected to the house through an **interlock kit**, a **transfer switch**, or **extension cords**.

Pick a generator and fuel, choose how it connects, then flip breakers (in the panel list or by clicking appliances in the house) to see what runs, what trips the generator breaker, and roughly how long the fuel lasts.

## Features

- **33 current generators**: 28 DuroMax and 5 DuroStar. Each has running and starting watts for gasoline, propane and natural gas, plus outlets, neutral type and links to its product page and owner's manual.
- **Realistic limits**:
  - Running watts are capped by the generator's rating and by the cord and inlet: 30A = 7,200 W, 50A = 12,000 W.
  - Every appliance start-up is checked against the generator's starting (peak) watts.
- **Three connection types**:
  - **Interlock kit:** the whole panel is available.
  - **Transfer switch:** only wired circuits can be powered. A 120V circuit uses 1 slot and a 240V circuit uses 2.
  - **Extension cords:** 120V appliances only.
- **Bonded vs floating neutral guidance** for each model, taken from the DuroMax owner's manuals.
- **AirGo soft starter toggle** for the central AC. It removes 60% of the start-up surge (the site claims "up to 70%"). Set this in `data/appliances.js`.
- **Generator breaker trips on overload**, with a plain-language explanation and a reset button.
- **Estimated runtime** at the current load, interpolated from each model's published 25% and 50% load runtimes.
- **Equipment list** for each setup, with links to the store: inlet box, cord, transfer switch or interlock kit, and soft starter.
- Day/night view, camera presets and a mobile layout.
- Deep links, for example `index.html?model=XP13000HXT&fuel=Propane&conn=transfer`.

## Run it

The app is plain static files, with no build step. Three.js loads from the jsDelivr CDN.

- **GitHub Pages:** Settings → Pages → Deploy from branch → `main` / root. The app is then live at `https://<user>.github.io/duromax-home-backup-simulator/`.
- **Locally:** run `python3 -m http.server 8000` in this folder and open http://localhost:8000. Opening `index.html` straight from disk won't work, because browsers block ES modules on `file://`.

## Project layout

```
index.html              page + sidebar markup
css/app.css             styles
js/engine.js            load-calculation engine (pure functions, unit-tested)
js/house.js             Three.js 3D house, appliances, generator, cord, panel
js/app.js               UI state, rendering, events
data/generators.js      generated from the spec sheet (do not edit by hand)
data/equipment.js       transfer switches, interlock kits, inlets, cords, soft starters (generated)
data/appliances.js      appliance wattages, presets, soft-start reduction (edit freely)
tools/build_data.py     rebuilds data/generators.js + data/equipment.js from tools/source/*.json
tools/source/           spec sheet (.xlsx) and its JSON exports scraped from duromaxpower.com
tests/engine.test.js    engine tests: `node tests/engine.test.js`
```

## Updating data

- **Appliance wattages or presets:** edit `data/appliances.js`.
- **Generators or equipment:**
  1. Update the spec sheet and re-export `tools/source/generators.json` and `tools/source/equipment.json`.
  2. Run `python3 tools/build_data.py`.
  3. Commit.

## Simplifications (current version)

- Load is not balanced across the two 120V legs.
- Transfer-switch breaker sizes are not enforced. Only the circuit count is.
- Surge is checked against the generator's starting watts. Brief surges through the 30A or 50A cord are allowed.
- Wattages are typical estimates. Real appliances vary, so always check nameplates.

## Disclaimer

For education and product selection only. Connecting a generator to home wiring requires an approved transfer switch or interlock kit, installed by a licensed electrician per local code. Generator specs come from duromaxpower.com (September 2026).
