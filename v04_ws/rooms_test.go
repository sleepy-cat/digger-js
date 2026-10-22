package main

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
)

func dial(t *testing.T, ctx context.Context, url, room string) *websocket.Conn {
	t.Helper()
	c, _, err := websocket.Dial(ctx, url, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { c.CloseNow() })
	if err := c.Write(ctx, websocket.MessageText, []byte(`{"type":"join","room":"`+room+`"}`)); err != nil {
		t.Fatal(err)
	}
	return c
}

func read(t *testing.T, ctx context.Context, c *websocket.Conn) Message {
	t.Helper()
	_, data, err := c.Read(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var m Message
	if err := json.Unmarshal(data, &m); err != nil {
		t.Fatal(err)
	}
	return m
}

func TestRooms(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	srv := httptest.NewServer(NewRooms())
	defer srv.Close()
	url := "ws" + strings.TrimPrefix(srv.URL, "http")

	a := dial(t, ctx, url, "one")
	other := dial(t, ctx, url, "two") // in a room of its own: no game
	b := dial(t, ctx, url, "one")

	// Player 0 is told it is, not left to guess
	_, data, err := a.Read(ctx)
	if err != nil || !strings.Contains(string(data), `"player":0`) {
		t.Fatalf("start of player 0: %s, %v", data, err)
	}
	var sa Message
	json.Unmarshal(data, &sa)
	sb := read(t, ctx, b)
	if sa.Type != "start" || sb.Type != "start" || sa.Player != 0 || sb.Player != 1 || sa.Seed != sb.Seed {
		t.Fatalf("start: %+v, %+v", sa, sb)
	}

	// What one sends, the other gets
	msg := `{"type":"input","frame":5,"bits":4}`
	if err := a.Write(ctx, websocket.MessageText, []byte(msg)); err != nil {
		t.Fatal(err)
	}
	if _, data, err := b.Read(ctx); err != nil || string(data) != msg {
		t.Fatalf("relayed %q, %v", data, err)
	}

	// One goes, the other is told
	a.Close(websocket.StatusNormalClosure, "")
	if m := read(t, ctx, b); m.Type != "left" {
		t.Fatalf("got %+v, want left", m)
	}

	// The one in the other room is still waiting for a player
	c := dial(t, ctx, url, "two")
	if m, n := read(t, ctx, other), read(t, ctx, c); m.Player != 0 || n.Player != 1 {
		t.Fatalf("room two: %+v, %+v", m, n)
	}
}
