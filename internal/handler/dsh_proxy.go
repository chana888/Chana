// Package handler 内置 dsh 反向代理：本地/无 nginx 部署时把同源 /dsh/ 转发到 dsh web。
// VPS 部署可用 nginx 反代替代（配 dsh.base_url 为空即关闭内置反代）。
package handler

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

// dshPrefixFix 注入 dsh SPA 页面：把绝对路径 /api、/plugins 等请求补上 /dsh 前缀，
// 使其留在本反代的会话认证之内（与 VPS nginx sub_filter 行为一致）。
const dshPrefixFix = `<script>(function(){if(window.__dshPrefixFix)return;window.__dshPrefixFix=1;var P="/dsh";function f(u){if(typeof u!=="string")return u;if(u.charAt(0)!=="/"||u.indexOf("//")===0)return u;if(u===P||u.indexOf(P+"/")===0)return u;return P+u;}function hk(pr,pp){try{var d=Object.getOwnPropertyDescriptor(pr,pp);if(!d||typeof d.set!=="function")return;Object.defineProperty(pr,pp,{configurable:true,enumerable:d.enumerable,get:d.get,set:function(v){return d.set.call(this,f(v));}});}catch(e){}}hk(HTMLScriptElement.prototype,"src");hk(HTMLLinkElement.prototype,"href");hk(HTMLImageElement.prototype,"src");hk(HTMLIFrameElement.prototype,"src");var SA=Element.prototype.setAttribute;Element.prototype.setAttribute=function(n,v){try{if((n==="src"||n==="href")&&typeof v==="string")v=f(v);}catch(e){}return SA.call(this,n,v);};var SN=Element.prototype.setAttributeNS;if(SN){Element.prototype.setAttributeNS=function(ns,n,v){try{if((n==="src"||n==="href")&&typeof v==="string")v=f(v);}catch(e){}return SN.call(this,ns,n,v);};}var of=window.fetch;if(of){window.fetch=function(i,o){try{if(typeof i==="string")i=f(i);else if(i&&i.url)i=new Request(f(i.url),i);}catch(e){}return of.call(this,i,o);};}var OW=window.WebSocket;if(OW){function NW(u,p){return new OW(f(u),p);}NW.prototype=OW.prototype;NW.CONNECTING=0;NW.OPEN=1;NW.CLOSING=2;NW.CLOSED=3;window.WebSocket=NW;}var XO=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){try{arguments[1]=f(u);}catch(e){}return XO.apply(this,arguments);};var OE=window.EventSource;if(OE){window.EventSource=function(u,c){return new OE(f(u),c);};}var OWk=window.Worker;if(OWk){window.Worker=function(u,o){return new OWk(f(u),o);};}})();</script>`

// DshReverseProxy 把 /dsh/* 反代到 dsh.base_url（如 http://127.0.0.1:3080）。
// 复刻 VPS nginx /dsh/ 反代的四个关键行为：
//  1. Host 重写为 dsh 上游地址（dsh 会话 Cookie 绑定签发时的 authority）
//  2. 清空 Origin 头（dsh 网关对浏览器 Origin 做校验，经反代必失配 403）
//  3. 清空 Accept-Encoding 并对 HTML 响应注入 __dshPrefixFix 脚本
//  4. 首访无 dsh Cookie 时 302 注入 ?token= 完成登录
func DshReverseProxy(baseURL, token string) gin.HandlerFunc {
	target, err := url.Parse(strings.TrimRight(baseURL, "/"))
	if err != nil {
		return func(c *gin.Context) { c.String(http.StatusBadGateway, "dsh.base_url 无效: "+err.Error()) }
	}
	proxy := httputil.NewSingleHostReverseProxy(target)
	proxy.ModifyResponse = func(resp *http.Response) error {
		if !strings.HasPrefix(resp.Header.Get("Content-Type"), "text/html") {
			return nil
		}
		body, err := io.ReadAll(resp.Body)
		if err != nil {
			return err
		}
		resp.Body.Close()
		if bytes.Contains(body, []byte("</head>")) {
			body = bytes.Replace(body, []byte("</head>"), []byte(dshPrefixFix+"</head>"), 1)
		} else {
			body = append(body, []byte(dshPrefixFix)...)
		}
		resp.Body = io.NopCloser(bytes.NewReader(body))
		resp.ContentLength = int64(len(body))
		resp.Header.Set("Content-Length", strconv.Itoa(len(body)))
		resp.Header.Del("Content-Encoding")
		return nil
	}
	return func(c *gin.Context) {
		p := strings.TrimPrefix(c.Request.URL.Path, "/dsh")
		if p == "" || p == "/" {
			// 登录注入：仅 GET 首页 + 尚无 dsh 会话 Cookie（dsh-auth- 前缀）+ 未带 token 参数时跳一次。
			// 注意不能以「无任何 Cookie」判断——同源 iframe 请求恒带平台会话 Cookie。
			if c.Request.Method == http.MethodGet && token != "" &&
				!strings.Contains(c.Request.Header.Get("Cookie"), "dsh-auth-") && c.Query("token") == "" {
				c.Redirect(http.StatusFound, "/dsh/?token="+token)
				return
			}
			p = "/"
		}
		c.Request.URL.Path = p
		c.Request.Host = target.Host
		c.Request.Header.Del("Origin")          // dsh 网关 Origin 校验：经反代的浏览器 Origin 必失配
		c.Request.Header.Del("Accept-Encoding") // 保证 HTML 可文本注入（防 gzip）
		proxy.ServeHTTP(c.Writer, c.Request)
	}
}
