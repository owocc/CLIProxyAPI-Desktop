package agents

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"easycliproxyapi/internal/config"
	"easycliproxyapi/internal/core"
	"easycliproxyapi/internal/model"
)

// BackupRootDir returns <base>/backups/agents/<client>.
func BackupDir(clientId string) string {
	return filepath.Join(core.BaseDir(), "backups", "agents", clientId)
}

// CreateBackup creates a backup of the client's current configuration file.
func CreateBackup(clientId string) (*model.BackupEntry, error) {
	paths := ResolveConfigPaths(clientId)
	if len(paths) == 0 {
		return nil, fmt.Errorf("无可用配置路径")
	}

	targetPath := paths[0]
	data, err := os.ReadFile(targetPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil // No existing file to backup
		}
		return nil, err
	}

	bDir := BackupDir(clientId)
	if err := os.MkdirAll(bDir, 0755); err != nil {
		return nil, err
	}

	now := time.Now()
	backupFilename := fmt.Sprintf("%d.bak", now.Unix())
	backupPath := filepath.Join(bDir, backupFilename)

	if err := os.WriteFile(backupPath, data, 0644); err != nil {
		return nil, err
	}

	return &model.BackupEntry{
		Id:            backupFilename,
		ClientId:      clientId,
		CreatedAt:     now.Format("2006-01-02 15:04:05"),
		TimestampUnix: now.Unix(),
		FilePath:      backupPath,
	}, nil
}

// ListBackups lists all backup entries for the given client, newest first.
func ListBackups(clientId string) ([]model.BackupEntry, error) {
	bDir := BackupDir(clientId)
	entries, err := os.ReadDir(bDir)
	if err != nil {
		if os.IsNotExist(err) {
			return []model.BackupEntry{}, nil
		}
		return nil, err
	}

	var results []model.BackupEntry
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".bak") {
			continue
		}

		info, err := e.Info()
		if err != nil {
			continue
		}

		fullPath := filepath.Join(bDir, e.Name())
		results = append(results, model.BackupEntry{
			Id:            e.Name(),
			ClientId:      clientId,
			CreatedAt:     info.ModTime().Format("2006-01-02 15:04:05"),
			TimestampUnix: info.ModTime().Unix(),
			FilePath:      fullPath,
		})
	}

	// Sort newest first
	sort.Slice(results, func(i, j int) bool {
		return results[i].TimestampUnix > results[j].TimestampUnix
	})

	return results, nil
}

// RestoreBackup restores a client's configuration from a specified backup file.
func RestoreBackup(clientId string, backupFileName string) error {
	paths := ResolveConfigPaths(clientId)
	if len(paths) == 0 {
		return fmt.Errorf("无可用目标配置路径")
	}
	targetPath := paths[0]

	backupPath := filepath.Join(BackupDir(clientId), backupFileName)
	data, err := os.ReadFile(backupPath)
	if err != nil {
		return fmt.Errorf("读取备份文件失败: %w", err)
	}

	return config.WriteFileAtomic(targetPath, data, 0644)
}

// RestoreLatestBackup restores the most recent backup.
func RestoreLatestBackup(clientId string) error {
	backups, err := ListBackups(clientId)
	if err != nil || len(backups) == 0 {
		return fmt.Errorf("未找到客户端 %s 的历史备份", clientId)
	}

	return RestoreBackup(clientId, backups[0].Id)
}

// ApplyWithTransaction modifies the client's config with backup and automatic rollback.
func ApplyWithTransaction(clientId, modelName string, port int, apiKey string) error {
	// 1. Create backup if existing config exists
	backup, _ := CreateBackup(clientId)

	// 2. Apply modification
	err := ApplyConfig(clientId, modelName, port, apiKey)
	if err != nil {
		// Rollback if backup exists
		if backup != nil {
			_ = RestoreBackup(clientId, backup.Id)
		}
		return fmt.Errorf("配置写入失败，已自动回滚: %w", err)
	}

	// 3. Post-write validation
	paths := ResolveConfigPaths(clientId)
	if len(paths) > 0 {
		if _, statErr := os.Stat(paths[0]); statErr != nil {
			if backup != nil {
				_ = RestoreBackup(clientId, backup.Id)
			}
			return fmt.Errorf("写入后配置校验失败，已自动回滚")
		}
	}

	return nil
}
