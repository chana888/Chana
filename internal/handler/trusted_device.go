package handler

import (
	"net/http"
	"net/url"
	"strings"
	"time"

	"chana/internal/audit"
	"chana/internal/security"

	"github.com/gin-gonic/gin"
)

const trustedDeviceCookie = "__Host-chana-device"

// 自定义请求头防止跨站表单调用；浏览器携带 Origin 时必须与当前域名一致。
func trustedDeviceRequest(c *gin.Context) bool {
	if c.GetHeader("X-Chana-Device") != "1" ||
		(c.Request.TLS == nil && c.GetHeader("X-Forwarded-Proto") != "https") {
		return false
	}
	if site := c.GetHeader("Sec-Fetch-Site"); site != "" && site != "same-origin" && site != "none" {
		return false
	}
	if origin := c.GetHeader("Origin"); origin != "" {
		u, err := url.Parse(origin)
		if err != nil || u.Scheme != "https" || !strings.EqualFold(u.Host, c.Request.Host) || u.User != nil || u.Path != "" || u.RawQuery != "" || u.Fragment != "" {
			return false
		}
	}
	return true
}

func setTrustedDeviceCookie(c *gin.Context, token string, expiry time.Time) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name: trustedDeviceCookie, Value: token, Path: "/", Secure: true,
		HttpOnly: true, SameSite: http.SameSiteStrictMode,
		MaxAge: int(security.TrustedDeviceLifetime.Seconds()), Expires: expiry.UTC(),
	})
}

func clearTrustedDeviceCookie(c *gin.Context) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name: trustedDeviceCookie, Path: "/", Secure: true, HttpOnly: true,
		SameSite: http.SameSiteStrictMode, MaxAge: -1, Expires: time.Unix(1, 0).UTC(),
	})
}

func (h *AuthHandler) RestoreTrustedDevice(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	if !trustedDeviceRequest(c) {
		c.JSON(http.StatusForbidden, gin.H{"error": "设备登录只支持当前 HTTPS 网站"})
		return
	}
	token, err := c.Cookie(trustedDeviceCookie)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "请先登录并记住此设备"})
		return
	}
	session, expiry, err := h.manager.RestoreTrustedDevice(token)
	if err != nil {
		clearTrustedDeviceCookie(c)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "设备登录已失效，请重新登录"})
		return
	}
	setTrustedDeviceCookie(c, token, expiry)
	setPageSessionCookie(c, session)
	if h.audit != nil {
		h.audit.Record(c, audit.Entry{Category: "auth", Action: "device_restore", Result: "success",
			Actor: session.Username, SessionHint: audit.HintFromToken(session.Token), Message: "已恢复设备登录"})
	}
	c.JSON(http.StatusOK, gin.H{
		"token": session.Token, "expires_at": session.ExpiresAt.UTC().Format(time.RFC3339),
		"session_duration_hr": h.manager.SessionDurationHours(), "remember_device": true,
		"user":  gin.H{"id": session.UserID, "username": session.Username, "display_name": session.DisplayName},
		"roles": session.Roles, "permissions": permissionKeys(session.Permissions),
		"permission_scopes": session.PermissionScopes, "scope": session.Scope,
	})
}

// 短期会话失效时也必须允许注销本机的持久凭据。
func (h *AuthHandler) LogoutTrustedDevice(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	if !trustedDeviceRequest(c) {
		c.JSON(http.StatusForbidden, gin.H{"error": "请从当前 HTTPS 网站退出登录"})
		return
	}
	h.Logout(c)
}
