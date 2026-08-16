package kube

import (
	"context"
	"fmt"
	"reflect"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/fields"
)

// WorkloadModules lists namespace-scoped workload resource path segments.
var WorkloadModules = []string{
	"pods",
	"deployments",
	"statefulsets",
	"daemonsets",
	"replicasets",
	"jobs",
	"cronjobs",
}

type resourceSpec struct {
	kind string
	list func(ctx context.Context, c *Client, ns string) (any, error)
	get  func(ctx context.Context, c *Client, ns, name string) (any, error)
}

var resources = map[string]resourceSpec{
	"pods": {
		kind: "Pod",
		list: func(ctx context.Context, c *Client, ns string) (any, error) {
			list, err := c.Inner.CoreV1().Pods(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return list.Items, nil
		},
		get: func(ctx context.Context, c *Client, ns, name string) (any, error) {
			return c.Inner.CoreV1().Pods(ns).Get(ctx, name, metav1.GetOptions{})
		},
	},
	"deployments": {
		kind: "Deployment",
		list: func(ctx context.Context, c *Client, ns string) (any, error) {
			list, err := c.Inner.AppsV1().Deployments(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return list.Items, nil
		},
		get: func(ctx context.Context, c *Client, ns, name string) (any, error) {
			return c.Inner.AppsV1().Deployments(ns).Get(ctx, name, metav1.GetOptions{})
		},
	},
	"statefulsets": {
		kind: "StatefulSet",
		list: func(ctx context.Context, c *Client, ns string) (any, error) {
			list, err := c.Inner.AppsV1().StatefulSets(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return list.Items, nil
		},
		get: func(ctx context.Context, c *Client, ns, name string) (any, error) {
			return c.Inner.AppsV1().StatefulSets(ns).Get(ctx, name, metav1.GetOptions{})
		},
	},
	"daemonsets": {
		kind: "DaemonSet",
		list: func(ctx context.Context, c *Client, ns string) (any, error) {
			list, err := c.Inner.AppsV1().DaemonSets(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return list.Items, nil
		},
		get: func(ctx context.Context, c *Client, ns, name string) (any, error) {
			return c.Inner.AppsV1().DaemonSets(ns).Get(ctx, name, metav1.GetOptions{})
		},
	},
	"replicasets": {
		kind: "ReplicaSet",
		list: func(ctx context.Context, c *Client, ns string) (any, error) {
			list, err := c.Inner.AppsV1().ReplicaSets(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return list.Items, nil
		},
		get: func(ctx context.Context, c *Client, ns, name string) (any, error) {
			return c.Inner.AppsV1().ReplicaSets(ns).Get(ctx, name, metav1.GetOptions{})
		},
	},
	"jobs": {
		kind: "Job",
		list: func(ctx context.Context, c *Client, ns string) (any, error) {
			list, err := c.Inner.BatchV1().Jobs(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return list.Items, nil
		},
		get: func(ctx context.Context, c *Client, ns, name string) (any, error) {
			return c.Inner.BatchV1().Jobs(ns).Get(ctx, name, metav1.GetOptions{})
		},
	},
	"cronjobs": {
		kind: "CronJob",
		list: func(ctx context.Context, c *Client, ns string) (any, error) {
			list, err := c.Inner.BatchV1().CronJobs(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return list.Items, nil
		},
		get: func(ctx context.Context, c *Client, ns, name string) (any, error) {
			return c.Inner.BatchV1().CronJobs(ns).Get(ctx, name, metav1.GetOptions{})
		},
	},
}

func ResourceKind(module string) (string, bool) {
	spec, ok := resources[module]
	if !ok {
		return "", false
	}
	return spec.kind, true
}

func (c *Client) ListResource(ctx context.Context, module, ns string) (any, error) {
	spec, ok := resources[module]
	if !ok {
		return nil, fmt.Errorf("unknown resource %q", module)
	}
	items, err := spec.list(ctx, c, ns)
	if err != nil {
		return nil, err
	}
	return ensureSlice(items), nil
}

func (c *Client) GetResource(ctx context.Context, module, ns, name string) (any, error) {
	spec, ok := resources[module]
	if !ok {
		return nil, fmt.Errorf("unknown resource %q", module)
	}
	return spec.get(ctx, c, ns, name)
}

func (c *Client) CountResource(ctx context.Context, module, ns string) (int, error) {
	spec, ok := resources[module]
	if !ok {
		return 0, fmt.Errorf("unknown resource %q", module)
	}
	items, err := spec.list(ctx, c, ns)
	if err != nil {
		return 0, err
	}
	return sliceLen(items), nil
}

func (c *Client) EventsForObject(ctx context.Context, ns, kind, name string) ([]corev1.Event, error) {
	sel := fields.AndSelectors(
		fields.OneTermEqualSelector("involvedObject.name", name),
		fields.OneTermEqualSelector("involvedObject.kind", kind),
	)
	list, err := c.Inner.CoreV1().Events(ns).List(ctx, metav1.ListOptions{
		FieldSelector: sel.String(),
	})
	if err != nil {
		return nil, err
	}
	return list.Items, nil
}

func (c *Client) ClusterNamespaces(ctx context.Context) ([]string, error) {
	list, err := c.Inner.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	out := make([]string, 0, len(list.Items))
	for _, ns := range list.Items {
		out = append(out, ns.Name)
	}
	return out, nil
}

func ensureSlice(items any) any {
	if items == nil {
		return []any{}
	}
	rv := reflect.ValueOf(items)
	if rv.Kind() == reflect.Slice && rv.IsNil() {
		return reflect.MakeSlice(rv.Type(), 0, 0).Interface()
	}
	return items
}

func ObjectNames(items any) []string {
	if items == nil {
		return nil
	}
	rv := reflect.ValueOf(items)
	if rv.Kind() != reflect.Slice {
		return nil
	}
	n := rv.Len()
	if n == 0 {
		return nil
	}
	out := make([]string, 0, n)
	for i := 0; i < n; i++ {
		meta := rv.Index(i).FieldByName("ObjectMeta")
		if !meta.IsValid() {
			continue
		}
		name := meta.FieldByName("Name")
		if name.IsValid() && name.Kind() == reflect.String {
			out = append(out, name.String())
		}
	}
	return out
}

func sliceLen(v any) int {
	if v == nil {
		return 0
	}
	rv := reflect.ValueOf(v)
	if rv.Kind() != reflect.Slice {
		return 0
	}
	return rv.Len()
}
