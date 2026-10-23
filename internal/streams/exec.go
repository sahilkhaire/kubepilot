package streams

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/client-go/kubernetes/scheme"
	"k8s.io/client-go/tools/remotecommand"

	"github.com/sahilkhaire/kubepilot/internal/kube"
)

const (
	wsStreamStdin  = byte(0)
	wsStreamStdout = byte(1)
	wsStreamStderr = byte(2)
	wsStreamResize = byte(4)
)

// ExecUpgrader runs an interactive pod exec session over WebSocket after HTTP upgrade.
type ExecUpgrader interface {
	Handle(w http.ResponseWriter, r *http.Request, ns, pod, container string, onUpgraded func()) error
}

type kubeExecUpgrader struct {
	kube        *kube.Client
	trustProxy  bool
	upgrader    websocket.Upgrader
}

func NewKubeExecUpgrader(c *kube.Client, trustProxy bool) ExecUpgrader {
	return &kubeExecUpgrader{
		kube:       c,
		trustProxy: trustProxy,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return sameOrigin(r, trustProxy) },
		},
	}
}

var errNoKubeConfig = errors.New("kube rest config not available")

func (k *kubeExecUpgrader) Handle(w http.ResponseWriter, r *http.Request, ns, pod, container string, onUpgraded func()) error {
	if k.kube == nil || k.kube.Config == nil {
		return errNoKubeConfig
	}

	conn, err := k.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return err
	}
	defer conn.Close()

	if onUpgraded != nil {
		onUpgraded()
	}

	ctx := r.Context()
	stdinReader, stdinWriter := io.Pipe()
	sizeQueue := make(chan remotecommand.TerminalSize, 8)
	sizeQueue <- remotecommand.TerminalSize{Width: 80, Height: 24}

	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		defer stdinWriter.Close()
		for {
			_, msg, readErr := conn.ReadMessage()
			if readErr != nil {
				return
			}
			if len(msg) == 0 {
				continue
			}
			switch msg[0] {
			case wsStreamStdin:
				if len(msg) > 1 {
					_, _ = stdinWriter.Write(msg[1:])
				}
			case wsStreamResize:
				var size remotecommand.TerminalSize
				if json.Unmarshal(msg[1:], &size) == nil && size.Width > 0 && size.Height > 0 {
					select {
					case sizeQueue <- size:
					default:
					}
				}
			}
		}
	}()

	req := k.kube.Inner.CoreV1().RESTClient().Post().
		Resource("pods").
		Name(pod).
		Namespace(ns).
		SubResource("exec").
		VersionedParams(&corev1.PodExecOptions{
			Container: container,
			Command:   []string{"/bin/sh", "-c", "command -v bash >/dev/null 2>&1 && exec bash || exec sh"},
			Stdin:     true,
			Stdout:    true,
			Stderr:    true,
			TTY:       true,
		}, scheme.ParameterCodec)

	executor, err := remotecommand.NewSPDYExecutor(k.kube.Config, http.MethodPost, req.URL())
	if err != nil {
		waitExecReader(conn, stdinReader, &wg)
		close(sizeQueue)
		return err
	}

	// stdout and stderr share one websocket, which allows only one writer at a time.
	writeMu := &sync.Mutex{}
	streamErr := executor.StreamWithContext(ctx, remotecommand.StreamOptions{
		Stdin:             stdinReader,
		Stdout:            &wsStreamWriter{conn: conn, stream: wsStreamStdout, mu: writeMu},
		Stderr:            &wsStreamWriter{conn: conn, stream: wsStreamStderr, mu: writeMu},
		Tty:               true,
		TerminalSizeQueue: &chanTerminalSizeQueue{ch: sizeQueue},
	})

	waitExecReader(conn, stdinReader, &wg)
	close(sizeQueue)

	if streamErr != nil && !errors.Is(streamErr, context.Canceled) && !errors.Is(streamErr, io.EOF) {
		log.Printf("pod exec stream: ns=%s pod=%s err=%v", ns, pod, streamErr)
		return streamErr
	}
	return nil
}

func waitExecReader(conn *websocket.Conn, stdinReader *io.PipeReader, wg *sync.WaitGroup) {
	_ = stdinReader.Close()
	_ = conn.Close()
	wg.Wait()
}

type wsStreamWriter struct {
	conn   *websocket.Conn
	stream byte
	mu     *sync.Mutex
}

func (w *wsStreamWriter) Write(p []byte) (int, error) {
	if len(p) == 0 {
		return 0, nil
	}
	msg := make([]byte, 1+len(p))
	msg[0] = w.stream
	copy(msg[1:], p)
	w.mu.Lock()
	err := w.conn.WriteMessage(websocket.BinaryMessage, msg)
	w.mu.Unlock()
	if err != nil {
		return 0, err
	}
	return len(p), nil
}

type chanTerminalSizeQueue struct {
	ch chan remotecommand.TerminalSize
}

func (q *chanTerminalSizeQueue) Next() *remotecommand.TerminalSize {
	size, ok := <-q.ch
	if !ok {
		return nil
	}
	return &size
}
