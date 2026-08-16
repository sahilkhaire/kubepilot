package kube

import (
	"context"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func init() {
	registerResource("nodes", resourceSpec{
		kind:          "Node",
		clusterScoped: true,
		list: func(ctx context.Context, c *Client, ns string) (any, error) {
			list, err := c.Inner.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return list.Items, nil
		},
		get: func(ctx context.Context, c *Client, ns, name string) (any, error) {
			return c.Inner.CoreV1().Nodes().Get(ctx, name, metav1.GetOptions{})
		},
	})
	registerResource("namespaces", resourceSpec{
		kind:          "Namespace",
		clusterScoped: true,
		list: func(ctx context.Context, c *Client, ns string) (any, error) {
			list, err := c.Inner.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return list.Items, nil
		},
		get: func(ctx context.Context, c *Client, ns, name string) (any, error) {
			return c.Inner.CoreV1().Namespaces().Get(ctx, name, metav1.GetOptions{})
		},
	})
	registerResource("serviceaccounts", resourceSpec{
		kind: "ServiceAccount",
		list: func(ctx context.Context, c *Client, ns string) (any, error) {
			list, err := c.Inner.CoreV1().ServiceAccounts(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return list.Items, nil
		},
		get: func(ctx context.Context, c *Client, ns, name string) (any, error) {
			return c.Inner.CoreV1().ServiceAccounts(ns).Get(ctx, name, metav1.GetOptions{})
		},
	})
	registerResource("roles", resourceSpec{
		kind: "Role",
		list: func(ctx context.Context, c *Client, ns string) (any, error) {
			list, err := c.Inner.RbacV1().Roles(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return list.Items, nil
		},
		get: func(ctx context.Context, c *Client, ns, name string) (any, error) {
			return c.Inner.RbacV1().Roles(ns).Get(ctx, name, metav1.GetOptions{})
		},
	})
	registerResource("rolebindings", resourceSpec{
		kind: "RoleBinding",
		list: func(ctx context.Context, c *Client, ns string) (any, error) {
			list, err := c.Inner.RbacV1().RoleBindings(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return list.Items, nil
		},
		get: func(ctx context.Context, c *Client, ns, name string) (any, error) {
			return c.Inner.RbacV1().RoleBindings(ns).Get(ctx, name, metav1.GetOptions{})
		},
	})
	registerResource("clusterroles", resourceSpec{
		kind:          "ClusterRole",
		clusterScoped: true,
		list: func(ctx context.Context, c *Client, ns string) (any, error) {
			list, err := c.Inner.RbacV1().ClusterRoles().List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return list.Items, nil
		},
		get: func(ctx context.Context, c *Client, ns, name string) (any, error) {
			return c.Inner.RbacV1().ClusterRoles().Get(ctx, name, metav1.GetOptions{})
		},
	})
	registerResource("clusterrolebindings", resourceSpec{
		kind:          "ClusterRoleBinding",
		clusterScoped: true,
		list: func(ctx context.Context, c *Client, ns string) (any, error) {
			list, err := c.Inner.RbacV1().ClusterRoleBindings().List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return list.Items, nil
		},
		get: func(ctx context.Context, c *Client, ns, name string) (any, error) {
			return c.Inner.RbacV1().ClusterRoleBindings().Get(ctx, name, metav1.GetOptions{})
		},
	})
}

// CreateNamespace creates a namespace with optional labels.
func (c *Client) CreateNamespace(ctx context.Context, name string, labels map[string]string) (*corev1.Namespace, error) {
	ns := &corev1.Namespace{
		ObjectMeta: metav1.ObjectMeta{
			Name:   name,
			Labels: labels,
		},
	}
	created, err := c.Inner.CoreV1().Namespaces().Create(ctx, ns, metav1.CreateOptions{})
	if err != nil {
		return nil, err
	}
	return created, nil
}

// UpdateNamespaceMetadata updates namespace labels and annotations.
func (c *Client) UpdateNamespaceMetadata(ctx context.Context, name string, labels, annotations map[string]string) (*corev1.Namespace, error) {
	ns, err := c.Inner.CoreV1().Namespaces().Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}
	if labels != nil {
		ns.Labels = labels
	}
	if annotations != nil {
		ns.Annotations = annotations
	}
	return c.Inner.CoreV1().Namespaces().Update(ctx, ns, metav1.UpdateOptions{})
}
