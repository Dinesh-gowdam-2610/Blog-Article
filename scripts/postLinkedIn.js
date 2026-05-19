// ─── postLinkedIn.js ──────────────────────────────────────────────────────────
// Posts to LinkedIn after every 2nd Dev.to publish.
// Description style: structured, emoji-driven, engineer voice — like the
// screenshot reference. Hook → Problem → What we found → Key points → CTA → tags
//
// Zero extra Groq API calls — built entirely from the scout's topic object.
//
// Required GitHub Secrets:
//   LINKEDIN_ACCESS_TOKEN  → OAuth token (expires every 60 days)
//   LINKEDIN_PERSON_URN    → e.g. "urn:li:person:ABC123xyz"
// ─────────────────────────────────────────────────────────────────────────────

const LINKEDIN_API = "https://api.linkedin.com/v2";

// ── Read post count from history for cadence check ────────────────────────────
async function getPublishCount() {
  try {
    const fs   = await import("fs");
    const path = await import("path");
    const fp   = path.default.resolve(process.cwd(), "logs/post-history.json");
    if (!fs.default.existsSync(fp)) return 0;
    const data = JSON.parse(fs.default.readFileSync(fp, "utf8"));
    return Array.isArray(data) ? data.length : 0;
  } catch {
    return 0;
  }
}

// ── Build hashtags from topic data ────────────────────────────────────────────
function buildTags(topic) {
  const base = new Set([
    "aws", "nodejs", "typescript", "javascript", "softwaredevelopment", "devto",
  ]);

  const serviceTagMap = {
    Lambda:             ["serverless", "awslambda", "cloudcomputing"],
    ECS:                ["docker", "containers", "devops"],
    AppRunner:          ["serverless", "containers", "cloudcomputing"],
    S3:                 ["cloudstorage", "aws", "devops"],
    DynamoDB:           ["dynamodb", "nosql", "database"],
    RDS:                ["database", "postgresql", "aurora"],
    ElastiCache:        ["redis", "caching", "database"],
    SQS:                ["messagequeue", "eventdriven", "microservices"],
    SNS:                ["pubsub", "eventdriven", "microservices"],
    EventBridge:        ["eventdriven", "microservices", "serverless"],
    Scheduler:          ["serverless", "automation", "devops"],
    APIGateway:         ["api", "restapi", "serverless"],
    CloudFront:         ["cdn", "performance", "aws"],
    VPC:                ["networking", "cloudsecurity", "aws"],
    Bedrock:            ["generativeai", "llm", "aiengineering"],
    CloudWatch:         ["observability", "monitoring", "devops"],
    XRay:               ["observability", "tracing", "microservices"],
    SecretsManager:     ["security", "devsecops", "cloudsecurity"],
    IAM:                ["security", "cloudsecurity", "devsecops"],
    CDK:                ["iac", "devops", "cloudformation"],
    CodeBuild:          ["cicd", "devops", "automation"],
    StepFunctions:      ["serverless", "workflow", "automation"],
    Kinesis:            ["streaming", "eventdriven", "bigdata"],
    Athena:             ["bigdata", "analytics", "sql"],
    NodeJS22:           ["nodejs22", "javascript", "runtimes"],
    NodeJSPerformance:  ["performance", "nodejs", "backend"],
    NodeJSTesting:      ["testing", "tdd", "jest"],
    TypeScript55:       ["typescript", "typesafety", "javascript"],
    TypeScriptPatterns: ["typescript", "designpatterns", "cleancode"],
    TypeScriptBuild:    ["typescript", "esbuild", "bundling"],
    JavaScriptPatterns: ["javascript", "es2025", "cleancode"],
    PackageEcosystem:   ["npm", "pnpm", "javascript"],
    NodeJSFrameworks:   ["fastify", "hono", "backend"],
  };

  const primary   = serviceTagMap[topic.primaryService   ?? ""] ?? [];
  const secondary = serviceTagMap[topic.secondaryService ?? ""] ?? [];

  primary.forEach(t => base.add(t));
  secondary.slice(0, 2).forEach(t => base.add(t));

  return [...base].slice(0, 10).map(t => `#${t}`).join(" ");
}

// ── Build the LinkedIn post — structured, readable, engineer voice ─────────────
//
// Format (matching screenshot style):
//
//   🔥 [Hook — one punchy line that grabs attention]
//
//   [2-3 lines expanding the problem or discovery]
//
//   💡 The core insight:
//   • [Key point 1]
//   • [Key point 2]
//   • [Key point 3]
//
//   ⚠️ The trap most teams fall into:
//   [The gotcha — one sentence, specific]
//
//   👉 Full breakdown with working code in the article.
//
//   [hashtags]
//
//   [URL — always last for LinkedIn reach]
//
function buildPostText(title, url, topic) {
  const service  = topic.primaryService ?? topic.targetService ?? "AWS";
  const hook     = (topic.hook              ?? "").trim();
  const angle    = (topic.angle             ?? "").trim();
  const gotcha   = (topic.gotchaToReveal    ?? "").trim();
  const scenario = (topic.codeScenario      ?? "").trim();
  const sections = Array.isArray(topic.sections) ? topic.sections : [];
  const tags     = buildTags(topic);

  const lines = [];

  // ── Opening hook ─────────────────────────────────────────────────────────
  if (hook) {
    lines.push(`🔥 ${hook}`);
  } else {
    lines.push(`🔥 ${title}`);
  }

  // ── Core angle / problem expansion ────────────────────────────────────────
  if (angle) {
    lines.push(angle);
  }

  // ── Key points from sections ──────────────────────────────────────────────
  // Use the article section headings as bullet points — they summarise what
  // the article covers, just like the screenshot's structured breakdown.
  const bullets = sections
    .filter(s => s && s.toLowerCase() !== "the takeaway")
    .slice(0, 4);

  if (bullets.length > 0) {
    lines.push(`💡 What this covers:\n${bullets.map(b => `• ${b}`).join("\n")}`);
  }

  // ── The trap / gotcha ─────────────────────────────────────────────────────
  if (gotcha) {
    lines.push(`⚠️ The trap most teams fall into:\n${gotcha}`);
  }

  // ── Code scenario teaser ──────────────────────────────────────────────────
  if (scenario) {
    lines.push(`🛠️ The code example demonstrates:\n${scenario}`);
  }

  // ── CTA ───────────────────────────────────────────────────────────────────
  lines.push(`👉 Full breakdown with working ${service} + Node.js code examples in the article.`);

  // ── Tags ──────────────────────────────────────────────────────────────────
  lines.push(tags);

  // ── URL last ─────────────────────────────────────────────────────────────
  // LinkedIn penalises posts where the URL appears near the top.
  // Always put it as the very last line for better organic reach.
  lines.push(url);

  return lines.join("\n\n");
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function postToLinkedIn({ title, url, topic }) {
  const accessToken = process.env.LINKEDIN_ACCESS_TOKEN;
  const personUrn   = process.env.LINKEDIN_PERSON_URN;

  // ── Missing credentials — skip gracefully, never crash Dev.to publish ─────
  if (!accessToken || !personUrn) {
    console.log("⏭️   LinkedIn: skipping — LINKEDIN_ACCESS_TOKEN or LINKEDIN_PERSON_URN not set");
    return { skipped: true, reason: "missing_credentials" };
  }

  // ── Every 2nd post cadence ────────────────────────────────────────────────
  // post-history.json is written BEFORE this call so count includes today.
  // odd  count = post 1, 3, 5 ... → post to LinkedIn ✅
  // even count = post 2, 4, 6 ... → skip LinkedIn    ⏭️
  const publishCount = await getPublishCount();
  const shouldPost   = publishCount % 2 !== 0;

  console.log(`📊  Total posts in history : ${publishCount}`);
  console.log(`📅  LinkedIn cadence       : every 2nd post (this is #${publishCount})`);

  if (!shouldPost) {
    console.log("⏭️   LinkedIn: skipping today — will post on the next publish.\n");
    return { skipped: true, reason: "cadence_every_2_days" };
  }

  console.log("✅  LinkedIn: posting today.\n");

  const postText = buildPostText(title, url, topic);

  console.log("─── LinkedIn post preview ──────────────────────────");
  console.log(postText);
  console.log("────────────────────────────────────────────────────\n");

  const payload = {
    author:         personUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary:    { text: postText },
        shareMediaCategory: "ARTICLE",
        media: [
          {
            status:      "READY",
            description: { text: topic.angle ?? title },
            originalUrl: url,
            title:       { text: title },
          },
        ],
      },
    },
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
    },
  };

  const res = await fetch(`${LINKEDIN_API}/ugcPosts`, {
    method:  "POST",
    headers: {
      "Content-Type":              "application/json",
      "Authorization":             `Bearer ${accessToken}`,
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(payload),
  });

  // Token expired — warn clearly, never crash
  if (res.status === 401) {
    console.warn("⚠️   LinkedIn token expired (401).");
    console.warn("    Update LINKEDIN_ACCESS_TOKEN in GitHub Secrets (expires every 60 days).");
    return { skipped: true, reason: "token_expired" };
  }

  if (!res.ok) {
    const err = await res.text();
    console.warn(`⚠️   LinkedIn post failed (${res.status}) — Dev.to publish unaffected`);
    console.warn(`    ${err.slice(0, 300)}`);
    return { skipped: true, reason: `http_${res.status}` };
  }

  const data = await res.json();
  console.log("✅  LinkedIn post published!");
  console.log(`   Post ID : ${data.id ?? "unknown"}`);
  return { success: true, id: data.id };
}
