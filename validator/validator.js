#!/usr/bin/env node

/**
 * ProtoContext validator — validates a context.txt file against the spec.
 *
 * Usage:
 *   node validator.js <file_or_url>
 *   node validator.js mysite.context.txt
 *   node validator.js https://example.com/context.txt
 */

const fs = require("fs");
const path = require("path");

const MAX_FILE_SIZE = 500 * 1024; // 500KB
const SECTION_WARN_SIZE = 1000;
const REQUIRED_METADATA = new Set(["lang", "version", "updated"]);
const VALID_METADATA = new Set([
  "lang",
  "version",
  "updated",
  "canonical",
  "topics",
  "contact",
  "license",
]);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function validate(content) {
  const errors = [];
  const warnings = [];

  // Check file size
  const size = Buffer.byteLength(content, "utf-8");
  if (size > MAX_FILE_SIZE) {
    errors.push(`File exceeds 500KB limit (${size.toLocaleString()} bytes)`);
  }

  // Check for HTML/JS
  if (/<\s*(script|style|div|span|html|body|head)\b/i.test(content)) {
    errors.push(
      "File contains HTML/JavaScript — only plain text and basic markdown allowed"
    );
  }

  const lines = content.trim().split("\n");
  if (lines.length === 0) {
    errors.push("File is empty");
    return { valid: errors.length === 0, errors, warnings };
  }

  let idx = 0;

  // Skip leading blank lines
  while (idx < lines.length && lines[idx].trim() === "") idx++;

  // Rule 1: Header
  if (idx >= lines.length || !lines[idx].startsWith("# ")) {
    errors.push("Missing header: file must start with '# Site Name'");
    return { valid: false, errors, warnings };
  }

  const title = lines[idx].slice(2).trim();
  if (!title) errors.push("Header title is empty");
  idx++;

  // Skip blank lines
  while (idx < lines.length && lines[idx].trim() === "") idx++;

  // Description line
  if (idx >= lines.length || !lines[idx].startsWith("> ")) {
    errors.push(
      "Missing description: expected '> One line description' after title"
    );
  } else {
    const desc = lines[idx].slice(2).trim();
    if (!desc) errors.push("Description line is empty");
    if (desc.length > 160) {
      warnings.push(
        `Description is ${desc.length} chars — recommended max is 160`
      );
    }
    idx++;
  }

  // Skip blank lines
  while (idx < lines.length && lines[idx].trim() === "") idx++;

  // Rule 2: Metadata
  const metadata = {};
  while (idx < lines.length && lines[idx].startsWith("@")) {
    const match = lines[idx].match(/^@(\w+):\s*(.+)$/);
    if (match) {
      metadata[match[1]] = match[2].trim();
    } else {
      warnings.push(`Malformed metadata line: '${lines[idx]}'`);
    }
    idx++;
  }

  for (const field of REQUIRED_METADATA) {
    if (!(field in metadata)) {
      errors.push(`Missing required metadata: @${field}`);
    }
  }

  if (metadata.updated && !DATE_PATTERN.test(metadata.updated)) {
    errors.push(
      `@updated must be YYYY-MM-DD format, got: '${metadata.updated}'`
    );
  }

  if (metadata.updated && DATE_PATTERN.test(metadata.updated)) {
    const d = new Date(metadata.updated + "T00:00:00Z");
    if (isNaN(d.getTime())) {
      errors.push(`@updated is not a valid date: '${metadata.updated}'`);
    }
  }

  for (const key of Object.keys(metadata)) {
    if (!VALID_METADATA.has(key)) {
      warnings.push(`Unknown metadata field: @${key}`);
    }
  }

  // Rule 3: Sections
  const sections = [];
  let currentSection = null;

  while (idx < lines.length) {
    const line = lines[idx];
    if (line.startsWith("## section:")) {
      const sectionTitle = line.slice("## section:".length).trim();
      if (!sectionTitle) errors.push("Section title is empty");
      currentSection = { title: sectionTitle, bodyLines: [] };
      sections.push(currentSection);
    } else if (currentSection !== null) {
      currentSection.bodyLines.push(line);
    }
    idx++;
  }

  if (sections.length === 0) {
    errors.push(
      "No sections found — need at least one '## section: Title' block"
    );
  }

  for (const section of sections) {
    const body = section.bodyLines.join("\n").trim();
    if (!body) {
      errors.push(`Section '${section.title}' has no content`);
    }
    if (body.length > SECTION_WARN_SIZE) {
      warnings.push(
        `Section '${section.title}' is ${body.length} chars — recommended max is ~${SECTION_WARN_SIZE} for optimal chunking`
      );
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

async function validateUrl(url) {
  const https = require("https");
  const http = require("http");
  const mod = url.startsWith("https") ? https : http;

  return new Promise((resolve) => {
    const req = mod.get(
      url,
      { headers: { "User-Agent": "ProtoContext-Validator/1.0" }, timeout: 10000 },
      (res) => {
        const contentType = res.headers["content-type"] || "";
        if (contentType.includes("text/html")) {
          resolve({
            valid: false,
            errors: [
              `URL returned HTML (Content-Type: ${contentType}) — expected text/plain`,
            ],
            warnings: [],
          });
          res.destroy();
          return;
        }

        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(validate(data)));
      }
    );

    req.on("error", (e) => {
      resolve({
        valid: false,
        errors: [`Failed to fetch URL: ${e.message}`],
        warnings: [],
      });
    });

    req.on("timeout", () => {
      req.destroy();
      resolve({
        valid: false,
        errors: ["Request timed out after 10 seconds"],
        warnings: [],
      });
    });
  });
}

async function main() {
  const target = process.argv[2];

  if (!target) {
    console.log("Usage: node validator.js <file_or_url>");
    console.log("  node validator.js mysite.context.txt");
    console.log("  node validator.js https://example.com/context.txt");
    process.exit(1);
  }

  let result;

  if (target.startsWith("http://") || target.startsWith("https://")) {
    result = await validateUrl(target);
  } else {
    if (!fs.existsSync(target)) {
      console.log(`INVALID  context.txt\n\n  Errors (1):\n    x File not found: ${target}`);
      process.exit(1);
    }
    const content = fs.readFileSync(target, "utf-8");
    result = validate(content);
  }

  if (result.valid) {
    console.log("VALID  context.txt");
  } else {
    console.log("INVALID  context.txt");
  }

  if (result.errors.length > 0) {
    console.log(`\n  Errors (${result.errors.length}):`);
    for (const err of result.errors) {
      console.log(`    x ${err}`);
    }
  }

  if (result.warnings.length > 0) {
    console.log(`\n  Warnings (${result.warnings.length}):`);
    for (const w of result.warnings) {
      console.log(`    ! ${w}`);
    }
  }

  if (result.valid && result.warnings.length === 0) {
    console.log("  No issues found.");
  }

  process.exit(result.valid ? 0 : 1);
}

main();
