package kube

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"unicode/utf8"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

const (
	maxPodEnvContainers = 64
	maxPodEnvVars       = 256
	maxPodEnvNameLen    = 253
	maxPodEnvValueLen   = 262144
)

var (
	// ErrPodEnvImmutable is returned when the pod is not owned by a mutable workload.
	ErrPodEnvImmutable = errors.New("pod spec is immutable; environment can only be changed on a deployment, statefulset, or daemonset")
	// ErrPodEnvNoMatch is returned when submitted containers are not on the owner template.
	ErrPodEnvNoMatch = errors.New("no matching containers on owning workload")

	envNameRE = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)
)

// PodEnvVar is a container environment variable from the env editor.
type PodEnvVar struct {
	Name      string               `json:"name"`
	Value     string               `json:"value,omitempty"`
	ValueFrom *corev1.EnvVarSource `json:"valueFrom,omitempty"`
}

// PodEnvContainer is env for one container or init container.
type PodEnvContainer struct {
	Name string      `json:"name"`
	Kind string      `json:"kind"`
	Env  []PodEnvVar `json:"env"`
}

// PodEnvOwner identifies the workload whose pod template was updated.
type PodEnvOwner struct {
	Kind string `json:"kind"`
	Name string `json:"name"`
}

// PodEnvValidationError is a client-facing validation failure.
type PodEnvValidationError struct {
	Msg string
}

func (e *PodEnvValidationError) Error() string { return e.Msg }

func invalidPodEnv(msg string) error {
	return &PodEnvValidationError{Msg: msg}
}

// UpdatePodEnv writes container env onto the owning Deployment, StatefulSet, or DaemonSet.
func (c *Client) UpdatePodEnv(ctx context.Context, ns, podName string, containers []PodEnvContainer) (PodEnvOwner, error) {
	if err := validatePodEnvContainers(containers); err != nil {
		return PodEnvOwner{}, err
	}

	pod, err := c.Inner.CoreV1().Pods(ns).Get(ctx, podName, metav1.GetOptions{})
	if err != nil {
		return PodEnvOwner{}, err
	}

	owner, err := c.resolveMutablePodOwner(ctx, ns, pod)
	if err != nil {
		return PodEnvOwner{}, err
	}

	switch owner.Kind {
	case "Deployment":
		return c.UpdateDeploymentEnv(ctx, ns, owner.Name, containers)
	case "StatefulSet":
		sts, getErr := c.Inner.AppsV1().StatefulSets(ns).Get(ctx, owner.Name, metav1.GetOptions{})
		if getErr != nil {
			return PodEnvOwner{}, getErr
		}
		if err := applyEnvToPodSpec(&sts.Spec.Template.Spec, containers); err != nil {
			return PodEnvOwner{}, err
		}
		_, err = c.Inner.AppsV1().StatefulSets(ns).Update(ctx, sts, metav1.UpdateOptions{})
	case "DaemonSet":
		ds, getErr := c.Inner.AppsV1().DaemonSets(ns).Get(ctx, owner.Name, metav1.GetOptions{})
		if getErr != nil {
			return PodEnvOwner{}, getErr
		}
		if err := applyEnvToPodSpec(&ds.Spec.Template.Spec, containers); err != nil {
			return PodEnvOwner{}, err
		}
		_, err = c.Inner.AppsV1().DaemonSets(ns).Update(ctx, ds, metav1.UpdateOptions{})
	default:
		return PodEnvOwner{}, ErrPodEnvImmutable
	}
	if err != nil {
		return PodEnvOwner{}, err
	}
	return owner, nil
}

// UpdateDeploymentEnv writes container env onto a Deployment pod template.
func (c *Client) UpdateDeploymentEnv(ctx context.Context, ns, name string, containers []PodEnvContainer) (PodEnvOwner, error) {
	if err := validatePodEnvContainers(containers); err != nil {
		return PodEnvOwner{}, err
	}
	dep, err := c.Inner.AppsV1().Deployments(ns).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return PodEnvOwner{}, err
	}
	if err := applyEnvToPodSpec(&dep.Spec.Template.Spec, containers); err != nil {
		return PodEnvOwner{}, err
	}
	if _, err := c.Inner.AppsV1().Deployments(ns).Update(ctx, dep, metav1.UpdateOptions{}); err != nil {
		return PodEnvOwner{}, err
	}
	return PodEnvOwner{Kind: "Deployment", Name: name}, nil
}

func (c *Client) resolveMutablePodOwner(ctx context.Context, ns string, pod *corev1.Pod) (PodEnvOwner, error) {
	kind, name, ok := controllerOwner(pod.OwnerReferences)
	if !ok {
		return PodEnvOwner{}, ErrPodEnvImmutable
	}
	switch kind {
	case "ReplicaSet":
		rs, err := c.Inner.AppsV1().ReplicaSets(ns).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			return PodEnvOwner{}, err
		}
		ownerKind, ownerName, ok := controllerOwner(rs.OwnerReferences)
		if !ok || ownerKind != "Deployment" {
			return PodEnvOwner{}, ErrPodEnvImmutable
		}
		return PodEnvOwner{Kind: ownerKind, Name: ownerName}, nil
	case "StatefulSet", "DaemonSet":
		return PodEnvOwner{Kind: kind, Name: name}, nil
	default:
		return PodEnvOwner{}, ErrPodEnvImmutable
	}
}

func controllerOwner(refs []metav1.OwnerReference) (kind, name string, ok bool) {
	for _, ref := range refs {
		if ref.Controller != nil && *ref.Controller && ref.Kind != "" && ref.Name != "" {
			return ref.Kind, ref.Name, true
		}
	}
	return "", "", false
}

func validatePodEnvContainers(containers []PodEnvContainer) error {
	if len(containers) == 0 {
		return invalidPodEnv("containers required")
	}
	if len(containers) > maxPodEnvContainers {
		return invalidPodEnv("too many containers")
	}
	seen := make(map[string]struct{}, len(containers))
	for _, c := range containers {
		if c.Name == "" {
			return invalidPodEnv("container name required")
		}
		kind := normalizeContainerKind(c.Kind)
		if kind != "container" && kind != "init" {
			return invalidPodEnv("unsupported container kind")
		}
		key := kind + "/" + c.Name
		if _, dup := seen[key]; dup {
			return invalidPodEnv("duplicate container")
		}
		seen[key] = struct{}{}
		if err := validatePodEnvVars(c.Env); err != nil {
			return err
		}
	}
	return nil
}

func validatePodEnvVars(env []PodEnvVar) error {
	if len(env) > maxPodEnvVars {
		return invalidPodEnv("too many environment variables")
	}
	seen := make(map[string]struct{}, len(env))
	for _, ev := range env {
		name := ev.Name
		if name == "" {
			if ev.Value == "" && ev.ValueFrom == nil {
				continue
			}
			return invalidPodEnv("environment variable name required")
		}
		if utf8.RuneCountInString(name) > maxPodEnvNameLen || !envNameRE.MatchString(name) {
			return invalidPodEnv("invalid environment variable name")
		}
		if _, dup := seen[name]; dup {
			return invalidPodEnv("duplicate environment variable name")
		}
		seen[name] = struct{}{}
		if ev.ValueFrom != nil {
			continue
		}
		if utf8.RuneCountInString(ev.Value) > maxPodEnvValueLen {
			return invalidPodEnv("environment variable value too long")
		}
	}
	return nil
}

func applyEnvToPodSpec(spec *corev1.PodSpec, containers []PodEnvContainer) error {
	for _, in := range containers {
		env := toEnvVars(in.Env)
		kind := normalizeContainerKind(in.Kind)
		var found bool
		switch kind {
		case "init":
			found = setContainerEnv(spec.InitContainers, in.Name, env)
		default:
			found = setContainerEnv(spec.Containers, in.Name, env)
		}
		if !found {
			return fmt.Errorf("%w: %s %s", ErrPodEnvNoMatch, kind, in.Name)
		}
	}
	return nil
}

func setContainerEnv(containers []corev1.Container, name string, env []corev1.EnvVar) bool {
	for i := range containers {
		if containers[i].Name == name {
			containers[i].Env = env
			return true
		}
	}
	return false
}

func toEnvVars(in []PodEnvVar) []corev1.EnvVar {
	out := make([]corev1.EnvVar, 0, len(in))
	for _, ev := range in {
		if ev.Name == "" {
			continue
		}
		item := corev1.EnvVar{Name: ev.Name}
		if ev.ValueFrom != nil {
			item.ValueFrom = ev.ValueFrom
		} else {
			item.Value = ev.Value
		}
		out = append(out, item)
	}
	return out
}

func normalizeContainerKind(kind string) string {
	if kind == "" {
		return "container"
	}
	return kind
}
