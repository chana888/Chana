# Optional Integrations: DeepSeek Harness (dsh) and vShell C2

> **Note**: Neither component ships with this repository. The repository contains only
> platform-side integration code (reverse proxy / sync / bridge). This page documents how to
> obtain, start and connect them.

| Component | Purpose | Bundled? | Default port |
|-----------|---------|----------|--------------|
| DeepSeek Harness (dsh) | Chat/agent runtime behind the Harness page | ❌ proxy + sync code only | 3080 |
| vShell C2 | Tunneling / C2 panel in the sidebar | ❌ proxy + stats code only | panel 8095 (example) |

---

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
- Optionally copy `AGENTS-TEMPLATE.md` to `~/.dsh/AGENTS.md` so agents follow platform conventions.

### Troubleshooting

| Symptom | Check |
|---------|-------|
| "Harness 暂未连接" | port 3080 listening; `dsh:` block present; `/dsh/` returning 401 means stale token |
| 502/blank | dsh process died |
| iframe loads but API 403 | platform build must include Host rewrite / Origin stripping in `internal/handler/dsh_proxy.go` |

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

- Bundled Windows panel: **`admin / admin123`** (change it right after the first login)
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
