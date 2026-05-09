# devCommunityBlogPost

Automatically generates and publishes technical blog posts to **Dev.to**
using **Groq** (LLaMA 3.3 70B) — triggered daily, weekly, or on demand via GitHub Actions.

---

## Folder Structure

```
devCommunityBlogPost/
│
├── scripts/
│   └── devCommunityBlogPost.js      ← main script (topic scout + writer + publisher)
│
├── .github/
│   └── workflows/
│       └── daily-post.yml           ← runs Mon–Fri at 10:00 AM IST (04:30 UTC)
│
├── logs/                            ← local run logs (gitignored)
├── .gitignore                       ← blocks .env, secrets, logs from git
├── package.json                     ← npm start
├── SECURITY.md                      ← full secret protection audit
└── README.md                        ← this file
```

---

## Setup (3 steps)

### 1. Get your API keys

| Key | Where |
|-----|-------|
| `GROQ_API_KEY` | [console.groq.com](https://console.groq.com) → API Keys → Create |
| `DEVTO_API_KEY` | [dev.to/settings/extensions](https://dev.to/settings/extensions) → Generate API Key |

### 2. Add secrets to GitHub

```
Your repo → Settings → Secrets and variables → Actions → New repository secret
```

Add both `GROQ_API_KEY` and `DEVTO_API_KEY`. That's it — never put them in code.

### 3. Enable Actions

```
Your repo → Actions tab → Enable workflows
```

---

## Workflow

One workflow file. One job. No modes, no inputs, no complexity.

| File | Schedule | Runs on |
|------|----------|---------|
| `daily-post.yml` | `30 4 * * 1-5` | Mon–Fri · 10:00 AM IST · 04:30 UTC |

Saturday and Sunday are **automatically skipped** by the `1-5` day-of-week field in the cron expression. No extra logic needed.

---

## Running Locally

```bash
# Requires Node.js 22+ — no npm install needed (uses only built-ins)

GROQ_API_KEY=gsk_... DEVTO_API_KEY=dv_... node scripts/devCommunityBlogPost.js

# or
npm start
```