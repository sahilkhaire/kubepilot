package kube

import (
	"context"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func init() {
	registerResource("configmaps", resourceSpec{
		kind: "ConfigMap",
		list: func(ctx context.Context, c *Client, ns string) (any, error) {
			list, err := c.Inner.CoreV1().ConfigMaps(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return list.Items, nil
		},
		get: func(ctx context.Context, c *Client, ns, name string) (any, error) {
			return c.Inner.CoreV1().ConfigMaps(ns).Get(ctx, name, metav1.GetOptions{})
		},
	})
	registerResource("secrets", resourceSpec{
		kind: "Secret",
		list: func(ctx context.Context, c *Client, ns string) (any, error) {
			list, err := c.Inner.CoreV1().Secrets(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return list.Items, nil
		},
		get: func(ctx context.Context, c *Client, ns, name string) (any, error) {
			return c.Inner.CoreV1().Secrets(ns).Get(ctx, name, metav1.GetOptions{})
		},
	})
	registerResource("resourcequotas", resourceSpec{
		kind: "ResourceQuota",
		list: func(ctx context.Context, c *Client, ns string) (any, error) {
			list, err := c.Inner.CoreV1().ResourceQuotas(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return list.Items, nil
		},
		get: func(ctx context.Context, c *Client, ns, name string) (any, error) {
			return c.Inner.CoreV1().ResourceQuotas(ns).Get(ctx, name, metav1.GetOptions{})
		},
	})
	registerResource("limitranges", resourceSpec{
		kind: "LimitRange",
		list: func(ctx context.Context, c *Client, ns string) (any, error) {
			list, err := c.Inner.CoreV1().LimitRanges(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return list.Items, nil
		},
		get: func(ctx context.Context, c *Client, ns, name string) (any, error) {
			return c.Inner.CoreV1().LimitRanges(ns).Get(ctx, name, metav1.GetOptions{})
		},
	})
	registerResource("hpas", resourceSpec{
		kind: "HorizontalPodAutoscaler",
		list: func(ctx context.Context, c *Client, ns string) (any, error) {
			list, err := c.Inner.AutoscalingV2().HorizontalPodAutoscalers(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return list.Items, nil
		},
		get: func(ctx context.Context, c *Client, ns, name string) (any, error) {
			return c.Inner.AutoscalingV2().HorizontalPodAutoscalers(ns).Get(ctx, name, metav1.GetOptions{})
		},
	})
	registerResource("pdbs", resourceSpec{
		kind: "PodDisruptionBudget",
		list: func(ctx context.Context, c *Client, ns string) (any, error) {
			list, err := c.Inner.PolicyV1().PodDisruptionBudgets(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return list.Items, nil
		},
		get: func(ctx context.Context, c *Client, ns, name string) (any, error) {
			return c.Inner.PolicyV1().PodDisruptionBudgets(ns).Get(ctx, name, metav1.GetOptions{})
		},
	})
	registerResource("leases", resourceSpec{
		kind: "Lease",
		list: func(ctx context.Context, c *Client, ns string) (any, error) {
			list, err := c.Inner.CoordinationV1().Leases(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return list.Items, nil
		},
		get: func(ctx context.Context, c *Client, ns, name string) (any, error) {
			return c.Inner.CoordinationV1().Leases(ns).Get(ctx, name, metav1.GetOptions{})
		},
	})
	registerResource("priorityclasses", resourceSpec{
		kind: "PriorityClass",
		clusterScoped: true,
		list: func(ctx context.Context, c *Client, ns string) (any, error) {
			list, err := c.Inner.SchedulingV1().PriorityClasses().List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return list.Items, nil
		},
		get: func(ctx context.Context, c *Client, ns, name string) (any, error) {
			return c.Inner.SchedulingV1().PriorityClasses().Get(ctx, name, metav1.GetOptions{})
		},
	})
	registerResource("runtimeclasses", resourceSpec{
		kind: "RuntimeClass",
		clusterScoped: true,
		list: func(ctx context.Context, c *Client, ns string) (any, error) {
			list, err := c.Inner.NodeV1().RuntimeClasses().List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return list.Items, nil
		},
		get: func(ctx context.Context, c *Client, ns, name string) (any, error) {
			return c.Inner.NodeV1().RuntimeClasses().Get(ctx, name, metav1.GetOptions{})
		},
	})
}
