package knowledge

import (
	"context"
	"strings"
	"unicode"
)

// searchArchivedKeywords 仅检索有效的自动实战案例，避免依赖外部嵌入服务。
func (r *Retriever) searchArchivedKeywords(ctx context.Context, req *SearchRequest) ([]*RetrievalResult, error) {
	// 自动案例已按漏洞类型分散到各分类；指定分类时按分类过滤，未指定则全库兜底。
	category := strings.TrimSpace(req.RiskType)
	terms := strings.FieldsFunc(strings.ToLower(strings.TrimSpace(req.Query)), func(c rune) bool {
		return unicode.IsSpace(c) || strings.ContainsRune("，。；、：,;:!?！？()（）\"'", c)
	})
	if len(terms) == 0 {
		return nil, nil
	}
	if len(terms) > 12 {
		terms = terms[:12]
	}
	var conditions []string
	var args []interface{}
	escape := strings.NewReplacer("\\", "\\\\", "%", "\\%", "_", "\\_")
	for _, term := range terms {
		conditions = append(conditions, `LOWER(title || CHAR(10) || COALESCE(content,'')) LIKE ? ESCAPE '\'`)
		args = append(args, "%"+escape.Replace(term)+"%")
	}
	topK := req.TopK
	if topK <= 0 && r.config != nil {
		topK = r.config.TopK
	}
	if topK <= 0 {
		topK = 5
	}
	if topK > 100 {
		topK = 100
	}
	if category != "" {
		conditions = append(conditions, `TRIM(category) = TRIM(?) COLLATE NOCASE`)
	}
	args = append(args, topK)
	rows, err := r.db.QueryContext(ctx, `SELECT id,category,title,file_path,content FROM knowledge_base_items
		WHERE is_active=1 AND source_vulnerability_id IS NOT NULL AND source_vulnerability_id<>''
		AND (`+strings.Join(conditions, " OR ")+`) ORDER BY updated_at DESC,id LIMIT ?`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var results []*RetrievalResult
	for rows.Next() {
		item := &KnowledgeItem{}
		if err := rows.Scan(&item.ID, &item.Category, &item.Title, &item.FilePath, &item.Content); err != nil {
			return nil, err
		}
		results = append(results, &RetrievalResult{
			Item: item, RetrievalMethod: "keyword",
			Chunk: &KnowledgeChunk{ID: "keyword-" + item.ID, ItemID: item.ID, ChunkText: item.Content},
		})
	}
	return results, rows.Err()
}
