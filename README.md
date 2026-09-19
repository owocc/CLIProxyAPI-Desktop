# CPA Desktop

CPA Desktop 桌面客户端，基于 [Wails v3](https://v3.wails.io/) + Go + React 18 + TypeScript + Tailwind CSS 构建。

---

## 🛠️ 本地开发环境要求

- **Go**: 1.24+ 或 1.25+
- **Node.js**: 20+ 或 22+ (npm / pnpm / bun)
- **Wails v3 CLI**:
  ```bash
  go install github.com/wailsapp/wails/v3/cmd/wails3@v3.0.0-beta.23
  ```

---

## 🚀 开发模式

启动本地热重载开发模式（前端 Vite + 后端 Go 实时重载）：

```bash
wails3 dev
```

如需单独进行前端页面调试：
```bash
cd frontend
npm run dev
```

---

## 📦 多平台构建与打包指南

所有构建任务均可通过 `wails3 task` 执行：

### 1. macOS (Intel & Apple Silicon)

- **构建本地架构二进制**:
  ```bash
  wails3 task darwin:build
  ```
- **构建 Universal 通用二进制 (同时支持 x86_64 与 arm64)**:
  ```bash
  wails3 task darwin:build:universal
  ```
- **打包为 `.app` 应用包**:
  ```bash
  wails3 task darwin:package
  # 或打包 Universal .app:
  wails3 task darwin:package:universal
  ```
- **打包为 `.dmg` 镜像安装包**:
  ```bash
  wails3 task darwin:package:dmg
  ```
- **打包为便携式 `.zip` 归档包**:
  ```bash
  wails3 task darwin:package:zip
  ```
- **一键构建并打包 Universal .app + .dmg + .zip**:
  ```bash
  wails3 task darwin:package:universal:all
  ```

---

### 2. Windows (amd64 / arm64)

> 提示：在 Windows 上编译无需额外安装 CGO 编译器，Wails v3 支持纯 Go 编译。
> 打包 NSIS 安装包需系统安装有 NSIS（`makensis`）。

- **构建 Windows 可执行程序 (`.exe`)**:
  ```bash
  wails3 task windows:build ARCH=amd64
  ```
- **打包 NSIS 安装程序**:
  ```bash
  wails3 task windows:package ARCH=amd64
  ```
- **打包免安装便携版 `.zip`**:
  ```bash
  wails3 task windows:create:zip ARCH=amd64
  ```
- **一键构建并生成安装包 + 便携 Zip**:
  ```bash
  wails3 task windows:package:all ARCH=amd64
  ```

---

### 3. Linux (Ubuntu / Debian / Fedora / Arch)

> **依赖要求**：Linux 平台构建需要 CGO 支持以及 GTK / WebKitGTK 开发头文件。
> - **Ubuntu / Debian**:
>   ```bash
>   sudo apt-get update && sudo apt-get install -y \
>     libgtk-3-dev libwebkit2gtk-4.1-dev \
>     libgtk-4-dev libwebkitgtk-6.0-dev \
>     pkg-config gcc
>   ```
> - **Fedora / RHEL**:
>   ```bash
>   sudo dnf install gtk3-devel webkit2gtk4.1-devel gtk4-devel webkitgtk6.0-devel gcc pkgconf-pkg-config
>   ```

- **构建 Linux 二进制**:
  ```bash
  wails3 task linux:build ARCH=amd64
  ```
- **打包 `.deb` 安装包 (Debian / Ubuntu)**:
  ```bash
  wails3 task linux:create:deb
  ```
- **打包 `.rpm` 安装包 (Fedora / RHEL)**:
  ```bash
  wails3 task linux:create:rpm
  ```
- **打包免安装便携版 `.tar.gz`**:
  ```bash
  wails3 task linux:create:archive
  ```
- **一键构建并打包 deb + rpm + tar.gz**:
  ```bash
  wails3 task linux:package
  ```

---

## 🤖 GitHub Actions CI/CD 流水线

项目内置了完整的 GitHub Actions 流水线（`.github/workflows/ci.yml`）：

- **触发时机**：
  - 推送版本标签（例如 `git tag v0.1.0 && git push --tags`）时自动触发三大平台构建与 Release 发布。
  - 支持在 GitHub Actions 页面手动运行（`workflow_dispatch`）。
- **构建矩阵**：
  - **macOS**：生成 Universal 通用架构 DMG 安装包与 ZIP 便携包。
  - **Windows**：生成 64 位 NSIS 安装程序与便携 ZIP。
  - **Linux**：生成 DEB 安装包、RPM 安装包与 tar.gz 便携包。
- **自动发布 Release**：
  - 推送 `v*` 标签时，流水线会自动聚合所有平台产物，生成 SHA-256 校验和文件 `checksums.txt`，并自动发布至 GitHub Releases 供用户下载。
