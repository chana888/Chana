/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  javafx.application.Application
 *  javafx.event.EventHandler
 *  javafx.fxml.FXMLLoader
 *  javafx.scene.Parent
 *  javafx.scene.Scene
 *  javafx.scene.image.Image
 *  javafx.stage.Stage
 *  javafx.stage.WindowEvent
 */
package com.sma11new;

import com.sma11new.config.Config;
import com.sma11new.controller.DisclaimerController;
import java.net.URL;
import java.util.Objects;
import javafx.application.Application;
import javafx.event.EventHandler;
import javafx.fxml.FXMLLoader;
import javafx.scene.Parent;
import javafx.scene.Scene;
import javafx.scene.image.Image;
import javafx.stage.Stage;
import javafx.stage.WindowEvent;

public class AppStartUp
extends Application {
    public void start(Stage primaryStage) throws Exception {
        FXMLLoader loader = new FXMLLoader(((Object)((Object)this)).getClass().getClassLoader().getResource("fxml/Disclaimer.fxml"));
        Parent disclaimerRoot = (Parent)loader.load();
        Scene scene = new Scene(disclaimerRoot);
        Stage dialogStage = new Stage();
        dialogStage.setScene(scene);
        dialogStage.setTitle("\u4f7f\u7528\u534f\u8bae");
        dialogStage.showAndWait();
        boolean confirmed = DisclaimerController.isConfirmed();
        if (confirmed) {
            Parent root2 = (Parent)FXMLLoader.load((URL)Objects.requireNonNull(((Object)((Object)this)).getClass().getClassLoader().getResource("fxml/Shiro.fxml")));
            primaryStage.setTitle(Config.NAME + " " + Config.VERSION);
            primaryStage.setScene(new Scene(root2));
            primaryStage.setOnCloseRequest((EventHandler)new EventHandler<WindowEvent>(){

                public void handle(WindowEvent event) {
                    System.exit(0);
                }
            });
            primaryStage.setResizable(false);
            primaryStage.getIcons().add((Object)new Image(Objects.requireNonNull(((Object)((Object)this)).getClass().getClassLoader().getResource("img/ikun.png")).toString()));
            primaryStage.show();
        } else {
            System.exit(0);
        }
    }

    public static void main(String[] args) {
        AppStartUp.launch((String[])args);
    }
}

