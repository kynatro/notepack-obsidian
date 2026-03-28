# Security Policy

## Supported Versions

Only the latest release receives security updates. Users should upgrade to the latest version to stay protected.

## Reporting a Vulnerability

If you discover a security vulnerability in NotePack, **please do not open a public issue**. Instead, report it privately so it can be addressed before disclosure.

### How to Report

1. **GitHub Private Vulnerability Reporting** (preferred): Use [GitHub's security advisory feature](https://github.com/kynatro/notepack-obsidian/security/advisories/new) to submit a private report.
2. **Email**: Contact the maintainer directly via the profile at [github.com/kynatro](https://github.com/kynatro).

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Timeline

- **Acknowledgment**: Within 7 days of your report
- **Status update**: Within 30 days with an assessment and remediation plan
- **Fix release**: As soon as practical, depending on severity

## Security Considerations

NotePack is an Obsidian community plugin that operates entirely within the local Obsidian environment. It:

- **Does not make network requests** - all processing happens locally against vault files
- **Does not collect or transmit user data** - no telemetry, analytics, or external communication
- **Does not execute arbitrary code** - the plugin parses markdown content for todo items and metadata
- **Reads vault files only** - it scans markdown files in the user's vault but does not modify note content

### Dependency Management

- Dependencies are kept minimal and reviewed before adoption
- Dependabot is enabled for automated dependency vulnerability alerts
- Security patches to dependencies are prioritized

## Scope

This policy covers the NotePack Obsidian plugin source code in this repository. It does not cover:

- The Obsidian application itself
- Other community plugins
- User vault content
