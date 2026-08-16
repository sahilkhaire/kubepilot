package kube

import (
	"context"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/api/meta"
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/discovery/cached/memory"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/restmapper"
)

// Dashboard clients issue many concurrent GETs (metrics discovery, pod lists).
// client-go defaults (QPS 5 / burst 10) queue those behind "client-side throttling".
const (
	clientQPS   float32 = 50
	clientBurst         = 100
)

type Client struct {
	Inner   kubernetes.Interface
	Config  *rest.Config // for SPDY exec; nil in test clients without exec
	Dynamic dynamic.Interface
	Mapper  meta.RESTMapper
	YAML    YAMLApplier // optional override for tests
	Drainer NodeDrainer // optional override for tests
}

func applyClientRateLimits(cfg *rest.Config) {
	cfg.QPS = clientQPS
	cfg.Burst = clientBurst
}

func InCluster() (*kubernetes.Clientset, error) {
	cfg, err := rest.InClusterConfig()
	if err != nil {
		return nil, err
	}
	applyClientRateLimits(cfg)
	return kubernetes.NewForConfig(cfg)
}

// NewInCluster builds a kube client with typed, dynamic, and REST mapping support.
func NewInCluster() (*Client, error) {
	cfg, err := rest.InClusterConfig()
	if err != nil {
		return nil, err
	}
	applyClientRateLimits(cfg)
	cs, err := kubernetes.NewForConfig(cfg)
	if err != nil {
		return nil, err
	}
	dyn, err := dynamic.NewForConfig(cfg)
	if err != nil {
		return nil, err
	}
	dc, err := discovery.NewDiscoveryClientForConfig(cfg)
	if err != nil {
		return nil, err
	}
	mapper := restmapper.NewDeferredDiscoveryRESTMapper(memory.NewMemCacheClient(dc))
	return &Client{Inner: cs, Config: cfg, Dynamic: dyn, Mapper: mapper}, nil
}

func ForTest(c kubernetes.Interface) *Client {
	return &Client{Inner: c}
}

func ForTestWithDynamic(c kubernetes.Interface, dyn dynamic.Interface) *Client {
	return &Client{Inner: c, Dynamic: dyn}
}

func (c *Client) Pods(ctx context.Context, ns string) ([]corev1.Pod, error) {
	list, err := c.Inner.CoreV1().Pods(ns).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	return list.Items, nil
}
