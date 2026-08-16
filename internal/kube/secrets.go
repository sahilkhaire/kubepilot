package kube

import (
	corev1 "k8s.io/api/core/v1"
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
