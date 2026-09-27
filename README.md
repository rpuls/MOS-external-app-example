# MOS external app example

A complete, installable example of an **external MOS app package** — the kind you install by pasting a GitHub URL into Suite Manager, rather than picking from the official catalog.

The app itself is deliberately boring: a small notes board. The point is the packaging.

## Install it

In Suite Manager, paste this into the search box on the **Apps** screen:

```
https://github.com/rpuls/MOS-external-app-example
```

MOS resolves the default branch to an immutable commit, downloads that commit's archive, extracts `.mos/`, validates the manifest, and shows you what the package is asking for before anything is built.

You can install straight from that preview, or choose **Add this source** to keep the repository. An added source's apps stay on the Apps screen under the publisher's name, so they can be installed later without pasting the URL again, and it appears in **Settings → App sources you added** to refresh or remove. MOS remembers what a source publishes rather than re-reading it on every visit: it asks for a new commit every few hours at most, and only downloads the archive again when the commit has actually changed.

Requires MOS 0.17.0 or newer — the first release of manifest generation 1, which this package targets with `manifestVersion: 1`.

## How MOS sees this repository

Everything MOS reads lives in `.mos/`. Files outside it — including this README — are never downloaded.

```
.mos/
├── manifest.json   # the package definition (the only mandatory file)
├── Dockerfile      # builds the `notes` service
├── server.js       # the application
├── icon.svg        # catalog icon
└── README.md       # technical reference
```

This repository publishes **one app**, which is why its `manifest.json` sits at the root of `.mos/`. A repository can instead publish several, as one folder per app inside `.mos/`, each folder named for the id its own `manifest.json` declares:

```
.mos/
├── first-app/
│   └── manifest.json
└── second-app/
    └── manifest.json
```

A root `manifest.json` wins outright — MOS never looks for package folders beside one. The many-app shape is for curating a collection of apps you did not write; the single-app shape is the one to copy for your own project, and this example stays that way on purpose. Nothing stops a project using the other shape when it has a genuine companion service, or two supported variants of itself.

Either way MOS learns each app's id from its manifest, never from the URL or the folder it arrived in. Each app is validated on its own, and one app MOS refuses does not cost the others their place in the listing.

## The rules that are easy to get wrong

These are the ones that will reject your package, ordered by how likely they are to bite.

**The manifest must declare `manifestVersion: 1`.** Generation 1 is the locked manifest contract; a manifest without the field is rejected. Fields outside the contract are ignored, never fatal — but they also do nothing, so don't ship them expecting behavior.

**Only certain filenames are allowed at the package root.** `manifest.json`, `Dockerfile`, `Dockerfile.<service>`, `README.md`, `entrypoint.sh`, `icon.*`, and `privacy-review.json` are permitted implicitly. **Anything else must be listed in `manifest.packageFiles`** or the package is rejected. That is why `server.js` appears there.

**Base images must be pinned by digest.** `FROM node:22-alpine@sha256:…`, never a floating tag like `latest` or `22-alpine`.

**There is no compose file.** You declare services in the manifest; MOS projects the runtime itself. Shipping a `docker-compose.yml` does nothing except get rejected as an undeclared file.

**External apps run under a constrained capability profile**, and it fails closed. You may not use `privileged`, `ports`, `network`/`networkMode`, `devices`, `capAdd`, `securityOpt`, the Docker socket, host bind mounts, raw proxy config, or host-agent hooks. Volumes must be **named** (`notes-data:/data`), never host paths.

**Your app can never mark itself as trusted.** `trust`, `verified`, `official`, `certified`, and `mosReviewed` are rejected outright. You also can't reuse an official app id (`immich`, `radicale`, `seafile`, `vaultwarden`, `onlyoffice`, `stirling-pdf`) or use a reserved `mos-` / `official-` / `suite-` prefix. Every external package installs as **unverified** — that is not a setting.

**You cannot hand MOS raw proxy configuration.** A route is `host` plus `service`, and a route key whose name matches `caddy`, `directive`, or `snippet` is rejected, as are top-level `caddy`, `caddyfile`, and `compose` keys. This is about key names and structure, not about words: your prose is never scanned, so a description may say whatever it needs to.

**`health.url` is a selector, not a URL that gets fetched.** Only the hostname (which must exactly match a declared service id) and the path are used; the port is ignored. That service must also have an entry in `routes`, or nothing is published for the probe to reach. See [`.mos/README.md`](.mos/README.md#health) for the details.

## Where the installed app ends up

Because external ids are namespaced against collisions, this package installs as `x-<8 hex>-example-notes`, where the hex is a digest of the repository URL. Two different repositories can both ship an app called `example-notes` without conflict.

## What the manifest demonstrates

| Concern | Shown by |
| --- | --- |
| User configuration | `boardTitle` setup field → `${config.boardTitle}` → `BOARD_TITLE` |
| Generated secrets | `adminToken` field with `generated.kind: random` → `${secret.adminToken}` |
| Persistence | named volume `notes-data` mounted at `/data` |
| Reachability | a single route on host `notes` |
| Health | `GET /healthz` on the routed service |
| Catalog presentation | `catalog`, `homepage`, and `onboarding` blocks |
| Architecture support | `architectures: ["amd64", "arm64"]`, matching the pinned multi-arch base image |

## Adapting this for your own app

1. Copy `.mos/` into your repository, keeping `manifest.json` at its root so your repository publishes one app.
2. Change `id`, `name`, `summary`, and the `catalog` block.
3. Point the `Dockerfile` at your own digest-pinned base image.
4. List every non-implicit file you ship in `packageFiles`.
5. Keep `manifestVersion: 1` and set `minimumMosVersion` to the oldest MOS release you have actually tested against — never lower than `0.17.0`, where generation 1 was introduced.
6. Make sure the service named in `health.url` is the one carrying your route.

## License

MIT.
