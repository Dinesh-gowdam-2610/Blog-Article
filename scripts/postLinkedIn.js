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
    "aws","nodejs","typescript","javascript","devto","programming","softwaredevelopment",
  ]);
  const map = {
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
    NodeJS22:           ["nodejs22","runtimes"],
    NodeJSPerformance:  ["performance","backend"],
    NodeJSTesting:      ["testing","tdd"],
    TypeScript55:       ["typescript","typesafety"],
    TypeScriptPatterns: ["typescript","designpatterns"],
    TypeScriptBuild:    ["typescript","esbuild"],
    JavaScriptPatterns: ["javascript","es2025"],
    BunOnLambda:        ["bun","performance"],
    NodeJSFrameworks:   ["fastify","backend"],
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
// 8 PATTERNS — all content dynamic, zero hardcoded filler
// ─────────────────────────────────────────────────────────────────────────────

function pattern1_unpopular_opinion(posts, tags) {
  // Opener: the strongest gotcha from this week's articles
  const bestGotcha = posts.map(getGotcha).filter(Boolean)[0] ?? posts[0].title;
  const lines = [
    `Unpopular opinion:`,
    ``,
    bestGotcha + `.`,
    ``,
    `This week — ${posts.length} cases that prove it:`,
    ``,
    ...posts.map((p, i) => {
      const stat    = extractStat(p);
      const insight = getInsight(p);
      return [
        `${EMOJIS.warn[i % 5]} ${p.title}`,
        `   ${insight}${stat ? ` (${stat})` : ""}`,
        `   → ${p.url}`,
      ].join("\n");
    }),
    ``,
    `Which one are you fixing this week? ↓`,
    ``,
    tags,
  ];
  return lines.join("\n");
}

function pattern2_embarrassed(posts, tags) {
  // Use the most shocking gotcha as the "embarrassing" discovery
  const worst      = posts[0];
  const stat       = extractStat(worst);
  const gotcha     = getGotcha(worst) ?? worst.title;
  const lines = [
    `${gotcha}.`,
    ``,
    stat ? `The cost: ${stat}.` : `And nobody documents this.`,
    ``,
    `This week I found ${posts.length} more like it:`,
    ``,
    ...posts.map((p, i) => {
      const insight = getInsight(p);
      const g       = getGotcha(p);
      return [
        `${i + 1}. ${p.title}`,
        g ? `   The gotcha: ${g}` : `   ${insight}`,
        `   ${p.url}`,
      ].join("\n");
    }),
    ``,
    `What is the most unexpected bug you have found in production this year?`,
    ``,
    tags,
  ];
  return lines.join("\n");
}

function pattern3_nobody_talks(posts, tags) {
  // Thread style — one insight per post, big white space, save-worthy
  const lines = [
    `${posts.length} AWS + Node.js gotchas nobody warns you about.`,
    ``,
    `(Save this thread.)`,
    ``,
    `↓`,
    ``,
    ...posts.flatMap((p, i) => {
      const stat    = extractStat(p);
      const insight = getInsight(p);
      return [
        `${EMOJIS.numbers[i] ?? (i + 1) + "."} ${p.title}`,
        ``,
        insight,
        stat ? `The number: ${stat}` : ``,
        ``,
        `→ ${p.url}`,
        ``,
        i < posts.length - 1 ? `—` : ``,
        ``,
      ].filter(l => l !== undefined);
    }),
    `Which one are you sharing with your team?`,
    ``,
    tags,
  ];
  return lines.filter(l => l !== undefined).join("\n");
}

function pattern4_before_after(posts, tags) {
  // Each article becomes a before/after story using its own hook + gotcha
  const lines = [
    `${posts.length} before/after stories from this week in AWS + Node.js:`,
    ``,
    ...posts.flatMap((p, i) => {
      const gotcha  = getGotcha(p);
      const insight = getInsight(p);
      const stat    = extractStat(p);
      return [
        `${EMOJIS.traffic[i % 5]} ${p.title}`,
        gotcha  ? `   Before: ${gotcha}` : `   Before: The default looked fine.`,
        insight ? `   After:  ${insight}` : ``,
        stat    ? `   Impact: ${stat}` : ``,
        `   → ${p.url}`,
        ``,
      ].filter(Boolean);
    }),
    `Documentation tells you HOW things work.`,
    `Production tells you WHAT actually happens.`,
    ``,
    `Which before/after surprised you most? ↓`,
    ``,
    tags,
  ];
  return lines.join("\n");
}

function pattern5_read_if(posts, tags) {
  // Hyper-targeted opener using actual service names from this week
  const services = [...new Set(posts.map(p => p.service))].slice(0, 3).join(", ");
  const lines = [
    `If you use ${services} in production — read this before your next deploy.`,
    ``,
    `This week: ${posts.length} things that look fine in development and fail in production.`,
    ``,
    ...posts.map((p, i) => {
      const stat    = extractStat(p);
      const gotcha  = getGotcha(p);
      return [
        `${EMOJIS.insight[i % 5]} ${p.title}`,
        gotcha ? `   ${gotcha}` : ``,
        stat   ? `   Impact: ${stat}` : ``,
        `   → ${p.url}`,
      ].filter(Boolean).join("\n");
    }),
    ``,
    `Tag someone on your team who deploys these services.`,
    ``,
    tags,
  ];
  return lines.join("\n");
}

function pattern6_tracked(posts, tags) {
  // Data-framed — each article = a "finding" using real numbers from the article
  const lines = [
    `${posts.length} production findings from this week in AWS + Node.js:`,
    ``,
    ...posts.map((p, i) => {
      const stat    = extractStat(p);
      const insight = getInsight(p);
      return [
        `${EMOJIS.track[i % 5]} Finding ${i + 1}: ${p.title}`,
        `   ${insight}`,
        stat ? `   Measured: ${stat}` : ``,
        `   → ${p.url}`,
        ``,
      ].filter(Boolean).join("\n");
    }),
    `The pattern:`,
    posts.map(p => getGotcha(p)).filter(Boolean)[0] ?? `The defaults hide the real cost.`,
    ``,
    `What is the most expensive AWS default you have hit?`,
    ``,
    tags,
  ];
  return lines.join("\n");
}

function pattern7_hard_truths(posts, tags) {
  // Bold declarative format — each "truth" comes from the article's angle/gotcha
  const lines = [
    `${posts.length} things that tripped me up this week in AWS + Node.js:`,
    ``,
    ...posts.flatMap((p, i) => {
      const truth  = getGotcha(p) ?? getInsight(p);
      const stat   = extractStat(p);
      return [
        `${EMOJIS.insight[i % 5]} ${truth}.`,
        stat ? `   The number that proves it: ${stat}` : ``,
        `   Full breakdown → ${p.url}`,
        ``,
      ].filter(Boolean);
    }),
    `Which one would have saved you the most time if you knew it earlier?`,
    ``,
    tags,
  ];
  return lines.join("\n");
}

function pattern8_this_week_i(posts, tags) {
  // Personal journal — each entry from the article's own data
  const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const lines = [
    `This week in AWS + Node.js — ${posts.length} things worth reading:`,
    ``,
    ...posts.flatMap(p => {
      const day     = dayNames[new Date(p.date).getDay()];
      const insight = getInsight(p);
      const stat    = extractStat(p);
      return [
        `${day}: ${p.title}`,
        `→ ${insight}`,
        stat ? `→ ${stat}` : ``,
        `→ ${p.url}`,
        ``,
      ].filter(Boolean);
    }),
    `What did you discover the hard way this week? Drop it below ↓`,
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
    pattern1_unpopular_opinion,
    pattern2_embarrassed,
    pattern3_nobody_talks,
    pattern4_before_after,
    pattern5_read_if,
    pattern6_tracked,
    pattern7_hard_truths,
    pattern8_this_week_i,
  ];
  const names = [
    "Unpopular Opinion",   "Production Gotcha",  "Nobody Warns You",
    "Before vs After",     "Read This If",        "Tracked Findings",
    "Things That Tripped", "This Week Journal",
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
            title:       { text: `AWS + Node.js — ${weekPosts.length} deep dives this week` },
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
