# file_inclusion_pati — PayloadsAllTheThings File Inclusion 原始 POC 归档

> 来源: https://github.com/swisskyrepo/PayloadsAllTheThings/tree/master/File%20Inclusion
> 抓取日期: 2026-08-14 | 已校验 17/17 文件真实可读
> 整合手册: [`../techniques/kb_pati_file_inclusion_poc_2026.md`](../techniques/kb_pati_file_inclusion_poc_2026.md)

## 目录结构（与上游仓库一致）

```
file_inclusion_pati/
├── README.md              ← 本索引
├── Intruders/             ← 13 个 fuzz 字典 (532KB)
└── Files/                 ← 3 个利用脚本 (16KB)
```

## Intruders/ 字典速查

| 文件 | 大小 | 用途 |
|------|------|------|
| Traversal.txt | 378KB | 全量目录穿越 payload（ffuf/Burp 直接跑） |
| JHADDIX_LFI.txt | 28KB | JHADDIX 综合 LFI 字典 |
| List_Of_File_To_Include.txt | 24KB | 全平台可包含文件清单 |
| dot-slash-PathTraversal_and_LFI_pairing.txt | 65KB | 点斜线穿越+包含配对 |
| List_Of_File_To_Include_NullByteAdded.txt | 9.5KB | 文件清单 + %00 变体 |
| Windows-files.txt | 7KB | Windows 文件清单 |
| LFI-WindowsFileCheck.txt | 2KB | Windows LFI 快速验证 |
| Linux-files.txt | 1.5KB | Linux 文件清单 |
| php-filter-iconv.txt | 1.4KB | 全部 iconv 转换对（filter 链构造） |
| LFI-FD-check.txt | 692B | /proc/self/fd/N 检查清单 |
| BSD-files.txt | 356B | BSD 文件清单 |
| Mac-files.txt | 232B | macOS 文件清单 |
| Web-files.txt | 235B | 网站敏感文件（robots/config/phpmyadmin） |
| simple-check.txt | 157B | 快速探测编码变体 |

## Files/ 脚本速查

| 文件 | 用途 |
|------|------|
| LFI2RCE.py | php://filter iconv 链 RCE payload 生成器 |
| phpinfolfi.py | phpinfo() 辅助泄露上传临时文件 → LFI RCE |
| uploadlfi.py | 上传条件竞争 → LFI RCE |

## 使用

```bash
# ffuf 直接跑穿越字典
ffuf -w Traversal.txt -u 'http://target/index.php?file=FUZZ'

# LFI2RCE 生成 payload
python Files/LFI2RCE.py --help
```
