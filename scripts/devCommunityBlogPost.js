// ─── CONFIG ────────────────────────────────────────────────────────────────────
// Only two values needed — both come from GitHub Encrypted Secrets.
// Runs every weekday (Mon–Fri) at 10:00 AM IST via GitHub Actions cron.
// No modes, no manual inputs, no dry-run flags — just publish every weekday.
//
//   GROQ_API_KEY   → from GitHub Encrypted Secret (https://console.groq.com)
//   DEVTO_API_KEY  → from GitHub Encrypted Secret (https://dev.to/settings/extensions)
// ───────────────────────────────────────────────────────────────────────────────
const CONFIG = {
  groqApiKey:  process.env.GROQ_API_KEY  || "",
  devtoApiKey: process.env.DEVTO_API_KEY || "",
  published:   true,
};
// ───────────────────────────────────────────────────────────────────────────────

const GROQ_URL   = "https://api.groq.com/openai/v1/chat/completions";
const DEVTO_BASE = "https://dev.to/api";

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
// Build the scout's ecosystem pulse dynamically from the catalog above.
// Each run picks a weighted-random sample of services to feature so the
// scout sees variety and cross-service angles, not the same 5 services daily.
// ─────────────────────────────────────────────────────────────────────────────
function buildEcosystemPulse(today) {
  const allServices = Object.entries(AWS_SERVICES_CATALOG);

  // Seed the shuffle with today's date so the same day always gets the same mix
  // but different days get different mixes — deterministic but varied.
  const dateSeed = parseInt(today.replace(/-/g, ""), 10);
  const shuffled = [...allServices].sort((a, b) => {
    const ha = Math.sin(dateSeed * a[0].charCodeAt(0)) * 10000;
    const hb = Math.sin(dateSeed * b[0].charCodeAt(0)) * 10000;
    return (ha - Math.floor(ha)) - (hb - Math.floor(hb));
  });

  // Feature 6 services prominently + list the rest as background signals
  const featured   = shuffled.slice(0, 6);
  const background = shuffled.slice(6).map(([name]) => name);

  let pulse = `AWS Services Ecosystem Pulse — ${today}\n\n`;
  pulse += `FEATURED SERVICES (high-signal, ripe for posts today):\n`;

  for (const [name, data] of featured) {
    pulse += `\n【 ${name} 】  SDK: ${data.sdk}\n`;
    pulse += `  Hot signals:\n`;
    data.signals.forEach(s => { pulse += `    • ${s}\n`; });
    pulse += `  Real gotchas:\n`;
    data.gotchas.slice(0, 3).forEach(g => { pulse += `    ⚠ ${g}\n`; });
    pulse += `  Spicy angle ideas:\n`;
    data.spicyAngles.forEach(a => { pulse += `    🔥 ${a}\n`; });
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
async function scoutTodaysTopic() {
  console.log("🔍  Scouting today's topic from AWS services catalog...\n");

  const today = new Date().toISOString().split("T")[0];
  const pulse  = buildEcosystemPulse(today);

  const modeInstructions = `Generate ONE focused technical post — spicy, specific, trending angle.`;

  const runtimePulse = `
Node.js Runtime signals:
- Node.js 22 LTS: require(esm) stable, native fetch GA, --experimental-strip-types
- ts-node / tsx disrupted by Node's native TypeScript stripping
- Built-in node:test runner killing Jest in greenfield projects
- Bun 1.x Lambda custom runtime benchmarks embarrassing native Node
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

You are a technical content strategist who tracks GitHub Trending, AWS What's New, 
Hacker News, and dev Twitter/X every single morning. You have access to today's 
AWS ecosystem pulse and Node.js/TypeScript signals below.

${pulse}

${runtimePulse}

${modeInstructions}

Based on the signals above and the mode instructions, create the blog topic. Requirements:

1. TIMELY — feels triggered by something real happening THIS week in the ecosystem
2. SPICY — has a contrarian, surprising, or dramatic angle. Developer drama is fine.
3. SPECIFIC — references real SDK packages, real service names, real error messages
4. CROSS-SERVICE — ideally involves 2 AWS services interacting (the interesting bugs live there)
5. SCROLL-STOPPING TITLE — a developer mid-scroll thinks "wait, is that true?"

FORBIDDEN title patterns — never generate these:
❌ "Mastering X" | "A Complete Guide to X" | "Introduction to X"  
❌ "Getting Started with X" | "Best Practices for X" | "Understanding X"
❌ "Deep Dive into X" | "Everything You Need to Know About X" | "How to use X"

REQUIRED title patterns — must feel like one of these:
✅ "We Migrated 47 Lambdas to Node.js 22 — Here's What Nobody Warned Us"
✅ "Stop Paying $800/month for CloudWatch Logs — The Fix Is 4 Lines of CDK"
✅ "AWS SDK v3 Tree-Shaking Lied to Me. Here's the Proof."
✅ "The EventBridge Pipes Feature That Eliminated 4 of Our Lambda Functions"
✅ "DynamoDB Single-Table Design Broke Our Team After 18 Months"
✅ "Bun on Lambda Is Faster Than Node.js 22 — Is That Enough to Switch?"
✅ "Secrets Manager Is Costing You $960/year Without You Realizing It"
✅ "Aurora Serverless v2 Scale-to-Zero Finally Works. We Tested It for 30 Days."
✅ "SQS Partial Batch Failure: The Default That Silently Drops Your Messages"
✅ "TypeScript satisfies + AWS SDK v3: The Pattern That Changed How We Write Commands"

Return ONLY a raw JSON object (no markdown, no explanation):

{
  "title": "the scroll-stopping blog title",
  "hook": "2-3 punchy sentences that open the post — frames the controversy or discovery. No 'In this post'.",
  "angle": "the core contrarian lens or tension the post argues (1-2 sentences)",
  "primaryService": "main AWS service name from the catalog",
  "secondaryService": "second AWS service involved (cross-service angle preferred)",
  "sdkPackages": ["@aws-sdk/package-1", "@aws-sdk/package-2"],
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

STRICT TAG RULES — Dev.to will reject the post with a 422 error if violated:
- Max 4 tags
- Each tag: lowercase letters and numbers ONLY
- No spaces — merge words into one (e.g. "cost optimization" → "costoptimization", "api gateway" → "apigateway")
- No hyphens, underscores, dots, or any special characters
- Max 20 characters per tag
- Good examples: "nodejs", "aws", "typescript", "lambda", "dynamodb", "serverless", "devops", "javascript", "cloudwatch", "s3"
- Bad examples: "cost optimization", "api-gateway", "node.js", "AWS SDK", "best-practices"`;

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
async function writeBlogPost(topic) {
  console.log(`✍️   Writing: "${topic.title}"\n`);

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

  const system = `You are a senior software engineer at a fast-growing startup, writing for Dev.to.
Your posts get thousands of reactions because they're honest, specific, and full of code that actually runs.

Voice:
- Direct, confident, opinionated — you have takes and you defend them with data
- Technically precise, never corporate or buzzwordy  
- You've been burned by the exact gotcha you're writing about — that experience shows
- Code examples compile and run — no "// your implementation here", no pseudo-code
- You use > blockquote for: spicy warnings, counterintuitive facts, "I wish I'd known this"
- When you say "it depends" you immediately say WHAT it depends on with numbers`;

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
- Every H2 section: at least one COMPLETE, RUNNABLE \`\`\`typescript\`\`\` code block
- Use exact SDK v3 imports: import { Command } from '${topic.sdkPackages?.[0] ?? "@aws-sdk/..."}' 
- At least one > blockquote callout per section (warning, tip, or spicy take)
- Include at least 2 real AWS error messages or gotchas with exact error text
- "The Takeaway" section: 4–6 opinionated bullets — specific, no fluff
- Real console output or benchmark numbers where relevant (make them realistic)
- Target: 2000–2500 words — dense, no padding

ABSOLUTE BANS: "leverage", "utilize", "seamlessly", "In this post", "Let's dive in",
"In conclusion", "it's worth noting", "as you can see", "powerful", "robust",
"wrap up", "exciting", "Let me walk you through".

FORMAT: Clean Markdown only. No HTML. No YAML frontmatter. No intro like "Sure, here's..."`;

  const markdown = await groq(
    [
      { role: "system", content: system },
      { role: "user",   content: user   },
    ],
    { max_tokens: 7500 }   // 7500 + ~600 scout = ~8100 total, safely under 12,000 TPM
  );

  if (!markdown || markdown.length < 800) {
    throw new Error(`Content too short (${markdown.length} chars) — generation failed`);
  }

  const withDisclosure = appendDisclosure(markdown, topic ?? {});
  console.log(`✅  Post written — ${withDisclosure.length.toLocaleString()} characters (incl. AI disclosure footer)\n`);
  return withDisclosure;
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
> This article was generated by an AI system using [Groq](https://groq.com) (LLaMA 3.3 70B).
> The topic was scouted from live AWS and Node.js ecosystem signals, and the content —
> including all code examples — was written autonomously without human editing.
>
> **Published:** ${date} · **Primary focus:** ${service}
>
> All code blocks are intended to be correct and runnable, but please verify them
> against the official [AWS SDK v3 docs](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/)
> before using in production.
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
  const date     = new Date().toISOString().split("T")[0];
  const services = Object.keys(AWS_SERVICES_CATALOG).length;

  console.log("╔═══════════════════════════════════════════════════╗");
  console.log("║   🔥 devCommunityBlogPost.js                      ║");
  console.log(`║   📅 ${date}                              ║`);
  console.log(`║   ☁️  Catalog : ${String(services + " AWS services").padEnd(32)}║`);
  console.log("║   ⏰ Schedule: Mon–Fri · 10:00 AM IST             ║");
  console.log("╚═══════════════════════════════════════════════════╝\n");

  if (!CONFIG.groqApiKey)  throw new Error("❌ GROQ_API_KEY secret is missing");
  if (!CONFIG.devtoApiKey) throw new Error("❌ DEVTO_API_KEY secret is missing");

  try {
    // Phase 1 — Scout a fresh, spicy, AWS-services-grounded topic
    const topic = await scoutTodaysTopic();

    // Phase 2 — Wait 65s so Groq TPM window fully resets between scout and writer.
    // Scout used ~600-800 tokens. Writer needs ~7500. Together > 12,000 TPM limit
    // if fired back-to-back. 65s guarantees a clean window — costs one extra minute.
    console.log("⏸️   Waiting 65s for Groq TPM window to reset before writer call...");
    await sleep(65_000);
    console.log("✅  TPM window reset. Starting writer call.\n");

    // Phase 2 — Write the full post
    const markdown = await writeBlogPost(topic);
    const title    = extractTitle(markdown);
    const body     = stripTitle(markdown);

    console.log(`📌  Final title: "${title}"`);
    console.log("─── Preview (first 400 chars) ─────────────────────");
    console.log(body.slice(0, 400) + "...\n");

    // Phase 3 — Verify Dev.to auth
    await getDevtoUser();

    // Phase 4 — Publish
    const article = await postToDevto(title, body, sanitizeTags(topic.tags));
    const url = article.url ?? "https://dev.to";

    console.log("\n╔═══════════════════════════════════════════════════╗");
    console.log("║  🎉 Published!                                    ║");
    console.log("╠═══════════════════════════════════════════════════╣");
    console.log(`║  ID     : ${String(article.id).padEnd(38)}║`);
    console.log(`║  Title  : ${title.slice(0, 38).padEnd(38)}║`);
    console.log(`║  URL    : ${url.slice(0, 38).padEnd(38)}║`);
    console.log(`║  Status : ${(article.published ? "✅ published" : "📝 draft").padEnd(38)}║`);
    console.log("╚═══════════════════════════════════════════════════╝");

  } catch (err) {
    console.error("\n❌  Fatal:", err.message);
    process.exit(1);
  }
}

main();
