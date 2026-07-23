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
// 8 PATTERNS — educational, AI-first. All content dynamic from article data.
// Framing teaches a concept and invites discussion — no cost/gotcha/rage-bait.
// ─────────────────────────────────────────────────────────────────────────────

function pattern1_learn_this_week(posts, tags) {
  const lead = posts[0];
  const insight = getInsight(lead);
  const lines = [
    `If you're learning AI, here's a clear place to start this week 👇`,
    ``,
    ...posts.map((p, i) => {
      const ins = getInsight(p);
      return [
        `${EMOJIS.insight[i % 5]} ${p.title}`,
        ins ? `   ${ins}` : ``,
        `   → ${p.url}`,
      ].filter(Boolean).join("\n");
    }),
    ``,
    `Each one breaks a complex idea into something you can actually follow.`,
    ``,
    `What AI concept do you wish someone would explain simply? ↓`,
    ``,
    tags,
  ];
  return lines.join("\n");
}

function pattern2_eli5(posts, tags) {
  const lead = posts[0];
  const insight = getInsight(lead);
  const lines = [
    `${lead.title}`,
    ``,
    `In plain English:`,
    insight ? insight + `.` : `A concept worth understanding, explained step by step.`,
    ``,
    posts.length > 1 ? `Plus ${posts.length - 1} more AI topics broken down simply this week:` : `Read the full breakdown:`,
    ``,
    ...posts.slice(posts.length > 1 ? 1 : 0).map((p, i) => `${EMOJIS.numbers[i] ?? (i + 1) + "."} ${p.title}\n   → ${p.url}`),
    ``,
    posts.length === 1 ? `→ ${lead.url}` : ``,
    `Which of these would help you most right now? ↓`,
    ``,
    tags,
  ].filter(l => l !== undefined && l !== "");
  return lines.join("\n");
}

function pattern3_save_this(posts, tags) {
  const lines = [
    `${posts.length} AI concepts, explained simply.`,
    ``,
    `(Save this — good for whenever you want to actually understand them.)`,
    ``,
    `↓`,
    ``,
    ...posts.flatMap((p, i) => {
      const insight = getInsight(p);
      return [
        `${EMOJIS.numbers[i] ?? (i + 1) + "."} ${p.title}`,
        ``,
        insight ? insight : ``,
        ``,
        `→ ${p.url}`,
        ``,
        i < posts.length - 1 ? `—` : ``,
        ``,
      ].filter(l => l !== undefined);
    }),
    `Which one are you sharing with someone learning AI? ↓`,
    ``,
    tags,
  ];
  return lines.filter(l => l !== undefined).join("\n");
}

function pattern4_how_it_works(posts, tags) {
  const lead = posts[0];
  const insight = getInsight(lead);
  const lines = [
    `Ever wondered how it actually works under the hood?`,
    ``,
    `This week I broke down ${posts.length === 1 ? "one AI concept" : `${posts.length} AI concepts`} from the ground up:`,
    ``,
    ...posts.map((p, i) => {
      const ins = getInsight(p);
      return [
        `${EMOJIS.insight[i % 5]} ${p.title}`,
        ins ? `   ${ins}` : ``,
        `   → ${p.url}`,
      ].filter(Boolean).join("\n");
    }),
    ``,
    `No hand-waving — just the mechanism, explained clearly with examples.`,
    ``,
    `What part of AI still feels like a black box to you? ↓`,
    ``,
    tags,
  ];
  return lines.join("\n");
}

function pattern5_beginner_friendly(posts, tags) {
  const topics = [...new Set(posts.map(p => p.service))].slice(0, 3).join(", ");
  const lines = [
    `New to AI and not sure where to start?`,
    ``,
    `Here's a beginner-friendly walkthrough of ${topics || "key AI concepts"} — no prior experience needed:`,
    ``,
    ...posts.map((p, i) => {
      const insight = getInsight(p);
      return [
        `${EMOJIS.insight[i % 5]} ${p.title}`,
        insight ? `   ${insight}` : ``,
        `   → ${p.url}`,
      ].filter(Boolean).join("\n");
    }),
    ``,
    `Written to be clear for beginners and still useful for experienced engineers.`,
    ``,
    `Tag someone who's just getting into AI ↓`,
    ``,
    tags,
  ];
  return lines.join("\n");
}

function pattern6_concept_explained(posts, tags) {
  const lines = [
    `${posts.length === 1 ? "One AI concept" : `${posts.length} AI concepts`}, explained clearly this week:`,
    ``,
    ...posts.map((p, i) => {
      const insight = getInsight(p);
      return [
        `${EMOJIS.insight[i % 5]} ${p.title}`,
        insight ? `   ${insight}` : ``,
        `   → ${p.url}`,
        ``,
      ].filter(Boolean).join("\n");
    }),
    `The goal: take something that sounds intimidating and make it click.`,
    ``,
    `Which AI topic should I break down next? ↓`,
    ``,
    tags,
  ];
  return lines.join("\n");
}

function pattern7_curiosity(posts, tags) {
  const lead = posts[0];
  const insight = getInsight(lead);
  const lines = [
    lead.title.endsWith("?") ? lead.title : `Here's something worth understanding about AI:`,
    ``,
    insight ? insight + `.` : ``,
    ``,
    posts.length > 1 ? `That plus ${posts.length - 1} more, explained simply this week:` : `Full explanation here:`,
    ``,
    ...posts.map((p, i) => `${EMOJIS.numbers[i] ?? (i + 1) + "."} ${p.title}\n   → ${p.url}`),
    ``,
    `The kind of thing that's obvious once someone explains it well.`,
    ``,
    `What clicked for you recently in AI? ↓`,
    ``,
    tags,
  ].filter(Boolean);
  return lines.join("\n");
}

function pattern8_this_week_learning(posts, tags) {
  const lines = [
    `This week in AI — ${posts.length === 1 ? "a concept" : `${posts.length} concepts`} worth learning:`,
    ``,
    ...posts.flatMap(p => {
      const insight = getInsight(p);
      return [
        `${EMOJIS.insight[0]} ${p.title}`,
        insight ? `→ ${insight}` : ``,
        `→ ${p.url}`,
        ``,
      ].filter(Boolean);
    }),
    `Each one written to teach, not to impress.`,
    ``,
    `What are you learning in AI right now? ↓`,
    ``,
    tags,
  ];
  return lines.join("\n");
}

// ── Pick pattern by absolute epoch-week index (guaranteed rotation) ──────────
function buildWeeklyPost(posts, tags) {
  // Rotate by absolute epoch-week index — increments by exactly 1 every
  // calendar week, so consecutive Wednesdays always get a different pattern
  // and the full 8-pattern cycle completes cleanly every 8 weeks.
  const now            = new Date();
  const daysSinceEpoch = Math.floor(now.getTime() / 86_400_000);
  const weekNum        = Math.floor(daysSinceEpoch / 7);
  const idx            = ((weekNum % 8) + 8) % 8;   // always 0–7, never negative

  const builders = [
    pattern1_learn_this_week,
    pattern2_eli5,
    pattern3_save_this,
    pattern4_how_it_works,
    pattern5_beginner_friendly,
    pattern6_concept_explained,
    pattern7_curiosity,
    pattern8_this_week_learning,
  ];
  const names = [
    "Learn This Week",     "Explain Like I'm 5",  "Save This",
    "How It Works",        "Beginner Friendly",   "Concept Explained",
    "Curiosity Hook",      "This Week in AI",
  ];

  console.log(`📐  Week ${weekNum} → Pattern ${idx + 1}: "${names[idx]}"`);
  return builders[idx](posts, tags);
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
  const postText = buildWeeklyPost(weekPosts, tags);

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
  return { success: true, id: data.id, articleCount: weekPosts.length };
}
