package httpapi_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/zixflow/k8s/internal/store"
)

func TestMustChangePasswordGate(t *testing.T) {
	t.Parallel()
	st := store.NewMemory()
	createMember(t, st, "member", "temppass")
	h := newAuthHandlerWithStore(t, st)
	session := login(t, h, "member", "temppass")

	membersRec := httptest.NewRecorder()
	membersReq := httptest.NewRequest(http.MethodGet, "/api/settings/members", nil)
	membersReq.AddCookie(session)
	h.ServeHTTP(membersRec, membersReq)
	if membersRec.Code != http.StatusForbidden {
		t.Fatalf("members code=%d want 403", membersRec.Code)
	}

	readyRec := httptest.NewRecorder()
	h.ServeHTTP(readyRec, httptest.NewRequest(http.MethodGet, "/readyz", nil))
	if readyRec.Code != http.StatusOK {
		t.Fatalf("readyz code=%d want 200", readyRec.Code)
	}

	meRec := httptest.NewRecorder()
	meReq := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	meReq.AddCookie(session)
	h.ServeHTTP(meRec, meReq)
	if meRec.Code != http.StatusOK {
		t.Fatalf("me code=%d body=%s", meRec.Code, meRec.Body.String())
	}

	pwRec := httptest.NewRecorder()
	pwBody := strings.NewReader(`{"currentPassword":"temppass","newPassword":"newpass1"}`)
	pwReq := httptest.NewRequest(http.MethodPost, "/api/auth/password", pwBody)
	pwReq.AddCookie(session)
	h.ServeHTTP(pwRec, pwReq)
	if pwRec.Code != http.StatusOK {
		t.Fatalf("password change code=%d body=%s", pwRec.Code, pwRec.Body.String())
	}

	meRec2 := httptest.NewRecorder()
	meReq2 := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	meReq2.AddCookie(session)
	h.ServeHTTP(meRec2, meReq2)
	if meRec2.Code != http.StatusOK {
		t.Fatalf("me after password change code=%d body=%s", meRec2.Code, meRec2.Body.String())
	}
	var me map[string]any
	if err := json.Unmarshal(meRec2.Body.Bytes(), &me); err != nil {
		t.Fatal(err)
	}
	if me["mustChangePassword"] != false {
		t.Fatalf("mustChangePassword=%v want false", me["mustChangePassword"])
	}

	membersRec2 := httptest.NewRecorder()
	membersReq2 := httptest.NewRequest(http.MethodGet, "/api/settings/members", nil)
	membersReq2.AddCookie(session)
	h.ServeHTTP(membersRec2, membersReq2)
	if membersRec2.Code != http.StatusForbidden {
		t.Fatalf("members after password change code=%d want 403 (not owner)", membersRec2.Code)
	}
}
