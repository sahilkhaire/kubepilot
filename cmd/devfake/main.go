// Command devfake runs KubePilot locally for UI development without a cluster
// or MongoDB: the real HTTP API on top of an in-memory store and a fake
// Kubernetes API seeded with sample workloads. Nothing it does touches a real cluster.
//
// Usage: make dev-fake   (then open http://localhost:8080, owner / owner-pass-123)
package main

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"time"

	appsv1 "k8s.io/api/apps/v1"
	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	dynamicfake "k8s.io/client-go/dynamic/fake"
	"k8s.io/client-go/kubernetes/fake"

	"github.com/sahilkhaire/kubepilot/internal/audit"
	"github.com/sahilkhaire/kubepilot/internal/auth"
	"github.com/sahilkhaire/kubepilot/internal/bootstrap"
	"github.com/sahilkhaire/kubepilot/internal/helmctrl"
	"github.com/sahilkhaire/kubepilot/internal/httpapi"
	"github.com/sahilkhaire/kubepilot/internal/kube"
	"github.com/sahilkhaire/kubepilot/internal/store"
	"github.com/sahilkhaire/kubepilot/internal/streams"
	"github.com/sahilkhaire/kubepilot/internal/version"
)

const (
	installNS     = "kubepilot"
	ownerUser     = "owner"
	ownerPassword = "owner-pass-123"
)

func main() {
	addr := envOr("LISTEN_ADDR", "127.0.0.1:8080")
	webDist := envOr("WEB_DIST", "web/dist")

	if version.Version == "dev" {
		version.Version = "dev (fake cluster)"
	}

	ctx := context.Background()
	st := store.NewMemory()
	auditor := audit.New(st)
	if err := bootstrap.SyncOwner(ctx, st, ownerUser, ownerPassword, auditor); err != nil {
		log.Fatal(err)
	}

	handler := httpapi.New(httpapi.Deps{
		Auth:            auth.New(st, "devfake-session-secret"),
		Store:           st,
		Audit:           auditor,
		InstallNS:       installNS,
		Kube:            kube.ForTestWithDynamic(fake.NewSimpleClientset(seedObjects()...), fakeDynamic()),
		MetricsProvider: fakeMetrics{},
		LogStreamer:     fakeLogs{},
		Helm:            newFakeHelm(),
		WebDist:         webDist,
	})

	log.Printf("KubePilot (fake cluster) on http://%s — sign in as %s / %s", addr, ownerUser, ownerPassword)
	log.Printf("Not available here: shell (exec). Data resets on restart.")
	log.Fatal(http.ListenAndServe(addr, handler))
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// fakeMetrics reports fixed usage so charts and bars render.
type fakeMetrics struct{}

func (fakeMetrics) Query(context.Context, streams.MetricsQuery) (streams.MetricsResult, error) {
	return streams.MetricsResult{
		Available: true,
		Source:    "devfake",
		CPU:       &streams.ResourceMetric{Usage: 0.35, Capacity: 2},
		Memory:    &streams.ResourceMetric{Usage: 900e6, Capacity: 4e9},
		Disk:      &streams.ResourceMetric{Usage: 20e9, Capacity: 100e9},
	}, nil
}

// fakeLogs streams a generated log line every 400ms until the client disconnects.
type fakeLogs struct{}

func (fakeLogs) Stream(ctx context.Context, ns, pod, container string, opts streams.LogOpts) (io.ReadCloser, error) {
	pr, pw := io.Pipe()
	go func() {
		defer pw.Close()
		for i := 1; ; i++ {
			level := "INFO"
			if i%9 == 0 {
				level = "WARN"
			}
			line := fmt.Sprintf("%s %s [%s] %s/%s request #%d served in %dms\n",
				time.Now().Format(time.RFC3339), level, container, ns, pod, i, 5+i%40)
			if _, err := pw.Write([]byte(line)); err != nil {
				return
			}
			if !opts.Follow && i >= 50 {
				return
			}
			select {
			case <-ctx.Done():
				return
			case <-time.After(400 * time.Millisecond):
			}
		}
	}()
	return pr, nil
}

// fakeHelm keeps a few releases in memory.
type fakeHelm struct{ releases []helmctrl.Release }

func newFakeHelm() *fakeHelm {
	ago := func(d time.Duration) string { return time.Now().Add(-d).UTC().Format(time.RFC3339) }
	return &fakeHelm{releases: []helmctrl.Release{
		{Name: "ingress-nginx", Namespace: "default", Revision: 4, Chart: "ingress-nginx-4.11.3", Status: "deployed", AppVersion: "1.11.3", Updated: ago(26 * time.Hour)},
		{Name: "redis", Namespace: "staging", Revision: 2, Chart: "redis-19.6.0", Status: "failed", AppVersion: "7.2.5", Updated: ago(3 * time.Hour)},
	}}
}

func (f *fakeHelm) List(_ context.Context, ns string) ([]helmctrl.Release, error) {
	out := []helmctrl.Release{}
	for _, r := range f.releases {
		if ns == "" || r.Namespace == ns {
			out = append(out, r)
		}
	}
	return out, nil
}

func (f *fakeHelm) Install(context.Context, helmctrl.InstallRequest) (*helmctrl.Release, error) {
	return nil, fmt.Errorf("install is not supported in devfake")
}

func (f *fakeHelm) Upgrade(context.Context, helmctrl.UpgradeRequest) (*helmctrl.Release, error) {
	return nil, fmt.Errorf("upgrade is not supported in devfake")
}

func (f *fakeHelm) Rollback(_ context.Context, req helmctrl.RollbackRequest) (*helmctrl.Release, error) {
	for i := range f.releases {
		r := &f.releases[i]
		if r.Name == req.Name && r.Namespace == req.Namespace {
			r.Revision++
			r.Status = "deployed"
			r.Updated = time.Now().UTC().Format(time.RFC3339)
			return r, nil
		}
	}
	return nil, fmt.Errorf("release %s not found", req.Name)
}

func (f *fakeHelm) Uninstall(_ context.Context, ns, name string) error {
	out := f.releases[:0]
	for _, r := range f.releases {
		if r.Name != name || r.Namespace != ns {
			out = append(out, r)
		}
	}
	f.releases = out
	return nil
}

func ptr[T any](v T) *T { return &v }

func seedObjects() []runtime.Object {
	created := metav1.NewTime(time.Now().Add(-3 * time.Hour))
	ago := func(d time.Duration) metav1.Time { return metav1.NewTime(time.Now().Add(-d)) }
	controller := true
	webLabels := map[string]string{"app": "web"}

	podTemplate := func(image, hash string) corev1.PodTemplateSpec {
		labels := map[string]string{"app": "web"}
		if hash != "" {
			labels["pod-template-hash"] = hash
		}
		return corev1.PodTemplateSpec{
			ObjectMeta: metav1.ObjectMeta{Labels: labels},
			Spec: corev1.PodSpec{Containers: []corev1.Container{
				{Name: "web", Image: image, Env: []corev1.EnvVar{{Name: "LOG_LEVEL", Value: "info"}}},
				{Name: "sidecar", Image: "envoyproxy/envoy:v1.30"},
			}},
		}
	}

	var objs []runtime.Object
	for _, ns := range []string{"default", "dev", "staging", installNS} {
		objs = append(objs, &corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: ns, CreationTimestamp: created}})
	}

	for i, name := range []string{"node-a", "node-b"} {
		node := &corev1.Node{
			ObjectMeta: metav1.ObjectMeta{Name: name, CreationTimestamp: created},
			Status: corev1.NodeStatus{
				Conditions: []corev1.NodeCondition{{Type: corev1.NodeReady, Status: corev1.ConditionTrue}},
				NodeInfo:   corev1.NodeSystemInfo{KubeletVersion: "v1.31.2", OperatingSystem: "linux", Architecture: "arm64", OSImage: "Ubuntu 24.04", ContainerRuntimeVersion: "containerd://1.7.22"},
				Addresses:  []corev1.NodeAddress{{Type: corev1.NodeInternalIP, Address: fmt.Sprintf("10.0.0.%d", 11+i)}},
				Capacity: corev1.ResourceList{
					corev1.ResourceCPU: resourceQty("4"), corev1.ResourceMemory: resourceQty("8Gi"), corev1.ResourcePods: resourceQty("110"),
				},
			},
		}
		if i == 0 {
			node.Labels = map[string]string{"node-role.kubernetes.io/control-plane": ""}
		}
		objs = append(objs, node)
	}

	objs = append(objs, &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{Name: "web", Namespace: "dev", UID: "devfake-web", CreationTimestamp: created,
			Annotations: map[string]string{"deployment.kubernetes.io/revision": "3"}},
		Spec: appsv1.DeploymentSpec{Replicas: ptr(int32(2)), Selector: &metav1.LabelSelector{MatchLabels: webLabels}, Template: podTemplate("nginx:1.27", "")},
		Status: appsv1.DeploymentStatus{Replicas: 2, ReadyReplicas: 1, UpdatedReplicas: 2, AvailableReplicas: 1,
			Conditions: []appsv1.DeploymentCondition{
				{Type: appsv1.DeploymentAvailable, Status: corev1.ConditionTrue},
				{Type: appsv1.DeploymentProgressing, Status: corev1.ConditionTrue},
			}},
	})
	for i, image := range []string{"nginx:1.25", "nginx:1.26", "nginx:1.27"} {
		rev := fmt.Sprint(i + 1)
		objs = append(objs, &appsv1.ReplicaSet{
			ObjectMeta: metav1.ObjectMeta{
				Name: "web-" + rev + "abc", Namespace: "dev", Labels: webLabels, CreationTimestamp: ago(time.Duration(3-i) * time.Hour),
				Annotations:     map[string]string{"deployment.kubernetes.io/revision": rev},
				OwnerReferences: []metav1.OwnerReference{{APIVersion: "apps/v1", Kind: "Deployment", Name: "web", UID: "devfake-web", Controller: &controller}},
			},
			Spec: appsv1.ReplicaSetSpec{Selector: &metav1.LabelSelector{MatchLabels: webLabels}, Template: podTemplate(image, rev+"abc")},
		})
	}

	running := corev1.PodStatus{
		Phase: corev1.PodRunning, PodIP: "10.1.0.10", QOSClass: corev1.PodQOSBurstable,
		Conditions: []corev1.PodCondition{{Type: corev1.PodReady, Status: corev1.ConditionTrue}},
		ContainerStatuses: []corev1.ContainerStatus{
			{Name: "web", Ready: true, RestartCount: 2, State: corev1.ContainerState{Running: &corev1.ContainerStateRunning{}}},
			{Name: "sidecar", Ready: true, State: corev1.ContainerState{Running: &corev1.ContainerStateRunning{}}},
		},
	}
	crashing := corev1.PodStatus{
		Phase: corev1.PodRunning, PodIP: "10.1.0.11", QOSClass: corev1.PodQOSBurstable,
		ContainerStatuses: []corev1.ContainerStatus{
			{Name: "web", RestartCount: 7, State: corev1.ContainerState{Waiting: &corev1.ContainerStateWaiting{Reason: "CrashLoopBackOff"}}},
			{Name: "sidecar", Ready: true, State: corev1.ContainerState{Running: &corev1.ContainerStateRunning{}}},
		},
	}
	for i, status := range []corev1.PodStatus{running, crashing} {
		objs = append(objs, &corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{
				Name: fmt.Sprintf("web-3abc-%c%d", 'x', i+1), Namespace: "dev", CreationTimestamp: created,
				Labels:          map[string]string{"app": "web", "pod-template-hash": "3abc"},
				OwnerReferences: []metav1.OwnerReference{{Kind: "ReplicaSet", Name: "web-3abc", Controller: &controller}},
			},
			Spec:   corev1.PodSpec{NodeName: "node-a", Containers: podTemplate("nginx:1.27", "").Spec.Containers},
			Status: status,
		})
	}

	objs = append(objs,
		&appsv1.StatefulSet{
			ObjectMeta: metav1.ObjectMeta{Name: "db", Namespace: "staging", CreationTimestamp: created},
			Spec:       appsv1.StatefulSetSpec{Replicas: ptr(int32(3)), Selector: &metav1.LabelSelector{MatchLabels: map[string]string{"app": "db"}}},
			Status:     appsv1.StatefulSetStatus{Replicas: 3, ReadyReplicas: 3},
		},
		&appsv1.DaemonSet{
			ObjectMeta: metav1.ObjectMeta{Name: "node-agent", Namespace: "default", CreationTimestamp: created},
			Spec:       appsv1.DaemonSetSpec{Selector: &metav1.LabelSelector{MatchLabels: map[string]string{"app": "node-agent"}}},
			Status:     appsv1.DaemonSetStatus{DesiredNumberScheduled: 2, NumberReady: 2},
		},
		&batchv1.CronJob{
			ObjectMeta: metav1.ObjectMeta{Name: "nightly-report", Namespace: "dev", CreationTimestamp: created},
			Spec: batchv1.CronJobSpec{Schedule: "0 2 * * *", JobTemplate: batchv1.JobTemplateSpec{Spec: batchv1.JobSpec{
				Template: corev1.PodTemplateSpec{Spec: corev1.PodSpec{
					RestartPolicy: corev1.RestartPolicyNever,
					Containers:    []corev1.Container{{Name: "report", Image: "busybox:1.36"}},
				}},
			}}},
		},
		&corev1.Service{
			ObjectMeta: metav1.ObjectMeta{Name: "web", Namespace: "dev", CreationTimestamp: created},
			Spec:       corev1.ServiceSpec{Type: corev1.ServiceTypeClusterIP, ClusterIP: "10.96.0.20", Selector: webLabels},
		},
		&corev1.ConfigMap{
			ObjectMeta: metav1.ObjectMeta{Name: "web-config", Namespace: "dev", CreationTimestamp: created},
			Data:       map[string]string{"LOG_FORMAT": "json"},
		},
		&corev1.Secret{
			ObjectMeta: metav1.ObjectMeta{Name: "web-tls", Namespace: "dev", CreationTimestamp: created},
			Type:       corev1.SecretTypeTLS,
		},
		&corev1.Event{
			ObjectMeta:     metav1.ObjectMeta{Name: "web.1", Namespace: "dev", CreationTimestamp: created},
			InvolvedObject: corev1.ObjectReference{Kind: "Deployment", Name: "web", Namespace: "dev"},
			Reason:         "ScalingReplicaSet", Message: "Scaled up replica set web-3abc to 2", Type: corev1.EventTypeNormal,
			LastTimestamp: ago(20 * time.Minute),
		},
		&corev1.Event{
			ObjectMeta:     metav1.ObjectMeta{Name: "web.2", Namespace: "dev", CreationTimestamp: created},
			InvolvedObject: corev1.ObjectReference{Kind: "Pod", Name: "web-3abc-x2", Namespace: "dev"},
			Reason:         "BackOff", Message: "Back-off restarting failed container web", Type: corev1.EventTypeWarning,
			Count: 14, LastTimestamp: ago(2 * time.Minute),
		},
	)
	objs = append(objs, bulkSecrets(created)...)
	return objs
}

// bulkSecrets mimics a real cluster: many large Helm release secrets plus app secrets.
func bulkSecrets(created metav1.Time) []runtime.Object {
	var out []runtime.Object
	payload := make([]byte, 24*1024)
	namespaces := []string{"default", "dev", "staging", installNS}
	for i := 0; i < 311; i++ {
		ns := namespaces[i%len(namespaces)]
		out = append(out, &corev1.Secret{
			ObjectMeta: metav1.ObjectMeta{Name: fmt.Sprintf("sh.helm.release.v1.app%d.v%d", i/5, i%5+1), Namespace: ns, CreationTimestamp: created,
				Labels: map[string]string{"owner": "helm", "name": fmt.Sprintf("app%d", i/5)}},
			Type: "helm.sh/release.v1",
			Data: map[string][]byte{"release": payload},
		})
	}
	types := []corev1.SecretType{corev1.SecretTypeOpaque, corev1.SecretTypeTLS, corev1.SecretTypeDockerConfigJson}
	for i := 0; i < 108; i++ {
		out = append(out, &corev1.Secret{
			ObjectMeta: metav1.ObjectMeta{Name: fmt.Sprintf("app-secret-%03d", i), Namespace: namespaces[i%len(namespaces)], CreationTimestamp: created},
			Type:       types[i%len(types)],
			Data:       map[string][]byte{"key": []byte("value")},
		})
	}
	return out
}

func resourceQty(s string) resource.Quantity { return resource.MustParse(s) }

// fakeDynamic serves a few CRDs and custom resources for the Custom Resources page.
func fakeDynamic() *dynamicfake.FakeDynamicClient {
	crd := func(group, plural, kind, scope string) *unstructured.Unstructured {
		return &unstructured.Unstructured{Object: map[string]interface{}{
			"apiVersion": "apiextensions.k8s.io/v1",
			"kind":       "CustomResourceDefinition",
			"metadata":   map[string]interface{}{"name": plural + "." + group},
			"spec": map[string]interface{}{
				"group": group,
				"scope": scope,
				"names": map[string]interface{}{"plural": plural, "kind": kind},
				"versions": []interface{}{
					map[string]interface{}{"name": "v1", "served": true, "storage": true},
				},
			},
		}}
	}
	cr := func(group, kind, ns, name string) *unstructured.Unstructured {
		meta := map[string]interface{}{"name": name, "creationTimestamp": time.Now().Add(-90 * time.Minute).UTC().Format(time.RFC3339)}
		if ns != "" {
			meta["namespace"] = ns
		}
		return &unstructured.Unstructured{Object: map[string]interface{}{
			"apiVersion": group + "/v1",
			"kind":       kind,
			"metadata":   meta,
		}}
	}
	listKinds := map[schema.GroupVersionResource]string{
		{Group: "apiextensions.k8s.io", Version: "v1", Resource: "customresourcedefinitions"}: "CustomResourceDefinitionList",
		{Group: "cert-manager.io", Version: "v1", Resource: "certificates"}:                   "CertificateList",
		{Group: "cert-manager.io", Version: "v1", Resource: "clusterissuers"}:                 "ClusterIssuerList",
		{Group: "monitoring.coreos.com", Version: "v1", Resource: "servicemonitors"}:          "ServiceMonitorList",
	}
	return dynamicfake.NewSimpleDynamicClientWithCustomListKinds(runtime.NewScheme(), listKinds,
		crd("cert-manager.io", "certificates", "Certificate", "Namespaced"),
		crd("cert-manager.io", "clusterissuers", "ClusterIssuer", "Cluster"),
		crd("monitoring.coreos.com", "servicemonitors", "ServiceMonitor", "Namespaced"),
		cr("cert-manager.io", "Certificate", "dev", "web-tls"),
		cr("cert-manager.io", "Certificate", "staging", "db-tls"),
		cr("cert-manager.io", "ClusterIssuer", "", "letsencrypt-prod"),
		cr("monitoring.coreos.com", "ServiceMonitor", "dev", "web"),
	)
}
