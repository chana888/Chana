/*
 * Decompiled with CFR 0.152.
 */
package com.sma11new.exp.shiro.attack.util;

import java.io.File;
import java.io.IOException;
import java.net.MalformedURLException;
import java.net.URL;
import java.net.URLClassLoader;

public class StandardExecutorClassLoader
extends URLClassLoader {
    private static final String baseDir = System.getProperty("user.dir") + File.separator + "lib" + File.separator;

    public StandardExecutorClassLoader(String version) {
        super(new URL[0], (ClassLoader)null);
        this.loadResource(version);
    }

    @Override
    public Class<?> loadClass(String name2) throws ClassNotFoundException {
        return super.loadClass(name2);
    }

    @Override
    protected Class<?> findClass(String name2) throws ClassNotFoundException {
        try {
            return super.findClass(name2);
        }
        catch (ClassNotFoundException e2) {
            return StandardExecutorClassLoader.class.getClassLoader().loadClass(name2);
        }
    }

    private void loadResource(String version) {
        String jarPath = baseDir + version;
        this.tryLoadJarInDir(jarPath);
    }

    private void tryLoadJarInDir(String dirPath) {
        System.out.println("Try load jar in dir: " + dirPath);
        File dir2 = new File(dirPath);
        if (dir2.exists() && dir2.isDirectory()) {
            for (File file2 : dir2.listFiles()) {
                if (!file2.isFile() || !file2.getName().endsWith(".jar")) continue;
                this.addURL(file2);
            }
        }
    }

    private void addURL(File file2) {
        try {
            super.addURL(new URL("file", null, file2.getCanonicalPath()));
        }
        catch (MalformedURLException e2) {
            e2.printStackTrace();
        }
        catch (IOException e3) {
            e3.printStackTrace();
        }
    }
}

