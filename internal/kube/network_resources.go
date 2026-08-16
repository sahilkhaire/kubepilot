package kube

import (
	"context"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func init() {
	registerResource("services", resourceSpec{
		kind: "Service",
		list: func(ctx context.Context, c *Client, ns string) (any, error) {
			list, err := c.Inner.CoreV1().Services(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return list.Items, nil
		},
		get: func(ctx context.Context, c *Client, ns, name string) (any, error) {
			return c.Inner.CoreV1().Services(ns).Get(ctx, name, metav1.GetOptions{})
		},
	})
	registerResource("endpoints", resourceSpec{
		kind: "Endpoints",
		list: func(ctx context.Context, c *Client, ns string) (any, error) {
			list, err := c.Inner.CoreV1().Endpoints(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return list.Items, nil
		},
		get: func(ctx context.Context, c *Client, ns, name string) (any, error) {
			return c.Inner.CoreV1().Endpoints(ns).Get(ctx, name, metav1.GetOptions{})
		},
	})
	registerResource("ingresses", resourceSpec{
		kind: "Ingress",
		list: func(ctx context.Context, c *Client, ns string) (any, error) {
			list, err := c.Inner.NetworkingV1().Ingresses(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return list.Items, nil
		},
		get: func(ctx context.Context, c *Client, ns, name string) (any, error) {
			return c.Inner.NetworkingV1().Ingresses(ns).Get(ctx, name, metav1.GetOptions{})
		},
	})
	registerResource("ingressclasses", resourceSpec{
		kind:          "IngressClass",
		clusterScoped: true,
		list: func(ctx context.Context, c *Client, ns string) (any, error) {
			list, err := c.Inner.NetworkingV1().IngressClasses().List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return list.Items, nil
		},
		get: func(ctx context.Context, c *Client, ns, name string) (any, error) {
			return c.Inner.NetworkingV1().IngressClasses().Get(ctx, name, metav1.GetOptions{})
		},
	})
	registerResource("networkpolicies", resourceSpec{
		kind: "NetworkPolicy",
		list: func(ctx context.Context, c *Client, ns string) (any, error) {
			list, err := c.Inner.NetworkingV1().NetworkPolicies(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return list.Items, nil
		},
		get: func(ctx context.Context, c *Client, ns, name string) (any, error) {
			return c.Inner.NetworkingV1().NetworkPolicies(ns).Get(ctx, name, metav1.GetOptions{})
		},
	})
}
