# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| 1.x | Yes |

## Reporting a vulnerability

Please do not open a public issue. Report privately through
[GitHub's private vulnerability reporting](https://github.com/CycleChain/CycleWire/security/advisories/new)
or by email to **fatih.dogancan@cyclechain.io**.

Include the affected version, a minimal reproduction and the impact you expect. You will
get an acknowledgement within three working days. Fixes are released as patch versions
and credited in the release notes unless you prefer otherwise.

## Scope

CycleWire's security model is described in [docs/security.md](docs/security.md). In short:
markup can only reach code through names you register, `html` escapes by context and
refuses unsafe positions, and parsed fragments are inert until inserted. Reports that
show markup reaching code or unescaped HTML outside these rules are in scope.
