package httpapi_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/sahilkhaire/k8s-apis/internal/httpapi"
	"github.com/sahilkhaire/k8s-apis/internal/rbac"
	"github.com/sahilkhaire/k8s-apis/internal/store"
)

func newHandlerWithStore(t *testing.T, st store.Store) http.Handler {
	t.Helper()
	return newAuthHandlerWithOptions(t, st, httpapi.Deps{})
}

func TestPermissionSetTemplatesOwner(t *testing.T) {
	t.Parallel()
	h := newAuthHandler(t)
	session := login(t, h, "owner", "secret")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/settings/permission-sets/templates", nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("code=%d body=%s", rec.Code, rec.Body.String())
	}

	var templates []map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &templates); err != nil {
		t.Fatal(err)
	}
	if len(templates) != 3 {
		t.Fatalf("templates=%d want 3", len(templates))
	}
}

func TestPermissionSetTemplatesMemberForbidden(t *testing.T) {
	t.Parallel()
	st := store.NewMemory()
	createMember(t, st, "member", "pass")
	h := newHandlerWithStore(t, st)
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/settings/permission-sets/templates", nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("code=%d want 403", rec.Code)
	}
}

func TestClonePermissionSetFromTemplate(t *testing.T) {
	t.Parallel()
	h := newAuthHandler(t)
	session := login(t, h, "owner", "secret")

	body := bytes.NewBufferString(`{"name":"My Viewer","description":"clone","cloneFromTemplate":"viewer"}`)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/settings/permission-sets", body)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("code=%d body=%s", rec.Code, rec.Body.String())
	}

	var resp map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if bt, ok := resp["builtinTemplate"]; ok && bt != "" && bt != nil {
		t.Fatalf("builtinTemplate=%v want empty", bt)
	}
	grants, ok := resp["grants"].(map[string]any)
	if !ok {
		t.Fatalf("grants=%v", resp["grants"])
	}
	pods, ok := grants["pods"].([]any)
	if !ok || len(pods) != 1 || pods[0] != "view" {
		t.Fatalf("pods grants=%v", grants["pods"])
	}
}

func TestDeletePermissionSetInUseHTTP(t *testing.T) {
	t.Parallel()
	st := store.NewMemory()
	h := newHandlerWithStore(t, st)
	session := login(t, h, "owner", "secret")
	now := time.Now().UTC()

	ps := store.PermissionSet{
		ID:          "aaaaaaaaaaaaaaaaaaaaaaaa",
		Name:        "In Use",
		Description: "test",
		Grants:      map[string][]string{"pods": {"view"}},
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if err := st.CreatePermissionSet(context.Background(), ps); err != nil {
		t.Fatal(err)
	}
	if err := st.CreateMember(context.Background(), store.User{
		ID:              "member-1",
		Username:        "member",
		DisplayName:     "Member",
		Role:            store.RoleMember,
		PasswordHash:    "hash",
		Enabled:         true,
		PermissionSetID: ps.ID,
		CreatedAt:       now,
		UpdatedAt:       now,
	}); err != nil {
		t.Fatal(err)
	}

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodDelete, "/api/settings/permission-sets/"+ps.ID, nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusConflict {
		t.Fatalf("code=%d body=%s", rec.Code, rec.Body.String())
	}
}

func TestPermissionSetTemplatesNoSettingsModules(t *testing.T) {
	t.Parallel()
	for _, tmpl := range rbac.Templates() {
		for module := range tmpl.Grants {
			if strings.HasPrefix(module, "settings.") {
				t.Fatalf("template %s includes settings module %s", tmpl.BuiltinTemplate, module)
			}
		}
	}
}
