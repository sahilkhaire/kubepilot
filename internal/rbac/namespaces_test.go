package rbac_test

import (
	"reflect"
	"testing"

	"github.com/zixflow/k8s/internal/rbac"
	"github.com/zixflow/k8s/internal/store"
)

func TestVisibleNamespaces(t *testing.T) {
	cluster := []string{"default", "dev", "prod", installNS, "staging"}

	tests := []struct {
		name              string
		user              store.User
		installNS         string
		clusterNamespaces []string
		want              []string
	}{
		{
			name:              "owner sees all cluster namespaces including install",
			user:              store.User{Role: store.RoleOwner},
			installNS:         installNS,
			clusterNamespaces: cluster,
			want:              []string{"default", "dev", "prod", installNS, "staging"},
		},
		{
			name:              "owner preserves cluster order when disabled",
			user:              store.User{Role: store.RoleOwner, Enabled: false},
			installNS:         installNS,
			clusterNamespaces: cluster,
			want:              []string{"default", "dev", "prod", installNS, "staging"},
		},
		{
			name:              "member star excludes install namespace",
			user:              store.User{Role: store.RoleMember, Namespaces: []string{"*"}},
			installNS:         installNS,
			clusterNamespaces: cluster,
			want:              []string{"default", "dev", "prod", "staging"},
		},
		{
			name:              "member star with empty install namespace excludes only empty name",
			user:              store.User{Role: store.RoleMember, Namespaces: []string{"*"}},
			installNS:         "",
			clusterNamespaces: []string{"default", "", "dev"},
			want:              []string{"default", "dev"},
		},
		{
			name:              "member explicit list intersects cluster namespaces",
			user:              store.User{Role: store.RoleMember, Namespaces: []string{"dev", "prod", "missing"}},
			installNS:         installNS,
			clusterNamespaces: cluster,
			want:              []string{"dev", "prod"},
		},
		{
			name:              "member explicit list excludes install namespace",
			user:              store.User{Role: store.RoleMember, Namespaces: []string{"dev", installNS}},
			installNS:         installNS,
			clusterNamespaces: cluster,
			want:              []string{"dev"},
		},
		{
			name:              "member empty grant list returns none",
			user:              store.User{Role: store.RoleMember, Namespaces: []string{}},
			installNS:         installNS,
			clusterNamespaces: cluster,
			want:              nil,
		},
		{
			name:              "deduplicates by first cluster occurrence",
			user:              store.User{Role: store.RoleOwner},
			installNS:         installNS,
			clusterNamespaces: []string{"dev", "prod", "dev", "staging", "prod"},
			want:              []string{"dev", "prod", "staging"},
		},
		{
			name:              "member star deduplicates by first cluster occurrence",
			user:              store.User{Role: store.RoleMember, Namespaces: []string{"*"}},
			installNS:         installNS,
			clusterNamespaces: []string{"dev", installNS, "dev", "prod"},
			want:              []string{"dev", "prod"},
		},
		{
			name:              "empty cluster namespaces returns empty",
			user:              store.User{Role: store.RoleMember, Namespaces: []string{"*"}},
			installNS:         installNS,
			clusterNamespaces: nil,
			want:              nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := rbac.VisibleNamespaces(tt.user, tt.installNS, tt.clusterNamespaces)
			if !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("VisibleNamespaces() = %#v, want %#v", got, tt.want)
			}
		})
	}
}
