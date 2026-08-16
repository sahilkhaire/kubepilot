package rbac_test

import (
	"reflect"
	"strings"
	"testing"

	"github.com/sahilkhaire/kubepilot/internal/rbac"
	"github.com/sahilkhaire/kubepilot/internal/store"
)

func TestNamespaceAllowed(t *testing.T) {
	t.Parallel()

	all := &rbac.PermissionSet{NamespaceScope: rbac.NamespaceScopeAll}
	selected := &rbac.PermissionSet{
		NamespaceScope: rbac.NamespaceScopeSelected,
		Namespaces:     []string{"dev", "prod"},
		NamespaceRegex: []string{"team-.*", "tmp-[0-9]+"},
	}

	tests := []struct {
		name      string
		ps        *rbac.PermissionSet
		ns        string
		installNS string
		want      bool
	}{
		{name: "nil set denies", ps: nil, ns: "dev", installNS: installNS, want: false},
		{name: "all allows current namespace", ps: all, ns: "dev", installNS: installNS, want: true},
		{name: "all denies install namespace", ps: all, ns: installNS, installNS: installNS, want: false},
		{name: "all denies empty namespace", ps: all, ns: "", installNS: installNS, want: false},
		{name: "empty scope treated as all", ps: &rbac.PermissionSet{}, ns: "dev", installNS: installNS, want: true},
		{name: "selected exact name", ps: selected, ns: "dev", installNS: installNS, want: true},
		{name: "selected unknown name denied", ps: selected, ns: "staging", installNS: installNS, want: false},
		{name: "selected regex prefix", ps: selected, ns: "team-payments", installNS: installNS, want: true},
		{name: "selected regex does not substring-match", ps: selected, ns: "x-team-payments", installNS: installNS, want: false},
		{name: "selected regex digits", ps: selected, ns: "tmp-12", installNS: installNS, want: true},
		{name: "selected regex digits miss", ps: selected, ns: "tmp-ab", installNS: installNS, want: false},
		{name: "selected still denies install namespace", ps: selected, ns: installNS, installNS: installNS, want: false},
		{
			name: "regex that would match install namespace is still denied",
			ps: &rbac.PermissionSet{
				NamespaceScope: rbac.NamespaceScopeSelected,
				NamespaceRegex: []string{".*"},
			},
			ns:        installNS,
			installNS: installNS,
			want:      false,
		},
		{
			name: "invalid regex is not a match",
			ps: &rbac.PermissionSet{
				NamespaceScope: rbac.NamespaceScopeSelected,
				NamespaceRegex: []string{"("},
			},
			ns:        "dev",
			installNS: installNS,
			want:      false,
		},
		{
			name: "selected empty lists deny",
			ps: &rbac.PermissionSet{
				NamespaceScope: rbac.NamespaceScopeSelected,
			},
			ns:        "dev",
			installNS: installNS,
			want:      false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			if got := rbac.NamespaceAllowed(tt.ps, tt.ns, tt.installNS); got != tt.want {
				t.Fatalf("NamespaceAllowed() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestValidateNamespaceGrant(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name      string
		scope     string
		names     []string
		patterns  []string
		installNS string
		wantScope string
		wantNames []string
		wantPats  []string
		wantErr   string
	}{
		{
			name:      "all clears lists",
			scope:     rbac.NamespaceScopeAll,
			names:     []string{"dev"},
			patterns:  []string{"team-.*"},
			wantScope: rbac.NamespaceScopeAll,
			wantNames: []string{},
			wantPats:  []string{},
		},
		{
			name:      "empty scope defaults to all",
			scope:     "",
			wantScope: rbac.NamespaceScopeAll,
			wantNames: []string{},
			wantPats:  []string{},
		},
		{
			name:      "selected names and regex",
			scope:     rbac.NamespaceScopeSelected,
			names:     []string{" prod ", "dev", "dev"},
			patterns:  []string{" team-.* "},
			wantScope: rbac.NamespaceScopeSelected,
			wantNames: []string{"prod", "dev"},
			wantPats:  []string{"team-.*"},
		},
		{
			name:      "selected regex only",
			scope:     rbac.NamespaceScopeSelected,
			patterns:  []string{"tmp-.*"},
			wantScope: rbac.NamespaceScopeSelected,
			wantNames: []string{},
			wantPats:  []string{"tmp-.*"},
		},
		{
			name:    "selected requires at least one entry",
			scope:   rbac.NamespaceScopeSelected,
			wantErr: "namespaces required",
		},
		{
			name:    "star name rejected",
			scope:   rbac.NamespaceScopeSelected,
			names:   []string{"*"},
			wantErr: "use all namespaces",
		},
		{
			name:      "install namespace rejected",
			scope:     rbac.NamespaceScopeSelected,
			names:     []string{installNS},
			installNS: installNS,
			wantErr:   "install namespace not allowed",
		},
		{
			name:    "blank name rejected",
			scope:   rbac.NamespaceScopeSelected,
			names:   []string{"  "},
			wantErr: "namespace required",
		},
		{
			name:     "invalid regex rejected",
			scope:    rbac.NamespaceScopeSelected,
			patterns: []string{"("},
			wantErr:  "invalid namespace regex",
		},
		{
			name:    "unknown scope rejected",
			scope:   "maybe",
			wantErr: "unknown namespace scope",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			scope, names, pats, err := rbac.ValidateNamespaceGrant(tt.scope, tt.names, tt.patterns, tt.installNS)
			if tt.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
					t.Fatalf("err=%v want %q", err, tt.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected err=%v", err)
			}
			if scope != tt.wantScope {
				t.Fatalf("scope=%q want %q", scope, tt.wantScope)
			}
			if !reflect.DeepEqual(names, tt.wantNames) {
				t.Fatalf("names=%#v want %#v", names, tt.wantNames)
			}
			if !reflect.DeepEqual(pats, tt.wantPats) {
				t.Fatalf("patterns=%#v want %#v", pats, tt.wantPats)
			}
		})
	}
}

func TestVisibleNamespaces(t *testing.T) {
	t.Parallel()
	cluster := []string{"default", "dev", "prod", installNS, "staging", "team-a"}

	tests := []struct {
		name              string
		user              store.User
		ps                *rbac.PermissionSet
		installNS         string
		clusterNamespaces []string
		want              []string
	}{
		{
			name:              "owner sees all cluster namespaces including install",
			user:              store.User{Role: store.RoleOwner},
			installNS:         installNS,
			clusterNamespaces: cluster,
			want:              []string{"default", "dev", "prod", installNS, "staging", "team-a"},
		},
		{
			name:              "owner preserves cluster order when disabled",
			user:              store.User{Role: store.RoleOwner, Enabled: false},
			installNS:         installNS,
			clusterNamespaces: cluster,
			want:              []string{"default", "dev", "prod", installNS, "staging", "team-a"},
		},
		{
			name:              "member all excludes install namespace",
			user:              store.User{Role: store.RoleMember},
			ps:                &rbac.PermissionSet{NamespaceScope: rbac.NamespaceScopeAll},
			installNS:         installNS,
			clusterNamespaces: cluster,
			want:              []string{"default", "dev", "prod", "staging", "team-a"},
		},
		{
			name:              "member all with empty install namespace excludes only empty name",
			user:              store.User{Role: store.RoleMember},
			ps:                &rbac.PermissionSet{NamespaceScope: rbac.NamespaceScopeAll},
			installNS:         "",
			clusterNamespaces: []string{"default", "", "dev"},
			want:              []string{"default", "dev"},
		},
		{
			name: "member selected list intersects cluster namespaces",
			user: store.User{Role: store.RoleMember},
			ps: &rbac.PermissionSet{
				NamespaceScope: rbac.NamespaceScopeSelected,
				Namespaces:     []string{"dev", "prod", "missing"},
			},
			installNS:         installNS,
			clusterNamespaces: cluster,
			want:              []string{"dev", "prod"},
		},
		{
			name: "member selected list excludes install namespace",
			user: store.User{Role: store.RoleMember},
			ps: &rbac.PermissionSet{
				NamespaceScope: rbac.NamespaceScopeSelected,
				Namespaces:     []string{"dev", installNS},
			},
			installNS:         installNS,
			clusterNamespaces: cluster,
			want:              []string{"dev"},
		},
		{
			name: "member selected regex includes matching cluster namespaces",
			user: store.User{Role: store.RoleMember},
			ps: &rbac.PermissionSet{
				NamespaceScope: rbac.NamespaceScopeSelected,
				NamespaceRegex: []string{"team-.*"},
			},
			installNS:         installNS,
			clusterNamespaces: cluster,
			want:              []string{"team-a"},
		},
		{
			name: "member selected empty grant list returns none",
			user: store.User{Role: store.RoleMember},
			ps: &rbac.PermissionSet{
				NamespaceScope: rbac.NamespaceScopeSelected,
			},
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
			name:              "member all deduplicates by first cluster occurrence",
			user:              store.User{Role: store.RoleMember},
			ps:                &rbac.PermissionSet{NamespaceScope: rbac.NamespaceScopeAll},
			installNS:         installNS,
			clusterNamespaces: []string{"dev", installNS, "dev", "prod"},
			want:              []string{"dev", "prod"},
		},
		{
			name:              "empty cluster namespaces returns empty",
			user:              store.User{Role: store.RoleMember},
			ps:                &rbac.PermissionSet{NamespaceScope: rbac.NamespaceScopeAll},
			installNS:         installNS,
			clusterNamespaces: nil,
			want:              nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got := rbac.VisibleNamespaces(tt.user, tt.ps, tt.installNS, tt.clusterNamespaces)
			if !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("VisibleNamespaces() = %#v, want %#v", got, tt.want)
			}
		})
	}
}
