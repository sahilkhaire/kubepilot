package kube

import (
	"reflect"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"sigs.k8s.io/yaml"
)

// StripSecret removes secret data fields for API responses without reveal.
func StripSecret(secret *corev1.Secret) *corev1.Secret {
	if secret == nil {
		return nil
	}
	out := secret.DeepCopy()
	out.Data = nil
	out.StringData = nil
	return out
}

// StripSecrets removes data fields from a slice of secrets.
func StripSecrets(secrets []corev1.Secret) []corev1.Secret {
	out := make([]corev1.Secret, len(secrets))
	for i, s := range secrets {
		out[i] = *StripSecret(&s)
	}
	return out
}

// SanitizeSecret strips data/stringData from a single secret object when reveal is false.
func SanitizeSecret(obj any, reveal bool) any {
	if reveal || obj == nil {
		return obj
	}
	switch v := obj.(type) {
	case corev1.Secret:
		return *StripSecret(&v)
	case *corev1.Secret:
		return StripSecret(v)
	case corev1.SecretList:
		v.Items = stripSecretSlice(v.Items)
		return v
	case *corev1.SecretList:
		if v == nil {
			return nil
		}
		out := v.DeepCopy()
		out.Items = stripSecretSlice(out.Items)
		return out
	case map[string]interface{}:
		return stripSecretMap(v)
	case unstructured.Unstructured:
		return *stripUnstructured(&v)
	case *unstructured.Unstructured:
		return stripUnstructured(v)
	default:
		return stripSecretReflect(obj)
	}
}

// SanitizeSecrets strips data/stringData from secret list responses when reveal is false.
func SanitizeSecrets(items any, reveal bool) any {
	if reveal || items == nil {
		return items
	}
	switch v := items.(type) {
	case []corev1.Secret:
		return StripSecrets(v)
	case []*corev1.Secret:
		out := make([]*corev1.Secret, len(v))
		for i, s := range v {
			out[i] = StripSecret(s)
		}
		return out
	case corev1.SecretList:
		v.Items = stripSecretSlice(v.Items)
		return v
	case *corev1.SecretList:
		if v == nil {
			return nil
		}
		out := v.DeepCopy()
		out.Items = stripSecretSlice(out.Items)
		return out
	case map[string]interface{}:
		return stripSecretMapList(v)
	default:
		return stripSecretsReflect(items)
	}
}

func stripSecretSlice(items []corev1.Secret) []corev1.Secret {
	return StripSecrets(items)
}

func stripSecretMap(m map[string]interface{}) map[string]interface{} {
	if m == nil {
		return nil
	}
	out := make(map[string]interface{}, len(m))
	for k, v := range m {
		out[k] = v
	}
	delete(out, "data")
	delete(out, "stringData")
	return out
}

func stripSecretMapList(m map[string]interface{}) map[string]interface{} {
	if m == nil {
		return nil
	}
	out := stripSecretMap(m)
	if items, ok := out["items"].([]interface{}); ok {
		for i, it := range items {
			if im, ok := it.(map[string]interface{}); ok {
				items[i] = stripSecretMap(im)
			}
		}
		out["items"] = items
	}
	return out
}

func stripUnstructured(u *unstructured.Unstructured) *unstructured.Unstructured {
	if u == nil {
		return nil
	}
	out := &unstructured.Unstructured{Object: make(map[string]interface{}, len(u.Object))}
	for k, v := range u.Object {
		if k == "data" || k == "stringData" {
			continue
		}
		out.Object[k] = v
	}
	out.SetGroupVersionKind(u.GroupVersionKind())
	return out
}

func stripSecretReflect(obj any) any {
	rv := reflect.ValueOf(obj)
	if !rv.IsValid() {
		return obj
	}
	if rv.Kind() == reflect.Pointer {
		if rv.IsNil() {
			return obj
		}
		switch rv.Elem().Type() {
		case reflect.TypeOf(corev1.Secret{}):
			return StripSecret(rv.Interface().(*corev1.Secret))
		case reflect.TypeOf(corev1.SecretList{}):
			return SanitizeSecrets(rv.Interface().(*corev1.SecretList), false)
		}
	}
	switch rv.Type() {
	case reflect.TypeOf(corev1.Secret{}):
		s := rv.Interface().(corev1.Secret)
		return *StripSecret(&s)
	case reflect.TypeOf(corev1.SecretList{}):
		return SanitizeSecrets(rv.Interface().(corev1.SecretList), false)
	}
	return obj
}

func stripSecretsReflect(items any) any {
	rv := reflect.ValueOf(items)
	if !rv.IsValid() || rv.Kind() != reflect.Slice {
		return items
	}
	elem := rv.Type().Elem()
	switch elem {
	case reflect.TypeOf(corev1.Secret{}):
		out := make([]corev1.Secret, rv.Len())
		for i := 0; i < rv.Len(); i++ {
			s := rv.Index(i).Interface().(corev1.Secret)
			out[i] = *StripSecret(&s)
		}
		return out
	case reflect.TypeOf(&corev1.Secret{}):
		out := make([]*corev1.Secret, rv.Len())
		for i := 0; i < rv.Len(); i++ {
			s := rv.Index(i).Interface().(*corev1.Secret)
			out[i] = StripSecret(s)
		}
		return out
	}
	return items
}

// StripSecretYAML removes data and stringData from a Secret YAML document.
func StripSecretYAML(doc []byte) ([]byte, error) {
	var obj map[string]interface{}
	if err := yaml.Unmarshal(doc, &obj); err != nil {
		return doc, err
	}
	delete(obj, "data")
	delete(obj, "stringData")
	return yaml.Marshal(obj)
}
