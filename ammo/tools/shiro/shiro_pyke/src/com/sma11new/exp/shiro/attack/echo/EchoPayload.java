/*
 * Decompiled with CFR 0.152.
 */
package com.sma11new.exp.shiro.attack.echo;

import com.sun.xml.internal.ws.util.StringUtils;
import javassist.ClassPool;
import javassist.CtClass;

public interface EchoPayload<T> {
    public CtClass genPayload(ClassPool var1) throws Exception;

    public static class Utils {
        public static Class<? extends EchoPayload> getPayloadClass(String className) throws ClassNotFoundException {
            Class<?> clazz = null;
            try {
                clazz = Class.forName("com.sma11new.exp.shiro.attack.echo." + StringUtils.capitalize(className));
            }
            catch (Exception e2) {
                e2.printStackTrace();
            }
            return clazz;
        }
    }
}

