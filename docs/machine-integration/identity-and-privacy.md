# Identity, accounts, and what they cost

**Researched 2026-08-29.** Companion to `cloud-api.md`, which establishes the
mechanics. This file is about what those mechanics would do to XBRW++.

## The promise we already made

Three documents currently say the same thing, and they have to keep agreeing
with each other:

| Where | The words |
|---|---|
| `PRIVACY.md` | "XBRW++ collects nothing. There are no accounts, no analytics, no advertising, no tracking, and no crash reporting." |
| `PRIVACY.md` | "If you never import from a share link, the app makes no network requests at all, and it works fully offline." |
| App Store description | the same claim, in marketing voice |
| App Privacy questionnaire | answered **Data Not Collected** |

The questionnaire answer is the one with teeth. Changing it is a submission
event, and getting it wrong is a compliance problem rather than an
embarrassment. Any feature below that changes it must change all four together.

Note what the current promise does *not* say: it does not say the app never
talks to the network. It already reads `client-api.xbloom.com` when you import a
link, and `PRIVACY.md` says so plainly. The promise is about **accounts and
collection**, not about isolation. That distinction leaves more room than it
first appears.

## The reframing that matters

"Share a recipe" turned out to be two unrelated features that the original
roadmap idea had fused into one.

**Sharing to another XBRW++ user** needs no account, no cloud, and no xBloom
involvement whatsoever. We already own the serialisation — `Recipe` round-trips
through JSON today for the backup file. A per-recipe share is a file, a deep
link, or a QR code, and it costs us nothing in privacy terms.

**Sharing to the official xBloom app** is the one that needs an account, because
a share link is nothing more than a base64-encoded primary key of a row in
xBloom's own database. You cannot mint one without writing to that database, and
you cannot write to it anonymously. `spec`

These have very different value and very different cost. The second is what
makes a recipe reach people who don't use XBRW++, which is the actual point of
the idea. But the first is nearly free and should not be blocked behind the
second.

## The account models

### 0. No account — XBRW++-native sharing only

Ship per-recipe export and import in our own format. Nothing changes: no
network, no accounts, all four documents stand as written.

- **Privacy cost:** none.
- **Operational cost:** none.
- **Limitation:** recipients need XBRW++. Does not reach the official app.
- **Effort:** small. We have the serialisation and a working file-share path in
  `useBackup.ts` to model it on.

### 1. The user's own xBloom credentials

The user types their xBloom email and password into XBRW++; we authenticate
against `tMemberLogin.thtml` and mint links as them.

- **Privacy cost:** significant, and worse than it looks. We would be asking for
  a **third-party password** in a first-party text field. Even storing it only in
  the Keychain, this trains exactly the behaviour phishing relies on, and there
  is no OAuth flow available to do it properly — the API takes a plain password.
- **Questionnaire:** the honest answer stops being "Data Not Collected".
- **Guideline exposure:** 5.2.2. An app that logs into another company's service
  with the user's credentials, using an undocumented API, without permission.
- **Failure mode:** an API change locks out every user at once. A password change
  silently breaks it.
- **Upside:** recipes are attributed to the user, which is correct and is what
  they would expect.

### 2. A service account (the BrewMind model)

We operate one xBloom account. Users need no credentials; every minted link is
attributed to us.

- **This makes XBRW++ operate a backend for the first time.** The credential
  cannot ship in the binary — anyone can read it out of an IPA — so it implies a
  server, a deployment, a secret store, and an ongoing bill.
- **Privacy cost:** recipe data would flow through infrastructure we run. That
  contradicts "nothing you do in the app is sent to its developer" unless we
  qualify it carefully and truthfully.
- **Failure mode is the worst of the three:** it is a single point of ban. If
  xBloom objects, the feature dies for everyone simultaneously, and a
  high-volume service account is a far more visible target than scattered
  individual users. `cloud-api.md` reaches the same conclusion independently.
- **Attribution is wrong:** every shared recipe appears to be authored by us,
  not by the person who made it.
- **Effort:** by far the largest, and most of it is not app work.

## Read

**Model 0 is unambiguously worth doing and should not wait for the others.** It
is small, it costs nothing, it is useful on its own, and it is the only one of
the three that cannot go wrong.

**Between 1 and 2, neither is attractive, and the deciding factor is not
technical.** Model 2 buys convenience and pays for it with a backend, a
liability, wrong attribution, and a single kill switch. Model 1 avoids all the
infrastructure but asks users to hand a third-party password to a coffee app,
which is the kind of thing this project has so far been careful not to do.

If the goal is reaching official-app users, there is a fourth option worth
raising before either: **ask xBloom.** The project is a good-faith companion tool
with a public App Store presence and an audience on their own Discord. A
sanctioned path — even an informal one — would dissolve the guideline exposure,
the ban risk, and the credential problem at once. That conversation costs an
email, and it is the only route that does not involve accepting a permanent
structural risk. Worth trying before building anything in this area.

## Open questions

- Whether a share link minted by a service account displays the account's name
  to recipients in the official app. `inferred` that it does; unconfirmed.
- Whether xBloom rate-limits or flags high-volume recipe creation. No source
  observed a limit, but no source tried to find one either.
- Whether any of this is contrary to xBloom's terms of service. Nobody in the
  surveyed corpus has established that, and several acknowledge the risk
  explicitly without resolving it.
