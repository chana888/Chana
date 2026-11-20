/*
 * Decompiled with CFR 0.152.
 */
package com.sma11new.utils;

import java.util.HashMap;
import java.util.Map;
import java.util.StringJoiner;

public class HttpMsgUtil {
    public static void main(String[] args) {
        String rawRequest = "POST /doLogin HTTP/1.1\nHost: 192.168.11.100:8080\nUser-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0\nAccept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8\nAccept-Language: zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2\nAccept-Encoding: gzip, deflate\nContent-Type: application/x-www-form-urlencoded\nContent-Length: 30\nOrigin: http://192.168.11.100:8080\nConnection: close\nReferer: http://192.168.11.100:8080/login;jsessionid=2591C485EF42C08BF1C41F7A2D020E8C\nCookie: JSESSIONID=2591C485EF42C08BF1C41F7A2D020E8C\nUpgrade-Insecure-Requests: 1\n\n\n";
        Map<String, Object> parsedRequest = HttpMsgUtil.parseRawHttpRequest(rawRequest, false, true);
        System.out.println("URL: " + parsedRequest.get("url"));
        System.out.println("Headers: " + parsedRequest.get("headers"));
        System.out.println("Data: " + parsedRequest.get("data"));
    }

    public static Map<String, Object> parseRawHttpRequest(String rawRequest, boolean https, boolean keepCookie) {
        HashMap<String, Object> result = new HashMap<String, Object>();
        String[] requestParts = rawRequest.split("\n\n", 2);
        String[] lines = requestParts[0].split("\n");
        String method = lines[0].split(" ")[0];
        String path2 = lines[0].split(" ")[1];
        HashMap<String, String> headers = new HashMap<String, String>();
        String host = "";
        for (int i = 1; i < lines.length; ++i) {
            String[] headerParts = lines[i].split(": ", 2);
            headers.put(headerParts[0], headerParts[1]);
            if (!"Host".equalsIgnoreCase(headerParts[0])) continue;
            host = headerParts[1];
        }
        String url = https ? "https://" + host + path2 : "http://" + host + path2;
        HashMap<String, String> data2 = new HashMap<String, String>();
        if (requestParts.length > 1 && !requestParts[1].trim().isEmpty()) {
            String[] dataParts;
            for (String part : dataParts = requestParts[1].split("&")) {
                String[] keyValue = part.split("=", 2);
                data2.put(keyValue[0], keyValue[1]);
            }
        }
        if (!keepCookie) {
            headers.put("Cookie", null);
        } else if (!headers.containsKey("Cookie")) {
            headers.put("Cookie", null);
        }
        result.put("method", method);
        result.put("url", url);
        result.put("headers", headers);
        result.put("data", data2);
        return result;
    }

    public static String mapToUrlEncodedString(Map<String, String> data2) {
        StringJoiner sj = new StringJoiner("&");
        for (Map.Entry<String, String> entry : data2.entrySet()) {
            String key2 = entry.getKey();
            String value = entry.getValue();
            sj.add(key2 + "=" + value);
        }
        return sj.toString();
    }
}

