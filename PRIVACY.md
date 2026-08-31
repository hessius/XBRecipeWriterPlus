# Privacy Policy

**XBRW++**

Last updated: 2026-08-31

## The short version

XBRW++ has no accounts, no analytics, no advertising, no tracking, and no crash
reporting. If you never import or share a recipe, nothing you do in the app is
sent anywhere. Sharing is optional; when you use it, the recipe fields listed
below leave your device to create an xBloom link.

## What stays on your device

Recipes you do not share are stored in a database on your device and nowhere
else. That includes recipe names, doses, ratios, grind sizes, pour stages, and
the raw card data kept for the restore feature. Deleting the app deletes all of
it. There is no backup to any service operated by the developer, and no way for
the developer to see any of it unless you choose to share a recipe.

## When XBRW++ uses the network

Two cases, both of which only happen because you asked for them.

**Importing a recipe.** When you paste an xBloom link or ID, the app fetches that
recipe from xBloom's public servers. Nothing about you is sent.

**Sharing a recipe.** When you tap Share, the recipe is sent to a small service
run by XBRW++, which adds it to an xBloom account belonging to XBRW++ and
returns a link. Concretely, what leaves your device is: the recipe's name, dose,
ratio, grind size, grinder RPM, cup type, accent colour, and every pour's volume,
temperature, flow rate, pattern, pause and agitation. Nothing else — no device
identifier, no account, no location, no usage data.

That service keeps a count of how many links have been created recently, against
a salted hash of your IP address, so that it cannot be abused. It stores no
address, no recipe, and no log of what you shared.

Two things about a shared link are worth knowing before you tap it:

- The recipe is stored in **xBloom's** cloud, not ours, and it stays there. We
  cannot delete it, and neither can you. A link you have shared cannot be taken
  back.
- Anyone who opens the link sees the recipe attributed to the XBRW++ account,
  not to you.

**Importing and sharing are the only two things that use the network.** Leave
both alone and XBRW++ sends nothing anywhere: reading cards, writing cards,
editing, backup and restore all work with the network off.

These xBloom endpoints are unofficial and undocumented. They can change or stop
working without notice.

## Device capabilities the app uses

**NFC.** Used only to read and write xBloom recipe cards you hold against your
device, at the moment you ask for a read or a write. Card contents are handled
on device. NFC is never used for location, presence, or any background
activity.

**Bluetooth.** Used only to talk to an xBloom machine in the room with you, at
the moment you ask for a brew or open the machine console. The link goes to the
machine and nowhere else: no brew, no recipe and no machine identifier is sent
over the network, and nothing about a brew is recorded off your device. The
machine's identifier is stored on your device so a later session can reconnect
without scanning, and "Forget this machine" in Settings deletes it. XBRW++
declares no Bluetooth background mode, so the link is dropped when the app
leaves the foreground.

**Clipboard.** Read only in direct response to a paste action you take, in
order to pick up an xBloom link. The app does not read the clipboard in the
background or on launch.

**Shared links.** If you share an xBloom link into XBRW++ from another app,
that link is handled on your device to extract the recipe identifier.

## Children

The app is a tool for operating a coffee brewer. It has no accounts, analytics,
ads, tracking or crash reporting. If anyone shares a recipe, the same network
section above applies.

## Changes

Any change to this policy will be published in this file, and its history is
publicly visible in the repository's commit log.

## Contact

Questions or concerns:
<https://github.com/hessius/XBRecipeWriterPlus/issues>
