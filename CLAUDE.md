# Thazi Bike — open-world bicycle game (Thazi Township, Myanmar)

Browser game: ride a bicycle around real Thazi streets. Vite + React 18 + three.js 0.160. UI text is Burmese.

## Run
```
npm install
npm run dev      # http://localhost:5173
npm run build
```

## Layout
- `src/App.jsx` — React shell: start screen, HUD (speed, clock, minimap), touch controls, settings. Calls `createGame()` once and gets HUD state back through `onHud`.
- `src/engine/game.js` — `createGame({ container, modelsBase, onHud, opts })`. Builds the world, runs the loop, handles input, camera, traffic, train, day/night. Returns `{ dispose, setOpt, ... }`.
- `src/engine/osm.js` — fetches OpenStreetMap data from Overpass (bbox `BB`, several mirror endpoints, localStorage cache), then `parse()` turns it into roads, buildings, landuse, water, rail, pagodas and POIs in local metres (`px`/`pz`). Seeded `rnd()` keeps the town the same on every run.
- `src/engine/models.js` — built-in procedural models: bike + rider, vehicles (car, pickup, moto, trishaw), people in longyi, train cars, station, pagoda, palm/round trees, bushes. `bake()` merges static meshes.
- `src/engine/textures.js` — canvas-generated textures (asphalt, dirt, bamboo, wood, tin, plaster, windows, train livery).
- `src/engine/assets.js` — optional GLB loading from `public/models/models.json`. A slot with a file overrides the procedural model, and `file` can be an array for random variety. Also has `cloneAsset` (skinned + animation mixer) and `instancedFromAsset`.
- `src/engine/fx.js` — post-processing (bloom, tilt-shift), sky shader, water shader, dust motes, exhaust puffs.
- `public/models/` — the Kenney CC0 GLBs currently in use (city-builder shops, racing-kit vehicles, platformer character) and `models.json`.

## Conventions
- World units are metres. +Y is up. Models face +Z.
- Static geometry is merged per material (`G.seg`, `G.disc`, wall builders) to keep draw calls low. Repeated objects use InstancedMesh. Don't add per-object meshes in loops.
- Quality modes: `Best` / `Fast` (`opts.quality`). Fast turns off shadows/bloom and lowers pixel ratio. Mobile goes to Fast automatically.
- Ground modes: `Stylized` (default) / `Satellite` (Esri tiles).

## Known issues
1. Kenney "building-small" shops are stretched to OSM footprints and can look distorted on very narrow plots. Only used on lots facing major roads, area < 260 m², 4-point footprints.
2. Model orientation (`rotateY` in models.json) for the Kenney vehicles/character hasn't been checked in-game. Make sure cars drive nose-first.
3. The Kenney character walk clip name is set to `walk`. Check the GLB's real clip names and fix `walkClip`.
4. Overpass can be slow or down. The game falls back to cached data, but there's no bundled offline snapshot.
5. Building/traffic generation runs on the main thread, so the first load freezes for 1–3 s.

## Improvement backlog (priority order)

### 1. Better 3D models (user's main request: semi-realistic, more detail)
- Get CC0 GLBs that don't need a login: Quaternius (quaternius.com — Nature, Cars, Train, Animated Characters), Poly Pizza (poly.pizza), Kenney (kenney.nl, "continue without donating"), Poly Haven at 1K only (polyhaven.com/models).
- Put them in `public/models/` and fill in `models.json` slots: `bike`, `trishaw`, `car`, `pickup`, `moto`, `person`, `loco`, `coach`, `pagoda`, `palm`, `tree`, `houses`.
- Compress every GLB: `npx @gltf-transform/cli optimize in.glb out.glb --texture-compress webp --texture-size 1024`. Target < 3 MB per model, < 25 MB total.
- Add `DRACOLoader` / `KTX2Loader` / `MeshoptDecoder` to the GLTFLoader in `assets.js` so compressed files load.
- Trishaw (sidecar bicycle) and Myanmar-style pagoda are hard to find. Build them in Blender or improve `makeVehicle('trishaw')` / `makePagoda()`: more profile segments, hti umbrella, bell-shaped stupa, gold PBR with an env map.
- Myanmar houses: stilt houses, bamboo-wall + thatch/tin roofs, two-storey shophouses with shutters. Make 4–6 GLB variants with the front facing +Z, or a parametric builder in models.js.

### 2. Visual quality
- Swap the canvas textures for real CC0 PBR textures from ambientCG / Poly Haven (1K, albedo + normal + roughness): asphalt, dirt road, bamboo weave, corrugated tin, plaster, grass.
- Add an HDRI sky/environment (Poly Haven 1K .hdr) via `RGBELoader` + PMREM to replace or blend with the shader sky.
- Grass/ground: a terrain shader that blends grass/dirt/dry-field by landuse with a noise mask, instead of flat vertex colours.
- Night: real street-lamp point lights only near the player (pool of ~8 lights moved to the nearest lamps). Window emissive should flicker on a few houses.
- SSAO (`SAOPass` or N8AO) in Best quality.
- Road markings and road edges: decals for zebra crossings near the market, and a worn-edge alpha blend between asphalt and dirt.

### 3. Real-data accuracy
- Bundle an offline OSM snapshot (`public/thazi.osm.json`) and load it before Overpass.
- Use `building:levels`, `roof:shape`, `building:material` tags when present.
- Add OSM `amenity`/`shop` names as Burmese signboards on buildings.
- Rail: put the Thazi station platform on the real `railway=platform` way, and run trains on the real Yangon–Mandalay and Thazi–Shwenyaung lines.
- Elevation: load SRTM/Terrarium tiles for gentle terrain height.

### 4. Performance
- Move OSM parsing and geometry building into a Web Worker (send transferable typed arrays back).
- Split the world into chunks (~200 m) with frustum culling + LOD. Far chunks use simplified boxes.
- Use `renderer.info` to keep draw calls under ~300 and triangles under ~1.5 M in Best quality.
- Pool traffic objects instead of creating/disposing them.

### 5. Gameplay
- Delivery missions: pick up at the market, deliver to a house (uses real addresses/POIs).
- Collisions with buildings (2D footprint polygons + simple circle-vs-segment test).
- Bell sound, ambient sounds (market, train horn, birds), engine sounds for traffic. Use Web Audio with positional audio.
- Save progress and settings in localStorage.
- Phone controls: tilt steering option, bigger brake button.

## Licenses
Kenney and Quaternius assets are CC0. If CC-BY models are added, list the author, title and link in `public/models/CREDITS.md` and show them on the start screen.
