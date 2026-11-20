package security

import (
	"path/filepath"
	"testing"
	"time"

	"chana/internal/database"
	"go.uber.org/zap"
)

func newDeviceTestManager(t *testing.T) (*AuthManager, *database.DB, string, string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "devices.db")
	db, err := database.NewDB(path, zap.NewNop())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	manager := NewAuthManager(12)
	password, err := manager.AttachRBACStore(db)
	if err != nil {
		t.Fatal(err)
	}
	token, _, err := manager.Authenticate("admin", password)
	if err != nil {
		t.Fatal(err)
	}
	return manager, db, token, path
}

func TestTrustedDevicePersistsAndUsesCurrentAccess(t *testing.T) {
	a, db, sessionToken, path := newDeviceTestManager(t)
	token, expiry, err := a.RememberDevice(sessionToken)
	if err != nil || time.Until(expiry) < 179*24*time.Hour {
		t.Fatalf("登记设备失败: %v", err)
	}
	var stored string
	if err := db.QueryRow(`SELECT token_hash FROM auth_trusted_devices`).Scan(&stored); err != nil {
		t.Fatal(err)
	}
	if stored == token || stored != passwordVersion(token) {
		t.Fatal("不得存储原始设备凭据")
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	db2, err := database.NewDB(path, zap.NewNop())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db2.Close() })
	a2 := NewAuthManager(12)
	if _, err := a2.AttachRBACStore(db2); err != nil {
		t.Fatal(err)
	}
	if _, ok := a2.ValidateToken(sessionToken); ok {
		t.Fatal("旧的内存会话应已失效")
	}
	roles := []string{}
	if err := db2.UpdateRBACUser("admin", "当前名称", nil, &roles); err != nil {
		t.Fatal(err)
	}
	session, _, err := a2.RestoreTrustedDevice(token)
	if err != nil {
		t.Fatal(err)
	}
	if session.DisplayName != "当前名称" || len(session.Roles) != 0 || session.Permissions["terminal:execute"] {
		t.Fatal("必须读取当前权限")
	}
	if _, ok := a2.ValidateToken(session.Token); !ok {
		t.Fatal("恢复后必须签发正常会话")
	}
}

func TestTrustedDeviceRejectsInvalidState(t *testing.T) {
	for _, name := range []string{"无会话", "伪造", "过期", "禁用", "密码修改", "直接修改密码", "注销"} {
		t.Run(name, func(t *testing.T) {
			a, db, sessionToken, _ := newDeviceTestManager(t)
			if name == "无会话" {
				if _, _, err := a.RememberDevice("fake"); err == nil {
					t.Fatal("不能凭空登记设备")
				}
				return
			}
			token, _, err := a.RememberDevice(sessionToken)
			if err != nil {
				t.Fatal(err)
			}
			switch name {
			case "伪造":
				token = token[:len(token)-2] + "xx"
			case "过期":
				_, err = db.Exec(`UPDATE auth_trusted_devices SET expires_at=?`, time.Now().Add(-time.Second).Unix())
			case "禁用":
				_, err = db.Exec(`UPDATE rbac_users SET enabled=0 WHERE id='admin'`)
			case "密码修改":
				err = a.UpdateUserPassword("admin", "updated-password-123")
			case "直接修改密码":
				hash, hashErr := HashPassword("updated-password-456")
				if hashErr != nil {
					t.Fatal(hashErr)
				}
				err = db.UpdateRBACUserPassword("admin", hash)
			case "注销":
				err = a.RevokeTrustedDevice(token)
			}
			if err != nil {
				t.Fatal(err)
			}
			if _, _, err := a.RestoreTrustedDevice(token); err == nil {
				t.Fatal("失效设备不得恢复登录")
			}
			if _, ok := a.TrustedDeviceUserID(token); ok {
				t.Fatal("失效设备不得访问 Harness")
			}
		})
	}
}

func TestTrustedDeviceRevokesOnlyThisDevice(t *testing.T) {
	a, _, sessionToken, _ := newDeviceTestManager(t)
	first, _, err := a.RememberDevice(sessionToken)
	if err != nil {
		t.Fatal(err)
	}
	second, _, err := a.RememberDevice(sessionToken)
	if err != nil {
		t.Fatal(err)
	}
	if first == second {
		t.Fatal("不同设备需要独立凭据")
	}
	if err := a.RevokeTrustedDevice(first); err != nil {
		t.Fatal(err)
	}
	if _, _, err := a.RestoreTrustedDevice(first); err == nil {
		t.Fatal("已注销的设备不得恢复")
	}
	if _, _, err := a.RestoreTrustedDevice(second); err != nil {
		t.Fatal("注销一个设备不应影响另一设备")
	}
}
