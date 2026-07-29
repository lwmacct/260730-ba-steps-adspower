# AdsPower Steps

`@lwmacct/260730-ba-steps-adspower` 是公开、可组合的 AdsPower Step Pack。

- Pack ID：`adspower/core`
- `adspower/create-browser`：停止并删除同名 profile，创建并启动新的无头 profile，
  输出 CDP endpoint、profile 信息和浏览器连接参数。

`browserGatewayUrl` 是可选输入。填写时，Local API 请求通过 Browser Gateway 转发；
留空时直接请求 `apiUrl`。无论使用哪种模式，输出都可直接交给
`@lwmacct/260730-ba-steps-browser` 的 `browser/connect`。

本包不包含浏览器连接、OpenAI、Grok、账号服务、Executor 或 HTTP Server。

```bash
pnpm install
pnpm check
```

Executor 组合示例：

```bash
ba-executor serve \
  --pack @lwmacct/260730-ba-steps-adspower \
  --pack @lwmacct/260730-ba-steps-browser \
  --pack @lwmacct/260508-ba-steps-openai
```
