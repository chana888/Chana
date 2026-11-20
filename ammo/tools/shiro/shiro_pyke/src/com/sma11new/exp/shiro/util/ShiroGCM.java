/*
 * Decompiled with CFR 0.152.
 */
package com.sma11new.exp.shiro.util;

import com.sma11new.exp.shiro.util.EncryptInterface;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.ObjectOutputStream;
import org.apache.shiro.codec.Base64;
import org.apache.shiro.crypto.AesCipherService;
import org.apache.shiro.util.SimpleByteSource;

public class ShiroGCM
implements EncryptInterface {
    @Override
    public byte[] getBytes(Object obj) throws IOException {
        ByteArrayOutputStream byteArrayOutputStream = null;
        ObjectOutputStream objectOutputStream = null;
        byteArrayOutputStream = new ByteArrayOutputStream();
        objectOutputStream = new ObjectOutputStream(byteArrayOutputStream);
        objectOutputStream.writeObject(obj);
        objectOutputStream.flush();
        return byteArrayOutputStream.toByteArray();
    }

    @Override
    public String encrypt(String key2, byte[] objectBytes) {
        try {
            byte[] keyDecode = Base64.decode(key2);
            AesCipherService cipherService = new AesCipherService();
            SimpleByteSource byteSource = (SimpleByteSource)cipherService.encrypt(objectBytes, keyDecode);
            return byteSource.toBase64();
        }
        catch (Exception e2) {
            e2.printStackTrace();
            return null;
        }
    }

    @Override
    public String getName() {
        return "gcm";
    }
}

