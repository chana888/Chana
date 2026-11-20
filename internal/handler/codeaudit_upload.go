package handler

// 代码审计目标上传（2026-10-05 R9d）
// 本地项目压缩包(zip/tar.gz/tgz/tar) → 安全解压到 /opt/targets/<名>-<时间戳>/
//
// 安全防护（本接口自身就是红队平台的攻击面，按高危处理）：
//   - 扩展名白名单：仅 zip/tar.gz/tgz/tar，拒绝一切可直接执行的脚本/二进制扩展名
//   - 服务端命名落地目录：客户端文件名仅经白名单清洗后使用，杜绝路径穿越
//   - zip-slip 防护：每条压缩条目清洗后必须落在解压根内，含 ../ 或绝对路径一律剔除
//   - 符号链接 / 硬链接 / 设备节点 / FIFO 条目一律剔除（tar 提权与逃逸面）
//   - 不保留可执行位：统一 0644/0755（审计的是源码，不需要执行）
//   - zip bomb 防护：解压总字节上限 + 条目数上限，超限整体失败并清理
//   - 落地目录不在任何 web 可服务路径下；失败即回收目录

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"fmt"
	"io"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"golang.org/x/text/encoding/simplifiedchinese"
)

const (
	codeAuditUploadMaxBytes  = 512 << 20  // 上传压缩包本体上限（nginx client_max_body_size 同额）
	codeAuditExtractMaxBytes = 2 << 30    // 解压后总字节上限（zip bomb 兜底）
	codeAuditExtractMaxFiles = 200000     // 解压条目数上限
	codeAuditDirNameMax      = 60         // 落地目录名长度上限
)

// CodeAuditUploadHandler 代码审计目标上传
type CodeAuditUploadHandler struct {
	logger *zap.Logger
	root   string
}

// NewCodeAuditUploadHandler 创建处理器；目录可用 DRT_CODEAUDIT_TARGET_DIR 覆盖（默认 /opt/targets）
func NewCodeAuditUploadHandler(logger *zap.Logger) *CodeAuditUploadHandler {
	root := os.Getenv("DRT_CODEAUDIT_TARGET_DIR")
	if root == "" {
		root = "/opt/targets"
	}
	return &CodeAuditUploadHandler{logger: logger, root: root}
}

var codeAuditNameSanitizer = regexp.MustCompile(`[^A-Za-z0-9._-]+`)

// sanitizeDirName 客户端文件名 → 安全目录名片段（只留字母数字点横下划线）
func sanitizeDirName(filename string) string {
	base := filepath.Base(filename)
	base = strings.TrimSuffix(base, ".zip")
	base = strings.TrimSuffix(base, ".tar.gz")
	base = strings.TrimSuffix(base, ".tgz")
	base = strings.TrimSuffix(base, ".tar")
	if strings.ToLower(base) == "tar.gz" || base == "" {
		base = ""
	}
	base = codeAuditNameSanitizer.ReplaceAllString(base, "_")
	base = strings.Trim(base, "._-")
	if len(base) > codeAuditDirNameMax {
		base = base[:codeAuditDirNameMax]
	}
	if base == "" {
		base = "project"
	}
	return base
}

// safeEntryName 压缩条目名 → 安全相对路径；不安全返回 false（条目剔除并计数）
func safeEntryName(name string) (string, bool) {
	n := strings.ReplaceAll(name, "\\", "/")
	n = strings.TrimPrefix(n, "./")
	if n == "" || n == "." || strings.HasPrefix(n, "/") || strings.Contains(n, "\x00") {
		return "", false
	}
	n = path.Clean(n)
	if n == ".." || strings.HasPrefix(n, "../") || n == "." {
		return "", false
	}
	// Windows 打包常见 GBK 文件名 → UTF-8
	if !utf8.ValidString(n) {
		if dec, err := simplifiedchinese.GBK.NewDecoder().String(n); err == nil && utf8.ValidString(dec) {
			n = dec
		} else {
			return "", false
		}
	}
	return n, true
}

// extractStats 解压统计
type extractStats struct {
	files   int64
	dirs    int64
	bytes   int64
	skipped int64
}

func (s *extractStats) tooBig() bool { return s.bytes > codeAuditExtractMaxBytes || s.files > codeAuditExtractMaxFiles }

// underRoot 复核 target 仍在解压根目录内（双保险）
func underRoot(root, target string) bool {
	cleanRoot := filepath.Clean(root)
	return strings.HasPrefix(target, cleanRoot+string(os.PathSeparator))
}

// extractZip 安全解压 zip
func extractZip(src, dest string) (*extractStats, error) {
	zr, err := zip.OpenReader(src)
	if err != nil {
		return nil, fmt.Errorf("zip 打开失败: %w", err)
	}
	defer zr.Close()
	st := &extractStats{}
	for _, f := range zr.File {
		if st.tooBig() {
			return nil, fmt.Errorf("解压超限（>2GB 或 >20万条目），疑似 zip bomb，已终止")
		}
		fi := f.FileInfo()
		if fi.Mode()&os.ModeSymlink != 0 {
			st.skipped++
			continue
		}
		safe, ok := safeEntryName(f.Name)
		if !ok {
			st.skipped++
			continue
		}
		target := filepath.Join(dest, filepath.FromSlash(safe))
		if !underRoot(dest, target) {
			st.skipped++
			continue
		}
		if fi.IsDir() {
			if err := os.MkdirAll(target, 0755); err != nil {
				return nil, err
			}
			st.dirs++
			continue
		}
		if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
			return nil, err
		}
		rc, err := f.Open()
		if err != nil {
			return nil, err
		}
		// O_EXCL：同名条目冲突时跳过而非覆盖已落地内容
		out, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0644)
		if err != nil {
			rc.Close()
			if os.IsExist(err) {
				st.skipped++
				continue
			}
			return nil, err
		}
		n, cerr := io.Copy(out, rc)
		rc.Close()
		out.Close()
		if cerr != nil {
			return nil, cerr
		}
		st.files++
		st.bytes += n
	}
	return st, nil
}

// extractTar 安全解压 tar / tar.gz（链接与设备节点剔除）
func extractTar(src, dest string, gzipped bool) (*extractStats, error) {
	f, err := os.Open(src)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	var r io.Reader = f
	if gzipped {
		gz, err := gzip.NewReader(f)
		if err != nil {
			return nil, fmt.Errorf("gzip 打开失败: %w", err)
		}
		defer gz.Close()
		r = gz
	}
	tr := tar.NewReader(r)
	st := &extractStats{}
	for {
		if st.tooBig() {
			return nil, fmt.Errorf("解压超限（>2GB 或 >20万条目），疑似压缩炸弹，已终止")
		}
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("tar 读取失败: %w", err)
		}
		switch hdr.Typeflag {
		case tar.TypeDir:
			safe, ok := safeEntryName(hdr.Name)
			if !ok {
				st.skipped++
				continue
			}
			target := filepath.Join(dest, filepath.FromSlash(safe))
			if !underRoot(dest, target) {
				st.skipped++
				continue
			}
			if err := os.MkdirAll(target, 0755); err != nil {
				return nil, err
			}
			st.dirs++
		case tar.TypeReg:
			safe, ok := safeEntryName(hdr.Name)
			if !ok {
				st.skipped++
				continue
			}
			target := filepath.Join(dest, filepath.FromSlash(safe))
			if !underRoot(dest, target) {
				st.skipped++
				continue
			}
			if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
				return nil, err
			}
			out, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0644)
			if err != nil {
				if os.IsExist(err) {
					st.skipped++
					continue
				}
				return nil, err
			}
			// 限流读取：不信任 hdr.Size，实读计数兜底
			n, cerr := io.Copy(out, io.LimitReader(tr, codeAuditExtractMaxBytes+1))
			out.Close()
			if cerr != nil {
				return nil, cerr
			}
			st.files++
			st.bytes += n
		default:
			// TypeSymlink / TypeLink / TypeChar / TypeBlock / TypeFifo 一律剔除
			st.skipped++
		}
	}
	return st, nil
}

// Upload POST /api/codeaudit/upload (multipart file)
func (h *CodeAuditUploadHandler) Upload(c *gin.Context) {
	// 请求体硬上限（文件上限 + multipart 边界开销）
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, codeAuditUploadMaxBytes+(16<<20))

	fh, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "读取上传文件失败: " + err.Error()})
		return
	}
	if fh.Size <= 0 || fh.Size > codeAuditUploadMaxBytes {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": fmt.Sprintf("压缩包大小需在 (0, %dMB] 内，当前 %dMB", codeAuditUploadMaxBytes>>20, fh.Size>>20)})
		return
	}

	base := filepath.Base(fh.Filename)
	lower := strings.ToLower(base)
	var kind, kindName string
	switch {
	case strings.HasSuffix(lower, ".zip"):
		kind, kindName = "zip", "zip"
	case strings.HasSuffix(lower, ".tar.gz"):
		kind, kindName = "targz", "tar.gz"
	case strings.HasSuffix(lower, ".tgz"):
		kind, kindName = "targz", "tgz"
	case strings.HasSuffix(lower, ".tar"):
		kind, kindName = "tar", "tar"
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "仅支持 .zip / .tar.gz / .tgz / .tar 压缩包（源码项目），不支持其他文件类型"})
		return
	}

	// 服务端命名落地目录：客户端名仅做白名单清洗
	if err := os.MkdirAll(h.root, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "目标根目录创建失败: " + err.Error()})
		return
	}
	dest := filepath.Join(h.root, sanitizeDirName(base)+"-"+time.Now().Format("20060102-150405"))
	if !underRoot(h.root, dest) {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "落地路径校验失败"})
		return
	}
	if err := os.MkdirAll(dest, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "落地目录创建失败: " + err.Error()})
		return
	}

	// 临时落地压缩包（解压完即删）
	tmp := dest + ".part"
	if err := c.SaveUploadedFile(fh, tmp); err != nil {
		os.RemoveAll(dest)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "压缩包保存失败: " + err.Error()})
		return
	}
	defer os.Remove(tmp)

	var st *extractStats
	switch kind {
	case "zip":
		st, err = extractZip(tmp, dest)
	default:
		st, err = extractTar(tmp, dest, kind == "targz")
	}
	if err != nil {
		os.RemoveAll(dest)
		h.logger.Warn("codeaudit upload extract failed", zap.String("dest", dest), zap.Error(err))
		c.JSON(http.StatusBadRequest, gin.H{"error": "解压失败（已清理）: " + err.Error()})
		return
	}
	if st.files == 0 {
		os.RemoveAll(dest)
		c.JSON(http.StatusBadRequest, gin.H{"error": "压缩包内没有可用的普通文件（目录/链接/穿越条目不算）"})
		return
	}

	h.logger.Info("codeaudit target uploaded",
		zap.String("dest", dest), zap.Int64("files", st.files),
		zap.Int64("bytes", st.bytes), zap.Int64("skipped", st.skipped))
	c.JSON(http.StatusOK, gin.H{
		"path":    dest,
		"files":   st.files,
		"dirs":    st.dirs,
		"bytes":   st.bytes,
		"skipped": st.skipped, // 被安全策略剔除的条目数（穿越/链接/设备/超限）
		"kind":    kindName,
	})
}
