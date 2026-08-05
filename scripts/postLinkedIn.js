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
async function groqLite(prompt, { model = "llama-3.3-70b-versatile", max_tokens = 500, timeoutMs = 45_000 } = {}) {
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
    const raw     = await groqLite(prompt, { max_tokens: 500 });
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

// ── Compose the final LinkedIn post text using the template ─────────────────
function buildScreenshotStylePost(post, content) {
  const style   = SERVICE_STYLE[post.service] ?? DEFAULT_STYLE;

  // Extract a clean subject from the title (strip after colon/em-dash and trim suffixes)
  const rawSubject = post.title.split(/[:—-]/)[0].trim();
  const subject    = rawSubject
    .replace(/\b(Explained|A Guide|The Guide|Introduction|Intro|Deep Dive|Overview|Simplified|Made Simple)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim() || rawSubject;

  // Hook line — from the article's own hook
  const hookRaw  = (post.hook || post.title).split(/[.!?]/)[0].trim();
  const hookLine = hookRaw.length > 20 && hookRaw.length < 200 ? hookRaw : post.title;

  // Insight — from the article's angle
  const insightRaw = (post.angle || "").split(/[.!?]/)[0].trim();
  const insight    = insightRaw.length > 10 ? insightRaw : `it comes down to a simple but powerful pattern`;

  // Sections with rotating thematic emoji
  const sectionLines = content.sections.map((s, i) => `${SECTION_EMOJIS[i % SECTION_EMOJIS.length]} ${s}`);

  // Focused topic tags — from SERVICE_STYLE, no generic filler
  const topicTags   = style.tags.map(t => `#${t}`).join(" ");
  const closingTags = "#SoftwareEngineering #AI #GenerativeAI";
  const allTags     = `${topicTags} ${closingTags}`;

  const lines = [
    `${style.hookEmoji} ${hookLine}`,
    ``,
    `Over the past few months, ${subject} has become one of the biggest trends in software engineering.`,
    ``,
    `Yet one question keeps coming up: 🤔`,
    ``,
    content.framingQuestion,
    ``,
    `While exploring this topic, I realized — ${insight}.`,
    ``,
  ];

  // Mechanism block only if the model returned one
  if (content.mechanism) {
    lines.push(`${style.coreEmoji} ${content.mechanism}`);
    lines.push(``);
    lines.push(`Every effective ${subject} follows this pattern:`);
    lines.push(``);
  }

  lines.push(`📖 In my latest article, I cover:`);
  lines.push(``);
  lines.push(...sectionLines);
  lines.push(``);
  lines.push(`💡 Key Takeaway`);
  lines.push(``);
  lines.push(content.keyTakeaway);
  lines.push(``);
  lines.push(`Understanding these patterns is becoming an essential skill for developers building the next generation of intelligent applications.`);
  lines.push(``);
  lines.push(`💬 I'm curious — have you started experimenting with ${subject} in your projects? What use cases have you found most valuable?`);
  lines.push(``);
  lines.push(`Read the full breakdown: ${post.url}`);
  lines.push(``);
  lines.push(allTags);

  return lines.join("\n");
}

// ── Main builder — called by postToLinkedIn ─────────────────────────────────
// Kept as an async wrapper so the Groq call can happen. Posts uses the LATEST
// article as the featured post (screenshot-style is single-post focused).
async function buildWeeklyPost(posts /*, tags */) {
  // Featured post = the most recent one (latest Wednesday's article)
  const lead = posts[posts.length - 1] ?? posts[0];

  console.log(`📐  Building screenshot-style post for: "${lead.title.slice(0, 60)}..."`);

  // Sleep 65s to guarantee a clean Groq rate-limit window (SEO call ran earlier)
  console.log("⏸️   Waiting 65s for Groq TPM window before LinkedIn content-gen call...");
  await new Promise(r => setTimeout(r, 65_000));
  console.log("✅  Window reset. Requesting article-specific content.");

  // Try Groq for article-specific content; fall back if it fails
  let content = await generatePostContent(lead);
  if (!content) {
    console.log("   Using formulaic fallback content.");
    content = fallbackContent(lead);
  } else {
    console.log("   ✅ Article-specific content generated by Groq.");
  }

  return buildScreenshotStylePost(lead, content);
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
