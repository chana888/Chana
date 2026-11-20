package database

import "time"

// RecoverStaleAssistantPlaceholders 把上次进程退出时残留的「处理中...」助手占位
// 标记为已中断。服务启动时不可能还有任务在运行，这些占位如果不清理，
// 会永远停留在「处理中...」，让用户误以为任务还在执行。
// 返回清理的行数。
func (db *DB) RecoverStaleAssistantPlaceholders() (int64, error) {
	if db == nil || db.DB == nil {
		return 0, nil
	}
	const notice = "任务被服务重启中断，未生成结果。请重新发送这条消息。"
	res, err := db.Exec(
		`UPDATE messages SET content = ?, updated_at = ? WHERE role = 'assistant' AND TRIM(content) = '处理中...'`,
		notice, time.Now(),
	)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}
