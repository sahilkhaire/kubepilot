package kube

import (
	"context"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func init() {
	registerResource("pvcs", resourceSpec{
		kind: "PersistentVolumeClaim",
		list: func(ctx context.Context, c *Client, ns string) (any, error) {
			list, err := c.Inner.CoreV1().PersistentVolumeClaims(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return list.Items, nil
		},
		get: func(ctx context.Context, c *Client, ns, name string) (any, error) {
			return c.Inner.CoreV1().PersistentVolumeClaims(ns).Get(ctx, name, metav1.GetOptions{})
		},
	})
	registerResource("pvs", resourceSpec{
		kind:          "PersistentVolume",
		clusterScoped: true,
		list: func(ctx context.Context, c *Client, ns string) (any, error) {
			list, err := c.Inner.CoreV1().PersistentVolumes().List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return list.Items, nil
		},
		get: func(ctx context.Context, c *Client, ns, name string) (any, error) {
			return c.Inner.CoreV1().PersistentVolumes().Get(ctx, name, metav1.GetOptions{})
		},
	})
	registerResource("storageclasses", resourceSpec{
		kind:          "StorageClass",
		clusterScoped: true,
		list: func(ctx context.Context, c *Client, ns string) (any, error) {
			list, err := c.Inner.StorageV1().StorageClasses().List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return list.Items, nil
		},
		get: func(ctx context.Context, c *Client, ns, name string) (any, error) {
			return c.Inner.StorageV1().StorageClasses().Get(ctx, name, metav1.GetOptions{})
		},
	})
}
