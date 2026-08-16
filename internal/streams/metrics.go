package streams

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/discovery"
	metricsclient "k8s.io/metrics/pkg/client/clientset/versioned"

	"github.com/sahilkhaire/kubepilot/internal/kube"
)

const (
	ScopeCluster = "cluster"
	ScopeNode    = "node"
	ScopePod     = "pod"
)

var (
	prometheusServiceNames = []string{
		"prometheus",
		"prometheus-operated",
		"kube-prometheus-stack-prometheus",
	}
	prometheusNamespaces = []string{"monitoring", "observability", "prometheus"}
)

type ResourceMetric struct {
	Usage    float64 `json:"usage"`
	Capacity float64 `json:"capacity,omitempty"`
}

type MetricsResult struct {
	Available bool            `json:"available"`
	Source    string          `json:"source,omitempty"`
	CPU       *ResourceMetric `json:"cpu,omitempty"`
	Memory    *ResourceMetric `json:"memory,omitempty"`
}

type MetricsQuery struct {
	Scope     string
	Namespace string
	Name      string
}

type MetricsProvider interface {
	Query(ctx context.Context, q MetricsQuery) (MetricsResult, error)
}

// MetricSource is a resolved metrics backend (prometheus or metrics-server).
type MetricSource interface {
	Kind() string
	Query(ctx context.Context, q MetricsQuery) (MetricsResult, error)
}

// SourceDiscoverer resolves which metrics backend to use.
type SourceDiscoverer interface {
	Discover(ctx context.Context) (MetricSource, error)
}

type autoMetricsProvider struct {
	kube          *kube.Client
	prometheusURL string
	discoverer    SourceDiscoverer

	mu      sync.Mutex
	source  MetricSource
	discoveryDone bool
}

func NewAutoMetricsProvider(k *kube.Client, prometheusURL string, discoverer SourceDiscoverer) MetricsProvider {
	p := &autoMetricsProvider{kube: k, prometheusURL: prometheusURL}
	if discoverer != nil {
		p.discoverer = discoverer
	} else {
		p.discoverer = NewDefaultDiscoverer(k, prometheusURL)
	}
	return p
}

func (p *autoMetricsProvider) Query(ctx context.Context, q MetricsQuery) (MetricsResult, error) {
	if err := validateQuery(q); err != nil {
		return MetricsResult{}, err
	}
	src, err := p.sourceFor(ctx)
	if err != nil || src == nil {
		return MetricsResult{Available: false}, nil
	}
	res, err := src.Query(ctx, q)
	if err != nil {
		return MetricsResult{Available: false}, nil
	}
	if !res.Available {
		return MetricsResult{Available: false}, nil
	}
	res.Source = src.Kind()
	return res, nil
}

func (p *autoMetricsProvider) sourceFor(ctx context.Context) (MetricSource, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.discoveryDone {
		return p.source, nil
	}
	src, err := p.discoverer.Discover(ctx)
	if err != nil {
		return nil, err
	}
	if src != nil {
		p.source = src
		p.discoveryDone = true
	}
	return src, nil
}

func validateQuery(q MetricsQuery) error {
	switch q.Scope {
	case ScopeCluster:
		return nil
	case ScopeNode:
		if strings.TrimSpace(q.Name) == "" {
			return fmt.Errorf("name required for node scope")
		}
		return nil
	case ScopePod:
		if strings.TrimSpace(q.Namespace) == "" || strings.TrimSpace(q.Name) == "" {
			return fmt.Errorf("namespace and name required for pod scope")
		}
		return nil
	default:
		return fmt.Errorf("invalid scope %q", q.Scope)
	}
}

type defaultDiscoverer struct {
	kube          *kube.Client
	prometheusURL string
}

func NewDefaultDiscoverer(k *kube.Client, prometheusURL string) SourceDiscoverer {
	return &defaultDiscoverer{kube: k, prometheusURL: prometheusURL}
}

func (d *defaultDiscoverer) Discover(ctx context.Context) (MetricSource, error) {
	if u := strings.TrimSpace(d.prometheusURL); u != "" {
		return newPrometheusSource(u, d.kube), nil
	}
	if d.kube != nil {
		if src, ok := d.discoverPrometheusService(ctx); ok {
			return src, nil
		}
		if src, ok := d.discoverMetricsServer(ctx); ok {
			return src, nil
		}
	}
	return nil, nil
}

func (d *defaultDiscoverer) discoverPrometheusService(ctx context.Context) (MetricSource, bool) {
	for _, ns := range prometheusNamespaces {
		for _, name := range prometheusServiceNames {
			svc, err := d.kube.Inner.CoreV1().Services(ns).Get(ctx, name, metav1.GetOptions{})
			if err != nil {
				continue
			}
			if u := servicePrometheusURL(svc); u != "" {
				return newPrometheusSource(u, d.kube), true
			}
		}
	}
	return nil, false
}

func servicePrometheusURL(svc *corev1.Service) string {
	if svc == nil {
		return ""
	}
	port := int32(9090)
	for _, p := range svc.Spec.Ports {
		if p.Port == 9090 || p.Name == "web" || p.Name == "http-web" {
			port = p.Port
			break
		}
	}
	if len(svc.Spec.Ports) > 0 && port == 9090 && svc.Spec.Ports[0].Port != 9090 {
		port = svc.Spec.Ports[0].Port
	}
	scheme := "http"
	for _, p := range svc.Spec.Ports {
		if p.Port == port && p.AppProtocol != nil && strings.EqualFold(*p.AppProtocol, "https") {
			scheme = "https"
			break
		}
	}
	host := fmt.Sprintf("%s.%s.svc.cluster.local:%d", svc.Name, svc.Namespace, port)
	return fmt.Sprintf("%s://%s", scheme, host)
}

func (d *defaultDiscoverer) discoverMetricsServer(ctx context.Context) (MetricSource, bool) {
	if d.kube == nil || d.kube.Config == nil {
		return nil, false
	}
	dc, err := discovery.NewDiscoveryClientForConfig(d.kube.Config)
	if err != nil {
		return nil, false
	}
	_, err = dc.ServerResourcesForGroupVersion("metrics.k8s.io/v1beta1")
	if err != nil {
		return nil, false
	}
	mc, err := metricsclient.NewForConfig(d.kube.Config)
	if err != nil {
		return nil, false
	}
	return &metricsServerSource{kube: d.kube, metrics: mc}, true
}

type prometheusSource struct {
	baseURL string
	client  *http.Client
	kube    *kube.Client
}

func newPrometheusSource(baseURL string, k *kube.Client) MetricSource {
	baseURL = strings.TrimRight(baseURL, "/")
	transport := http.DefaultTransport
	if k != nil && k.Config != nil {
		transport = http.DefaultTransport
	}
	return &prometheusSource{
		baseURL: baseURL,
		client:  &http.Client{Timeout: 10 * time.Second, Transport: transport},
		kube:    k,
	}
}

func (p *prometheusSource) Kind() string { return "prometheus" }

func (p *prometheusSource) Query(ctx context.Context, q MetricsQuery) (MetricsResult, error) {
	cpuQuery, memQuery := promQueries(q)
	cpu, err := p.instantScalar(ctx, cpuQuery)
	if err != nil {
		return MetricsResult{Available: false}, err
	}
	mem, err := p.instantScalar(ctx, memQuery)
	if err != nil {
		return MetricsResult{Available: false}, err
	}
	if cpu == nil && mem == nil {
		return MetricsResult{Available: false}, nil
	}
	res := MetricsResult{Available: true}
	if cpu != nil {
		res.CPU = cpu
	}
	if mem != nil {
		res.Memory = mem
	}
	return res, nil
}

func promQueries(q MetricsQuery) (cpu, mem string) {
	switch q.Scope {
	case ScopeCluster:
		cpu = `sum(rate(node_cpu_seconds_total{mode!="idle"}[5m]))`
		mem = `sum(node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes)`
	case ScopeNode:
		name := q.Name
		cpu = fmt.Sprintf(`sum(rate(node_cpu_seconds_total{mode!="idle",kubernetes_node="%s"}[5m])) or sum(rate(node_cpu_seconds_total{mode!="idle",nodename="%s"}[5m]))`, name, name)
		mem = fmt.Sprintf(`sum(node_memory_MemTotal_bytes{kubernetes_node="%s"} - node_memory_MemAvailable_bytes{kubernetes_node="%s"}) or sum(node_memory_MemTotal_bytes{nodename="%s"} - node_memory_MemAvailable_bytes{nodename="%s"})`, name, name, name, name)
	case ScopePod:
		cpu = fmt.Sprintf(`sum(rate(container_cpu_usage_seconds_total{namespace="%s",pod="%s",container!=""}[5m]))`, q.Namespace, q.Name)
		mem = fmt.Sprintf(`sum(container_memory_working_set_bytes{namespace="%s",pod="%s",container!=""})`, q.Namespace, q.Name)
	}
	return cpu, mem
}

func (p *prometheusSource) instantScalar(ctx context.Context, query string) (*ResourceMetric, error) {
	if strings.TrimSpace(query) == "" {
		return nil, nil
	}
	u := p.baseURL + "/api/v1/query?" + url.Values{"query": {query}}.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	resp, err := p.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		io.Copy(io.Discard, resp.Body)
		return nil, fmt.Errorf("prometheus status %d", resp.StatusCode)
	}
	var body promQueryResponse
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return nil, err
	}
	if body.Status != "success" || len(body.Data.Result) == 0 {
		return nil, nil
	}
	val := body.Data.Result[0].Value
	if len(val) < 2 {
		return nil, nil
	}
	s, ok := val[1].(string)
	if !ok {
		return nil, nil
	}
	n, err := strconv.ParseFloat(s, 64)
	if err != nil || n < 0 {
		return nil, nil
	}
	unit := "cores"
	if strings.Contains(query, "memory") || strings.Contains(query, "bytes") {
		unit = "bytes"
	}
	_ = unit
	return &ResourceMetric{Usage: n}, nil
}

type promQueryResponse struct {
	Status string `json:"status"`
	Data   struct {
		Result []struct {
			Value []any `json:"value"`
		} `json:"result"`
	} `json:"data"`
}

type metricsServerSource struct {
	kube    *kube.Client
	metrics metricsclient.Interface
}

func (m *metricsServerSource) Kind() string { return "metrics-server" }

func (m *metricsServerSource) Query(ctx context.Context, q MetricsQuery) (MetricsResult, error) {
	switch q.Scope {
	case ScopeCluster:
		return m.clusterMetrics(ctx)
	case ScopeNode:
		return m.nodeMetrics(ctx, q.Name)
	case ScopePod:
		return m.podMetrics(ctx, q.Namespace, q.Name)
	default:
		return MetricsResult{Available: false}, fmt.Errorf("unsupported scope")
	}
}

func (m *metricsServerSource) clusterMetrics(ctx context.Context) (MetricsResult, error) {
	list, err := m.metrics.MetricsV1beta1().NodeMetricses().List(ctx, metav1.ListOptions{})
	if err != nil {
		return MetricsResult{Available: false}, err
	}
	if len(list.Items) == 0 {
		return MetricsResult{Available: false}, nil
	}
	var cpuUsage, memUsage float64
	var cpuCap, memCap float64
	for _, nm := range list.Items {
		cpuUsage += quantityCores(nm.Usage[corev1.ResourceCPU])
		memUsage += quantityBytes(nm.Usage[corev1.ResourceMemory])
		node, err := m.kube.Inner.CoreV1().Nodes().Get(ctx, nm.Name, metav1.GetOptions{})
		if err != nil {
			continue
		}
		cpuCap += quantityCores(node.Status.Capacity[corev1.ResourceCPU])
		memCap += quantityBytes(node.Status.Capacity[corev1.ResourceMemory])
	}
	return MetricsResult{
		Available: true,
		CPU:       &ResourceMetric{Usage: cpuUsage, Capacity: cpuCap},
		Memory:    &ResourceMetric{Usage: memUsage, Capacity: memCap},
	}, nil
}

func (m *metricsServerSource) nodeMetrics(ctx context.Context, name string) (MetricsResult, error) {
	nm, err := m.metrics.MetricsV1beta1().NodeMetricses().Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return MetricsResult{Available: false}, err
	}
	node, err := m.kube.Inner.CoreV1().Nodes().Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return MetricsResult{Available: false}, err
	}
	return MetricsResult{
		Available: true,
		CPU: &ResourceMetric{
			Usage:    quantityCores(nm.Usage[corev1.ResourceCPU]),
			Capacity: quantityCores(node.Status.Capacity[corev1.ResourceCPU]),
		},
		Memory: &ResourceMetric{
			Usage:    quantityBytes(nm.Usage[corev1.ResourceMemory]),
			Capacity: quantityBytes(node.Status.Capacity[corev1.ResourceMemory]),
		},
	}, nil
}

func (m *metricsServerSource) podMetrics(ctx context.Context, ns, name string) (MetricsResult, error) {
	pm, err := m.metrics.MetricsV1beta1().PodMetricses(ns).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return MetricsResult{Available: false}, err
	}
	var cpuUsage, memUsage float64
	for _, c := range pm.Containers {
		cpuUsage += quantityCores(c.Usage[corev1.ResourceCPU])
		memUsage += quantityBytes(c.Usage[corev1.ResourceMemory])
	}
	pod, err := m.kube.Inner.CoreV1().Pods(ns).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return MetricsResult{Available: true, CPU: &ResourceMetric{Usage: cpuUsage}, Memory: &ResourceMetric{Usage: memUsage}}, nil
	}
	cpuCap := sumPodResourceRequests(pod, corev1.ResourceCPU)
	memCap := sumPodResourceRequests(pod, corev1.ResourceMemory)
	return MetricsResult{
		Available: true,
		CPU:       &ResourceMetric{Usage: cpuUsage, Capacity: cpuCap},
		Memory:    &ResourceMetric{Usage: memUsage, Capacity: memCap},
	}, nil
}

func sumPodResourceRequests(pod *corev1.Pod, res corev1.ResourceName) float64 {
	var total float64
	for _, c := range pod.Spec.Containers {
		if q, ok := c.Resources.Requests[res]; ok {
			if res == corev1.ResourceCPU {
				total += quantityCores(q)
			} else {
				total += quantityBytes(q)
			}
		}
	}
	return total
}

func quantityCores(q resource.Quantity) float64 {
	if q.IsZero() {
		return 0
	}
	return float64(q.MilliValue()) / 1000
}

func quantityBytes(q resource.Quantity) float64 {
	if q.IsZero() {
		return 0
	}
	return float64(q.Value())
}

// StubMetricsProvider returns a fixed result (for HTTP handler tests).
type StubMetricsProvider struct {
	Result MetricsResult
	Err    error
}

func (s StubMetricsProvider) Query(_ context.Context, _ MetricsQuery) (MetricsResult, error) {
	if s.Err != nil {
		return MetricsResult{}, s.Err
	}
	return s.Result, nil
}
