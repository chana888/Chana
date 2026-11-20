package handler

import (
	"net/http"
	"net/url"
	"time"

	"chana/internal/security"
	"github.com/gin-gonic/gin"
)

const pageSessionCookie = "__Host-chana-session"

func privatePageHeaders(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	c.Header("Pragma", "no-cache")
	c.Header("Expires", "0")
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("Referrer-Policy", "same-origin")
}

func setPageSessionCookie(c *gin.Context, session security.Session) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name: pageSessionCookie, Value: session.Token, Path: "/", Secure: true,
		HttpOnly: true, SameSite: http.SameSiteStrictMode,
		MaxAge: int(time.Until(session.ExpiresAt).Seconds()), Expires: session.ExpiresAt.UTC(),
	})
}

func clearPageSessionCookie(c *gin.Context) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name: pageSessionCookie, Path: "/", Secure: true, HttpOnly: true,
		SameSite: http.SameSiteStrictMode, MaxAge: -1, Expires: time.Unix(1, 0).UTC(),
	})
}

func (h *AuthHandler) pageSession(c *gin.Context) (security.Session, bool) {
	token, err := c.Cookie(pageSessionCookie)
	if err != nil || token == "" {
		return security.Session{}, false
	}
	return h.manager.ValidateToken(token)
}

// HTML 在校验通过之前不得进入模板渲染，设备记忆须先恢复真实会话。
func (h *AuthHandler) PageAccess() gin.HandlerFunc {
	return func(c *gin.Context) {
		privatePageHeaders(c)
		if _, ok := h.pageSession(c); !ok {
			clearPageSessionCookie(c)
			c.Redirect(http.StatusFound, "/login?next="+url.QueryEscape(c.Request.URL.RequestURI()))
			c.Abort()
			return
		}
		c.Next()
	}
}

// 只公开登录页自身资源，匿名请求不得读取后台脚本或样式。
func (h *AuthHandler) StaticAccess() gin.HandlerFunc {
	return func(c *gin.Context) {
		privatePageHeaders(c)
		switch c.Request.URL.Path {
		case "/static/login/login.js", "/static/login/login.css":
			c.Next()
			return
		}
		if _, ok := h.pageSession(c); !ok {
			c.AbortWithStatus(http.StatusUnauthorized)
			return
		}
		c.Next()
	}
}

func (h *AuthHandler) LoginPage(c *gin.Context) {
	privatePageHeaders(c)
	c.Header("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'")
	c.HTML(http.StatusOK, "login.html", nil)
}

// 旧设备 localStorage 中的令牌，经过原有 Bearer 认证后换成页面 Cookie。
func (h *AuthHandler) CreatePageSession(c *gin.Context) {
	privatePageHeaders(c)
	if !trustedDeviceRequest(c) {
		c.JSON(http.StatusForbidden, gin.H{"error": "请从当前 HTTPS 网站登录"})
		return
	}
	session, ok := security.CurrentSession(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "请重新登录"})
		return
	}
	setPageSessionCookie(c, session)
	h.Validate(c)
}

// 此端点单独校验同源 Cookie，不改变业务 API 的 Bearer 认证边界。
func (h *AuthHandler) RestorePageSession(c *gin.Context) {
	privatePageHeaders(c)
	if !trustedDeviceRequest(c) {
		c.JSON(http.StatusForbidden, gin.H{"error": "请从当前 HTTPS 网站恢复登录"})
		return
	}
	session, ok := h.pageSession(c)
	if !ok {
		clearPageSessionCookie(c)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "请重新登录"})
		return
	}
	c.Set(security.ContextAuthTokenKey, session.Token)
	h.Validate(c)
}
