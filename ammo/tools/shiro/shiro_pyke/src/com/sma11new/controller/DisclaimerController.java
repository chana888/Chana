/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  javafx.event.ActionEvent
 *  javafx.fxml.FXML
 *  javafx.scene.control.Button
 *  javafx.stage.Stage
 */
package com.sma11new.controller;

import javafx.event.ActionEvent;
import javafx.fxml.FXML;
import javafx.scene.control.Button;
import javafx.stage.Stage;

public class DisclaimerController {
    @FXML
    private Button confirmButton;
    @FXML
    private Button cancelButton;
    private static boolean confirmed = false;

    @FXML
    private void handleButtonAction(ActionEvent event) {
        if (event.getSource() == this.confirmButton) {
            confirmed = true;
        } else if (event.getSource() == this.cancelButton) {
            confirmed = false;
        }
        Stage stage = (Stage)this.confirmButton.getScene().getWindow();
        stage.close();
    }

    public static boolean isConfirmed() {
        return confirmed;
    }
}

