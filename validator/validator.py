#!/usr/bin/env python3
"""
ProtoContext validator — validates a context.txt file against the spec.

Usage:
    python validator.py <file_or_url>
    python validator.py mysite.context.txt
    python validator.py https://example.com/context.txt
"""

import sys
import re
import os
from datetime import datetime


MAX_FILE_SIZE = 500 * 1024  # 500KB
SECTION_WARN_SIZE = 1000
REQUIRED_METADATA = {"lang", "version", "updated"}
VALID_METADATA = {"lang", "version", "updated", "canonical", "topics", "contact", "license"}
DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class ValidationResult:
    def __init__(self):
        self.errors = []
        self.warnings = []

    def error(self, msg):
        self.errors.append(msg)

    def warn(self, msg):
        self.warnings.append(msg)

    @property
    def valid(self):
        return len(self.errors) == 0


def validate(content: str) -> ValidationResult:
    result = ValidationResult()

    # Check file size
    size = len(content.encode("utf-8"))
    if size > MAX_FILE_SIZE:
        result.error(f"File exceeds 500KB limit ({size:,} bytes)")

    # Check for HTML/JS
    if re.search(r"<\s*(script|style|div|span|html|body|head)\b", content, re.IGNORECASE):
        result.error("File contains HTML/JavaScript — only plain text and basic markdown allowed")

    lines = content.strip().split("\n")
    if not lines:
        result.error("File is empty")
        return result

    idx = 0

    # Skip leading blank lines
    while idx < len(lines) and lines[idx].strip() == "":
        idx += 1

    # Rule 1: Header
    if idx >= len(lines) or not lines[idx].startswith("# "):
        result.error("Missing header: file must start with '# Site Name'")
        return result

    title = lines[idx][2:].strip()
    if not title:
        result.error("Header title is empty")
    idx += 1

    # Skip blank lines
    while idx < len(lines) and lines[idx].strip() == "":
        idx += 1

    # Description line
    if idx >= len(lines) or not lines[idx].startswith("> "):
        result.error("Missing description: expected '> One line description' after title")
    else:
        desc = lines[idx][2:].strip()
        if not desc:
            result.error("Description line is empty")
        if len(desc) > 160:
            result.warn(f"Description is {len(desc)} chars — recommended max is 160")
        idx += 1

    # Skip blank lines
    while idx < len(lines) and lines[idx].strip() == "":
        idx += 1

    # Rule 2: Metadata
    metadata = {}
    while idx < len(lines) and lines[idx].startswith("@"):
        line = lines[idx]
        match = re.match(r"^@(\w+):\s*(.+)$", line)
        if match:
            key, value = match.group(1), match.group(2).strip()
            metadata[key] = value
        else:
            result.warn(f"Malformed metadata line: '{line}'")
        idx += 1

    for field in REQUIRED_METADATA:
        if field not in metadata:
            result.error(f"Missing required metadata: @{field}")

    if "updated" in metadata and not DATE_PATTERN.match(metadata["updated"]):
        result.error(f"@updated must be YYYY-MM-DD format, got: '{metadata['updated']}'")

    if "updated" in metadata and DATE_PATTERN.match(metadata["updated"]):
        try:
            datetime.strptime(metadata["updated"], "%Y-%m-%d")
        except ValueError:
            result.error(f"@updated is not a valid date: '{metadata['updated']}'")

    for key in metadata:
        if key not in VALID_METADATA:
            result.warn(f"Unknown metadata field: @{key}")

    # Rule 3: Sections
    sections = []
    current_section = None

    while idx < len(lines):
        line = lines[idx]
        if line.startswith("## section:"):
            section_title = line[len("## section:"):].strip()
            if not section_title:
                result.error("Section title is empty")
            current_section = {"title": section_title, "body_lines": []}
            sections.append(current_section)
        elif current_section is not None:
            current_section["body_lines"].append(line)
        idx += 1

    if not sections:
        result.error("No sections found — need at least one '## section: Title' block")

    for section in sections:
        body = "\n".join(section["body_lines"]).strip()
        if not body:
            result.error(f"Section '{section['title']}' has no content")
        if len(body) > SECTION_WARN_SIZE:
            result.warn(
                f"Section '{section['title']}' is {len(body)} chars — "
                f"recommended max is ~{SECTION_WARN_SIZE} for optimal chunking"
            )

    return result


def validate_file(path: str) -> ValidationResult:
    if not os.path.exists(path):
        r = ValidationResult()
        r.error(f"File not found: {path}")
        return r

    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    return validate(content)


def validate_url(url: str) -> ValidationResult:
    import urllib.request
    import urllib.error

    try:
        req = urllib.request.Request(url, headers={"User-Agent": "ProtoContext-Validator/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            content_type = resp.headers.get("Content-Type", "")
            if "text/html" in content_type:
                r = ValidationResult()
                r.error(f"URL returned HTML (Content-Type: {content_type}) — expected text/plain")
                return r
            content = resp.read().decode("utf-8")
    except urllib.error.URLError as e:
        r = ValidationResult()
        r.error(f"Failed to fetch URL: {e}")
        return r

    return validate(content)


def main():
    if len(sys.argv) < 2:
        print("Usage: python validator.py <file_or_url>")
        print("  python validator.py mysite.context.txt")
        print("  python validator.py https://example.com/context.txt")
        sys.exit(1)

    target = sys.argv[1]

    if target.startswith("http://") or target.startswith("https://"):
        result = validate_url(target)
    else:
        result = validate_file(target)

    if result.valid:
        print(f"VALID  context.txt")
    else:
        print(f"INVALID  context.txt")

    if result.errors:
        print(f"\n  Errors ({len(result.errors)}):")
        for err in result.errors:
            print(f"    x {err}")

    if result.warnings:
        print(f"\n  Warnings ({len(result.warnings)}):")
        for w in result.warnings:
            print(f"    ! {w}")

    if result.valid and not result.warnings:
        print("  No issues found.")

    sys.exit(0 if result.valid else 1)


if __name__ == "__main__":
    main()
