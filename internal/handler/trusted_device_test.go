package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"chana/internal/database"
	"chana/internal/security"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

func deviceHandlerTest(t *testing.T) (*AuthHandler, *gin.Engine, string) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	db, err := database.NewDB(filepath.Join(t.TempDir(), "handler.db"), zap.NewNop())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	a := security.NewAuthManager(12)
	password, err := a.AttachRBACStore(db)
	if err != nil {
		t.Fatal(err)
	}
	h := NewAuthHandler(a, nil, "", zap.NewNop())
	r := gin.New()
	r.POST("/login", h.Login)
	r.POST("/restore", h.RestoreTrustedDevice)
	r.POST("/logout", h.LogoutTrustedDevice)
	r.POST("/harness", security.AuthMiddleware(a), h.HarnessSession)
	r.GET("/access", h.HarnessAccess)
	return h, r, password
}

func deviceRequest(r *gin.Engine, path, body string, cookies []*http.Cookie, bearer string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "https://aichana.xyz"+path, bytes.NewBufferString(body))
	if path == "/access" {
		req.Method = http.MethodGet
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Origin", "https://aichana.xyz")
	req.Header.Set("X-Chana-Device", "1")
	for _, cookie := range cookies {
		req.AddCookie(cookie)
	}
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func loginDevice(t *testing.T, r *gin.Engine, password string, remember bool) (*http.Cookie, string) {
	t.Helper()
	body, _ := json.Marshal(map[string]interface{}{"username": "admin", "password": password, "remember_device": remember})
	w := deviceRequest(r, "/login", string(body), nil, "")
	if w.Code != 200 {
		t.Fatalf("登录失败: %d %s", w.Code, w.Body.String())
	}
	var data map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &data); err != nil {
		t.Fatal(err)
	}
	var device *http.Cookie
	for _, cookie := range w.Result().Cookies() {
		if cookie.Name == trustedDeviceCookie && cookie.Value != "" {
			device = cookie
		}
	}
	return device, data["token"].(string)
}

func TestTrustedDeviceHTTPBoundaryAndLogout(t *testing.T) {
	h, r, password := deviceHandlerTest(t)
	w := deviceRequest(r, "/login", `{"username":"admin","password":"wrong","remember_device":true}`, nil, "")
	if w.Code != 401 || len(w.Result().Cookies()) != 0 {
		t.Fatal("错误密码不得登记设备")
	}
	if cookie, _ := loginDevice(t, r, password, false); cookie != nil {
		t.Fatal("未选择记住设备时不得签发持久凭据")
	}
	device, token := loginDevice(t, r, password, true)
	if device == nil || !device.HttpOnly || !device.Secure || device.SameSite != http.SameSiteStrictMode || device.Path != "/" || device.MaxAge < 15000000 {
		t.Fatal("持久设备 Cookie 属性不正确")
	}
	if w := deviceRequest(r, "/restore", "", nil, ""); w.Code != 401 {
		t.Fatal("其他设备必须登录")
	}
	h.manager.RevokeAllSessions()
	w = deviceRequest(r, "/restore", "", []*http.Cookie{device}, "")
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"permissions"`) || w.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("旧会话失效后应恢复当前权限")
	}
	for _, name := range []string{"跨站", "缺请求头", "HTTP"} {
		req := httptest.NewRequest(http.MethodPost, "https://aichana.xyz/restore", nil)
		req.AddCookie(device)
		req.Header.Set("X-Chana-Device", "1")
		req.Header.Set("Origin", "https://aichana.xyz")
		switch name {
		case "跨站":
			req.Header.Set("Origin", "https://other.example")
		case "缺请求头":
			req.Header.Del("X-Chana-Device")
		case "HTTP":
			req.TLS = nil
		}
		w = httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != 403 {
			t.Fatalf("必须拒绝 %s", name)
		}
	}
	w = deviceRequest(r, "/logout", "", []*http.Cookie{device}, token)
	if w.Code != 200 {
		t.Fatal("过期会话也必须能注销设备")
	}
	if w := deviceRequest(r, "/restore", "", []*http.Cookie{device}, ""); w.Code != 401 {
		t.Fatal("注销后不得恢复")
	}
	if w := deviceRequest(r, "/access", "", []*http.Cookie{device}, ""); w.Code != 401 {
		t.Fatal("注销后不得访问 Harness")
	}
}

func TestHarnessSharesPlatformAuthentication(t *testing.T) {
	h, r, password := deviceHandlerTest(t)
	tokenFile := filepath.Join(t.TempDir(), "token.inc")
	if err := os.WriteFile(tokenFile, []byte(`set $dsh_token "internal-seed";`), 0600); err != nil {
		t.Fatal(err)
	}
	h.harnessTokenFile = tokenFile
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		if req.URL.Query().Get("token") != "internal-seed" {
			w.WriteHeader(401)
			return
		}
		http.SetCookie(w, &http.Cookie{Name: "dsh-auth-test", Value: "harness-session", Path: "/", MaxAge: 2592000})
		w.Header().Set("Location", "/")
		w.WriteHeader(303)
	}))
	defer srv.Close()
	h.harnessURL = srv.URL + "/"
	if w := deviceRequest(r, "/harness", "", nil, ""); w.Code != 401 {
		t.Fatal("匿名浏览器不得签发 Harness 凭据")
	}
	device, token := loginDevice(t, r, password, true)
	w := deviceRequest(r, "/harness", "", []*http.Cookie{device}, token)
	if w.Code != 200 || strings.Contains(w.Body.String(), "internal-seed") || strings.Contains(w.Body.String(), "harness-session") {
		t.Fatal("必须仅通过 Cookie 授权，不返回内部凭据")
	}
	var harnessCookie *http.Cookie
	for _, cookie := range w.Result().Cookies() {
		if cookie.Name == harnessSessionCookie {
			harnessCookie = cookie
		}
		if cookie.Name == "dsh-auth-test" && cookie.Value != "" {
			if cookie.Path != "/dsh/" || !cookie.HttpOnly || !cookie.Secure {
				t.Fatal("Harness Cookie 路径与安全属性不正确")
			}
		}
	}
	if harnessCookie == nil {
		t.Fatal("未签发平台 Harness 授权")
	}
	if w := deviceRequest(r, "/access", "", []*http.Cookie{harnessCookie}, ""); w.Code != 204 {
		t.Fatal("已登录浏览器应允许 Harness")
	}
	h.manager.RevokeAllSessions()
	if w := deviceRequest(r, "/access", "", []*http.Cookie{harnessCookie}, ""); w.Code != 401 {
		t.Fatal("旧会话不得继续访问 Harness")
	}
	if w := deviceRequest(r, "/access", "", []*http.Cookie{device}, ""); w.Code != 204 {
		t.Fatal("已记住设备在重启后仍能通过 Harness 门禁")
	}
	if err := h.manager.UpdateUserPassword("admin", "changed-password-999"); err != nil {
		t.Fatal(err)
	}
	if w := deviceRequest(r, "/access", "", []*http.Cookie{device}, ""); w.Code != 401 {
		t.Fatal("改密码后 Harness 必须要求重新登录")
	}
}
