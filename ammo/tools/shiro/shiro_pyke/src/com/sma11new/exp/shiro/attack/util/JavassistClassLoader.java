/*
 * Decompiled with CFR 0.152.
 */
package com.sma11new.exp.shiro.attack.util;

public class JavassistClassLoader
extends ClassLoader {
    public JavassistClassLoader() {
        super(Thread.currentThread().getContextClassLoader());
    }
}

