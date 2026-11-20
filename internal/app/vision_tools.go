package app

import (
	"chana/internal/config"
	"chana/internal/mcp"
	"chana/internal/vision"

	"go.uber.org/zap"
)

func registerVisionTools(mcpServer *mcp.Server, cfg *config.Config, logger *zap.Logger) {
	vision.RegisterAnalyzeImageTool(mcpServer, cfg, logger)
}
