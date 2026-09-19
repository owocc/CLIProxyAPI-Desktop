package core

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"easycliproxyapi/internal/model"
)

const (
	UpstreamRepo = "router-for-me/CLIProxyAPI"
)

type Installer struct {
	mu         sync.Mutex
	activeTask model.CoreInstallTask
	cancelFn   context.CancelFunc
	onProgress func(model.CoreInstallTask)
}

func NewInstaller(onProgress func(model.CoreInstallTask)) *Installer {
	return &Installer{
		onProgress: onProgress,
	}
}

// PlatformAssetSpec returns expected asset name pattern and archive format.
func PlatformAssetSpec(version string) (assetName string, archiveKind string, err error) {
	var assetOS string
	switch runtime.GOOS {
	case "darwin":
		assetOS = "darwin"
		archiveKind = "tar.gz"
	case "linux":
		assetOS = "linux"
		archiveKind = "tar.gz"
	case "windows":
		assetOS = "windows"
		archiveKind = "zip"
	default:
		return "", "", fmt.Errorf("不支持的操作系统: %s", runtime.GOOS)
	}

	var assetArch string
	switch runtime.GOARCH {
	case "amd64":
		assetArch = "amd64"
	case "arm64":
		assetArch = "aarch64"
	default:
		return "", "", fmt.Errorf("不支持的 CPU 架构: %s", runtime.GOARCH)
	}

	cleanVer := strings.TrimPrefix(version, "v")
	assetName = fmt.Sprintf("CLIProxyAPI_%s_%s_%s.%s", cleanVer, assetOS, assetArch, archiveKind)
	return assetName, archiveKind, nil
}

// CheckLatestRelease fetches latest release metadata from GitHub or specified mirror.
func CheckLatestRelease(source string) (*model.ReleaseInfo, error) {
	client := &http.Client{Timeout: 15 * time.Second}

	apiUrl := fmt.Sprintf("https://api.github.com/repos/%s/releases/latest", UpstreamRepo)
	downloadPrefix := ""

	switch source {
	case "gh-proxy":
		downloadPrefix = "https://gh-proxy.com/"
	case "gh-fast":
		downloadPrefix = "https://ghfast.top/"
	case "github", "":
		// Direct
	default:
		if strings.HasPrefix(source, "http://") || strings.HasPrefix(source, "https://") {
			downloadPrefix = strings.TrimRight(source, "/") + "/"
		}
	}

	reqUrl := apiUrl
	if downloadPrefix != "" {
		reqUrl = downloadPrefix + apiUrl
	}

	req, err := http.NewRequest("GET", reqUrl, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "EasyCLIProxyAPI-GUI")
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	resp, err := client.Do(req)
	if err != nil {
		// Fallback to direct github if mirror failed
		if downloadPrefix != "" {
			reqDirect, _ := http.NewRequest("GET", apiUrl, nil)
			reqDirect.Header.Set("User-Agent", "EasyCLIProxyAPI-GUI")
			resp, err = client.Do(reqDirect)
		}
		if err != nil {
			return nil, fmt.Errorf("检查最新版本失败: %w", err)
		}
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GitHub API 返回状态码: %d", resp.StatusCode)
	}

	var ghRelease struct {
		TagName     string `json:"tag_name"`
		Name        string `json:"name"`
		Body        string `json:"body"`
		PublishedAt string `json:"published_at"`
		Assets      []struct {
			Name               string `json:"name"`
			BrowserDownloadUrl string `json:"browser_download_url"`
			Size               int64  `json:"size"`
		} `json:"assets"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&ghRelease); err != nil {
		return nil, fmt.Errorf("解析 GitHub Release 失败: %w", err)
	}

	cleanVer := strings.TrimPrefix(ghRelease.TagName, "v")
	var assets []model.ReleaseAsset
	for _, a := range ghRelease.Assets {
		dlUrl := a.BrowserDownloadUrl
		if downloadPrefix != "" && !strings.HasPrefix(dlUrl, downloadPrefix) {
			dlUrl = downloadPrefix + dlUrl
		}
		assets = append(assets, model.ReleaseAsset{
			Name:        a.Name,
			DownloadUrl: dlUrl,
			Size:        a.Size,
		})
	}

	return &model.ReleaseInfo{
		Version:      cleanVer,
		TagName:      ghRelease.TagName,
		ReleaseNotes: ghRelease.Body,
		PublishedAt:  ghRelease.PublishedAt,
		Assets:       assets,
	}, nil
}

// GetTask returns a snapshot of the current install task.
func (in *Installer) GetTask() model.CoreInstallTask {
	in.mu.Lock()
	defer in.mu.Unlock()
	return in.activeTask
}

// Cancel cancels the active install task if running.
func (in *Installer) Cancel() error {
	in.mu.Lock()
	defer in.mu.Unlock()
	if in.cancelFn != nil {
		in.cancelFn()
		in.cancelFn = nil
	}
	return nil
}

// InstallVersion downloads and installs the core version.
func (in *Installer) InstallVersion(version string, source string) error {
	in.mu.Lock()
	if in.activeTask.Running {
		in.mu.Unlock()
		return fmt.Errorf("已有内核安装任务正在运行")
	}

	ctx, cancel := context.WithCancel(context.Background())
	in.cancelFn = cancel
	in.activeTask = model.CoreInstallTask{
		Running:     true,
		Cancellable: true,
		Phase:       "准备安装",
		Percentage:  0,
	}
	in.updateTaskLocked()
	in.mu.Unlock()

	defer func() {
		in.mu.Lock()
		in.activeTask.Running = false
		in.cancelFn = nil
		in.updateTaskLocked()
		in.mu.Unlock()
	}()

	err := in.installVersionInner(ctx, version, source)
	if err != nil {
		errMsg := err.Error()
		in.mu.Lock()
		in.activeTask.Error = &errMsg
		in.activeTask.Phase = "安装失败"
		in.updateTaskLocked()
		in.mu.Unlock()
		return err
	}

	in.mu.Lock()
	in.activeTask.Phase = "安装完成"
	in.activeTask.Percentage = 100
	in.updateTaskLocked()
	in.mu.Unlock()
	return nil
}

func (in *Installer) installVersionInner(ctx context.Context, version string, source string) error {
	in.setPhase("获取版本信息", 5)

	rel, err := CheckLatestRelease(source)
	if err != nil && version == "" {
		return err
	}

	targetVersion := version
	if targetVersion == "" && rel != nil {
		targetVersion = rel.Version
	}

	targetAssetName, archiveKind, err := PlatformAssetSpec(targetVersion)
	if err != nil {
		return err
	}

	// Locate asset in release or construct URL directly
	var downloadUrl string
	var expectedSize int64
	if rel != nil {
		for _, a := range rel.Assets {
			if a.Name == targetAssetName {
				downloadUrl = a.DownloadUrl
				expectedSize = a.Size
				break
			}
		}
	}

	if downloadUrl == "" {
		// Construct direct URL
		cleanVer := strings.TrimPrefix(targetVersion, "v")
		tag := "v" + cleanVer
		directUrl := fmt.Sprintf("https://github.com/%s/releases/download/%s/%s", UpstreamRepo, tag, targetAssetName)
		downloadPrefix := ""
		switch source {
		case "gh-proxy":
			downloadPrefix = "https://gh-proxy.com/"
		case "gh-fast":
			downloadPrefix = "https://ghfast.top/"
		}
		if downloadPrefix != "" {
			directUrl = downloadPrefix + directUrl
		}
		downloadUrl = directUrl
	}

	// Prepare directories
	stagingDir := StagingDir()
	downloadDir := DownloadDir()
	_ = os.RemoveAll(stagingDir)
	_ = os.RemoveAll(downloadDir)
	_ = os.MkdirAll(stagingDir, 0755)
	_ = os.MkdirAll(downloadDir, 0755)
	defer func() {
		_ = os.RemoveAll(stagingDir)
		_ = os.RemoveAll(downloadDir)
	}()

	archivePath := filepath.Join(downloadDir, targetAssetName)

	in.setPhase("下载内核中", 10)

	// Stream download with progress
	req, err := http.NewRequestWithContext(ctx, "GET", downloadUrl, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", "EasyCLIProxyAPI-GUI")

	client := &http.Client{Timeout: 10 * time.Minute}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("下载内核失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("下载失败，HTTP 状态码: %d", resp.StatusCode)
	}

	totalBytes := resp.ContentLength
	if totalBytes <= 0 && expectedSize > 0 {
		totalBytes = expectedSize
	}

	out, err := os.Create(archivePath)
	if err != nil {
		return err
	}
	defer out.Close()

	hasher := sha256.New()
	writer := io.MultiWriter(out, hasher)

	buf := make([]byte, 32*1024)
	var downloadedBytes int64

	for {
		select {
		case <-ctx.Done():
			return fmt.Errorf("用户取消下载")
		default:
		}

		n, readErr := resp.Body.Read(buf)
		if n > 0 {
			_, writeErr := writer.Write(buf[:n])
			if writeErr != nil {
				return writeErr
			}
			downloadedBytes += int64(n)

			pct := float64(10)
			if totalBytes > 0 {
				pct = 10 + (float64(downloadedBytes)/float64(totalBytes))*70
			}
			in.setProgress("下载内核中", pct, downloadedBytes, totalBytes)
		}
		if readErr != nil {
			if readErr == io.EOF {
				break
			}
			return readErr
		}
	}

	_ = out.Close()
	_ = hex.EncodeToString(hasher.Sum(nil))

	in.setPhase("解压中", 85)

	// Unpack archive into staging
	if archiveKind == "tar.gz" {
		if err := extractTarGz(archivePath, stagingDir); err != nil {
			return fmt.Errorf("解压 tar.gz 失败: %w", err)
		}
	} else if archiveKind == "zip" {
		if err := extractZip(archivePath, stagingDir); err != nil {
			return fmt.Errorf("解压 zip 失败: %w", err)
		}
	}

	// Verify binary was unpacked
	binPath := FindCoreBinary(stagingDir)
	if binPath == "" {
		return fmt.Errorf("解压后未找到 CPA 内核二进制文件")
	}

	in.setPhase("迁移配置与元数据", 92)

	// Write cpa-gui-meta.json into staging
	meta := model.CoreMeta{
		Version:         targetVersion,
		AssetName:       targetAssetName,
		InstalledAtUnix: time.Now().Unix(),
	}
	metaBytes, _ := json.MarshalIndent(meta, "", "  ")
	_ = os.WriteFile(filepath.Join(stagingDir, "cpa-gui-meta.json"), metaBytes, 0644)

	// Overlay staging to install_dir
	in.setPhase("安装落盘中", 96)
	installDir := InstallDir()
	if err := OverlayInstallDir(stagingDir, installDir); err != nil {
		return fmt.Errorf("内核落盘失败: %w", err)
	}

	return nil
}

func (in *Installer) setPhase(phase string, pct float64) {
	in.mu.Lock()
	in.activeTask.Phase = phase
	in.activeTask.Percentage = pct
	in.updateTaskLocked()
	in.mu.Unlock()
}

func (in *Installer) setProgress(phase string, pct float64, downloaded, total int64) {
	in.mu.Lock()
	in.activeTask.Phase = phase
	in.activeTask.Percentage = pct
	in.activeTask.DownloadedBytes = downloaded
	in.activeTask.TotalBytes = total
	in.updateTaskLocked()
	in.mu.Unlock()
}

func (in *Installer) updateTaskLocked() {
	if in.onProgress != nil {
		in.onProgress(in.activeTask)
	}
}

// OverlayInstallDir applies files from staging to installDir without deleting user files.
func OverlayInstallDir(stagingDir, installDir string) error {
	if _, err := os.Stat(installDir); os.IsNotExist(err) {
		return os.Rename(stagingDir, installDir)
	}

	return filepath.Walk(stagingDir, func(srcPath string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(stagingDir, srcPath)
		if err != nil {
			return err
		}
		if rel == "." {
			return nil
		}

		destPath := filepath.Join(installDir, rel)
		if info.IsDir() {
			return os.MkdirAll(destPath, 0755)
		}

		// Atomic file replace
		return atomicCopyFile(srcPath, destPath, info.Mode())
	})
}

func atomicCopyFile(src, dest string, mode os.FileMode) error {
	dir := filepath.Dir(dest)
	_ = os.MkdirAll(dir, 0755)

	tmp := filepath.Join(dir, fmt.Sprintf(".replace.%d.%s", time.Now().UnixNano(), filepath.Base(dest)))
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.OpenFile(tmp, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode)
	if err != nil {
		return err
	}

	if _, err := io.Copy(out, in); err != nil {
		_ = out.Close()
		_ = os.Remove(tmp)
		return err
	}
	_ = out.Sync()
	_ = out.Close()

	// Rename temp to dest
	if err := os.Rename(tmp, dest); err != nil {
		_ = os.Remove(dest)
		if err2 := os.Rename(tmp, dest); err2 != nil {
			_ = os.Remove(tmp)
			return err2
		}
	}
	return nil
}

func extractTarGz(archive, dest string) error {
	f, err := os.Open(archive)
	if err != nil {
		return err
	}
	defer f.Close()

	gz, err := gzip.NewReader(f)
	if err != nil {
		return err
	}
	defer gz.Close()

	tr := tar.NewReader(gz)
	for {
		header, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}

		cleanPath := filepath.Clean(header.Name)
		if strings.HasPrefix(cleanPath, "..") || strings.HasPrefix(cleanPath, "/") {
			continue
		}
		target := filepath.Join(dest, cleanPath)

		switch header.Typeflag {
		case tar.TypeDir:
			_ = os.MkdirAll(target, 0755)
		case tar.TypeReg:
			_ = os.MkdirAll(filepath.Dir(target), 0755)
			outFile, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, os.FileMode(header.Mode))
			if err != nil {
				return err
			}
			if _, err := io.Copy(outFile, tr); err != nil {
				_ = outFile.Close()
				return err
			}
			_ = outFile.Close()
		}
	}
	return nil
}

func extractZip(archive, dest string) error {
	r, err := zip.OpenReader(archive)
	if err != nil {
		return err
	}
	defer r.Close()

	for _, f := range r.File {
		cleanPath := filepath.Clean(f.Name)
		if strings.HasPrefix(cleanPath, "..") || strings.HasPrefix(cleanPath, "/") {
			continue
		}
		target := filepath.Join(dest, cleanPath)

		if f.FileInfo().IsDir() {
			_ = os.MkdirAll(target, 0755)
			continue
		}

		_ = os.MkdirAll(filepath.Dir(target), 0755)
		rc, err := f.Open()
		if err != nil {
			return err
		}

		outFile, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, f.Mode())
		if err != nil {
			_ = rc.Close()
			return err
		}

		_, copyErr := io.Copy(outFile, rc)
		_ = outFile.Close()
		_ = rc.Close()
		if copyErr != nil {
			return copyErr
		}
	}
	return nil
}
