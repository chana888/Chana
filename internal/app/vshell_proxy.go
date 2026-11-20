package app

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"chana/internal/security"
)

// VShell C2 反向代理配置
// VShell 启动: desshell-server-standalone-new.exe -p 8095 -ap 8084 -t vshell-admin-token
// 开源版说明: 源码不含 VShell C2 实现(官方 exe 免费发放, 不随源码发布);
// 桥接默认关闭, config 的 vshell.enabled=true + 配置地址/令牌后启用。
const (
	vshellDefaultUpstream = "http://127.0.0.1:8095" // VShell Web 面板默认地址
	vshellDefaultToken    = "vshell-admin-token"    // 默认 token (与 -t 参数一致)
	vshellPatchPrefix     = "DS-"                   // 补丁密钥前缀, 官方发放格式 DS-xxxxxxxx-xxxxxxxx
)

// vshellPrefixFix 注入 VShell SPA 页面：把绝对路径 API 请求(/api/...)补上 /vshell 前缀，
// 使其留在本反代之内（VShell SPA 的登录与数据 API 用根路径，iframe 同源反代下会撞平台自身 /api/ 而 404）。
const vshellPrefixFix = `<script>(function(){if(window.__vshellPrefixFix)return;window.__vshellPrefixFix=1;var P="/vshell";function f(u){if(typeof u!=="string")return u;if(u.charAt(0)!=="/"||u.indexOf("//")===0)return u;if(u===P||u.indexOf(P+"/")===0)return u;return P+u;}var of=window.fetch;if(of){window.fetch=function(i,o){try{if(typeof i==="string")i=f(i);else if(i&&i.url)i=new Request(f(i.url),i);}catch(e){}return of.call(this,i,o);};}var XO=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){try{arguments[1]=f(u);}catch(e){}return XO.apply(this,arguments);};var OW=window.WebSocket;if(OW){function NW(u,p){return new OW(f(u),p);}NW.prototype=OW.prototype;NW.CONNECTING=0;NW.OPEN=1;NW.CLOSING=2;NW.CLOSED=3;window.WebSocket=NW;}})();</script>`

// vshellUpstream / vshellToken 从 config 读取(兼容默认值)
func (a *App) vshellUpstream() string {
	if u := strings.TrimSpace(a.config.VShell.URL); u != "" {
		return u
	}
	return vshellDefaultUpstream
}

func (a *App) vshellToken() string {
	if t := strings.TrimSpace(a.config.VShell.Token); t != "" {
		return t
	}
	return vshellDefaultToken
}

// desShellEnabled VShell C2 桥接是否启用:
// VShell C2 为独立产品(官方编译 exe, 免费用, 不随源码发布),
// 平台源码仅做桥接集成; config 的 vshell.enabled=true + 配置地址即启用。
func (a *App) desShellEnabled() bool {
	return a.config.VShell.Enabled
}

// registerVShellProxy 注册 /vshell/* 反向代理，把 VShell C2 面板挂载到平台同源路径下。
// 认证: 代理向每个请求注入 ?token=<vshellToken>，VShell SPA 读 URL token 自动登录（免二次登录）。
// 路径: /vshell/xxx -> http://127.0.0.1:8095/xxx；HTML 内静态资源绝对路径重写为 /vshell/ 前缀。
func (a *App) registerVShellProxy(router *gin.Engine) {
	if !a.desShellEnabled() {
		// 开源版未激活: 留补丁空间, /vshell/* 返回引导提示
		router.Any("/vshell/*path", func(c *gin.Context) {
			c.JSON(http.StatusForbidden, gin.H{
				"error": "VShell C2 未启用",
				"hint":  "配置 config.yaml 的 vshell.enabled=true 并填写服务地址后重启启用(官方 exe 免费发放)",
			})
		})
		return
	}
	upstream := a.vshellUpstream()
	token := a.vshellToken()
	target, _ := url.Parse(upstream)
	proxy := &httputil.ReverseProxy{
		Director: func(req *http.Request) {
			req.URL.Scheme = target.Scheme
			req.URL.Host = target.Host
			req.Host = target.Host
			// /vshell/xxx -> /xxx；/assets、/logo.png、/favicon.ico 原样转发
			//（VShell SPA 运行时动态 import 的 chunk 用绝对路径 /assets/*，需同源可达）
			p := req.URL.Path
			if strings.HasPrefix(p, "/vshell") {
				p = strings.TrimPrefix(p, "/vshell")
				if p == "" {
					p = "/"
				}
			}
			req.URL.Path = p
			req.URL.RawPath = ""
			// 注入 token (Header 优先，但 SPA 的 API 调用可能不带 header，query 兜底)
			q := req.URL.Query()
			q.Set("token", token)
			req.URL.RawQuery = q.Encode()
		},
		ModifyResponse: func(resp *http.Response) error {
			ct := resp.Header.Get("Content-Type")
			isHTML := strings.Contains(ct, "text/html")
			if isHTML || strings.Contains(ct, "javascript") {
				body, err := io.ReadAll(resp.Body)
				if err != nil {
					return err
				}
				resp.Body.Close()
				// 品牌统一：把面板遗留的 "DesShell" 字样替换为 ChanaAgent（HTML 与前端 JS 文案）
				s := strings.ReplaceAll(string(body), "DesShell", "ChanaAgent")
				// 仅重写 HTML：静态资源绝对路径加 /vshell 前缀（SPA 同源加载）
				if isHTML {
					s = strings.ReplaceAll(s, `"/assets/`, `"/vshell/assets/`)
					s = strings.ReplaceAll(s, `"/app.config.js`, `"/vshell/app.config.js`)
					s = strings.ReplaceAll(s, `"/favicon.ico`, `"/vshell/favicon.ico`)
					s = strings.ReplaceAll(s, `"/logo.png`, `"/vshell/logo.png`)
					s = strings.ReplaceAll(s, `"/vshell/vshell/`, `"/vshell/`)
					// API 前缀修复：SPA 根路径 API 调用 hook 为 /vshell 前缀（同 dsh 反代方案）
					if idx := strings.Index(s, "</head>"); idx >= 0 {
						s = s[:idx] + vshellPrefixFix + s[idx:]
					}
				}
				resp.Body = io.NopCloser(strings.NewReader(s))
				resp.ContentLength = int64(len(s))
				resp.Header.Set("Content-Length", strconv.Itoa(len(s)))
				resp.Header.Del("Content-Encoding")
				return nil
			}
			return nil
		},
	}

	proxyHandler := func(c *gin.Context) {
		proxy.ServeHTTP(c.Writer, c.Request)
	}
	router.Any("/vshell/*path", proxyHandler)
	router.GET("/vshell", func(c *gin.Context) {
		c.Redirect(http.StatusFound, "/vshell/")
	})
	// VShell SPA 动态资源（Vite chunk 绝对路径 /assets/*）与根路径图标
	router.Any("/assets/*path", proxyHandler)
	router.GET("/logo.png", proxyHandler)
	router.GET("/favicon.ico", proxyHandler)
}

// VShellStats 桥接统计响应
type VShellStats struct {
	Reachable        bool   `json:"reachable"`
	Activated        bool   `json:"activated,omitempty"` // 补丁激活状态(开源版 false)
	ListenersRunning int    `json:"listeners_running"`
	ListenersTotal   int    `json:"listeners_total"`
	ClientsOnline    int    `json:"clients_online"`
	ClientsTotal     int    `json:"clients_total"`
	ListenerDesc     string `json:"listener_desc,omitempty"` // 如 "0.0.0.0:8084 (tcp) + 0.0.0.0:8084 (ws)"
}

// registerVShellStats 注册 /api/vshell/stats：转发 VShell 的监听器/客户端数据，
// 让平台 dashboard 的 C2 卡片显示 VShell 真实状态（而非平台内置 C2 的数据）。
func (a *App) registerVShellStats(protected *gin.RouterGroup) {
	protected.GET("/c2/vshell-stats", security.RequirePermission("c2:read"), func(c *gin.Context) {
		if !a.desShellEnabled() {
			// 开源版未激活: 返回未激活状态(前端显示补丁引导)
			c.JSON(http.StatusOK, gin.H{"stats": VShellStats{
				Reachable:    false,
				Activated:    false,
				ListenerDesc: "VShell C2 未启用: 配置 vshell.enabled=true 后重启",
			}})
			return
		}
		stats := a.fetchVShellStats()
		c.JSON(http.StatusOK, gin.H{"stats": stats})
	})
}

// fetchVShellStats 调用 VShell API 聚合统计（短超时，VShell 不可达时返回 reachable=false）
func (a *App) fetchVShellStats() VShellStats {
	stats := VShellStats{Reachable: false, Activated: true}
	upstream := a.vshellUpstream()
	token := a.vshellToken()
	client := &http.Client{Timeout: 2 * time.Second}

	// 1. 监听器
	var listeners []map[string]interface{}
	reqL, err := http.NewRequest("POST", upstream+"/api/listener/list", bytes.NewBufferString(`{"page":1,"pageSize":50}`))
	if err == nil {
		reqL.Header.Set("Content-Type", "application/json")
		reqL.Header.Set("Authorization", "Bearer "+token)
		resp, err := client.Do(reqL)
		if err == nil {
			defer resp.Body.Close()
			body, _ := io.ReadAll(resp.Body)
			var lr struct {
				Result struct {
					Items []map[string]interface{} `json:"items"`
				} `json:"result"`
			}
			if json.Unmarshal(body, &lr) == nil {
				listeners = lr.Result.Items
			}
		}
	}

	// 2. 客户端
	var clients []map[string]interface{}
	reqC, err := http.NewRequest("POST", upstream+"/api/client/list", bytes.NewBufferString(`{"page":1,"pageSize":50}`))
	if err == nil {
		reqC.Header.Set("Content-Type", "application/json")
		reqC.Header.Set("Authorization", "Bearer "+token)
		resp, err := client.Do(reqC)
		if err == nil {
			defer resp.Body.Close()
			body, _ := io.ReadAll(resp.Body)
			var cr struct {
				Result struct {
					Items []map[string]interface{} `json:"items"`
				} `json:"result"`
			}
			if json.Unmarshal(body, &cr) == nil {
				clients = cr.Result.Items
			}
		}
	}

	stats.Reachable = listeners != nil || clients != nil
	stats.ListenersTotal = len(listeners)
	stats.ClientsTotal = len(clients)
	for _, l := range listeners {
		if st, ok := l["Status"].(bool); ok && st {
			stats.ListenersRunning++
		}
		if addr, ok := l["ListenAddr"].(string); ok && addr != "" {
			if mode, ok2 := l["Mode"].(string); ok2 {
				if stats.ListenerDesc != "" {
					stats.ListenerDesc += " + "
				}
				stats.ListenerDesc += addr + " (" + mode + ")"
			}
		}
	}
	for _, cl := range clients {
		if on, ok := cl["IsConnect"].(bool); ok && on {
			stats.ClientsOnline++
		}
	}
	return stats
}
