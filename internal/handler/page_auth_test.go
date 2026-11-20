package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"chana/internal/security"
	"github.com/gin-gonic/gin"
)

func pageTestRoutes(t *testing.T) (*AuthHandler, *gin.Engine, string) {
	t.Helper()
	h, r, password := deviceHandlerTest(t)
	r.LoadHTMLFiles("../../web/templates/login.html")
	r.GET("/login-page", h.LoginPage)
	r.GET("/", h.PageAccess(), func(c *gin.Context) { c.String(200, "private-dashboard-structure") })
	r.GET("/api-docs", h.PageAccess(), func(c *gin.Context) { c.String(200, "private-api-docs") })
	r.POST("/page-session", security.AuthMiddleware(h.manager), h.CreatePageSession)
	r.POST("/page-restore", h.RestorePageSession)
	r.GET("/api-private", security.AuthMiddleware(h.manager), func(c *gin.Context) { c.Status(204) })
	r.Group("", h.StaticAccess()).StaticFS("/static", http.Dir("../../web/static"))
	return h, r, password
}

func pageGet(r *gin.Engine, path string, cookies ...*http.Cookie) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, "https://aichana.xyz"+path, nil)
	for _, cookie := range cookies {
		if cookie != nil {
			req.AddCookie(cookie)
		}
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func pageCookie(w *httptest.ResponseRecorder) *http.Cookie {
	for _, cookie := range w.Result().Cookies() {
		if cookie.Name == pageSessionCookie && cookie.Value != "" {
			return cookie
		}
	}
	return nil
}

func TestPageGateNeverRendersAnonymousDashboard(t *testing.T) {
	h, r, password := pageTestRoutes(t)
	for _, path := range []string{"/", "/?harness=1", "/api-docs"} {
		for _, cookie := range []*http.Cookie{nil, {Name: pageSessionCookie, Value: "forged"}} {
			w := pageGet(r, path, cookie)
			if w.Code != 302 || !strings.HasPrefix(w.Header().Get("Location"), "/login?next=") || strings.Contains(w.Body.String(), "private-") {
				t.Fatal("匿名或伪造会话必须在渲染前转到登录页")
			}
			if w.Header().Get("Cache-Control") != "no-store" {
				t.Fatal("页面不得缓存")
			}
		}
	}
	device, token := loginDevice(t, r, password, true)
	if pageGet(r, "/", device).Code != 302 {
		t.Fatal("设备凭据应先恢复真实会话")
	}
	cookie := &http.Cookie{Name: pageSessionCookie, Value: token}
	if pageGet(r, "/", cookie).Code != 200 {
		t.Fatal("有效页面会话应进入后台")
	}
	if pageGet(r, "/api-private", cookie).Code != 401 {
		t.Fatal("页面 Cookie 不得自动授权业务 API")
	}
	h.manager.RevokeToken(token)
	if pageGet(r, "/", cookie).Code != 302 {
		t.Fatal("失效会话不得访问后台")
	}
}

func TestStandaloneLoginAndStaticBoundary(t *testing.T) {
	_, r, password := pageTestRoutes(t)
	w := pageGet(r, "/login-page")
	if w.Code != 200 || !strings.Contains(w.Body.String(), "login-form") {
		t.Fatal("必须提供独立登录页")
	}
	for _, forbidden := range []string{"private-dashboard", "page-chanamode", "harness-chat.js", "auth.js", "sidebar", "login-overlay"} {
		if strings.Contains(w.Body.String(), forbidden) {
			t.Fatalf("登录页含后台内容：%s", forbidden)
		}
	}
	for _, path := range []string{"/static/login/login.js", "/static/login/login.css"} {
		if pageGet(r, path).Code != 200 {
			t.Fatal("登录资源应可匿名加载")
		}
	}
	for _, path := range []string{"/static/js/auth.js", "/static/js/harness-chat.js", "/static/css/style.css", "/static/../js/auth.js"} {
		w := pageGet(r, path)
		if w.Code != 401 || w.Body.Len() != 0 {
			t.Fatal("匿名不得下载后台资源")
		}
	}
	_, token := loginDevice(t, r, password, false)
	if pageGet(r, "/static/js/auth.js", &http.Cookie{Name: pageSessionCookie, Value: token}).Code != 200 {
		t.Fatal("已登录应可加载后台资源")
	}
}

func TestPageSessionIssuedOnlyAfterVerifiedAuthentication(t *testing.T) {
	h, r, password := pageTestRoutes(t)
	w := deviceRequest(r, "/login", `{"username":"admin","password":"wrong"}`, nil, "")
	if w.Code != 401 || pageCookie(w) != nil {
		t.Fatal("错误密码不得签页面凭据")
	}
	body, _ := json.Marshal(map[string]interface{}{"username": "admin", "password": password})
	w = deviceRequest(r, "/login", string(body), nil, "")
	cookie := pageCookie(w)
	if cookie == nil || !cookie.Secure || !cookie.HttpOnly || cookie.Path != "/" || cookie.Domain != "" || cookie.SameSite != http.SameSiteStrictMode || cookie.MaxAge <= 0 {
		t.Fatal("页面 Cookie 安全属性不正确")
	}
	if w := deviceRequest(r, "/page-restore", "", []*http.Cookie{cookie}, ""); w.Code != 200 || !strings.Contains(w.Body.String(), `"permissions"`) {
		t.Fatal("有效页面会话应能恢复 Bearer 权限")
	}
	if w := deviceRequest(r, "/page-session", "", nil, cookie.Value); w.Code != 200 || pageCookie(w) == nil {
		t.Fatal("旧有效 Bearer 应能迁移")
	}
	if w := deviceRequest(r, "/page-session", "", nil, "forged"); w.Code != 401 || pageCookie(w) != nil {
		t.Fatal("伪造 Bearer 不得迁移")
	}
	for _, mode := range []string{"cross-origin", "missing-header", "http"} {
		req := httptest.NewRequest(http.MethodPost, "https://aichana.xyz/page-restore", nil)
		req.AddCookie(cookie)
		req.Header.Set("X-Chana-Device", "1")
		switch mode {
		case "cross-origin":
			req.Header.Set("Origin", "https://other.example")
		case "missing-header":
			req.Header.Del("X-Chana-Device")
		case "http":
			req.TLS = nil
		}
		w = httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != 403 {
			t.Fatal("不得跨站或明文恢复会话")
		}
	}
	if w := deviceRequest(r, "/logout", "", []*http.Cookie{cookie}, ""); w.Code != 200 {
		t.Fatal("丢失本地 token 时也必须能退出")
	}
	if _, ok := h.manager.ValidateToken(cookie.Value); ok {
		t.Fatal("退出必须撤销服务端页面令牌")
	}
	if pageGet(r, "/", cookie).Code != 302 {
		t.Fatal("退出后重放旧 Cookie 不得进入")
	}
}

func TestRememberedDeviceRestoresPageAndPasswordRevokesIt(t *testing.T) {
	h, r, password := pageTestRoutes(t)
	device, _ := loginDevice(t, r, password, true)
	h.manager.RevokeAllSessions()
	w := deviceRequest(r, "/restore", "", []*http.Cookie{device}, "")
	cookie := pageCookie(w)
	if w.Code != 200 || cookie == nil || pageGet(r, "/", cookie).Code != 200 {
		t.Fatal("记住设备应先恢复会话再进入")
	}
	if err := h.manager.UpdateUserPassword("admin", "changed-page-password-123"); err != nil {
		t.Fatal(err)
	}
	if pageGet(r, "/", cookie).Code != 302 {
		t.Fatal("改密码后旧页面会话必须失效")
	}
	if deviceRequest(r, "/restore", "", []*http.Cookie{device}, "").Code != 401 {
		t.Fatal("改密码后记住设备也必须失效")
	}
}
