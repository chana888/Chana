/*
 * Decompiled with CFR 0.152.
 */
package com.sma11new.exp.shiro.util;

import java.io.IOException;

public interface EncryptInterface {
    public byte[] getBytes(Object var1) throws IOException;

    public String encrypt(String var1, byte[] var2);

    public String getName();
}

