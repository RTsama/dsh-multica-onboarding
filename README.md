# dsh-multica-onboarding

DSH 的 Multica 首次引导和设置插件。它在 Web UI 中引导用户输入 Multica API URL 和个人 token，调用镜像内的 `multica` CLI 完成登录，并可选择启动 daemon。

## 兼容基线

- DSH：`0.1.1-rc.2`
- Multica CLI：`0.4.34`
- Node.js：24
- 运行平台：64 位 Linux x86（`linux/amd64`）
- 默认 API URL：`https://multica.nevis.sina.com.cn`

插件同时注册两个 DSH UI 插槽：

- `settings.onboarding`：未登录时显示首次连接弹窗；已配置并登录时自动完成。
- `settings.section`：在设置面板增加 `Multica` 页面，查看状态或重新登录。

Host 端注册：

- `GET /api/dsh-multica/status`
- `POST /api/dsh-multica/configure`

## 安全约束

浏览器不会把 token 写入 localStorage、sessionStorage、URL 或 DSH 设置。每次提交结束后，表单都会清空 token。Host 使用固定路径 `/usr/local/bin/multica`，通过无 shell 的子进程调用：

```text
multica --server-url <API_URL> login --token
```

token 只写入该进程的 stdin，不会进入 argv、日志或 HTTP 响应。登录后的凭据持久化由 Multica CLI 自己管理。

HTTP 接口还包含以下限制：

- POST 只接受 `application/json`，请求体最大 32 KiB。
- status 生成并返回进程级 CSRF token；configure 必须通过 `x-dsh-multica-csrf` 原样提交。
- 不启用 CORS，所有响应均为 `Cache-Control: no-store`。
- API URL 只接受 HTTP(S)，拒绝嵌入凭据、query 和 fragment。
- token 只接受 `mul_...` 或 `mcn_...`，拒绝空白和控制字符。
- CLI 原始 stdout/stderr 不会传给浏览器。

## 配置流程

configure 端点依次执行：

```text
multica --server-url <URL> login --token  # token 走 stdin
multica config set server_url <URL>
multica config set app_url <URL>
multica daemon start                       # 用户勾选时；已运行则跳过
dsh --profile multica --probe              # 只用于显示 runtime 状态
```

本插件只负责 UI 登录流程。目标镜像仍需预装 `multica` CLI 和独立的 `multica` DSH profile（由 `dsh-multica-bridge` 提供）。

## 开发与验收

```bash
pnpm install
pnpm verify
pnpm pack:check
```

`pnpm verify` 会运行类型检查、Host/Client 测试和双入口构建。构建产物：

```text
lib/index.js   # DSH Host 插件
lib/client.js  # window.__ModuleLoader__ Client bundle
```

打包后可将 tgz 放进 DSH 镜像，并在 Web profile 的 bundle patch 中加载。镜像验收至少应确认：

1. 插件可在 DSH `0.1.1-rc.2` Web profile 激活。
2. 设置导航出现 `Multica`，未登录用户出现 onboarding。
3. 使用测试账号登录成功后，`multica auth status` 成功。
4. 勾选启动后，`multica daemon status --output json` 返回 `running`。
5. `dsh --profile multica --probe` 返回 protocol v1 的 DSH probe。

## 内部使用

本仓库用于公司业务场景，当前不提供开源 License，也不发布到公共 npm registry。
