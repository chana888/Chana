/*
 * Decompiled with CFR 0.152.
 */
package com.sma11new.utils;

import com.sma11new.config.Config;
import com.sma11new.controller.ShiroController;
import com.sma11new.utils.Cert;
import com.sma11new.utils.Response;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.Proxy;
import java.net.URL;
import java.security.SecureRandom;
import java.util.HashMap;
import javax.net.ssl.HostnameVerifier;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSession;
import javax.net.ssl.TrustManager;

public class HttpUtils {
    private static String UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/77.0.3865.90 Safari/537.36";

    public static Response get(String url, HashMap<String, String> headers, String encoding2) {
        Response response = new Response(0, "null", "null", null);
        try {
            HttpURLConnection conn = HttpUtils.getCoon(url);
            conn.setRequestMethod("GET");
            for (String key2 : headers.keySet()) {
                conn.setRequestProperty(key2, headers.get(key2));
            }
            response = HttpUtils.getResponse(conn, encoding2);
        }
        catch (Exception var8) {
            response.setError(var8.getMessage());
        }
        return response;
    }

    public static Response post(String url, String postString, HashMap<String, String> headers, String encoding2) {
        Response response = new Response(0, "null", "null", null);
        try {
            HttpURLConnection conn = HttpUtils.getCoon(url);
            conn.setRequestMethod("POST");
            for (String key2 : headers.keySet()) {
                conn.setRequestProperty(key2, headers.get(key2));
            }
            OutputStream outputStream = conn.getOutputStream();
            outputStream.write(postString.replace("\r\n", "\n").replace("\n", "\r\n").getBytes());
            outputStream.flush();
            outputStream.close();
            response = HttpUtils.getResponse(conn, encoding2);
        }
        catch (Exception var8) {
            response.setError(var8.getMessage());
        }
        return response;
    }

    public static Response put(String url, String postString, HashMap<String, String> headers, String encoding2) {
        Response response = new Response(0, "null", "null", null);
        try {
            HttpURLConnection conn = HttpUtils.getCoon(url);
            conn.setRequestMethod("PUT");
            for (String key2 : headers.keySet()) {
                conn.setRequestProperty(key2, headers.get(key2));
            }
            OutputStream outputStream = conn.getOutputStream();
            outputStream.write(postString.replace("\r\n", "\n").replace("\n", "\r\n").getBytes());
            outputStream.flush();
            outputStream.close();
            response = HttpUtils.getResponse(conn, encoding2);
        }
        catch (Exception var8) {
            response.setError(var8.getMessage());
        }
        return response;
    }

    private static Response getResponse(HttpURLConnection conn, String encoding2) {
        Response response = new Response(0, "null", "null", null);
        try {
            conn.connect();
            response.setCode(conn.getResponseCode());
            response.setHead(conn.getHeaderFields().toString());
            response.setBody(HttpUtils.streamToString(conn.getInputStream(), encoding2));
        }
        catch (IOException var3) {
            InputStream errorStream = conn.getErrorStream();
            response.setBody(HttpUtils.streamToString(errorStream, encoding2));
            response.setError(var3.toString());
        }
        return response;
    }

    private static HttpURLConnection getCoon(String url) throws Exception {
        SSLContext sslcontext = SSLContext.getInstance("SSL", "SunJSSE");
        TrustManager[] tm = new TrustManager[]{new Cert()};
        sslcontext.init(null, tm, new SecureRandom());
        HostnameVerifier ignoreHostnameVerifier = new HostnameVerifier(){

            @Override
            public boolean verify(String s, SSLSession sslsession) {
                return true;
            }
        };
        HttpsURLConnection.setDefaultHostnameVerifier(ignoreHostnameVerifier);
        HttpsURLConnection.setDefaultSSLSocketFactory(sslcontext.getSocketFactory());
        URL url_object = new URL(url);
        HttpURLConnection conn = (HttpURLConnection)url_object.openConnection();
        Proxy proxy2 = (Proxy)ShiroController.proxySettingInfo.get("proxy");
        if (proxy2 != null) {
            conn = (HttpURLConnection)url_object.openConnection(proxy2);
        }
        conn.setRequestProperty("User-Agent", UA);
        conn.setRequestProperty("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9");
        conn.setRequestProperty("Accept-Language", "zh-CN,zh;q=0.9");
        conn.setRequestProperty("Connection", "close");
        conn.setConnectTimeout(Config.CONNECT_TIME_OUT * 1000);
        conn.setReadTimeout(Config.READ_TIME_OUT * 1000);
        conn.setDoOutput(true);
        conn.setDoInput(true);
        conn.setUseCaches(false);
        conn.setInstanceFollowRedirects(false);
        return conn;
    }

    private static String streamToString(InputStream inputStream, String encoding2) {
        String resultString = null;
        ByteArrayOutputStream byteArrayOutputStream = new ByteArrayOutputStream();
        byte[] data2 = new byte[1024];
        try {
            int len;
            while ((len = inputStream.read(data2)) != -1) {
                byteArrayOutputStream.write(data2, 0, len);
            }
            if (encoding2.equals("")) {
                encoding2 = "UTF-8";
            }
            resultString = byteArrayOutputStream.toString(encoding2);
        }
        catch (Exception e2) {
            try {
                resultString = byteArrayOutputStream.toString(encoding2);
            }
            catch (Exception exception) {
                resultString = exception.getMessage();
                exception.printStackTrace();
            }
        }
        return resultString;
    }
}

