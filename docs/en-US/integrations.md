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
