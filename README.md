# MOS external app example

A complete, installable example of an **external MOS app package** — the kind you install by pasting a GitHub URL into Suite Manager, rather than picking from the official catalog.

The app itself is deliberately boring: a small notes board. The point is the packaging.

## Install it

In Suite Manager, add an external app source and paste:

```
https://github.com/rpuls/MOS-external-app-example
```

MOS resolves the default branch to an immutable commit, downloads that commit's archive, extracts `.mos/`, validates the manifest, and shows you what the package is asking for before anything is built.

Requires MOS 0.11.0 or newer.

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

One repository is one app. MOS learns the app id from the manifest, not from the URL.

## The rules that are easy to get wrong

These are the ones that will reject your package, ordered by how likely they are to bite.

**Only certain filenames are allowed at the package root.** `manifest.json`, `Dockerfile`, `Dockerfile.<service>`, `README.md`, `entrypoint.sh`, `icon.*`, and `privacy-review.json` are permitted implicitly. **Anything else must be listed in `manifest.packageFiles`** or the package is rejected. That is why `server.js` appears there.

**Base images must be pinned by digest.** `FROM node:22-alpine@sha256:…`, never a floating tag like `latest` or `22-alpine`.

**There is no compose file.** You declare services in the manifest; MOS projects the runtime itself. Shipping a `docker-compose.yml` does nothing except get rejected as an undeclared file.

**External apps run under a constrained capability profile**, and it fails closed. You may not use `privileged`, `ports`, `network`/`networkMode`, `devices`, `capAdd`, `securityOpt`, the Docker socket, host bind mounts, raw proxy config, or host-agent hooks. Volumes must be **named** (`notes-data:/data`), never host paths.

**Your app can never mark itself as trusted.** `trust`, `verified`, `official`, `certified`, and `mosReviewed` are rejected outright. You also can't reuse an official app id (`immich`, `radicale`, `seafile`, `vaultwarden`, `onlyoffice`, `stirling-pdf`) or use a reserved `mos-` / `official-` / `suite-` prefix. Every external package installs as **unverified** — that is not a setting.

**No string in the manifest may look like raw proxy config.** MOS scans every manifest string and rejects words such as `reverse_proxy`, `handle`, `respond`, `snippet`, and `directive`. This applies to prose too — a catalog description containing one of those words will fail validation. Use the structured fields instead.

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

1. Copy `.mos/` into your repository.
2. Change `id`, `name`, `summary`, and the `catalog` block.
3. Point the `Dockerfile` at your own digest-pinned base image.
4. List every non-implicit file you ship in `packageFiles`.
5. Set `minimumMosVersion` to the oldest MOS release you have actually tested against.
6. Make sure the service named in `health.url` is the one carrying your route.

## License

MIT.
