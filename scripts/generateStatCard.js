// ─── generateStatCard.js ──────────────────────────────────────────────────────
// Generates a 1200x628px LinkedIn stat card as PNG using ImageMagick.
// ImageMagick (convert) is pre-installed on ubuntu-latest GitHub Actions runners.
// Zero npm dependencies — uses only Node.js built-ins + ImageMagick CLI.
//
// Card layout:
//   - Colored background (picks color based on service type)
//   - Gold left border accent
//   - Service/category tag line
//   - Article title (large, bold)
//   - 2-3 stat boxes pulled from topic data (numbers from gotcha/scenario/hook)
//   - Footer with dev.to attribution
// ─────────────────────────────────────────────────────────────────────────────

import { execSync, spawnSync } from "child_process";
import { writeFileSync, unlinkSync, existsSync } from "fs";
import { tmpdir }  from "os";
import { join }    from "path";

// ── Color palette per service type ───────────────────────────────────────────
const SERVICE_COLORS = {
  // AWS Compute
  Lambda:        { bg1: "#0A66C2", bg2: "#0847A0", accent: "#FFD700" },
  ECS:           { bg1: "#1D9E75", bg2: "#0F6E56", accent: "#FFD700" },
  AppRunner:     { bg1: "#1D9E75", bg2: "#0F6E56", accent: "#FFD700" },
  // AWS Storage
  S3:            { bg1: "#D85A30", bg2: "#993C1D", accent: "#FFD700" },
  DynamoDB:      { bg1: "#0A66C2", bg2: "#0847A0", accent: "#FFD700" },
  RDS:           { bg1: "#533AB7", bg2: "#3C3489", accent: "#FFD700" },
  ElastiCache:   { bg1: "#D85A30", bg2: "#993C1D", accent: "#FFD700" },
  // AWS Messaging
  SQS:           { bg1: "#1D9E75", bg2: "#0F6E56", accent: "#FFD700" },
  SNS:           { bg1: "#1D9E75", bg2: "#0F6E56", accent: "#FFD700" },
  EventBridge:   { bg1: "#533AB7", bg2: "#3C3489", accent: "#FFD700" },
  Scheduler:     { bg1: "#533AB7", bg2: "#3C3489", accent: "#FFD700" },
  // AWS API & Network
  APIGateway:    { bg1: "#0A66C2", bg2: "#0847A0", accent: "#FFD700" },
  CloudFront:    { bg1: "#D85A30", bg2: "#993C1D", accent: "#FFD700" },
  VPC:           { bg1: "#533AB7", bg2: "#3C3489", accent: "#FFD700" },
  // AWS AI
  Bedrock:       { bg1: "#0847A0", bg2: "#042C53", accent: "#FFD700" },
  // AWS Observability
  CloudWatch:    { bg1: "#0A66C2", bg2: "#0847A0", accent: "#FFD700" },
  XRay:          { bg1: "#533AB7", bg2: "#3C3489", accent: "#FFD700" },
  // AWS Security
  SecretsManager:{ bg1: "#D85A30", bg2: "#993C1D", accent: "#FFD700" },
  IAM:           { bg1: "#D85A30", bg2: "#993C1D", accent: "#FFD700" },
  // AWS DevTools
  CDK:           { bg1: "#0A66C2", bg2: "#0847A0", accent: "#FFD700" },
  CodeBuild:     { bg1: "#1D9E75", bg2: "#0F6E56", accent: "#FFD700" },
  // AWS Workflow
  StepFunctions: { bg1: "#533AB7", bg2: "#3C3489", accent: "#FFD700" },
  Kinesis:       { bg1: "#0A66C2", bg2: "#0847A0", accent: "#FFD700" },
  Athena:        { bg1: "#1D9E75", bg2: "#0F6E56", accent: "#FFD700" },
  // Runtime
  NodeJS22:           { bg1: "#27500A", bg2: "#173404", accent: "#FFD700" },
  NodeJSPerformance:  { bg1: "#27500A", bg2: "#173404", accent: "#FFD700" },
  NodeJSTesting:      { bg1: "#27500A", bg2: "#173404", accent: "#FFD700" },
  TypeScript55:       { bg1: "#0847A0", bg2: "#042C53", accent: "#FFD700" },
  TypeScriptPatterns: { bg1: "#0847A0", bg2: "#042C53", accent: "#FFD700" },
  TypeScriptBuild:    { bg1: "#0847A0", bg2: "#042C53", accent: "#FFD700" },
  JavaScriptPatterns: { bg1: "#633806", bg2: "#412402", accent: "#FFD700" },
  PackageEcosystem:   { bg1: "#27500A", bg2: "#173404", accent: "#FFD700" },
  NodeJSFrameworks:   { bg1: "#27500A", bg2: "#173404", accent: "#FFD700" },
};

const DEFAULT_COLOR = { bg1: "#0A66C2", bg2: "#0847A0", accent: "#FFD700" };

// ── Extract stats from topic data ─────────────────────────────────────────────
// Pulls numbers from gotcha, scenario, hook, angle — real data from the article.
// Returns array of { value, label } — max 3 stats.
function extractStats(topic) {
  const stats = [];

  // Pattern: find "$X", "Xms", "X%", "Nx", "X min", "X sec", "X days"
  const numberPattern = /(\$[\d,.]+[k]?|[\d,.]+\s*(?:ms|%|x|min|sec|days|hours|KB|MB|GB|TB|lines?|services?|functions?|requests?|tokens?))/gi;

  const sources = [
    topic.gotchaToReveal ?? "",
    topic.codeScenario   ?? "",
    topic.hook           ?? "",
    topic.angle          ?? "",
  ];

  for (const source of sources) {
    const matches = source.match(numberPattern) ?? [];
    for (const match of matches) {
      if (stats.length >= 3) break;
      // Find the surrounding context (up to 4 words before or after)
      const idx    = source.indexOf(match);
      const before = source.slice(Math.max(0, idx - 30), idx).split(/\s+/).slice(-3).join(" ");
      const after  = source.slice(idx + match.length, idx + match.length + 30).split(/\s+/).slice(0, 4).join(" ");
      const label  = (after || before).replace(/[^a-zA-Z0-9 /]/g, "").trim().slice(0, 20);
      if (label && !stats.find(s => s.value === match)) {
        stats.push({ value: match.trim(), label: label || "stat" });
      }
    }
    if (stats.length >= 3) break;
  }

  // Fallback stats if none found
  if (stats.length === 0) {
    stats.push(
      { value: "5 min", label: "read time"    },
      { value: "100%", label: "code examples" },
    );
  } else if (stats.length === 1) {
    stats.push({ value: "5 min", label: "read time" });
  }

  return stats.slice(0, 3);
}

// ── Wrap text into lines ──────────────────────────────────────────────────────
function wrapTitle(title, maxCharsPerLine = 38) {
  const words = title.split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > maxCharsPerLine) {
      if (current) lines.push(current.trim());
      current = word;
    } else {
      current = (current + " " + word).trim();
    }
    if (lines.length >= 2) { current = ""; break; }
  }
  if (current && lines.length < 2) lines.push(current.trim());
  return lines.slice(0, 2);
}

// ── Build service tag label ───────────────────────────────────────────────────
function buildTagLine(topic) {
  const parts = [
    topic.primaryService   ? topic.primaryService.toUpperCase()   : null,
    topic.secondaryService ? topic.secondaryService.toUpperCase() : null,
    "NODE.JS",
  ].filter(Boolean);
  return parts.slice(0, 3).join("  ·  ").slice(0, 60);
}

// ── Escape text for ImageMagick annotate ─────────────────────────────────────
function esc(str) {
  return String(str)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/`/g, "\\`")
    .replace(/\$/g, "\\$")
    .replace(/!/g, "\\!")
    .slice(0, 120);
}

// ── Check ImageMagick availability ───────────────────────────────────────────
function isImageMagickAvailable() {
  try {
    const r = spawnSync("convert", ["--version"], { encoding: "utf8" });
    return r.status === 0;
  } catch {
    return false;
  }
}

// ── Main export: generate stat card PNG ──────────────────────────────────────
export async function generateStatCard(topic, outputPath) {
  if (!isImageMagickAvailable()) {
    console.warn("⚠️  ImageMagick not available — skipping stat card generation");
    return null;
  }

  const colors   = SERVICE_COLORS[topic.primaryService] ?? DEFAULT_COLOR;
  const title    = esc(topic.title ?? "New Article");
  const tagLine  = esc(buildTagLine(topic));
  const stats    = extractStats(topic);
  const titleLines = wrapTitle(topic.title ?? "New Article");

  // Stat box positions (x start, center for text)
  const statBoxes = [
    { rx: 60,  cx: 210 },
    { rx: 420, cx: 570 },
    { rx: 780, cx: 930 },
  ].slice(0, stats.length);

  // Build the ImageMagick command as an array of args
  const args = [
    "-size", "1200x628",
    `xc:${colors.bg1}`,

    // Bottom half slightly darker
    "-fill", colors.bg2,
    "-draw", "rectangle 0,314 1200,628",

    // Gold left accent bar
    "-fill", colors.accent,
    "-draw", "rectangle 0,0 8,628",

    // Semi-transparent footer strip
    "-fill", "rgba(0,0,0,0.25)",
    "-draw", "rectangle 0,558 1200,628",

    // Stat box backgrounds
    ...statBoxes.flatMap(b => [
      "-fill", "rgba(255,255,255,0.15)",
      "-draw", `roundrectangle ${b.rx},370 ${b.rx+300},500 14,14`,
    ]),
  ];

  // Tag line text
  args.push(
    "-fill", "rgba(255,255,255,0.65)",
    "-font", "DejaVu-Sans",
    "-pointsize", "22",
    "-gravity", "NorthWest",
    "-annotate", "+60+55",
    tagLine,
  );

  // Title lines
  const lineY = [135, 200];
  titleLines.forEach((line, i) => {
    args.push(
      "-fill", "white",
      "-font", "DejaVu-Sans-Bold",
      "-pointsize", "52",
      "-gravity", "NorthWest",
      "-annotate", `+60+${lineY[i]}`,
      esc(line),
    );
  });

  // Stat values and labels
  stats.forEach((stat, i) => {
    const { cx } = statBoxes[i];
    const valueX = cx - (stat.value.length > 5 ? 65 : 45);
    const labelX = cx - (stat.label.length > 10 ? 70 : 50);

    args.push(
      "-fill", "white",
      "-font", "DejaVu-Sans-Bold",
      "-pointsize", "44",
      "-gravity", "NorthWest",
      "-annotate", `+${valueX}+395`,
      esc(stat.value),
    );
    args.push(
      "-fill", "rgba(255,255,255,0.65)",
      "-font", "DejaVu-Sans",
      "-pointsize", "18",
      "-gravity", "NorthWest",
      "-annotate", `+${labelX}+458`,
      esc(stat.label),
    );
  });

  // Footer
  args.push(
    "-fill", "rgba(255,255,255,0.5)",
    "-font", "DejaVu-Sans",
    "-pointsize", "20",
    "-gravity", "NorthWest",
    "-annotate", "+60+572",
    "dev.to  ·  Full article with working code examples",
  );

  // Output
  args.push(outputPath);

  const result = spawnSync("convert", args, { encoding: "utf8" });

  if (result.status !== 0) {
    console.warn("⚠️  ImageMagick failed:", result.stderr?.slice(0, 200));
    return null;
  }

  console.log(`✅  Stat card generated: ${outputPath}`);
  return outputPath;
}
