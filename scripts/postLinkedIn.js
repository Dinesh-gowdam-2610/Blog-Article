// ─── postLinkedIn.js ──────────────────────────────────────────────────────────
// Posts a WEEKLY ROUNDUP to LinkedIn every Wednesday.
// 8 completely different trending patterns — rotates by ISO week number.
//
// ALL content is dynamic — pulled from post-history.json article data.
// No hardcoded filler lines. Every sentence comes from the real articles.
//
// Required GitHub Secrets:
//   LINKEDIN_ACCESS_TOKEN  → OAuth token (expires every 60 days)
//   LINKEDIN_PERSON_URN    → e.g. "urn:li:person:ABC123xyz"
// ─────────────────────────────────────────────────────────────────────────────

const LINKEDIN_API = "https://api.linkedin.com/v2";

// ── Get Monday of current week (IST) ─────────────────────────────────────────
function getThisWeekMonday() {
  const todayIST  = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const d         = new Date(todayIST);
  const day       = d.getDay();
  const daysToMon = day === 0 ? -6 : 1 - day;
  const monday    = new Date(d);
  monday.setDate(d.getDate() + daysToMon);
  return monday.toISOString().split("T")[0];
}

// ── Read this week's posts from history ───────────────────────────────────────
async function getThisWeeksPosts() {
  try {
    const fs   = await import("fs");
    const path = await import("path");
    const fp   = path.default.resolve(process.cwd(), "logs/post-history.json");
    if (!fs.default.existsSync(fp)) return [];
    const history   = JSON.parse(fs.default.readFileSync(fp, "utf8"));
    const mondayIST = getThisWeekMonday();
    return history.filter(h => h.date >= mondayIST);
  } catch {
    return [];
  }
}

// ── Build hashtags from the week's service topics ─────────────────────────────
function buildTags(posts) {
  const base = new Set([
    "ai","artificialintelligence","machinelearning","llm","softwareengineering","devto","programming",
  ]);
  const map = {
    // AI topics (primary focus)
    LLMIntegration:      ["llm","genai"],
    ChatGPTForEngineers: ["chatgpt","openai"],
    ClaudeCode:          ["claude","aicoding"],
    PromptEngineering:   ["promptengineering","genai"],
    AIAgents:            ["aiagents","agenticai"],
    AIPairProgramming:   ["aicoding","developertools"],
    AIDevTools:          ["aitools","developertools"],
    PromptTipsAndTricks: ["promptengineering","aitips"],
    AIWorkflows:         ["aiworkflow","productivity"],
    MCP:                 ["mcp","aitools"],
    ClaudeFeatures:      ["claude","anthropic"],
    AICodingAssistants:  ["aicoding","developertools"],
    CursorAI:            ["cursor","aicoding"],
    // Supporting engineering topics
    Lambda:             ["serverless","awslambda"],
    ECS:                ["docker","containers"],
    AppRunner:          ["serverless","containers"],
    S3:                 ["cloudstorage"],
    DynamoDB:           ["dynamodb","nosql"],
    RDS:                ["database","postgresql"],
    ElastiCache:        ["redis","caching"],
    SQS:                ["messagequeue","eventdriven"],
    SNS:                ["pubsub","eventdriven"],
    EventBridge:        ["eventdriven","microservices"],
    APIGateway:         ["api","restapi"],
    CloudFront:         ["cdn","performance"],
    Bedrock:            ["generativeai","llm"],
    CloudWatch:         ["observability","monitoring"],
    SecretsManager:     ["security","devsecops"],
    IAM:                ["cloudsecurity"],
    CDK:                ["iac","devops"],
    StepFunctions:      ["serverless","workflow"],
    Kinesis:            ["streaming","eventdriven"],
    NodeJS22:           ["nodejs","runtimes"],
    NodeJSPerformance:  ["nodejs","backend"],
    NodeJSTesting:      ["testing","tdd"],
    TypeScript55:       ["typescript","typesafety"],
    TypeScriptPatterns: ["typescript","designpatterns"],
    TypeScriptBuild:    ["typescript","esbuild"],
    JavaScriptPatterns: ["javascript","es2025"],
    NodeJSFrameworks:   ["nodejs","backend"],
  };
  posts.forEach(p => (map[p.service] ?? []).slice(0, 2).forEach(t => base.add(t)));
  return [...base].slice(0, 10).map(t => `#${t}`).join(" ");
}

// ── Extract a stat/number from any article field ──────────────────────────────
function extractStat(post) {
  const sources = [post.hook, post.angle, post.gotchaToReveal, post.title].filter(Boolean);
  for (const text of sources) {
    const m = text.match(/\$[\d,]+[k]?|[\d,.]+\s*(?:ms|%|x|messages?|lines?|services?|days?|hours?|minutes?|KB|MB|GB)/i);
    if (m) return m[0];
  }
  return null;
}

// ── Get the single best insight line from a post ──────────────────────────────
// Priority: hook sentence 1 → angle → gotcha → title
function getInsight(post) {
  if (post.hook) {
    const first = post.hook.split(/[.!?]/)[0].trim();
    if (first.length > 20 && first.length < 140) return first;
  }
  if (post.angle) {
    const first = post.angle.split(/[.!?]/)[0].trim();
    if (first.length > 20 && first.length < 140) return first;
  }
  if (post.gotchaToReveal) {
    const first = post.gotchaToReveal.split(/[.!?]/)[0].trim();
    if (first.length > 20) return first.slice(0, 140);
  }
  return post.title;
}

// ── Get the gotcha line from a post ───────────────────────────────────────────
function getGotcha(post) {
  if (post.gotchaToReveal) return post.gotchaToReveal.split(/[.!?]/)[0].trim().slice(0, 140);
  if (post.angle)          return post.angle.split(/[.!?]/)[0].trim().slice(0, 140);
  return null;
}

// ── Emoji sets for rotating ───────────────────────────────────────────────────
const EMOJIS = {
  numbers: ["1️⃣","2️⃣","3️⃣","4️⃣","5️⃣"],
  warn:    ["❌","⚠️","🔥","💸","🚨"],
  insight: ["🎯","⚡","💡","🔑","🛠️"],
  track:   ["📊","📈","📉","🔍","📌"],
  traffic: ["🔴","🟡","🟢","🔵","🟣"],
};


// ─────────────────────────────────────────────────────────────────────────────
// SINGLE TEMPLATE — screenshot-style educational post
// One consistent structure per week, filled with article-specific content
// generated by a small Groq call (Wednesday only). Falls back to a formulaic
// version if Groq is unavailable, so LinkedIn posting is never blocked.
// ─────────────────────────────────────────────────────────────────────────────

// ── Service → thematic emoji + focused topic tags ────────────────────────────
const SERVICE_STYLE = {
  AIAgents:            { hookEmoji: "🚀", coreEmoji: "🔄", tags: ["AIAgents","AgenticAI","AutonomousAI","ArtificialIntelligence"] },
  ClaudeCode:          { hookEmoji: "🤖", coreEmoji: "⚡", tags: ["ClaudeCode","Anthropic","AICoding","AIAssistant"] },
  ChatGPTForEngineers: { hookEmoji: "💬", coreEmoji: "⚡", tags: ["ChatGPT","OpenAI","AIForDevelopers","LLM"] },
  CursorAI:            { hookEmoji: "🎯", coreEmoji: "⚡", tags: ["CursorAI","AICoding","DeveloperTools","AINativeDevelopment"] },
  MCP:                 { hookEmoji: "🔌", coreEmoji: "🔄", tags: ["MCP","ModelContextProtocol","AITools","AgenticAI"] },
  PromptEngineering:   { hookEmoji: "✍️", coreEmoji: "💡", tags: ["PromptEngineering","GenerativeAI","LLM","AITips"] },
  PromptTipsAndTricks: { hookEmoji: "✨", coreEmoji: "💡", tags: ["PromptEngineering","AITips","LLM","GenerativeAI"] },
  AIPairProgramming:   { hookEmoji: "👥", coreEmoji: "⚡", tags: ["AIPairProgramming","AICoding","DeveloperProductivity","AIForDevelopers"] },
  AIDevTools:          { hookEmoji: "🛠️", coreEmoji: "⚡", tags: ["AIDevTools","DeveloperTools","AICoding","AIForDevelopers"] },
  AIWorkflows:         { hookEmoji: "⚙️", coreEmoji: "🔄", tags: ["AIWorkflows","DeveloperProductivity","AIAutomation","AIForDevelopers"] },
  LLMIntegration:      { hookEmoji: "🔗", coreEmoji: "⚡", tags: ["LLM","GenerativeAI","AIEngineering","LargeLanguageModels"] },
  ClaudeFeatures:      { hookEmoji: "🎨", coreEmoji: "⚡", tags: ["Claude","Anthropic","AI","GenerativeAI"] },
  AICodingAssistants:  { hookEmoji: "🧠", coreEmoji: "⚡", tags: ["AICoding","AIAssistant","DeveloperTools","AIForDevelopers"] },
};

const DEFAULT_STYLE = { hookEmoji: "🚀", coreEmoji: "🔄", tags: ["AI","SoftwareEngineering","GenerativeAI","AIForDevelopers"] };

// Section emoji rotation — every section line uses one
const SECTION_EMOJIS = ["🤖","🔄","🛠️","🚀","🛡️","📊","💡","⚙️","🎯","🔍"];

// ── Small standalone Groq call — 400 tokens, JSON-only, timeout-guarded ──────
async function groqLite(prompt, { model = process.env.GROQ_MODEL_ID || "openai/gpt-oss-120b", max_tokens = 1800, timeoutMs = 90_000 } = {}) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY not set");

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens,
        temperature:      0.7,
        response_format:  { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Groq ${res.status}: ${err.slice(0, 200)}`);
    }
    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? "";
  } finally {
    clearTimeout(t);
  }
}

// ── Generate article-specific content for the template ──────────────────────
// Returns { framingQuestion, mechanism, sections[], keyTakeaway } or null.
// If it returns null, buildScreenshotStylePost falls back to a formulaic version.
async function generatePostContent(post) {
  const prompt = `You are writing a LinkedIn preview for a technical blog post. Return ONLY valid JSON, no markdown, no explanation.

Article details:
  Title  : ${post.title}
  Hook   : ${post.hook   ?? ""}
  Angle  : ${post.angle  ?? ""}
  Gotcha : ${post.gotchaToReveal ?? ""}
  Topic  : ${post.service ?? "AI"}

Task — produce these fields for a LinkedIn post that teases the article:

1. framingQuestion  → a SPECIFIC question the article answers, comparing to something familiar.
   Example (for AI Agents): "What makes an AI agent different from a chatbot or a traditional LLM?"
   NOT generic like "What is X?" — must reference something concrete.

2. mechanism        → if the article describes a NAMED pattern or loop (e.g. "Plan → Act → Observe",
   "Retrieve → Augment → Generate", "Client → Server → Tool"), return the exact 3-4 step name with
   arrows. If no clear named mechanism exists, return null.

3. sections         → an array of exactly 5 short, ARTICLE-SPECIFIC bullet titles the article covers.
   Each 4-8 words, starting with a capital letter. Vary the wording — don't use "What X is" for all.
   Example for AI Agents:
     ["What an AI Agent really is",
      "The Plan → Act → Observe execution loop",
      "Building a simple AI Agent with AWS Lambda",
      "Practical Node.js implementation examples",
      "Best practices for production-ready AI agents"]

4. keyTakeaway      → one sentence (max 30 words) capturing the article's most important insight.
   Not a summary — the reveal. Written as a confident statement.

Return this JSON exactly:
{
  "framingQuestion": "...",
  "mechanism": "..." or null,
  "sections": ["...", "...", "...", "...", "..."],
  "keyTakeaway": "..."
}`;

  try {
    const raw     = await groqLite(prompt, { max_tokens: 1800 });
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const data    = JSON.parse(cleaned);

    // Validate — every field must exist and be usable
    if (typeof data.framingQuestion !== "string" || data.framingQuestion.length < 10) return null;
    if (!Array.isArray(data.sections) || data.sections.length < 3)                     return null;
    if (typeof data.keyTakeaway !== "string" || data.keyTakeaway.length < 10)          return null;

    // Clean sections
    data.sections = data.sections.filter(s => typeof s === "string" && s.length > 3).slice(0, 6);
    if (data.sections.length < 3) return null;

    return data;
  } catch (err) {
    console.warn("⚠️  LinkedIn content-gen Groq call failed (falling back to formulaic):", err.message);
    return null;
  }
}

// ── Formulaic fallback content (when Groq call fails) ────────────────────────
function fallbackContent(post) {
  const subject = post.title.split(/[:—-]/)[0].trim() || "this topic";
  return {
    framingQuestion: `What actually makes ${subject} different from what came before?`,
    mechanism:       null,
    sections: [
      `What ${subject} really is`,
      `How the mechanism actually works`,
      `Practical implementation examples`,
      `Real-world software engineering use cases`,
      `Best practices for production-ready systems`,
    ],
    keyTakeaway: post.gotchaToReveal || post.angle || post.hook || post.title,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6 ROTATING LINKEDIN POST PATTERNS
// Every pattern renders a high-quality screenshot-style post using the same
// article-specific content (framingQuestion, mechanism, sections, keyTakeaway).
// A persistent rotation guarantees no two consecutive weeks use the same pattern,
// and each pattern waits at least 4 weeks before reappearing.
// ─────────────────────────────────────────────────────────────────────────────

const PATTERN_HISTORY_FILE = "logs/linkedin-pattern-history.json";
const PATTERN_COOLDOWN     = 4;   // a pattern can't reappear within this many weeks

// ── Load the last N pattern IDs used ────────────────────────────────────────
async function loadRecentPatternIds() {
  try {
    const fsMod   = await import("fs");
    const pathMod = await import("path");
    const fs      = fsMod.default ?? fsMod;
    const path    = pathMod.default ?? pathMod;
    const fp      = path.resolve(process.cwd(), PATTERN_HISTORY_FILE);
    if (!fs.existsSync(fp)) return [];
    const data = JSON.parse(fs.readFileSync(fp, "utf8"));
    return Array.isArray(data) ? data.slice(-PATTERN_COOLDOWN) : [];
  } catch {
    return [];
  }
}

// ── Append the chosen pattern ID so next week knows what to skip ────────────
async function savePatternId(patternId) {
  try {
    const fsMod   = await import("fs");
    const pathMod = await import("path");
    const fs      = fsMod.default ?? fsMod;
    const path    = pathMod.default ?? pathMod;
    const fp      = path.resolve(process.cwd(), PATTERN_HISTORY_FILE);
    const dir     = path.dirname(fp);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    let history = [];
    if (fs.existsSync(fp)) {
      try { history = JSON.parse(fs.readFileSync(fp, "utf8")) || []; } catch {}
    }
    history.push({ id: patternId, date: new Date().toISOString().split("T")[0] });
    history = history.slice(-20); // keep rolling 20 for debug
    fs.writeFileSync(fp, JSON.stringify(history, null, 2));
    console.log(`📝  Pattern "${patternId}" recorded for cooldown tracking.`);
  } catch (err) {
    console.warn("⚠️  Could not write pattern history (non-fatal):", err.message);
  }
}

// ── Helpers reused across patterns ──────────────────────────────────────────
function _styleFor(post) {
  return SERVICE_STYLE[post.service] ?? DEFAULT_STYLE;
}
function _subjectOf(post) {
  const raw = post.title.split(/[:—-]/)[0].trim();
  return raw
    .replace(/\b(Explained|A Guide|The Guide|Introduction|Intro|Deep Dive|Overview|Simplified|Made Simple)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim() || raw;
}
function _hookLineOf(post) {
  const h = (post.hook || post.title).split(/[.!?]/)[0].trim();
  return h.length > 20 && h.length < 200 ? h : post.title;
}
function _insightOf(post) {
  const i = (post.angle || "").split(/[.!?]/)[0].trim();
  return i.length > 10 ? i : `it comes down to a simple but powerful pattern`;
}
function _sectionLinesFor(content) {
  return content.sections.map((s, i) => `${SECTION_EMOJIS[i % SECTION_EMOJIS.length]} ${s}`);
}
function _tagsFor(post) {
  const style       = _styleFor(post);
  const topicTags   = style.tags.map(t => `#${t}`).join(" ");
  const closingTags = "#SoftwareEngineering #AI #GenerativeAI";
  return `${topicTags} ${closingTags}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// PATTERN A — "trending-question" (the original screenshot-style)
// ─────────────────────────────────────────────────────────────────────────────
function patternA_trending_question(post, content) {
  const style   = _styleFor(post);
  const subject = _subjectOf(post);
  const lines = [
    `${style.hookEmoji} ${_hookLineOf(post)}`,
    ``,
    `Over the past few months, ${subject} has become one of the biggest trends in software engineering.`,
    ``,
    `Yet one question keeps coming up: 🤔`,
    ``,
    content.framingQuestion,
    ``,
    `While exploring this topic, I realized — ${_insightOf(post)}.`,
    ``,
  ];
  if (content.mechanism) {
    lines.push(`${style.coreEmoji} ${content.mechanism}`, ``, `Every effective ${subject} follows this pattern:`, ``);
  }
  lines.push(
    `📖 In my latest article, I cover:`, ``,
    ..._sectionLinesFor(content), ``,
    `💡 Key Takeaway`, ``,
    content.keyTakeaway, ``,
    `Understanding these patterns is becoming an essential skill for developers building the next generation of intelligent applications.`, ``,
    `💬 I'm curious — have you started experimenting with ${subject} in your projects? What use cases have you found most valuable?`, ``,
    `Read the full breakdown: ${post.url}`, ``,
    _tagsFor(post),
  );
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// PATTERN B — "myth vs reality" (opens with a common misconception)
// ─────────────────────────────────────────────────────────────────────────────
function patternB_myth_vs_reality(post, content) {
  const style   = _styleFor(post);
  const subject = _subjectOf(post);
  const lines = [
    `${style.hookEmoji} There's a common belief about ${subject} that I need to push back on.`,
    ``,
    `${_hookLineOf(post)}.`,
    ``,
    `Here's the question most people get wrong 👇`,
    ``,
    content.framingQuestion,
    ``,
    `The truth? ${_insightOf(post)}.`,
    ``,
  ];
  if (content.mechanism) {
    lines.push(`${style.coreEmoji} The real pattern is: ${content.mechanism}`, ``);
  }
  lines.push(
    `This week on dev.to, I unpacked:`, ``,
    ..._sectionLinesFor(content), ``,
    `💡 The bottom line`, ``,
    content.keyTakeaway, ``,
    `Getting this right separates engineers who ship AI features from those who struggle with them.`, ``,
    `❓ Have you run into this misconception on your team? How did you handle it?`, ``,
    `Full article: ${post.url}`, ``,
    _tagsFor(post),
  );
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// PATTERN C — "lessons learned" (first-person engineering journal)
// ─────────────────────────────────────────────────────────────────────────────
function patternC_lessons_learned(post, content) {
  const style   = _styleFor(post);
  const subject = _subjectOf(post);
  const lines = [
    `${style.hookEmoji} Working with ${subject} this past week taught me something I didn't expect.`,
    ``,
    `${_hookLineOf(post)}.`,
    ``,
    `The question I kept hitting:`,
    ``,
    content.framingQuestion,
    ``,
    `What finally clicked: ${_insightOf(post)}.`,
    ``,
  ];
  if (content.mechanism) {
    lines.push(`${style.coreEmoji} The mental model that helped: ${content.mechanism}`, ``);
  }
  lines.push(
    `📓 I wrote up everything I learned — here's what's inside:`, ``,
    ..._sectionLinesFor(content), ``,
    `💡 Biggest lesson`, ``,
    content.keyTakeaway, ``,
    `Sharing in case it saves someone else a few hours.`, ``,
    `💬 What was your first "aha" moment with ${subject}?`, ``,
    `Read it here: ${post.url}`, ``,
    _tagsFor(post),
  );
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// PATTERN D — "quick breakdown" (punchy, scannable, lead with the answer)
// ─────────────────────────────────────────────────────────────────────────────
function patternD_quick_breakdown(post, content) {
  const style   = _styleFor(post);
  const subject = _subjectOf(post);
  const lines = [
    `${style.hookEmoji} ${content.framingQuestion}`,
    ``,
    `Short answer: ${_insightOf(post)}.`,
    ``,
    `The longer version is worth your time, because ${_hookLineOf(post).toLowerCase()}.`,
    ``,
  ];
  if (content.mechanism) {
    lines.push(`${style.coreEmoji} The core idea in 3 steps: ${content.mechanism}`, ``);
  }
  lines.push(
    `🔎 Here's the full breakdown — article covers:`, ``,
    ..._sectionLinesFor(content), ``,
    `💡 One line to remember`, ``,
    content.keyTakeaway, ``,
    `If you're building anything with ${subject}, this is worth 5 minutes of your time.`, ``,
    `💭 What's your take — agree, or do you see it differently?`, ``,
    `👉 ${post.url}`, ``,
    _tagsFor(post),
  );
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// PATTERN E — "beginner-friendly guide" (teaching-forward, inclusive tone)
// ─────────────────────────────────────────────────────────────────────────────
function patternE_beginner_guide(post, content) {
  const style   = _styleFor(post);
  const subject = _subjectOf(post);
  const lines = [
    `${style.hookEmoji} If you've been curious about ${subject} but didn't know where to start — this one's for you.`,
    ``,
    `${_hookLineOf(post)}.`,
    ``,
    `A question I get from engineers at every level:`,
    ``,
    content.framingQuestion,
    ``,
    `Here's how I'd explain it: ${_insightOf(post)}.`,
    ``,
  ];
  if (content.mechanism) {
    lines.push(`${style.coreEmoji} At its core, it works like this: ${content.mechanism}`, ``);
  }
  lines.push(
    `📚 I wrote a step-by-step guide covering:`, ``,
    ..._sectionLinesFor(content), ``,
    `💡 The one thing to take away`, ``,
    content.keyTakeaway, ``,
    `No jargon, no fluff — just the mental model and the code.`, ``,
    `💬 What topic do you wish someone would explain clearly like this?`, ``,
    `🔗 ${post.url}`, ``,
    _tagsFor(post),
  );
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// PATTERN F — "stop doing / start doing" (actionable contrast)
// ─────────────────────────────────────────────────────────────────────────────
function patternF_stop_start(post, content) {
  const style   = _styleFor(post);
  const subject = _subjectOf(post);
  const lines = [
    `${style.hookEmoji} If you're building with ${subject}, stop and read this.`,
    ``,
    `${_hookLineOf(post)}.`,
    ``,
    `Here's the question worth sitting with:`,
    ``,
    content.framingQuestion,
    ``,
    `My take after digging into this: ${_insightOf(post)}.`,
    ``,
  ];
  if (content.mechanism) {
    lines.push(`${style.coreEmoji} The approach I'd follow: ${content.mechanism}`, ``);
  }
  lines.push(
    `📝 I put together a practical write-up covering:`, ``,
    ..._sectionLinesFor(content), ``,
    `💡 What to remember`, ``,
    content.keyTakeaway, ``,
    `Small shifts in approach here save hours of debugging later.`, ``,
    `💬 What's one habit you've changed since working with ${subject}?`, ``,
    `Full article → ${post.url}`, ``,
    _tagsFor(post),
  );
  return lines.join("\n");
}

// ── Pattern registry ────────────────────────────────────────────────────────
const PATTERN_REGISTRY = [
  { id: "trending-question", name: "Trending question",   fn: patternA_trending_question },
  { id: "myth-vs-reality",   name: "Myth vs reality",     fn: patternB_myth_vs_reality   },
  { id: "lessons-learned",   name: "Lessons learned",     fn: patternC_lessons_learned   },
  { id: "quick-breakdown",   name: "Quick breakdown",     fn: patternD_quick_breakdown   },
  { id: "beginner-guide",    name: "Beginner-friendly",   fn: patternE_beginner_guide    },
  { id: "stop-start",        name: "Stop & start",        fn: patternF_stop_start        },
];

// ── Pick a pattern that hasn't been used in the cooldown window ─────────────
async function pickPattern() {
  const recent = await loadRecentPatternIds();
  const recentIds = new Set(recent.map(r => (typeof r === "string" ? r : r.id)));

  const eligible = PATTERN_REGISTRY.filter(p => !recentIds.has(p.id));
  const pool     = eligible.length > 0 ? eligible : PATTERN_REGISTRY; // safety fallback
  const chosen   = pool[Math.floor(Math.random() * pool.length)];

  console.log(`🎨  Pattern selected: "${chosen.name}" (id: ${chosen.id})`);
  console.log(`    Recent patterns (cooldown ${PATTERN_COOLDOWN}): ${[...recentIds].join(", ") || "none"}`);
  return chosen;
}

// ── Main builder — called by postToLinkedIn ─────────────────────────────────
async function buildWeeklyPost(posts /*, tags */) {
  const lead = posts[posts.length - 1] ?? posts[0];
  console.log(`📐  Building LinkedIn post for: "${lead.title.slice(0, 60)}..."`);

  // Sleep 65s to guarantee a clean Groq rate-limit window (SEO call ran earlier)
  console.log("⏸️   Waiting 65s for Groq TPM window before LinkedIn content-gen call...");
  await new Promise(r => setTimeout(r, 65_000));
  console.log("✅  Window reset. Requesting article-specific content.");

  // Groq fills the dynamic slots; falls back to formulaic if the call fails
  let content = await generatePostContent(lead);
  if (!content) {
    console.log("   Using formulaic fallback content.");
    content = fallbackContent(lead);
  } else {
    console.log("   ✅ Article-specific content generated by Groq.");
  }

  // Rotate patterns — guarantees no repeat for PATTERN_COOLDOWN weeks
  const pattern = await pickPattern();
  const postText = pattern.fn(lead, content);

  // Record this pattern so next week's picker skips it
  await savePatternId(pattern.id);

  return postText;
}
// ── Main export ───────────────────────────────────────────────────────────────
export async function postToLinkedIn({ title, url, topic }) {
  const accessToken = process.env.LINKEDIN_ACCESS_TOKEN;
  const personUrn   = process.env.LINKEDIN_PERSON_URN;

  if (!accessToken || !personUrn) {
    console.log("⏭️   LinkedIn: skipping — credentials not set");
    return { skipped: true, reason: "missing_credentials" };
  }

  // ── Wednesday only ────────────────────────────────────────────────────────
  const todayIST  = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const dayOfWeek = new Date(todayIST).getDay();
  const dayNames  = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  if (dayOfWeek !== 3) {
    console.log(`⏭️   LinkedIn: skipping (${dayNames[dayOfWeek]}) — weekly roundup on Wednesday only`);
    return { skipped: true, reason: "not_wednesday" };
  }

  // ── Same-day guard — never post twice on the same Wednesday ──────────────
  // The Dev.to workflow now runs twice a day. Without this guard, both
  // Wednesday runs (morning + evening) would each try to post to LinkedIn.
  // We record the last-successful-post date in logs/linkedin-last-post.txt
  // (auto-committed with the rest of logs/). If that matches today, skip.
  const fsMod   = await import("fs");
  const pathMod = await import("path");
  const fs      = fsMod.default ?? fsMod;
  const path    = pathMod.default ?? pathMod;
  const markerPath = path.resolve(process.cwd(), "logs/linkedin-last-post.txt");

  try {
    if (fs.existsSync(markerPath)) {
      const lastPostDate = fs.readFileSync(markerPath, "utf8").trim();
      if (lastPostDate === todayIST) {
        console.log(`⏭️   LinkedIn: already posted today (${todayIST}) — skipping duplicate run`);
        return { skipped: true, reason: "already_posted_today" };
      }
    }
  } catch { /* marker unreadable — proceed rather than block */ }

  console.log("📅  Wednesday — building weekly roundup...\n");

  // ── Get this week's posts ─────────────────────────────────────────────────
  const weekPosts = await getThisWeeksPosts();

  // Include today's article if not yet written to history
  const alreadyIn = weekPosts.some(p => p.url === url);
  if (!alreadyIn) {
    weekPosts.push({
      title,
      url,
      date:            todayIST,
      service:         topic.primaryService ?? "AWS",
      hook:            topic.hook            ?? "",
      angle:           topic.angle           ?? "",
      gotchaToReveal:  topic.gotchaToReveal  ?? "",
    });
  }

  if (weekPosts.length === 0) {
    console.log("⏭️   LinkedIn: no posts this week — skipping");
    return { skipped: true, reason: "no_posts_this_week" };
  }

  weekPosts.sort((a, b) => a.date.localeCompare(b.date));

  console.log(`📚  This week's articles (${weekPosts.length}):`);
  weekPosts.forEach(p => console.log(`   ${p.date} [${p.service}] ${p.title.slice(0, 60)}`));
  console.log();

  const tags     = buildTags(weekPosts);
  const postText = await buildWeeklyPost(weekPosts, tags);

  console.log("─── LinkedIn weekly roundup ────────────────────────────");
  console.log(postText);
  console.log("────────────────────────────────────────────────────────");
  console.log(`Length: ${postText.length} chars\n`);

  const featuredUrl = weekPosts[weekPosts.length - 1].url;

  const res = await fetch(`${LINKEDIN_API}/ugcPosts`, {
    method:  "POST",
    headers: {
      "Content-Type":              "application/json",
      "Authorization":             `Bearer ${accessToken}`,
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      author:         personUrn,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary:    { text: postText },
          shareMediaCategory: "ARTICLE",
          media: [{
            status:      "READY",
            description: { text: weekPosts[weekPosts.length - 1].title },
            originalUrl: featuredUrl,
            title:       { text: `AI, explained simply — ${weekPosts.length} this week` },
          }],
        },
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
      },
    }),
  });

  if (res.status === 401) {
    console.warn("⚠️  LinkedIn token expired. Update LINKEDIN_ACCESS_TOKEN in GitHub Secrets.");
    return { skipped: true, reason: "token_expired" };
  }

  if (!res.ok) {
    const err = await res.text();
    console.warn(`⚠️  LinkedIn post failed (${res.status}): ${err.slice(0, 300)}`);
    return { skipped: true, reason: `http_${res.status}` };
  }

  const data = await res.json();
  console.log(`✅  LinkedIn weekly roundup published! (${weekPosts.length} articles)`);
  console.log(`   Post ID: ${data.id ?? "unknown"}`);

  // Write today's date to the marker so the same-day guard blocks a second run
  try {
    const logsDir = path.dirname(markerPath);
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    fs.writeFileSync(markerPath, todayIST);
    console.log(`   Marker written: logs/linkedin-last-post.txt = ${todayIST}`);
  } catch (err) {
    console.warn("⚠️  Could not write LinkedIn same-day marker (non-fatal):", err.message);
  }

  return { success: true, id: data.id, articleCount: weekPosts.length };
}
