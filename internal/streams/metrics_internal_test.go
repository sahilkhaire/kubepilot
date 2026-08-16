package streams

import (
	"context"
	"testing"
	"time"
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
