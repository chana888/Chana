package harnessbridge

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestRobotStreamAndMissingFinal(t *testing.T) {
	key := filepath.Join(t.TempDir(), "key")
	if err := os.WriteFile(key, []byte("test-key"), 0600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("DRT_HARNESS_ROBOT_RPC_KEY", key)
	for _, complete := range []bool{true, false} {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Header.Get("X-Harness-Key") != "test-key" || r.URL.Path != "/run" {
				t.Error("身份或调用入口不正确")
			}
			fmt.Fprintln(w, `{"type":"session","session_id":"session-test"}`)
			if complete {
				fmt.Fprintln(w, `{"type":"final","text":"原生回复"}`)
			}
		}))
		t.Setenv("DRT_HARNESS_ROBOT_RPC", srv.URL)
		response, err := RunRobot(context.Background(), RobotRequest{Message: "测试"}, nil)
		srv.Close()
		if complete && (err != nil || response != "原生回复") {
			t.Fatalf("未正确返回最终回复: %v", err)
		}
		if !complete && err == nil {
			t.Fatal("中断的流被当作成功")
		}
	}
}

func TestRobotStreamCancellation(t *testing.T) {
	key := filepath.Join(t.TempDir(), "key")
	_ = os.WriteFile(key, []byte("test-key"), 0600)
	t.Setenv("DRT_HARNESS_ROBOT_RPC_KEY", key)
	started := make(chan struct{})
	disconnected := make(chan struct{})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
		w.(http.Flusher).Flush()
		close(started)
		<-r.Context().Done()
		close(disconnected)
	}))
	defer srv.Close()
	t.Setenv("DRT_HARNESS_ROBOT_RPC", srv.URL)
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { _, err := RunRobot(ctx, RobotRequest{Message: "测试"}, nil); done <- err }()
	<-started
	cancel()
	if err := <-done; !errors.Is(err, context.Canceled) {
		t.Fatalf("取消错误不正确: %v", err)
	}
	select {
	case <-disconnected:
	case <-time.After(time.Second):
		t.Fatal("取消后连接仍在执行")
	}
}
