/*
 * Decompiled with CFR 0.152.
 */
package com.sma11new.exp.shiro.util;

import java.security.Key;
import java.security.SecureRandom;
import javax.crypto.Cipher;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;

public class AesUtil {
    public static byte[] encrypt(byte[] plainText, byte[] key2) throws Exception {
        int ivSize = 16;
        byte[] iv = new byte[ivSize];
        SecureRandom random = new SecureRandom();
        random.nextBytes(iv);
        IvParameterSpec ivParameterSpec = new IvParameterSpec(iv);
        SecretKeySpec secretKeySpec = new SecretKeySpec(key2, "AES");
        Cipher cipher = Cipher.getInstance("AES/CBC/PKCS5Padding");
        cipher.init(1, (Key)secretKeySpec, ivParameterSpec);
        byte[] encrypted = cipher.doFinal(plainText);
        byte[] encryptedIvandtext = new byte[ivSize + encrypted.length];
        System.arraycopy(iv, 0, encryptedIvandtext, 0, ivSize);
        System.arraycopy(encrypted, 0, encryptedIvandtext, ivSize, encrypted.length);
        return encryptedIvandtext;
    }
}

