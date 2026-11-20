package knowledge

import (
	"context"
	"strings"
)

// riskTypeCtxKey 用于在检索链路中透传风险类型（分类）。
//
// 背景：主检索链路是 Search → knowledgePipelineRetriever → Eino multiquery → VectorEinoRetriever。
// Eino multiquery 对每个改写后的子查询调用下层 Retrieve 时只传 query 字符串、不透传
// retriever.Option，导致 DSLInfo 里的 risk_type 在这一层丢失，分类过滤实际不生效。
// 用 context 透传可绕开 multiquery 的这层损失。
type riskTypeCtxKey struct{}

// WithRiskType 把风险类型写入 context。
func WithRiskType(ctx context.Context, riskType string) context.Context {
	rt := strings.TrimSpace(riskType)
	if rt == "" {
		return ctx
	}
	return context.WithValue(ctx, riskTypeCtxKey{}, rt)
}

// RiskTypeFromContext 从 context 读取风险类型，未设置时返回空串。
func RiskTypeFromContext(ctx context.Context) string {
	if ctx == nil {
		return ""
	}
	if v, ok := ctx.Value(riskTypeCtxKey{}).(string); ok {
		return v
	}
	return ""
}
