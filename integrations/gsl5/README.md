# GSL5（GodzillaSuper）WebShell 管理 MCP

GSL5 是平台的 WebShell 管理组件（命令执行、文件管理、数据库、内存马、payload 生成等），
以 **MCP 服务**形式接入平台。本目录随仓库提供其运行包，开箱即可部署。

```text
integrations/gsl5/
├── bin/gsl5.jar       # 运行包（约 78MB，自包含）
└── README.md
```

## 前置

- **Java 17+**（JDK 或 JRE，`java -version` 可用即可）
- 平台已启动

## 一键部署

```bash
./scripts/deploy-gsl5.sh        # Linux / macOS：启动服务 → 解析 Token → 写入 config.yaml
```

```powershell
.\scripts\deploy-gsl5.ps1       # Windows
```

脚本行为：

1. 检查 Java；
2. 启动 `java -jar integrations/gsl5/bin/gsl5.jar mcp 9123 127.0.0.1`，日志写入 `gsl5-run.log`；
3. 从 banner 解析 `Token:`；
4. 调用 `scripts/setup-gsl5.*` 把 `external_mcp.servers.gsl5` 写入 `config.yaml`。

之后重启平台，「MCP 管理」会出现 `gsl5`（约 62 个工具），「GSL5 控制台」可直接使用。

## 手动配置参考

```yaml
external_mcp:
  servers:
    gsl5:
      type: http
      url: http://127.0.0.1:9123/message
      headers:
        Authorization: Bearer <banner 中的 Token>
      external_mcp_enable: true
```

## 说明

- Token 持久化在 GSL5 自身数据中，重启服务通常不变；若变化需重新执行 `setup-gsl5`
- 对外暴露时请只监听 `127.0.0.1`，由平台反代/隧道访问
- GSL5（GodzillaSuper）为第三方开源项目，许可见其上游仓库；如用于商业分发请自行确认授权
