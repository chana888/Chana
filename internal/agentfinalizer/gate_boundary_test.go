package agentfinalizer

import "testing"

// 门禁开关的边界：RequireExecutionEvidence 是唯一能拦住「本轮没跑工具的回答」的开关。
// 修机器人误拦时改的是这个开关的取值来源，所以必须证明开关本身两个方向都还对。
func TestDecideExecutionEvidenceBoundary(t *testing.T) {
	cases := []struct {
		name       string
		require    bool
		wantFinal  bool
		wantReason string
	}{
		{"要求证据且无执行记录 -> 拦住", true, false, ReasonMissingEvidence},
		{"不要求证据且无执行记录 -> 放行", false, true, ReasonVerified},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			d := Decide(nil, Input{
				Response:                 "这是一段正常的回答文本。",
				ConversationID:           "conv-x",
				AssistantMessageID:       "msg-x",
				AgentMode:                "robot",
				MCPExecutionIDs:          nil,
				RequireExecutionEvidence: c.require,
			})
			if d.Finalizable != c.wantFinal {
				t.Fatalf("Finalizable=%v, 期望 %v (reason=%s)", d.Finalizable, c.wantFinal, d.CompletionReason)
			}
			if d.CompletionReason != c.wantReason {
				t.Fatalf("CompletionReason=%q, 期望 %q", d.CompletionReason, c.wantReason)
			}
			if c.wantFinal && d.FinalText != "这是一段正常的回答文本。" {
				t.Fatalf("放行时回答被篡改: %q", d.FinalText)
			}
		})
	}
}
