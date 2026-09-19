package config

import (
	"strings"
	"testing"

	"easycliproxyapi/internal/model"
)

func TestApplySettingsToYamlASTPreservesComments(t *testing.T) {
	input := `# 这是顶层注释
port: 8317 # 服务端口
host: "127.0.0.1"

# 调试模式
debug: false

# 密钥列表
api-keys:
  - "key1" # 默认 key
  - "key2"
`

	settings := model.CoreSettings{
		Port:  9000,
		Host:  "0.0.0.0",
		Debug: true,
	}
	keys := []string{"new-key-1", "new-key-2"}
	secretKey := "wui-test-secret-key-12345"

	output, err := ApplySettingsToYamlAST([]byte(input), settings, keys, secretKey)
	if err != nil {
		t.Fatalf("ApplySettingsToYamlAST error: %v", err)
	}

	outStr := string(output)
	t.Logf("Output YAML:\n%s", outStr)

	if !strings.Contains(outStr, "# 这是顶层注释") {
		t.Errorf("expected top-level comment preserved")
	}
	if !strings.Contains(outStr, "port: 9000") {
		t.Errorf("expected port updated to 9000")
	}
	if !strings.Contains(outStr, "debug: true") {
		t.Errorf("expected debug updated to true")
	}
	if !strings.Contains(outStr, "new-key-1") {
		t.Errorf("expected new-key-1 in output")
	}
	if !strings.Contains(outStr, "remote-management:") || !strings.Contains(outStr, "secret-key: wui-test-secret-key-12345") {
		t.Errorf("expected remote-management.secret-key in output")
	}
}
