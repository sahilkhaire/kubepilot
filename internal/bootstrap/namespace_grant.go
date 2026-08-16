package bootstrap

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/sahilkhaire/kubepilot/internal/rbac"
	"github.com/sahilkhaire/kubepilot/internal/store"
)

const permissionSetNameMax = 80

type namespaceMemberGroup struct {
	key     string
	label   string
	members []store.User
}

func MigrateNamespaceGrants(ctx context.Context, st store.Store, installNS string) error {
	sets, err := st.ListPermissionSets(ctx)
	if err != nil {
		return err
	}
	usedNames := make(map[string]struct{}, len(sets))
	for _, ps := range sets {
		usedNames[ps.Name] = struct{}{}
	}

	for _, ps := range sets {
		if ps.NamespaceScope != "" {
			continue
		}
		members, err := st.MembersByPermissionSetID(ctx, ps.ID)
		if err != nil {
			return err
		}
		groups := groupMembersByNamespaces(members, installNS)
		if len(groups) == 0 {
			if err := applyNamespaceGrant(ctx, st, ps, rbac.NamespaceScopeAll, nil); err != nil {
				return err
			}
			continue
		}
		first := groups[0]
		scope, names := grantFromKey(first.key)
		if err := applyNamespaceGrant(ctx, st, ps, scope, names); err != nil {
			return err
		}
		if err := clearMemberNamespaces(ctx, st, first.members); err != nil {
			return err
		}
		for _, group := range groups[1:] {
			clone := ps
			cloneID, err := newPermissionSetID()
			if err != nil {
				return err
			}
			clone.ID = cloneID
			clone.BuiltinTemplate = ""
			clone.Name = uniquePermissionSetName(ps.Name, group.label, usedNames)
			usedNames[clone.Name] = struct{}{}
			now := time.Now().UTC()
			clone.CreatedAt = now
			clone.UpdatedAt = now
			scope, names := grantFromKey(group.key)
			clone.NamespaceScope = scope
			clone.Namespaces = names
			clone.NamespaceRegex = []string{}
			if err := st.CreatePermissionSet(ctx, clone); err != nil {
				return err
			}
			for _, member := range group.members {
				member.PermissionSetID = clone.ID
				member.Namespaces = nil
				member.UpdatedAt = now
				if err := st.UpdateMember(ctx, member); err != nil {
					return err
				}
			}
		}
	}

	members, err := st.ListMembers(ctx)
	if err != nil {
		return err
	}
	return clearMemberNamespaces(ctx, st, members)
}

func applyNamespaceGrant(ctx context.Context, st store.Store, ps store.PermissionSet, scope string, names []string) error {
	ps.NamespaceScope = scope
	ps.Namespaces = names
	if ps.Namespaces == nil {
		ps.Namespaces = []string{}
	}
	ps.NamespaceRegex = []string{}
	ps.UpdatedAt = time.Now().UTC()
	return st.UpdatePermissionSet(ctx, ps)
}

func clearMemberNamespaces(ctx context.Context, st store.Store, members []store.User) error {
	now := time.Now().UTC()
	for _, member := range members {
		if len(member.Namespaces) == 0 {
			continue
		}
		member.Namespaces = nil
		member.UpdatedAt = now
		if err := st.UpdateMember(ctx, member); err != nil {
			return err
		}
	}
	return nil
}

func groupMembersByNamespaces(members []store.User, installNS string) []namespaceMemberGroup {
	index := make(map[string]int)
	var groups []namespaceMemberGroup
	for _, member := range members {
		key, label := namespaceGrantKey(member.Namespaces, installNS)
		if i, ok := index[key]; ok {
			groups[i].members = append(groups[i].members, member)
			continue
		}
		index[key] = len(groups)
		groups = append(groups, namespaceMemberGroup{
			key:     key,
			label:   label,
			members: []store.User{member},
		})
	}
	return groups
}

func namespaceGrantKey(namespaces []string, installNS string) (string, string) {
	star := false
	names := make([]string, 0, len(namespaces))
	seen := make(map[string]struct{}, len(namespaces))
	for _, raw := range namespaces {
		name := strings.TrimSpace(raw)
		if name == "" || (installNS != "" && name == installNS) {
			continue
		}
		if name == "*" {
			star = true
			continue
		}
		if _, ok := seen[name]; ok {
			continue
		}
		seen[name] = struct{}{}
		names = append(names, name)
	}
	if star || len(names) == 0 {
		return "*", "all"
	}
	slices.Sort(names)
	return strings.Join(names, "\x00"), strings.Join(names, ", ")
}

func grantFromKey(key string) (string, []string) {
	if key == "*" {
		return rbac.NamespaceScopeAll, []string{}
	}
	return rbac.NamespaceScopeSelected, strings.Split(key, "\x00")
}

func uniquePermissionSetName(base, label string, used map[string]struct{}) string {
	suffix := " (" + label + ")"
	name := truncateName(base, suffix)
	if _, ok := used[name]; !ok {
		return name
	}
	for n := 2; ; n++ {
		numbered := fmt.Sprintf(" %d", n)
		candidate := truncateName(base, suffix+numbered)
		if _, ok := used[candidate]; !ok {
			return candidate
		}
	}
}

func truncateName(base, suffix string) string {
	if len(base)+len(suffix) <= permissionSetNameMax {
		return base + suffix
	}
	keep := permissionSetNameMax - len(suffix)
	if keep < 1 {
		keep = 1
	}
	if keep > len(base) {
		keep = len(base)
	}
	return base[:keep] + suffix
}

func newPermissionSetID() (string, error) {
	var b [12]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", fmt.Errorf("generate permission set id: %w", err)
	}
	return hex.EncodeToString(b[:]), nil
}
