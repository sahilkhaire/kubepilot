package httpapi_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"k8s.io/client-go/kubernetes/fake"

	"github.com/zixflow/k8s/internal/httpapi"
	"github.com/zixflow/k8s/internal/kube"
	"github.com/zixflow/k8s/internal/password"
	"github.com/zixflow/k8s/internal/store"
)

func newK8sHandler(t *testing.T, st store.Store, kubeClient *kube.Client) http.Handler {
	t.Helper()
	return newAuthHandlerWithOptions(t, st, httpapi.Deps{
		InstallNS: testInstallNS,
		Kube:      kubeClient,
	})
}

func createK8sMember(t *testing.T, st store.Store, username, plainPassword, permissionSetID string, namespaces []string) {
	t.Helper()
	hash, err := password.Hash(plainPassword)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	if err := st.CreateMember(context.Background(), store.User{
		ID:                 "member-k8s",
		Username:           username,
		DisplayName:        "Member",
		Role:               store.RoleMember,
		PasswordHash:       hash,
		MustChangePassword: false,
		Enabled:            true,
		PermissionSetID:    permissionSetID,
		Namespaces:         namespaces,
		CreatedAt:          now,
		UpdatedAt:          now,
	}); err != nil {
		t.Fatal(err)
	}
}

func TestListPodsAuthz(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	createPermissionSet(t, st, "ps1")
	createK8sMember(t, st, "member", "pass", "ps1", []string{"dev"})
	h := newK8sHandler(t, st, kube.ForTest(fake.NewSimpleClientset()))
	session := login(t, h, "member", "pass")

	tests := []struct {
		name       string
		path       string
		session    *http.Cookie
		wantStatus int
		wantEmpty  bool
	}{
		{
			name:       "unauthenticated",
			path:       "/api/k8s/namespaces/dev/pods",
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "denied wrong namespace",
			path:       "/api/k8s/namespaces/prod/pods",
			session:    session,
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "allowed empty list",
			path:       "/api/k8s/namespaces/dev/pods",
			session:    session,
			wantStatus: http.StatusOK,
			wantEmpty:  true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodGet, tc.path, nil)
			if tc.session != nil {
				req.AddCookie(tc.session)
			}
			h.ServeHTTP(rec, req)

			if rec.Code != tc.wantStatus {
				t.Fatalf("code=%d body=%s want %d", rec.Code, rec.Body.String(), tc.wantStatus)
			}

			if tc.wantEmpty {
				var pods []any
				if err := json.Unmarshal(rec.Body.Bytes(), &pods); err != nil {
					t.Fatalf("decode: %v body=%s", err, rec.Body.String())
				}
				if len(pods) != 0 {
					t.Fatalf("pods=%v want empty array", pods)
				}
			}
		})
	}
}

func TestListPodsKubeNil(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	createPermissionSet(t, st, "ps1")
	createK8sMember(t, st, "member", "pass", "ps1", []string{"dev"})
	h := newK8sHandler(t, st, nil)
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/k8s/namespaces/dev/pods", nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("code=%d want %d", rec.Code, http.StatusServiceUnavailable)
	}
}
