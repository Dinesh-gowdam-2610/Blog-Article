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

// Stat card generator — uses ImageMagick (pre-installed on ubuntu-latest)
let generateStatCard = null;
try {
  const mod = await import("./generateStatCard.js");
  generateStatCard = mod.generateStatCard;
} catch {
  // generateStatCard.js not found — image posting disabled, falls back to text-only
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

// ── Clean personal language from any text ────────────────────────────────────
// Strips "our team", "we found", "our service" etc — posts from a personal
// engineer voice, not a company voice.
function cleanTeamLanguage(text = "") {
  return text
    .replace(/our team/gi, "I")
    .replace(/our teams/gi, "engineers")
    .replace(/our service[s]?/gi, "the service")
    .replace(/our system[s]?/gi, "the system")
    .replace(/our codebase/gi, "the codebase")
    .replace(/our stack/gi, "the stack")
    .replace(/our app/gi, "the app")
    .replace(/our lambda[s]?/gi, "the Lambda functions")
    .replace(/our pipeline[s]?/gi, "the pipeline")
    .replace(/our infrastructure/gi, "the infrastructure")
    .replace(/we found/gi, "I found")
    .replace(/we migrated/gi, "I migrated")
    .replace(/we built/gi, "I built")
    .replace(/we switched/gi, "I switched")
    .replace(/we replaced/gi, "I replaced")
    .replace(/we hit/gi, "I hit")
    .replace(/we ran/gi, "I ran")
    .replace(/we tested/gi, "I tested")
    .replace(/we deployed/gi, "I deployed")
    .replace(/we use/gi, "I use")
    .replace(/we used/gi, "I used")
    .replace(/we saw/gi, "I saw")
    .replace(/we spent/gi, "I spent")
    .replace(/we wasted/gi, "I wasted")
    .replace(/we noticed/gi, "I noticed")
    .replace(/we learned/gi, "I learned")
    .replace(/we decided/gi, "I decided")
    .trim();
}

// ── Build the LinkedIn post with 10 rotating patterns ────────────────────────
//
// Pattern 1  — Problem first        : pain → insight → bullets → gotcha
// Pattern 2  — Discovery            : curiosity hook → angle → fix
// Pattern 3  — Numbered steps       : 1️⃣2️⃣3️⃣ breakdown
// Pattern 4  — Contrarian take      : spicy opener → evidence → CTA
// Pattern 5  — Story arc            : before → broke → learned
// Pattern 6  — Stats & numbers      : headline stat → context → implication
// Pattern 7  — Business cost angle  : dollar/time cost → root cause → fix
// Pattern 8  — Before / After       : old way vs new way side by side
// Pattern 9  — Hot take + poll vibe : bold claim → 2 sides → reader question
// Pattern 10 — Quick lessons list   : TIL style, digestible takeaways
//
// Rotates by day-of-year — predictable but never repeating same pattern
// two days in a row (10-day full cycle).
//
function buildPostText(title, url, topic) {
  const service  = topic.primaryService ?? topic.targetService ?? "AWS";
  const hook     = cleanTeamLanguage(topic.hook           ?? "");
  const angle    = cleanTeamLanguage(topic.angle          ?? "");
  const gotcha   = cleanTeamLanguage(topic.gotchaToReveal ?? "");
  const scenario = cleanTeamLanguage(topic.codeScenario   ?? "");
  const sections = (Array.isArray(topic.sections) ? topic.sections : [])
    .filter(s => s && s.toLowerCase() !== "the takeaway")
    .slice(0, 4);
  const tags     = buildTags(topic);

  const d         = new Date();
  const start     = new Date(d.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((d - start) / 86_400_000);
  const pattern   = (dayOfYear % 10) + 1;

  let lines = [];

  if (pattern === 1) {
    // Problem first — lead with the pain, then the fix
    lines.push(hook || title);
    if (angle)  lines.push(angle);
    if (sections.length) lines.push("What the article covers:\n" + sections.map(s => "→ " + s).join("\n"));
    if (gotcha) lines.push("What caught me off guard:\n" + gotcha);
    lines.push("Full code walkthrough in the article.");

  } else if (pattern === 2) {
    // Discovery — curiosity-driven "I just found out"
    lines.push("Just found this out the hard way.");
    lines.push(hook || angle || title);
    if (gotcha)   lines.push("The hidden trap:\n" + gotcha);
    if (scenario) lines.push("What the fix looks like:\n" + scenario);
    lines.push("Wrote it up with working " + service + " code. Link below.");

  } else if (pattern === 3) {
    // Numbered steps — clear structured breakdown
    lines.push(hook || title);
    if (angle) lines.push(angle);
    if (sections.length) {
      const nums = ["1.", "2.", "3.", "4."];
      lines.push("Here is what the article walks through:\n" + sections.map((s, i) => (nums[i] ?? (i+1)+".") + " " + s).join("\n"));
    }
    if (gotcha) lines.push("Most common mistake:\n" + gotcha);
    lines.push("Code examples and full breakdown in the article.");

  } else if (pattern === 4) {
    // Contrarian — spicy take first
    lines.push(angle || hook || title);
    if (hook && hook !== angle) lines.push(hook);
    if (sections.length) lines.push("What I dug into:\n" + sections.map(s => "- " + s).join("\n"));
    if (gotcha)   lines.push("The part nobody talks about:\n" + gotcha);
    if (scenario) lines.push(scenario);
    lines.push("Full article + runnable code below.");

  } else if (pattern === 5) {
    // Story arc — before, what broke, what I learned
    lines.push(hook || title);
    if (angle)  lines.push(angle);
    if (gotcha) lines.push("What broke:\n" + gotcha);
    if (sections.length) lines.push("Key takeaways:\n" + sections.map(s => "- " + s).join("\n"));
    lines.push("Everything documented with " + service + " + Node.js code.");

  } else if (pattern === 6) {
    // Stats and numbers — headline metric grabs attention
    // Pull real numbers from the gotcha or scenario if they exist
    const statLine = [gotcha, scenario, angle].find(t => /\d/.test(t)) || angle || hook;
    lines.push("Numbers that made me stop and look twice:");
    lines.push(statLine || title);
    if (sections.length) lines.push("What this covers:\n" + sections.map(s => "• " + s).join("\n"));
    lines.push("The context and the fix are in the article. Link below.");

  } else if (pattern === 7) {
    // Business cost angle — speaks to CTOs and tech leads
    lines.push("This is costing engineering teams real time and money.");
    lines.push(hook || angle || title);
    if (gotcha) lines.push("Root cause:\n" + gotcha);
    if (sections.length) lines.push("What the article covers:\n" + sections.map(s => "• " + s).join("\n"));
    lines.push("If you run " + service + " in production, this one is worth 5 minutes of your time.");

  } else if (pattern === 8) {
    // Before / After — old way vs new way
    lines.push("Before vs after on " + service + ":");
    if (angle) lines.push(angle);
    if (gotcha) {
      lines.push("Before: " + gotcha);
    }
    if (scenario) {
      lines.push("After: " + scenario);
    }
    if (sections.length) lines.push("Covered in the article:\n" + sections.map(s => "• " + s).join("\n"));
    lines.push("Full code comparison in the article.");

  } else if (pattern === 9) {
    // Hot take + question — invites comments and engagement
    lines.push(angle || hook || title);
    lines.push(hook && hook !== angle ? hook : "");
    if (gotcha) lines.push("The part that surprises most engineers:\n" + gotcha);
    lines.push("Have you hit this in production? What was your fix?");
    lines.push("My full approach with code is in the article below.");

  } else {
    // Quick lessons — TIL style digestible list
    lines.push("Things I wish I knew before working with " + service + ":");
    const lessons = [
      gotcha,
      angle,
      scenario,
      ...sections
    ].filter(Boolean).slice(0, 4);
    if (lessons.length) lines.push(lessons.map((l, i) => (i+1) + ". " + l).join("\n"));
    lines.push("Full writeup with working code below.");
  }

  // Remove empty lines caused by missing fields
  lines = lines.filter(l => l && l.trim() !== "");

  lines.push(tags);
  lines.push(url);

  return lines.join("\n\n");
}

// ── Upload image to LinkedIn (2-step: register → upload bytes) ───────────────
async function uploadImageToLinkedIn(imagePath, personUrn, accessToken) {
  const fs = await import("fs");

  if (!fs.default.existsSync(imagePath)) {
    console.warn("⚠️  Image file not found:", imagePath);
    return null;
  }

  // Step 1 — Register the upload and get an upload URL
  console.log("📤  Registering image upload with LinkedIn...");

  const registerRes = await fetch(
    `${LINKEDIN_API}/images?action=initializeUpload`,
    {
      method: "POST",
      headers: {
        "Authorization":             `Bearer ${accessToken}`,
        "Content-Type":              "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        initializeUploadRequest: {
          owner: personUrn,
        },
      }),
    }
  );

  if (!registerRes.ok) {
    const err = await registerRes.text();
    console.warn(`⚠️  Image register failed (${registerRes.status}): ${err.slice(0, 200)}`);
    return null;
  }

  const registerData = await registerRes.json();
  const uploadUrl    = registerData?.value?.uploadUrl;
  const imageUrn     = registerData?.value?.image;

  if (!uploadUrl || !imageUrn) {
    console.warn("⚠️  LinkedIn did not return upload URL or image URN");
    return null;
  }

  // Step 2 — Upload the PNG bytes
  console.log("📤  Uploading PNG to LinkedIn...");

  const imageBytes = fs.default.readFileSync(imagePath);

  const uploadRes = await fetch(uploadUrl, {
    method:  "PUT",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type":  "image/png",
    },
    body: imageBytes,
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    console.warn(`⚠️  Image upload failed (${uploadRes.status}): ${err.slice(0, 200)}`);
    return null;
  }

  console.log(`✅  Image uploaded. URN: ${imageUrn}`);
  return imageUrn;
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

  // ── Mon / Wed / Fri cadence ─────────────────────────────────────────────
  // Dev.to publishes every weekday (Mon–Fri).
  // LinkedIn only posts on Monday (1), Wednesday (3), Friday (5).
  // This is based on the actual calendar day — NOT the post count —
  // so it never drifts and is always predictable.
  const todayIST   = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const dayOfWeek  = new Date(todayIST).getDay(); // 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat
  const linkedInDays = new Set([1, 3, 5]);        // Monday, Wednesday, Friday
  const shouldPost   = linkedInDays.has(dayOfWeek);
  const dayNames     = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  console.log(`📅  Today (IST)     : ${todayIST} (${dayNames[dayOfWeek]})`);
  console.log(`📅  LinkedIn days   : Mon, Wed, Fri`);

  if (!shouldPost) {
    console.log(`⏭️   LinkedIn: skipping today (${dayNames[dayOfWeek]}) — next post on next Mon/Wed/Fri.\n`);
    return { skipped: true, reason: `not_a_linkedin_day_${dayNames[dayOfWeek]}` };
  }

  console.log(`✅  LinkedIn: posting today (${dayNames[dayOfWeek]}).\n`);

  const postText = buildPostText(title, url, topic);

  console.log("─── LinkedIn post preview ──────────────────────────");
  console.log(postText);
  console.log("────────────────────────────────────────────────────\n");

  // ── Generate and upload stat card image ──────────────────────────────────
  let imageUrn = null;

  if (generateStatCard) {
    const os   = await import("os");
    const path = await import("path");
    const fs   = await import("fs");

    const tmpPath = path.default.join(os.default.tmpdir(), `li_card_${Date.now()}.png`);

    try {
      const cardPath = await generateStatCard({ ...topic, title }, tmpPath);
      if (cardPath) {
        imageUrn = await uploadImageToLinkedIn(cardPath, personUrn, accessToken);
        // Clean up temp file
        try { fs.default.unlinkSync(cardPath); } catch {}
      }
    } catch (err) {
      console.warn("⚠️  Stat card generation failed (non-fatal):", err.message);
    }
  }

  // ── Build payload — with image if available, text-only as fallback ────────
  let payload;

  if (imageUrn) {
    console.log("🖼️   Building post with image attachment...");
    // Image post — shows the stat card in feed
    payload = {
      author:         personUrn,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary:    { text: postText },
          shareMediaCategory: "IMAGE",
          media: [
            {
              status: "READY",
              media:  imageUrn,
              title:  { text: title },
            },
          ],
        },
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
      },
    };
  } else {
    console.log("📝  Building text + article link post (no image)...");
    // Fallback — text + article link card
    payload = {
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
  }

  const res = await fetch(`${LINKEDIN_API}/ugcPosts`, {
    method:  "POST",
    headers: {
      "Content-Type":              "application/json",
      "Authorization":             `Bearer ${accessToken}`,
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(payload),
  });

  // Token expired — warn clearly, create GitHub Issue, never crash
  if (res.status === 401) {
    console.warn("⚠️   LinkedIn token expired (401).");
    console.warn("    Update LINKEDIN_ACCESS_TOKEN in GitHub Secrets (expires every 60 days).");
    console.warn("    1. Go to: https://www.linkedin.com/developers/apps");
    console.warn("    2. Auth tab → OAuth 2.0 tools → Generate access token");
    console.warn("    3. Select: openid + profile + w_member_social");
    console.warn("    4. Update LINKEDIN_ACCESS_TOKEN in GitHub Secrets");

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
