package ilink

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSendTextMessageSurfacesRejection(t *testing.T) {
	cases := []struct {
		name    string
		body    string
		wantErr bool
	}{
		{"ok-ret0", `{"ret":0}`, false},
		{"rejected-http200-ret-3", `{"ret":-3,"errmsg":"invalid arguments"}`, true},
		{"rejected-http200-errcode", `{"errcode":-2,"errmsg":"invalid arguments"}`, true},
		{"empty-body", ``, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusOK)
				_, _ = w.Write([]byte(tc.body))
			}))
			defer srv.Close()
			c := NewClient(srv.URL, "tok", "agent", 1)
			err := c.SendTextMessage(context.Background(), "u", "ctx", "hi", "")
			if tc.wantErr && err == nil {
				t.Fatalf("期望报错，实际 err=nil（静默失败没被修掉）")
			}
			if !tc.wantErr && err != nil {
				t.Fatalf("期望成功，实际 err=%v", err)
			}
			if err != nil {
				t.Logf("err = %v", err)
			}
		})
	}
}
