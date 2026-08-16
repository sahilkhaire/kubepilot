package kube

import (
	"context"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// NodeDrainer evicts pods from a node. Injected in tests when eviction is unavailable.
type NodeDrainer interface {
	DrainNode(ctx context.Context, name string) error
}

// CordonNode sets node unschedulable state.
func (c *Client) CordonNode(ctx context.Context, name string, unschedulable bool) error {
	node, err := c.Inner.CoreV1().Nodes().Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return err
	}
	node.Spec.Unschedulable = unschedulable
	_, err = c.Inner.CoreV1().Nodes().Update(ctx, node, metav1.UpdateOptions{})
	return err
}

// DrainNode cordons the node and evicts pods (best-effort).
func (c *Client) DrainNode(ctx context.Context, name string) error {
	if c.Drainer != nil {
		return c.Drainer.DrainNode(ctx, name)
	}
	if err := c.CordonNode(ctx, name, true); err != nil {
		return err
	}
	pods, err := c.ListPodsOnNode(ctx, name)
	if err != nil {
		return err
	}
	for _, pod := range pods {
		if pod.Namespace == "" {
			continue
		}
		_ = c.Inner.CoreV1().Pods(pod.Namespace).Delete(ctx, pod.Name, metav1.DeleteOptions{})
	}
	return nil
}

// ListPodsOnNode returns pods scheduled on the named node.
func (c *Client) ListPodsOnNode(ctx context.Context, name string) ([]corev1.Pod, error) {
	list, err := c.Inner.CoreV1().Pods("").List(ctx, metav1.ListOptions{
		FieldSelector: "spec.nodeName=" + name,
	})
	if err != nil {
		return nil, err
	}
	out := make([]corev1.Pod, 0, len(list.Items))
	for _, pod := range list.Items {
		if pod.Spec.NodeName == name {
			out = append(out, pod)
		}
	}
	return out, nil
}

// ListEventsInNamespace returns events in a namespace.
func (c *Client) ListEventsInNamespace(ctx context.Context, ns string) ([]corev1.Event, error) {
	list, err := c.Inner.CoreV1().Events(ns).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	return list.Items, nil
}
