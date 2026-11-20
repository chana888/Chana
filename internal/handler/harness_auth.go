package handler

import (
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"

	"chana/internal/security"

	"github.com/gin-gonic/gin"
)

const harnessSessionCookie = "__Host-chana-harness"

var harnessTokenPattern = regexp.MustCompile(`set\s+\$dsh_token\s+["']?([^\s;"']+)`)

// Harness 共用管理工作区，维持原有的管理员授权边界。
func (h *AuthHandler) HarnessAccess(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	if token, err := c.Cookie(harnessSessionCookie); err == nil {
		if session, ok := h.manager.ValidateToken(token); ok && session.UserID == "admin" {
			c.Status(http.StatusNoContent)
			return
		}
	}
	if token, err := c.Cookie(trustedDeviceCookie); err == nil {
		if userID, ok := h.manager.TrustedDeviceUserID(token); ok && userID == "admin" {
			c.Status(http.StatusNoContent)
			return
		}
	}
	c.Status(http.StatusUnauthorized)
}

// HarnessSession 在服务器内部换取会话 Cookie，不向网页暴露 Harness 主凭据。
func (h *AuthHandler) HarnessSession(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	if !trustedDeviceRequest(c) {
		c.JSON(http.StatusForbidden, gin.H{"error": "请从当前 HTTPS 网站打开 Harness"})
		return
	}
	session, ok := security.CurrentSession(c)
	if !ok || session.UserID != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Harness 工作区需要管理员权限"})
		return
	}
	// 凭据与地址来源（优先级）：
	//  1) handler 显式注入（harnessTokenFile / harnessURL）
	//  2) config 的 dsh 段（本地/无 nginx 部署：dsh.token + dsh.base_url）
	//  3) VPS 默认：nginx token 文件 /etc/nginx/chana_token.inc + http://127.0.0.1:3081/
	base := h.harnessURL
	if base == "" {
		base = "http://127.0.0.1:3081/"
		if h.config != nil && h.config.Dsh.BaseURL != "" {
			base = strings.TrimRight(h.config.Dsh.BaseURL, "/") + "/"
		}
	}
	var dshToken string
	if h.config != nil && h.config.Dsh.Token != "" {
		dshToken = h.config.Dsh.Token
	} else {
		file := h.harnessTokenFile
		if file == "" {
			file = "/etc/nginx/chana_token.inc"
		}
		raw, err := os.ReadFile(file)
		if err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Harness 授权暂不可用"})
			return
		}
		match := harnessTokenPattern.FindSubmatch(raw)
		if len(match) != 2 {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Harness 授权暂不可用"})
			return
		}
		dshToken = string(match[1])
	}
	req, err := http.NewRequestWithContext(c.Request.Context(), http.MethodGet, base+"?token="+url.QueryEscape(dshToken), nil)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Harness 授权暂不可用"})
		return
	}
	client := &http.Client{Timeout: 8 * time.Second, CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }}
	response, err := client.Do(req)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Harness 连接失败，请重试"})
		return
	}
	defer response.Body.Close()
	_, _ = io.CopyN(io.Discard, response.Body, 4096)
	if response.StatusCode != http.StatusSeeOther && response.StatusCode != http.StatusOK {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Harness 授权失败，请重试"})
		return
	}
	var cookie *http.Cookie
	for _, item := range response.Cookies() {
		if strings.HasPrefix(item.Name, "dsh-auth-") && item.Value != "" {
			cookie = item
			break
		}
	}
	if cookie == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Harness 未返回有效会话"})
		return
	}
	// 兼容旧入口在根路径写入的同名 Cookie，避免浏览器同时发送两份值。
	http.SetCookie(c.Writer, &http.Cookie{Name: cookie.Name, Path: "/", MaxAge: -1, HttpOnly: true, Secure: true, SameSite: http.SameSiteStrictMode})
	cookie.Path = "/dsh/"
	cookie.Domain = ""
	cookie.HttpOnly = true
	cookie.Secure = true
	cookie.SameSite = http.SameSiteStrictMode
	http.SetCookie(c.Writer, cookie)
	http.SetCookie(c.Writer, &http.Cookie{Name: harnessSessionCookie, Value: session.Token, Path: "/", Secure: true, HttpOnly: true,
		SameSite: http.SameSiteStrictMode, Expires: session.ExpiresAt, MaxAge: int(time.Until(session.ExpiresAt).Seconds())})
	c.JSON(http.StatusOK, gin.H{"authorized": true})
}

func clearHarnessCookies(c *gin.Context) {
	for _, cookie := range c.Request.Cookies() {
		if strings.HasPrefix(cookie.Name, "dsh-auth-") {
			for _, path := range []string{"/", "/dsh/"} {
				http.SetCookie(c.Writer, &http.Cookie{Name: cookie.Name, Path: path, MaxAge: -1, Secure: true, HttpOnly: true, SameSite: http.SameSiteStrictMode})
			}
		}
	}
	http.SetCookie(c.Writer, &http.Cookie{Name: harnessSessionCookie, Path: "/", MaxAge: -1, Secure: true, HttpOnly: true, SameSite: http.SameSiteStrictMode})
}
