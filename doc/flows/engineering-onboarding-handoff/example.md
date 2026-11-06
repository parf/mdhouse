# Synthetic example — Onboarding and handoff

This is illustrative authoring data, not an executed or verified run. No account, environment,
installation, command or user access was created or tested by this example.

## Input

A supplied setup guide omits CONFIG_PROFILE. A supplied clean-account command result says
CONFIG_PROFILE is required before startup. The owner registry has a development contact but no QA
contact. Role tours and a glossary have not yet been verified in that environment.

## Expected output

- 🟠 A1 The runbook omits a required setup prerequisite
  Evidence: the supplied clean-account startup result requires CONFIG_PROFILE, absent from the guide.
  Impact: following the supplied guide cannot reach the first task as documented.
  > 💬👾 Propose the missing configuration instruction, then require a separately observed recheck.

The setup record is not a successful setup. It retains the supplied command/environment/result,
proposes a prerequisite correction and names the missing verification. A draft first-task guide,
role-specific tour, glossary and ownership/contact map can be retained as independent proposals;
the QA contact stays unknown and no access or account is granted.

## Open questions

- ❓ Q1 Which documented CONFIG_PROFILE value and recheck establish setup success?
  Finding №A1 blocks verification; no secret configuration value is invented or copied.
  > 💡👾 Ask the setup owner for a safe configuration reference and observed clean-account result.
  >
  > 💬👾 The example does not claim that its draft first-task guide was executed.

Question №Q1 remains open.

## Expected route and approval stop

clean-setup.blocked → end(blocked). The environment and first-task journey remain unverified;
no install, configuration edit, account creation, access grant or handoff message occurs. A later
explicit run may use new evidence. See the
[Shared execution contract](../README.md#runtime-boundary).
