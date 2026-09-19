package agents

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	toml "github.com/pelletier/go-toml/v2"

	"easycliproxyapi/internal/model"
)

// UserHomeDir returns current user's home directory.
func UserHomeDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return "."
	}
	return home
}

// ResolveConfigPaths resolves the list of configuration file paths for a client.
func ResolveConfigPaths(clientId string) []string {
	home := UserHomeDir()

	switch clientId {
	case model.AgentClaudeCode:
		primary := filepath.Join(home, ".claude", "settings.json")
		fallback := filepath.Join(home, ".claude", "claude.json")
		if _, err := os.Stat(fallback); err == nil {
			if _, errP := os.Stat(primary); os.IsNotExist(errP) {
				return []string{fallback}
			}
		}
		return []string{primary}

	case model.AgentCodex:
		codexHome := os.Getenv("CODEX_HOME")
		if codexHome == "" {
			codexHome = filepath.Join(home, ".codex")
		}
		return []string{filepath.Join(codexHome, "config.toml")}

	case model.AgentClaudeDesktop:
		if runtime.GOOS == "darwin" {
			return []string{
				filepath.Join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json"),
			}
		} else if runtime.GOOS == "windows" {
			appData := os.Getenv("APPDATA")
			if appData == "" {
				appData = filepath.Join(home, "AppData", "Roaming")
			}
			return []string{
				filepath.Join(appData, "Claude", "claude_desktop_config.json"),
			}
		} else {
			return []string{
				filepath.Join(home, ".config", "Claude", "claude_desktop_config.json"),
			}
		}

	case model.AgentOpenCode:
		if custom := os.Getenv("OPENCODE_CONFIG"); custom != "" {
			return []string{custom}
		}
		xdg := os.Getenv("XDG_CONFIG_HOME")
		if xdg == "" {
			xdg = filepath.Join(home, ".config")
		}
		return []string{filepath.Join(xdg, "opencode", "opencode.json")}

	case model.AgentOpenClaw:
		return []string{filepath.Join(home, ".openclaw", "openclaw.json")}

	case model.AgentHermes:
		hermesHome := os.Getenv("HERMES_HOME")
		if hermesHome == "" {
			hermesHome = filepath.Join(home, ".hermes")
		}
		return []string{filepath.Join(hermesHome, "config.yaml")}

	case model.AgentDeepSeekHarness:
		dshHome := os.Getenv("DSH_HOME")
		if dshHome == "" {
			dshHome = filepath.Join(home, ".dsh")
		}
		return []string{
			filepath.Join(dshHome, "settings.yaml"),
			filepath.Join(dshHome, ".credentials.yaml"),
		}

	case model.AgentZCode:
		return []string{
			filepath.Join(home, ".zcode", "v2", "config.json"),
			filepath.Join(home, ".zcode", "cli", "config.json"),
		}

	case model.AgentKimiCode:
		kimiHome := os.Getenv("KIMI_CODE_HOME")
		if kimiHome == "" {
			kimiHome = filepath.Join(home, ".kimi-code")
		}
		return []string{filepath.Join(kimiHome, "config.toml")}

	case model.AgentGrokBuild:
		grokHome := os.Getenv("GROK_HOME")
		if grokHome == "" {
			grokHome = filepath.Join(home, ".grok")
		}
		return []string{filepath.Join(grokHome, "config.toml")}

	case model.AgentPi:
		piHome := os.Getenv("PI_CODING_AGENT_DIR")
		if piHome == "" {
			piHome = filepath.Join(home, ".pi", "agent")
		}
		return []string{filepath.Join(piHome, "cliproxyapi.json")}

	default:
		return nil
	}
}

// AgentExecutableDirectories returns an ordered, deduplicated slice of search paths.
func AgentExecutableDirectories(home string) []string {
	var directories []string
	seen := make(map[string]bool)

	push := func(dir string) {
		dir = filepath.Clean(strings.TrimSpace(dir))
		if dir == "" || dir == "." || seen[dir] {
			return
		}
		seen[dir] = true
		directories = append(directories, dir)
	}

	// 1. PATH environment
	pathEnv := os.Getenv("PATH")
	for _, p := range filepath.SplitList(pathEnv) {
		push(p)
	}

	// 2. User local directories
	push(filepath.Join(home, ".local", "bin"))
	push(filepath.Join(home, ".npm-global", "bin"))
	push(filepath.Join(home, ".bun", "bin"))
	push(filepath.Join(home, ".cargo", "bin"))
	push(filepath.Join(home, "bin"))

	// 3. Package manager environment directories
	if p := os.Getenv("PNPM_HOME"); p != "" {
		push(p)
	}
	if b := os.Getenv("BUN_INSTALL"); b != "" {
		push(filepath.Join(b, "bin"))
	}
	if n := os.Getenv("NPM_CONFIG_PREFIX"); n != "" {
		push(filepath.Join(n, "bin"))
	}

	// 4. nvm versions
	nvmDir := filepath.Join(home, ".nvm", "versions", "node")
	if entries, err := os.ReadDir(nvmDir); err == nil {
		for _, e := range entries {
			if e.IsDir() {
				push(filepath.Join(nvmDir, e.Name(), "bin"))
			}
		}
	}

	// 5. fnm versions
	fnmDir := filepath.Join(home, ".local", "state", "fnm_multishells")
	if entries, err := os.ReadDir(fnmDir); err == nil {
		for _, e := range entries {
			if e.IsDir() {
				push(filepath.Join(fnmDir, e.Name(), "bin"))
			}
		}
	}

	// 6. Unix standard locations
	if runtime.GOOS != "windows" {
		push("/usr/local/bin")
		push("/usr/bin")
		push("/bin")
	}

	// 7. macOS Homebrew
	if runtime.GOOS == "darwin" {
		push("/opt/homebrew/bin")
	}

	// 8. Windows directories
	if runtime.GOOS == "windows" {
		if appData := os.Getenv("APPDATA"); appData != "" {
			push(filepath.Join(appData, "npm"))
		}
		if localAppData := os.Getenv("LOCALAPPDATA"); localAppData != "" {
			push(filepath.Join(localAppData, "Microsoft", "WindowsApps"))
		}
	}

	return directories
}

func findNamedAgentExecutable(dirs []string, names []string) string {
	for _, dir := range dirs {
		for _, name := range names {
			var candidates []string
			if runtime.GOOS == "windows" {
				candidates = []string{
					filepath.Join(dir, name+".exe"),
					filepath.Join(dir, name+".cmd"),
					filepath.Join(dir, name+".bat"),
					filepath.Join(dir, name),
				}
			} else {
				candidates = []string{filepath.Join(dir, name)}
			}

			for _, candidate := range candidates {
				if fi, err := os.Stat(candidate); err == nil && !fi.IsDir() {
					return candidate
				}
			}
		}
	}
	return ""
}

// FindClaudeDesktopExecutable locates the Claude Desktop application binary.
func FindClaudeDesktopExecutable(home string) string {
	if runtime.GOOS == "darwin" {
		candidates := []string{
			"/Applications/Claude.app/Contents/MacOS/Claude",
			filepath.Join(home, "Applications", "Claude.app", "Contents", "MacOS", "Claude"),
		}
		for _, c := range candidates {
			if fi, err := os.Stat(c); err == nil && !fi.IsDir() {
				return c
			}
		}
	} else if runtime.GOOS == "windows" {
		local := os.Getenv("LOCALAPPDATA")
		if local == "" {
			local = filepath.Join(home, "AppData", "Local")
		}
		candidates := []string{
			filepath.Join(local, "Programs", "Claude", "Claude.exe"),
			filepath.Join(local, "Claude", "Claude.exe"),
		}
		for _, c := range candidates {
			if fi, err := os.Stat(c); err == nil && !fi.IsDir() {
				return c
			}
		}
	}
	return ""
}

// FindZCodeDesktopExecutable locates the ZCode application binary.
func FindZCodeDesktopExecutable(home string) string {
	if runtime.GOOS == "darwin" {
		candidates := []string{
			"/Applications/ZCode.app/Contents/MacOS/ZCode",
			filepath.Join(home, "Applications", "ZCode.app", "Contents", "MacOS", "ZCode"),
		}
		for _, c := range candidates {
			if fi, err := os.Stat(c); err == nil && !fi.IsDir() {
				return c
			}
		}
	}
	return ""
}

// FindAgentExecutable finds the path to the executable file for the given agent client.
func FindAgentExecutable(clientId string, home string) string {
	dirs := AgentExecutableDirectories(home)

	switch clientId {
	case model.AgentClaudeDesktop:
		return FindClaudeDesktopExecutable(home)
	case model.AgentZCode:
		if p := FindZCodeDesktopExecutable(home); p != "" {
			return p
		}
		return findNamedAgentExecutable(dirs, []string{"zcode"})
	case model.AgentKimiCode:
		kimiBin := filepath.Join(home, ".kimi-code", "bin", "kimi")
		if fi, err := os.Stat(kimiBin); err == nil && !fi.IsDir() {
			return kimiBin
		}
		return findNamedAgentExecutable(dirs, []string{"kimi"})
	case model.AgentGrokBuild:
		grokBin := filepath.Join(home, ".grok", "bin", "grok")
		if fi, err := os.Stat(grokBin); err == nil && !fi.IsDir() {
			return grokBin
		}
		return findNamedAgentExecutable(dirs, []string{"grok"})
	case model.AgentOpenCode:
		if p := findNamedAgentExecutable(dirs, []string{"opencode"}); p != "" {
			return p
		}
		managed := filepath.Join(home, ".opencode", "bin", "opencode")
		if fi, err := os.Stat(managed); err == nil && !fi.IsDir() {
			return managed
		}
		if runtime.GOOS == "darwin" {
			appCli := "/Applications/OpenCode.app/Contents/MacOS/opencode-cli"
			if fi, err := os.Stat(appCli); err == nil && !fi.IsDir() {
				return appCli
			}
			userAppCli := filepath.Join(home, "Applications", "OpenCode.app", "Contents", "MacOS", "opencode-cli")
			if fi, err := os.Stat(userAppCli); err == nil && !fi.IsDir() {
				return userAppCli
			}
		}
		return findNamedAgentExecutable(dirs, []string{"opencode-cli"})
	case model.AgentClaudeCode:
		return findNamedAgentExecutable(dirs, []string{"claude"})
	case model.AgentCodex:
		return findNamedAgentExecutable(dirs, []string{"codex"})
	case model.AgentOpenClaw:
		return findNamedAgentExecutable(dirs, []string{"openclaw"})
	case model.AgentHermes:
		return findNamedAgentExecutable(dirs, []string{"hermes"})
	case model.AgentDeepSeekHarness:
		return findNamedAgentExecutable(dirs, []string{"dsh"})
	case model.AgentPi:
		return findNamedAgentExecutable(dirs, []string{"pi"})
	default:
		return ""
	}
}

// FindDesktopAppInstallation checks if a desktop application bundle/directory is installed.
func FindDesktopAppInstallation(clientId string, home string) string {
	if runtime.GOOS == "darwin" {
		candidates := []string{}
		switch clientId {
		case model.AgentCodex:
			candidates = []string{
				"/Applications/ChatGPT.app",
				filepath.Join(home, "Applications", "ChatGPT.app"),
				"/Applications/Codex.app",
				filepath.Join(home, "Applications", "Codex.app"),
				"/Applications/OpenAI Codex.app",
				"/Applications/OpenAI.Codex.app",
			}
		case model.AgentClaudeDesktop:
			candidates = []string{
				"/Applications/Claude.app",
				filepath.Join(home, "Applications", "Claude.app"),
			}
		case model.AgentOpenCode:
			candidates = []string{
				"/Applications/OpenCode.app",
				filepath.Join(home, "Applications", "OpenCode.app"),
			}
		case model.AgentZCode:
			candidates = []string{
				"/Applications/ZCode.app",
				filepath.Join(home, "Applications", "ZCode.app"),
			}
		}
		for _, c := range candidates {
			if fi, err := os.Stat(c); err == nil && fi.IsDir() {
				return c
			}
		}
	}
	return ""
}

// ReadAgentVersion runs the executable with --version and extracts the detected version string.
func ReadAgentVersion(exePath string, home string) string {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, exePath, "--version")
	// Prepend executable directory to PATH so npm shims can locate their siblings
	exeDir := filepath.Dir(exePath)
	cmd.Env = append(os.Environ(), "PATH="+exeDir+string(os.PathListSeparator)+os.Getenv("PATH"))

	out, err := cmd.CombinedOutput()
	if err != nil && len(out) == 0 {
		return ""
	}

	lines := strings.Split(string(out), "\n")
	for _, line := range lines {
		if v := normalizeDetectedVersion(line); v != "" {
			return v
		}
	}
	return ""
}

func readMacosAppVersion(appPath string) string {
	infoFile := filepath.Join(appPath, "Contents", "Info.plist")
	if _, err := os.Stat(infoFile); err != nil {
		return ""
	}

	for _, key := range []string{"CFBundleShortVersionString", "CFBundleVersion"} {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		cmd := exec.CommandContext(ctx, "/usr/bin/plutil", "-extract", key, "raw", "-o", "-", infoFile)
		out, err := cmd.Output()
		cancel()
		if err == nil {
			if v := normalizeDetectedVersion(string(out)); v != "" {
				return v
			}
		}
	}
	return ""
}

func normalizeDetectedVersion(val string) string {
	val = strings.TrimSpace(val)
	if val == "" || len(val) > 256 {
		return ""
	}
	hasDigit := false
	for i := 0; i < len(val); i++ {
		b := val[i]
		if b >= '0' && b <= '9' {
			hasDigit = true
		}
		if b < 32 && b != '\t' {
			return ""
		}
	}
	if !hasDigit {
		return ""
	}
	return val
}

// DiscoverAgent inspects current client environment and returns its AgentInfo.
func DiscoverAgent(clientId string) model.AgentInfo {
	var (
		name    string
		exeName string
		format  string
		desc    string
		models  []string
	)

	defaultModels := []string{
		"claude-3-7-sonnet-20250219",
		"claude-3-5-sonnet-20241022",
		"claude-3-5-haiku-20241022",
		"gpt-4o",
		"deepseek-r1",
		"deepseek-v3",
	}

	switch clientId {
	case model.AgentClaudeCode:
		name = "Claude Code"
		exeName = "claude"
		format = "JSON"
		desc = "Anthropic 官方终端智能体"
		models = []string{
			"claude-3-7-sonnet-20250219",
			"claude-3-5-sonnet-20241022",
			"claude-3-5-haiku-20241022",
			"claude-3-opus-20240229",
		}

	case model.AgentCodex:
		name = "Codex"
		exeName = "codex"
		format = "TOML"
		desc = "OpenAI Codex CLI 智能体"
		models = []string{"gpt-4o", "o1", "o3-mini", "claude-3-7-sonnet-20250219", "deepseek-r1"}

	case model.AgentClaudeDesktop:
		name = "Claude Desktop"
		exeName = "app"
		format = "JSON"
		desc = "Anthropic 官方桌面客户端"
		models = []string{"claude-3-7-sonnet-20250219", "claude-3-5-sonnet-20241022"}

	case model.AgentOpenCode:
		name = "OpenCode"
		exeName = "opencode"
		format = "JSON5"
		desc = "开源轻量 AI 编程助理"
		models = defaultModels

	case model.AgentOpenClaw:
		name = "OpenClaw"
		exeName = "openclaw"
		format = "JSON5"
		desc = "OpenClaw 智能体系统"
		models = defaultModels

	case model.AgentHermes:
		name = "Hermes Agent"
		exeName = "hermes"
		format = "YAML"
		desc = "Hermes 自动化智能体框架"
		models = defaultModels

	case model.AgentDeepSeekHarness:
		name = "DeepSeek Harness"
		exeName = "dsh"
		format = "YAML"
		desc = "DeepSeek 官方评测测试套件"
		models = []string{"deepseek-r1", "deepseek-v3"}

	case model.AgentZCode:
		name = "ZCode"
		exeName = "zcode"
		format = "JSON"
		desc = "ZCode 编程套件"
		models = defaultModels

	case model.AgentKimiCode:
		name = "Kimi Code"
		exeName = "kimi"
		format = "TOML"
		desc = "Moonshot Kimi Code 编程工具"
		models = []string{"kimi-k1.5", "deepseek-r1", "claude-3-7-sonnet-20250219"}

	case model.AgentGrokBuild:
		name = "Grok Build"
		exeName = "grok"
		format = "TOML"
		desc = "xAI Grok 构建工具"
		models = []string{"grok-2", "deepseek-r1"}

	case model.AgentPi:
		name = "Pi Coding Agent"
		exeName = "pi"
		format = "JSON"
		desc = "Pi 编程客户端"
		models = defaultModels
	}

	home := UserHomeDir()

	// 1. Find executable path and desktop application path
	exePath := FindAgentExecutable(clientId, home)
	appPath := FindDesktopAppInstallation(clientId, home)

	// 2. Read CLI version
	cliVersion := ""
	shouldProbeCli := (clientId != model.AgentClaudeDesktop && clientId != model.AgentZCode)
	if exePath != "" && shouldProbeCli {
		cliVersion = ReadAgentVersion(exePath, home)
	}

	// 3. Read App version
	appVersion := ""
	if appPath != "" && runtime.GOOS == "darwin" {
		appVersion = readMacosAppVersion(appPath)
	}
	if clientId == model.AgentClaudeDesktop && appVersion == "" && exePath != "" && runtime.GOOS == "darwin" {
		// Try resolving .app from executable
		for p := exePath; p != "" && p != "/"; p = filepath.Dir(p) {
			if strings.HasSuffix(p, ".app") {
				appVersion = readMacosAppVersion(p)
				break
			}
		}
	}

	// DeepSeek Harness package.json fallback
	if clientId == model.AgentDeepSeekHarness && cliVersion == "" {
		pkgFile := filepath.Join(home, ".dsh", "package.json")
		if data, err := os.ReadFile(pkgFile); err == nil {
			var pkg struct {
				Version string `json:"version"`
			}
			if err := json.Unmarshal(data, &pkg); err == nil && pkg.Version != "" {
				appVersion = pkg.Version
			}
		}
	}

	version := cliVersion
	if version == "" {
		version = appVersion
	}

	// 4. Determine installation per 04-agents.md §2.1:
	// installed = version.is_some() || (client in {ClaudeDesktop, OpenCode, ZCode} && executable_found) || app_installed
	isDesktopClient := (clientId == model.AgentClaudeDesktop || clientId == model.AgentZCode || clientId == model.AgentOpenCode)
	appInstalled := (appPath != "")
	executableFound := (exePath != "")

	installed := (version != "") || (isDesktopClient && (executableFound || appInstalled)) || appInstalled
	cliInstalled := executableFound

	// 5. Check config files
	configPaths := ResolveConfigPaths(clientId)
	configFound := false
	for _, p := range configPaths {
		if _, err := os.Stat(p); err == nil {
			configFound = true
			break
		}
	}

	// 6. Inspect if currently configured to CPA
	configured, currentModel := inspectConfigured(clientId, configPaths)

	// 7. Check warnings per 04-agents.md §2.2
	var warnings []string
	if !installed && configFound {
		warnings = append(warnings, "只检测到配置文件，未检测到客户端")
	}

	displayPath := exePath
	if displayPath == "" && appPath != "" {
		displayPath = appPath
	}

	return model.AgentInfo{
		Id:              clientId,
		Name:            name,
		Executable:      exeName,
		Format:          format,
		Description:     desc,
		Installed:       installed,
		CliInstalled:    cliInstalled,
		Version:         version,
		CliVersion:      cliVersion,
		AppVersion:      appVersion,
		ExecutablePath:  displayPath,
		ConfigFound:     configFound,
		Configured:      configured,
		CurrentModel:    currentModel,
		ConfigPaths:     configPaths,
		SupportedModels: models,
		Warnings:        warnings,
	}
}

func inspectConfigured(clientId string, paths []string) (bool, string) {
	if len(paths) == 0 {
		return false, ""
	}
	targetPath := paths[0]
	data, err := os.ReadFile(targetPath)
	if err != nil {
		return false, ""
	}

	contentStr := string(data)

	switch clientId {
	case model.AgentClaudeCode:
		var parsed struct {
			Env struct {
				BaseUrl   string `json:"ANTHROPIC_BASE_URL"`
				Model     string `json:"ANTHROPIC_MODEL"`
				AuthToken string `json:"ANTHROPIC_AUTH_TOKEN"`
			} `json:"env"`
		}
		if err := json.Unmarshal(data, &parsed); err == nil {
			if strings.Contains(parsed.Env.BaseUrl, "127.0.0.1") || strings.Contains(parsed.Env.BaseUrl, "localhost") {
				return true, parsed.Env.Model
			}
		}

	case model.AgentCodex:
		var parsed struct {
			ModelProvider string `toml:"model_provider"`
			Model         string `toml:"model"`
		}
		if err := toml.Unmarshal(data, &parsed); err == nil {
			if parsed.ModelProvider == "cpa-gui" {
				return true, parsed.Model
			}
		}

	case model.AgentOpenCode:
		if strings.Contains(contentStr, "cpa-gui") {
			return true, ""
		}

	default:
		if strings.Contains(contentStr, "cpa-gui") || strings.Contains(contentStr, "127.0.0.1") {
			return true, ""
		}
	}

	return false, ""
}

// AllClientIds lists all 11 supported agent targets in order.
var AllClientIds = []string{
	model.AgentClaudeCode,
	model.AgentCodex,
	model.AgentClaudeDesktop,
	model.AgentOpenCode,
	model.AgentOpenClaw,
	model.AgentHermes,
	model.AgentDeepSeekHarness,
	model.AgentZCode,
	model.AgentKimiCode,
	model.AgentGrokBuild,
	model.AgentPi,
}
