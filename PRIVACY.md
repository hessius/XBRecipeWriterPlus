# Privacy Policy

**XBRW++**

Last updated: 2026-08-28

## The short version

XBRW++ collects nothing. There are no accounts, no analytics, no advertising,
no tracking, and no crash reporting. Nothing you do in the app is sent to its
developer, because there is no server to send it to.

## What stays on your device

Your recipes are stored in a database on your device and nowhere else. That
includes recipe names, doses, ratios, grind sizes, pour stages, and the raw
card data kept for the restore feature. Deleting the app deletes all of it.
There is no backup to any service operated by the developer, and no way for
the developer to see any of it.

## When the app talks to the network

There is exactly one case. When you import a recipe from an xBloom share link,
the app sends the recipe identifier from that link to xBloom's servers
(`client-api.xbloom.com`) in order to fetch the recipe, and may load the pod
image that the response points to.

This request carries only what is needed to retrieve the recipe. The app adds
no identifier of you or your device to it. XBRW++ is not affiliated with
xBloom; those servers are operated by xBloom, and their handling of the request
is governed by xBloom's own privacy policy.

If you never import from a share link, the app makes no network requests at
all, and it works fully offline.

## Device capabilities the app uses

**NFC.** Used only to read and write xBloom recipe cards you hold against your
device, at the moment you ask for a read or a write. Card contents are handled
on device. NFC is never used for location, presence, or any background
activity.

**Clipboard.** Read only in direct response to a paste action you take, in
order to pick up an xBloom link. The app does not read the clipboard in the
background or on launch.

**Shared links.** If you share an xBloom link into XBRW++ from another app,
that link is handled on your device to extract the recipe identifier.

## Children

The app is a tool for operating a coffee brewer. It collects no data from
anyone, including children.

## Changes

Any change to this policy will be published in this file, and its history is
publicly visible in the repository's commit log.

## Contact

Questions or concerns:
<https://github.com/hessius/XBRecipeWriterPlus/issues>
