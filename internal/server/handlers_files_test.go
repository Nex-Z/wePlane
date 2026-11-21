package server

import (
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"testing/iotest"
)

func TestInterruptedUploadPreservesOriginal(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "config")
	if err := os.WriteFile(target, []byte("original"), 0600); err != nil {
		t.Fatal(err)
	}
	partial := io.MultiReader(strings.NewReader("partial"), iotest.ErrReader(io.ErrUnexpectedEOF))
	if err := publishUpload(target, partial, true); err == nil {
		t.Fatal("expected upload error")
	}
	data, err := os.ReadFile(target)
	if err != nil || string(data) != "original" {
		t.Fatalf("original changed: %q, %v", data, err)
	}
	entries, err := os.ReadDir(dir)
	if err != nil || len(entries) != 1 {
		t.Fatalf("temporary file left behind: %v, %v", entries, err)
	}
}
