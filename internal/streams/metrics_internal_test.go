package streams

import (
	"context"
	"strings"
	"testing"
	"time"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"

	"github.com/sahilkhaire/kubepilot/internal/kube"
)

type countingDiscoverer struct {
	calls int
	src   MetricSource
}

func (c *countingDiscoverer) Discover(context.Context) (MetricSource, error) {
	c.calls++
	return c.src, nil
}

func TestAutoMetricsProviderRediscoverAfterRetryWindow(t *testing.T) {
	t.Parallel()

	d := &countingDiscoverer{}
	p := NewAutoMetricsProvider(nil, "", d).(*autoMetricsProvider)
	now := time.Date(2026, 8, 16, 12, 0, 0, 0, time.UTC)
	p.now = func() time.Time { return now }

	q := MetricsQuery{Scope: ScopeCluster}
	if _, err := p.Query(context.Background(), q); err != nil {
		t.Fatal(err)
	}
	now = now.Add(time.Second)
	if _, err := p.Query(context.Background(), q); err != nil {
		t.Fatal(err)
	}
	if d.calls != 1 {
		t.Fatalf("discover calls=%d want 1 during backoff", d.calls)
	}

	now = now.Add(discoveryRetryAfter)
	if _, err := p.Query(context.Background(), q); err != nil {
		t.Fatal(err)
	}
	if d.calls != 2 {
		t.Fatalf("discover calls=%d want 2 after retry window", d.calls)
	}
}

func TestPromQueriesNode(t *testing.T) {
	t.Parallel()

	cpu, mem := promQueries(MetricsQuery{Scope: ScopeNode, Name: "worker-1"})
	if !strings.Contains(cpu, `kubernetes_node="worker-1"`) {
		t.Fatalf("cpu query missing node label: %s", cpu)
	}
	if !strings.Contains(mem, `nodename="worker-1"`) {
		t.Fatalf("mem query missing nodename: %s", mem)
	}
}

func TestPromDiskQueries(t *testing.T) {
	t.Parallel()

	usage, size := promDiskQueries("worker-1")
	if !strings.Contains(usage, `kubernetes_node="worker-1"`) {
		t.Fatalf("usage query missing node label: %s", usage)
	}
	if !strings.Contains(usage, "node_filesystem_avail_bytes") {
		t.Fatalf("usage query missing avail metric: %s", usage)
	}
	if !strings.Contains(size, `node_filesystem_size_bytes{fstype!~"tmpfs|overlay",mountpoint="/",kubernetes_node="worker-1"}`) {
		t.Fatalf("size query: %s", size)
	}
}

func TestAttachNodeCapacity(t *testing.T) {
	t.Parallel()

	node := &corev1.Node{
		ObjectMeta: metav1.ObjectMeta{Name: "worker-1"},
		Status: corev1.NodeStatus{
			Capacity: corev1.ResourceList{
				corev1.ResourceCPU:    resource.MustParse("4"),
				corev1.ResourceMemory: resource.MustParse("8Gi"),
			},
		},
	}
	kc := kube.ForTest(fake.NewSimpleClientset(node))
	res := MetricsResult{
		Available: true,
		CPU:       &ResourceMetric{Usage: 0.5},
		Memory:    &ResourceMetric{Usage: 1e9},
	}
	attachNodeCapacity(context.Background(), kc, "worker-1", &res)
	if res.CPU.Capacity != 4 {
		t.Fatalf("cpu capacity=%v want 4", res.CPU.Capacity)
	}
	if res.Memory.Capacity != float64(8*1024*1024*1024) {
		t.Fatalf("memory capacity=%v want 8Gi", res.Memory.Capacity)
	}
}
