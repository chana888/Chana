/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  javafx.scene.control.Alert
 *  javafx.scene.control.Alert$AlertType
 *  javafx.stage.Window
 */
package com.sma11new.utils;

import cn.hutool.core.util.RandomUtil;
import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileWriter;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.MalformedURLException;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.Base64;
import java.util.Date;
import java.util.HashSet;
import java.util.Properties;
import java.util.Scanner;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javafx.scene.control.Alert;
import javafx.stage.Window;

public class Tools {
    public static void alert(String header_text, String content_text) {
        Alert alert = new Alert(Alert.AlertType.WARNING);
        Window window = alert.getDialogPane().getScene().getWindow();
        window.setOnCloseRequest(e2 -> window.hide());
        alert.setHeaderText(header_text);
        alert.setContentText(content_text);
        alert.show();
    }

    public static String get_escape_shell(String str2, String platform) {
        String key1 = "<";
        String key2 = ">";
        if (platform.equals("Linux")) {
            return "'" + str2 + "'";
        }
        return Tools.escape(key2, Tools.escape(key1, str2, "^"), "^");
    }

    public static String escape(String key2, String str2, String escape_str) {
        StringBuffer stringBuilder1 = new StringBuffer(str2);
        int a = str2.indexOf(key2);
        int i = 0;
        while (a != -1) {
            stringBuilder1.insert(a + i, escape_str);
            a = str2.indexOf(key2, a + 1);
            ++i;
        }
        return stringBuilder1.toString();
    }

    public static String checkTheDomain(String weburl) {
        if ("".equals(weburl.trim())) {
            return "";
        }
        if (!weburl.startsWith("http")) {
            weburl = "http://" + weburl;
        }
        if (!weburl.endsWith("/")) {
            weburl = weburl + "/";
        }
        return weburl;
    }

    public static String urlParse(String url) {
        if (url.length() == 0) {
            return "";
        }
        if (!url.contains("http")) {
            url = "http://" + url;
        }
        if (url.endsWith("/")) {
            url = url.substring(0, url.length() - 1);
        }
        return url;
    }

    public static boolean checkTheURL(String weburl) {
        if ("".equals(weburl.trim())) {
            return false;
        }
        return weburl.startsWith("http");
    }

    private static boolean match(String regex, String str2) {
        Pattern pattern = Pattern.compile(regex);
        Matcher matcher = pattern.matcher(str2);
        return matcher.matches();
    }

    public static String getDate() {
        Date d = new Date();
        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
        return sdf.format(d);
    }

    public static String reverse(String data2) {
        StringBuilder sb = new StringBuilder(data2);
        return sb.reverse().toString();
    }

    public static HashSet<String> read(String path2, String encode, Boolean domain) {
        HashSet<String> list = new HashSet<String>();
        try {
            FileInputStream fs = new FileInputStream(new File(path2));
            InputStreamReader isr = null;
            isr = encode.equals("") ? new InputStreamReader(fs) : new InputStreamReader((InputStream)fs, encode);
            BufferedReader br = new BufferedReader(isr);
            String tem = null;
            while ((tem = br.readLine()) != null) {
                if (domain.booleanValue()) {
                    tem = Tools.checkTheDomain(tem);
                }
                if (list.contains(tem)) continue;
                list.add(tem);
            }
            br.close();
            isr.close();
        }
        catch (Exception exception) {
            // empty catch block
        }
        return list;
    }

    public static boolean write(String path2, String value) {
        try {
            BufferedWriter out = new BufferedWriter(new FileWriter(path2));
            out.write(value);
            out.close();
        }
        catch (IOException e2) {
            return false;
        }
        return true;
    }

    public static String str2Hex(String str2) {
        char[] chars2 = "0123456789ABCDEF".toCharArray();
        StringBuilder sb = new StringBuilder("");
        byte[] bs = str2.getBytes();
        for (int i = 0; i < bs.length; ++i) {
            int bit = (bs[i] & 0xF0) >> 4;
            sb.append(chars2[bit]);
            bit = bs[i] & 0xF;
            sb.append(chars2[bit]);
        }
        return sb.toString().trim();
    }

    public static String hex2Str(String hexStr) {
        String str2 = "0123456789ABCDEF";
        char[] hexs = hexStr.toCharArray();
        byte[] bytes2 = new byte[hexStr.length() / 2];
        for (int i = 0; i < bytes2.length; ++i) {
            int n = str2.indexOf(hexs[2 * i]) * 16;
            bytes2[i] = (byte)((n += str2.indexOf(hexs[2 * i + 1])) & 0xFF);
        }
        return new String(bytes2);
    }

    public static String loadExp(String path2) {
        try {
            Properties pro = new Properties();
            FileInputStream in = new FileInputStream(path2);
            pro.load(in);
            String exp = (String)pro.get("exp");
            return exp;
        }
        catch (IOException var4) {
            return "";
        }
    }

    public static String regReplaceHtml(String content) {
        String pattern = "<.*html.*>[\\s\\S]*</html>";
        String newString = "";
        Pattern p = Pattern.compile(pattern);
        Matcher m = p.matcher(content);
        String result = m.replaceAll(newString);
        return result;
    }

    public static String getRandomString(int length) {
        String baseString = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        return RandomUtil.randomString(baseString, length);
    }

    public static String Base64Encode(String txt) {
        try {
            return Base64.getEncoder().encodeToString(txt.getBytes("UTF-8"));
        }
        catch (Exception var2) {
            return "";
        }
    }

    public static String getExp(String path2) {
        InputStream in = Tools.class.getClassLoader().getResourceAsStream(path2);
        Scanner s = new Scanner(in).useDelimiter("\\A");
        String str2 = s.hasNext() ? s.next() : "";
        return str2;
    }

    public static String extractAddress(String urlString) {
        try {
            URL url = new URL(urlString);
            return url.getHost();
        }
        catch (MalformedURLException e2) {
            e2.printStackTrace();
            return null;
        }
    }

    public static int extractPort(String urlString) {
        try {
            URL url = new URL(urlString);
            int port = url.getPort();
            if (port == -1) {
                return url.getDefaultPort();
            }
            return port;
        }
        catch (MalformedURLException e2) {
            e2.printStackTrace();
            return -1;
        }
    }

    public static String extractBaseUrl(String urlString) {
        try {
            URL url = new URL(urlString);
            return url.getProtocol() + "://" + url.getHost() + ":" + url.getPort();
        }
        catch (MalformedURLException e2) {
            e2.printStackTrace();
            return null;
        }
    }
}

