package rbac_test

import (
	"testing"

	"github.com/sahilkhaire/kubepilot/internal/rbac"
	"github.com/sahilkhaire/kubepilot/internal/store"
)

const installNS = "kubepilot"

func TestAllow(t *testing.T) {
	owner := store.User{Role: store.RoleOwner, Enabled: true}
	member := func(namespaces []string, grants map[string][]string) rbac.Request {
		return rbac.Request{
			User: store.User{
				Role:      store.RoleMember,
				Enabled:   true,
				Namespaces: namespaces,
			},
			InstallNS: installNS,
			PermissionSet: &rbac.PermissionSet{
				ID:     "ps1",
				Name:   "test",
				Grants: grants,
			},
		}
	}

	tests := []struct {
		name string
		req  rbac.Request
		want bool
	}{
		{
			name: "owner allow pods delete in install NS",
			req: rbac.Request{
				User:          owner,
				InstallNS:     installNS,
				PermissionSet: nil,
				Module:        "pods",
				Action:        "delete",
				Namespace:     installNS,
				ClusterScoped: false,
			},
			want: true,
		},
		{
			name: "member star deny install NS",
			req: func() rbac.Request {
				r := member([]string{"*"}, map[string][]string{"pods": {"view"}})
				r.Module = "pods"
				r.Action = "view"
				r.Namespace = installNS
				r.ClusterScoped = false
				return r
			}(),
			want: false,
		},
		{
			name: "member dev allow pods view dev",
			req: func() rbac.Request {
				r := member([]string{"dev"}, map[string][]string{"pods": {"view"}})
				r.Module = "pods"
				r.Action = "view"
				r.Namespace = "dev"
				r.ClusterScoped = false
				return r
			}(),
			want: true,
		},
		{
			name: "member dev deny pods view prod",
			req: func() rbac.Request {
				r := member([]string{"dev"}, map[string][]string{"pods": {"view"}})
				r.Module = "pods"
				r.Action = "view"
				r.Namespace = "prod"
				r.ClusterScoped = false
				return r
			}(),
			want: false,
		},
		{
			name: "member deny nodes without grant",
			req: func() rbac.Request {
				r := member([]string{"dev"}, map[string][]string{"pods": {"view"}})
				r.Module = "nodes"
				r.Action = "view"
				r.Namespace = ""
				r.ClusterScoped = true
				return r
			}(),
			want: false,
		},
		{
			name: "member deny scale without view",
			req: func() rbac.Request {
				r := member([]string{"dev"}, map[string][]string{"deployments": {"scale"}})
				r.Module = "deployments"
				r.Action = "scale"
				r.Namespace = "dev"
				r.ClusterScoped = false
				return r
			}(),
			want: false,
		},
		{
			name: "member deny settings members with grant",
			req: func() rbac.Request {
				r := member([]string{"*"}, map[string][]string{"settings.members": {"view"}})
				r.Module = "settings.members"
				r.Action = "view"
				r.Namespace = ""
				r.ClusterScoped = true
				return r
			}(),
			want: false,
		},
		{
			name: "member deny namespaces delete on install NS",
			req: func() rbac.Request {
				r := member([]string{"*"}, map[string][]string{"namespaces": {"view", "delete"}})
				r.Module = "namespaces"
				r.Action = "delete"
				r.Namespace = installNS
				r.ClusterScoped = true
				return r
			}(),
			want: false,
		},
		{
			name: "member deny pods view on install NS",
			req: func() rbac.Request {
				r := member([]string{"*"}, map[string][]string{"pods": {"view"}})
				r.Module = "pods"
				r.Action = "view"
				r.Namespace = installNS
				r.ClusterScoped = false
				return r
			}(),
			want: false,
		},
		{
			name: "member allow nodes view cluster scoped",
			req: func() rbac.Request {
				r := member([]string{"dev"}, map[string][]string{"nodes": {"view"}})
				r.Module = "nodes"
				r.Action = "view"
				r.Namespace = ""
				r.ClusterScoped = true
				return r
			}(),
			want: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := rbac.Allow(tt.req); got != tt.want {
				t.Fatalf("Allow() = %v, want %v", got, tt.want)
			}
		})
	}
}
