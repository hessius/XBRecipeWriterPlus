# Deploying the share mint

The XBRW++ app can turn a recipe into a link that opens in the official xBloom
app. Doing that means creating the recipe in an xBloom account, which means
holding a password — so it happens in a small serverless function rather than in
the app. This is how to deploy it.

## What you need

- A Vercel account. The free tier is enough.
- The XBRW++ xBloom service account's email and password.

## One-time setup

1. Import `hessius/XBRecipeWriterPlus` as a new Vercel project.
2. Leave the framework preset as **Other**. `vercel.json` already sets the
   install and build commands to no-ops — the function has no dependencies, and
   without that Vercel installs the whole Expo tree and tries to build the app.
3. Add these environment variables, all marked **Sensitive**, for Production
   and Preview:

   | Name | Value |
   |---|---|
   | `XBLOOM_EMAIL` | the service account's email |
   | `XBLOOM_PASSWORD` | the service account's password |
   | `SHARE_IP_SALT` | any long random string, e.g. `openssl rand -hex 32` |

4. Deploy, then check the URL. `https://<project>.vercel.app/api/share` should
   answer a `GET` with `405` and `{"error":"method"}`. If it 404s, the function
   was not deployed — see Troubleshooting.
5. Put that URL in `constants/share.ts` as the default, or set
   `EXPO_PUBLIC_SHARE_API_URL` in the build environment.

## Optional: real rate limiting

Without a KV store the rate limiter is per-instance, which means it limits a
burst from one warm function and not much else. To make it real, add an Upstash
Redis integration and set:

| Name | Value |
|---|---|
| `UPSTASH_REDIS_REST_URL` | from the Upstash dashboard |
| `UPSTASH_REDIS_REST_TOKEN` | from the Upstash dashboard |

The code picks these up automatically and falls back to in-memory when they are
absent. Nothing else changes.

## Checking it works

```bash
curl -s -X POST https://<project>.vercel.app/api/share \
  -H 'content-type: application/json' \
  -d '{"payload":{"theName":"Deploy check","theColor":"#C9D5B8","dose":18,
       "grandWater":16,"grinderSize":55,"isSetGrinderSize":1,"rpm":90,
       "cupType":2,"bypassTemp":85,"bypassVolume":0,"subSetType":2,
       "theSubsetId":0,"appPlace":[4],"isShortcuts":2,"isEnableBypassWater":2,
       "adaptedModel":1,"pourCount":1,
       "pourDataJSONStr":"[{\"theName\":\"Bloom\",\"volume\":288,
        \"temperature\":93,\"flowRate\":3.5,\"pattern\":1,\"pausing\":0,
        \"isEnableVibrationBefore\":2,\"isEnableVibrationAfter\":2}]"}}'
```

Expect `{"tableId":…,"url":"https://share-h5.xbloom.com/?id=…"}`. Open the URL.

**This creates a real recipe in the service account and it cannot be deleted.**
Deleting it through the API removes it from the account's library but the link
keeps resolving. Use one check, not ten.

## Troubleshooting

- **`/api/share` 404s.** Vercel did not pick the function up. Move `api/` and
  `vercel.json` into a `server/` subdirectory and set the project's Root
  Directory to `server`, so nothing else in the repo is in scope.
- **The build fails installing dependencies.** The no-op `installCommand` was
  overridden in the project settings. Clear the override so `vercel.json` wins.
- **`503 {"error":"unavailable"}`.** The credentials are not set in this
  environment. Check Preview as well as Production.
- **`502 {"error":"upstream"}`.** Look at the function logs for the error class.
  `login rejected` means the password changed. `share link not found` means the
  mint succeeded but the new row was not in the first 20 of the library listing
  — see the `adaptedModel` note in `cloud-api.md` § C-bis.
