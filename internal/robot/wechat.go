package robot

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"chana/internal/config"
	"chana/internal/robot/ilink"

	"go.uber.org/zap"
)

const (
	wechatReconnectInitial = 5 * time.Second
	wechatReconnectMax     = 60 * time.Second
	wechatPlatform         = "wechat"

	// 同时在跑的消息条数上限：用户连发时不要一次把 agent 打爆。
	wechatMaxInflight = 3
	// 超过这个时长还没跑完，就先回一条回执。iLink 的 context_token 有有效期，
	// 而且用户需要知道机器人确实收到了，而不是一片空白。
	wechatAckDelay = 8 * time.Second
	wechatAckText  = "已收到，正在处理中。这一步可能要跑几分钟，完成后会自动把结果发给你。"
)

// wechatSenderState 记录某个发送者的状态。
// 注意是两个独立的锁：runMu 串行化该发送者的 agent 轮次（保持「一个会话同时只跑一轮」
// 的既有语义），tokenMu 只保护 context_token —— 绝不能把两者合并，
// 否则轮询循环更新 token 时会被长时间的 agent 运行阻塞，等于没修。
type wechatSenderState struct {
	runMu   sync.Mutex
	tokenMu sync.Mutex
	token   string
}

func (s *wechatSenderState) setToken(t string) {
	s.tokenMu.Lock()
	s.token = t
	s.tokenMu.Unlock()
}

// currentToken 返回该发送者最近一次收到的 context_token（发回复必须带它）。
func (s *wechatSenderState) currentToken() string {
	s.tokenMu.Lock()
	defer s.tokenMu.Unlock()
	return s.token
}

var (
	wechatSendersMu sync.Mutex
	wechatSenders   = map[string]*wechatSenderState{}
)

func wechatSender(userID string) *wechatSenderState {
	wechatSendersMu.Lock()
	defer wechatSendersMu.Unlock()
	st, ok := wechatSenders[userID]
	if !ok {
		st = &wechatSenderState{}
		wechatSenders[userID] = st
	}
	return st
}

// StartWechat 启动微信 iLink 长轮询（无需公网回调），收到消息后调用 handler 并回复。
func StartWechat(ctx context.Context, robotsCfg config.RobotsConfig, h MessageHandler, appVersion string, logger *zap.Logger) {
	cfg := robotsCfg.Wechat
	if !cfg.Enabled || cfg.BotToken == "" {
		return
	}
	go runWechatLoop(ctx, cfg, h, appVersion, logger)
}

func runWechatLoop(ctx context.Context, cfg config.RobotWechatConfig, h MessageHandler, appVersion string, logger *zap.Logger) {
	backoff := wechatReconnectInitial
	for {
		err := runWechatPoll(ctx, cfg, h, appVersion, logger)
		if ctx.Err() != nil {
			logger.Info("微信 iLink 长轮询已按配置关闭")
			return
		}
		if err != nil {
			logger.Warn("微信 iLink 长轮询异常，将自动重连", zap.Error(err), zap.Duration("retry_after", backoff))
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(backoff):
			if backoff < wechatReconnectMax {
				backoff *= 2
				if backoff > wechatReconnectMax {
					backoff = wechatReconnectMax
				}
			}
		}
	}
}

func runWechatPoll(ctx context.Context, cfg config.RobotWechatConfig, h MessageHandler, appVersion string, logger *zap.Logger) error {
	client := ilink.NewClient(cfg.BaseURL, cfg.BotToken, cfg.BotAgent, ilink.BuildClientVersion(appVersion))
	buf := cfg.GetUpdatesBuf
	inflight := make(chan struct{}, wechatMaxInflight)
	logger.Info("微信 iLink 长轮询已启动", zap.String("ilink_bot_id", cfg.ILinkBotID))
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}
		resp, err := client.GetUpdates(ctx, buf)
		if err != nil {
			return err
		}
		if resp.ErrCode != 0 && resp.Ret != 0 {
			logger.Warn("微信 getUpdates 返回错误", zap.Int("errcode", resp.ErrCode), zap.String("errmsg", resp.ErrMsg))
		}
		if resp.GetUpdatesBuf != "" {
			buf = resp.GetUpdatesBuf
		}
		for _, msg := range resp.Msgs {
			if msg.MessageType != 1 {
				continue
			}
			text := ilink.ExtractText(msg)
			if text == "" {
				continue
			}
			userID := strings.TrimSpace(msg.FromUserID)
			if userID == "" {
				continue
			}
			st := wechatSender(userID)
			st.setToken(msg.ContextToken)
			if strings.TrimSpace(msg.ContextToken) == "" {
				logger.Warn("微信消息未携带 context_token，回复必然无法送达", zap.String("from", userID))
			}
			logger.Info("微信收到消息",
				zap.String("from", userID),
				zap.String("content", text),
				zap.String("context_token_fp", tokenFingerprint(msg.ContextToken)))
			// 关键：不要在长轮询循环里同步跑 agent。同步跑会把整条长轮询卡死 ——
			// 期间 GetUpdates 不再被调用（新消息收不到），回复也只能等这一轮跑完才发得出去。
			go handleWechatMessage(ctx, client, h, st, userID, text, inflight, logger)
		}
	}
}

// handleWechatMessage 处理单条微信消息：长任务先回执 -> 跑 agent -> 推送结果。
// 全程在独立 goroutine 里，不阻塞长轮询。
func handleWechatMessage(ctx context.Context, client *ilink.Client, h MessageHandler, st *wechatSenderState, userID, text string, inflight chan struct{}, logger *zap.Logger) {
	// 回执计时器先起：即使正在排队等槽位，用户也能尽快收到「已收到」
	ackDone := make(chan struct{})
	ackTimer := time.AfterFunc(wechatAckDelay, func() {
		defer close(ackDone)
		if err := client.SendTextMessage(ctx, userID, st.currentToken(), wechatAckText, ""); err != nil {
			logger.Warn("微信发送回执失败", zap.String("to", userID), zap.Error(err))
		} else {
			logger.Info("微信回执已送达", zap.String("to", userID))
		}
	})
	defer ackTimer.Stop()

	started := time.Now()
	reply := dispatchWechatMessage(ctx, h, st, userID, text, inflight)
	elapsed := time.Since(started)

	// 回执若已触发，等它发完再发结果，避免顺序颠倒（先结果后「已收到」）
	if !ackTimer.Stop() {
		<-ackDone
	}
	logger.Info("微信消息处理完成",
		zap.String("from", userID),
		zap.Duration("elapsed", elapsed),
		zap.Int("reply_len", len(reply)))
	if strings.TrimSpace(reply) == "" {
		return
	}
	if err := client.SendTextMessage(ctx, userID, st.currentToken(), reply, ""); err != nil {
		logger.Warn("微信发送回复失败", zap.String("to", userID), zap.Error(err))
	} else {
		logger.Info("微信回复已送达", zap.String("to", userID), zap.Int("reply_len", len(reply)))
	}
}

// 停止与状态命令不能排在耗时的模型任务之后，鉴权仍由消息处理器执行。
func wechatImmediateCommand(text string) bool {
	switch strings.TrimSpace(text) {
	case "停止", "stop", "状态", "status", "任务", "task":
		return true
	}
	return false
}

func dispatchWechatMessage(ctx context.Context, h MessageHandler, st *wechatSenderState, userID, text string, inflight chan struct{}) string {
	if wechatImmediateCommand(text) {
		return h.HandleMessage(wechatPlatform, userID, text)
	}
	select {
	case inflight <- struct{}{}:
		defer func() { <-inflight }()
	case <-ctx.Done():
		return ""
	}
	st.runMu.Lock()
	defer st.runMu.Unlock()
	if ctx.Err() != nil {
		return ""
	}
	return h.HandleMessage(wechatPlatform, userID, text)
}

// tokenFingerprint 只输出 context_token 的长度与前 8 位，用于排查发送被拒是
// 不是 token 缺失/失效导致，不泄露完整 token。
func tokenFingerprint(t string) string {
	t = strings.TrimSpace(t)
	if t == "" {
		return "<empty>"
	}
	if len(t) <= 8 {
		return fmt.Sprintf("len=%d", len(t))
	}
	return fmt.Sprintf("len=%d/%s...", len(t), t[:8])
}
