package config

import (
	"bytes"
	"fmt"
	"strconv"

	"gopkg.in/yaml.v3"

	"easycliproxyapi/internal/model"
)

// FindKeyNode finds the key and value nodes in a MappingNode.
func FindKeyNode(mapping *yaml.Node, key string) (keyNode *yaml.Node, valNode *yaml.Node, index int) {
	if mapping == nil || mapping.Kind != yaml.MappingNode {
		return nil, nil, -1
	}

	for i := 0; i < len(mapping.Content)-1; i += 2 {
		k := mapping.Content[i]
		if k.Value == key {
			return k, mapping.Content[i+1], i
		}
	}
	return nil, nil, -1
}

// SetScalar updates or creates a scalar key-value in a MappingNode while preserving comments.
func SetScalar(mapping *yaml.Node, key string, value string, tag string) {
	_, valNode, _ := FindKeyNode(mapping, key)
	if valNode != nil {
		valNode.Kind = yaml.ScalarNode
		valNode.Value = value
		valNode.Tag = tag
		return
	}

	// Not found, append new key and value
	keyNode := &yaml.Node{
		Kind:  yaml.ScalarNode,
		Tag:   "!!str",
		Value: key,
	}
	valNode = &yaml.Node{
		Kind:  yaml.ScalarNode,
		Tag:   tag,
		Value: value,
	}
	mapping.Content = append(mapping.Content, keyNode, valNode)
}

// SetString updates a string property.
func SetString(mapping *yaml.Node, key string, value string) {
	SetScalar(mapping, key, value, "!!str")
}

// SetInt updates an int property.
func SetInt(mapping *yaml.Node, key string, value int) {
	SetScalar(mapping, key, strconv.Itoa(value), "!!int")
}

// SetBool updates a bool property.
func SetBool(mapping *yaml.Node, key string, value bool) {
	valStr := "false"
	if value {
		valStr = "true"
	}
	SetScalar(mapping, key, valStr, "!!bool")
}

// SetIntIfPresentOrPositive sets the int if it already exists or value > 0.
func SetIntIfPresentOrPositive(mapping *yaml.Node, key string, val int) {
	_, valNode, _ := FindKeyNode(mapping, key)
	if valNode != nil || val > 0 {
		SetInt(mapping, key, val)
	}
}

// SetBoolIfPresentOrTrue sets the boolean if it exists or value is true.
func SetBoolIfPresentOrTrue(mapping *yaml.Node, key string, val bool) {
	_, valNode, _ := FindKeyNode(mapping, key)
	if valNode != nil || val {
		SetBool(mapping, key, val)
	}
}

// SetStringList updates or sets a sequence of strings (e.g., api-keys).
func SetStringList(mapping *yaml.Node, key string, items []string) {
	_, valNode, _ := FindKeyNode(mapping, key)
	if valNode != nil && valNode.Kind == yaml.SequenceNode {
		// Clear existing items while preserving head/line comment of the sequence
		valNode.Content = make([]*yaml.Node, 0, len(items))
		for _, item := range items {
			valNode.Content = append(valNode.Content, &yaml.Node{
				Kind:  yaml.ScalarNode,
				Tag:   "!!str",
				Value: item,
			})
		}
		return
	}

	// Create new sequence
	keyNode := &yaml.Node{
		Kind:  yaml.ScalarNode,
		Tag:   "!!str",
		Value: key,
	}
	seqNode := &yaml.Node{
		Kind:    yaml.SequenceNode,
		Tag:     "!!seq",
		Content: make([]*yaml.Node, 0, len(items)),
	}
	for _, item := range items {
		seqNode.Content = append(seqNode.Content, &yaml.Node{
			Kind:  yaml.ScalarNode,
			Tag:   "!!str",
			Value: item,
		})
	}

	if valNode != nil {
		// Replace non-sequence with sequence
		for i := 0; i < len(mapping.Content)-1; i += 2 {
			if mapping.Content[i].Value == key {
				mapping.Content[i+1] = seqNode
				return
			}
		}
	} else {
		mapping.Content = append(mapping.Content, keyNode, seqNode)
	}
}

// GetMappingRoot returns the root mapping node inside a yaml document.
func GetMappingRoot(doc *yaml.Node) (*yaml.Node, error) {
	if doc == nil || doc.Kind != yaml.DocumentNode || len(doc.Content) == 0 {
		return nil, fmt.Errorf("无效的 YAML 文档结构")
	}
	root := doc.Content[0]
	if root.Kind != yaml.MappingNode {
		return nil, fmt.Errorf("YAML 根节点非映射结构")
	}
	return root, nil
}

// ApplySettingsToYamlAST modifies the YAML bytes preserving all comments and structure.
func ApplySettingsToYamlAST(originalYaml []byte, settings model.CoreSettings, apiKeys []string) ([]byte, error) {
	var doc yaml.Node
	if len(bytes.TrimSpace(originalYaml)) == 0 {
		doc = yaml.Node{
			Kind: yaml.DocumentNode,
			Content: []*yaml.Node{
				{
					Kind:    yaml.MappingNode,
					Tag:     "!!map",
					Content: []*yaml.Node{},
				},
			},
		}
	} else {
		if err := yaml.Unmarshal(originalYaml, &doc); err != nil {
			return nil, fmt.Errorf("解析 YAML 结构失败: %w", err)
		}
	}

	mapping, err := GetMappingRoot(&doc)
	if err != nil {
		return nil, err
	}

	// Always ensure core network parameters
	if settings.Port > 0 {
		SetInt(mapping, "port", settings.Port)
	}
	if settings.Host != "" {
		SetString(mapping, "host", settings.Host)
	}
	if settings.AuthDir != "" {
		SetString(mapping, "auth-dir", settings.AuthDir)
	}

	SetBool(mapping, "debug", settings.Debug)
	SetBoolIfPresentOrTrue(mapping, "commercial-mode", settings.CommercialMode)
	SetBoolIfPresentOrTrue(mapping, "logging-to-file", settings.LoggingToFile)
	SetIntIfPresentOrPositive(mapping, "logs-max-total-size-mb", settings.LogsMaxTotalSizeMB)
	SetIntIfPresentOrPositive(mapping, "error-logs-max-files", settings.ErrorLogsMaxFiles)
	SetBoolIfPresentOrTrue(mapping, "usage-statistics-enabled", settings.UsageStatisticsEnabled)
	SetIntIfPresentOrPositive(mapping, "redis-usage-queue-retention-seconds", settings.RedisUsageQueueRetentionSeconds)
	SetBoolIfPresentOrTrue(mapping, "request-log", settings.RequestLog)

	if settings.RoutingStrategy != "" {
		SetString(mapping, "routing-strategy", settings.RoutingStrategy)
	}

	if settings.ProxyUrl != "" {
		SetString(mapping, "proxy-url", settings.ProxyUrl)
	} else {
		_, valNode, _ := FindKeyNode(mapping, "proxy-url")
		if valNode != nil {
			SetString(mapping, "proxy-url", "")
		}
	}

	SetIntIfPresentOrPositive(mapping, "request-retry", settings.RequestRetry)

	// Apply api-keys if provided
	if apiKeys != nil {
		SetStringList(mapping, "api-keys", apiKeys)
	}

	// Encode back with preserved comments and style
	var buf bytes.Buffer
	enc := yaml.NewEncoder(&buf)
	enc.SetIndent(2)
	if err := enc.Encode(&doc); err != nil {
		return nil, fmt.Errorf("序列化 YAML 失败: %w", err)
	}
	_ = enc.Close()

	return buf.Bytes(), nil
}
