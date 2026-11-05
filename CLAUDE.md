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
- `src/engine/models.js` — built-in procedural models: bike + rider, vehicles (car, pickup, moto, trishaw), people in longyi, train cars, station, pagoda. `bake()` merges static meshes.
- `src/engine/textures.js` — canvas-generated textures (ground, bamboo, wood, tin, plaster, concrete, longyi, train livery, station sign).
- `src/engine/assets.js` — optional GLB loading from `public/models/models.json`. A slot with a file overrides the procedural model, and `file` can be an array for random variety. Also has `cloneAsset` (skinned + animation mixer) and `instancedFromAsset`. `mobileVariants` in a slot keeps that many variants on phones (default 1).
- `src/engine/homes.js` — every OSM building as Kenney suburban houses (`homes` slot): one fitted house per rectangular lot (front to the street), a grid of houses on lots > 240 m², the oriented bounding rectangle for other polygons. Two LODs: per-variant InstancedMesh within `radius` of the player (rebuilt every 16 m), plus one box+hip-roof InstancedMesh for all homes (near ones collapsed in its vertex shader). Shader restyles the Kenney palette by UV cell: green roof swatch → corrugated tin with rust, white wall swatch → per-house plaster colour, glass → lit at night. Rural lots get stilt houses (lift + posts + deck). Shadow depth pass skips homes beyond 75 m.
- `src/engine/plots.js` — compounds (ခြံ). OSM has house footprints but not the plots around them, so each yard is derived: footprint-aware Voronoi between neighbouring buildings, cut back from streets/rails, capped at 7 m from the house. Convex polygons whose edges are labelled street / neighbour / open land. Yards are filled into the ground chunks (game.js).
- `src/engine/fences.js` — compound fences along plot edges (shared edges drawn once, gate on the longest street edge). Kit `fence` GLB segments within `nearR` (matrices built lazily), a board-and-post shader strip per chunk beyond it.
- `src/engine/fx.js` — post-processing (bloom, tilt-shift), sky shader, water shader, dust motes, exhaust puffs.
- `public/models/` — GLBs in use and `models.json`. The town itself is only the Kenney City Kit (Suburban) in `kenney-suburban/`: houses, trees, planter, fence. Roads use that kit's path/driveway colours (`DRIVE_C`/`PATH_C` in game.js), not separate tiles.

## Conventions
- World units are metres. +Y is up. Models face +Z.
- Static geometry is merged per material (`G.seg`, `G.disc`, wall builders) to keep draw calls low. Repeated objects use InstancedMesh. Don't add per-object meshes in loops.
- Quality modes: `Best` / `Fast` (`opts.quality`). Fast turns off shadows/bloom and lowers pixel ratio. Mobile goes to Fast automatically.
- Static world objects are frozen after build (`freeze()` in game.js: `matrixAutoUpdate`/`matrixWorldAutoUpdate` off, scene root too). Anything that moves must be created after the freeze point or kept out of it, or it will not move.
- Chunk meshes take a cull ring: `CULL_R` for walls/roads/trees, `DETAIL_R` for small props (windows, doors, fences, bushes, lamp arms). Pass it to `mkInst`/`ChunkB.meshes`/`placeTrees` for new prop types.
- Phones: Phong for homes, no shadow map (blob shadows under bike/traffic + contact pads under homes instead), frame pacing to 60 fps, shaders compiled with `compileAsync` before the first frame.
- Ground modes: `Stylized` (default) / `Satellite` (Esri tiles).

## Known issues
1. Every building is a suburban kit house, including the market, schools and monasteries (as house grids). There are no shop or public-building models.
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
