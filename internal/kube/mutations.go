package kube

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"time"

	appsv1 "k8s.io/api/apps/v1"
	batchv1 "k8s.io/api/batch/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/labels"
	"k8s.io/apimachinery/pkg/types"
)

const restartedAtAnnotation = "kubectl.kubernetes.io/restartedAt"

func (c *Client) DeletePod(ctx context.Context, ns, name string) error {
	return c.Inner.CoreV1().Pods(ns).Delete(ctx, name, metav1.DeleteOptions{})
}

func (c *Client) DeleteDeployment(ctx context.Context, ns, name string) error {
	return c.Inner.AppsV1().Deployments(ns).Delete(ctx, name, metav1.DeleteOptions{})
}

func (c *Client) DeleteStatefulSet(ctx context.Context, ns, name string) error {
	return c.Inner.AppsV1().StatefulSets(ns).Delete(ctx, name, metav1.DeleteOptions{})
}

func (c *Client) DeleteDaemonSet(ctx context.Context, ns, name string) error {
	return c.Inner.AppsV1().DaemonSets(ns).Delete(ctx, name, metav1.DeleteOptions{})
}

func (c *Client) DeleteReplicaSet(ctx context.Context, ns, name string) error {
	return c.Inner.AppsV1().ReplicaSets(ns).Delete(ctx, name, metav1.DeleteOptions{})
}

func (c *Client) DeleteJob(ctx context.Context, ns, name string) error {
	return c.Inner.BatchV1().Jobs(ns).Delete(ctx, name, metav1.DeleteOptions{})
}

func (c *Client) DeleteCronJob(ctx context.Context, ns, name string) error {
	return c.Inner.BatchV1().CronJobs(ns).Delete(ctx, name, metav1.DeleteOptions{})
}

func (c *Client) ScaleDeployment(ctx context.Context, ns, name string, replicas int32) error {
	if replicas < 0 {
		return fmt.Errorf("replicas must be >= 0")
	}
	dep, err := c.Inner.AppsV1().Deployments(ns).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return err
	}
	dep.Spec.Replicas = &replicas
	_, err = c.Inner.AppsV1().Deployments(ns).Update(ctx, dep, metav1.UpdateOptions{})
	return err
}

func (c *Client) ScaleStatefulSet(ctx context.Context, ns, name string, replicas int32) error {
	if replicas < 0 {
		return fmt.Errorf("replicas must be >= 0")
	}
	sts, err := c.Inner.AppsV1().StatefulSets(ns).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return err
	}
	sts.Spec.Replicas = &replicas
	_, err = c.Inner.AppsV1().StatefulSets(ns).Update(ctx, sts, metav1.UpdateOptions{})
	return err
}

func (c *Client) ScaleReplicaSet(ctx context.Context, ns, name string, replicas int32) error {
	if replicas < 0 {
		return fmt.Errorf("replicas must be >= 0")
	}
	rs, err := c.Inner.AppsV1().ReplicaSets(ns).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return err
	}
	rs.Spec.Replicas = &replicas
	_, err = c.Inner.AppsV1().ReplicaSets(ns).Update(ctx, rs, metav1.UpdateOptions{})
	return err
}

func (c *Client) RestartDeployment(ctx context.Context, ns, name string) error {
	return restartWorkload(ctx, c, ns, name, "deployments")
}

func (c *Client) RestartStatefulSet(ctx context.Context, ns, name string) error {
	return restartWorkload(ctx, c, ns, name, "statefulsets")
}

func (c *Client) RestartDaemonSet(ctx context.Context, ns, name string) error {
	return restartWorkload(ctx, c, ns, name, "daemonsets")
}

func restartWorkload(ctx context.Context, c *Client, ns, name, module string) error {
	if _, err := c.GetResource(ctx, module, ns, name); err != nil {
		return err
	}
	patch := map[string]any{
		"spec": map[string]any{
			"template": map[string]any{
				"metadata": map[string]any{
					"annotations": map[string]string{
						restartedAtAnnotation: time.Now().UTC().Format(time.RFC3339),
					},
				},
			},
		},
	}
	patchBytes, err := json.Marshal(patch)
	if err != nil {
		return err
	}
	switch module {
	case "deployments":
		_, err = c.Inner.AppsV1().Deployments(ns).Patch(ctx, name, types.StrategicMergePatchType, patchBytes, metav1.PatchOptions{})
	case "statefulsets":
		_, err = c.Inner.AppsV1().StatefulSets(ns).Patch(ctx, name, types.StrategicMergePatchType, patchBytes, metav1.PatchOptions{})
	case "daemonsets":
		_, err = c.Inner.AppsV1().DaemonSets(ns).Patch(ctx, name, types.StrategicMergePatchType, patchBytes, metav1.PatchOptions{})
	default:
		return fmt.Errorf("unsupported restart module %q", module)
	}
	return err
}

func (c *Client) RollbackDeployment(ctx context.Context, ns, name string, revision int64) error {
	dep, err := c.Inner.AppsV1().Deployments(ns).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return err
	}
	if dep.Spec.Selector == nil || len(dep.Spec.Selector.MatchLabels) == 0 {
		return fmt.Errorf("deployment %q has no selector labels", name)
	}

	rsList, err := c.Inner.AppsV1().ReplicaSets(ns).List(ctx, metav1.ListOptions{
		LabelSelector: labels.Set(dep.Spec.Selector.MatchLabels).String(),
	})
	if err != nil {
		return err
	}

	var target *appsv1.ReplicaSet
	for i := range rsList.Items {
		rs := &rsList.Items[i]
		revStr := rs.Annotations["deployment.kubernetes.io/revision"]
		if revStr == "" {
			continue
		}
		rev, parseErr := strconv.ParseInt(revStr, 10, 64)
		if parseErr != nil {
			continue
		}
		if rev == revision {
			target = rs
			break
		}
	}
	if target == nil {
		return apierrors.NewNotFound(appsv1.Resource("replicaset"), fmt.Sprintf("revision %d for deployment %s", revision, name))
	}

	dep.Spec.Template = target.Spec.Template
	_, err = c.Inner.AppsV1().Deployments(ns).Update(ctx, dep, metav1.UpdateOptions{})
	return err
}

func (c *Client) TriggerCronJob(ctx context.Context, ns, name string) (string, error) {
	cj, err := c.Inner.BatchV1().CronJobs(ns).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return "", err
	}
	jobName := name + "-manual-" + strconv.FormatInt(time.Now().UnixNano(), 10)
	job := &batchv1.Job{
		ObjectMeta: metav1.ObjectMeta{
			Name:        jobName,
			Namespace:   ns,
			Labels:      cj.Spec.JobTemplate.ObjectMeta.Labels,
			Annotations: cj.Spec.JobTemplate.ObjectMeta.Annotations,
		},
		Spec: cj.Spec.JobTemplate.Spec,
	}
	created, err := c.Inner.BatchV1().Jobs(ns).Create(ctx, job, metav1.CreateOptions{})
	if err != nil {
		return "", err
	}
	return created.Name, nil
}

// DeleteResource deletes a catalog resource by module path segment.
func (c *Client) DeleteResource(ctx context.Context, module, ns, name string) error {
	switch module {
	case "pods":
		return c.DeletePod(ctx, ns, name)
	case "deployments":
		return c.DeleteDeployment(ctx, ns, name)
	case "statefulsets":
		return c.DeleteStatefulSet(ctx, ns, name)
	case "daemonsets":
		return c.DeleteDaemonSet(ctx, ns, name)
	case "replicasets":
		return c.DeleteReplicaSet(ctx, ns, name)
	case "jobs":
		return c.DeleteJob(ctx, ns, name)
	case "cronjobs":
		return c.DeleteCronJob(ctx, ns, name)
	case "configmaps":
		return c.Inner.CoreV1().ConfigMaps(ns).Delete(ctx, name, metav1.DeleteOptions{})
	case "secrets":
		return c.Inner.CoreV1().Secrets(ns).Delete(ctx, name, metav1.DeleteOptions{})
	case "resourcequotas":
		return c.Inner.CoreV1().ResourceQuotas(ns).Delete(ctx, name, metav1.DeleteOptions{})
	case "limitranges":
		return c.Inner.CoreV1().LimitRanges(ns).Delete(ctx, name, metav1.DeleteOptions{})
	case "hpas":
		return c.Inner.AutoscalingV2().HorizontalPodAutoscalers(ns).Delete(ctx, name, metav1.DeleteOptions{})
	case "pdbs":
		return c.Inner.PolicyV1().PodDisruptionBudgets(ns).Delete(ctx, name, metav1.DeleteOptions{})
	case "leases":
		return c.Inner.CoordinationV1().Leases(ns).Delete(ctx, name, metav1.DeleteOptions{})
	case "priorityclasses":
		return c.Inner.SchedulingV1().PriorityClasses().Delete(ctx, name, metav1.DeleteOptions{})
	case "runtimeclasses":
		return c.Inner.NodeV1().RuntimeClasses().Delete(ctx, name, metav1.DeleteOptions{})
	case "services":
		return c.Inner.CoreV1().Services(ns).Delete(ctx, name, metav1.DeleteOptions{})
	case "ingresses":
		return c.Inner.NetworkingV1().Ingresses(ns).Delete(ctx, name, metav1.DeleteOptions{})
	case "ingressclasses":
		return c.Inner.NetworkingV1().IngressClasses().Delete(ctx, name, metav1.DeleteOptions{})
	case "networkpolicies":
		return c.Inner.NetworkingV1().NetworkPolicies(ns).Delete(ctx, name, metav1.DeleteOptions{})
	case "pvcs":
		return c.Inner.CoreV1().PersistentVolumeClaims(ns).Delete(ctx, name, metav1.DeleteOptions{})
	case "pvs":
		return c.Inner.CoreV1().PersistentVolumes().Delete(ctx, name, metav1.DeleteOptions{})
	case "storageclasses":
		return c.Inner.StorageV1().StorageClasses().Delete(ctx, name, metav1.DeleteOptions{})
	case "nodes":
		return c.Inner.CoreV1().Nodes().Delete(ctx, name, metav1.DeleteOptions{})
	case "namespaces":
		return c.Inner.CoreV1().Namespaces().Delete(ctx, name, metav1.DeleteOptions{})
	case "serviceaccounts":
		return c.Inner.CoreV1().ServiceAccounts(ns).Delete(ctx, name, metav1.DeleteOptions{})
	case "roles":
		return c.Inner.RbacV1().Roles(ns).Delete(ctx, name, metav1.DeleteOptions{})
	case "rolebindings":
		return c.Inner.RbacV1().RoleBindings(ns).Delete(ctx, name, metav1.DeleteOptions{})
	case "clusterroles":
		return c.Inner.RbacV1().ClusterRoles().Delete(ctx, name, metav1.DeleteOptions{})
	case "clusterrolebindings":
		return c.Inner.RbacV1().ClusterRoleBindings().Delete(ctx, name, metav1.DeleteOptions{})
	default:
		return fmt.Errorf("unknown resource %q", module)
	}
}

// ScaleResource scales a scalable workload module.
func (c *Client) ScaleResource(ctx context.Context, module, ns, name string, replicas int32) error {
	switch module {
	case "deployments":
		return c.ScaleDeployment(ctx, ns, name, replicas)
	case "statefulsets":
		return c.ScaleStatefulSet(ctx, ns, name, replicas)
	case "replicasets":
		return c.ScaleReplicaSet(ctx, ns, name, replicas)
	default:
		return fmt.Errorf("resource %q does not support scale", module)
	}
}

// RestartResource restarts a restartable workload module.
func (c *Client) RestartResource(ctx context.Context, module, ns, name string) error {
	switch module {
	case "deployments":
		return c.RestartDeployment(ctx, ns, name)
	case "statefulsets":
		return c.RestartStatefulSet(ctx, ns, name)
	case "daemonsets":
		return c.RestartDaemonSet(ctx, ns, name)
	default:
		return fmt.Errorf("resource %q does not support restart", module)
	}
}

// ObjectExists checks whether a workload object exists before mutation.
func (c *Client) ObjectExists(ctx context.Context, module, ns, name string) (bool, error) {
	_, err := c.GetResource(ctx, module, ns, name)
	if err == nil {
		return true, nil
	}
	if apierrors.IsNotFound(err) {
		return false, nil
	}
	return false, err
}

// KindForModule returns the Kubernetes kind for audit metadata.
func KindForModule(module string) string {
	kind, ok := ResourceKind(module)
	if !ok {
		return ""
	}
	return kind
}
