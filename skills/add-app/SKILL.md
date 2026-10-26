---
name: add-app
description: Package an open-source app for My Own Suite (MOS) so it installs from a GitHub URL. Writes the .mos/ package (manifest, digest-pinned Dockerfile, icon, README) in a repository the user controls, validates it, pushes it, and tells the user what to paste into Suite Manager. Use when someone wants an app that is not in the MOS catalog on their MOS server, wants to publish their own app for MOS, or wants to curate a catalog of apps for MOS.
argument-hint: <GitHub URL of the app, or what you want installed>
---

# Package an app for My Own Suite

MOS installs external apps from a public GitHub repository that carries a `.mos/` folder. This skill takes an app from "I found it on GitHub" to "paste this URL into Suite Manager". It never touches the user's server: the owner installs from Suite Manager's Apps screen, where MOS shows what the package asks for before anything is built.

Read these first. They are the contract and the worked example, and this file does not repeat them:

- `${CLAUDE_PLUGIN_ROOT}/.mos/manifest.json`: a complete single-app package
- `${CLAUDE_PLUGIN_ROOT}/README.md`: the rules that get a package refused, in the order they bite
- https://myownsuite.org/docs/reference/manifest/: every field, the template grammar, what is refused by design
- https://raw.githubusercontent.com/rpuls/my-own-suite/main/apps/manifest.schema.json: the JSON Schema (draft 2020-12) MOS validates against

## 1. Decide where the package lives

Ask, or infer from what the user owns:

- **The user maintains the app.** Add `.mos/` at the root of its repository with `manifest.json` directly inside. That repository then publishes one app.
- **The app belongs to someone else**, the usual case. The package goes in a repository the user controls, in the *catalog* shape: `.mos/<id>/manifest.json`, one folder per app, each folder named exactly as its manifest's `id`. Suggest one catalog repository for everything they package, such as `my-mos-apps`, and create it with `gh repo create <name> --public` if they have none.

The repository must be **public**: MOS downloads a commit archive from GitHub, and a private repository looks to it like a deleted one. Only `.mos/` is ever downloaded; nothing else in the repository matters to MOS. Do not put the package into a fork of the upstream project unless the user intends to maintain that fork.

## 2. Learn how the app runs

From the app's README, docs and any published compose example, write down:

- the official container image, the release tag to use, and the architectures it is published for
- the one TCP port it listens on
- the environment variables it needs, and which of them are secrets
- every path it writes persistent data to
- its health or readiness endpoint, or failing that the path of its front page
- whether it needs a database or cache as a separate service
- its license: MOS exists for open-source software, so say so if the app is not

Prefer the upstream image over rebuilding from source. The Dockerfile is then one `FROM` line, sometimes with a small fix; https://github.com/rpuls/MOS-extra-apps has a real one that creates a volume directory with the right owner.

## 3. Pin every image by digest

MOS refuses floating tags. Resolve each tag to its index digest, so one pin covers every architecture the image publishes:

```sh
ACCEPT='Accept: application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json'

# GHCR
T=$(curl -s "https://ghcr.io/token?scope=repository:<owner>/<image>:pull" | sed -E 's/.*"token":"([^"]+)".*/\1/')
curl -sI -H "Authorization: Bearer $T" -H "$ACCEPT" "https://ghcr.io/v2/<owner>/<image>/manifests/<tag>" | grep -i docker-content-digest

# Docker Hub (official images live under library/<image>)
T=$(curl -s "https://auth.docker.io/token?service=registry.docker.io&scope=repository:<owner>/<image>:pull" | sed -E 's/.*"token":"([^"]+)".*/\1/')
curl -sI -H "Authorization: Bearer $T" -H "$ACCEPT" "https://registry-1.docker.io/v2/<owner>/<image>/manifests/<tag>" | grep -i docker-content-digest
```

With Docker installed, `docker buildx imagetools inspect <image>:<tag>` prints the same digest together with the platforms. Write `FROM <image>@sha256:<digest>` and set `architectures` to what the index actually publishes.

## 4. Write the package

Files at the package root (`.mos/` or `.mos/<id>/`):

- `manifest.json`, required
- `Dockerfile` for the primary service, `Dockerfile.<service>` for each other service
- `icon.svg` or `icon.png`: an opaque square with its own background, so it reads on any surface; use the project's logo only if its license allows
- `README.md`: the technical reference, with services, env, volumes and health
- `entrypoint.sh` if a service needs one. Any other file must be listed in `packageFiles`

Start from the minimal manifest on the reference page and the example, then:

- `manifestVersion: 1`, always.
- `id`: DNS-safe lowercase, not an id the official catalog uses, no `mos-`, `official-` or `suite-` prefix. It installs as `x-<8 hex>-<id>`, namespaced by repository, so two publishers can use the same id.
- `version` is the **package** version. Start at `1.0.0` and bump it on any content change: that comparison is the only thing that offers owners an update. `appVersion` is the upstream version the pinned image carries.
- `minimumMosVersion`: `0.17.0` unless the package uses an addition: `requires` needs 0.18.0, `${smtp.*}` 0.19.0, `appVersion` 0.20.0, `routes[].kind` or `requirements` 0.21.0. `storage` is not available to external packages.
- `resources.services.<id>`: `dockerfile`, `internalPort`, `env`, `volumes` as `name:/absolute/path`, named volumes only. Service ids are hostnames on the package's private network, and MOS does not order startup, so a service must retry its dependencies.
- `env` templates: `${app.publicUrl}` ends in `/`; use `${app.scheme}://${app.host}` where the app wants a bare origin. `${config.<field>}` for owner input, `${secret.<field>}` for secrets, `${smtp.*}` if the app sends mail. Every reference is validated, so a typo is a refusal.
- `setup.fields`: only what the app genuinely needs from the owner. A secret the owner never needs to know gets `"generated": { "kind": "random", "bytes": 32, "encoding": "base64url" }`, and a secret field has no `default`.
- `routes`: `host` plus `service`, nothing else. The first route is the Open button and the Homepage tile; `kind: "api"` marks an address only programs call, and such a package omits `homepage`.
- `health`: `{ "type": "http", "url": "http://<service-id>:<port>/<path>" }`. The hostname must be a declared service id that also has a route; the port is ignored.
- `catalog`: `description`, `replaces` (the commercial products it stands in for, most recognised first), `tags`, `features`, `links`, a `privacy` summary. `homepage`: `group` and `icon`, an `mdi-` icon name.
- `update`: `backupRequired`, `downtime` and `rollback`, stated honestly.

## 5. Refused by design

Do not work around these: privileged containers, host networking, published `ports`, `devices`, `capAdd`, `securityOpt`, the Docker socket, bind mounts or host paths, raw proxy configuration, compose files, trust fields (`trust`, `verified`, `official`, `certified`, `mosReviewed`), OIDC/LDAP/SSO wiring, volumes shared between packages. An app that needs one of them is a platform conversation: say so and stop rather than bending the package.

## 6. Validate before pushing

- With a checkout of https://github.com/rpuls/my-own-suite, `npm run apps:manifest:check -- <path to the package folder>` runs the exact validator MOS uses, structure and semantics, with no server involved.
- Otherwise validate `manifest.json` against the schema with any JSON Schema tool for draft 2020-12, and check the semantic rules by hand: every template reference resolves, `routes[].service` and the health hostname name declared services, every declared file exists.
- With Docker, `docker build -f <Dockerfile> <package folder>` proves the pin and the image.

The authoritative check is MOS itself. Once the package is pushed, pasting the repository URL into Suite Manager's Apps search shows the preview, and a package MOS refuses is still listed, with the reasons. Ask the user for those reasons and fix them.

## 7. Commit, push, hand over

Commit with a message naming the app and its version, and push. Then tell the user, plainly:

1. The exact repository URL to paste into **Apps → Search** in Suite Manager.
2. That MOS shows what the app asks for first, and that they can Install straight away or choose **Add this source** to keep the repository on their Apps screen.
3. That the app is labelled **External · Unverified** everywhere, runs with fewer permissions than a catalog app, and that building it runs the package's own instructions on their server: they are trusting the upstream project and this package.
4. How updates work: when upstream releases, repeat step 3 with the new tag, bump `version` and `appVersion`, push, and the app's detail view in Suite Manager offers **Check for updates**.
