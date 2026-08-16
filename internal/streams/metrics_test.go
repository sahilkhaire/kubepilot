package streams_test

import (
	"context"
	"testing"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/util/intstr"
	"k8s.io/client-go/kubernetes/fake"

	"github.com/sahilkhaire/kubepilot/internal/kube"
	"github.com/sahilkhaire/kubepilot/internal/streams"
)

func TestDiscoverPrometheusFromService(t *testing.T) {
	t.Parallel()

	svc := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{Name: "prometheus-operated", Namespace: "monitoring"},
		Spec: corev1.ServiceSpec{
			Ports: []corev1.ServicePort{{Port: 9090, TargetPort: intstr.FromInt32(9090)}},
		},
	}
	kc := kube.ForTest(fake.NewSimpleClientset(svc))
	d := streams.NewDefaultDiscoverer(kc, "")

	src, err := d.Discover(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if src == nil {
		t.Fatal("expected prometheus source")
	}
	if got := src.Kind(); got != "prometheus" {
		t.Fatalf("kind=%q want prometheus", got)
	}
}

func TestDiscoverNoSource(t *testing.T) {
	t.Parallel()

	kc := kube.ForTest(fake.NewSimpleClientset())
	d := streams.NewDefaultDiscoverer(kc, "")

	src, err := d.Discover(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if src != nil {
		t.Fatalf("expected nil source, got %v", src)
	}
}

func TestDiscoverPrometheusURLOverride(t *testing.T) {
	t.Parallel()

	kc := kube.ForTest(fake.NewSimpleClientset())
	d := streams.NewDefaultDiscoverer(kc, "http://prom.example:9090")

	src, err := d.Discover(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if src == nil {
		t.Fatal("expected prometheus source from URL override")
	}
	if got := src.Kind(); got != "prometheus" {
		t.Fatalf("kind=%q want prometheus", got)
	}
}

type stubDiscoverer struct {
	src streams.MetricSource
}

func (s *stubDiscoverer) Discover(context.Context) (streams.MetricSource, error) {
	return s.src, nil
}

func TestAutoMetricsProviderNoSource(t *testing.T) {
	t.Parallel()

	kc := kube.ForTest(fake.NewSimpleClientset())
	p := streams.NewAutoMetricsProvider(kc, "", &stubDiscoverer{src: nil})

	res, err := p.Query(context.Background(), streams.MetricsQuery{Scope: streams.ScopeCluster})
	if err != nil {
		t.Fatal(err)
	}
	if res.Available {
		t.Fatalf("result=%+v want available=false", res)
	}
}

type countingDiscoverer struct {
	calls int
	src   streams.MetricSource
}

func (c *countingDiscoverer) Discover(context.Context) (streams.MetricSource, error) {
	c.calls++
	return c.src, nil
}

func TestAutoMetricsProviderRetriesDiscoveryAfterNoSource(t *testing.T) {
	t.Parallel()

	d := &countingDiscoverer{src: nil}
	p := streams.NewAutoMetricsProvider(nil, "", d)

	for i := 0; i < 2; i++ {
		res, err := p.Query(context.Background(), streams.MetricsQuery{Scope: streams.ScopeCluster})
		if err != nil {
			t.Fatal(err)
		}
		if res.Available {
			t.Fatalf("result=%+v want available=false", res)
		}
	}
	if d.calls != 2 {
		t.Fatalf("discover calls=%d want 2 (retry after no source)", d.calls)
	}
}

func TestValidateQueryInvalidScope(t *testing.T) {
	t.Parallel()

	p := streams.NewAutoMetricsProvider(nil, "", &stubDiscoverer{})
	_, err := p.Query(context.Background(), streams.MetricsQuery{Scope: "invalid"})
	if err == nil {
		t.Fatal("expected error for invalid scope")
	}
}
