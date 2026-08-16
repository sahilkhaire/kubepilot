package helmctrl

import (
	"context"
	"fmt"
	"os"

	"helm.sh/helm/v3/pkg/action"
	"helm.sh/helm/v3/pkg/chart/loader"
	"helm.sh/helm/v3/pkg/cli"
	"helm.sh/helm/v3/pkg/release"
	"k8s.io/apimachinery/pkg/api/meta"
	"k8s.io/cli-runtime/pkg/genericclioptions"
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/discovery/cached/memory"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/restmapper"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/clientcmd/api"
)

type Release struct {
	Name       string `json:"name"`
	Namespace  string `json:"namespace"`
	Revision   int    `json:"revision"`
	Chart      string `json:"chart"`
	Status     string `json:"status"`
	AppVersion string `json:"appVersion,omitempty"`
	Updated    string `json:"updated,omitempty"`
}

type InstallRequest struct {
	Name      string
	Namespace string
	Chart     string
	Version   string
	Values    map[string]any
}

type UpgradeRequest struct {
	Namespace string
	Name      string
	Chart     string
	Version   string
	Values    map[string]any
}

type RollbackRequest struct {
	Namespace string
	Name      string
	Revision  int
}

type Client interface {
	List(ctx context.Context, ns string) ([]Release, error)
	Install(ctx context.Context, req InstallRequest) (*Release, error)
	Upgrade(ctx context.Context, req UpgradeRequest) (*Release, error)
	Rollback(ctx context.Context, req RollbackRequest) (*Release, error)
	Uninstall(ctx context.Context, ns, name string) error
}

type SDKClient struct {
	restConfig *rest.Config
}

func NewSDKClient(cfg *rest.Config) *SDKClient {
	return &SDKClient{restConfig: cfg}
}

type restConfigGetter struct {
	cfg *rest.Config
}

func (g *restConfigGetter) ToRESTConfig() (*rest.Config, error) {
	return g.cfg, nil
}

func (g *restConfigGetter) ToDiscoveryClient() (discovery.CachedDiscoveryInterface, error) {
	dc, err := discovery.NewDiscoveryClientForConfig(g.cfg)
	if err != nil {
		return nil, err
	}
	return memory.NewMemCacheClient(dc), nil
}

func (g *restConfigGetter) ToRESTMapper() (meta.RESTMapper, error) {
	dc, err := g.ToDiscoveryClient()
	if err != nil {
		return nil, err
	}
	return restmapper.NewDeferredDiscoveryRESTMapper(dc), nil
}

func (g *restConfigGetter) ToRawKubeConfigLoader() clientcmd.ClientConfig {
	return clientcmd.NewDefaultClientConfig(api.Config{}, &clientcmd.ConfigOverrides{})
}

func (c *SDKClient) actionConfig(ns string) (*action.Configuration, error) {
	if c.restConfig == nil {
		return nil, fmt.Errorf("kubernetes config not available")
	}
	var getter genericclioptions.RESTClientGetter = &restConfigGetter{cfg: c.restConfig}
	settings := cli.New()
	actionConfig := new(action.Configuration)
	driver := os.Getenv("HELM_DRIVER")
	if driver == "" {
		driver = "secret"
	}
	if err := actionConfig.Init(getter, ns, driver, func(format string, v ...interface{}) {}); err != nil {
		return nil, err
	}
	_ = settings
	return actionConfig, nil
}

func (c *SDKClient) List(ctx context.Context, ns string) ([]Release, error) {
	actionConfig, err := c.actionConfig(ns)
	if err != nil {
		return nil, err
	}
	list := action.NewList(actionConfig)
	list.AllNamespaces = ns == ""
	rels, err := list.Run()
	if err != nil {
		return nil, err
	}
	out := make([]Release, 0, len(rels))
	for _, rel := range rels {
		out = append(out, releaseToDTO(rel))
	}
	return out, nil
}

func (c *SDKClient) Install(ctx context.Context, req InstallRequest) (*Release, error) {
	actionConfig, err := c.actionConfig(req.Namespace)
	if err != nil {
		return nil, err
	}
	install := action.NewInstall(actionConfig)
	install.Namespace = req.Namespace
	install.ReleaseName = req.Name
	install.Version = req.Version
	chartPath, err := install.ChartPathOptions.LocateChart(req.Chart, cli.New())
	if err != nil {
		return nil, err
	}
	chart, err := loader.Load(chartPath)
	if err != nil {
		return nil, err
	}
	rel, err := install.RunWithContext(ctx, chart, req.Values)
	if err != nil {
		return nil, err
	}
	dto := releaseToDTO(rel)
	return &dto, nil
}

func (c *SDKClient) Upgrade(ctx context.Context, req UpgradeRequest) (*Release, error) {
	actionConfig, err := c.actionConfig(req.Namespace)
	if err != nil {
		return nil, err
	}
	upgrade := action.NewUpgrade(actionConfig)
	upgrade.Namespace = req.Namespace
	upgrade.Version = req.Version
	chartPath, err := upgrade.ChartPathOptions.LocateChart(req.Chart, cli.New())
	if err != nil {
		return nil, err
	}
	chart, err := loader.Load(chartPath)
	if err != nil {
		return nil, err
	}
	rel, err := upgrade.RunWithContext(ctx, req.Name, chart, req.Values)
	if err != nil {
		return nil, err
	}
	dto := releaseToDTO(rel)
	return &dto, nil
}

func (c *SDKClient) Rollback(ctx context.Context, req RollbackRequest) (*Release, error) {
	actionConfig, err := c.actionConfig(req.Namespace)
	if err != nil {
		return nil, err
	}
	rollback := action.NewRollback(actionConfig)
	if req.Revision > 0 {
		rollback.Version = req.Revision
	}
	if err := rollback.Run(req.Name); err != nil {
		return nil, err
	}
	get := action.NewGet(actionConfig)
	rel, err := get.Run(req.Name)
	if err != nil {
		return nil, err
	}
	dto := releaseToDTO(rel)
	return &dto, nil
}

func (c *SDKClient) Uninstall(ctx context.Context, ns, name string) error {
	actionConfig, err := c.actionConfig(ns)
	if err != nil {
		return err
	}
	uninstall := action.NewUninstall(actionConfig)
	_, err = uninstall.Run(name)
	return err
}

func releaseToDTO(rel *release.Release) Release {
	chartName := ""
	appVersion := ""
	if rel.Chart != nil && rel.Chart.Metadata != nil {
		chartName = rel.Chart.Metadata.Name
		appVersion = rel.Chart.Metadata.AppVersion
	}
	updated := ""
	if !rel.Info.LastDeployed.IsZero() {
		updated = rel.Info.LastDeployed.UTC().Format("2006-01-02T15:04:05Z")
	}
	return Release{
		Name:       rel.Name,
		Namespace:  rel.Namespace,
		Revision:   rel.Version,
		Chart:      chartName,
		Status:     rel.Info.Status.String(),
		AppVersion: appVersion,
		Updated:    updated,
	}
}
