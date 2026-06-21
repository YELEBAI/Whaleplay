# CI 与发布

本项目将 CI 分为质量检查、代码安全和发布三条独立路径，避免把所有工作塞进一个难以维护的 workflow。

## Pull Request 与 main

`.github/workflows/pr-check.yml` 在 PR、merge queue 和 `main` push 上运行。它先按路径判断是否需要前端或 Rust 检查，再由固定名称的 `CI success` job 汇总结果，因此文档-only PR 也能得到明确的成功状态。

- 前端：ESLint、TypeScript build mode、Vitest、Vite production build；
- Rust：`cargo fmt`、Clippy（warnings as errors）、完整测试；
- Node.js、pnpm 和 Rust 版本固定，安装使用 `pnpm-lock.yaml` 与 `Cargo.lock`；
- 外部 Actions 固定到完整 commit SHA，由 Dependabot 维护更新。

## 安全自动化

- `codeql.yml`：在 PR、`main` 和每周计划任务中扫描 JavaScript/TypeScript 与 Rust；
- `dependency-review.yml`：阻止 PR 引入 high/critical 已知漏洞，并展示依赖的 OpenSSF Scorecard 信息；
- `dependabot.yml`：每周分别维护 pnpm、Cargo 和 GitHub Actions，minor/patch 更新按生态分组，major 更新保持单独 PR 以便审阅。

启用分支保护时，建议要求 `CI success`、`Review dependency changes` 和两个 CodeQL language job 通过。

## Release tag

任何 tag push 都会触发 `.github/workflows/release.yml`，不再维护 `v*`、数字前缀等多套匹配规则。正式 tag 使用不带 `v` 的语义化版本，例如：

```bash
git tag 0.2.0
git push upstream 0.2.0
```

workflow 会校验 tag、`apps/desktop/package.json`、`tauri.conf.json` 和 `Cargo.toml` 的版本完全一致；`0.2.0-beta.1` 会生成 prerelease draft。

## 可验证与尽量可重现的发布

发布构建固定 Node.js、pnpm 和 Rust 工具链，强制使用 lockfile，并从 Git commit timestamp 设置 `SOURCE_DATE_EPOCH`。每个平台的 draft release 同时包含 `SHA256SUMS-*.txt`，并通过 GitHub artifact attestation 生成 build provenance。

这些措施让使用者能够验证“文件内容是否匹配 CI 产物、产物由哪个 commit 和 workflow 构建”。它们不承诺跨 runner 的安装包逐字节相同：操作系统镜像、平台打包器、代码签名和公证仍可能写入非确定性元数据。

相关官方资料：

- [GitHub Actions workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)
- [Artifact attestations](https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations/use-artifact-attestations)
- [Dependabot options](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/dependabot-options-reference)
- [CodeQL advanced setup](https://docs.github.com/en/code-security/code-scanning/creating-an-advanced-setup-for-code-scanning/configuring-advanced-setup-for-code-scanning)
- [Tauri Action](https://github.com/tauri-apps/tauri-action)
- [SOURCE_DATE_EPOCH](https://reproducible-builds.org/docs/source-date-epoch/)
