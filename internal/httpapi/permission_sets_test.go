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

	"github.com/sahilkhaire/kubepilot/internal/httpapi"
	"github.com/sahilkhaire/kubepilot/internal/rbac"
	"github.com/sahilkhaire/kubepilot/internal/store"
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

func TestPermissionSetCatalogOwner(t *testing.T) {
	t.Parallel()
	h := newAuthHandler(t)
	session := login(t, h, "owner", "secret")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/settings/permission-sets/catalog", nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("code=%d body=%s", rec.Code, rec.Body.String())
	}

	var groups []rbac.CatalogGroup
	if err := json.Unmarshal(rec.Body.Bytes(), &groups); err != nil {
		t.Fatal(err)
	}
	if len(groups) == 0 {
		t.Fatal("expected catalog groups")
	}
	foundPods := false
	for _, g := range groups {
		for _, m := range g.Modules {
			if strings.HasPrefix(m.ID, "settings.") {
				t.Fatalf("catalog includes settings module %s", m.ID)
			}
			if m.ID == "pods" {
				foundPods = true
			}
		}
	}
	if !foundPods {
		t.Fatal("catalog missing pods")
	}
}

func TestPermissionSetCatalogMemberForbidden(t *testing.T) {
	t.Parallel()
	st := store.NewMemory()
	createMember(t, st, "member", "pass")
	h := newHandlerWithStore(t, st)
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/settings/permission-sets/catalog", nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("code=%d want 403", rec.Code)
	}
}

func TestCreatePermissionSetRejectsUnknownModule(t *testing.T) {
	t.Parallel()
	h := newAuthHandler(t)
	session := login(t, h, "owner", "secret")

	body := bytes.NewBufferString(`{"name":"Bad","grants":{"nope":["view"]}}`)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/settings/permission-sets", body)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("code=%d body=%s", rec.Code, rec.Body.String())
	}
}

func TestCreatePermissionSetRejectsActionWithoutView(t *testing.T) {
	t.Parallel()
	h := newAuthHandler(t)
	session := login(t, h, "owner", "secret")

	body := bytes.NewBufferString(`{"name":"Bad","grants":{"deployments":["scale"]}}`)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/settings/permission-sets", body)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("code=%d body=%s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "requires view") {
		t.Fatalf("body=%s", rec.Body.String())
	}
}

func TestUpdatePermissionSetGrants(t *testing.T) {
	t.Parallel()
	st := store.NewMemory()
	h := newHandlerWithStore(t, st)
	session := login(t, h, "owner", "secret")
	createPermissionSet(t, st, "ps-edit")

	body := bytes.NewBufferString(`{"grants":{"pods":["logs","view"],"events":["view"]}}`)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPatch, "/api/settings/permission-sets/ps-edit", body)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("code=%d body=%s", rec.Code, rec.Body.String())
	}

	var resp map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	grants := resp["grants"].(map[string]any)
	pods := grants["pods"].([]any)
	if len(pods) != 2 || pods[0] != "view" || pods[1] != "logs" {
		t.Fatalf("pods=%v want [view logs]", pods)
	}
}

func TestGetPermissionSetAndMemberCount(t *testing.T) {
	t.Parallel()
	st := store.NewMemory()
	h := newHandlerWithStore(t, st)
	session := login(t, h, "owner", "secret")
	now := time.Now().UTC()
	ps := store.PermissionSet{
		ID:        "ps-count",
		Name:      "Counted",
		Grants:    map[string][]string{"pods": {"view"}},
		CreatedAt: now,
		UpdatedAt: now,
	}
	if err := st.CreatePermissionSet(context.Background(), ps); err != nil {
		t.Fatal(err)
	}
	if err := st.CreateMember(context.Background(), store.User{
		ID:              "m1",
		Username:        "alice",
		DisplayName:     "Alice",
		Role:            store.RoleMember,
		PasswordHash:    "hash",
		Enabled:         true,
		PermissionSetID: ps.ID,
		CreatedAt:       now,
		UpdatedAt:       now,
	}); err != nil {
		t.Fatal(err)
	}

	getRec := httptest.NewRecorder()
	getReq := httptest.NewRequest(http.MethodGet, "/api/settings/permission-sets/"+ps.ID, nil)
	getReq.AddCookie(session)
	h.ServeHTTP(getRec, getReq)
	if getRec.Code != http.StatusOK {
		t.Fatalf("get code=%d body=%s", getRec.Code, getRec.Body.String())
	}
	var got map[string]any
	if err := json.Unmarshal(getRec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got["name"] != "Counted" {
		t.Fatalf("name=%v", got["name"])
	}
	if got["memberCount"] != float64(1) {
		t.Fatalf("memberCount=%v want 1", got["memberCount"])
	}

	listRec := httptest.NewRecorder()
	listReq := httptest.NewRequest(http.MethodGet, "/api/settings/permission-sets", nil)
	listReq.AddCookie(session)
	h.ServeHTTP(listRec, listReq)
	if listRec.Code != http.StatusOK {
		t.Fatalf("list code=%d", listRec.Code)
	}
	var list []map[string]any
	if err := json.Unmarshal(listRec.Body.Bytes(), &list); err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 || list[0]["memberCount"] != float64(1) {
		t.Fatalf("list=%v", list)
	}
}

func TestCreatePermissionSetNameTooLong(t *testing.T) {
	t.Parallel()
	h := newAuthHandler(t)
	session := login(t, h, "owner", "secret")
	name := strings.Repeat("a", 81)
	body := bytes.NewBufferString(`{"name":"` + name + `","grants":{"pods":["view"]}}`)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/settings/permission-sets", body)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("code=%d body=%s", rec.Code, rec.Body.String())
	}
}

func TestMeReturnsMemberGrants(t *testing.T) {
	t.Parallel()
	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps-me", map[string][]string{"pods": {"view", "logs"}})
	createK8sMember(t, st, "member", "pass", "ps-me", []string{"dev"})
	h := newHandlerWithStore(t, st)
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("code=%d body=%s", rec.Code, rec.Body.String())
	}
	var resp map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	grants, ok := resp["grants"].(map[string]any)
	if !ok {
		t.Fatalf("grants missing: %v", resp)
	}
	pods, ok := grants["pods"].([]any)
	if !ok || len(pods) != 2 {
		t.Fatalf("pods grants=%v", grants["pods"])
	}
}

func TestMeOwnerOmitsGrants(t *testing.T) {
	t.Parallel()
	h := newAuthHandler(t)
	session := login(t, h, "owner", "secret")
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("code=%d", rec.Code)
	}
	var resp map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if _, ok := resp["grants"]; ok {
		t.Fatalf("owner should omit grants: %v", resp["grants"])
	}
}
