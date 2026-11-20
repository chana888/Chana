/**
 * 这个模块的页面冗余太严重了，这里把新功能的js抽取成公共的js。希望以后有改动可以把冗余的js和页面提一些公共的出来
 */


/**
 * 打开非流程操作页面 (配置成url的情况）
 * @param url
 */
function openOperationPage(url) {
    url = replaceParam(url);
    url = parseUrl(url);
    openNewTabBack(url, "编辑数据", "编辑数据");
}

/**
 * 给没有项目根目录的url加上basePath（认为没有根目录即是本项目路径）
 * @param url
 * @returns {*}
 */
function parseUrl(url) {
    if(url.indexOf("http")!=0) {
        url = basePath + url;
    }
    return url;
}


/**
 * 替换宏定义参数。这里会替换轻应用中的字段，配置的时候配置成${字段名}
 * 例如教师基本信息中，教师的工号是20130030，工号字段名为GH，则配置的时候用${GH}占位，这里会把${GH}替换成20130030
 * @param url
 * @returns {*}
 */
function replaceParam(url) {
    var selected = grid.getSelected();
    var keys = Object.keys(selected);
    for(var i = 0; i < keys.length; i ++) {
        if(url.indexOf('${' + keys[i] + '}') !== -1) {
            url = url.replace(new RegExp('\\$\\{' + keys[i] + '\\}', 'g'), selected[keys[i]]);
        }
    }
    return url;
}

/**
 * 流程新增功能
 */
function addQueryResult(url){
    if(!url){
        mini.alert("流程flowkey不能为空！");
        return;
    }
    if(url.indexOf('/') != -1) {
        openOperationPage(url);
    } else {
        if(authRule!=''){
            var data = toFlowJson();
            openNewTabBack(basePath + "cooperative/openCooperative.htm?flowKey="+url, "新建数据", "新建数据",function(tabs, tab) {
                    var iframe = tabs.getTabIFrameEl(tab);
                    iframe.contentWindow.initExternalFormFieldRight(mini.encode(data));
                },
                function(tabs, tab) {

                });

        }else{
            openNewTabBack(basePath + "cooperative/openCooperative.htm?flowKey="+url, "新建数据", "新建数据");
        }
    }
}


/**
 * 编辑通用查询时逻辑
 * @param url
 * @param id
 */
function editQueryResult(url, id) {
    if(!url){
        mini.alert("流程flowkey不能为空！");
        return;
    }
    if(!id){
        mini.alert("该条数据缺少唯一标识字段！");
        return;
    }
    if(url.indexOf('/') != -1) {
        openOperationPage(url);
    } else {
        determineAuth(url, id);
    }
}

/**
 * 详情页面
 * @param flowKey
 * @param id
 */
function detailQueryResult(url, id) {
    if(!url){
        mini.alert("流程flowkey不能为空！");
        return;
    }
    if(!id){
        mini.alert("该条数据缺少唯一标识字段！");
        return;
    }
    if(url.indexOf('/') != -1) {
        openOperationPage(url);
    } else {
        historyCooperativeWithParam(url, {attacheId : id}, "查看详情", "查看详情");
    }
}

/**
 * 判断是否是授权
 * @param flowKey
 * @param id
 */
function determineAuth(flowKey, id) {
    if(authRule!=''){
        var data = toFlowJson();
        openCooperativeWithParam(flowKey, {attacheId : id}, "编辑数据", "编辑数据",function(tabs, tab) {
                var iframe = tabs.getTabIFrameEl(tab);
                iframe.contentWindow.initExternalFormFieldRight(mini.encode(data));
            },
            function(tabs, tab) {

            });

    }else{
        openCooperativeWithParam(flowKey, {attacheId : id}, "编辑数据", "编辑数据");

    }
}

/**
 * 条件格式转换成流程需要的
 */
function toFlowJson(){
    var flowJson = [];
    var condition = authRule.condition;
    if(JSON.stringify(condition) != '[]'){
        $.each(condition ||[],function(j,obj){
            var obj_ = {};
            obj_.field = obj.fieldName;
            obj_.rightValue = obj.paramValue;
            obj_.rightType = 'noedit';
            flowJson.push(obj_);
        });
    }
    return flowJson;
}

/**
 * 打开超链接
 * @param value
 */
function openHyperLink(value) {
    //TODO 暂时统计打开新的浏览器页签 后期根据需求确认是否修改
    window.open(value);
}