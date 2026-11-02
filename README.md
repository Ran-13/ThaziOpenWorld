# သာစည် · စက်ဘီးဖြင့် မြို့ပတ်ခရီး

React + three.js နဲ့ ရေးထားတဲ့ browser ဂိမ်း။ OpenStreetMap ကနေ သာစည်မြို့ မြေပုံကို တိုက်ရိုက်ယူပြီး 3D diorama အဖြစ် တည်ဆောက်ပါတယ်။

## Run

```bash
npm install
npm run dev        # ဖုန်းကနေ စမ်းဖို့ ပြတဲ့ Network URL ကို ဖွင့်ပါ
npm run build      # dist/ ထဲ ထွက်လာမယ်
```

## ဖိုင်ဖွဲ့စည်းပုံ

- `src/App.jsx` — HUD, ဂျွိုက်စတစ်, ခလုတ်များ (React)
- `src/engine/game.js` — ဂိမ်း loop, စက်ဘီး physics, NPC, ရထား, အလုပ်, နေ့/ည
- `src/engine/osm.js` — Overpass API မှ မြေပုံယူခြင်း၊ parse၊ geometry builder
- `src/engine/models.js` — procedural 3D model များ (စက်ဘီး+စီးသူ, စေတီ, ဘူတာ, ရထား, ကား/ဆိုင်ကယ်/ဆိုက်ကား, လူ, ထန်းပင်)
- `src/engine/fx.js` — tilt-shift, bloom, ရေ shader, ကောင်းကင်, ဖုန်မှုန့်
- `src/engine/assets.js` — GLB model loader
- `public/models/` — ကိုယ်ပိုင် GLB ထည့်ရန်

## GLB model ထည့်နည်း

1. Kenney (kenney.nl) သို့မဟုတ် Quaternius (quaternius.com) မှ CC0 pack ကို ဒေါင်းပါ။ GLB/glTF format ကို ရွေးပါ။
2. `.glb` ဖိုင်ကို `public/models/` ထဲ ထည့်ပါ။
3. `public/models/models.json` ထဲက slot မှာ `"file": "car.glb"` လို ဖြည့်ပါ။
4. Model က ရှေ့ဘက် (+Z) မမျက်နှာမူရင် `rotateY` (ဒီဂရီ) ကို 90 / 180 / -90 ပြောင်းပါ။ အရွယ်အစားကို `length` / `height` (မီတာ) နဲ့ အလိုအလျောက် ညှိပေးပါတယ်။
5. `person` slot မှာ animation ပါတဲ့ character ထည့်ရင် `walkClip` နာမည်နဲ့ လမ်းလျှောက် animation ကို ဖွင့်ပေးပါတယ်။

Slot တွေ: bike, car, pickup, moto, trishaw, person, palm, tree, pagoda, loco, coach။ ဖိုင်မထည့်ထားတဲ့ slot က built-in model ကို သုံးပါတယ်။

မြေပုံဒေတာ © OpenStreetMap contributors (ODbL)။
