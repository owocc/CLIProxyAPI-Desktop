package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestWriteFileAtomic(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "test.txt")
	content := []byte("hello atomic world")

	if err := WriteFileAtomic(target, content, 0644); err != nil {
		t.Fatalf("WriteFileAtomic error: %v", err)
	}

	read, err := os.ReadFile(target)
	if err != nil {
		t.Fatalf("ReadFile error: %v", err)
	}

	if string(read) != string(content) {
		t.Errorf("content mismatch, expected %s, got %s", content, read)
	}
}

func TestSuppressionTable(t *testing.T) {
	st := &SuppressionTable{hashes: make(map[string]string)}
	path := "/tmp/test-config.yaml"
	content := []byte("debug: true\n")

	st.Record(path, content)

	// First check should match and consume
	if !st.CheckAndConsume(path, content) {
		t.Errorf("expected suppression to succeed")
	}

	// Second check should return false (already consumed)
	if st.CheckAndConsume(path, content) {
		t.Errorf("expected suppression to be false after being consumed")
	}
}
