package database

import (
	"path/filepath"
	"testing"

	"go.uber.org/zap"
)

func TestAssetProjectBindingKeepsDedupConsistent(t *testing.T) {
	db, err := NewDB(filepath.Join(t.TempDir(), "binding.db"), zap.NewNop())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	all := RBACListAccess{Scope: RBACScopeAll}
	a, err := db.CreateProject(&Project{Name: "甲", Status: "active"})
	if err != nil {
		t.Fatal(err)
	}
	b, err := db.CreateProject(&Project{Name: "乙", Status: "active"})
	if err != nil {
		t.Fatal(err)
	}
	asset := &Asset{Host: "https://binding.example.test"}
	if _, err := db.UpsertAssets([]*Asset{asset}, ""); err != nil {
		t.Fatal(err)
	}
	for _, target := range []string{a.ID, b.ID, ""} {
		if n, err := db.UpdateAssetsProject([]string{asset.ID, asset.ID}, target, all); err != nil || n != 1 {
			t.Fatalf("项目归属更新失败: %d %v", n, err)
		}
		update := &Asset{Host: asset.Host, ProjectID: target, Title: "更新后"}
		result, err := db.UpsertAssets([]*Asset{update}, "")
		if err != nil || result.Updated != 1 || result.Created != 0 || update.ID != asset.ID {
			t.Fatalf("重新导入未命中原记录: %#v %v", result, err)
		}
		var key string
		if err := db.QueryRow("SELECT dedup_key FROM assets WHERE id=?", asset.ID).Scan(&key); err != nil {
			t.Fatal(err)
		}
		if key != assetDedupKey(update) {
			t.Fatalf("去重键未随项目变化: %s", key)
		}
	}
	other := &Asset{Host: asset.Host, ProjectID: b.ID}
	if result, err := db.UpsertAssets([]*Asset{other}, ""); err != nil || result.Created != 1 || other.ID == asset.ID {
		t.Fatalf("跨项目重新导入未独立保存: %#v %v", result, err)
	}
}

func TestAssetProjectBindingRejectsConflictsAtomically(t *testing.T) {
	db, err := NewDB(filepath.Join(t.TempDir(), "conflict.db"), zap.NewNop())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	all := RBACListAccess{Scope: RBACScopeAll}
	projects := make([]*Project, 3)
	for i, name := range []string{"甲", "乙", "丙"} {
		projects[i], err = db.CreateProject(&Project{Name: name, Status: "active"})
		if err != nil {
			t.Fatal(err)
		}
	}
	assets := []*Asset{
		{Host: "https://same.example.test", ProjectID: projects[0].ID},
		{Host: "https://same.example.test", ProjectID: projects[1].ID},
		{Host: "https://other.example.test", ProjectID: projects[0].ID},
	}
	if _, err := db.UpsertAssets(assets, ""); err != nil {
		t.Fatal(err)
	}
	for _, batch := range []struct {
		ids    []string
		target string
	}{
		{[]string{assets[2].ID, assets[0].ID}, projects[1].ID},
		{[]string{assets[0].ID, assets[1].ID}, projects[2].ID},
	} {
		if _, err := db.UpdateAssetsProject(batch.ids, batch.target, all); err == nil {
			t.Fatal("重复资产迁移未被拒绝")
		}
		for _, before := range assets {
			after, err := db.GetAsset(before.ID, all)
			if err != nil || after.ProjectID != before.ProjectID {
				t.Fatalf("冲突后原记录被改写: %#v %v", after, err)
			}
		}
	}
}
