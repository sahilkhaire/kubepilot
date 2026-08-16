package httpapi_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"

	"github.com/sahilkhaire/kubepilot/internal/httpapi"
	"github.com/sahilkhaire/kubepilot/internal/kube"
	"github.com/sahilkhaire/kubepilot/internal/password"
	"github.com/sahilkhaire/kubepilot/internal/rbac"
	"github.com/sahilkhaire/kubepilot/internal/store"
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
		CreatedAt:          now,
		UpdatedAt:          now,
	}); err != nil {
		t.Fatal(err)
	}
	applyMemberNamespacesToSet(t, st, permissionSetID, namespaces)
}

func applyMemberNamespacesToSet(t *testing.T, st store.Store, permissionSetID string, namespaces []string) {
	t.Helper()
	ps, err := st.PermissionSet(context.Background(), permissionSetID)
	if err != nil {
		t.Fatal(err)
	}
	if ps == nil {
		t.Fatalf("permission set %s not found", permissionSetID)
	}
	star := false
	for _, ns := range namespaces {
		if ns == "*" {
			star = true
			break
		}
	}
	if star {
		ps.NamespaceScope = rbac.NamespaceScopeAll
		ps.Namespaces = nil
		ps.NamespaceRegex = nil
	} else {
		ps.NamespaceScope = rbac.NamespaceScopeSelected
		ps.Namespaces = append([]string(nil), namespaces...)
		ps.NamespaceRegex = nil
	}
	if err := st.UpdatePermissionSet(context.Background(), *ps); err != nil {
		t.Fatal(err)
	}
}

func createPermissionSetWithGrants(t *testing.T, st store.Store, id string, grants map[string][]string) {
	t.Helper()
	now := time.Now().UTC()
	if err := st.CreatePermissionSet(context.Background(), store.PermissionSet{
		ID:          id,
		Name:        "Viewer",
		Description: "test",
		Grants:      grants,
		CreatedAt:   now,
		UpdatedAt:   now,
	}); err != nil {
		t.Fatal(err)
	}
}

func seedWorkloadFakeClient() *kube.Client {
	podDev := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{Name: "pod-dev", Namespace: "dev"},
	}
	podProd := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{Name: "pod-prod", Namespace: "prod"},
	}
	nsDev := &corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "dev"}}
	nsProd := &corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "prod"}}
	return kube.ForTest(fake.NewSimpleClientset(podDev, podProd, nsDev, nsProd))
}

func seedWorkloadFakeClientWithInstallNS() *kube.Client {
	podDev := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{Name: "pod-dev", Namespace: "dev"},
	}
	podProd := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{Name: "pod-prod", Namespace: "prod"},
	}
	podInstall := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{Name: "pod-install", Namespace: testInstallNS},
	}
	nsDev := &corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "dev"}}
	nsProd := &corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "prod"}}
	nsInstall := &corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: testInstallNS}}
	return kube.ForTest(fake.NewSimpleClientset(podDev, podProd, podInstall, nsDev, nsProd, nsInstall))
}

func TestListPodsAuthz(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	createPermissionSet(t, st, "ps1")
	createK8sMember(t, st, "member", "pass", "ps1", []string{"dev"})
	h := newK8sHandler(t, st, seedWorkloadFakeClient())
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
			name:       "allowed list",
			path:       "/api/k8s/namespaces/dev/pods",
			session:    session,
			wantStatus: http.StatusOK,
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

			if tc.wantStatus == http.StatusOK {
				var pods []map[string]any
				if err := json.Unmarshal(rec.Body.Bytes(), &pods); err != nil {
					t.Fatalf("decode: %v body=%s", err, rec.Body.String())
				}
				if tc.wantEmpty && len(pods) != 0 {
					t.Fatalf("pods=%v want empty array", pods)
				}
				if !tc.wantEmpty && tc.path == "/api/k8s/namespaces/dev/pods" && len(pods) != 1 {
					t.Fatalf("pods=%v want one pod in dev", pods)
				}
			}
		})
	}
}

func TestListPodsAllNamespaces(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	createPermissionSet(t, st, "ps1")
	createK8sMember(t, st, "member", "pass", "ps1", []string{"dev"})
	h := newK8sHandler(t, st, seedWorkloadFakeClient())
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/k8s/namespaces/_all/pods", nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("code=%d body=%s want %d", rec.Code, rec.Body.String(), http.StatusOK)
	}

	var pods []map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &pods); err != nil {
		t.Fatalf("decode: %v body=%s", err, rec.Body.String())
	}
	if len(pods) != 1 {
		t.Fatalf("pods=%v want one pod in visible namespace", pods)
	}
}

func TestListPodsAllNamespacesHidesInstallNS(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	createPermissionSet(t, st, "ps1")
	createK8sMember(t, st, "member", "pass", "ps1", []string{"*"})
	h := newK8sHandler(t, st, seedWorkloadFakeClientWithInstallNS())
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/k8s/namespaces/_all/pods", nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("code=%d body=%s want %d", rec.Code, rec.Body.String(), http.StatusOK)
	}

	var pods []map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &pods); err != nil {
		t.Fatalf("decode: %v body=%s", err, rec.Body.String())
	}
	if len(pods) != 2 {
		t.Fatalf("pods=%d want 2 (dev+prod, excluding install NS)", len(pods))
	}
	for _, pod := range pods {
		meta, _ := pod["metadata"].(map[string]any)
		ns, _ := meta["namespace"].(string)
		if ns == testInstallNS {
			t.Fatalf("member must not see install namespace pods: %v", pods)
		}
	}
}

func TestGetPodAuthz(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	createPermissionSet(t, st, "ps1")
	createK8sMember(t, st, "member", "pass", "ps1", []string{"dev"})
	h := newK8sHandler(t, st, seedWorkloadFakeClient())
	session := login(t, h, "member", "pass")

	tests := []struct {
		name       string
		path       string
		wantStatus int
	}{
		{name: "denied prod", path: "/api/k8s/namespaces/prod/pods/pod-prod", wantStatus: http.StatusForbidden},
		{name: "get dev", path: "/api/k8s/namespaces/dev/pods/pod-dev", wantStatus: http.StatusOK},
		{name: "missing name", path: "/api/k8s/namespaces/dev/pods/missing", wantStatus: http.StatusNotFound},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodGet, tc.path, nil)
			req.AddCookie(session)
			h.ServeHTTP(rec, req)
			if rec.Code != tc.wantStatus {
				t.Fatalf("code=%d body=%s want %d", rec.Code, rec.Body.String(), tc.wantStatus)
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

func TestWorkloadsOverviewOmitsDeniedModules(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"workloads.overview": {"view"}, "pods": {"view"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"dev"})
	h := newK8sHandler(t, st, seedWorkloadFakeClient())
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/k8s/workloads/overview?namespace=dev", nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("code=%d body=%s", rec.Code, rec.Body.String())
	}

	var counts map[string]int
	if err := json.Unmarshal(rec.Body.Bytes(), &counts); err != nil {
		t.Fatal(err)
	}
	if counts["pods"] != 1 {
		t.Fatalf("pods=%d want 1", counts["pods"])
	}
	if _, ok := counts["deployments"]; ok {
		t.Fatalf("deployments should be omitted: %v", counts)
	}
}

func TestWorkloadsOverviewAllNamespaces(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"workloads.overview": {"view"}, "pods": {"view"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"*"})
	h := newK8sHandler(t, st, seedWorkloadFakeClientWithInstallNS())
	session := login(t, h, "member", "pass")

	tests := []struct {
		name string
		path string
	}{
		{name: "missing namespace", path: "/api/k8s/workloads/overview"},
		{name: "blank namespace", path: "/api/k8s/workloads/overview?namespace="},
		{name: "all sentinel", path: "/api/k8s/workloads/overview?namespace=_all"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodGet, tc.path, nil)
			req.AddCookie(session)
			h.ServeHTTP(rec, req)
			if rec.Code != http.StatusOK {
				t.Fatalf("code=%d body=%s want %d", rec.Code, rec.Body.String(), http.StatusOK)
			}
			var counts map[string]int
			if err := json.Unmarshal(rec.Body.Bytes(), &counts); err != nil {
				t.Fatal(err)
			}
			if counts["pods"] != 2 {
				t.Fatalf("pods=%d want 2 (dev+prod, excluding install NS)", counts["pods"])
			}
			if _, ok := counts["deployments"]; ok {
				t.Fatalf("deployments should be omitted: %v", counts)
			}
		})
	}
}

func TestWorkloadsOverviewAllNamespacesRequiresGrant(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"pods": {"view"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"*"})
	h := newK8sHandler(t, st, seedWorkloadFakeClientWithInstallNS())
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/k8s/workloads/overview", nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("code=%d body=%s want %d", rec.Code, rec.Body.String(), http.StatusForbidden)
	}
}

func TestOwnerCanSeeInstallNSOverview(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	h := newK8sHandler(t, st, seedWorkloadFakeClientWithInstallNS())
	session := login(t, h, "owner", "secret")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/k8s/workloads/overview?namespace="+testInstallNS, nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("code=%d body=%s want %d", rec.Code, rec.Body.String(), http.StatusOK)
	}

	var counts map[string]int
	if err := json.Unmarshal(rec.Body.Bytes(), &counts); err != nil {
		t.Fatal(err)
	}
	if counts["pods"] != 1 {
		t.Fatalf("pods=%d want 1 in install NS", counts["pods"])
	}
}

func TestWorkloadsOverviewUnauthenticatedMissingNamespace(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	h := newK8sHandler(t, st, seedWorkloadFakeClientWithInstallNS())

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/k8s/workloads/overview", nil)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("code=%d want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestMemberStarCannotSeeInstallNS(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"cluster.overview": {"view"}, "workloads.overview": {"view"}, "pods": {"view"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"*"})
	h := newK8sHandler(t, st, seedWorkloadFakeClientWithInstallNS())
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/k8s/workloads/overview?namespace="+testInstallNS, nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("workloads overview code=%d want %d", rec.Code, http.StatusForbidden)
	}

	rec = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodGet, "/api/k8s/cluster/overview", nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("cluster overview code=%d body=%s", rec.Code, rec.Body.String())
	}

	var counts map[string]int
	if err := json.Unmarshal(rec.Body.Bytes(), &counts); err != nil {
		t.Fatal(err)
	}
	if counts["pods"] != 2 {
		t.Fatalf("pods=%d want 2 (dev+prod, excluding install NS)", counts["pods"])
	}
}

func TestWorkloadsOverviewDeniedNamespace(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	createPermissionSet(t, st, "ps1")
	createK8sMember(t, st, "member", "pass", "ps1", []string{"dev"})
	h := newK8sHandler(t, st, seedWorkloadFakeClient())
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/k8s/workloads/overview?namespace=prod", nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("code=%d want %d", rec.Code, http.StatusForbidden)
	}
}

func TestOverviewRequiresModule(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"pods": {"view"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"dev"})
	h := newK8sHandler(t, st, seedWorkloadFakeClient())
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/k8s/workloads/overview?namespace=dev", nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("workloads overview code=%d want %d", rec.Code, http.StatusForbidden)
	}

	rec = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodGet, "/api/k8s/cluster/overview", nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("cluster overview code=%d want %d", rec.Code, http.StatusForbidden)
	}
}

func TestListNamespacesAuthz(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"pods": {"view"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"*"})
	h := newK8sHandler(t, st, seedWorkloadFakeClientWithInstallNS())
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/k8s/namespaces", nil)
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("unauth code=%d want %d", rec.Code, http.StatusUnauthorized)
	}

	rec = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodGet, "/api/k8s/namespaces", nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("member code=%d body=%s", rec.Code, rec.Body.String())
	}

	var memberNS []string
	if err := json.Unmarshal(rec.Body.Bytes(), &memberNS); err != nil {
		t.Fatal(err)
	}
	for _, ns := range memberNS {
		if ns == testInstallNS {
			t.Fatalf("member namespaces include install NS: %v", memberNS)
		}
	}
	if len(memberNS) != 2 {
		t.Fatalf("member namespaces=%v want dev+prod", memberNS)
	}

	ownerSession := login(t, h, "owner", "secret")
	rec = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodGet, "/api/k8s/namespaces", nil)
	req.AddCookie(ownerSession)
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("owner code=%d body=%s", rec.Code, rec.Body.String())
	}

	var ownerNS []string
	if err := json.Unmarshal(rec.Body.Bytes(), &ownerNS); err != nil {
		t.Fatal(err)
	}
	foundInstall := false
	for _, ns := range ownerNS {
		if ns == testInstallNS {
			foundInstall = true
			break
		}
	}
	if !foundInstall {
		t.Fatalf("owner namespaces=%v want install NS included", ownerNS)
	}
}

func TestListNamespacesKubeNil(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	createPermissionSet(t, st, "ps1")
	createK8sMember(t, st, "member", "pass", "ps1", []string{"dev"})
	h := newK8sHandler(t, st, nil)
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/k8s/namespaces", nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("code=%d want %d", rec.Code, http.StatusServiceUnavailable)
	}
}

func TestSearchAuthz(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"pods": {"view"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"dev"})
	h := newK8sHandler(t, st, seedWorkloadFakeClient())
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/k8s/search", nil)
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("unauth code=%d want %d", rec.Code, http.StatusUnauthorized)
	}

	rec = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodGet, "/api/k8s/search?q=", nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("blank q code=%d want %d", rec.Code, http.StatusBadRequest)
	}

	rec = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodGet, "/api/k8s/search?q=pod&namespace=prod", nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("prod search code=%d want %d", rec.Code, http.StatusForbidden)
	}

	rec = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodGet, "/api/k8s/search?q=pod-dev", nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("dev search code=%d body=%s", rec.Code, rec.Body.String())
	}

	var hits []map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &hits); err != nil {
		t.Fatal(err)
	}
	if len(hits) != 1 {
		t.Fatalf("hits=%v want one match", hits)
	}
	if hits[0]["kind"] != "Pod" || hits[0]["namespace"] != "dev" || hits[0]["name"] != "pod-dev" {
		t.Fatalf("hit=%v want Pod/dev/pod-dev", hits[0])
	}
}

func TestSearchWildcardMemberExcludesInstallNS(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"pods": {"view"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"*"})
	h := newK8sHandler(t, st, seedWorkloadFakeClientWithInstallNS())
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/k8s/search?q=pod", nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("code=%d body=%s", rec.Code, rec.Body.String())
	}

	var hits []map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &hits); err != nil {
		t.Fatal(err)
	}
	if len(hits) != 2 {
		t.Fatalf("hits=%v want dev+prod pods only", hits)
	}
	for _, hit := range hits {
		if hit["namespace"] == testInstallNS {
			t.Fatalf("hit from install NS: %v", hit)
		}
	}
}

func TestUnknownResource404(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	createPermissionSet(t, st, "ps1")
	createK8sMember(t, st, "member", "pass", "ps1", []string{"dev"})
	h := newK8sHandler(t, st, seedWorkloadFakeClient())
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/k8s/namespaces/dev/unknownresource", nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("code=%d want %d", rec.Code, http.StatusNotFound)
	}
}
