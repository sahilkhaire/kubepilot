package kube

import (
	"context"
	"fmt"
	"strings"

	corev1 "k8s.io/api/core/v1"
	policyv1 "k8s.io/api/policy/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
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

// DrainNode cordons the node and evicts its pods through the Eviction API, so
// PodDisruptionBudgets are respected. DaemonSet pods, static (mirror) pods and
// finished pods are skipped, matching `kubectl drain --ignore-daemonsets`.
// Pods blocked by a disruption budget are reported in the returned error.
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
	var blocked, failed []string
	for _, pod := range pods {
		if !shouldEvict(pod) {
			continue
		}
		err := c.Inner.CoreV1().Pods(pod.Namespace).EvictV1(ctx, &policyv1.Eviction{
			ObjectMeta: metav1.ObjectMeta{Name: pod.Name, Namespace: pod.Namespace},
		})
		switch {
		case err == nil, apierrors.IsNotFound(err):
		case apierrors.IsTooManyRequests(err):
			blocked = append(blocked, pod.Namespace+"/"+pod.Name)
		default:
			failed = append(failed, pod.Namespace+"/"+pod.Name)
		}
	}
	if len(blocked) > 0 || len(failed) > 0 {
		var parts []string
		if len(blocked) > 0 {
			parts = append(parts, fmt.Sprintf("blocked by a disruption budget: %s", strings.Join(blocked, ", ")))
		}
		if len(failed) > 0 {
			parts = append(parts, fmt.Sprintf("could not evict: %s", strings.Join(failed, ", ")))
		}
		return &DrainIncompleteError{Message: "node cordoned, but some pods were not evicted (" + strings.Join(parts, "; ") + ")"}
	}
	return nil
}

// DrainIncompleteError means the node was cordoned but some pods remain.
type DrainIncompleteError struct{ Message string }

func (e *DrainIncompleteError) Error() string { return e.Message }

func shouldEvict(pod corev1.Pod) bool {
	if pod.Namespace == "" || pod.DeletionTimestamp != nil {
		return false
	}
	if pod.Status.Phase == corev1.PodSucceeded || pod.Status.Phase == corev1.PodFailed {
		return false
	}
	if _, mirror := pod.Annotations[corev1.MirrorPodAnnotationKey]; mirror {
		return false
	}
	if owner := metav1.GetControllerOf(&pod); owner != nil && owner.Kind == "DaemonSet" {
		return false
	}
	return true
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
