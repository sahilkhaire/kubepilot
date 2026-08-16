package kube

import (
	"context"
	"fmt"

	apiextensionsv1 "k8s.io/apiextensions-apiserver/pkg/apis/apiextensions/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

var crdGVR = schema.GroupVersionResource{
	Group:    "apiextensions.k8s.io",
	Version:  "v1",
	Resource: "customresourcedefinitions",
}

// CRDGVR returns the GVR for CustomResourceDefinition resources.
func CRDGVR() schema.GroupVersionResource {
	return crdGVR
}

func crdNameForGVR(group, resource string) string {
	return resource + "." + group
}

func (c *Client) ListCRDs(ctx context.Context) ([]unstructured.Unstructured, error) {
	if c.Dynamic == nil {
		return nil, fmt.Errorf("dynamic client not configured")
	}
	list, err := c.Dynamic.Resource(crdGVR).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	return list.Items, nil
}

func (c *Client) GetCRD(ctx context.Context, name string) (*unstructured.Unstructured, error) {
	if c.Dynamic == nil {
		return nil, fmt.Errorf("dynamic client not configured")
	}
	obj, err := c.Dynamic.Resource(crdGVR).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}
	return obj, nil
}

func (c *Client) CustomResourceNamespaced(ctx context.Context, group, resource string) (bool, error) {
	crd, err := c.GetCRD(ctx, crdNameForGVR(group, resource))
	if err != nil {
		return false, err
	}
	scope, found, err := unstructured.NestedString(crd.Object, "spec", "scope")
	if err != nil {
		return false, err
	}
	if !found {
		return false, fmt.Errorf("crd %q missing spec.scope", crd.GetName())
	}
	return scope == string(apiextensionsv1.NamespaceScoped), nil
}

func (c *Client) ListCustomResources(ctx context.Context, group, version, resource, namespace string, namespaced bool) ([]unstructured.Unstructured, error) {
	if c.Dynamic == nil {
		return nil, fmt.Errorf("dynamic client not configured")
	}
	gvr := schema.GroupVersionResource{Group: group, Version: version, Resource: resource}
	dr := c.Dynamic.Resource(gvr)
	if namespaced {
		if namespace == "" {
			return nil, fmt.Errorf("namespace required")
		}
		list, err := dr.Namespace(namespace).List(ctx, metav1.ListOptions{})
		if err != nil {
			return nil, err
		}
		return list.Items, nil
	}
	list, err := dr.List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	return list.Items, nil
}

func (c *Client) GetCustomResource(ctx context.Context, group, version, resource, namespace, name string, namespaced bool) (*unstructured.Unstructured, error) {
	if c.Dynamic == nil {
		return nil, fmt.Errorf("dynamic client not configured")
	}
	gvr := schema.GroupVersionResource{Group: group, Version: version, Resource: resource}
	dr := c.Dynamic.Resource(gvr)
	if namespaced {
		if namespace == "" {
			return nil, fmt.Errorf("namespace required")
		}
		return dr.Namespace(namespace).Get(ctx, name, metav1.GetOptions{})
	}
	return dr.Get(ctx, name, metav1.GetOptions{})
}
