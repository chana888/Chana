/*
 * Decompiled with CFR 0.152.
 */
package com.sma11new.config;

import cn.hutool.core.io.resource.ResourceUtil;

public class Config {
    public static String NAME = "Pyke-Shiro";
    public static String VERSION = "0.3";
    public static String UPDATEINFO = ResourceUtil.readUtf8Str("updateInfo.txt");
    public static String DEFAULT_ENCODING = "UTF-8";
    public static int CONNECT_TIME_OUT = 5;
    public static int READ_TIME_OUT = 10;
}

