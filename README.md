# AdsPower Steps

`BA` 是 Browser Automation（浏览器自动化）的缩写。

`@lwmacct/260730-ba-steps-adspower` 是公开、可组合的 AdsPower Step Pack。

- Pack ID：`adspower/core`
- `adspower/create-browser`：停止并删除同名 profile，创建并启动新的无头 profile，
  输出 CDP endpoint、profile 信息和浏览器连接参数。

该 Step 是破坏性重建操作：执行时会先停止所有同名 profile，再批量删除它们，然后创建并
启动新 profile。不同名称的 profile 不受影响。

## 输入与传输

- `apiUrl`：AdsPower Local API 根地址，默认 `http://127.0.0.1:50325`。
- `apiKey`：可选 Bearer Token。真实值不应写入可提交的 Baton 示例。
- `browserGatewayUrl`：可选 Browser Gateway 根地址。
- `name`：要重建的 profile 名称。

`browserGatewayUrl` 是可选输入。填写时，Local API 请求通过 Browser Gateway 转发；
留空时直接请求 `apiUrl`。两种模式返回相同的稳定输出字段。

成功输出包含 `endpoint`、`engine`、`browserGatewayUrl`、`profileId` 和
`removedProfileCount`；AdsPower 返回时还包含 `profileNo` 与 `debugPort`。直连模式的
`browserGatewayUrl` 是空字符串，因此下游可始终引用同一字段。

本包只包含 AdsPower Local API Steps，不包含浏览器运行时、产品 workflow、账号服务、
Executor、HTTP Server 或 UI。包根模块默认导出可动态加载的 `adspower/core` Step Pack。

## 本地运行

本仓库可通过开发依赖中的 BA Executor 直接加载包根目录。`pnpm start` 会先构建 Pack，
再启动 HTTP 服务：

```bash
pnpm start
pnpm start -- --port 3001
```

Executor 仅用于本仓库的本地运行和验证，不会打入发布的 Pack。

## 验证

```bash
pnpm install
pnpm check
pnpm pack --pack-destination /tmp
```
