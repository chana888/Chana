# Optional Integrations: DeepSeek Harness (dsh) and vShell C2

> **Note**: Neither component ships with this repository. The repository contains only
> platform-side integration code (reverse proxy / sync / bridge). This page documents how to
> obtain, start and connect them.

| Component | Purpose | Bundled? | Default port |
|-----------|---------|----------|--------------|
| DeepSeek Harness (dsh) | Chat/agent runtime behind the Harness page | ❌ proxy + sync code only | 3080 |
| vShell C2 | Tunneling / C2 panel in the sidebar | ❌ proxy + stats code only | panel 8095 (example) |

---

## 0. One-shot deployment (recommended)

```bash
./scripts/deploy-all.sh        # Windows: .\scripts\deploy-all.ps1
```

It prepares the platform binary (local build, or prebuilt from Releases), config, dsh + platform wiring,
GSL5, vShell, browser MCP, then starts and **verifies the whole stack**. The per-component sections below
remain for manual steps and troubleshooting.

Verification (also run automatically at the end of deploy-all):

```bash
node scripts/verify-stack.mjs
```

It checks the platform, dsh, the dsh MCP plugin, the live tool counts of `mcp-chana` / `mcp-gsl5` /
`mcp-local-browser`, and vShell. Everything except "Chrome extension" should be ✓; the only manual
step left is loading the extension in your local Chrome and clicking Connect.

## 1. DeepSeek Harness (dsh)

### Install and start

```bash
npm install -g @deepseek-ai/dsh
dsh web --no-open
```

The banner prints a tokenized URL, e.g. `http://127.0.0.1:3080/?token=XyZ...abc`.

### Connect the platform

Add to `config.yaml` and restart `chana`:

```yaml
dsh:
  base_url: http://127.0.0.1:3080
  token: XyZ...abc
```

Result: the Harness page loads without a second login, platform AI channels are synced into dsh,
and dsh workspaces are mirrored into platform projects every 30s.

### Notes

- The dsh token **changes on every restart**; update `config.yaml` and restart the platform.
- The platform proxies but never starts or supervises dsh.
- `deploy-dsh.sh` / `.ps1` runs `scripts/setup-dsh-platform.sh`, which:
  1. enables the platform MCP server (`127.0.0.1:8081` + static token),
  2. installs `AGENTS-TEMPLATE.md` as `~/.dsh/AGENTS.md`,
  3. links the skills library into `~/.dsh/skills` and `~/skills`,
  4. injects an `mcp-chana` client into `~/.dsh/profiles/web/cordis.patch.yml`,
   plus an independent MCP entry (`mcp-<name>`) for every **enabled** server in platform `external_mcp.servers`
   (browser bridge, GSL5, ...), so the agent can call `chrome_*` tools directly.
   If dsh initialized the patch file as `[]`, it is normalized first to avoid `gateway/internal` errors.
   New entries **must** be `- insert:` blocks; a bare `- id: mcp-*` is treated as an edit of a missing
   entry (`patch: entry "mcp-xxx" not found`) and silently never loads. The setup script repairs
   historical bare entries automatically.
   It also verifies `integrations/dsh/node_modules`: some npm mirrors ship
   `@modelcontextprotocol/client` without `dist/index.mjs`, which makes the plugin fail to import and
   leaves the agent with zero MCP tools; the script reinstalls that package from the official registry.

  Restart **platform** then **dsh** afterwards (or run the script manually).

### Troubleshooting

| Symptom | Check |
|---------|-------|
| "Harness 暂未连接" | port 3080 listening; `dsh:` block present; `/dsh/` returning 401 means stale token |
| 502/blank | dsh process died |
| iframe loads but API 403 | platform build must include Host rewrite / Origin stripping in `internal/handler/dsh_proxy.go` |
| agent exposes no `mcp__*` / `chrome_*` tools | check `dsh-run.log` stderr for `did not activate` / `ERR_MODULE_NOT_FOUND`; rerun `scripts/setup-dsh-platform` (repairs patch format and missing deps), then restart dsh |
| `dsh --profile web --dump-config` prints `patch: entry "mcp-chana" not found` | bare patch entries; rerun `setup-dsh-platform` to rewrite them as `- insert:` blocks |

---

## 2. vShell C2

vShell is a standalone product: the official prebuilt server is distributed separately; its source
is not part of this repository.

### Start the server

```bash
./vshell-server-standalone-linux -a 127.0.0.1 -p 8095 -ap 8084 -t <admin-token>
```

### Connect the platform

```yaml
vshell:
  enabled: true
  url: http://127.0.0.1:8095
  token: <same admin-token>
```

Restart the platform; the vShell page logs in automatically and exposes listeners, client
generation and tunnel proxy.

### Remote / loopback-only deployments

```bash
ssh -N -L 127.0.0.1:8095:127.0.0.1:8080 user@vshell-host
```

Keep `url: http://127.0.0.1:8095` in `config.yaml`.

### Troubleshooting

| Symptom | Check |
|---------|-------|
| "vShell C2 未启用" | missing `vshell:` block or `enabled: false` |
| Endless spinner | platform must rewrite `/app.config.js` to `/vshell/app.config.js`; verify with `curl -k https://127.0.0.1:8080/vshell/ \| grep app.config` |
| 401 / empty data | token mismatch with `-t` |
| Connection refused | panel not listening (tunnel down / server stopped) |

---

## 3. Helper scripts

`scripts/` contains `setup-dsh.{sh,ps1}` and `setup-vshell.{sh,ps1}`. They only edit `config.yaml`
(with a timestamped backup) and never start processes:

```bash
./scripts/setup-dsh.sh    --token <dsh-token> [--base-url http://127.0.0.1:3080]
./scripts/setup-vshell.sh --token <admin-token> [--url http://127.0.0.1:8095]
```

```powershell
.\scripts\setup-dsh.ps1    -Token <dsh-token> [-BaseUrl http://127.0.0.1:3080]
.\scripts\setup-vshell.ps1 -Token <admin-token> [-Url http://127.0.0.1:8095]
```

Restart the platform afterwards. If the corresponding block already exists, the script exits
without changes.

---

## 4. One-command deployment from this repository

### 4.1 dsh (fully deployable from the repo)

The runtime is pinned in `integrations/dsh/package.json` (`@deepseek-ai/dsh`, MIT; `node_modules` is not
committed). A single command installs, starts dsh, extracts the token and patches `config.yaml`:

```bash
./scripts/deploy-dsh.sh
```

```powershell
.\scripts\deploy-dsh.ps1
```

Use `--install-only` / `-InstallOnly` to install without starting. The default npm registry is
`https://registry.npmjs.org` because some transitive packages are newer than CN mirrors; override with
`--registry` / `-Registry` (a stale mirror fails with `ETARGET`).

### 4.2 vShell (Linux and Windows builds bundled)

`integrations/vshell/server/` ships a sanitized Linux server plus `www/`;
`integrations/vshell/server/windows/` ships the Windows server plus `www/` (branding unified as vShell,
project logo applied). `deploy-vshell` selects the right one per platform. vShell is a third-party
licensed product; bundled binaries are intended for license holders only.

```bash
./scripts/deploy-vshell.sh --binary /opt/vshell/vshell-server-standalone-linux
```

```powershell
.\scripts\deploy-vshell.ps1 -Binary D:\vshell\vshell-server-standalone.exe
```

It generates a random admin token, starts the server (`-a 127.0.0.1 -p 8095 -ap 8084 -t <token>`), waits for
the panel port and writes the `vshell:` block into `config.yaml`.

### Default credentials

- Bundled panel (Linux and Windows builds): **`admin / admin123`** (change it right after the first login)
- Token login (recommended): `http://127.0.0.1:8095/?token=<token printed by deploy-vshell>`
- Entering through the platform injects the token automatically

### ChanaAgent first-login password

- Username `admin`; the random password is printed **once** at first start under `ADMIN SETUP REQUIRED`
- Background/service start: `grep -A3 "ADMIN SETUP REQUIRED" chana-run.log`
- Forgot it: `./chana --reset-admin-password` (interactive reset)

---

## 5. GSL5 (GodzillaSuper) WebShell-management MCP

GSL5 runs as an MCP server providing WebShell operations (command execution, file management, database,
in-memory shells, payload generation).

- Requires **Java 17+**
- The runtime ships in `integrations/gsl5/bin/gsl5.jar` (~78MB, self-contained)

```bash
./scripts/deploy-gsl5.sh        # start → parse token → patch config.yaml
```

```powershell
.\scripts\deploy-gsl5.ps1
```

Manual config:

```yaml
external_mcp:
  servers:
    gsl5:
      type: http
      url: http://127.0.0.1:9123/message
      headers:
        Authorization: Bearer <token from the gsl5 banner>
      external_mcp_enable: true
```

Restart the platform; the gsl5 entry (~62 tools) appears under MCP management and the GSL5 console works.

---

## 6. Browser MCP (local-browser / vps-browser)

Lets agents drive a real browser (navigate, click, screenshot, read DOM, capture network, inject scripts).

> The platform drives browsers only through the **`local-browser`** (local Chrome) or **`vps-browser`** (VPS Chrome) external MCP servers (pick one); no Playwright / Chrome DevTools fallback is built in.

**Which one to pick**

| Scenario | MCP to enable |
|----------|---------------|
| Personal machine / local deployment, drive your own Chrome | `local-browser` (default) |
| VPS / server, remote desktop with shared login state | `vps-browser` |

Both share the same Chrome extension and bridge; enable only one at a time.

Components: Chrome extension `vps-browser/extension/`, MCP bridge `vps-browser/server/chrome-bridge.cjs`
(`127.0.0.1:18862/mcp`), and platform presets `local-browser` / `vps-browser` (auto-registered, disabled by default).

```bash
./scripts/deploy-browser.sh      # install deps, create token, start bridge
```

```powershell
.\scripts\deploy-browser.ps1
```

Load `vps-browser/extension` once in `chrome://extensions`, then run `scripts/setup-local-browser.sh`
(or the `.ps1`): it installs the 12306 native host, fixes `allowed_origins`, starts the 18862 bridge and
self-checks. Finally enable `local-browser` under platform MCP management. Verify with:
`curl -H "X-Chana-Vps-Token: <token from vps-browser/server/.runtime/config.json>" http://127.0.0.1:18862/status`.

For a VPS deployment with remote desktop and shared login state, run `vps-browser/install.sh`.

> To serve `/browser/` on the **same origin/port** as the platform, see the "same-origin" section in
> `vps-browser/README.md`; template: `vps-browser/nginx/chana_same_origin_server.conf.example`.
