package rbac

import (
	"errors"
	"fmt"
	"regexp"
	"strings"

	"github.com/sahilkhaire/kubepilot/internal/store"
)

const (
	NamespaceScopeAll      = "all"
	NamespaceScopeSelected = "selected"
)

func VisibleNamespaces(user store.User, ps *PermissionSet, installNS string, clusterNamespaces []string) []string {
	if len(clusterNamespaces) == 0 {
		return nil
	}

	out := make([]string, 0, len(clusterNamespaces))
	seen := make(map[string]struct{}, len(clusterNamespaces))
	for _, ns := range clusterNamespaces {
		if ns == "" {
			continue
		}
		if _, ok := seen[ns]; ok {
			continue
		}
		if user.Role != store.RoleOwner {
			if !NamespaceAllowed(ps, ns, installNS) {
				continue
			}
		}
		seen[ns] = struct{}{}
		out = append(out, ns)
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func NamespaceAllowed(ps *PermissionSet, ns, installNS string) bool {
	if ns == "" {
		return false
	}
	if installNS != "" && ns == installNS {
		return false
	}
	if ps == nil {
		return false
	}
	if ps.NamespaceScope == NamespaceScopeSelected {
		for _, name := range ps.Namespaces {
			if name == ns {
				return true
			}
		}
		for _, pattern := range ps.NamespaceRegex {
			if namespaceRegexMatches(pattern, ns) {
				return true
			}
		}
		return false
	}
	return true
}

func ValidateNamespaceGrant(scope string, names, patterns []string, installNS string) (string, []string, []string, error) {
	scope = strings.TrimSpace(scope)
	if scope == "" {
		scope = NamespaceScopeAll
	}
	switch scope {
	case NamespaceScopeAll:
		return NamespaceScopeAll, []string{}, []string{}, nil
	case NamespaceScopeSelected:
		outNames, err := normalizeNamespaceNames(names, installNS)
		if err != nil {
			return "", nil, nil, err
		}
		outPats, err := normalizeNamespaceRegex(patterns)
		if err != nil {
			return "", nil, nil, err
		}
		if len(outNames) == 0 && len(outPats) == 0 {
			return "", nil, nil, errors.New("namespaces required")
		}
		return NamespaceScopeSelected, outNames, outPats, nil
	default:
		return "", nil, nil, errors.New("unknown namespace scope")
	}
}

func normalizeNamespaceNames(names []string, installNS string) ([]string, error) {
	out := make([]string, 0, len(names))
	seen := make(map[string]struct{}, len(names))
	for _, raw := range names {
		name := strings.TrimSpace(raw)
		if name == "" {
			return nil, errors.New("namespace required")
		}
		if name == "*" {
			return nil, errors.New("use all namespaces")
		}
		if installNS != "" && name == installNS {
			return nil, errors.New("install namespace not allowed")
		}
		if _, ok := seen[name]; ok {
			continue
		}
		seen[name] = struct{}{}
		out = append(out, name)
	}
	return out, nil
}

func normalizeNamespaceRegex(patterns []string) ([]string, error) {
	out := make([]string, 0, len(patterns))
	seen := make(map[string]struct{}, len(patterns))
	for _, raw := range patterns {
		pattern := strings.TrimSpace(raw)
		if pattern == "" {
			return nil, errors.New("namespace regex required")
		}
		if _, err := compileNamespaceRegex(pattern); err != nil {
			return nil, fmt.Errorf("invalid namespace regex %q: %w", pattern, err)
		}
		if _, ok := seen[pattern]; ok {
			continue
		}
		seen[pattern] = struct{}{}
		out = append(out, pattern)
	}
	return out, nil
}

func namespaceRegexMatches(pattern, ns string) bool {
	re, err := compileNamespaceRegex(pattern)
	if err != nil {
		return false
	}
	return re.MatchString(ns)
}

func compileNamespaceRegex(pattern string) (*regexp.Regexp, error) {
	return regexp.Compile(`\A(?:` + pattern + `)\z`)
}
