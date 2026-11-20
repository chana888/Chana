/*
 * Decompiled with CFR 0.152.
 */
package com.sma11new.exp.shiro.attack.payloads;

import com.sun.xml.internal.ws.util.StringUtils;

public interface ObjectPayload<T> {
    public T getObject(Object var1) throws Exception;

    public static class Utils {
        public static Class<? extends ObjectPayload> getPayloadClass(String className) {
            Class<?> clazz = null;
            try {
                clazz = Class.forName("com.sma11new.exp.shiro.attack.payloads." + StringUtils.capitalize(className));
            }
            catch (Exception exception) {
                // empty catch block
            }
            return clazz;
        }
    }
}

