# Calculo Consultoria

**Live:** [juanpablozunigahidalgo.github.io/konsult-kalkyl](https://juanpablozunigahidalgo.github.io/konsult-kalkyl/)  
**Author:** [Juan Pablo Zúñiga](https://zunigajp.com) — AI / Cloud consultant · AB · Göteborg, Sweden

---

A decision tool for independent consultants in Sweden.

Not a toy calculator. A sharp, console-minimal product that answers the question every serious consultant asks before saying yes:

> *With this hourly rate, this workload, these costs, and Swedish AB tax rules — is the offer actually good for me?*

Then it goes one step further: paste the job description, and an AI advisor reads your **live CV**, the offer, and the financial snapshot — and answers in Spanish with a verdict, market pricing, and a concrete counter-offer.

---

## Why this exists

Running an **Aktiebolag** as a consultant in Sweden is elegant on paper and brutal in the details:

- Timpris looks high until travel, tools, and bänk eat the margin  
- “Max salary” without understanding **brytpunkt** is an expensive mistake  
- **Tjänstepension** at 35% / 10 PBB is powerful — if you model it  
- A “good” rate for a mid generalist can be a bad rate for an AI / cloud specialist  

This repo is how I think about offers: numbers first, narrative second, ego last.

---

## What’s inside

| Layer | What you get |
|--------|----------------|
| **Contract inputs** | Timpris, omfattning, vacation, Swedish public holidays (röda dagar) |
| **Cost stack** | Transport (Västtrafik or car detail), lodging, education, hardware, digital/AI tools, telephony, accounting, insurance, conferences |
| **Tax engine** | Arbetsgivaravgifter, bolagsskatt, K10 dividend, Göteborg kommunalskatt, grundavdrag / jobbskatteavdrag approximations aligned to Skatteverket 2026 |
| **Executive summary** | One paragraph: revenue, pocket, pension, dividend, conclusion |
| **AI offer analysis** | Live CV from [zunigajp.com/english/cv](https://zunigajp.com/english/cv/) + pasted JD (EN/other) → strategic recommendation in Spanish |

UI: white, black, Consolas. Inspired by [zunigajp.com](https://zunigajp.com). No dashboard clutter.

---

## Who this signals (if you’re hiring / staffing)

If you’re HR, a hiring manager, or a consultancy partner scanning GitHub:

- I build **end-to-end products**, not slideware  
- I care about **domain truth** (Swedish tax, real consultant economics)  
- I ship **static, maintainable systems** (GitHub Pages, versioned fiscal data, CI deploy)  
- I connect **AI to real workflows** (live CV retrieval + Gemini analysis on top of a calculator, not a chatbot demo)  

Stack in practice: vanilla JS modules, precise fiscal modeling, GitHub Actions, secret injection for AI, CORS-safe live document fetch.

Background: dual MSc (Engineering + Management of Innovation, Chalmers), AI / cloud consulting (Oracle GenAI, AWS Bedrock, full-stack), based in Göteborg.

More: **[zunigajp.com](https://zunigajp.com)** · CV: **[zunigajp.com/english/cv](https://zunigajp.com/english/cv/)**

---

## Quick start

```bash
# needs a static server (ES modules)
npx --yes serve .
```

Open the printed URL. Defaults: **1000 SEK/h @ 70%** with a realistic Göteborg cost stack.

### AI analysis (optional)

1. Free key: [Google AI Studio](https://aistudio.google.com/apikey)  
2. Local: copy `js/config.example.js` → `js/config.local.js` (gitignored)  
3. Pages: set Actions secret `GEMINI_API_KEY` (injected at deploy, not stored in git history)

---

## Data & precision

| File | Role |
|------|------|
| `data/tax.json` | Official-style 2026 parameters (brytpunkt, PBB, avgifter, Göteborg rates) |
| `data/rates.json` | Market hourly bands + scenarios |

Fiscal calendar: Mon–Fri − Swedish public holidays − vacation − optional extra free days.

This is a high-fidelity **decision model**, not a substitute for your accountant or Skatteverket.

---

## Deploy

GitHub Actions → GitHub Pages (`Deploy GitHub Pages` workflow).  
Push to `master` / `main` publishes automatically.

---

## License / use

Built as a personal operating tool and a public craft sample.  
Fork it, adapt the cost defaults, point the CV fetch at your own site — and negotiate like an adult.

—
*Juan Pablo Zúñiga Hidalgo · Göteborg*
