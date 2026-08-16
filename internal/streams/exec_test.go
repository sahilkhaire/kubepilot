package streams

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func TestWaitExecReaderUnblocks(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upgrader := websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Errorf("upgrade: %v", err)
			return
		}

		stdinReader, stdinWriter := io.Pipe()
		var wg sync.WaitGroup
		wg.Add(1)
		go func() {
			defer wg.Done()
			defer stdinWriter.Close()
			for {
				if _, _, readErr := conn.ReadMessage(); readErr != nil {
					return
				}
			}
		}()

		done := make(chan struct{})
		go func() {
			waitExecReader(conn, stdinReader, &wg)
			close(done)
		}()

		select {
		case <-done:
		case <-time.After(2 * time.Second):
			t.Fatal("waitExecReader hung")
		}
	}))
	defer srv.Close()

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http")
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer conn.Close()
}
