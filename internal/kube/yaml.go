package kube

import (
	"bytes"
	"context"
	"fmt"

	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	apiyaml "k8s.io/apimachinery/pkg/util/yaml"
	"sigs.k8s.io/yaml"
)

const YAMLFieldManager = "cluster-console"

// YAMLApplier fetches and applies YAML documents. Injected in tests when SSA is unavailable.
type YAMLApplier interface {
	GetResourceYAML(ctx context.Context, module, ns, name string) ([]byte, error)
	ApplyYAML(ctx context.Context, doc []byte, namespaceOverride string) error
}

// GetResourceYAML returns the object as a YAML document.
func (c *Client) GetResourceYAML(ctx context.Context, module, ns, name string) ([]byte, error) {
	if c.YAML != nil {
		return c.YAML.GetResourceYAML(ctx, module, ns, name)
	}
	obj, err := c.GetResource(ctx, module, ns, name)
	if err != nil {
		return nil, err
	}
	if acc, err := meta.Accessor(obj); err == nil {
		acc.SetManagedFields(nil)
	}
	u, err := runtime.DefaultUnstructuredConverter.ToUnstructured(obj)
	if err != nil {
		return nil, err
	}
	unst := &unstructured.Unstructured{Object: u}
	gvkStr, err := GVKForModule(module)
	if err != nil {
		return nil, err
	}
	apiVersion, kind, ok := ParseGVK(gvkStr)
	if !ok {
		return nil, fmt.Errorf("invalid gvk for module %q", module)
	}
	unst.SetAPIVersion(apiVersion)
	unst.SetKind(kind)
	out, err := yaml.Marshal(unst.Object)
	if err != nil {
		return nil, err
	}
	return out, nil
}

// ApplyYAML parses a YAML document and applies it with server-side apply.
func (c *Client) ApplyYAML(ctx context.Context, doc []byte, namespaceOverride string) error {
	if c.YAML != nil {
		return c.YAML.ApplyYAML(ctx, doc, namespaceOverride)
	}
	if c.Dynamic == nil || c.Mapper == nil {
		return fmt.Errorf("dynamic client not configured")
	}
	obj, err := parseYAMLDocument(doc)
	if err != nil {
		return err
	}
	if namespaceOverride != "" {
		obj.SetNamespace(namespaceOverride)
	}
	gvk := obj.GroupVersionKind()
	if gvk.Empty() {
		return fmt.Errorf("yaml missing apiVersion or kind")
	}
	mapping, err := c.Mapper.RESTMapping(gvk.GroupKind(), gvk.Version)
	if err != nil {
		return err
	}
	dr := c.Dynamic.Resource(mapping.Resource)
	opts := metav1.ApplyOptions{FieldManager: YAMLFieldManager, Force: false}
	if mapping.Scope.Name() == metaRESTScopeNamespace {
		if obj.GetNamespace() == "" {
			return fmt.Errorf("namespace required")
		}
		_, err = dr.Namespace(obj.GetNamespace()).Apply(ctx, obj.GetName(), obj, opts)
	} else {
		_, err = dr.Apply(ctx, obj.GetName(), obj, opts)
	}
	return err
}

const metaRESTScopeNamespace = "namespace"

func parseYAMLDocument(doc []byte) (*unstructured.Unstructured, error) {
	decoder := apiyaml.NewYAMLOrJSONDecoder(bytes.NewReader(doc), len(doc))
	obj := &unstructured.Unstructured{}
	if err := decoder.Decode(obj); err != nil {
		return nil, fmt.Errorf("invalid yaml: %w", err)
	}
	if obj.Object == nil {
		return nil, fmt.Errorf("empty yaml document")
	}
	return obj, nil
}

// ModuleFromYAML maps a YAML document to a workload module via its kind.
func ModuleFromYAML(doc []byte) (string, error) {
	_, kind, err := GVKFromYAML(doc)
	if err != nil {
		return "", err
	}
	module, ok := ModuleForKind(kind)
	if !ok {
		return "", fmt.Errorf("unsupported kind %q", kind)
	}
	return module, nil
}

// GVKFromYAML returns apiVersion and kind from a YAML document.
func GVKFromYAML(doc []byte) (apiVersion, kind string, err error) {
	obj, err := parseYAMLDocument(doc)
	if err != nil {
		return "", "", err
	}
	gvk := obj.GroupVersionKind()
	if gvk.Empty() {
		return "", "", fmt.Errorf("yaml missing apiVersion or kind")
	}
	return gvk.GroupVersion().String(), gvk.Kind, nil
}

// ParseYAMLNamespace returns metadata.namespace from a YAML document.
func ParseYAMLNamespace(doc []byte) (string, error) {
	obj, err := parseYAMLDocument(doc)
	if err != nil {
		return "", err
	}
	return obj.GetNamespace(), nil
}

// YAMLObjectName returns metadata.name from a YAML document.
func YAMLObjectName(doc []byte) string {
	obj, err := parseYAMLDocument(doc)
	if err != nil {
		return ""
	}
	return obj.GetName()
}

// ResolveGVR returns the group-version-resource for a module (used in tests).
func (c *Client) ResolveGVR(module string) (schema.GroupVersionResource, error) {
	gvkStr, err := GVKForModule(module)
	if err != nil {
		return schema.GroupVersionResource{}, err
	}
	apiVersion, kind, ok := ParseGVK(gvkStr)
	if !ok {
		return schema.GroupVersionResource{}, fmt.Errorf("invalid gvk for module %q", module)
	}
	gv, err := schema.ParseGroupVersion(apiVersion)
	if err != nil {
		return schema.GroupVersionResource{}, err
	}
	mapping, err := c.Mapper.RESTMapping(schema.GroupKind{Group: gv.Group, Kind: kind}, gv.Version)
	if err != nil {
		return schema.GroupVersionResource{}, err
	}
	return mapping.Resource, nil
}
