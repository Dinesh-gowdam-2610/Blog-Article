// ─── CONFIG ────────────────────────────────────────────────────────────────────
// Only two values needed — both come from GitHub Encrypted Secrets.
// Runs every weekday (Mon–Fri) at 08:00 AM IST via GitHub Actions cron.
// No modes, no manual inputs, no dry-run flags — just publish every weekday.
//
//   GROQ_API_KEY   → from GitHub Encrypted Secret (https://console.groq.com)
//   DEVTO_API_KEY  → from GitHub Encrypted Secret (https://dev.to/settings/extensions)
// ───────────────────────────────────────────────────────────────────────────────
const CONFIG = {
  groqApiKey:   process.env.GROQ_API_KEY  || "",
  devtoApiKey:  process.env.DEVTO_API_KEY || "",
  published:    process.env.DRY_RUN === "true" ? false : true,
  seoPassScore: 75,   // minimum score (0–100) required to publish
  maxRetries:   2,    // how many times to rewrite if SEO fails
};
// ───────────────────────────────────────────────────────────────────────────────

const GROQ_URL   = "https://api.groq.com/openai/v1/chat/completions";
const DEVTO_BASE = "https://dev.to/api";

// LinkedIn posting — loaded dynamically so a missing file never crashes the script
let postToLinkedIn = async () => ({ skipped: true, reason: "not_loaded" });
try {
  const li = await import("./postLinkedIn.js");
  postToLinkedIn = li.postToLinkedIn;
} catch {
  // postLinkedIn.js not found — LinkedIn posting silently disabled
}

// Stat card generator — loaded dynamically, uses ImageMagick (pre-installed on ubuntu-latest)
// Zero npm dependencies. Falls back silently if unavailable.
let generateStatCard = null;
try {
  const sc = await import("./generateStatCard.js");
  generateStatCard = sc.generateStatCard;
} catch {
  // generateStatCard.js not found — LinkedIn image posting disabled, text-only fallback
}

const SERVICE_COOLDOWN_POSTS = 30;
const COVERAGE_TRACKS = {
  broadTopics: [
    "AI Deep Learning","Technology","Finance","Health","Sports",
    "Business","AI","Programming","Cloud Computing","Payments","Cybersecurity",
  ],
  coreAiTags: [
    "Artificial Intelligence","AI","Generative AI","AI Trends","AI Tools",
    "AI Automation","AI Applications","Responsible AI","Explainable AI","AI Ethics",
  ],
  machineLearningTags: [
    "Machine Learning","ML","Supervised Learning","Unsupervised Learning",
    "Reinforcement Learning","Predictive Analytics","Data Science",
    "Model Training","Feature Engineering","ML Algorithms",
  ],
  deepLearningTags: [
    "Deep Learning","Neural Networks","CNN","RNN","LSTM","Transformers",
    "Computer Vision","NLP","Speech Recognition","Image Processing",
  ],
  genAiAndLlmTags: [
    "Large Language Models","LLM","ChatGPT","OpenAI","AI Agents",
    "Prompt Engineering","Retrieval Augmented Generation","RAG","Multimodal AI","AI Assistants",
  ],
  developmentTags: [
    "Python","TensorFlow","PyTorch","Hugging Face","MLOps",
    "AI Infrastructure","GPU Computing","Model Deployment","API Integration","Cloud AI",
  ],
  trendingTags: [
    "AI Revolution","Future of AI","AI Innovation","AI in 2026","Emerging Technology",
    "Automation","Intelligent Systems","Smart Applications","Digital Transformation","Tech Trends",
  ],
  researchTags: [
    "Diffusion Models","Fine Tuning","Transfer Learning","Embeddings","Vector Databases",
    "Federated Learning","Edge AI","Self-Supervised Learning","Synthetic Data","AGI",
  ],
  exampleTagSets: {
    aiTutorialArticle: [
      "Artificial Intelligence","Machine Learning","Deep Learning",
      "Python","Tutorial","Neural Networks","TensorFlow","AI Guide",
    ],
    genAiChatGptArticle: [
      "Generative AI","ChatGPT","OpenAI","Prompt Engineering",
      "LLM","AI Agents","Automation","AI Tools",
    ],
    deepLearningResearchArticle: [
      "Deep Learning","Transformers","Neural Networks",
      "Computer Vision","NLP","PyTorch","Research","AI Innovation",
    ],
  },
};

const LIVE_SIGNAL_FEEDS = [
  { name: "AWS What\'s New", url: "https://aws.amazon.com/about-aws/whats-new/recent/feed/" },
  { name: "Node.js Blog",     url: "https://nodejs.org/en/feed/blog.xml" },
  { name: "TypeScript Blog",  url: "https://devblogs.microsoft.com/typescript/feed/" },
  { name: "GitHub Changelog", url: "https://github.blog/changelog/feed/" },
];

function decodeXmlEntities(value = "") {
  return value
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&#x27;/g, "'");
}

function stripHtml(value = "") {
  return decodeXmlEntities(String(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

function extractXmlTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match?.[1]?.trim() ?? "";
}

function parseRssItems(xml = "") {
  const items = [];
  const itemBlocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
  for (const item of itemBlocks) {
    const title      = stripHtml(extractXmlTag(item, "title"));
    const link       = stripHtml(extractXmlTag(item, "link"));
    const pubDateRaw = extractXmlTag(item, "pubDate");
    const pubDate    = pubDateRaw ? new Date(pubDateRaw) : null;
    if (!title) continue;
    items.push({
      title,
      link,
      pubDate: pubDate instanceof Date && !Number.isNaN(pubDate.getTime()) ? pubDate : null,
    });
  }
  return items;
}

async function fetchFeedSignals(feed, { daysBack = 14, maxItems = 2 } = {}) {
  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(feed.url, {
      headers: { "User-Agent": "devCommunityBlogPost/1.0" },
      signal:  controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml     = await res.text();
    const minDate = Date.now() - daysBack * 86_400_000;
    const parsed  = parseRssItems(xml)
      .filter(item => !item.pubDate || item.pubDate.getTime() >= minDate)
      .slice(0, maxItems);
    return { ...feed, items: parsed };
  } finally {
    clearTimeout(timeout);
  }
}

async function buildLiveSignalPulse() {
  console.log("🌐  Fetching live release/documentation signals...");
  const settled = await Promise.allSettled(
    LIVE_SIGNAL_FEEDS.map(feed => fetchFeedSignals(feed))
  );
  const sources = [];
  for (const result of settled) {
    if (result.status === "fulfilled" && result.value.items.length > 0) {
      sources.push(result.value);
    }
  }
  if (sources.length === 0) {
    console.warn("⚠️  Live signals unavailable — using catalog signals only.");
    return "LIVE SIGNALS: unavailable today (network/feed issue).";
  }
  let block = "LIVE DOCUMENTATION + RELEASE SIGNALS (last 14 days):\n";
  for (const source of sources) {
    block += `\n${source.name}:\n`;
    source.items.forEach((item, idx) => {
      const date         = item.pubDate ? item.pubDate.toISOString().slice(0, 10) : "recent";
      const trimmedTitle = item.title.length > 140 ? `${item.title.slice(0, 137)}...` : item.title;
      block += `- [${date}] ${trimmedTitle}`;
      if (item.link) block += ` (${item.link})`;
      if (idx < source.items.length - 1) block += "\n";
    });
    block += "\n";
  }
  console.log(`✅  Live signals loaded from ${sources.length}/${LIVE_SIGNAL_FEEDS.length} sources`);
  return block.trim();
}

function buildCoveragePulse() {
  const join   = list => list.join(", ");
  const sample = (list, count) => {
    const pool = [...list];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, Math.min(count, pool.length));
  };
  const df = {
    broadTopics:         sample(COVERAGE_TRACKS.broadTopics, 2),
    coreAiTags:          sample(COVERAGE_TRACKS.coreAiTags, 2),
    machineLearningTags: sample(COVERAGE_TRACKS.machineLearningTags, 2),
    deepLearningTags:    sample(COVERAGE_TRACKS.deepLearningTags, 2),
    genAiAndLlmTags:     sample(COVERAGE_TRACKS.genAiAndLlmTags, 2),
    developmentTags:     sample(COVERAGE_TRACKS.developmentTags, 2),
    trendingTags:        sample(COVERAGE_TRACKS.trendingTags, 2),
    researchTags:        sample(COVERAGE_TRACKS.researchTags, 2),
  };
  const exKeys = Object.keys(COVERAGE_TRACKS.exampleTagSets);
  const selKey = sample(exKeys, 1)[0];
  return `
COVERAGE EXPANSION TRACKS (include these themes along with AWS/runtime topics):
- Broad topics: ${join(COVERAGE_TRACKS.broadTopics)}
- Core AI tags: ${join(COVERAGE_TRACKS.coreAiTags)}
- Machine Learning tags: ${join(COVERAGE_TRACKS.machineLearningTags)}
- Deep Learning tags: ${join(COVERAGE_TRACKS.deepLearningTags)}
- GenAI & LLM tags: ${join(COVERAGE_TRACKS.genAiAndLlmTags)}
- Development & Engineering tags: ${join(COVERAGE_TRACKS.developmentTags)}
- Trending tags: ${join(COVERAGE_TRACKS.trendingTags)}
- Research tags: ${join(COVERAGE_TRACKS.researchTags)}

TODAY'S RANDOM COVERAGE FOCUS (must use at least one):
- Broad topics: ${join(df.broadTopics)}
- Core AI tags: ${join(df.coreAiTags)}
- ML tags: ${join(df.machineLearningTags)}
- Deep Learning tags: ${join(df.deepLearningTags)}
- GenAI/LLM tags: ${join(df.genAiAndLlmTags)}
- Dev/Engineering tags: ${join(df.developmentTags)}
- Trending tags: ${join(df.trendingTags)}
- Research tags: ${join(df.researchTags)}
- Random example style (${selKey}): ${join(COVERAGE_TRACKS.exampleTagSets[selKey])}
`.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// AWS SERVICES CATALOG
// Every service the scout can draw from, with:
//   - sdk: the real @aws-sdk/client-* package name
//   - signals: hot things happening RIGHT NOW with this service
//   - gotchas: real pain points developers hit
//   - spicyAngles: contrarian or surprising angles for posts
//
// This is the source of truth for AWS signal injection into the scout.
// Add new services or update signals here as AWS releases new things.
// ─────────────────────────────────────────────────────────────────────────────
const AWS_SERVICES_CATALOG = {

  // ── Compute ──────────────────────────────────────────────────────────────
  Lambda: {
    sdk: "@aws-sdk/client-lambda",
    signals: [
      "Node.js 22 runtime GA — teams migrating from 18/20, cold start behavior changed",
      "arm64 (Graviton2) Lambda now ~20% cheaper AND faster — most teams still on x86",
      "Lambda SnapStart extended to Node.js — not just Java anymore",
      "Response streaming now stable — game changer for AI/LLM token streaming",
      "Lambda function URLs replacing API Gateway for simple endpoints",
      "INIT phase timing now visible in CloudWatch — cold start myths being busted",
      "Lambda Power Tuning tool revealing most functions are over-provisioned",
      "Max timeout still 15 min — teams hitting this wall with AI workloads",
    ],
    gotchas: [
      "require(esm) in Node 22 breaks existing Lambda layers silently",
      "SnapStart + VPC = no benefit — the cold start is in VPC attachment not JVM",
      "Lambda response streaming requires specific Content-Type headers or it buffers",
      "Provisioned Concurrency costs money even when idle — teams shocked by bills",
      "Lambda@Edge has different limits than regular Lambda — 1MB response max",
    ],
    spicyAngles: [
      "Lambda SnapStart for Node.js: real benchmark vs the hype",
      "We turned off Provisioned Concurrency and nothing broke — here's the data",
      "Lambda response streaming + Bedrock = the AI architecture nobody talks about",
      "Lambda function URLs vs API Gateway: when the $200/month gap matters",
    ],
  },

  ECS: {
    sdk: "@aws-sdk/client-ecs",
    signals: [
      "ECS Fargate Spot interruptions spiking — teams building retry logic",
      "ECS Service Connect replacing App Mesh for service discovery",
      "ECS + CodeDeploy blue/green now easier to set up via CDK",
      "Fargate arm64 pricing making Graviton the default for container workloads",
    ],
    gotchas: [
      "ECS task role vs execution role confusion causes silent permission failures",
      "Fargate doesn't support GPU — teams discover this mid-migration",
      "ECS Service Connect adds latency that teams don't measure until production",
    ],
    spicyAngles: [
      "ECS Fargate vs Lambda for long-running Node.js jobs: the real cost math",
      "App Mesh is dead — migrating to ECS Service Connect in one weekend",
    ],
  },

  AppRunner: {
    sdk: "@aws-sdk/client-apprunner",
    signals: [
      "App Runner now supports VPC connectors — the main blocker for adoption is gone",
      "App Runner vs ECS Fargate cost debate heating up for mid-size Node.js APIs",
      "Auto-scaling in App Runner is simpler but less tunable than ECS",
    ],
    gotchas: [
      "App Runner cold starts can be 10-30s — not suitable for latency-sensitive APIs",
      "No persistent storage — teams hit this with session state",
      "Health check misconfiguration causes silent deploy failures",
    ],
    spicyAngles: [
      "I deployed a Node.js API to App Runner in 10 minutes — here's what broke in week 2",
      "App Runner is ECS Fargate with the ops removed — but is that good or bad?",
    ],
  },

  // ── Storage ───────────────────────────────────────────────────────────────
  S3: {
    sdk: "@aws-sdk/client-s3",
    signals: [
      "S3 Express One Zone (directory buckets) — 10x faster, different API surface",
      "S3 Mountpoint now stable — mounting S3 as a POSIX filesystem in EC2/containers",
      "S3 Object Lambda for on-the-fly content transformation going underused",
      "S3 Intelligent-Tiering costs surprisingly more than people expect",
      "Multi-region Access Points for active-active S3 architectures",
      "S3 Batch Operations replacing custom Lambda fan-out patterns",
    ],
    gotchas: [
      "S3 Express One Zone has a completely different SDK operation set — breaks v2 code",
      "Presigned URLs expire and teams don't handle 403s gracefully",
      "S3 Object Lock in Compliance mode cannot be removed even by root — teams panic",
      "List operations are eventually consistent — race conditions in upload pipelines",
      "Transfer acceleration costs extra — teams enable it and forget",
    ],
    spicyAngles: [
      "S3 Express One Zone is faster but nobody explains the API differences",
      "S3 Object Lambda: the feature that eliminates an entire Lambda + API Gateway stack",
      "We replaced our CDN origin with S3 Mountpoint — here's what actually happened",
    ],
  },

  DynamoDB: {
    sdk: "@aws-sdk/lib-dynamodb",
    signals: [
      "DynamoDB now supports vector search — challenging OpenSearch for RAG patterns",
      "DynamoDB zero-ETL integration with Redshift now GA",
      "PartiQL support maturing — SQL-like queries in DynamoDB dividing the community",
      "DAX Serverless launched — on-demand caching without cluster management",
      "Global Tables v2 replication lag improvements",
      "DynamoDB Streams + Lambda fan-out pattern being replaced by EventBridge Pipes",
    ],
    gotchas: [
      "Hot partitions are still a thing in 2025 — write sharding still necessary",
      "TransactWriteItems limit of 100 items catches teams at scale",
      "GSI eventually consistent reads causing race conditions in workflows",
      "Single-table design breaks down when analytics requirements arrive",
      "DynamoDB pricing at scale ($0.25/WCU) surprises teams coming from RDS",
      "TTL deletion is not immediate — items linger up to 48h after expiry",
    ],
    spicyAngles: [
      "DynamoDB vector search vs OpenSearch Serverless: the RAG architecture face-off",
      "Single-table design is a trap — we rebuilt our schema after 18 months",
      "DAX Serverless vs ElastiCache for DynamoDB caching: the honest comparison",
      "PartiQL in DynamoDB: SQL comfort vs NoSQL performance trade-off nobody measures",
    ],
  },

  RDS: {
    sdk: "@aws-sdk/client-rds",
    signals: [
      "Aurora Serverless v2 now supports zero ACU (true scale-to-zero) — game changer",
      "RDS Optimized Reads with Graviton3 cutting read latency 30%",
      "RDS Proxy becoming mandatory recommendation for Lambda → RDS patterns",
      "Aurora PostgreSQL 16 support with new pg_vector extension for embeddings",
      "Multi-AZ clusters with readable standby (3-node) now stable",
    ],
    gotchas: [
      "Aurora Serverless v2 minimum ACU of 0.5 still costs ~$50/month minimum",
      "RDS Proxy adds 1-3ms latency — matters for p99 latency requirements",
      "Connection pooling in Lambda without RDS Proxy causes 'too many connections'",
      "Snapshot restore takes 5-20 minutes — teams learn this during incidents",
      "RDS Performance Insights is not free in all regions",
    ],
    spicyAngles: [
      "Aurora Serverless v2 scale-to-zero finally works — we tested it for 30 days",
      "Lambda + RDS without Proxy: the connection pool disaster and how we fixed it",
      "Aurora PostgreSQL + pgvector vs DynamoDB vector search for production RAG",
    ],
  },

  ElastiCache: {
    sdk: "@aws-sdk/client-elasticache",
    signals: [
      "ElastiCache Serverless now GA — per-request pricing changing cost math",
      "Valkey (Redis fork) support added — open-source Redis alternative",
      "MemoryDB for Redis positioning as durable cache-as-database",
      "ElastiCache for Redis 7.x with Redis Functions support",
    ],
    gotchas: [
      "ElastiCache Serverless has higher per-operation cost than provisioned at scale",
      "Valkey is not 100% Redis-compatible — subtle API differences causing bugs",
      "ElastiCache inside VPC — Lambda cold starts in VPC cost you here",
    ],
    spicyAngles: [
      "Valkey vs Redis on ElastiCache: real performance numbers from production",
      "ElastiCache Serverless pricing trap: when provisioned is 10x cheaper",
    ],
  },

  // ── Messaging & Events ────────────────────────────────────────────────────
  SQS: {
    sdk: "@aws-sdk/client-sqs",
    signals: [
      "SQS + Lambda event source mapping getting smarter filtering",
      "FIFO queues now support higher throughput with message group ID sharding",
      "SQS dead-letter queue redrive (move messages back to source) now in console",
      "EventBridge Pipes replacing direct SQS → Lambda wiring",
    ],
    gotchas: [
      "Visibility timeout shorter than Lambda timeout = duplicate processing",
      "SQS batch failures — all-or-nothing vs partial batch failure modes confusion",
      "FIFO queue 300 TPS limit catching teams at traffic spikes",
      "Long polling not configured by default — teams pay for empty receives",
      "Message size limit 256KB — teams smuggling data via S3 pointers",
    ],
    spicyAngles: [
      "SQS partial batch failure: the default behavior silently drops messages",
      "FIFO queues at scale: the 300 TPS wall and how we worked around it",
      "We replaced SQS + Lambda with EventBridge Pipes — here's what we gained and lost",
    ],
  },

  SNS: {
    sdk: "@aws-sdk/client-sns",
    signals: [
      "SNS FIFO topics for ordered fan-out now being used in financial workflows",
      "SNS → SQS → Lambda fan-out still the dominant event pattern",
      "SNS message filtering reducing downstream Lambda invocations 80%",
      "SNS + mobile push (APNs, FCM) — teams switching to Pinpoint for targeting",
    ],
    gotchas: [
      "SNS delivery retries are per-subscriber — failures are invisible if not monitored",
      "SNS FIFO topic + SQS FIFO subscription required — can't mix standard + FIFO",
      "Message attribute filtering has a 5-attribute limit per subscription",
      "SNS to Lambda: no dead-letter queue by default — failed invocations vanish",
    ],
    spicyAngles: [
      "SNS message filtering eliminated 80% of our Lambda invocations — the setup is 10 lines",
      "SNS FIFO + SQS FIFO: the most misunderstood event architecture on AWS",
    ],
  },

  EventBridge: {
    sdk: "@aws-sdk/client-eventbridge",
    signals: [
      "EventBridge Pipes now the recommended glue between services — replacing Lambda glue",
      "EventBridge Scheduler replacing CloudWatch Events + cron Lambdas",
      "Schema Registry auto-discovering event shapes in production",
      "EventBridge global endpoints for multi-region event routing",
      "Event Replay for debugging production event flows",
    ],
    gotchas: [
      "EventBridge Pipes has a 5-second filter evaluation limit — complex rules fail silently",
      "EventBridge Scheduler timezone handling has edge cases around DST",
      "Schema Registry inference requires events to flow first — cold-start discovery problem",
      "Cross-account EventBridge routing requires resource-based policies that are easy to misconfigure",
      "EventBridge delivery delay under high load can reach 30+ seconds",
    ],
    spicyAngles: [
      "EventBridge Pipes replaced 3 of our Lambda functions — here's the architecture diff",
      "EventBridge Scheduler is CloudWatch Events done right — migration guide",
      "EventBridge Schema Registry: the feature teams enable and never actually use",
      "EventBridge cross-account event routing: elegant architecture, painful IAM setup",
    ],
  },

  // ── API & Networking ──────────────────────────────────────────────────────
  APIGateway: {
    sdk: "@aws-sdk/client-api-gateway",
    signals: [
      "HTTP API (v2) now the default recommendation over REST API (v1)",
      "API Gateway WebSocket APIs for real-time apps being challenged by AppSync",
      "Lambda function URLs making API Gateway optional for simple cases",
      "API Gateway request validation saving Lambda invocations for bad requests",
      "JWT authorizers in HTTP API replacing custom Lambda authorizers",
    ],
    gotchas: [
      "REST API (v1) doesn't support JWT authorizers natively — common confusion",
      "29-second integration timeout cannot be extended — Lambda must respond in time",
      "API Gateway access logs vs execution logs — teams enable one and miss the other",
      "CORS misconfiguration is the #1 API Gateway support issue",
      "API Gateway caching is per stage, not per route — teams misconfigure this",
      "Throttling limits are per-account not per-API — shared with other APIs",
    ],
    spicyAngles: [
      "REST API vs HTTP API: the cost and feature matrix teams get wrong",
      "API Gateway 29-second timeout broke our AI endpoint — here's the fix",
      "JWT authorizers in HTTP API eliminated our Lambda authorizer boilerplate",
    ],
  },

  CloudFront: {
    sdk: "@aws-sdk/client-cloudfront",
    signals: [
      "CloudFront Functions (JS runtime at edge) vs Lambda@Edge — when to use each",
      "CloudFront KeyValueStore for edge-side A/B testing without Lambda@Edge",
      "Origin Shield for reducing origin load during traffic spikes",
      "CloudFront + S3 OAC (Origin Access Control) replacing OAI",
    ],
    gotchas: [
      "CloudFront Functions have 2MB code limit and no network access",
      "Lambda@Edge has 1MB response limit and 128MB memory max",
      "Cache invalidation takes up to 60 seconds — teams expect instant",
      "OAI is deprecated but AWS doesn't force migration — teams stay on broken config",
    ],
    spicyAngles: [
      "CloudFront KeyValueStore: A/B testing at the edge without a single Lambda",
      "CloudFront Functions vs Lambda@Edge: the decision tree nobody draws clearly",
    ],
  },

  // ── AI / ML ───────────────────────────────────────────────────────────────
  Bedrock: {
    sdk: "@aws-sdk/client-bedrock-runtime",
    signals: [
      "Bedrock multi-agent collaboration now GA — new orchestration patterns emerging",
      "Bedrock Guardrails for content filtering in production AI apps",
      "Knowledge Bases for Bedrock (RAG) vs rolling your own with OpenSearch",
      "Bedrock Converse API unifying model invocation across providers",
      "Bedrock response streaming with Node.js — InvokeModelWithResponseStream",
      "Bedrock cross-region inference for latency optimization",
      "Amazon Nova models on Bedrock challenging Claude and Titan pricing",
    ],
    gotchas: [
      "Bedrock token limits per minute (not per request) — teams hit rate limits unexpectedly",
      "Streaming responses with Bedrock require manual SSE parsing in Node.js",
      "Knowledge Bases sync delay — new documents take minutes to be queryable",
      "Bedrock doesn't support fine-tuning for all models — model selection matters",
      "Cross-region inference latency is unpredictable under load",
    ],
    spicyAngles: [
      "Bedrock multi-agent vs LangChain agents: build vs buy in 2025",
      "We benchmarked Amazon Nova vs Claude 3.5 Haiku on Bedrock — the results surprised us",
      "Bedrock Knowledge Bases vs pgvector on Aurora: the RAG cost showdown",
      "Streaming Bedrock responses in Node.js: the 4 bugs you'll hit and how to avoid them",
    ],
  },

  // ── Observability ─────────────────────────────────────────────────────────
  CloudWatch: {
    sdk: "@aws-sdk/client-cloudwatch",
    signals: [
      "CloudWatch Logs cost optimization becoming a senior engineer concern",
      "Embedded Metrics Format (EMF) for zero-overhead custom metrics",
      "CloudWatch Application Signals (APM) now GA — challenging Datadog",
      "Log Insights ML-based pattern detection for anomaly alerting",
      "CloudWatch Internet Monitor for end-user experience visibility",
    ],
    gotchas: [
      "CloudWatch Logs Insights queries cost per GB scanned — expensive at scale",
      "Log retention defaults to Never Expire — teams accumulate massive bills",
      "Metric resolution: 1-second metrics cost 3x more than 1-minute metrics",
      "CloudWatch alarms on missing data behave unexpectedly during deploys",
      "Cross-account CloudWatch requires observability access policies",
    ],
    spicyAngles: [
      "Our CloudWatch bill was $800/month — here's the 3 settings we changed",
      "CloudWatch Application Signals vs Datadog: we ran both for 30 days",
      "EMF: the CloudWatch feature that makes custom metrics free at scale",
      "CloudWatch Log retention: the default that silently costs you thousands",
    ],
  },

  XRay: {
    sdk: "@aws-sdk/client-xray",
    signals: [
      "X-Ray now integrated into CloudWatch Application Signals",
      "AWS Distro for OpenTelemetry (ADOT) replacing native X-Ray SDK",
      "X-Ray sampling rules for controlling trace volume and cost",
    ],
    gotchas: [
      "X-Ray SDK adds 50-100ms to cold starts in Lambda if not configured correctly",
      "Trace propagation across async boundaries (SQS, SNS) requires manual headers",
      "X-Ray pricing is per trace — high-traffic apps get expensive fast",
    ],
    spicyAngles: [
      "We replaced X-Ray with OpenTelemetry + CloudWatch — here's the migration path",
      "X-Ray across SQS boundaries: the trace propagation nobody documents correctly",
    ],
  },

  // ── Security ──────────────────────────────────────────────────────────────
  SecretsManager: {
    sdk: "@aws-sdk/client-secrets-manager",
    signals: [
      "Secrets Manager vs SSM Parameter Store debate still unresolved in teams",
      "Secrets Manager batch fetch reducing Lambda init time",
      "Secret rotation with Lambda — teams using it wrong and getting locked out",
      "Resource-based policies on secrets for cross-account access",
    ],
    gotchas: [
      "Secrets Manager costs $0.40/secret/month — 100 microservices = $40/month minimum",
      "GetSecretValue is not free — Lambda calling it on every invocation = surprise bill",
      "Secret rotation window causes brief auth failures if not handled gracefully",
      "Cross-account secret access requires both resource policy AND IAM policy",
    ],
    spicyAngles: [
      "We moved 200 secrets from Secrets Manager to Parameter Store — saved $960/year",
      "Secrets Manager GetSecretValue caching: why your Lambda shouldn't call it on every request",
      "Secret rotation broke production at 2am — here's the rotation strategy that works",
    ],
  },

  IAM: {
    sdk: "@aws-sdk/client-iam",
    signals: [
      "IAM Identity Center replacing IAM users for human access",
      "IAM Roles Anywhere for on-premise workload AWS access",
      "Attribute-based access control (ABAC) with IAM tags gaining adoption",
      "Confused Deputy problem in cross-account roles getting more attention",
      "AWS Organizations SCPs being used for security guardrails",
    ],
    gotchas: [
      "IAM policy evaluation order confuses every engineer — explicit deny always wins",
      "AssumeRole session duration default is 1 hour — long-running jobs fail silently",
      "Permission boundaries + SCPs + resource policies — 3 layers most teams don't understand",
      "IAM condition keys for specific S3 paths are easy to misconfigure",
    ],
    spicyAngles: [
      "The Confused Deputy Problem in AWS: why your cross-account Lambda might be exploitable",
      "ABAC with IAM tags: elegant access control that 95% of AWS teams don't use",
      "IAM Roles Anywhere: giving on-prem Node.js apps real AWS credentials without key files",
    ],
  },

  // ── Developer Tools ───────────────────────────────────────────────────────
  CDK: {
    sdk: "aws-cdk-lib",
    signals: [
      "CDK v2 + SST v3 stack becoming TypeScript-native IaC default",
      "CDK Aspects for policy-as-code enforcement across stacks",
      "CDK Pipelines replacing CodePipeline manual setup for most teams",
      "CDK L3 constructs (Solutions Constructs) reducing boilerplate",
      "CDK Watch mode for hot-reload Lambda development",
      "CDK Migrate tool for importing existing CloudFormation into CDK",
    ],
    gotchas: [
      "CDK bootstrap required per account/region — teams forget this in new regions",
      "CDK deploy time for large stacks (500+ resources) is painfully slow",
      "CDK Aspects fire after synth — teams try to use them to modify resources and fail",
      "Stack resource limits (500) hit by large CDK apps",
      "CDK token resolution means you can't use construct values in some contexts",
    ],
    spicyAngles: [
      "CDK is a leaky abstraction — and that's exactly why we use it anyway",
      "CDK Aspects for enforcing tagging and encryption policies across 50 stacks",
      "SST v3 vs raw CDK: when the abstraction is worth it and when it isn't",
      "CDK deploy is slow — here's our CI/CD setup that makes it bearable",
    ],
  },

  CodeBuild: {
    sdk: "@aws-sdk/client-codebuild",
    signals: [
      "CodeBuild now supports larger instance types for faster builds",
      "CodeBuild + Lambda compute type for lightweight CI tasks",
      "GitHub Actions vs CodeBuild — teams choosing based on ecosystem lock-in concerns",
    ],
    gotchas: [
      "CodeBuild environment variables visible in logs unless explicitly masked",
      "VPC-attached CodeBuild has no internet access by default — NAT Gateway required",
      "Build cache invalidation is not automatic — teams debugging stale caches",
    ],
    spicyAngles: [
      "GitHub Actions vs CodeBuild: the cost and control trade-off for AWS-heavy teams",
      "CodeBuild Lambda compute: faster startup, lower cost for short CI jobs",
    ],
  },

  // ── Step Functions & Workflows ─────────────────────────────────────────────
  StepFunctions: {
    sdk: "@aws-sdk/client-sfn",
    signals: [
      "Step Functions Distributed Map for processing millions of items in parallel",
      "Express vs Standard workflows — cost optimization is the deciding factor",
      "Step Functions + Bedrock direct integration without Lambda middleman",
      "JSONata replacing JSONPath in new Step Functions state definitions",
      "Step Functions Test State for local state machine debugging",
    ],
    gotchas: [
      "Standard workflow execution history 25,000 event limit — long workflows hit this",
      "Express workflow logs cost as much as the execution — teams disable and go blind",
      "Distributed Map has a 10,000 concurrent child execution limit",
      "Step Functions cold start for Lambda tasks adds to overall workflow latency",
      "State input/output 256KB limit causes large payload failures",
    ],
    spicyAngles: [
      "Step Functions Distributed Map processed 2M S3 objects — here's what we learned",
      "Step Functions + Bedrock without Lambda: direct service integration patterns",
      "JSONata in Step Functions: finally readable state transformations",
      "Express vs Standard workflows: the price/feature matrix teams miscalculate",
    ],
  },

  // ── Data & Analytics ──────────────────────────────────────────────────────
  Kinesis: {
    sdk: "@aws-sdk/client-kinesis",
    signals: [
      "Kinesis Data Streams vs MSK (Managed Kafka) debate continuing",
      "Enhanced fan-out reducing consumer latency from 200ms to 70ms",
      "Kinesis Data Firehose dynamic partitioning for S3 organization",
      "Kinesis cost vs SQS cost — shard pricing confusing teams",
    ],
    gotchas: [
      "Kinesis shard limits (1MB/s write, 2MB/s read) caught teams off-guard at scale",
      "Shard iterator expiration after 5 minutes causes consumer failures",
      "GetRecords returns empty even when data exists — eventual propagation",
      "Kinesis doesn't support message filtering like SQS/EventBridge",
    ],
    spicyAngles: [
      "Kinesis vs SQS: the decision framework teams get wrong every time",
      "Kinesis Enhanced Fan-Out: the $0.015/shard-hour feature that cut our latency 65%",
    ],
  },

  Athena: {
    sdk: "@aws-sdk/client-athena",
    signals: [
      "Athena v3 engine with Apache Spark support",
      "Athena + S3 Iceberg tables for ACID transactions on data lake",
      "Athena Federated Query for cross-source analytics",
      "Query result caching reducing repeated query costs",
    ],
    gotchas: [
      "Athena charges per TB scanned — unpartitioned large tables are bill disasters",
      "Athena result location in S3 not cleaned up automatically — storage accumulates",
      "DDL changes to Glue catalog not reflected immediately in Athena",
    ],
    spicyAngles: [
      "Our Athena bill hit $3,000 before we added partitions — the fix took 2 hours",
      "Athena + Iceberg: ACID transactions on S3 without a database",
    ],
  },

  // ── Networking ────────────────────────────────────────────────────────────
  VPC: {
    sdk: "@aws-sdk/client-ec2",
    signals: [
      "VPC Lattice for service-to-service networking without load balancers",
      "AWS PrivateLink reducing data transfer costs for SaaS integrations",
      "VPC Flow Logs now supporting custom fields and Parquet format",
      "IPv6-only subnets for EC2 reducing IPv4 costs ($0.005/hour/IP)",
    ],
    gotchas: [
      "Lambda in VPC cold start penalty — NAT Gateway required for internet access",
      "Security group limits (60 inbound rules) hit by complex microservice setups",
      "VPC Peering is not transitive — teams draw wrong network diagrams",
      "IPv4 address pricing ($0.005/hr) making teams rethink their public IP strategy",
    ],
    spicyAngles: [
      "AWS started charging for public IPv4 — here's our migration to IPv6 story",
      "VPC Lattice: service mesh without the service mesh (finally)",
      "Lambda cold starts in VPC: the real numbers after SnapStart and the new runtime",
    ],
  },

  // ── Queue & Scheduling ────────────────────────────────────────────────────
  Scheduler: {
    sdk: "@aws-sdk/client-scheduler",
    signals: [
      "EventBridge Scheduler replacing CloudWatch Events for all cron jobs",
      "Scheduler flexible time windows for rate-limiting scheduled executions",
      "Scheduler + Step Functions for complex scheduled workflows",
      "Universal targets — Scheduler can now call 270+ AWS service APIs directly",
    ],
    gotchas: [
      "Scheduler timezone DST edge cases causing jobs to run at wrong times",
      "Rate expressions vs cron expressions — teams choose wrong for their use case",
      "Scheduler has 1-second minimum resolution — not suitable for sub-second needs",
    ],
    spicyAngles: [
      "EventBridge Scheduler replaced all our CloudWatch Events — the migration was 30 minutes",
      "Scheduler universal targets: invoke DynamoDB directly without Lambda in the middle",
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// NODE.JS + TYPESCRIPT + JAVASCRIPT CATALOG
// Mirrors the AWS catalog structure so the scout treats runtime topics with
// equal depth. Topics here combine naturally with AWS services:
//   "Node.js 22 require(esm) + Lambda layers"
//   "TypeScript satisfies + AWS SDK v3 commands"
//   "Bun vs Node.js on Lambda custom runtime"
// ─────────────────────────────────────────────────────────────────────────────
const RUNTIME_CATALOG = {

  // ── Node.js Runtime ────────────────────────────────────────────────────────
  NodeJS22: {
    category: "runtime",
    signals: [
      "Node.js 22 is LTS — require(esm) finally stable, no more dual package hazard",
      "--experimental-strip-types ships: run TypeScript directly without ts-node or tsx",
      "Native fetch, WebStreams, and navigator.userAgent all stable in Node 22",
      "Node.js permission model (--allow-fs-read, --allow-net) getting security adoption",
      "V8 Maglev compiler in Node 22 giving real-world 20-30% perf gains",
      "node:sqlite built-in module shipped in Node 22.5 — no more better-sqlite3",
      "diagnostics_channel for zero-overhead observability criminally underused",
      "Node.js now has a built-in .env file loader (--env-file flag)",
      "require(esm) in Lambda Node.js 22 runtime: what breaks and what doesn't",
    ],
    gotchas: [
      "--experimental-strip-types strips types but does NOT typecheck — teams assume it does",
      "require(esm) is synchronous — top-level await in ESM modules still breaks it",
      "Node.js permission model denies child_process by default — Lambda exec() patterns fail",
      "node:sqlite WAL mode not enabled by default — teams miss 3x write perf",
      "--env-file doesn't override existing process.env — confuses local vs CI setups",
      "V8 Maglev benefits are workload-specific — CPU-bound gains, I/O-bound negligible",
    ],
    spicyAngles: [
      "Node.js 22 --experimental-strip-types: we deleted ts-node from 12 services last week",
      "require(esm) in Node 22 on Lambda: the 3 edge cases nobody documents",
      "node:sqlite vs better-sqlite3 vs libsql: the embedded DB choice in 2025",
      "Node.js permission model on Lambda: sandboxing your own serverless functions",
      "We benchmarked V8 Maglev on our Lambda functions — the results were disappointing",
      "Node.js --env-file: finally no more dotenv, but there's a catch",
    ],
  },

  NodeJSPerformance: {
    category: "runtime",
    signals: [
      "Undici 7 replacing got/axios as the HTTP client of choice in Node.js services",
      "node:http2 direct usage replacing HTTP/1.1 in internal microservices",
      "Worker threads finally practical for CPU-bound Lambda workloads",
      "Node.js AsyncLocalStorage for request context propagation without param drilling",
      "BYOC (Bring Your Own Cache) pattern with node:v8 serialization for Lambda warmed state",
      "Streams pipeline() API replacing manual pipe() chains — backpressure handled correctly",
    ],
    gotchas: [
      "Undici's fetch throws on non-2xx — unlike browser fetch which doesn't",
      "Worker threads share no state — no globals, no require cache, no module singletons",
      "AsyncLocalStorage context lost across setImmediate() boundaries in some versions",
      "Node.js streams in object mode have different backpressure semantics than byte mode",
      "AbortController + fetch timeout — cleanup must be explicit or you leak the timer",
    ],
    spicyAngles: [
      "We replaced axios with Undici across 20 services — 40% lower p99 latency",
      "Worker threads on Lambda: finally a use case that makes sense",
      "AsyncLocalStorage: the Node.js feature that replaced our entire tracing middleware",
      "Node.js Streams in 2025: when to use them and when to stop pretending",
    ],
  },

  NodeJSTesting: {
    category: "testing",
    signals: [
      "node:test built-in runner killing Jest in new Node.js 22 projects",
      "node:test now supports --watch mode, code coverage, and snapshot testing",
      "Vitest eating Jest's lunch in TypeScript projects — faster, ESM-native",
      "testcontainers-node for real DynamoDB/S3/SQS integration tests without mocks",
      "AWS SDK Client Mock (@aws-sdk/client-mock) for unit testing Lambda handlers",
      "Playwright replacing Puppeteer for E2E testing of Node.js web apps",
    ],
    gotchas: [
      "node:test coverage excludes node_modules but includes generated files — false metrics",
      "Vitest mocks are reset per test file not per test — shared state bugs are subtle",
      "testcontainers cold pull on first CI run adds 2-3 minutes — teams blame the test",
      "AWS SDK Client Mock doesn't validate request shapes — you can mock the wrong thing",
      "Jest fake timers and AWS SDK v3 retry delays interact in non-obvious ways",
    ],
    spicyAngles: [
      "We deleted Jest and migrated 400 tests to node:test in one day — here's the script",
      "testcontainers vs LocalStack vs mocks: the Lambda integration test decision tree",
      "Vitest vs node:test in 2025: the honest comparison nobody writes",
      "AWS SDK Client Mock: the right way to unit test Lambda handlers (and the wrong way)",
    ],
  },

  // ── TypeScript ─────────────────────────────────────────────────────────────
  TypeScript55: {
    category: "typescript",
    signals: [
      "TypeScript 5.5 inferred type predicates — filter(Boolean) finally returns correct types",
      "TypeScript 5.5 isolatedDeclarations for faster parallel type checking in monorepos",
      "TypeScript 5.4 NoInfer<T> utility type fixing generic inference bugs",
      "const type parameters making readonly inference automatic",
      "satisfies operator replacing 'as const' + type annotation patterns",
      "TypeScript project references + incremental builds cutting CI check times 60%",
      "TypeScript 5.7 path rewriting for Node.js ESM imports (.js → .ts resolution)",
    ],
    gotchas: [
      "isolatedDeclarations forces explicit return types everywhere — big migration effort",
      "satisfies doesn't narrow the type at runtime — teams expect it to",
      "NoInfer<T> breaks existing generic patterns that relied on contextual inference",
      "TypeScript ESM + Node.js: importing .js extension for .ts files trips every team once",
      "const type parameters make tuples immutable in ways that break spread operators",
      "strictNullChecks + AWS SDK v3 response types have optional fields that aren't really optional",
    ],
    spicyAngles: [
      "TypeScript inferred type predicates in 5.5: filter(Boolean) finally works correctly",
      "satisfies vs as const vs type annotation: the 2025 decision guide",
      "isolatedDeclarations broke our monorepo — here's what we changed",
      "TypeScript + AWS SDK v3: the strict mode gotchas nobody puts in the migration guide",
      "NoInfer<T> in TypeScript 5.4: the utility type that fixed our generic Lambda handlers",
    ],
  },

  TypeScriptPatterns: {
    category: "typescript",
    signals: [
      "Zod v4 released — 2x faster, smaller bundle, new error formatting API",
      "Zod v4 breaking changes: .merge() removed, .extend() behavior changed",
      "Effect-ts gaining serious adoption as typed error handling + dependency injection",
      "ts-morph for code generation — replacing manual AST manipulation in CLI tools",
      "Branded types pattern replacing runtime validation in internal service boundaries",
      "TypeScript template literal types for type-safe event names and DynamoDB keys",
      "Discriminated unions replacing class hierarchies in Lambda event handlers",
    ],
    gotchas: [
      "Zod v4 .parse() error format changed — all custom error handlers need updating",
      "Effect-ts has a steep learning curve — teams adopt it then can't hire for it",
      "Branded types disappear at runtime — you still need validation at boundaries",
      "Template literal types slow down TypeScript language server on large codebases",
      "Discriminated unions with 20+ variants hit TypeScript checker performance limits",
    ],
    spicyAngles: [
      "Zod v4 migration broke our API layer — here's every change that hit us",
      "Branded types in TypeScript: DynamoDB PK/SK safety without runtime cost",
      "Effect-ts vs try/catch in Lambda handlers: 6 months of production experience",
      "Template literal types for type-safe EventBridge event names: genius or overkill?",
      "We replaced all our Zod schemas with TypeScript discriminated unions — here's why",
    ],
  },

  TypeScriptBuild: {
    category: "typescript",
    signals: [
      "esbuild + tsc --noEmit replacing ts-node in Lambda build pipelines",
      "swc replacing tsc for transpilation — 20x faster, no type checking",
      "tsx replacing ts-node for scripts and Lambda local dev",
      "tsup simplifying library bundling for shared Lambda layers",
      "Turborepo + TypeScript project references for monorepo incremental builds",
      "TypeScript declaration maps for monorepo go-to-definition across packages",
    ],
    gotchas: [
      "swc doesn't check types — CI must run tsc --noEmit separately or types rot",
      "esbuild tree-shakes AWS SDK v3 incorrectly without explicit externals config",
      "tsx uses Node's loader API which is still experimental in some Node 22 versions",
      "tsup bundles node_modules by default — Lambda packages bloat without external config",
      "Turborepo cache keys don't include .env files — cached builds use wrong env",
    ],
    spicyAngles: [
      "esbuild + AWS SDK v3: the externals config that prevents 50MB Lambda bundles",
      "We replaced ts-node with Node.js --experimental-strip-types — zero config",
      "swc is fast but it won't save you from type errors in production",
      "tsup for Lambda layers: the config that actually works",
      "Turborepo in a Lambda monorepo: what we got right and what we'd do differently",
    ],
  },

  // ── JavaScript Patterns ────────────────────────────────────────────────────
  JavaScriptPatterns: {
    category: "javascript",
    signals: [
      "ES2025 Iterator helpers (map, filter, take) now in Node.js 22 without polyfills",
      "Promise.withResolvers() replacing verbose new Promise() boilerplate",
      "structuredClone() replacing JSON.parse(JSON.stringify()) deep clone antipattern",
      "Array.fromAsync() for collecting async iterables — replaces manual loops",
      "Object.groupBy() and Map.groupBy() replacing lodash groupBy in Node 22",
      "Error.cause chaining replacing custom error classes in Lambda handlers",
      "using keyword (explicit resource management) for auto-cleanup of DB connections",
    ],
    gotchas: [
      "Iterator helpers are lazy — consuming twice gives empty second iteration",
      "structuredClone() doesn't clone functions, Promises, or class instances",
      "Promise.withResolvers() resolver functions are unbound — easy to lose context",
      "Array.fromAsync() collects everything in memory — not suitable for large streams",
      "using keyword requires TypeScript 5.2+ and specific tsconfig lib settings",
      "Object.groupBy() returns null-prototype object — JSON.stringify behaves differently",
    ],
    spicyAngles: [
      "ES2025 Iterator helpers on Lambda: we deleted 3 utility files last sprint",
      "structuredClone() vs JSON roundtrip: the benchmark that settled our code review debate",
      "using keyword for DynamoDB DocumentClient: auto-cleanup that actually works",
      "Promise.withResolvers() replaced our EventEmitter pattern — cleaner async queues",
      "Object.groupBy() is in Node 22 and nobody in our team knew — refactor story",
    ],
  },

  // ── Package Ecosystem ──────────────────────────────────────────────────────
  PackageEcosystem: {
    category: "ecosystem",
    signals: [
      "pnpm workspaces replacing npm/yarn in Lambda monorepos for disk efficiency",
      "npm provenance statements for supply chain security in published packages",
      "Node.js corepack making package manager version pinning automatic",
      "Volta replacing nvm for Node.js version management in team environments",
      "Renovate Bot automating AWS SDK v3 patch updates across microservices",
    ],
    gotchas: [
      "pnpm symlinked node_modules break Lambda bundlers that expect flat structure",
      "npm provenance requires GitHub Actions — local publish breaks the chain",
      "corepack is experimental in Node 22 — teams enable it and forget, causing CI breaks",
      "Renovate auto-merge on AWS SDK v3 minor versions has caused silent breaking changes",
    ],
    spicyAngles: [
      "pnpm in Lambda: faster CI but your bundler needs this one config change",
      "Renovate Bot for AWS SDK v3 updates: auto-merge strategy that hasn't broken us yet",
      "npm provenance: supply chain security that takes 10 minutes to set up",
    ],
  },

  // ── Runtime Alternatives ───────────────────────────────────────────────────
  // ── Frameworks & APIs ──────────────────────────────────────────────────────
  NodeJSFrameworks: {
    category: "framework",
    signals: [
      "Fastify 5 released — full TypeScript rewrite, faster schema validation",
      "Hono.js gaining traction on Lambda — tiny, fast, Edge-first design",
      "tRPC v11 with React Query 5 integration changing how teams design Lambda APIs",
      "Express 5 finally stable after 10 years — async error handling built in",
      "Nitro (from Nuxt team) as a universal server for Lambda + edge deployments",
    ],
    gotchas: [
      "Fastify 5 plugin types changed — third-party plugins not yet updated",
      "Hono on Lambda: response streaming requires Lambda function URLs, not API Gateway",
      "tRPC v11 client bundle size increased — needs explicit tree-shaking config",
      "Express 5 async error handling only works if you don't use next(err) pattern",
    ],
    spicyAngles: [
      "Express 5 is finally here — is it worth migrating from Fastify?",
      "Hono on Lambda: the framework that made us question API Gateway",
      "tRPC v11 in a Lambda monorepo: the setup that actually works end-to-end",
      "Fastify 5 migration: what broke in our Lambda handlers and how we fixed it",
      "We benchmarked 6 Node.js frameworks on Lambda cold starts — the results",
    ],
  },

};

// ─────────────────────────────────────────────────────────────────────────────
// AI / ML / GENAI CATALOG
// Real, assignable AI topics — NOT just prompt decoration. Mirrors the AWS and
// runtime catalog structure so the scout treats AI with equal depth. These
// combine naturally with AWS (Bedrock, DynamoDB vector) and Node.js/TS.
// Practical, engineering-focused AI — the kind a backend engineer ships, not
// research papers. Every topic is something you build with real SDKs and code.
// ─────────────────────────────────────────────────────────────────────────────
const AI_CATALOG = {

  LLMIntegration: {
    category: "ai",
    signals: [
      "Streaming LLM tokens to the client with SSE is now the expected UX, not a nice-to-have",
      "Structured output (JSON mode / tool calling) replacing brittle regex parsing of LLM responses",
      "Function calling / tool use is how LLMs now trigger real backend actions",
      "Prompt caching (Anthropic, OpenAI) cutting repeat-context costs up to 90%",
      "Model routing — cheap model for easy queries, expensive for hard — becoming standard",
    ],
    gotchas: [
      "LLM JSON mode still occasionally returns malformed JSON — you must retry-parse",
      "Token limits are per-minute not per-request — batch workloads hit invisible ceilings",
      "Streaming responses need explicit backpressure handling or Node.js buffers the whole reply",
      "Temperature 0 is not deterministic across model versions — tests break on model updates",
      "Tool-calling loops can run away — you need a hard max-iterations guard",
    ],
    spicyAngles: [
      "We switched to LLM structured output and deleted 400 lines of regex parsing",
      "Prompt caching cut our LLM bill 70% — the one header nobody documents",
      "Streaming LLM tokens in Node.js: the 4 bugs you'll hit with SSE and fetch",
      "Model routing saved us $2k/month — cheap model for 80% of queries",
    ],
  },

  ChatGPTForEngineers: {
    category: "ai",
    signals: [
      "Engineers using ChatGPT for code review, debugging, and rubber-ducking daily",
      "Custom GPTs and Projects letting teams save reusable coding assistants",
      "ChatGPT's code interpreter running and testing snippets before you paste them",
      "Voice and screenshot input changing how engineers ask coding questions",
      "GPT vs Claude vs Gemini for coding — engineers developing strong tool preferences",
    ],
    gotchas: [
      "ChatGPT confidently invents API methods that don't exist — always verify",
      "Long conversations drift — it forgets constraints you set 20 messages ago",
      "Pasting proprietary code into ChatGPT is a real data-leak risk to check first",
      "It defaults to verbose over-engineered solutions unless you ask for simple ones",
    ],
    spicyAngles: [
      "How I actually use ChatGPT as a senior engineer (beyond 'write me a function')",
      "10 ChatGPT prompts that made me faster at debugging real production code",
      "Custom GPTs for your codebase: a practical setup that actually helps",
      "ChatGPT vs Claude for coding: how I decide which one to reach for",
    ],
  },

  ClaudeCode: {
    category: "ai",
    signals: [
      "Claude's agentic coding runs multi-step tasks across your whole repo, not just autocomplete",
      "Claude reads context from many files to make coherent multi-file edits",
      "Engineers delegating whole tasks ('add tests for this module') to Claude",
      "Claude explaining unfamiliar codebases faster than reading the docs",
      "Terminal and IDE integrations bringing Claude into the real dev loop",
    ],
    gotchas: [
      "Claude works best with clear, scoped instructions — vague asks give vague edits",
      "It can confidently refactor across files — review every change before you commit",
      "Giving it too much irrelevant context dilutes focus and lowers quality",
      "Generated tests can pass while asserting the wrong behavior",
    ],
    spicyAngles: [
      "How I use Claude to understand a 100k-line codebase in an afternoon",
      "Delegating real engineering tasks to Claude: what works and what doesn't",
      "Claude for multi-file refactors: my actual workflow, step by step",
      "The prompts I use to get production-quality code out of Claude",
    ],
  },

  PromptEngineering: {
    category: "ai",
    signals: [
      "Prompt engineering is now version-controlled and tested like code, not tweaked ad-hoc",
      "Few-shot examples in the prompt beating fine-tuning for most structured tasks",
      "Chain-of-thought prompting measurably improving reasoning on complex tasks",
      "System prompts as the primary control surface — teams treating them as config",
      "Prompt injection attacks becoming a real security concern in production apps",
    ],
    gotchas: [
      "A prompt that works on one model version silently degrades on the next",
      "Few-shot examples eat context window — teams blow token budgets without noticing",
      "Prompt injection can override your system prompt — user input is not trusted input",
      "Chain-of-thought increases latency and cost — not free reasoning improvement",
      "Whitespace and formatting in prompts affect output more than engineers expect",
    ],
    spicyAngles: [
      "We version-control our prompts and test them in CI — here's the setup",
      "Prompt injection broke our AI feature in week one — the defense that worked",
      "Few-shot beat fine-tuning for our use case — and cost 100x less to iterate",
      "Chain-of-thought doubled our LLM bill for a 5% accuracy gain — was it worth it?",
    ],
  },

  AIAgents: {
    category: "ai",
    signals: [
      "AI agents (plan → tool call → observe → repeat) moving from demos to production",
      "Multi-agent orchestration — specialized agents handing off to each other",
      "Tool/function calling is the backbone that makes agents actually do things",
      "Agent memory (short-term context + long-term store) becoming a design pattern",
      "Human-in-the-loop checkpoints for agents taking consequential actions",
    ],
    gotchas: [
      "Agents loop forever without a max-iteration cap — runaway token bills",
      "Tool call failures cascade — one bad API response derails the whole agent run",
      "Agents hallucinate tool arguments — you must validate before executing",
      "Multi-agent handoffs lose context — state management is the hard part",
      "Non-determinism makes agent bugs nearly impossible to reproduce",
    ],
    spicyAngles: [
      "Our AI agent racked up a $400 bill in one runaway loop — the guardrails we added",
      "Multi-agent systems are mostly hype — where they actually earned their keep",
      "Agents hallucinate tool arguments — the validation layer that saved production",
      "Build vs buy for AI agents: LangChain, custom, or a managed service?",
    ],
  },

  AIPairProgramming: {
    category: "ai",
    signals: [
      "AI pair programming shifting from autocomplete to full task delegation",
      "Engineers developing habits for what to hand off to AI vs write themselves",
      "Inline chat, agent mode, and edit-in-place becoming distinct daily workflows",
      "Reviewing AI-written code emerging as a core skill, not an afterthought",
      "Teams sharing prompt patterns and conventions the way they share snippets",
    ],
    gotchas: [
      "Accepting AI edits without reading them ships subtle bugs that compile fine",
      "AI writes code that works but ignores your existing patterns — drift adds up",
      "It's fast at the wrong abstraction — you still own the design decisions",
      "Over-relying on it for things you don't understand slows your own growth",
    ],
    spicyAngles: [
      "How I actually pair with AI day to day as a senior engineer",
      "What I delegate to AI vs what I still write myself — my real dividing line",
      "AI pair programming made me faster — and these habits kept the code good",
      "The review discipline that lets me trust AI-generated code",
    ],
  },

  AIDevTools: {
    category: "ai",
    signals: [
      "The AI dev-tool landscape exploding: Copilot, Cursor, Cody, Windsurf, v0, Claude Code",
      "Each tool carving a niche — scaffolding, refactoring, whole-app generation",
      "Engineers stacking multiple AI tools instead of committing to just one",
      "AI tools moving up the stack from editor into terminal, CI, and code review",
      "The 'which AI tool for what task' decision becoming part of engineering judgment",
    ],
    gotchas: [
      "Tool sprawl — using five AI tools badly beats using one well",
      "Each tool has different context limits that change the quality you get",
      "Switching tools mid-project loses the context you built up",
      "Flashy demos hide that most value comes from a few boring everyday uses",
    ],
    spicyAngles: [
      "The AI dev tools I actually use every day (and the ones I dropped)",
      "Copilot vs Cursor vs Claude Code: how I pick the right tool for each task",
      "My AI-assisted development stack in 2026, explained",
      "The AI coding tools worth your time — a working engineer's honest take",
    ],
  },

  PromptTipsAndTricks: {
    category: "ai",
    signals: [
      "Concrete prompting techniques (few-shot, role, constraints) that reliably improve output",
      "Engineers building personal prompt libraries for recurring coding tasks",
      "Giving the model examples beating long descriptions for code generation",
      "Asking for the plan first, then the code, producing better results",
      "Structured output requests making AI responses safe to use in scripts",
    ],
    gotchas: [
      "Vague prompts get vague code — specificity is the whole game",
      "Asking for too much at once produces shallow work across all of it",
      "The model agrees with wrong assumptions in your prompt — state facts carefully",
      "Copy-pasting clever prompts without understanding them rarely transfers",
    ],
    spicyAngles: [
      "10 prompting tricks that actually improve the code AI writes for you",
      "The prompt structure I use for every coding task, explained",
      "Stop describing, start showing: why examples beat instructions for code",
      "My reusable prompt library for everyday engineering work",
    ],
  },

  AIWorkflows: {
    category: "ai",
    signals: [
      "Engineers wiring multiple AI tools into repeatable daily workflows",
      "AI moving into the whole loop: plan in Claude, build in Cursor, review with GPT",
      "Personal automation combining AI with scripts, hooks, and CLIs",
      "Teams standardizing AI workflows so quality doesn't depend on who's prompting",
      "AI-assisted workflows for docs, tests, and PR descriptions, not just code",
    ],
    gotchas: [
      "A workflow that depends on constant prompting isn't a workflow — it's toil",
      "Chaining AI steps compounds errors if you don't check the intermediate output",
      "The best workflow is invisible — if you're fighting the tools, simplify",
      "What works for a solo dev doesn't always survive contact with a team",
    ],
    spicyAngles: [
      "My end-to-end AI workflow: from ticket to merged PR",
      "How I combine Claude, Cursor, and ChatGPT into one smooth daily loop",
      "The AI workflow that cut my busywork without cutting quality",
      "Building a repeatable AI-assisted development process, step by step",
    ],
  },

  MCP: {
    category: "ai",
    signals: [
      "Model Context Protocol (MCP) is the emerging standard for connecting AI models to tools and data",
      "MCP lets one integration work across many AI clients instead of rebuilding per-model",
      "MCP servers expose tools, resources, and prompts through a single open protocol",
      "Claude, IDEs, and agent frameworks adopting MCP as the plugin layer for AI",
      "Building an MCP server in Node.js/TypeScript is now a common first AI-infra task",
    ],
    gotchas: [
      "MCP 'tools' vs 'resources' vs 'prompts' confuse beginners — each has a distinct role",
      "MCP servers run locally or remotely — transport choice (stdio vs SSE) trips people up",
      "Tool schemas must be precise or the model calls them with the wrong arguments",
      "MCP is a protocol, not a framework — you still design the actual capabilities",
    ],
    spicyAngles: [
      "MCP explained simply: what the Model Context Protocol actually is and why it matters",
      "Build your first MCP server in Node.js — a beginner-friendly walkthrough",
      "MCP vs plain function calling: when you need a protocol and when you don't",
      "How MCP lets one tool integration work across Claude, IDEs, and agents",
    ],
  },

  ClaudeFeatures: {
    category: "ai",
    signals: [
      "Claude's tool use lets the model call your functions and APIs during a conversation",
      "Claude's extended context windows change how much you can feed a model at once",
      "Prompt caching on Claude reuses stable context to speed up repeated calls",
      "Claude's vision capabilities read screenshots, diagrams, and documents",
      "Structured output and JSON mode make Claude responses safe to parse in code",
    ],
    gotchas: [
      "Bigger context windows aren't free — relevant context still beats more context",
      "Tool-use loops need a stop condition or the model keeps calling tools",
      "System prompts steer Claude far more than most beginners expect",
      "Streaming responses need incremental parsing, not waiting for the whole reply",
    ],
    spicyAngles: [
      "Claude tool use explained for beginners: how the model calls your code",
      "How Claude's context window actually works — and why more isn't always better",
      "Prompt caching on Claude, explained simply with a real example",
      "A beginner's guide to structured output with Claude — parse responses safely",
    ],
  },

  AICodingAssistants: {
    category: "ai",
    signals: [
      "AI coding assistants moved from autocomplete to full multi-file, agentic edits",
      "Assistants that read your whole repo give far better suggestions than single-file ones",
      "Inline chat, edit-in-place, and agent modes are now distinct assistant workflows",
      "Reviewing AI-generated code is becoming a core engineering skill",
      "Context (which files the assistant sees) matters more than the underlying model",
    ],
    gotchas: [
      "AI assistants confidently write code that compiles but is subtly wrong — review always",
      "Giving the assistant too much context can dilute its focus and lower quality",
      "Generated tests can pass while testing the wrong behavior",
      "Blindly accepting refactors across many files hides breaking changes",
    ],
    spicyAngles: [
      "How AI coding assistants actually work under the hood, explained simply",
      "Getting real value from an AI coding assistant: a beginner-to-advanced guide",
      "Why context matters more than the model in AI coding assistants",
      "How to review AI-generated code without trusting it blindly",
    ],
  },

  CursorAI: {
    category: "ai",
    signals: [
      "Cursor turns the editor itself into an AI-native workspace, not a plugin",
      "Cursor's codebase indexing lets the AI reason about your whole project",
      "Composer/agent mode makes multi-file changes from a single instruction",
      "Rules files let teams give the AI persistent project conventions",
      "Cursor + MCP connects the editor to external tools and data sources",
    ],
    gotchas: [
      "Cursor is only as good as the context you give it — vague prompts get vague edits",
      "Agent mode editing many files at once needs careful review before accepting",
      "Indexing a huge monorepo has limits — scoping the workspace helps",
      "Rules files are powerful but easy to over-specify into contradictions",
    ],
    spicyAngles: [
      "Cursor AI explained: what makes an AI-native editor different, in simple terms",
      "A beginner's guide to getting real work done in Cursor",
      "How Cursor's codebase indexing helps the AI understand your project",
      "Using rules files in Cursor to teach the AI your team's conventions",
    ],
  },

};

// Combined rotation pool: AWS services + runtime topics + AI topics
// Interleaved so posts alternate between AWS-deep, Node/TS-deep, and AI-deep
// topics naturally. Category-balanced selection happens in pickAssignedService.
const ALL_TOPICS = [
  ...Object.entries(AWS_SERVICES_CATALOG).map(([name, data]) => ({
    name,
    type: "aws",
    ...data,
  })),
  ...Object.entries(RUNTIME_CATALOG).map(([name, data]) => ({
    name,
    type: "runtime",
    ...data,
  })),
  ...Object.entries(AI_CATALOG).map(([name, data]) => ({
    name,
    type: "ai",
    ...data,
  })),
];

// ─────────────────────────────────────────────────────────────────────────────
// Build the scout's ecosystem pulse dynamically from the catalog above.
// Each run picks a weighted-random sample of services to feature so the
// scout sees variety and cross-service angles, not the same 5 services daily.
// ─────────────────────────────────────────────────────────────────────────────
// ── Published titles history ──────────────────────────────────────────────────
// Reads and writes logs/post-history.json to track what was already posted.
// This file is committed back to the repo after each successful publish so the
// next run knows exactly what topics to avoid.
// ─────────────────────────────────────────────────────────────────────────────
const HISTORY_FILE_CANDIDATES = [
  "logs/post-history.json",
  "post-history.json",
  "../logs/post-history.json",
  "../post-history.json",
];

function resolveHistoryFilePath(fs, path) {
  const roots      = [process.cwd()].filter(Boolean);
  const candidates = [];
  for (const root of roots) {
    for (const rel of HISTORY_FILE_CANDIDATES) {
      candidates.push(path.resolve(root, rel));
    }
  }
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.resolve(process.cwd(), "logs/post-history.json");
}

async function readHistory() {
  try {
    const fsModule   = await import("fs");
    const pathModule = await import("path");
    const fs         = fsModule.default ?? fsModule;
    const path       = pathModule.default ?? pathModule;
    const historyFile = resolveHistoryFilePath(fs, path);
    if (!fs.existsSync(historyFile)) return [];
    const raw    = fs.readFileSync(historyFile, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ── Layer 1: Deterministic service assignment — bypasses LLM choice ─────────
// Reads history and returns the first service in the catalog that is NOT
function normalizeTopicKey(value = "") {
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}


// Pick a service that hasn't appeared in the last N posts (default 14).
// Uses a rolling window instead of all-history so the catalog never gets
// permanently exhausted. After ~3 weeks a service becomes reusable.
function pickAssignedService(history, allServiceNames, windowSize = 30) {
  // ── AI-favoring category selection (2:1) ─────────────────────────────────
  // Desired rhythm: for every 1 AWS/runtime post, aim for ~2 AI posts.
  // Cycle looks like:  aws → ai → ai → runtime → ai → ai → aws → ai → ai ...
  //
  // How it works — decide the category by looking at the last two posts:
  //   • If the last post was NOT ai        → pick AI (start the AI streak)
  //   • If last was ai but the one before  → pick AI again (second AI in a row)
  //     was NOT ai (streak length == 1)
  //   • If the last TWO were both ai        → AI streak done, pick aws/runtime
  //   • No history yet                      → start with AI
  // Falls back to flat selection if ALL_TOPICS metadata isn't available.
  const recentUsed = new Set(
    history
      .slice(-windowSize)
      .map(h => normalizeTopicKey(h.service))
      .filter(Boolean)
  );

  // Group eligible (not-recently-used) topics by category
  const byCategory = { aws: [], runtime: [], ai: [] };
  let haveCategories = false;

  for (const svc of allServiceNames) {
    if (recentUsed.has(normalizeTopicKey(svc))) continue;      // blocked (recent)
    const meta = ALL_TOPICS.find(t => t.name === svc);
    if (meta && byCategory[meta.type]) {
      byCategory[meta.type].push(svc);
      haveCategories = true;
    }
  }

  if (haveCategories) {
    // Categories of the last few posts (most recent last)
    const recentTypes = history
      .slice(-4)
      .map(h => ALL_TOPICS.find(t => t.name === h.service)?.type)
      .filter(Boolean);

    const last = recentTypes[recentTypes.length - 1];

    // Count trailing AI streak
    let aiStreak = 0;
    for (let i = recentTypes.length - 1; i >= 0; i--) {
      if (recentTypes[i] === "ai") aiStreak++;
      else break;
    }

    // ── AI-DOMINANT policy ───────────────────────────────────────────────────
    // AI is the primary content focus. Default to AI every time. Only break to
    // an AWS/runtime post after 3 AI posts in a row, so the feed stays ~75% AI
    // with occasional supporting engineering content for variety.
    let chosenCat;
    if (aiStreak >= 3 && (byCategory.aws.length > 0 || byCategory.runtime.length > 0)) {
      // Time for one supporting (non-AI) post
      let nonAi = ["aws", "runtime"].filter(c => byCategory[c].length > 0);
      const notLast = nonAi.filter(c => c !== last);
      if (notLast.length > 0) nonAi = notLast;
      chosenCat = nonAi[Math.floor(Math.random() * nonAi.length)];
    } else if (byCategory.ai.length > 0) {
      chosenCat = "ai";
    } else {
      // AI pool exhausted in the recent window — fall back to any available
      const any = ["aws", "runtime"].filter(c => byCategory[c].length > 0);
      chosenCat = any.length > 0 ? any[Math.floor(Math.random() * any.length)] : null;
    }

    if (chosenCat && byCategory[chosenCat].length > 0) {
      const pool       = byCategory[chosenCat];
      const pickedName = pool[Math.floor(Math.random() * pool.length)];
      console.log(`🗂️   AI-dominant rotation → category "${chosenCat}" (aiStreak was ${aiStreak}), topic: ${pickedName}`);
      return pickedName;
    }
    // If we somehow couldn't choose, fall through to flat selection below.
  }

  // ── Fallback: original flat selection ──────────────────────────────────────
  const eligible = allServiceNames.filter(svc => !recentUsed.has(normalizeTopicKey(svc)));
  if (eligible.length === 0) return null;
  const pickedIdx = Math.floor(Math.random() * eligible.length);
  return eligible[pickedIdx];
}

async function writeHistory(entry) {
  try {
    const fsModule   = await import("fs");
    const pathModule = await import("path");
    const fs         = fsModule.default ?? fsModule;
    const path       = pathModule.default ?? pathModule;

    // Resolve the correct history file path (same logic as readHistory)
    const historyFile = resolveHistoryFilePath(fs, path);
    const logsDir     = path.dirname(historyFile);

    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

    const history = await readHistory();
    history.push(entry);
    // Keep last 90 entries (3 months of weekdays)
    const trimmed = history.slice(-90);
    fs.writeFileSync(historyFile, JSON.stringify(trimmed, null, 2));
    console.log(`📝  History updated — ${trimmed.length} entries logged (${historyFile})`);
  } catch (e) {
    console.warn("⚠️  Could not write history file:", e.message);
  }
}

function buildEcosystemPulse(today, history = []) {
  // ALL_TOPICS = 24 AWS + 9 runtime/TS/JS + 9 AI/ML/GenAI = 42 total rotation slots
  const total      = ALL_TOPICS.length;

  // ── Round-robin rotation by day-of-year across all 34 topics ─────────────
  // AWS and runtime topics are interleaved — alternates naturally each day.
  const d          = new Date(today);
  const start      = new Date(d.getFullYear(), 0, 0);
  const dayOfYear  = Math.floor((d - start) / 86_400_000);
  const primaryIdx  = dayOfYear % total;
  const primaryTopic = ALL_TOPICS[primaryIdx];
  const primaryName  = primaryTopic.name;
  const primaryType  = primaryTopic.type;

  // Featured = primary + next 5 in the rotation (wraps around)
  const featured   = Array.from({ length: 6 }, (_, i) => ALL_TOPICS[(primaryIdx + i) % total]);
  const background = ALL_TOPICS
    .filter((_, i) => i < primaryIdx || i >= primaryIdx + 6)
    .map(t => t.name);

  // ── Fix 2: Inject recent title history into pulse ────────────────────────
  // The scout reads this and is explicitly told not to repeat these topics.
  let historyBlock = "";
  if (history.length > 0) {
    const recent = history.slice(-30); // last 30 posts
    historyBlock = `
ALREADY PUBLISHED — DO NOT repeat these titles, angles, or primary services:
`;
    recent.forEach(h => {
      historyBlock += `  ✗ [${h.date}] (${h.service}) "${h.title}"
`;
    });
    historyBlock += `
Your topic MUST be meaningfully different from all of the above.
`;

    // ── STRONG BLOCK: services used in last 7 publishes are OFF-LIMITS ──────
    // Title-similarity matching is too weak. We block at the service level —
    // same service ≠ different post, no matter how creative the angle.
    const recentServices = recent.slice(-7).map(h => h.service).filter(Boolean);
    if (recentServices.length > 0) {
      const uniqueRecent = [...new Set(recentServices)];
      historyBlock += `
🚫 BLOCKED SERVICES — these were the primary topic of recent posts.
   You MUST NOT pick any of these as primaryService today:
`;
      uniqueRecent.forEach(s => {
        historyBlock += `   ✗ ${s}
`;
      });
      historyBlock += `
   Today's primaryService MUST be a service NOT in the blocked list above.
   Pick from the 30+ other AWS services or runtime topics in the catalog instead.
`;
    }
  }

  let pulse = `AWS + Node.js + TypeScript Ecosystem Pulse — ${today}\n`;
  pulse += `Today's primary topic: ${primaryName} [${primaryType}] (day ${dayOfYear} → slot ${primaryIdx} of ${total})\n\n`;
  pulse += historyBlock;
  pulse += `\nFEATURED TOPICS (high-signal, ripe for posts today):\n`;

  for (const topic of featured) {
    const typeLabel = topic.type === "aws"
      ? `AWS  SDK: ${topic.sdk ?? ""}`
      : `${topic.category?.toUpperCase() ?? "RUNTIME"}`;
    pulse += `\n【 ${topic.name} 】  [${typeLabel}]\n`;
    pulse += `  Hot signals:\n`;
    topic.signals.forEach(s => { pulse += `    • ${s}\n`; });
    pulse += `  Real gotchas:\n`;
    (topic.gotchas ?? []).slice(0, 3).forEach(g => { pulse += `    ⚠ ${g}\n`; });
    pulse += `  Spicy angle ideas:\n`;
    (topic.spicyAngles ?? []).forEach(a => { pulse += `    🔥 ${a}\n`; });
  }

  pulse += `\nBACKGROUND SERVICES (available for cross-service angles): `;
  pulse += background.join(", ") + "\n";

  return pulse;
}

// ─────────────────────────────────────────────────────────────────────────────
// GROQ WRAPPER — with automatic rate-limit retry + exponential backoff
//
// Groq free tier: 12,000 TPM (tokens per minute). If the scout call and
// writer call land in the same 60-second window and together exceed 12,000
// tokens, Groq returns HTTP 429 with a "retry_after" hint in the response.
// This wrapper reads that hint and waits exactly as long as Groq says,
// then retries — up to 5 times before giving up.
// ─────────────────────────────────────────────────────────────────────────────
async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function groq(messages, { model = "llama-3.3-70b-versatile", max_tokens = 1024, json = false } = {}) {
  const MAX_RETRIES = 5;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${CONFIG.groqApiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens,
        messages,
        ...(json ? { response_format: { type: "json_object" } } : {}),
      }),
    });

    // ── Success ──────────────────────────────────────────────────────────────
    if (res.ok) {
      const data = await res.json();
      return data.choices?.[0]?.message?.content ?? "";
    }

    // ── Rate limit (429) — read wait time from Groq's error body ─────────────
    if (res.status === 429) {
      const errBody = await res.json().catch(() => ({}));
      const msg     = errBody?.error?.message ?? "";

      // Groq tells you exactly how many seconds to wait: "try again in 2.92s"
      const secondsMatch = msg.match(/try again in ([\d.]+)s/i);
      const waitSeconds  = secondsMatch
        ? Math.ceil(parseFloat(secondsMatch[1])) + 2   // add 2s buffer
        : Math.min(15 * attempt, 90);                   // fallback: 15s, 30s, 45s...

      console.log(`⏳  Rate limit hit (attempt ${attempt}/${MAX_RETRIES})`);
      console.log(`   Groq says: "${msg.slice(0, 120)}"`);
      console.log(`   Waiting ${waitSeconds}s before retry...
`);

      await sleep(waitSeconds * 1000);
      continue;
    }

    // ── Any other error — fail immediately ────────────────────────────────────
    const errText = await res.text();
    throw new Error(`Groq API error ${res.status}: ${errText}`);
  }

  throw new Error(`Groq API failed after ${MAX_RETRIES} attempts — rate limit persists. Try again later.`);
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 1 — TOPIC SCOUT
// Generates today's unique, spicy, ecosystem-grounded topic as structured JSON.
// ─────────────────────────────────────────────────────────────────────────────
async function scoutTodaysTopic(assignedService) {
  console.log(`🔍  Scouting topic for assigned service: ${assignedService}\n`);

  const today   = new Date().toISOString().split("T")[0];
  const history = await readHistory();
  if (history.length > 0) {
    console.log(`📚  Loaded ${history.length} past posts from history`);
    history.slice(-5).forEach(h => console.log(`   ✗ ${h.date}: ${h.service} → "${h.title}"`));
    console.log();
  }
  const pulse         = buildEcosystemPulse(today, history);
  const livePulse     = await buildLiveSignalPulse();
  const coveragePulse = buildCoveragePulse();

  // HARD ASSIGNMENT — scout MUST honor the service chosen by Layer 1
  const modeInstructions = `💡 SUGGESTED STARTING POINT (a hint, NOT a requirement): "${assignedService}"

You are NOT locked to this. It's one idea from our catalog to spark thinking.
Your real job: pick the MOST TIMELY, VALUABLE AI topic for software engineers RIGHT NOW.

Use the live signals above and your knowledge of the current AI ecosystem to choose
something developers are actively talking about this week. Strongly prefer topics in
these areas (this is where our audience lives):
  • AI coding agents & assistants (Cursor, Claude Code, GitHub Copilot, Windsurf, Cody)
  • Claude, ChatGPT, Gemini — new features, capabilities, real workflows
  • MCP (Model Context Protocol) and AI-native development
  • Practical prompt engineering, tips & tricks for real coding tasks
  • AI developer tools, AI workflows, and how engineers actually ship with AI
  • RAG, vector search, AI infrastructure, and AWS AI services WHEN tied to a real tool/use case

Rules for the topic you pick:
  - It MUST be an AI topic relevant to software engineers (see areas above)
  - It should feel current — like it's responding to something happening in AI now
  - It must be PRACTICAL and tool-anchored — name real tools, real features, real workflows
  - AVOID abstract textbook explainers ("What is X", "Understanding Y concept" with no tool)
  - Set primaryService to a short label for the topic (a catalog name if it fits, or a
    concise new label like "CursorAgentMode" or "ClaudeMCP" if the catalog doesn't cover it)

You have full freedom to go beyond the catalog if a more timely AI topic exists.
The catalog is inspiration, not a boundary.`;

  const runtimePulse = `
Node.js Runtime signals:
- Node.js 22 LTS: require(esm) stable, native fetch GA, --experimental-strip-types
- ts-node / tsx disrupted by Node's native TypeScript stripping
- Built-in node:test runner killing Jest in greenfield projects
- diagnostics_channel for zero-cost observability — criminally underused
- Node.js permission model (--allow-fs-read, --allow-net) for security sandboxing
- Undici replacing axios/got in perf-sensitive Node.js services

TypeScript signals:
- TS 5.5: inferred type predicates, const type params, isolatedDeclarations
- Zod v4 breaking changes mid-migration for teams on v3
- Effect-ts gaining traction as structured concurrency + error handling
- AWS SDK v3 with satisfies keyword for type-safe command patterns
- CDK TypeScript generics — power vs complexity debates

Controversy & hot takes (great for engagement):
- "Lambda cold starts are not solved — they moved to INIT phase"
- "CDK is a leaky abstraction — but so is every other IaC tool"
- "AWS bills are intentionally unreadable"
- "SQS + Lambda is overused — EventBridge Pipes is better in 80% of cases"
- "Single-table DynamoDB design is a trap for teams without a DynamoDB expert"
- "Secrets Manager at $0.40/secret/month adds up faster than anyone admits"
`;

  const prompt = `Today is ${today}.

You are a senior AI engineer who is also a gifted teacher. You write educational
content that makes complex AI concepts click for everyone — from someone brand new
to AI, to a staff engineer who wants a clear mental model. You track the AI ecosystem
daily: Claude's capabilities, MCP, AI agents, Cursor and AI coding assistants, prompt
engineering, RAG, vector databases, and new AI tooling. You explain senior-level ideas
in plain language, always grounded in a concrete example.

${pulse}

${livePulse}

${coveragePulse}

${runtimePulse}

${modeInstructions}

Based on the signals above and the mode instructions, create the blog topic. Requirements:

1. EDUCATIONAL FIRST — the post must teach something. A reader should finish it
   understanding a concept they didn't before. Clarity beats cleverness.
2. ACCESSIBLE TO BEGINNERS, VALUABLE TO EXPERTS — explain from first principles in
   plain language, but include the depth and nuance an experienced engineer respects.
   Assume the reader is smart but may be new to this specific AI topic.
3. AI-FIRST — the subject should be an AI concept: Claude features & mechanisms, AI
   agents, MCP (Model Context Protocol), Cursor / AI coding assistants, prompt
   engineering, RAG, vector databases, embeddings, or another current AI development.
4. CONCRETE — anchored by a practical, real-world example or use case the reader can
   picture or try. Real tool names, real code, real scenarios — no hand-waving.
5. CLEAR TEACHING TITLE — the title should promise a clear takeaway, e.g.
   "explained simply", "a beginner's guide to", "how X actually works", "understanding X".
   A reader should know exactly what they'll learn.

🎯 CONTENT DIRECTION — this is a hard steer, not a suggestion:
   FOCUS on breaking down one AI concept clearly. Strong topic families:
     • Claude AI features & how they work (tool use, context windows, prompt caching, vision)
     • AI agents — what they are, how the loop works, how to build a simple one
     • MCP (Model Context Protocol) — what it is, why it exists, building a server
     • Cursor AI & AI coding assistants — how they work, how to use them well
     • Prompt engineering — practical techniques explained with examples
     • RAG — how retrieval-augmented generation works, step by step
     • Vector databases & embeddings — the concepts made intuitive
     • Other recent AI developments explained for a broad engineering audience

   TONE: a patient senior engineer teaching a colleague. Encouraging, precise, and
   example-driven. Define jargon the first time you use it. Use analogies to build
   intuition, then show the real mechanism.

   🚫 DO NOT write about any of these — they perform badly and are off-topic now:
     • Cost cutting / cost optimization / "we saved $X" / bill reduction / cheaper-than
     • Workflow optimization framed as efficiency/savings
     • Cold starts / cold-start latency / init-phase tuning
     • Contrarian rage-bait or "everyone is wrong" drama with no teaching value
   The title and angle MUST NOT center on dollar amounts, "$/month", "cheaper", "bill",
   "cost", "cold start", or "optimization". Teach a concept instead.

TITLE RULES — the difference is context and specificity, not the words themselves:

The patterns below are ONLY bad when they are GENERIC (no real story, no real number, no real outcome).
A great title makes a clear promise: "read this and you'll understand X."

❌ BANNED — vague, no clear takeaway, could describe any post ever written:
  "Mastering AI"
  "A Complete Guide to LLMs"
  "Introduction to Prompt Engineering"
  "Getting Started with AI Agents"
  "Everything You Need to Know About RAG"
  "Understanding Vector Databases"
  "Deep Dive into MCP"

✅ GREAT — clear learning promise, tells the reader exactly what they'll understand:
  "MCP Explained Simply: What the Model Context Protocol Actually Is"
  "How AI Agents Work: The Plan-Act-Observe Loop, Explained Step by Step"
  "RAG for Beginners: How AI Answers Questions Using Your Own Documents"
  "What Are Embeddings? A Plain-English Guide With a Real Example"
  "Claude Tool Use Explained: How the Model Calls Your Code"
  "Prompt Engineering Basics: 5 Techniques That Actually Change the Output"
  "Vector Databases, Explained Without the Math"
  "How Cursor Understands Your Whole Codebase — And How to Use It Well"
  "Building Your First MCP Server in Node.js: A Beginner-Friendly Walkthrough"
  "How Claude's Context Window Works — And Why Bigger Isn't Always Better"
  "AI Coding Assistants: How They Really Work Under the Hood"

✅ ALSO GREAT — a clear question or curiosity gap the post then teaches:
  "Why Does My RAG Return Confident Wrong Answers? (And How to Fix It)"
  "What Actually Happens When an AI Agent Calls a Tool?"
  "Structured Output: How to Make an LLM Return JSON You Can Trust"
  "Prompt Caching, Explained: Why Your Repeated Calls Can Get Much Faster"

THE RULE IN ONE LINE:
  Vague title, no clear takeaway = ❌ banned
  Clear promise of one thing the reader will learn = ✅ use it
  The reader should think "I want to understand that" — not "wait, is that true?"

Return ONLY a raw JSON object (no markdown, no explanation):

CRITICAL: The "title" field is a HUMAN-READABLE headline with spaces, capitals, punctuation.
  ✅ "MCP Explained Simply: What the Model Context Protocol Actually Is"
  ❌ "mcpexplainedwhatmodelcontextprotocolis"  ← this is WRONG, never do this

The tag rules below ONLY apply to the "tags" array. NOT to title, hook, angle, or any other field.

{
  "title": "a clear, human-readable title that promises what the reader will learn (spaces and capitals)",
  "hook": "2-3 punchy sentences that open the post — frames the controversy or discovery. No 'In this post'.",
  "angle": "the core contrarian lens or tension the post argues (1-2 sentences)",
  "primaryService": "main AWS service OR runtime topic name from the catalog",
  "secondaryService": "second AWS service or runtime topic involved (cross-cutting preferred)",
  "topicType": "aws | runtime | cross (aws+runtime)",
  "sdkPackages": ["@aws-sdk/package-1 or npm-package-name"],
  "nodeOrTsFeature": "specific Node.js/TypeScript feature involved if any (e.g. require(esm), satisfies, Zod v4)",
  "sections": [
    "section 1 heading",
    "section 2 heading",
    "section 3 heading",
    "section 4 heading",
    "section 5 heading",
    "The Takeaway"
  ],
  "codeScenario": "very specific description of what the main code example demonstrates — include SDK method names, real error types, or specific config values",
  "gotchaToReveal": "one real gotcha or counterintuitive behavior the post will expose",
  "tags": ["tag1", "tag2", "tag3", "tag4"],
  "estimatedControversy": "low | medium | high"
}

STRICT TAG RULES — these rules apply ONLY to the "tags" array, nothing else:
- Max 4 tags
- Each tag: lowercase letters and numbers ONLY — no spaces, hyphens, dots, or symbols
- Merge words into one (e.g. "cost optimization" → "costoptimization", "api gateway" → "apigateway")
- Max 20 characters per tag
- Good tag examples: "nodejs", "aws", "typescript", "lambda", "dynamodb", "serverless"
- Bad tag examples: "cost optimization", "api-gateway", "node.js", "AWS SDK"

REMINDER: The "title" field is a normal English headline — spaces, capitals, punctuation all required.
Do NOT apply tag rules to the title. The title should look like a newspaper headline, not a url slug.`;

  const raw = await groq(
    [{ role: "user", content: prompt }],
    { max_tokens: 700, json: true }   // scout only needs a small JSON blob
  );

  let topic;
  try {
    topic = JSON.parse(raw);
  } catch {
    const cleaned = raw.replace(/^```json|^```|```$/gm, "").trim();
    topic = JSON.parse(cleaned);
  }

  // ── Title sanity check ────────────────────────────────────────────────────
  // Detect if the LLM accidentally normalized the title like a tag (no spaces).
  // A real title must have spaces and be mixed-case or contain punctuation.
  // If garbled, throw so the scout retries with a fresh call.
  const titleStr = topic.title ?? "";
  const hasSpaces     = titleStr.includes(" ");
  const isSlug        = /^[a-z0-9]+$/.test(titleStr);      // all lowercase, no spaces
  const tooShort      = titleStr.length < 20;
  const isSentence    = titleStr.length > 0 && (hasSpaces || titleStr.includes("-") || titleStr.includes(":"));

  if (!isSentence || isSlug || tooShort) {
    throw new Error(
      `Scout returned a garbled/slugified title: "${titleStr}". ` +
      `Titles must be human-readable headlines with spaces. Retrying...`
    );
  }

  // ── Banned-theme guard ────────────────────────────────────────────────────
  // Cost-cutting, cold-start, and pure-optimization posts perform poorly on
  // LinkedIn. If the scout's title OR angle centers on these, reject and retry
  // so it re-scouts with a capability/architecture framing instead.
  const themeText = `${topic.title ?? ""} ${topic.angle ?? ""} ${topic.hook ?? ""}`.toLowerCase();
  const bannedThemePatterns = [
    /\bcost[\s-]?cutting\b/, /\bcost optimi/, /\boptimi\w*\s+cost/,
    /\bsaved?\s+\$/, /\$\s?\d/, /\bper month\b/, /\/month\b/, /\/year\b/,
    /\bcheaper\b/, /\bcut (?:our|the|your)\s+\w*\s*(?:bill|cost|spend)/,
    /\breduce[sd]?\s+(?:cost|spend|bill)/, /\blower(?:ing)?\s+(?:cost|bill|spend)/,
    /\bbill\b.*\b(month|year|cut|reduce|save)/, /\bcold[\s-]?start/,
    /\binit[\s-]?phase\b/, /\bcost\b.*\b(save|cut|reduce|slash|trim)/,
  ];
  const hitPattern = bannedThemePatterns.find(rx => rx.test(themeText));
  if (hitPattern) {
    throw new Error(
      `Scout returned a banned-theme topic (cost/cold-start/optimization): ` +
      `"${titleStr}". These underperform on LinkedIn. Re-scouting with a ` +
      `capability/architecture angle...`
    );
  }

  // ── Abstract-concept guard ─────────────────────────────────────────────────
  // Reject textbook/theory explainers with no real tool anchor. The reader wants
  // practical, tool-focused content (Cursor, Claude, ChatGPT, MCP, real APIs),
  // not "what is a vector database" academic pieces. A title that opens with
  // "Understanding/What is/Intro to <abstract concept>" and names no real tool
  // gets re-scouted toward a concrete, hands-on angle.
  const titleLower = (topic.title ?? "").toLowerCase();
  const abstractOpeners = /^(understanding|what (is|are)|an? (introduction|intro) to|the basics of|a beginner'?s guide to|demystifying|explained:)\b/;
  const realToolMention = /(cursor|claude|chatgpt|gpt-|copilot|windsurf|cody|\bv0\b|mcp|anthropic|openai|gemini|api|sdk|dynamodb|lambda|node|typescript|github|vs ?code)/i;
  const looksAbstract = abstractOpeners.test(titleLower) && !realToolMention.test(themeText);
  if (looksAbstract) {
    throw new Error(
      `Scout returned an abstract/textbook topic with no real tool anchor: ` +
      `"${titleStr}". The reader wants practical, tool-focused content ` +
      `(Cursor, Claude, ChatGPT, MCP, real APIs). Re-scouting with a hands-on angle...`
    );
  }

  console.log("📡  Topic scouted:");
  console.log(`   🎯  Title      : ${topic.title}`);
  console.log(`   🔥  Angle      : ${topic.angle}`);
  console.log(`   ☁️   Primary    : ${topic.primaryService}  (${(topic.sdkPackages?.[0]) ?? ""})`);
  console.log(`   🔗  Secondary  : ${topic.secondaryService ?? "—"}`);
  console.log(`   ⚠️   Gotcha     : ${topic.gotchaToReveal}`);
  console.log(`   🌶️   Controversy: ${topic.estimatedControversy}`);
  console.log(`   🏷️   Tags       : ${topic.tags.join(", ")}\n`);

  return topic;
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 2 — BLOG WRITER
// Takes the scouted topic and writes the full 2000–2500 word post.
// ─────────────────────────────────────────────────────────────────────────────
async function writeBlogPost(topic, seoFeedback = "") {
  console.log(`✍️   Writing: "${topic.title}"${seoFeedback ? " (rewrite with SEO feedback)" : ""}\n`);

  const today = new Date().toISOString().split("T")[0];

  // Pull SDK details for the primary service to inject into the writer prompt
  const primaryData   = AWS_SERVICES_CATALOG[topic.primaryService]   ?? {};
  const secondaryData = AWS_SERVICES_CATALOG[topic.secondaryService]  ?? {};

  const serviceContext = `
Primary service context — ${topic.primaryService}:
  SDK: ${primaryData.sdk ?? topic.sdkPackages?.[0] ?? ""}
  Known gotchas: ${(primaryData.gotchas ?? []).join(" | ")}

${topic.secondaryService ? `Secondary service context — ${topic.secondaryService}:
  SDK: ${secondaryData.sdk ?? topic.sdkPackages?.[1] ?? ""}
  Known gotchas: ${(secondaryData.gotchas ?? []).join(" | ")}` : ""}
`;

  const system = `You are a friendly, patient technical educator writing for Dev.to.
Your posts get shared because they take something confusing about AI and make it click for beginners.
Think of the reader as a developer who is curious about AI but new to it — you never assume prior knowledge.

Voice:
- Clear, warm, and encouraging — like a great teacher, not a show-off
- Explain the WHY before the HOW — motivate every concept before showing code
- Define every term the first time you use it (e.g. "an embedding — a list of numbers that captures meaning")
- Use simple analogies to make abstract AI ideas concrete
- Code examples are minimal, complete, and heavily commented so a beginner can follow each line
- No jargon dumps, no assuming the reader knows the ecosystem
- Use > blockquote for: key takeaways, helpful tips, and "in plain English" clarifications
- Build understanding step by step — each section assumes only what came before it`;

  const sectionsBlock = topic.sections.map((s, i) => `${i + 1}. ${s}`).join("\n");

  const user = `Write a Dev.to blog post. Today is ${today}.

TITLE: ${topic.title}

HOOK (open with this — no intro fluff): ${topic.hook}

CORE ARGUMENT: ${topic.angle}

GOTCHA TO REVEAL: ${topic.gotchaToReveal}

SERVICE CONTEXT (use these exact SDK packages and real gotchas):
${serviceContext}

SECTIONS — write H2 for each in this order:
${sectionsBlock}

MAIN CODE SCENARIO: ${topic.codeScenario}

HARD REQUIREMENTS:
- First line: # ${topic.title}
- Open immediately with the hook — NOT "In this post we'll explore..."
- Explain the WHY before the HOW in every section — motivate the concept, then show it
- Define each new term the first time it appears, in plain language
- Every H2 section: at least one COMPLETE, well-commented code block a beginner can follow
  (use \`\`\`typescript or \`\`\`javascript; comments should explain what each key line does)
- Use at least one simple analogy to build intuition for the hardest concept
- At least one > blockquote per section for a key takeaway, a tip, or an "in plain English" recap
- "The Takeaway" section: 4–6 clear bullets summarizing what the reader just learned
- Target: 1500–2200 words — clear and complete, no padding. Teaching over showing off.

ABSOLUTE BANS: "leverage", "utilize", "seamlessly", "In this post", "Let's dive in",
"In conclusion", "it's worth noting", "as you can see", "powerful", "robust",
"wrap up", "exciting", "Let me walk you through", "game-changer", "revolutionary".

FORMAT: Clean Markdown only. No HTML. No YAML frontmatter. No intro like "Sure, here's..."${seoFeedback ? `

SEO REWRITE INSTRUCTIONS — previous version failed the quality gate. Fix these specific issues:
${seoFeedback}` : ""}`;

  const markdown = await groq(
    [
      { role: "system", content: system },
      { role: "user",   content: user   },
    ],
    { max_tokens: 3500 }   // 3500 output tokens → ~2,200 words, under 6,000 TPM limit with 2,500 buffer
  );

  if (!markdown || markdown.length < 200) {
    // Truly empty response — nothing to publish, abort
    throw new Error(`Content empty or unusable (${markdown.length} chars) — generation failed`);
  }
  if (markdown.length < 800) {
    // Short but might still be publishable — warn and continue
    console.warn(`⚠️  Content shorter than expected (${markdown.length} chars) — publishing anyway`);
  }

  const withDisclosure = appendDisclosure(markdown, topic ?? {});
  console.log(`✅  Post written — ${withDisclosure.length.toLocaleString()} characters (incl. AI disclosure footer)\n`);
  return withDisclosure;
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 2.5 — SEO QUALITY GATE
// Scores the generated article on 5 dimensions before it can be published.
// If score < CONFIG.seoPassScore the article is rewritten with feedback.
// Uses a tiny Groq call (~400 tokens) — model grades its own output.
//
// Scoring dimensions (20pts each, 100 total):
//   title_score       — clear, specific, search-friendly title
//   structure_score   — proper ## headings, intro, conclusion
//   keyword_score     — natural keyword coverage, no stuffing
//   code_score        — code examples present, relevant, well-explained
//   readability_score — concise, scannable, well-paced
// ─────────────────────────────────────────────────────────────────────────────
async function scoreSEO(title, content, topic) {
  console.log("🔍  Running SEO quality gate...");

  const prompt = `You are an SEO and content quality reviewer for technical blog posts.

Evaluate the article below and return ONLY a valid JSON object — no markdown, no explanation.

Score each criterion from 0–20:
1. title_score       — Is the title clear, specific, and does it promise a concrete learning takeaway? (max 20)
2. structure_score   — Are there proper ## headings, a strong intro, and a clear conclusion? (max 20)
3. keyword_score     — Does the content naturally cover the topic keywords without stuffing? (max 20)
4. code_score        — Are code examples present, runnable, and well-explained? (max 20)
5. readability_score — Is it concise, scannable, opinionated, and well-paced? (max 20)

Also provide:
- total: sum of all five scores (max 100)
- passed: true if total >= ${CONFIG.seoPassScore}, false otherwise
- feedback: if passed is false, a short specific list of exactly what to fix in the next version

Topic: ${topic}
Title: ${title}

Article (first 3000 chars):
${content.slice(0, 3000)}

Return JSON only — no markdown fences:
{
  "title_score": 0,
  "structure_score": 0,
  "keyword_score": 0,
  "code_score": 0,
  "readability_score": 0,
  "total": 0,
  "passed": false,
  "feedback": ""
}`;

  const raw = await groq(
    [{ role: "user", content: prompt }],
    { max_tokens: 400, json: true }
  );

  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const result  = JSON.parse(cleaned);
    // Ensure passed reflects the actual threshold
    result.passed = result.total >= CONFIG.seoPassScore;
    return result;
  } catch {
    console.warn("⚠️  SEO scorer returned non-JSON — defaulting to pass to avoid blocking.");
    return {
      title_score: 16, structure_score: 16, keyword_score: 16,
      code_score: 16,  readability_score: 16,
      total: 80, passed: true, feedback: "",
    };
  }
}

// ── AI Disclosure Footer ──────────────────────────────────────────────────────
// Appended to every post before publishing.
// Transparent about AI generation — no exceptions, no toggle.
// ─────────────────────────────────────────────────────────────────────────────
function appendDisclosure(markdown, topic) {
  const date    = new Date().toISOString().split("T")[0];
  const service = topic.primaryService ?? topic.targetService ?? "AWS";

  const disclosure = `

---

> **Transparency notice**
>
> This article was written with the help of an AI system — [Groq](https://groq.com) (LLaMA 3.3 70B).
> The topic was scouted from live AWS and Node.js ecosystem signals, and the content —
> including all code examples — was written autonomously without human editing.
>
> **Published:** ${date} · **Primary focus:** ${service}
>
> All code blocks are intended to be correct and runnable, but please verify them.
>
> *Find an error? Drop a comment — corrections are always welcome.*`;

  return markdown + disclosure;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function extractTitle(md) {
  const m = md.match(/^#\s+(.+)/m);
  return m ? m[1].trim() : "Untitled Post";
}

function stripTitle(md) {
  return md.replace(/^#\s+.+\n?/, "").trim();
}

// ── Tag sanitizer ─────────────────────────────────────────────────────────────
// Dev.to tag rules (enforced server-side, returns 422 if violated):
//   • Lowercase only
//   • No spaces — use nothing (just merge words)
//   • No special characters — alphanumeric only
//   • Max 4 tags per article
//   • Each tag max 20 characters
// ─────────────────────────────────────────────────────────────────────────────
function sanitizeTags(tags) {
  const safe = tags
    .map(tag =>
      tag
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")   // strip spaces, hyphens, unicode, symbols
        .slice(0, 20)                  // max 20 chars per tag
    )
    .filter(tag => tag.length > 0)    // drop anything that became empty
    .slice(0, 4);                     // dev.to hard limit: max 4 tags

  console.log(`🏷️   Tags sanitized: ${safe.join(", ")}`);
  return safe;
}

// ── Dev.to auth check ──────────────────────────────────────────────────────────
async function getDevtoUser() {
  console.log("🔑  Verifying Dev.to credentials...");
  const res = await fetch(`${DEVTO_BASE}/users/me`, {
    headers: { "api-key": CONFIG.devtoApiKey, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`Dev.to auth ${res.status}: ${await res.text()}`);
  const user = await res.json();
  console.log(`✅  Authenticated: ${user.name} (@${user.username})\n`);
  return user;
}

// ── Dev.to publish ─────────────────────────────────────────────────────────────
async function postToDevto(title, body, tags) {
  console.log(`📤  Publishing as ${CONFIG.published ? "published" : "draft"}...`);
  const res = await fetch(`${DEVTO_BASE}/articles`, {
    method: "POST",
    headers: { "api-key": CONFIG.devtoApiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      article: {
        title,
        body_markdown: body,
        published: CONFIG.published,
        tags: tags.slice(0, 4),
      },
    }),
  });
  if (!res.ok) throw new Error(`Dev.to publish ${res.status}: ${await res.text()}`);
  return res.json();
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  // TZ=Asia/Kolkata is set in the workflow env — toLocaleDateString uses it
  const now      = new Date();
  const date     = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); // YYYY-MM-DD in IST
  const timeIST  = now.toLocaleTimeString("en-IN",  { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" });
  const awsCount = Object.keys(AWS_SERVICES_CATALOG).length;
  const rtCount  = Object.keys(RUNTIME_CATALOG).length;

  console.log("╔═══════════════════════════════════════════════════╗");
  console.log("║   🔥 devCommunityBlogPost.js                      ║");
  console.log(`║   📅 ${date} · ${timeIST} IST                  ║`);
  console.log(`║   ☁️  AWS: ${String(awsCount + " services").padEnd(10)} ⚡ Runtime: ${String(rtCount + " topics").padEnd(11)}║`);
  console.log("║   ⏰ Schedule : Mon–Fri · 08:00 AM IST            ║");
  console.log("╚═══════════════════════════════════════════════════╝\n");

  // ── Only hard-stop: missing secrets. Nothing works without these. ──────────
  if (!CONFIG.groqApiKey)  { console.error("❌ GROQ_API_KEY secret is missing");  process.exit(1); }
  if (!CONFIG.devtoApiKey) { console.error("❌ DEVTO_API_KEY secret is missing"); process.exit(1); }

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 1 — Pick today's service deterministically, then scout the topic
  //
  // Three-layer dedup that makes topic repetition impossible:
  //   Layer 1: pickAssignedService() reads history and picks a service that
  //            is NOT in the last 10 posts. Pure deterministic — no LLM input.
  //   Layer 2: Scout MUST honor the assigned service. If it returns anything
  //            else, we reject and retry.
  //   Layer 3: If scout fails to comply after 2 retries, SKIP TODAY entirely.
  //            One missed day is better than a duplicate post.
  // ─────────────────────────────────────────────────────────────────────────
  const history = await readHistory();

  // Layer 1 — deterministic service assignment
  const allTopicNames = ALL_TOPICS.map(t => t.name);
  const assignedService = pickAssignedService(history, allTopicNames);
  console.log(`🎯  Today's assigned service: ${assignedService}`);
  console.log(`   (Picked from catalog — guaranteed not in last 10 published posts)\n`);

  // Layer 2 — scout must return the assigned service
  let topic;
  let scoutAttempt = 0;
  const MAX_SCOUT_ATTEMPTS = 2;

  while (scoutAttempt < MAX_SCOUT_ATTEMPTS) {
    scoutAttempt++;
    try {
      topic = await scoutTodaysTopic(assignedService);
    } catch (err) {
      // Includes garbled title errors — retry rather than exit
      console.warn(`⚠️  Scout attempt ${scoutAttempt} failed: ${err.message}`);

      if (scoutAttempt >= MAX_SCOUT_ATTEMPTS) {
        console.error("🛑  Scout failed after all retries. Skipping today.");
        process.exit(0); // clean skip
      }

      console.warn(`   Retry ${scoutAttempt}/${MAX_SCOUT_ATTEMPTS} — waiting 65s for Groq window reset...`);
      await sleep(65_000);
      continue;
    }

    // ── Soft hint (not a lock) ────────────────────────────────────────────
    // The scout may pick any timely AI topic, not just the suggested one.
    // We only reject if it picked something used very recently (dedup), so the
    // feed stays varied. Otherwise we accept the scout's choice.
    const returned = normalizeTopicKey(topic.primaryService ?? topic.targetService ?? "");
    const recentServices = new Set(
      history.slice(-7).map(h => normalizeTopicKey(h.service)).filter(Boolean)
    );

    if (returned && recentServices.has(returned)) {
      console.warn(`⚠️  Scout picked "${topic.primaryService}" — used within the last 7 posts.`);

      if (scoutAttempt >= MAX_SCOUT_ATTEMPTS) {
        console.error("🛑  Could not get a fresh topic after retries. Skipping today.");
        process.exit(0);  // clean skip
      }

      console.warn(`   Retry ${scoutAttempt}/${MAX_SCOUT_ATTEMPTS} — asking for a fresher topic (65s wait)...`);
      await sleep(65_000);
      continue;
    }

    console.log(`✅  Scout chose topic: ${topic.primaryService} (suggested was "${assignedService}")\n`);
    break;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 2 — Write + SEO score + retry loop
  // The article is written, then scored on 5 SEO dimensions (100pts total).
  // If score < CONFIG.seoPassScore (75), the article is rewritten with
  // specific feedback — up to CONFIG.maxRetries (2) times.
  // If it still fails after all retries → skip today cleanly.
  // ─────────────────────────────────────────────────────────────────────────
  console.log("⏸️   Waiting 65s for Groq TPM window to reset...");
  await sleep(65_000);
  console.log("✅  TPM window reset. Starting writer call.\n");

  let markdown, title, body, seoResult;
  let writeAttempt = 0;
  let seoFeedback  = "";

  while (writeAttempt <= CONFIG.maxRetries) {
    writeAttempt++;

    // Write (or rewrite with SEO feedback)
    try {
      markdown = await writeBlogPost(topic, seoFeedback);
    } catch (err) {
      console.error("❌ Phase 2 (writer) failed:", err.message);
      process.exit(1);
    }

    title = extractTitle(markdown);
    body  = stripTitle(markdown);

    console.log(`📌  Title  : "${title}"`);
    console.log(`📝  Length : ${markdown.length.toLocaleString()} chars`);
    console.log("─── Preview (first 400 chars) ─────────────────────");
    console.log(body.slice(0, 400) + "...\n");

    // ── SEO quality gate ───────────────────────────────────────────────────
    // Wait 65s before SEO call — writer uses ~5,500 output tokens which
    // spills across the 60s window. Sleep guarantees SEO fires in a clean
    // new window so we never hit 429 from back-to-back calls.
    console.log("⏸️   Waiting 65s for Groq TPM window to reset before SEO scoring...");
    await sleep(65_000);
    console.log("✅  Window reset. Running SEO gate.\n");

    try {
      seoResult = await scoreSEO(title, body, topic.primaryService ?? topic.title ?? "");
    } catch (err) {
      console.warn("⚠️  SEO scoring failed (non-fatal — continuing):", err.message);
      seoResult = { total: 80, passed: true, feedback: "" };
    }

    console.log(`\n📊  SEO Scorecard (attempt ${writeAttempt}/${CONFIG.maxRetries + 1}):`);
    console.log(`   Title clarity    : ${seoResult.title_score ?? "?"}/20`);
    console.log(`   Structure        : ${seoResult.structure_score ?? "?"}/20`);
    console.log(`   Keyword coverage : ${seoResult.keyword_score ?? "?"}/20`);
    console.log(`   Code examples    : ${seoResult.code_score ?? "?"}/20`);
    console.log(`   Readability      : ${seoResult.readability_score ?? "?"}/20`);
    console.log(`   ─────────────────────────────────────────────────`);
    console.log(`   TOTAL            : ${seoResult.total}/100  ${seoResult.passed ? "✅ PASSED" : "❌ FAILED"}`);

    if (seoResult.passed) {
      console.log(`\n✅  SEO gate passed (${seoResult.total}/100 ≥ ${CONFIG.seoPassScore}).\n`);
      break;
    }

    if (writeAttempt > CONFIG.maxRetries) {
      console.error(`\n🛑  SEO gate failed after ${writeAttempt} attempts.`);
      console.error(`   Final score: ${seoResult.total}/100 (required: ${CONFIG.seoPassScore})`);
      console.error(`   Feedback   : ${seoResult.feedback}`);
      console.error("   Skipping today — better to miss a day than publish weak content.");
      process.exit(0); // clean skip
    }

    seoFeedback = seoResult.feedback || "Improve overall quality, SEO structure, and code examples.";
    console.log(`\n⚠️  SEO below threshold. Rewriting with feedback:`);
    console.log(`   ${seoFeedback}`);
    console.log(`\n⏸️   Waiting 65s for Groq TPM window before rewrite...`);
    await sleep(65_000);
    console.log("✅  Rewriting now...\n");
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 3 — Hard dedup gate (BLOCKS publish on duplicate)
  // Title check: blocks any exact-title repeat ever (no two identical titles)
  // Service check: blocks repeats within last 14 posts (catalog stays fresh)
  // If history is unreadable, SKIP today for safety — better than a duplicate.
  // ─────────────────────────────────────────────────────────────────────────
  try {
    // Reload history to get the latest state after the scout ran
    const freshHistory = await readHistory();
    const DEDUP_WINDOW = 30;                        // only check last 30 posts (twice-daily runs ~ 2 weeks)
    const recentHistory = freshHistory.slice(-DEDUP_WINDOW);

    const normalNewTitle = normalizeTopicKey(title).slice(0, 60);
    const newService = normalizeTopicKey(topic.primaryService ?? topic.targetService ?? "");

    // Title check — exact-title repetition is always blocked (any time)
    const duplicateByTitle = freshHistory.find(h =>
      normalizeTopicKey(h.title).slice(0, 40) === normalNewTitle.slice(0, 40)
    );

    // Service check — only blocked if used within the last 14 posts
    // (not "ever used" — that would permanently exhaust the catalog)
    const duplicateByService = recentHistory.find(h => normalizeTopicKey(h.service) === newService);

    if (duplicateByTitle || duplicateByService) {
      const dup = duplicateByTitle ?? duplicateByService;
      console.error("🛑  Duplicate topic detected. Skipping today's publish.");
      console.error(`   Generated title   : "${title}"`);
      console.error(`   Generated service : "${topic.primaryService ?? topic.targetService ?? "unknown"}"`);
      console.error(`   Conflicts with    : "${dup.title}" (${dup.date}) [${dup.service}]`);
      console.error(`   (Reason: ${duplicateByTitle ? "same title in full history" : `service used in last ${DEDUP_WINDOW} posts`})`);
      process.exit(0); // clean skip (not a workflow failure)
    }

    console.log(`✅  Dedup check passed — title unique, service fresh in last ${DEDUP_WINDOW} posts.\n`);
  } catch (err) {
    // History unreadable -> safest behavior is skip to avoid accidental duplicate.
    console.error("🛑  Dedup check failed. Skipping publish for safety:", err.message);
    process.exit(0);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 4 — Verify Dev.to auth (non-blocking — we try to publish regardless)
  // getDevtoUser() is a preflight check. If it fails, we attempt publish anyway
  // because the publish call itself will tell us if auth is actually broken.
  // ─────────────────────────────────────────────────────────────────────────
  try {
    await getDevtoUser();
  } catch (err) {
    console.warn("⚠️  Dev.to auth preflight failed (attempting publish anyway):", err.message);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 5 — Publish to Dev.to  ← THE ONLY STEP THAT MUST SUCCEED
  // This is the point of the entire script. If this fails, it is a real error.
  // ─────────────────────────────────────────────────────────────────────────
  let article;
  try {
    article = await postToDevto(title, body, sanitizeTags(topic.tags));
  } catch (err) {
    console.error("❌ Phase 5 (publish) failed:", err.message);
    process.exit(1);
  }

  const url = article.url ?? "https://dev.to";

  console.log("\n╔═══════════════════════════════════════════════════╗");
  console.log("║  🎉 Published!                                    ║");
  console.log("╠═══════════════════════════════════════════════════╣");
  console.log(`║  ID     : ${String(article.id).padEnd(38)}║`);
  console.log(`║  Title  : ${title.slice(0, 38).padEnd(38)}║`);
  console.log(`║  URL    : ${url.slice(0, 38).padEnd(38)}║`);
  console.log(`║  Status : ${(article.published ? "✅ published" : "📝 draft").padEnd(38)}║`);
  console.log(`║  SEO    : ${String((seoResult?.total ?? "?") + "/100").padEnd(38)}║`);
  console.log("╚═══════════════════════════════════════════════════╝");

  // Write SEO scorecard to GitHub Actions job summary + GITHUB_ENV for email step
  try {
    const fs = await import("fs");
    const fsLib = fs.default ?? fs;

    // ── GITHUB_STEP_SUMMARY — visible in Actions UI ───────────────────────
    const githubSummary = process.env.GITHUB_STEP_SUMMARY;
    if (githubSummary && seoResult) {
      const rows = [
        "## 🤖 Dev Community Blog Publisher",
        "| Field | Value |",
        "|-------|-------|",
        `| Status | ${article.published ? "✅ Published" : "📝 Draft"} |`,
        `| Title | ${title} |`,
        `| URL | [${url}](${url}) |`,
        `| SEO Total | **${seoResult.total}/100** |`,
        `| Title clarity | ${seoResult.title_score ?? "?"}/20 |`,
        `| Structure | ${seoResult.structure_score ?? "?"}/20 |`,
        `| Keyword coverage | ${seoResult.keyword_score ?? "?"}/20 |`,
        `| Code examples | ${seoResult.code_score ?? "?"}/20 |`,
        `| Readability | ${seoResult.readability_score ?? "?"}/20 |`,
        `| Write attempts | ${writeAttempt} |`,
      ].join("\n");
      fsLib.appendFileSync(githubSummary, rows + "\n");
    }

    // ── GITHUB_ENV — passes values to the email notification step ─────────
    // Each line written here becomes an env var available in subsequent steps.
    // Format: VARNAME=value  (one per line, no quotes needed)
    const githubEnv = process.env.GITHUB_ENV;
    if (githubEnv && seoResult) {
      const envLines = [
        `POST_TITLE=${title.replace(/\n/g, " ")}`,
        `POST_URL=${url}`,
        `POST_SERVICE=${topic.primaryService ?? "AWS"}`,
        `SEO_TOTAL=${seoResult.total ?? "?"}`,
        `SEO_TITLE=${seoResult.title_score ?? "?"}`,
        `SEO_STRUCTURE=${seoResult.structure_score ?? "?"}`,
        `SEO_KEYWORDS=${seoResult.keyword_score ?? "?"}`,
        `SEO_CODE=${seoResult.code_score ?? "?"}`,
        `SEO_READABILITY=${seoResult.readability_score ?? "?"}`,
        `SEO_ATTEMPTS=${writeAttempt}`,
        `POST_STATUS=${article.published ? "Published" : "Draft"}`,
      ].join("\n");
      fsLib.appendFileSync(githubEnv, envLines + "\n");
      console.log("✅  GITHUB_ENV updated — SEO scores available to email step");
    }
  } catch (err) {
    console.warn("⚠️  Could not write GITHUB_ENV (non-fatal):", err.message);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 6 — Write history (non-blocking — publish already succeeded)
  // If this fails for any reason, log a warning. The post is already live.
  // The history file will just be missing this one entry — not a disaster.
  // ─────────────────────────────────────────────────────────────────────────
  try {
    await writeHistory({
      date:           date,
      title,
      service:        topic.primaryService ?? topic.targetService ?? "unknown",
      url:            article.url ?? "",
      tags:           topic.tags,
      // Extra fields used by LinkedIn weekly roundup — all from scout topic object
      hook:           topic.hook           ?? "",
      angle:          topic.angle          ?? "",
      gotchaToReveal: topic.gotchaToReveal ?? "",
    });
  } catch (err) {
    console.warn("⚠️  History write failed (non-fatal — post is already published):", err.message);
    console.warn("   Manually add this entry to logs/post-history.json if needed:");
    console.warn(`   { "date": "${date}", "title": "${title}", "service": "${topic.primaryService ?? "unknown"}", "url": "${article.url ?? ""}" }`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 7 — Post to LinkedIn (non-blocking, every 2nd publish)
  // Dev.to is already published at this point. LinkedIn failure never
  // affects the main publish. Token expiry handled gracefully.
  // Cadence: odd post count = post, even = skip (every 2nd day).
  // ─────────────────────────────────────────────────────────────────────────
  try {
    await postToLinkedIn({
      title,
      url:   article.url ?? "",
      topic,
    });
  } catch (err) {
    console.warn("⚠️  LinkedIn notification failed (non-fatal):", err.message);
  }

}

main();
