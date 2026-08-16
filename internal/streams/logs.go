package streams

import (
	"context"
	"io"

	corev1 "k8s.io/api/core/v1"

	"github.com/sahilkhaire/k8s-apis/internal/kube"
)

type LogOpts struct {
	Follow    bool
	TailLines int64
	Previous  bool
}

type LogStreamer interface {
	Stream(ctx context.Context, ns, pod, container string, opts LogOpts) (io.ReadCloser, error)
}

type kubeLogStreamer struct {
	kube *kube.Client
}

func NewKubeLogStreamer(c *kube.Client) LogStreamer {
	return &kubeLogStreamer{kube: c}
}

func (k *kubeLogStreamer) Stream(ctx context.Context, ns, pod, container string, opts LogOpts) (io.ReadCloser, error) {
	logOpts := &corev1.PodLogOptions{
		Follow:    opts.Follow,
		Previous:  opts.Previous,
		Container: container,
	}
	if opts.TailLines > 0 {
		logOpts.TailLines = &opts.TailLines
	}
	return k.kube.Inner.CoreV1().Pods(ns).GetLogs(pod, logOpts).Stream(ctx)
}
