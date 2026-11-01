# VIKI AI — Landing design notes

## 1. Rationale

- **The silhouette is the hero.** A faceless bust made of ridged "liquid chrome" scan lines says "a voice with a presence". Two soft accent points sit at the throat and sternum, and a ripple leaves the throat now and then. Together they read as voice, not as robot or sci-fi.
- **The particles are a dense cloud, not stars.** About 40k dots at 1 css px, drawn straight into `ImageData`. They gather into a cloud behind the figure and a ribbon that rises to the right, and they thin out behind the headline so the text always wins.
- **The orb moved to section 2.** In the hero it was "yet another AI sphere" and fought the message. As the brain the channels plug into, it explains the product.
- **A live call chip** ("შემომავალი ზარი · VIKI პასუხობს") next to the figure makes "voice AI that answers calls" readable in under 3 seconds.
- **Logo background.** `assets/logo.png` was keyed from the original (`logoSource.png`): luminance becomes alpha, every pixel is pure white, and the result is cropped to the mark. The shape and anti-aliased edges are untouched. CSS adds `mix-blend-mode: screen` as a second safety net.
- **Colour is restrained.** Near-black, white and grey. Only the figure, the particles and the orb emit light, and the orb keeps its own chromatic fringe at 70 % saturation.

## 2. Design tokens (see `:root` in `css/styles.css`)

| Token | Value |
|---|---|
| `--bg` | `#050507` |
| `--bg-raised` | `#0a0a0e` |
| `--text` / `--text-2` | `#ffffff` / `#d4d4db` |
| `--muted` | `#9a9aa5` (7.3:1 on bg) |
| `--subtle` | `#8a8a95` (5.9:1, smallest text) |
| `--line` / `--line-strong` | `rgba(255,255,255,.08)` / `.16` |
| `--glass` | `rgba(255,255,255,.035)` |
| Glow | `rgb(236,240,246)`, `--glow-soft: 0 0 32px /.10`, `--glow-edge` |
| Font | Space Grotesk 400/500/600 + Noto Sans Georgian 400/500/600 |
| Type scale | hero `clamp(2rem, 1rem+3vw, 3.4rem)`; h2 `clamp(1.75rem, …, 2.9rem)`; h3 1.175rem; lead 1.05–1.2rem; body 1rem; small .875rem; micro .75rem |
| Tracking | headings −0.025em; eyebrows +0.08em, never uppercase (Georgian has no case) |
| Spacing (4-pt) | 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96 / 144 |
| Radii | 10 / 16 / 24 / pill |

## 3. Copy — Georgian (English)

Nav and button labels are used exactly as given: ჩვენს შესახებ | სარგებელი | კითხვები | კონტაქტი, დემო ზარი | შესვლა | დაგვიკავშირდით.

**Hero**
- // VIKI AI VOICE AGENT
- ხმოვანი AI, რომელიც / ყველა ზარს პასუხობს. (Voice AI that answers every call.)
- VIKI 24/7 იღებს ზარებსა და შეტყობინებებს — ბუნებრივ ქართულ ენაზე, ტელეფონითა და მესენჯერებით. (VIKI handles calls and messages 24/7 — in natural Georgian, by phone and messengers.)
- Call chip: შემომავალი ზარი (Incoming call) · VIKI პასუხობს (VIKI is answering)
- Stats: 98% სიზუსტე (Accuracy) · <1 წმ დაყოვნება (Latency, <1 s) · 24/7 ზარების მიღება (Call handling). ⚠ The figures are placeholders and must be confirmed.

**Section 2. Channels**
- // 01 — არხები (Channels)
- ყველა არხი — ერთი ხმოვანი AI. (Every channel — one voice AI.)
- ზარები, Instagram, WhatsApp, Viber, Facebook, Messenger და ელფოსტა ერთ ტვინში იყრის თავს. VIKI ყველგან ერთნაირად პასუხობს — ზუსტად და დაუყოვნებლივ. (Calls, Instagram, WhatsApp, Viber, Facebook, Messenger and email converge in one brain. VIKI answers the same way everywhere — accurately and instantly.)
- Channel labels: ტელეფონი (Phone), Instagram, WhatsApp, Viber, Facebook, Messenger, ელფოსტა (Email)

**About**
- // 02 — ჩვენს შესახებ
- ვქმნით ხმას, რომელსაც ბიზნესი ენდობა. (We build a voice businesses trust.)
- VIKI AI არის ხმოვანი ასისტენტი, რომელიც თქვენი კომპანიის სახელით ესაუბრება მომხმარებლებს: პასუხობს კითხვებს, ჯავშნის ვიზიტებს და მნიშვნელოვან ზარებს გუნდს გადასცემს. (VIKI AI is a voice assistant that talks to customers on your company's behalf: it answers questions, books appointments and passes important calls to your team.)
- ის სწავლობს თქვენს სერვისებს, ფასებსა და წესებს — და საუბრობს ბუნებრივ ქართულ ენაზე, რობოტული ინტონაციის გარეშე. (It learns your services, prices and policies — and speaks natural Georgian without robotic intonation.)
- 01 მოსმენა (Listen) — ცნობს მეტყველებას ხმაურშიც. (Recognises speech even in noise.)
- 02 გაგება (Understand) — ესმის მიზანი და კონტექსტი. (Understands intent and context.)
- 03 პასუხი (Respond) — პასუხობს წამში, ბუნებრივი ხმით. (Replies within a second, in a natural voice.)

**Benefits**
- // 03 — სარგებელი
- ნაკლები გამოტოვებული ზარი. მეტი კლიენტი. (Fewer missed calls. More customers.)
1. 24/7 ხელმისაწვდომობა (24/7 availability) — ღამით, შაბათ-კვირას და დღესასწაულებზე — არცერთი ზარი უპასუხოდ. (Nights, weekends, holidays — no call left unanswered.)
2. ბუნებრივი ქართული (Natural Georgian) — საუბრობს ისე, როგორც თქვენი საუკეთესო ადმინისტრატორი. (Speaks like your best receptionist.)
3. ავტომატური ჯავშნები (Automatic bookings) — ჩაწერს ვიზიტს კალენდარში და დაადასტურებს შეტყობინებით. (Books the visit and confirms by message.)
4. ყველა არხი ერთად (All channels together) — ზარები და მესენჯერები — ერთ ისტორიაში. (Calls and messengers in one history.)
5. ნაკლები ხარჯი (Lower cost) — ერთი AI ერთდროულად ბევრ საუბარს უძღვება. (One AI handles many conversations at once.)
6. ანალიტიკა (Analytics) — ჩანაწერები, ტრანსკრიპტები და შეჯამება ყოველი ზარისთვის. (Recordings, transcripts and a summary for every call.)

**FAQ**
- // 04 — კითხვები · ხშირად დასმული კითხვები (Frequently asked questions)
1. რამდენად ბუნებრივად საუბრობს VIKI ქართულად? (How naturally does VIKI speak Georgian?) — VIKI შექმნილია ქართული მეტყველებისთვის: ესმის სწრაფი საუბარი და შერეული ქართულ-ინგლისური ფრაზები, პასუხობს ბუნებრივი ინტონაციით. (Built for Georgian speech: it understands fast speech and mixed Georgian-English phrases and replies with natural intonation.)
2. რა ხდება, თუ VIKI-ს კითხვაზე პასუხი არ აქვს? (What if VIKI has no answer?) — ზარს მაშინვე გადაამისამართებს თქვენს თანამშრომელთან ან ჩაიწერს შეტყობინებას და გაცნობებთ. (It transfers the call to your staff right away, or takes a message and notifies you.)
3. რა დრო სჭირდება დანერგვას? (How long does setup take?) — როგორც წესი, რამდენიმე დღე: ვაგროვებთ თქვენს ინფორმაციას, ვაწყობთ სცენარებს და ვატარებთ სატესტო ზარებს. (Usually a few days: we collect your info, configure scenarios and run test calls.)
4. შემიძლია ჩემი არსებული ნომრის გამოყენება? (Can I keep my existing number?) — დიახ. შეგიძლიათ ზარების გადამისამართება არსებული ნომრიდან ან ახალი ნომრის აღება. (Yes. Forward calls from your existing number or get a new one.)
5. როგორ არის დაცული მონაცემები? (How is data protected?) — საუბრები და ჩანაწერები დაშიფრულად ინახება, წვდომა კი მხოლოდ თქვენს გუნდს აქვს. (Conversations and recordings are stored encrypted; only your team has access.) ⚠ Confirm this matches the real infrastructure.
6. რომელ არხებთან მუშაობს VIKI? (Which channels does VIKI support?) — ტელეფონი, Instagram, WhatsApp, Viber, Facebook Messenger და ელფოსტა.

**CTA band**
- // 05 — კონტაქტი
- მიეცით თქვენს ბიზნესს ხმა, რომელიც არასდროს ისვენებს. (Give your business a voice that never rests.)
- დემო ზარი · დაგვიკავშირდით · koshkelovn@list.ru

**Footer**
- ხმოვანი AI რესეფშენი ქართული ბიზნესისთვის. (Voice AI receptionist for Georgian business.)
- პროდუქტი: არხები (Channels), სარგებელი, დემო ზარი
- კომპანია: ჩვენს შესახებ, კითხვები, კონტაქტი
- იურიდიული: კონფიდენციალურობის პოლიტიკა | მომსახურების პირობები | Cookie-პოლიტიკა
- © 2026 VIKI AI. ყველა უფლება დაცულია.

## 4. Wireframe

```
[ floating glass nav: logo+VIKI AI | 4 links | შესვლა  (დემო ზარი) ]   ≤1079px → burger

HERO (100svh) ──────────────────────────────────────────────────────
 bg: dense particle cloud + vignette + grain
 ┌ copy (left) ─────────────────┐   ┌ figure (right) ─────────────┐
 │ // VIKI AI VOICE AGENT       │   │  rings + cross (faint)      │
 │ H1 2 lines                   │   │  ridged chrome bust         │
 │ sub (muted)                  │   │  · throat / · sternum       │
 │ (დემო ზარი)  [შესვლა]        │   │ [● შემომავალი ზარი ▮▮▮]     │
 └──────────────────────────────┘   └─────────────────────────────┘
 98% | <1 წმ | 24/7     (hairline dividers)
 mobile: copy → torso → stats, full-width buttons

01 CHANNELS ────────────────────────────────────────────────────────
 centered head + lead
            (phone)
   (email)            (Instagram)
          ~cable~ ORB ~cable~        7 channels on a dashed ellipse
 (Messenger)            (WhatsApp)
       (Facebook)   (Viber)
 mobile: orb on top, channels 4+3 grid, no cables

02 ABOUT     H2 left | lead + body right;  01 | 02 | 03 steps row
03 BENEFITS  H2; 3×2 glass cards (2 cols tablet, 1 col mobile)
04 FAQ       H2 left | accordion right
05 CTA       rounded band: H2, (დემო ზარი) [დაგვიკავშირდით], email
FOOTER       logo + tagline + email | 3 link columns | © line
```

## 5. Code map

| File | Role |
|---|---|
| `index.html` | Markup and all copy |
| `css/styles.css` | Tokens, layout, responsive (1080 / 720 breakpoints), reduced motion |
| `js/config.js` | **CONFIG**: every tuning value (density, repulsion, glow, breath, pulses…) |
| `js/particleField.js` | Hero dot cloud (ImageData renderer, flow grid, cursor repulsion and swirl) |
| `js/headMesh.js` | Hero figure (current): BustBaseMesh in Three.js — lit shell, quad wire, nodes, neon waves, look-at, blink, click dents, bloom. Falls back to `headMatrix.js` without WebGL |
| `assets/models/` | `bustHead.obj.js`: BustBaseMesh_Decimated with the shoulders cropped, parsed by OBJLoader. `bustWire.js`: the Lowpoly quad topology projected onto that surface. Both are built by `tools/buildHeadModel.js`; do not publish `tools/` |
| `js/vendor/` | Three.js r147 (`three.min.js`, `OBJLoader.js`): the last release with classic scripts, so the page still runs from file:// |
| `js/headMatrix.js` | Fallback hero figure: formula-built dot head |
| `js/voiceSilhouette.js` | Older hero figure (metaball body → shaded scan lines, bloom, breath, parallax, scroll dissolve) |
| `js/channelOrbit.js` | Orb section (ellipse layout, spring cables, pulse → 120–180 ms → reply, lazy video, living rings on two canvases around the orb, click-to-connect). The rings inside `orb.mp4` are part of the footage |
| `js/wireTerrain.js` | CTA band: endless monochrome wireframe mountains, light pulses on the lines, wheel zoom through the relief, only with the cursor over the fully visible mountains; otherwise the page scrolls as usual |
| `js/main.js` | Wiring: visibility start/stop, pointer/scroll, nav, FAQ, reveals, call chip |

Placeholders to fill: the login URL (`href="#"` on შესვლა), the legal page links, and the stat values.
