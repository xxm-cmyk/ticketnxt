# Security Policy

## Purpose

TicketNXT publishes its source code so server owners and users can inspect how the bot works, review its requested Discord permissions, and report security concerns.

Public source availability is not a claim that the project has undergone an independent security audit or that it is free of vulnerabilities.

## Reporting a vulnerability

If you believe you have found a security vulnerability:

1. Do not publish exploit details, tokens, personal information, or sensitive server data in a public issue.
2. Contact the repository owner through their GitHub profile and request a private channel to share the report.
3. Include the affected file or feature, the impact you observed, and safe steps to reproduce the issue without accessing data or systems you do not own.

Please allow reasonable time for the issue to be reviewed before making technical details public.

## Operator guidance

- Review the source code and requested Discord permissions before inviting the bot.
- Keep Discord bot tokens, OAuth secrets, session secrets, and environment files private.
- Grant only the Discord permissions required for the features you intend to use.
- If you suspect a token has been exposed, revoke and replace it through the relevant provider.

## Scope

This policy covers security issues in the TicketNXT source code and its documented bot functionality. It does not authorize testing against servers, accounts, or infrastructure that you do not own or have explicit permission to assess.
