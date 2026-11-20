/*
 * Decompiled with CFR 0.152.
 */
package com.sma11new.exp.shiro.attack.util;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;

public class ClassFiles {
    public static String classAsFile(Class<?> clazz) {
        return ClassFiles.classAsFile(clazz, true);
    }

    public static String classAsFile(Class<?> clazz, boolean suffix) {
        String str2;
        String string2 = str2 = clazz.getEnclosingClass() == null ? clazz.getName().replace(".", "/") : ClassFiles.classAsFile(clazz.getEnclosingClass(), false) + "$" + clazz.getSimpleName();
        if (suffix) {
            str2 = str2 + ".class";
        }
        return str2;
    }

    public static byte[] classAsBytes(Class<?> clazz) {
        try {
            int len;
            byte[] buffer = new byte[1024];
            String file2 = ClassFiles.classAsFile(clazz);
            InputStream in = ClassFiles.class.getClassLoader().getResourceAsStream(file2);
            if (in == null) {
                throw new IOException("couldn't find '" + file2 + "'");
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            while ((len = in.read(buffer)) != -1) {
                out.write(buffer, 0, len);
            }
            return out.toByteArray();
        }
        catch (IOException e2) {
            throw new RuntimeException(e2);
        }
    }
}

