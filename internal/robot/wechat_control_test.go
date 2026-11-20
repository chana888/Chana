package robot

import (
	"context"
	"testing"
	"time"
)

type controlHandler struct{}

func (controlHandler) HandleMessage(platform, userID, text string) string { return text }

func TestWechatControlBypassesRunningTask(t *testing.T) {
	st := &wechatSenderState{}
	st.runMu.Lock()
	defer st.runMu.Unlock()
	inflight := make(chan struct{}, 1)
	inflight <- struct{}{}
	for _, command := range []string{"停止", "stop", "状态", "status", "任务", "task"} {
		done := make(chan string, 1)
		go func(command string) {
			done <- dispatchWechatMessage(context.Background(), controlHandler{}, st, "test", command, inflight)
		}(command)
		select {
		case got := <-done:
			if got != command {
				t.Fatal("控制命令回复不正确")
			}
		case <-time.After(200 * time.Millisecond):
			t.Fatal("控制命令被长任务阻塞")
		}
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if got := dispatchWechatMessage(ctx, controlHandler{}, st, "test", "普通输入", inflight); got != "" {
		t.Fatal("取消后仍执行排队消息")
	}
}
