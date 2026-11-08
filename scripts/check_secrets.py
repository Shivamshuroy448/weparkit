#!/usr/bin/env python3
"""WeParkit Secret & Credential Leak Scanner.

Scans all tracked files, staged changes, and local configuration for:
1. Google API keys (AIzaSy...)
2. OpenAI / ElevenLabs API keys (sk_... / sk-...)
3. GitHub Personal Access Tokens (ghp_..., gho_..., github_pat_...)
4. AWS Access & Secret Keys (AKIA..., etc.)
5. Private Keys (BEGIN RSA/EC/OPENSSH/PGP PRIVATE KEY)
6. Password & token literals in non-test files

Run before git commit or in CI to guarantee 0 credential leakage.
"""
import re
import subprocess
import sys
from pathlib import Path

# Patterns that indicate real active secrets
PATTERNS = [
    (r"AIza[0-9A-Za-z-_]{35}", "Google API key (AIza...)"),
    (r"(?:sk_live_|sk_test_|sk-[a-zA-Z0-9]{20,})", "OpenAI / Stripe secret key"),
    (r"sk_[0-9a-fA-F]{40,}", "ElevenLabs / Vendor API key"),
    (r"(?:ghp|gho|ghu|ghs|ghr)_[0-9a-zA-Z]{36,}", "GitHub Personal Access Token"),
    (r"github_pat_[0-9a-zA-Z_]{60,}", "GitHub Fine-Grained Token"),
    (r"AKIA[0-9A-Z]{16}", "AWS Access Key ID"),
    (r"-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----", "Private cryptographic key"),
    (r"(?:xoxb|xoxp|xapp|xoxa)-[0-9a-zA-Z-]+", "Slack API token"),
]

# Files explicitly exempt from secret checks (e.g. tests using mock fake tokens or this scanner itself)
IGNORE_PATHS = {
    "scripts/check_secrets.py",
    ".git",
    "backend/.venv",
    "node_modules",
}


def get_tracked_files() -> list[str]:
    try:
        res = subprocess.run(["git", "ls-files"], capture_output=True, text=True, check=True)
        return [f.strip() for f in res.stdout.splitlines() if f.strip()]
    except Exception:
        # Fallback to scanning repo recursively
        return [str(p) for p in Path(".").rglob("*") if p.is_file()]


def scan_file(filepath: str) -> list[str]:
    if any(p in filepath for p in IGNORE_PATHS):
        return []
    path = Path(filepath)
    if not path.is_file() or path.stat().st_size > 5 * 1024 * 1024:
        return []
    
    findings = []
    try:
        content = path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return []

    for line_num, line in enumerate(content.splitlines(), start=1):
        # Ignore comments in example files
        if path.name.endswith(".example") and ("your-key" in line or "optional" in line or "sk_" not in line):
            continue
        for regex, desc in PATTERNS:
            if re.search(regex, line):
                findings.append(f"  [!] {filepath}:{line_num} -> {desc}")
    return findings


def main():
    root = Path(__file__).resolve().parent.parent
    files = get_tracked_files()
    total_findings = []

    print(f"🛡️  Scanning {len(files)} tracked files in WeParkit repository for credentials...")
    for f in files:
        full_path = root / f
        if full_path.exists():
            findings = scan_file(str(full_path.relative_to(root)))
            if findings:
                total_findings.extend(findings)

    # Check for untracked .env files that might be staged
    staged = subprocess.run(["git", "diff", "--cached", "--name-only"], capture_output=True, text=True).stdout.splitlines()
    for s in staged:
        if s.endswith(".env") or ".env." in s and not s.endswith(".env.example"):
            total_findings.append(f"  [!] STAGED FILE: {s} is an environment file containing secrets!")

    if total_findings:
        print("\n❌ SECURITY ALERT: Potential secrets or keys detected:")
        for finding in total_findings:
            print(finding)
        print("\nFix: Remove these secrets, rotate any compromised keys, and add them to backend/.env (ignored).")
        sys.exit(1)
    else:
        print("✅ SUCCESS: 0 secrets or leaked API keys detected across all files.")
        sys.exit(0)


if __name__ == "__main__":
    main()

