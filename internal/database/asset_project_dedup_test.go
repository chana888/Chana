package database

import (
	"path/filepath"
	"testing"

	"go.uber.org/zap"
)

func TestAssetDedupRespectsProjectAndMigrates(t *testing.T) {
	db, err := NewDB(filepath.Join(t.TempDir(), "project-assets.db"), zap.NewNop())
	if err != nil { t.Fatal(err) }
	defer db.Close()
	projectA, err := db.CreateProject(&Project{Name: "甲", Status: "active"})
	if err != nil { t.Fatal(err) }
	projectB, err := db.CreateProject(&Project{Name: "乙", Status: "active"})
	if err != nil { t.Fatal(err) }
	first := &Asset{Host: "https://shared.example.test", ProjectID: projectA.ID}
	second := &Asset{Host: first.Host, ProjectID: projectB.ID}
	for _, asset := range []*Asset{first, second} {
		result, err := db.UpsertAssets([]*Asset{asset}, "")
		if err != nil || result.Created != 1 { t.Fatalf("跨项目资产创建失败: %#v %v", result, err) }
	}
	if first.ID == second.ID { t.Fatal("不同项目的资产被错误合并") }
	// 模拟升级前的去重键，升级后在原项目导入仍应更新原记录。
	if _, err := db.Exec("UPDATE assets SET dedup_key=? WHERE id=?", "shared.example.test|443|https", first.ID); err != nil { t.Fatal(err) }
	for i := 0; i < 2; i++ { if err := db.migrateAssetsTable(); err != nil { t.Fatal(err) } }
	update := &Asset{Host: first.Host, ProjectID: projectA.ID, Title: "更新"}
	result, err := db.UpsertAssets([]*Asset{update}, "")
	if err != nil || result.Updated != 1 || update.ID != first.ID { t.Fatalf("旧资产迁移后重复或归属错误: %#v %v", result, err) }
	got, err := db.GetAsset(second.ID, RBACListAccess{Scope: RBACScopeAll})
	if err != nil || got.ProjectID != projectB.ID || got.Title == "更新" { t.Fatalf("另一个项目被改写: %#v %v", got, err) }
}
