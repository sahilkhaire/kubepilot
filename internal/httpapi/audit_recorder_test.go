package httpapi

import (
	"bufio"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
)

type hijackFlushWriter struct {
	http.ResponseWriter
	hijackCalled bool
	flushCalled  bool
}

func (w *hijackFlushWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	w.hijackCalled = true
	return nil, nil, errors.New("stub hijack")
}

func (w *hijackFlushWriter) Flush() {
	w.flushCalled = true
}

func TestStatusRecorderForwardsHijackAndFlush(t *testing.T) {
	t.Parallel()

	inner := &hijackFlushWriter{ResponseWriter: httptest.NewRecorder()}
	rec := &statusRecorder{ResponseWriter: inner, status: http.StatusOK}

	if _, _, err := rec.Hijack(); err == nil {
		t.Fatal("expected error from stub hijack")
	}
	if !inner.hijackCalled {
		t.Fatal("Hijack not forwarded to inner writer")
	}

	rec.Flush()
	if !inner.flushCalled {
		t.Fatal("Flush not forwarded to inner writer")
	}
}

func TestStatusRecorderHijackUnsupported(t *testing.T) {
	t.Parallel()

	inner := httptest.NewRecorder()
	rec := &statusRecorder{ResponseWriter: inner, status: http.StatusOK}

	if _, _, err := rec.Hijack(); err == nil {
		t.Fatal("expected error when inner writer does not support Hijack")
	}
}

func TestStatusRecorderFlushNoOpWithoutInnerFlusher(t *testing.T) {
	t.Parallel()

	inner := httptest.NewRecorder()
	rec := &statusRecorder{ResponseWriter: inner, status: http.StatusOK}
	rec.Flush()
}
