package httpapi_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/zixflow/k8s/internal/auth"
	"github.com/zixflow/k8s/internal/httpapi"
	"github.com/zixflow/k8s/internal/store"
)

const testInstallNS = "cluster-console"

func newMembersHandler(t *testing.T, st store.Store) http.Handler {
	t.Helper()
	return newAuthHandlerWithOptions(t, st, httpapi.Deps{InstallNS: testInstallNS})
}

func createPermissionSet(t *testing.T, st store.Store, id string) {
	t.Helper()
	now := time.Now().UTC()
	if err := st.CreatePermissionSet(context.Background(), store.PermissionSet{
		ID:          id,
		Name:        "Viewer",
		Description: "test",
		Grants:      map[string][]string{"pods": {"view"}},
		CreatedAt:   now,
		UpdatedAt:   now,
	}); err != nil {
		t.Fatal(err)
	}
}

func TestCreateMember(t *testing.T) {
	t.Parallel()
	st := store.NewMemory()
	createPermissionSet(t, st, "ps1")
	h := newMembersHandler(t, st)
	session := login(t, h, "owner", "secret")

	body := bytes.NewBufferString(`{"username":"alice","displayName":"Alice","permissionSetId":"ps1","namespaces":["dev"]}`)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/settings/members", body)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("code=%d body=%s", rec.Code, rec.Body.String())
	}

	var resp map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	pw, ok := resp["password"].(string)
	if !ok || len(pw) != 24 {
		t.Fatalf("password=%v want 24-char string", resp["password"])
	}
	user, ok := resp["user"].(map[string]any)
	if !ok {
		t.Fatal("user missing")
	}
	if user["username"] != "alice" || user["displayName"] != "Alice" {
		t.Fatalf("user=%v", user)
	}
	if user["mustChangePassword"] != true {
		t.Fatalf("mustChangePassword=%v want true", user["mustChangePassword"])
	}
}

func TestCreateMemberPasswordNotInGET(t *testing.T) {
	t.Parallel()
	st := store.NewMemory()
	createPermissionSet(t, st, "ps1")
	h := newMembersHandler(t, st)
	session := login(t, h, "owner", "secret")

	createBody := bytes.NewBufferString(`{"username":"bob","displayName":"Bob","permissionSetId":"ps1","namespaces":["dev"]}`)
	createRec := httptest.NewRecorder()
	createReq := httptest.NewRequest(http.MethodPost, "/api/settings/members", createBody)
	createReq.AddCookie(session)
	h.ServeHTTP(createRec, createReq)
	if createRec.Code != http.StatusCreated {
		t.Fatalf("create code=%d body=%s", createRec.Code, createRec.Body.String())
	}

	listRec := httptest.NewRecorder()
	listReq := httptest.NewRequest(http.MethodGet, "/api/settings/members", nil)
	listReq.AddCookie(session)
	h.ServeHTTP(listRec, listReq)
	if listRec.Code != http.StatusOK {
		t.Fatalf("list code=%d body=%s", listRec.Code, listRec.Body.String())
	}
	raw, _ := io.ReadAll(listRec.Body)
	s := string(raw)
	if strings.Contains(s, "passwordHash") || strings.Contains(s, `"password"`) {
		t.Fatalf("password leaked in list: %s", s)
	}
}

func TestResetPasswordDeletesSessions(t *testing.T) {
	t.Parallel()
	st := store.NewMemory()
	createPermissionSet(t, st, "ps1")
	h := newMembersHandler(t, st)
	ownerSession := login(t, h, "owner", "secret")

	createBody := bytes.NewBufferString(`{"username":"carol","displayName":"Carol","permissionSetId":"ps1","namespaces":["dev"]}`)
	createRec := httptest.NewRecorder()
	createReq := httptest.NewRequest(http.MethodPost, "/api/settings/members", createBody)
	createReq.AddCookie(ownerSession)
	h.ServeHTTP(createRec, createReq)
	if createRec.Code != http.StatusCreated {
		t.Fatalf("create code=%d body=%s", createRec.Code, createRec.Body.String())
	}
	var createResp map[string]any
	if err := json.Unmarshal(createRec.Body.Bytes(), &createResp); err != nil {
		t.Fatal(err)
	}
	user := createResp["user"].(map[string]any)
	memberID := user["id"].(string)
	plainPassword := createResp["password"].(string)

	memberSession := login(t, h, "carol", plainPassword)

	resetRec := httptest.NewRecorder()
	resetReq := httptest.NewRequest(http.MethodPost, "/api/settings/members/"+memberID+"/reset-password", nil)
	resetReq.AddCookie(ownerSession)
	h.ServeHTTP(resetRec, resetReq)
	if resetRec.Code != http.StatusOK {
		t.Fatalf("reset code=%d body=%s", resetRec.Code, resetRec.Body.String())
	}
	var resetResp map[string]any
	if err := json.Unmarshal(resetRec.Body.Bytes(), &resetResp); err != nil {
		t.Fatal(err)
	}
	newPassword, ok := resetResp["password"].(string)
	if !ok || len(newPassword) != 24 || newPassword == plainPassword {
		t.Fatalf("new password=%v", resetResp["password"])
	}

	meRec := httptest.NewRecorder()
	meReq := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	meReq.AddCookie(memberSession)
	h.ServeHTTP(meRec, meReq)
	if meRec.Code != http.StatusUnauthorized {
		t.Fatalf("me after reset code=%d want 401", meRec.Code)
	}

	loginRec := httptest.NewRecorder()
	loginBody := strings.NewReader(`{"username":"carol","password":"` + plainPassword + `"}`)
	h.ServeHTTP(loginRec, httptest.NewRequest(http.MethodPost, "/api/auth/login", loginBody))
	if loginRec.Code != http.StatusUnauthorized {
		t.Fatalf("old password login code=%d want 401", loginRec.Code)
	}

	newLoginRec := httptest.NewRecorder()
	newLoginBody := strings.NewReader(`{"username":"carol","password":"` + newPassword + `"}`)
	h.ServeHTTP(newLoginRec, httptest.NewRequest(http.MethodPost, "/api/auth/login", newLoginBody))
	if newLoginRec.Code != http.StatusOK {
		t.Fatalf("new password login code=%d body=%s", newLoginRec.Code, newLoginRec.Body.String())
	}
}

func TestCannotGrantInstallNS(t *testing.T) {
	t.Parallel()
	st := store.NewMemory()
	createPermissionSet(t, st, "ps1")
	h := newMembersHandler(t, st)
	session := login(t, h, "owner", "secret")

	body := bytes.NewBufferString(`{"username":"dave","displayName":"Dave","permissionSetId":"ps1","namespaces":["` + testInstallNS + `"]}`)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/settings/members", body)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("code=%d body=%s", rec.Code, rec.Body.String())
	}
}

func TestMembersForbiddenForMember(t *testing.T) {
	t.Parallel()
	st := store.NewMemory()
	createPermissionSet(t, st, "ps1")
	createMember(t, st, "member", "pass")
	h := newMembersHandler(t, st)
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/settings/members", nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("code=%d want 403", rec.Code)
	}
}

func TestCannotDeleteOwner(t *testing.T) {
	t.Parallel()
	st := store.NewMemory()
	h := newMembersHandler(t, st)
	session := login(t, h, "owner", "secret")

	owner, err := st.Owner(context.Background())
	if err != nil {
		t.Fatal(err)
	}

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodDelete, "/api/settings/members/"+owner.ID, nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("code=%d want 403", rec.Code)
	}
}

func TestDisableMemberDeletesSessions(t *testing.T) {
	t.Parallel()
	st := store.NewMemory()
	createPermissionSet(t, st, "ps1")
	h := newMembersHandler(t, st)
	ownerSession := login(t, h, "owner", "secret")

	createBody := bytes.NewBufferString(`{"username":"eve","displayName":"Eve","permissionSetId":"ps1","namespaces":["dev"]}`)
	createRec := httptest.NewRecorder()
	createReq := httptest.NewRequest(http.MethodPost, "/api/settings/members", createBody)
	createReq.AddCookie(ownerSession)
	h.ServeHTTP(createRec, createReq)
	if createRec.Code != http.StatusCreated {
		t.Fatalf("create code=%d body=%s", createRec.Code, createRec.Body.String())
	}
	var createResp map[string]any
	if err := json.Unmarshal(createRec.Body.Bytes(), &createResp); err != nil {
		t.Fatal(err)
	}
	user := createResp["user"].(map[string]any)
	memberID := user["id"].(string)
	plainPassword := createResp["password"].(string)

	memberSession := login(t, h, "eve", plainPassword)

	patchBody := bytes.NewBufferString(`{"enabled":false}`)
	patchRec := httptest.NewRecorder()
	patchReq := httptest.NewRequest(http.MethodPatch, "/api/settings/members/"+memberID, patchBody)
	patchReq.AddCookie(ownerSession)
	h.ServeHTTP(patchRec, patchReq)
	if patchRec.Code != http.StatusOK {
		t.Fatalf("patch code=%d body=%s", patchRec.Code, patchRec.Body.String())
	}

	meRec := httptest.NewRecorder()
	meReq := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	meReq.AddCookie(memberSession)
	h.ServeHTTP(meRec, meReq)
	if meRec.Code != http.StatusUnauthorized {
		t.Fatalf("me after disable code=%d want 401", meRec.Code)
	}
}

func TestCreateMemberEmptyNamespaces(t *testing.T) {
	t.Parallel()
	st := store.NewMemory()
	createPermissionSet(t, st, "ps1")
	h := newMembersHandler(t, st)
	session := login(t, h, "owner", "secret")

	body := bytes.NewBufferString(`{"username":"frank","displayName":"Frank","permissionSetId":"ps1","namespaces":[]}`)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/settings/members", body)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("code=%d body=%s", rec.Code, rec.Body.String())
	}
}

func TestCreateMemberBlankNamespaces(t *testing.T) {
	t.Parallel()
	st := store.NewMemory()
	createPermissionSet(t, st, "ps1")
	h := newMembersHandler(t, st)
	session := login(t, h, "owner", "secret")

	for _, namespaces := range []string{`[""]`, `["  "]`} {
		t.Run(namespaces, func(t *testing.T) {
			body := bytes.NewBufferString(`{"username":"blank","displayName":"Blank","permissionSetId":"ps1","namespaces":` + namespaces + `}`)
			rec := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodPost, "/api/settings/members", body)
			req.AddCookie(session)
			h.ServeHTTP(rec, req)

			if rec.Code != http.StatusBadRequest {
				t.Fatalf("code=%d body=%s", rec.Code, rec.Body.String())
			}
		})
	}
}

func TestCreateMemberInvalidUsername(t *testing.T) {
	t.Parallel()
	st := store.NewMemory()
	createPermissionSet(t, st, "ps1")
	h := newMembersHandler(t, st)
	session := login(t, h, "owner", "secret")

	body := bytes.NewBufferString(`{"username":"A","displayName":"Bad","permissionSetId":"ps1","namespaces":["dev"]}`)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/settings/members", body)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("code=%d body=%s", rec.Code, rec.Body.String())
	}
}

func TestDeleteMember(t *testing.T) {
	t.Parallel()
	st := store.NewMemory()
	createPermissionSet(t, st, "ps1")
	h := newMembersHandler(t, st)
	session := login(t, h, "owner", "secret")

	createBody := bytes.NewBufferString(`{"username":"grace","displayName":"Grace","permissionSetId":"ps1","namespaces":["dev"]}`)
	createRec := httptest.NewRecorder()
	createReq := httptest.NewRequest(http.MethodPost, "/api/settings/members", createBody)
	createReq.AddCookie(session)
	h.ServeHTTP(createRec, createReq)
	if createRec.Code != http.StatusCreated {
		t.Fatalf("create code=%d body=%s", createRec.Code, createRec.Body.String())
	}
	var createResp map[string]any
	if err := json.Unmarshal(createRec.Body.Bytes(), &createResp); err != nil {
		t.Fatal(err)
	}
	memberID := createResp["user"].(map[string]any)["id"].(string)

	delRec := httptest.NewRecorder()
	delReq := httptest.NewRequest(http.MethodDelete, "/api/settings/members/"+memberID, nil)
	delReq.AddCookie(session)
	h.ServeHTTP(delRec, delReq)
	if delRec.Code != http.StatusNoContent {
		t.Fatalf("delete code=%d body=%s", delRec.Code, delRec.Body.String())
	}

	listRec := httptest.NewRecorder()
	listReq := httptest.NewRequest(http.MethodGet, "/api/settings/members", nil)
	listReq.AddCookie(session)
	h.ServeHTTP(listRec, listReq)
	var members []map[string]any
	if err := json.Unmarshal(listRec.Body.Bytes(), &members); err != nil {
		t.Fatal(err)
	}
	for _, m := range members {
		if m["username"] == "grace" {
			t.Fatal("deleted member still in list")
		}
	}
}

func TestResetPasswordSetsMustChangePassword(t *testing.T) {
	t.Parallel()
	st := store.NewMemory()
	createPermissionSet(t, st, "ps1")
	h := newMembersHandler(t, st)
	ownerSession := login(t, h, "owner", "secret")

	createBody := bytes.NewBufferString(`{"username":"henry","displayName":"Henry","permissionSetId":"ps1","namespaces":["dev"]}`)
	createRec := httptest.NewRecorder()
	createReq := httptest.NewRequest(http.MethodPost, "/api/settings/members", createBody)
	createReq.AddCookie(ownerSession)
	h.ServeHTTP(createRec, createReq)
	var createResp map[string]any
	if err := json.Unmarshal(createRec.Body.Bytes(), &createResp); err != nil {
		t.Fatal(err)
	}
	memberID := createResp["user"].(map[string]any)["id"].(string)
	plainPassword := createResp["password"].(string)

	// Change password to clear mustChangePassword
	memberSession := login(t, h, "henry", plainPassword)
	pwBody := strings.NewReader(`{"currentPassword":"` + plainPassword + `","newPassword":"changedpass1"}`)
	pwRec := httptest.NewRecorder()
	pwReq := httptest.NewRequest(http.MethodPost, "/api/auth/password", pwBody)
	pwReq.AddCookie(memberSession)
	h.ServeHTTP(pwRec, pwReq)
	if pwRec.Code != http.StatusOK {
		t.Fatalf("password change code=%d body=%s", pwRec.Code, pwRec.Body.String())
	}

	resetRec := httptest.NewRecorder()
	resetReq := httptest.NewRequest(http.MethodPost, "/api/settings/members/"+memberID+"/reset-password", nil)
	resetReq.AddCookie(ownerSession)
	h.ServeHTTP(resetRec, resetReq)
	if resetRec.Code != http.StatusOK {
		t.Fatalf("reset code=%d body=%s", resetRec.Code, resetRec.Body.String())
	}

	u, err := st.UserByID(context.Background(), memberID)
	if err != nil {
		t.Fatal(err)
	}
	if !u.MustChangePassword {
		t.Fatal("mustChangePassword should be true after reset")
	}
}

// Ensure auth cookie name is referenced for session tests.
var _ = auth.CookieName
