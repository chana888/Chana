package multiagent

import (
	"context"
	"testing"

	"github.com/cloudwego/eino/adk"
	"go.uber.org/zap"
)

type panicTestAgent struct{}

func (panicTestAgent) Name(context.Context) string        { return "panic-test" }
func (panicTestAgent) Description(context.Context) string { return "" }
func (panicTestAgent) Run(context.Context, *adk.AgentInput, ...adk.AgentRunOption) *adk.AsyncIterator[*adk.AgentEvent] {
	panic("仅用于回归测试")
}

func TestEinoADKRunLoopPanicReturnsError(t *testing.T) {
	result, err := runEinoADKAgentLoop(context.Background(), &einoADKRunLoopArgs{
		DA: panicTestAgent{}, Logger: zap.NewNop(), OrchestratorName: "panic-test",
	}, nil)
	if err == nil || result != nil {
		t.Fatalf("panic 被当作成功返回: %v %v", result, err)
	}
}
